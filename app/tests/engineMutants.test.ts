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
 *      (`extractAtoms`) que o torna detectável em princípio.
 *   2. Um revisor fake COMPLACENTE (aprova tudo) é DIAGNOSTICADO — a medição
 *      reporta taxa geral 1,0 contra os mutantes.
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
import { PREDICADOS_DA_AULA, type RevisaoComSeveridade } from '../electron/main/engine/prompts/reviewer';
import { severidadeDeCategoria } from '../electron/main/engine/review/normalize';
import {
  CLASSES_DE_DEFEITO,
  desafioValidoExemplo,
  gerarMutantes,
  rodaMutante,
  type ClasseDeDefeito,
} from '../electron/main/engine/quality/mutants';
import {
  CATEGORIAS_QUE_DETECTAM,
  ErroDeCalibracao,
  PARAMETROS_PADRAO_DE_REMOCAO,
  calibracaoNecessariaAntesDeLigar,
  categoriasParaRemover,
  decisaoDeCalibracao,
  limiarDeFalsoPasse,
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

/** Um apontamento de teste já com severidade anexada pela tabela fixa. */
function apontamentoDe(categoria: Categoria): ApontamentoComSeveridade {
  return {
    id: 'APT-CALIBRACAO',
    rodada: 1,
    artefato: 'desafio',
    alvo: {
      caminho: 'desafio',
      linha: 1,
      span: [0, 10],
      no_ast: 'ReturnStatement',
      token: 'return',
    },
    evidencia: {
      tipo: 'orcamento',
      prova: 'trecho citado pelo revisor de teste',
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
 * Revisor fake PERFEITO: levanta TODAS as categorias que abrem rodada em todo
 * artefato — qualquer mutante de qualquer classe é detectado. (No artefato
 * válido isso é excesso de zelo: `achadosNoValido` é diagnóstico, nunca
 * decisão.)
 */
function revisorPerfeito(): DepsDeCalibracao['revisor'] {
  const categorias: Categoria[] = [
    'construcao_nao_ensinada',
    'api_nao_ensinada',
    'teste_invalido',
    'gabarito_nao_passa',
    'cobertura_faltante',
    'teoria_desalinhada_do_desafio',
    'ambiguidade_de_enunciado',
  ];
  return async () => construirRevisao(categorias.map((c) => apontamentoDe(c)));
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

    // revisor que só levanta `teste_invalido`: detecta teste_divergente e
    // imprime (ambos têm teste_invalido no detector); erra as outras duas.
    const medicao = await medirTaxaDeFalsoPasse(
      { revisor: revisorQueDevolve(construirRevisao([apontamentoDe('teste_invalido')])) },
      { valido, mutantes },
    );

    assert.equal(medicao.taxaGeral, 0.5);
    const taxaPorClasse = Object.fromEntries(medicao.porClasse.map((m) => [m.classe, m.taxaDeFalsoPasse]));
    assert.equal(taxaPorClasse.teste_divergente_do_enunciado, 0);
    assert.equal(taxaPorClasse.imprime_em_vez_de_retornar, 0);
    assert.equal(taxaPorClasse.fora_do_orcamento, 1);
    assert.equal(taxaPorClasse.nao_exercita_a_aula, 1, 'gabarito_nao_passa não detecta a classe (d) — a execução não é o defeito curricular');
  });

  it('a taxa também pode ser medida por mutante individual (revisaoDetectaDefeito)', () => {
    const valido = desafioValidoExemplo();
    const [foraOrcamento] = gerarMutantes(valido);
    const revisao = construirRevisao([apontamentoDe('construcao_nao_ensinada')]);
    assert.equal(revisaoDetectaDefeito(revisao, foraOrcamento), true);
    const revisaoSoEstilo = construirRevisao([apontamentoDe('estilo')]);
    assert.equal(revisaoDetectaDefeito(revisaoSoEstilo, foraOrcamento), false);
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