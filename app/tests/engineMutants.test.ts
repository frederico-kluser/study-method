/**
 * tests/engineMutants.test.ts — os MUTANTES e a TAXA DE FALSO-PASSE do
 * revisor (pacote P-20, onda 2B do plano de execução v1). OFFLINE: revisor
 * FAKE injetado, nenhum LLM, nenhuma trilha real, nenhum IO além da leitura
 * dos dois fontes do pacote no teste de varredura textual.
 *
 * Contratos que mordem aqui (`docs/16-engine-de-trilha.md` §6.6 e §9.2):
 *
 *   1. O gerador produz um mutante DETECTÁVEL para cada classe de defeito:
 *      cada mutante difere do válido EXATAMENTE nos campos da classe, passa
 *      no schema do desafio e carrega a propriedade verificável por parser
 *      (`extractAtoms`) que o torna detectável em princípio. UM DEFEITO por
 *      mutante: o mutante (c) declara no próprio orçamento os átomos do canal
 *      de impressão (`ATOMS_DO_CANAL_DE_IMPRESSAO`) — usar console nele NÃO é
 *      o defeito (a) — e o validador rejeita (fail-closed) um mutante (c)
 *      cuja solução vaze do orçamento.
 *   2. Um revisor fake COMPLACENTE (aprova tudo) é DIAGNOSTICADO — a medição
 *      reporta taxa geral 1,0 contra os mutantes. O CONFRONTO DO MARCADOR:
 *      acertar a categoria mas apontar o TRECHO ERRADO do mutante (ex.: o
 *      teste ímpar que segue o enunciado, no mutante (b)) NÃO conta como
 *      detecção — é falso-passe (MEDIUM-1; direção segura).
 *   3. Taxa no limiar ou acima DESLIGA o laço com mensagem explícita
 *      (`decisaoDeCalibracao` → `{aprovado: false, motivo: 'LIMIAR_FALSO_PASSE'}`);
 *      abaixo do limiar, aprova.
 *   4. O veredito agregado do revisor NÃO é alarme em lugar nenhum do
 *      pacote: a varredura textual dos fontes de `engine/quality/` não
 *      encontra "nota"/"score" — a decisão lê SÓ a taxa contra os mutantes.
 *   5. (bônus) Desligamento automático por categoria: razão de acerto abaixo
 *      do limiar em DUAS gerações consecutivas remove a classe (função pura
 *      com histórico injetado); revisor fake PERFEITO → taxa 0 → aprovado.
 *   6. Fail-closed: revisor indisponível durante a calibração → erro
 *      ESTRUTURADO (`ErroDeCalibracao`), nunca veredito (§9.3); calibração
 *      sem mutantes não é medição.
 *   7. A-P20-2: a calibração roda ANTES de o laço ser ligado
 *      (`calibracaoNecessariaAntesDeLigar` — contrato para o P-22);
 *      apontar como sugestão (estilo) nunca conta como detecção (§6.5).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { ChallengeDraftSchema } from '../electron/main/engine/schemas/artifacts';
import { extractAtoms } from '../electron/main/engine/extract';
import { LanguageRegistryError } from '../electron/main/engine/lang/registry';
import { PREDICADOS_DA_AULA, type RevisaoComSeveridade } from '../electron/main/engine/prompts/reviewer';
import { severidadeDeCategoria } from '../electron/main/engine/review/normalize';
import {
  ATOMS_DO_CANAL_DE_IMPRESSAO,
  CLASSES_DE_DEFEITO,
  desafioValidoExemplo,
  gerarMutantes,
  rodaMutante,
  validarMutante,
  type ClasseDeDefeito,
  type DesafioParaMutacao,
  type Mutante,
} from '../electron/main/engine/quality/mutants';
import {
  CATEGORIAS_QUE_DETECTAM,
  ErroDeCalibracao,
  PARAMETROS_PADRAO_DE_REMOCAO,
  apontamentoDetectaDefeito,
  calibracaoNecessariaAntesDeLigar,
  categoriasParaRemover,
  decisaoDeCalibracao,
  limiarDeFalsoPasse,
  localizarMarcadorNoMutado,
  medirTaxaDeFalsoPasse,
  revisaoDetectaDefeito,
  type DepsDeCalibracao,
  type GeracaoDeMedicao,
  type MedicaoDeFalsoPasse,
  type MedicaoPorClasse,
} from '../electron/main/engine/quality/judgeCalibration';

// ---------------------------------------------------------------------------
// Helpers — o REVISOR FAKE (offline) e revisões de teste
// ---------------------------------------------------------------------------

type ApontamentoComSeveridade = RevisaoComSeveridade['apontamentos'][number];
type Categoria = ApontamentoComSeveridade['categoria'];

/** Overrides opcionais do ALVO e da evidência de um apontamento de teste. */
interface OpcoesDeApontamento {
  span?: [number, number];
  token?: string;
  prova?: string;
}

/**
 * Um apontamento de teste já com severidade anexada pela tabela fixa. O alvo
 * PADRÃO ([0, 10], token `return`, prova genérica) NÃO menciona nenhum
 * marcador — útil para os casos negativos; um apontamento que queira
 * DETECTAR um mutante deve apontar o marcador (ver `apontamentoParaMarcador`).
 */
function apontamentoDe(categoria: Categoria, opcoes?: OpcoesDeApontamento): ApontamentoComSeveridade {
  return {
    id: 'APT-CALIBRACAO',
    rodada: 1,
    artefato: 'desafio',
    alvo: {
      caminho: 'desafio',
      linha: 1,
      span: opcoes?.span ?? [0, 10],
      no_ast: 'ReturnStatement',
      token: opcoes?.token ?? 'return',
    },
    evidencia: {
      tipo: 'orcamento',
      prova: opcoes?.prova ?? 'trecho citado pelo revisor de teste',
      introduzido_em: null,
      reproduzivel_por: 'comando de teste',
    },
    defeito: 'defeito injetado no mutante',
    regra_violada: 'C1',
    categoria,
    acao_sugerida: 'corrigir o desafio',
    confianca: 0.95,
    severity: severidadeDeCategoria(categoria),
  };
}

/**
 * Apontamento que aponta PARA o marcador: token e prova citam o marcador
 * (menção — o caminho de confronto independente de coordenadas; o span pode
 * ser passado para exercitar o caminho de interseção).
 */
function apontamentoParaMarcador(categoria: Categoria, marcador: string, span?: [number, number]): ApontamentoComSeveridade {
  return apontamentoDe(categoria, {
    span,
    token: marcador,
    prova: `trecho com o marcador \`${marcador}\` citado pelo revisor`,
  });
}

/** Marcador de cada classe + uma categoria DETECTORA (a régua do fake PERFEITO). */
const MARCADOR_E_CATEGORIA_DETECTORA: readonly { classe: ClasseDeDefeito; marcador: string; categoria: Categoria }[] = [
  { classe: 'fora_do_orcamento', marcador: 'Number.isFinite(v)', categoria: 'construcao_nao_ensinada' },
  { classe: 'teste_divergente_do_enunciado', marcador: 'ehPar(4), false', categoria: 'teste_invalido' },
  { classe: 'imprime_em_vez_de_retornar', marcador: 'console.log', categoria: 'gabarito_nao_passa' },
  { classe: 'nao_exercita_a_aula', marcador: 'Math.round(n / 2)', categoria: 'cobertura_faltante' },
];

/** Uma revisão completa (os cinco predicados do §7.2, realistas). */
function construirRevisao(apontamentos: ApontamentoComSeveridade[]): RevisaoComSeveridade {
  return {
    artefato: 'm01/a03',
    hash_artefato: 'hash-calibracao',
    rodada: 1,
    apontamentos,
    resumo: 'resumo do revisor de teste',
    predicados: PREDICADOS_DA_AULA.map((p) => ({
      id: p.id as 'E1' | 'E2' | 'E3' | 'E4' | 'E5',
      pergunta: p.pergunta,
      justificativa: 'justificativa de teste',
      veredito: 'sim' as const,
    })),
  };
}

/** Revisor fake que devolve SEMPRE a mesma revisão (ex.: complacente: vazia). */
function revisorQueDevolve(revisao: RevisaoComSeveridade): DepsDeCalibracao['revisor'] {
  return async () => revisao;
}

/** Revisor fake que LANÇA (indisponível) em toda chamada. */
function revisorIndisponivel(motivo: unknown): DepsDeCalibracao['revisor'] {
  return async () => {
    throw motivo;
  };
}

/** Revisor fake COMPLACENTE: aprova tudo, nenhum apontamento. */
function revisorComplacente(): DepsDeCalibracao['revisor'] {
  return revisorQueDevolve(construirRevisao([]));
}

/**
 * Revisor fake PERFEITO: para CADA artefato, levanta — com a categoria
 * DETECTORA da classe — cada marcador que existe naquele artefato (a menção
 * do marcador no trecho citado é o que satisfaz o confronto do MEDIUM-1).
 * Qualquer mutante de qualquer classe é detectado porque o seu marcador está
 * no próprio artefato mutado. (No artefato válido nenhum marcador existe:
 * a revisão fica vazia — `achadosNoValido` é diagnóstico, nunca decisão.)
 */
function revisorPerfeito(): DepsDeCalibracao['revisor'] {
  return async (artefato) => {
    const apontamentos = MARCADOR_E_CATEGORIA_DETECTORA.flatMap(({ marcador, categoria }) => {
      const onde = localizarMarcadorNoMutado({ marcador }, artefato);
      if (onde === undefined || onde.span === null) return []; // o marcador não existe neste artefato.
      return [apontamentoParaMarcador(categoria, marcador, onde.span as [number, number])];
    });
    return construirRevisao(apontamentos);
  };
}

/** Medição sintética: TODAS as classes com a mesma taxa. */
function medicaoComTaxa(taxaGeral: number): MedicaoDeFalsoPasse {
  const taxas = Object.fromEntries(
    CLASSES_DE_DEFEITO.map((classe) => [classe, taxaGeral]),
  ) as Record<ClasseDeDefeito, number>;
  return { ...medicaoComTaxasPorClasse(taxas), taxaGeral };
}

/**
 * Medição sintética com taxa (fração falsos-passantes/total, 0..1) por
 * classe; a taxa geral é a média das classes. Usada nos testes de decisão e
 * de remoção por categoria (as contagens são sintéticas — a medição REAL vem
 * de `medirTaxaDeFalsoPasse` com o revisor fake).
 */
function medicaoComTaxasPorClasse(taxas: Partial<Record<ClasseDeDefeito, number>>): MedicaoDeFalsoPasse {
  const frenteAMutantes = CLASSES_DE_DEFEITO.length;
  const porClasse: MedicaoPorClasse[] = CLASSES_DE_DEFEITO.map((classe) => {
    const taxaDeFalsoPasse = taxas[classe] ?? 0;
    return {
      classe,
      totalMutantes: 1,
      detectados: 1 - taxaDeFalsoPasse,
      falsosPasses: taxaDeFalsoPasse,
      taxaDeFalsoPasse,
      razaoDeAcerto: 1 - taxaDeFalsoPasse,
    };
  });
  const taxaGeral = porClasse.reduce((soma, c) => soma + c.falsosPasses, 0) / frenteAMutantes;
  return { amostras: frenteAMutantes + 1, frenteAMutantes, taxaGeral, porClasse, achadosNoValido: 0 };
}

// ---------------------------------------------------------------------------
// 1. O GERADOR — um mutante DETECTÁVEL por classe
// ---------------------------------------------------------------------------

describe('engine/quality/mutants — o gerador de mutantes', () => {
  it('gera UM mutante por classe, todos detectáveis em princípio', () => {
    const valido = desafioValidoExemplo();
    const mutantes = gerarMutantes(valido);

    // um mutante por classe, cada um com o rótulo certo.
    assert.equal(mutantes.length, CLASSES_DE_DEFEITO.length);
    for (const classe of CLASSES_DE_DEFEITO) {
      const daClasse = mutantes.filter((m) => m.classe === classe);
      assert.equal(daClasse.length, 1, `exatamente um mutante para a classe ${classe}`);
      assert.ok(daClasse[0].defeito.length > 0, 'o mutante carrega a descrição do defeito exato');
      assert.ok(daClasse[0].marcador.length > 0, 'o mutante carrega o marcador da injeção');
    }

    for (const mutante of mutantes) {
      const mutado = rodaMutante(mutante, valido);

      // difere do válido…
      assert.notEqual(
        JSON.stringify(mutado.desafio),
        JSON.stringify(valido.desafio),
        `o mutante ${mutante.id} não difere do artefato válido`,
      );
      // …e continua sendo um desafio VÁLIDO (schema).
      const parse = ChallengeDraftSchema.safeParse(mutado.desafio);
      assert.equal(parse.success, true, `o mutante ${mutante.id} (${mutante.classe}) quebrou o schema do desafio`);
    }

    // a propriedade da classe, verificada por PARSER sobre cada mutação.
    const mutados = Object.fromEntries(mutantes.map((m) => [m.classe, rodaMutante(m, valido)]));

    const foraDoOrcamento = mutados.fora_do_orcamento;
    const chavesFora = extractAtoms(foraDoOrcamento.desafio.solutionCode);
    assert.ok(chavesFora.ok && chavesFora.keys.includes('api:Number.isFinite'), '(a) deve usar a construção proibida');
    assert.ok(!valido.desafio.requires.includes('api:Number.isFinite'), '(a) a construção proibida não pode estar no orçamento');
    assert.equal(foraDoOrcamento.desafio.testsCode, valido.desafio.testsCode, '(a) só a solução muda');

    const testesB = mutados.teste_divergente_do_enunciado.desafio.testsCode;
    assert.ok(testesB.includes('ehPar(4), false'), '(b) o teste do par diverge do enunciado');
    assert.ok(testesB.includes('ehPar(5), false'), '(b) o teste do ímpar segue o enunciado — um defeito só');

    const impressao = mutados.imprime_em_vez_de_retornar.desafio;
    assert.equal(impressao.outputChannel, 'impressao', '(c) outputChannel vai para impressao');
    assert.ok(impressao.solutionCode.includes('console.log'), '(c) a solução imprime');
    assert.ok(!impressao.solutionCode.includes('return'), '(c) a solução não retorna');
    assert.equal(impressao.starterCode, valido.desafio.starterCode, '(c) só solução e canal mudam');

    const naoExercita = mutados.nao_exercita_a_aula;
    const chavesNaoExercita = extractAtoms(naoExercita.desafio.solutionCode);
    assert.ok(chavesNaoExercita.ok);
    const exercita = chavesNaoExercita.keys.filter((k) => naoExercita.introducesProductive.includes(k));
    assert.deepEqual(exercita, [], '(d) a solução mutada não usa a construção da aula');
    const vazouDoOrcamento = chavesNaoExercita.keys.filter((k) => !naoExercita.desafio.requires.includes(k));
    assert.deepEqual(vazouDoOrcamento, [], '(d) a solução mutada não vaza do orçamento — o defeito é uno');
  });

  it('a régua de detecção conhece as quatro classes (conjuntos detectores não vazios e sem sugestão)', () => {
    for (const classe of CLASSES_DE_DEFEITO) {
      const detecta = CATEGORIAS_QUE_DETECTAM[classe];
      assert.ok(detecta.length > 0, `a classe ${classe} precisa de categorias detectoras`);
      const proibidas = detecta.filter((c) => c === 'estilo' || c === 'tom' || c === 'prosa');
      assert.deepEqual(proibidas, [], `sugestão nunca detecta — ${classe} lista ${detecta.join(', ')}`);
    }
  });

  it('(c) o mutante de impressão é classe (c) PURA — canal declarado no orçamento, um defeito só', () => {
    const valido = desafioValidoExemplo();

    // A fixture NÃO cobre console em nenhuma solução: se cobrisse, a classe
    // mudaria de natureza (imprimir seria construção ensinada). Documentado
    // aqui por verificação: os átomos do canal NÃO estão no requires da base.
    for (const chave of ATOMS_DO_CANAL_DE_IMPRESSAO) {
      assert.ok(
        !valido.desafio.requires.includes(chave),
        `a fixture não pode declarar o canal — ${chave} não pode estar no requires da base`,
      );
    }

    const [mutanteC] = gerarMutantes(valido).filter((m) => m.classe === 'imprime_em_vez_de_retornar');
    const mutado = rodaMutante(mutanteC, valido);

    // canal ≠ retorno: o outputChannel foi para impressao e a solução não retorna.
    assert.equal(mutado.desafio.outputChannel, 'impressao', '(c) o canal declarado é impressao');
    assert.ok(!mutado.desafio.solutionCode.includes('return'), '(c) a solução imprime, não retorna');

    // orçamento do mutante (c) = requires da solução ∪ os átomos do canal.
    const esperado = [...new Set([...valido.desafio.requires, ...ATOMS_DO_CANAL_DE_IMPRESSAO])].sort();
    assert.deepEqual(
      [...mutado.desafio.requires].sort(),
      esperado,
      '(c) requires do mutante = requires da solução ∪ átomos do canal (declarado no gerador)',
    );

    // chaves da solução mutada ⊆ requires do mutante — o defeito é UNO: usar
    // console aqui NÃO é o defeito (a) de orçamento (o canal é ensinado no
    // escopo do mutante); só imprime-em-vez-de-retornar sobra.
    const chaves = extractAtoms(mutado.desafio.solutionCode);
    assert.ok(chaves.ok, 'a solução mutada (c) parseia');
    const vazou = chaves.keys.filter((chave) => !mutado.desafio.requires.includes(chave));
    assert.deepEqual(vazou, [], '(c) a solução mutada não vaza do orçamento do mutante — um defeito só');
  });

  it('(c) um mutante ARTIFICIAL que vaza do orçamento é REJEITADO pelo validador (fail-closed)', () => {
    const valido = desafioValidoExemplo();
    const vazado: Mutante = {
      id: 'M3-VAZADO',
      classe: 'imprime_em_vez_de_retornar',
      defeito: 'artificial de teste: imprime via console.warn — canal NÃO declarado no orçamento',
      marcador: 'console.warn',
      aplicar: (base) => ({
        ...base,
        desafio: {
          ...base.desafio,
          solutionCode: 'export function ehPar(n) {\n  console.warn(n % 2 === 0);\n}\n',
          outputChannel: 'impressao',
          // igual ao (c) legítimo… mas a solução usa `console.warn`, cuja
          // chave (`api:console.warn`) NÃO está no canal declarado.
          requires: [...new Set([...base.desafio.requires, ...ATOMS_DO_CANAL_DE_IMPRESSAO])],
        },
      }),
    };
    const mutado = rodaMutante(vazado, valido);

    assert.throws(
      () => validarMutante(valido, vazado, mutado),
      (erro: unknown) => erro instanceof Error && /or[çc]amento/.test(erro.message),
      'um mutante (c) cuja solução vaze do orçamento é erro do gerador — nunca um mutante de classe dupla (a)+(c)',
    );
  });
});

// ---------------------------------------------------------------------------
// 2. A MEDIÇÃO — revisor fake complacente é diagnosticado
// ---------------------------------------------------------------------------

describe('engine/quality/judgeCalibration — a medição e a decisão', () => {
  it('revisor complacente (aprova tudo) é diagnosticado: taxa geral 1,0', async () => {
    const valido = desafioValidoExemplo();
    const mutantes = gerarMutantes(valido);

    const medicao = await medirTaxaDeFalsoPasse({ revisor: revisorComplacente() }, { valido, mutantes });

    assert.equal(medicao.frenteAMutantes, mutantes.length);
    assert.equal(medicao.amostras, mutantes.length + 1, 'válido + mutantes foram julgados');
    assert.equal(medicao.taxaGeral, 1, 'o complacente passa TODO mutante — a taxa que governa o laço é 1,0');
    for (const porClasse of medicao.porClasse) {
      assert.equal(porClasse.taxaDeFalsoPasse, 1);
      assert.equal(porClasse.razaoDeAcerto, 0);
      assert.equal(porClasse.detectados, 0);
    }

    const decisao = decisaoDeCalibracao(medicao);
    assert.equal(decisao.aprovado, false);
    assert.equal(decisao.motivo, 'LIMIAR_FALSO_PASSE');
  });

  it('apontar como sugestão (estilo) NUNCA conta como detecção — é falso-passe (§6.5)', async () => {
    const valido = desafioValidoExemplo();
    const mutantes = gerarMutantes(valido);

    const medicao = await medirTaxaDeFalsoPasse(
      { revisor: revisorQueDevolve(construirRevisao([apontamentoDe('estilo')])) },
      { valido, mutantes },
    );

    assert.equal(medicao.taxaGeral, 1, 'sugestão não abre rodada — o revisor "notou algo" mas não detectou NENHUM defeito');
  });

  it('categoria FORA do conjunto detector da classe não detecta — a régua por classe é estrita', async () => {
    const valido = desafioValidoExemplo();
    const mutantes = gerarMutantes(valido);

    // revisor que só levanta `teste_invalido` APONTANDO os marcadores de (b) e
    // (c): detecta teste_divergente e imprime (ambos têm teste_invalido no
    // detector E os marcadores existem nos artefatos mutados); erra as outras
    // duas (categoria fora do detector; e a régua de confronto exige o marcador).
    const revisor = async (artefato: DesafioParaMutacao): Promise<RevisaoComSeveridade> => {
      const apontamentos = ['ehPar(4), false', 'console.log'].flatMap((marcador) => {
        const onde = localizarMarcadorNoMutado({ marcador }, artefato);
        if (onde === undefined || onde.span === null) return [];
        return [apontamentoParaMarcador('teste_invalido', marcador, onde.span as [number, number])];
      });
      return construirRevisao(apontamentos);
    };
    const medicao = await medirTaxaDeFalsoPasse({ revisor }, { valido, mutantes });

    assert.equal(medicao.taxaGeral, 0.5);
    const taxaPorClasse = Object.fromEntries(medicao.porClasse.map((m) => [m.classe, m.taxaDeFalsoPasse]));
    assert.equal(taxaPorClasse.teste_divergente_do_enunciado, 0);
    assert.equal(taxaPorClasse.imprime_em_vez_de_retornar, 0);
    assert.equal(taxaPorClasse.fora_do_orcamento, 1);
    assert.equal(taxaPorClasse.nao_exercita_a_aula, 1, 'gabarito_nao_passa não detecta a classe (d) — a execução não é o defeito curricular');
  });

  it('a régua de detecção confronta o marcador (revisaoDetectaDefeito)', () => {
    const valido = desafioValidoExemplo();
    const [foraOrcamento] = gerarMutantes(valido);

    // categoria detectora E trecho citado no marcador → detecta.
    const revisaoCerta = construirRevisao([
      apontamentoDe('construcao_nao_ensinada', {
        token: 'Number.isFinite',
        prova: 'a solução usa `Number.isFinite(v)` na função auxiliar — construção fora do orçamento',
      }),
    ]);
    assert.equal(revisaoDetectaDefeito(revisaoCerta, foraOrcamento), true);

    // categoria detectora mas trecho ERRADO (o retorno, que segue o
    // enunciado) → NÃO detecta: acertar a categoria não basta (MEDIUM-1).
    const revisaoNoTrechoErrado = construirRevisao([
      apontamentoDe('construcao_nao_ensinada', {
        token: 'return',
        prova: 'o trecho `return n % 2 === 0;` está errado',
      }),
    ]);
    assert.equal(revisaoDetectaDefeito(revisaoNoTrechoErrado, foraOrcamento), false);

    // sugestão nunca detecta.
    assert.equal(revisaoDetectaDefeito(construirRevisao([apontamentoDe('estilo')]), foraOrcamento), false);
  });

  it('MEDIUM-1: apontar com categoria certa mas span FORA do marcador NÃO detecta (falso-passe)', () => {
    const valido = desafioValidoExemplo();
    const [foraOrcamento] = gerarMutantes(valido);
    const mutado = rodaMutante(foraOrcamento, valido);
    const marcador = localizarMarcadorNoMutado(foraOrcamento, mutado);
    assert.ok(marcador, 'o mutante (a) carrega marcador localizável');
    assert.ok(marcador!.span, 'o marcador de (a) está no campo de código');

    // categoria DETECTORA, mas o span aponta o início do código e o trecho
    // citado NÃO menciona o marcador — sem interseção, sem menção → NÃO detecta.
    const apontamento = apontamentoDe('construcao_nao_ensinada', {
      span: [0, 3],
      token: 'export',
      prova: 'trecho que não cita o defeito',
    });
    assert.equal(apontamentoDetectaDefeito(apontamento, foraOrcamento, marcador), false);
  });

  it('MEDIUM-1: com span NO marcador (ou menção do marcador no trecho) o apontamento detecta', () => {
    const valido = desafioValidoExemplo();
    const [foraOrcamento] = gerarMutantes(valido);
    const mutado = rodaMutante(foraOrcamento, valido);
    const marcador = localizarMarcadorNoMutado(foraOrcamento, mutado);
    assert.ok(marcador?.span, 'o marcador de (a) está localizado');
    const span = marcador!.span as [number, number];

    // (b1) interseção por span: o alvo do apontamento cai DENTRO do marcador,
    // mesmo sem citar o marcador no trecho.
    const dentro = [span[0] + 2, span[1] - 2] as [number, number];
    const porSpan = apontamentoDe('construcao_nao_ensinada', {
      span: dentro,
      token: 'Number',
      prova: 'trecho genérico',
    });
    assert.equal(apontamentoDetectaDefeito(porSpan, foraOrcamento, marcador), true);

    // (b2) menção do marcador no trecho citado — independente de coordenadas.
    const porMencao = apontamentoDe('construcao_nao_ensinada', {
      span: [0, 3],
      token: 'auxiliar',
      prova: 'a solução usa `Number.isFinite(v)` fora do orçamento',
    });
    assert.equal(apontamentoDetectaDefeito(porMencao, foraOrcamento, marcador), true);
  });

  it('MEDIUM-1: mutantes de classe SEM marcador continuam detectáveis só por categoria', () => {
    const valido = desafioValidoExemplo();
    const semMarcador: Mutante = {
      id: 'M-SEM-MARCADOR',
      classe: 'fora_do_orcamento',
      defeito: 'artificial de teste sem marcador',
      marcador: '   ',
      aplicar: () => valido,
    };
    // categoria detectora, span fora e trecho sem menção — mesmo assim detecta:
    // sem marcador, a régua volta à categoria (o confronto exige marcador presente).
    const apontamento = apontamentoDe('construcao_nao_ensinada', {
      span: [0, 3],
      token: 'export',
      prova: 'trecho que não cita nada',
    });
    assert.equal(apontamentoDetectaDefeito(apontamento, semMarcador), true);
  });

  it('MEDIUM-1: apontar o trecho ERRADO do mutante (b) (teste ímpar que segue o enunciado) é falso-passe na medição', async () => {
    const valido = desafioValidoExemplo();
    const mutantes = gerarMutantes(valido);

    // O revisor acerta a categoria (`teste_invalido`) mas aponta o teste
    // ÍMPAR — o que SEGUE o enunciado — e não o marcador `ehPar(4), false`.
    const revisorDoTrechoErrado: DepsDeCalibracao['revisor'] = async () =>
      construirRevisao([
        apontamentoDe('teste_invalido', {
          token: 'ehPar',
          prova: 'o teste do número ímpar `ehPar(5), false` está errado',
        }),
      ]);
    const medicao = await medirTaxaDeFalsoPasse({ revisor: revisorDoTrechoErrado }, { valido, mutantes });
    const taxaDoTrechoErrado = Object.fromEntries(medicao.porClasse.map((m) => [m.classe, m.taxaDeFalsoPasse]));
    assert.equal(taxaDoTrechoErrado.teste_divergente_do_enunciado, 1, 'apontou o trecho errado → (b) conta falso-passe');

    // Controle positivo: o mesmo revisor apontando o marcador `ehPar(4), false`
    // detecta (b) — a mensuração passa a distinguir quem localiza o defeito.
    const revisorDoTrechoCerto: DepsDeCalibracao['revisor'] = async (artefato) => {
      const onde = localizarMarcadorNoMutado({ marcador: 'ehPar(4), false' }, artefato);
      if (onde === undefined || onde.span === null) return construirRevisao([]);
      return construirRevisao([
        apontamentoParaMarcador('teste_invalido', 'ehPar(4), false', onde.span as [number, number]),
      ]);
    };
    const medicaoCerta = await medirTaxaDeFalsoPasse({ revisor: revisorDoTrechoCerto }, { valido, mutantes });
    const taxaDoTrechoCerto = Object.fromEntries(medicaoCerta.porClasse.map((m) => [m.classe, m.taxaDeFalsoPasse]));
    assert.equal(taxaDoTrechoCerto.teste_divergente_do_enunciado, 0, 'apontou o marcador → (b) detectada');
  });

  it('taxa no limiar (0,45) ou acima DESLIGA o laço com mensagem explícita; abaixo, aprova', () => {
    const limiar = limiarDeFalsoPasse();
    assert.equal(limiar, 0.45, '(1−τ)/2 com τ=0,10');
    assert.equal(limiarDeFalsoPasse(0.2), 0.4, 'parametrizável por τ');

    const acima = decisaoDeCalibracao(medicaoComTaxa(0.9));
    assert.equal(acima.aprovado, false);
    assert.equal(acima.motivo, 'LIMIAR_FALSO_PASSE');
    assert.ok(acima.mensagem.includes(String(limiar)), 'a mensagem cita o limiar aplicado');
    assert.ok(acima.mensagem.includes('PARE'), 'a mensagem ordena parar o laço e consertar o juiz');
    assert.ok(acima.mensagem.length > 60, 'a mensagem é explícita, não um boolean mudo');

    const noLimiar = decisaoDeCalibracao(medicaoComTaxa(limiar));
    assert.equal(noLimiar.aprovado, false, 'cruzou o limiar (≥) → desliga');

    const abaixo = decisaoDeCalibracao(medicaoComTaxa(0.4));
    assert.equal(abaixo.aprovado, true);
    assert.equal(abaixo.motivo, undefined);
  });

  it('revisor fake perfeito → taxa 0 → calibração aprovada e laço liberado', async () => {
    const valido = desafioValidoExemplo();
    const mutantes = gerarMutantes(valido);

    const medicao = await medirTaxaDeFalsoPasse({ revisor: revisorPerfeito() }, { valido, mutantes });

    assert.equal(medicao.taxaGeral, 0);
    assert.ok(medicao.porClasse.every((c) => c.detectados >= c.totalMutantes));
    assert.equal(decisaoDeCalibracao(medicao).aprovado, true);
    assert.equal(calibracaoNecessariaAntesDeLigar([medicao]), false, 'última medição aprovada → laço pode ser ligado');
  });
});

// ---------------------------------------------------------------------------
// 3. FAIL-CLOSED e o contrato do P-22
// ---------------------------------------------------------------------------

describe('engine/quality/judgeCalibration — fail-closed e contrato de ligação', () => {
  it('revisor indisponível → erro ESTRUTURADO, nunca veredito (§9.3)', async () => {
    const valido = desafioValidoExemplo();
    const mutantes = gerarMutantes(valido);

    await assert.rejects(
      medirTaxaDeFalsoPasse({ revisor: revisorIndisponivel(new Error('llm fora do ar')) }, { valido, mutantes }),
      (erro: unknown) =>
        erro instanceof ErroDeCalibracao && erro.tipo === 'REVISOR_INDISPONIVEL' && /não produz veredito/.test(erro.message),
    );
  });

  it('revisor que falha no meio da rodada (num mutante) identifica o estágio do erro', async () => {
    const valido = desafioValidoExemplo();
    const mutantes = gerarMutantes(valido);
    const revisorQueFalhaNoMutante: DepsDeCalibracao['revisor'] = async (artefato) => {
      if (artefato === valido) return construirRevisao([]);
      throw new Error('indisponível ao julgar o mutante');
    };

    await assert.rejects(
      medirTaxaDeFalsoPasse({ revisor: revisorQueFalhaNoMutante }, { valido, mutantes }),
      (erro: unknown) => erro instanceof ErroDeCalibracao && erro.tipo === 'REVISOR_INDISPONIVEL' && /mutante M1/.test(erro.message),
    );
  });

  it('calibração sem mutantes não é medição (SEM_MUTANTES)', async () => {
    const valido = desafioValidoExemplo();
    await assert.rejects(
      medirTaxaDeFalsoPasse({ revisor: revisorComplacente() }, { valido, mutantes: [] }),
      (erro: unknown) => erro instanceof ErroDeCalibracao && erro.tipo === 'SEM_MUTANTES',
    );
  });

  it('A-P20-2: calibração aprovada ANTES de ligar o laço (contrato para o P-22)', () => {
    assert.equal(calibracaoNecessariaAntesDeLigar([]), true, 'nunca se liga um laço nunca calibrado');
    assert.equal(calibracaoNecessariaAntesDeLigar([medicaoComTaxa(0.6)]), true, 'última medição reprovada → exige calibração');
    assert.equal(calibracaoNecessariaAntesDeLigar([medicaoComTaxa(0.6), medicaoComTaxa(0.2)]), false, 'última medição aprovada → libera');
    assert.equal(calibracaoNecessariaAntesDeLigar([medicaoComTaxa(0.2), medicaoComTaxa(0.5)]), true, 'a mais recente comanda');
  });
});

// ---------------------------------------------------------------------------
// 4. Desligamento automático por categoria (DUAS gerações)
// ---------------------------------------------------------------------------

describe('engine/quality/judgeCalibration — desligamento automático por categoria', () => {
  it('classe com razão de acerto abaixo do limiar por DUAS gerações consecutivas é removida', () => {
    const historico: GeracaoDeMedicao[] = [
      { geracao: 1, medicao: medicaoComTaxasPorClasse({ fora_do_orcamento: 0.7 }) }, // acerto 0,3 < 0,55
      { geracao: 2, medicao: medicaoComTaxasPorClasse({ fora_do_orcamento: 0.6 }) }, // acerto 0,4 < 0,55
    ];

    const removidas = categoriasParaRemover(historico);
    assert.deepEqual(
      removidas.map((r) => r.classe),
      ['fora_do_orcamento'],
    );
    assert.equal(removidas[0].geracoesConsecutivasAbaixo, 2);
    assert.equal(removidas[0].ultimaRazaoDeAcerto, 0.4);
  });

  it('uma geração ACIMA do limiar zera o contador; o limiar de acerto é o espelho do do laço', () => {
    const duasAbaixo: GeracaoDeMedicao[] = [
      { geracao: 1, medicao: medicaoComTaxasPorClasse({ fora_do_orcamento: 0.7 }) },
      { geracao: 2, medicao: medicaoComTaxasPorClasse({ fora_do_orcamento: 0.6 }) },
    ];
    const comRecuperacao: GeracaoDeMedicao[] = [
      ...duasAbaixo,
      { geracao: 3, medicao: medicaoComTaxasPorClasse({ fora_do_orcamento: 0.1 }) }, // acerto 0,9 ≥ 0,55
    ];
    assert.deepEqual(categoriasParaRemover(comRecuperacao), [], 'recuperação zera a contagem consecutiva');

    const parametros = PARAMETROS_PADRAO_DE_REMOCAO;
    assert.equal(parametros.limiarDeAcerto, 0.55, '0,55 = 1 − 0,45 — o espelho do limiar do §6.6');
    assert.equal(parametros.geracoesConsecutivas, 2, 'a regra da tarefa: DUAS gerações');

    // pedir TRÊS gerações consecutivas com só duas abaixo → nada é removido.
    assert.deepEqual(
      categoriasParaRemover(duasAbaixo, { limiarDeAcerto: 0.55, geracoesConsecutivas: 3 }),
      [],
    );
  });
});

// ---------------------------------------------------------------------------
// 5. O veredito agregado NUNCA é alarme — varredura textual do pacote
// ---------------------------------------------------------------------------

describe('engine/quality — o pacote não decide por veredito agregado', () => {
  it('os fontes de engine/quality/ não contêm "nota" nem "score" — a decisão usa SÓ a taxa contra mutantes', () => {
    const fontes = [
      new URL('../electron/main/engine/quality/mutants.ts', import.meta.url),
      new URL('../electron/main/engine/quality/judgeCalibration.ts', import.meta.url),
    ];
    for (const fonte of fontes) {
      const conteudo = readFileSync(fonte, 'utf8');
      assert.ok(
        !/(nota|score)/i.test(conteudo),
        `"nota"/"score" aparecem em ${fonte.pathname} — o pacote não pode decidir por veredito agregado (§6.6)`,
      );
    }
  });
});

// A GUARDA JAVASCRIPT-ONLY (onda 5): a fixture e as quatro mutações são texto
// de JavaScript literal, e o defeito injetado é PROVADO por `extractAtoms`.
// Num desafio de outra linguagem a falha apareceria no lugar errado ("código
// com sintaxe inválida"), acusando o CONTEÚDO por um defeito de FERRAMENTA.
describe('mutants — guarda de linguagem (fail-closed)', () => {
  it('gerarMutantes reprova a linguagem ANTES do schema do desafio', () => {
    const base = desafioValidoExemplo();
    assert.ok(gerarMutantes(base).length > 0, 'o caminho de JavaScript continua intacto');
    const outraLinguagem = {
      ...base,
      desafio: { ...base.desafio, language: 'ruby' as never },
    };
    assert.throws(
      () => gerarMutantes(outraLinguagem),
      (erro: unknown) => erro instanceof LanguageRegistryError,
    );
  });
});
