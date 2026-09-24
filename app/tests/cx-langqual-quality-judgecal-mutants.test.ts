/**
 * tests/cx-langqual-quality-judgecal-mutants.test.ts — CARACTERIZAÇÃO (golden
 * master) do GERADOR DE MUTANTES (`engine/quality/mutants.ts`) e da CALIBRAÇÃO
 * DO JUIZ (`engine/quality/judgeCalibration.ts`). Rede de segurança para a
 * refatoração.
 *
 * Contratos que mordem aqui:
 *   1. `gerarMutantes` gera UM mutante por classe (M1..M4), cada mutante muda
 *      EXATAMENTE os campos da classe e traz `marcador` distintivo;
 *      `validarMutante` é a porta fail-closed — mutante que muda campo a mais,
 *      que vaza do orçamento do próprio mutante ou que ainda exercita a aula é
 *      REJEITADO com erro nominal (o mutante que ESCAPA não passa);
 *   2. as mutações são PURAS (a base nunca muda) e `rodaMutante` é a porta
 *      única de aplicação;
 *   3. `limiarDeFalsoPasse(τ) = (1−τ)/2` (0,45 com τ=0,10) e
 *      `decisaoDeCalibracao` reprova com `taxaGeral >= limiar` (o LIMIAR é o
 *      caso exato — igual já reprova) com `motivo: 'LIMIAR_FALSO_PASSE'`;
 *   4. `apontamentoDetectaDefeito` exige TRÊS coisas: categoria no conjunto
 *      detector DA CLASSE (`CATEGORIAS_QUE_DETECTAM`), categoria que ABRE
 *      rodada (sugestão nunca) e o ALVO tocando o marcador (span ∩ span OU
 *      menção no trecho citado) — apontar o trecho errado é falso-passe;
 *   5. `medirTaxaDeFalsoPasse` é fail-closed (`ErroDeCalibracao`
 *      REVISOR_INDISPONIVEL/SEM_MUTANTES), o válido julga por SANITY
 *      (`achadosNoValido` nunca decide) e `categoriasParaRemover` desliga por
 *      CLASSE após `geracoesConsecutivas` gerações abaixo do limiar (uma
 *      geração acima ZERA o contador).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  CLASSES_DE_DEFEITO,
  ATOMS_DO_CANAL_DE_IMPRESSAO,
  desafioValidoExemplo,
  mutarConstrucaoForaDoOrcamento,
  mutarTesteDivergenteDoEnunciado,
  mutarImpressaoEmVezDeRetorno,
  mutarNaoExercitaAAula,
  validarMutante,
  gerarMutantes,
  rodaMutante,
  type DesafioParaMutacao,
  type Mutante,
} from '../electron/main/engine/quality/mutants';
import {
  TAU_DEFAULT,
  limiarDeFalsoPasse,
  CATEGORIAS_QUE_DETECTAM,
  apontamentoDetectaDefeito,
  revisaoDetectaDefeito,
  localizarMarcadorNoMutado,
  medirTaxaDeFalsoPasse,
  decisaoDeCalibracao,
  PARAMETROS_PADRAO_DE_REMOCAO,
  categoriasParaRemover,
  calibracaoNecessariaAntesDeLigar,
  ErroDeCalibracao,
  type MedicaoDeFalsoPasse,
  type GeracaoDeMedicao,
} from '../electron/main/engine/quality/judgeCalibration';
import type { RevisaoComSeveridade } from '../electron/main/engine/prompts/reviewer';

// ---------------------------------------------------------------------------
// Fixtures de revisão falsa (o shape que a calibração consome)
// ---------------------------------------------------------------------------

function apontamento(categoria: string, trecho: string, span: [number, number] = [0, 0]) {
  return {
    categoria,
    alvo: { span, token: trecho },
    evidencia: { prova: trecho },
  } as unknown as RevisaoComSeveridade['apontamentos'][number];
}

function revisao(...apontamentos: RevisaoComSeveridade['apontamentos'][number][]): RevisaoComSeveridade {
  return { apontamentos } as unknown as RevisaoComSeveridade;
}

/** Revisor-detector: acha o marcador de QUALQUER mutante no artefato e aponta. */
const MARCADOR_PARA_CATEGORIA: Record<string, string> = {
  'Number.isFinite(v)': 'construcao_nao_ensinada',
  'ehPar(4), false': 'teste_invalido',
  'console.log': 'gabarito_nao_passa',
  'Math.round(n / 2)': 'teoria_desalinhada_do_desafio',
};

function revisorDetector() {
  return async (artefato: DesafioParaMutacao): Promise<RevisaoComSeveridade> => {
    const texto = JSON.stringify(artefato.desafio);
    for (const [marcador, categoria] of Object.entries(MARCADOR_PARA_CATEGORIA)) {
      if (texto.includes(marcador)) return revisao(apontamento(categoria, marcador));
    }
    return revisao();
  };
}

function revisorSilencioso() {
  return async (): Promise<RevisaoComSeveridade> => revisao();
}

function revisorQueLanca() {
  return async (): Promise<RevisaoComSeveridade> => {
    throw new Error('pipeline P-12 fora do ar');
  };
}

describe('mutants — (1) a fixture válida e as quatro mutações PURAS', () => {
  it('desafioValidoExemplo deriva o átomo da aula por parser (op:binary:%) e valida no schema', () => {
    const base = desafioValidoExemplo();
    assert.deepEqual([...base.introducesProductive], ['op:binary:%']);
    assert.equal(base.desafio.slug, 'm01/a03/desafio-paridade');
    assert.equal(base.desafio.expectedTestCount, 2);
    assert.equal(base.desafio.outputChannel, 'retorno');
    assert.ok(base.desafio.solutionCode.includes('n % 2 === 0'));
  });

  it('M1 fora_do_orcamento: só solutionCode muda e o marcador Number.isFinite(v) entra', () => {
    const base = desafioValidoExemplo();
    const m = mutarConstrucaoForaDoOrcamento(base);
    assert.ok(m.desafio.solutionCode.includes('Number.isFinite(v)'));
    assert.ok(!base.desafio.solutionCode.includes('Number.isFinite(v)'), 'a mutação é PURA');
    assert.equal(m.desafio.testsCode, base.desafio.testsCode);
    assert.equal(m.introducesProductive, base.introducesProductive);
  });

  it('M2 teste_divergente: o teste do PAR assere false e o resto segue o enunciado (um defeito só)', () => {
    const base = desafioValidoExemplo();
    const m = mutarTesteDivergenteDoEnunciado(base);
    assert.ok(m.desafio.testsCode.includes('ehPar(4), false'));
    assert.ok(m.desafio.testsCode.includes('ehPar(5), false'));
    assert.equal(m.desafio.solutionCode, base.desafio.solutionCode);
  });

  it('M3 imprime_em_vez_de_retornar: console.log sem return, outputChannel impressao, canal NO orçamento', () => {
    const base = desafioValidoExemplo();
    const m = mutarImpressaoEmVezDeRetorno(base);
    assert.ok(m.desafio.solutionCode.includes('console.log'));
    assert.ok(!m.desafio.solutionCode.includes('return'));
    assert.equal(m.desafio.outputChannel, 'impressao');
    assert.deepEqual([...ATOMS_DO_CANAL_DE_IMPRESSAO], ['global:console', 'api:console.log', 'node:ExpressionStatement']);
    for (const atomo of ATOMS_DO_CANAL_DE_IMPRESSAO) {
      assert.ok(m.desafio.requires.includes(atomo), 'os átomos do canal são o orçamento DO MUTANTE');
    }
    assert.equal(base.desafio.outputChannel, 'retorno', 'pura');
  });

  it('M4 nao_exercita_a_aula: resolve por Math.round sem usar op:binary:% e sem vazar do orçamento', () => {
    const base = desafioValidoExemplo();
    const m = mutarNaoExercitaAAula(base);
    assert.ok(m.desafio.solutionCode.includes('Math.round(n / 2)'));
    assert.ok(!m.desafio.solutionCode.includes('%'));
    assert.equal(m.introducesProductive.length, 1, 'a exigência da aula continua a mesma');
  });
});

describe('mutants — (2) gerarMutantes/rodaMutante e a porta fail-closed', () => {
  it('UM mutante por classe (M1..M4) com marcador e defeito legíveis — todos validados', () => {
    const ms = gerarMutantes(desafioValidoExemplo());
    assert.deepEqual(ms.map((m) => [m.id, m.classe]), [
      ['M1', 'fora_do_orcamento'],
      ['M2', 'teste_divergente_do_enunciado'],
      ['M3', 'imprime_em_vez_de_retornar'],
      ['M4', 'nao_exercita_a_aula'],
    ]);
    assert.deepEqual([...CLASSES_DE_DEFEITO], [
      'fora_do_orcamento',
      'teste_divergente_do_enunciado',
      'imprime_em_vez_de_retornar',
      'nao_exercita_a_aula',
    ]);
    for (const m of ms) {
      assert.ok(m.marcador.length > 0);
      assert.ok(m.defeito.length > 20, 'o defeito é legível, para o relatório da medição');
    }
  });

  it('rodaMutante é a porta única de aplicação (mesmo resultado da mutação pura)', () => {
    const base = desafioValidoExemplo();
    const ms = gerarMutantes(base);
    for (const m of ms) {
      assert.deepEqual(rodaMutante(m, base), m.aplicar(base));
    }
  });

  it('validarMutante REJEITA o mutante que muda campo a mais (o defeito tem de ser UNO)', () => {
    const base = desafioValidoExemplo();
    const mutante = gerarMutantes(base)[0];
    const trapaceado: DesafioParaMutacao = {
      ...mutarConstrucaoForaDoOrcamento(base),
      desafio: { ...mutarConstrucaoForaDoOrcamento(base).desafio, testsCode: 'trocado' },
    };
    assert.throws(
      () => validarMutante(base, mutante, trapaceado),
      /mexeu em campos além de solutionCode/,
    );
  });

  it('validarMutante REJEITA o mutante (c) VAZADO (defeito duplo (a)+(c) não passa)', () => {
    const base = desafioValidoExemplo();
    const mutante = gerarMutantes(base).find((m) => m.classe === 'imprime_em_vez_de_retornar');
    assert.ok(mutante !== undefined);
    const vazado: DesafioParaMutacao = {
      ...base,
      desafio: {
        ...base.desafio,
        solutionCode: 'export function ehPar(n) {\n  console.log(n % 2 === 0);\n}\n',
        outputChannel: 'impressao',
        // requires INTACTO: os átomos do canal não declarados ⇒ defeito duplo.
      },
    };
    assert.throws(() => validarMutante(base, mutante, vazado), /vazou do orçamento do mutante/);
  });

  it('validarMutante REJEITA o mutante (d) que ainda exercita a aula e o (b) sem a divergência', () => {
    const base = desafioValidoExemplo();
    const m4 = gerarMutantes(base).find((m) => m.classe === 'nao_exercita_a_aula');
    assert.ok(m4 !== undefined);
    assert.throws(
      () => validarMutante(base, m4, mutarConstrucaoForaDoOrcamento(base)),
      /ainda usa construção da aula|não contém a construção proibida/,
    );

    const m2 = gerarMutantes(base).find((m) => m.classe === 'teste_divergente_do_enunciado');
    assert.ok(m2 !== undefined);
    assert.throws(
      () => validarMutante(base, m2, base),
      /a divergência \(par → false\) não está nos testes/,
    );
  });

  it('a classe (a) não pode ser gerada quando TODO candidato já está em requires (erro, nunca mutante vazio)', () => {
    const base = desafioValidoExemplo();
    const satura: DesafioParaMutacao = {
      ...base,
      desafio: {
        ...base.desafio,
        requires: [...base.desafio.requires, 'api:Number.isFinite', 'api:Array.isArray', 'node:WhileStatement'],
      },
    };
    assert.throws(() => mutarConstrucaoForaDoOrcamento(satura), /classe \(a\) não pode ser gerada/);
  });
});

describe('judgeCalibration — (3) o limiar (1−τ)/2 e a régua de detecção', () => {
  it('limiarDeFalsoPasse é (1−τ)/2 — 0,45 com τ=0,10; os parâmetros padrão espelham o limiar', () => {
    assert.equal(TAU_DEFAULT, 0.1);
    assert.equal(limiarDeFalsoPasse(), 0.45);
    assert.equal(limiarDeFalsoPasse(0.2), 0.4);
    assert.deepEqual(PARAMETROS_PADRAO_DE_REMOCAO, { limiarDeAcerto: 0.55, geracoesConsecutivas: 2 });
  });

  it('CATEGORIAS_QUE_DETECTAM é por CLASSE — sugestão nunca detecta; pegar a execução não é pegar o defeito', () => {
    assert.deepEqual(CATEGORIAS_QUE_DETECTAM, {
      fora_do_orcamento: ['construcao_nao_ensinada', 'api_nao_ensinada'],
      teste_divergente_do_enunciado: ['teste_invalido', 'ambiguidade_de_enunciado'],
      imprime_em_vez_de_retornar: ['gabarito_nao_passa', 'teste_invalido', 'ambiguidade_de_enunciado'],
      nao_exercita_a_aula: ['teoria_desalinhada_do_desafio', 'cobertura_faltante'],
    });
  });

  it('apontamentoDetectaDefeito: categoria certa + abre rodada + alvo TOCA o marcador (menção no trecho)', () => {
    const mutante = { classe: 'fora_do_orcamento', marcador: 'Number.isFinite(v)' } as unknown as Mutante;
    const acerto = apontamento('construcao_nao_ensinada', 'usou Number.isFinite(v) sem ensinar');
    assert.equal(apontamentoDetectaDefeito(acerto, mutante), true);

    const categoriaErrada = apontamento('gabarito_nao_passa', 'Number.isFinite(v)');
    assert.equal(apontamentoDetectaDefeito(categoriaErrada, mutante), false, 'pegou a execução, não o defeito');

    const sugestao = apontamento('estilo', 'Number.isFinite(v)');
    assert.equal(apontamentoDetectaDefeito(sugestao, mutante), false, 'sugestão nunca abre rodada');

    const trechoErrado = apontamento('construcao_nao_ensinada', 'completamente fora');
    assert.equal(apontamentoDetectaDefeito(trechoErrado, mutante), false, 'apontar o trecho errado não detecta');
  });

  it('o span do apontamento também detecta (span ∩ span) e mutante sem marcador detecta por categoria', () => {
    const mutante = { classe: 'fora_do_orcamento', marcador: 'Number.isFinite(v)' } as unknown as Mutante;
    const porSpan = apontamento('api_nao_ensinada', '', [40, 60]);
    const marcador = { texto: 'Number.isFinite(v)', span: [50, 68] as const };
    assert.equal(apontamentoDetectaDefeito(porSpan, mutante, marcador), true);

    const longe = apontamento('api_nao_ensinada', '', [0, 5]);
    assert.equal(apontamentoDetectaDefeito(longe, mutante, marcador), false);

    const semMarcador = { classe: 'fora_do_orcamento', marcador: '' } as unknown as Mutante;
    assert.equal(apontamentoDetectaDefeito(apontamento('construcao_nao_ensinada', 'qualquer'), semMarcador), true);
  });

  it('revisaoDetectaDefeito: ALGUM apontamento detecta; e localizarMarcadorNoMutado acha o span por campo', () => {
    const base = desafioValidoExemplo();
    const mutante = gerarMutantes(base)[0];
    const mutado = rodaMutante(mutante, base);
    const r = revisao(apontamento('estilo', 'x'), apontamento('construcao_nao_ensinada', `vi ${mutante.marcador} aqui`));
    assert.equal(revisaoDetectaDefeito(r, mutante, localizarMarcadorNoMutado(mutante, mutado)), true);

    const loc = localizarMarcadorNoMutado(mutante, mutado);
    assert.ok(loc !== undefined && loc.span !== null);
    assert.equal(mutado.desafio.solutionCode.slice(loc.span[0], loc.span[1]), mutante.marcador);

    const naoAchado = localizarMarcadorNoMutado({ marcador: 'TEXTO QUE NÃO EXISTE' }, mutado);
    assert.deepEqual(naoAchado, { texto: 'TEXTO QUE NÃO EXISTE', span: null });

    const semMarcador = localizarMarcadorNoMutado({ marcador: '' }, mutado);
    assert.equal(semMarcador, undefined, 'classe sem marcador ⇒ detecção por categoria');
  });
});

describe('judgeCalibration — (4) medirTaxaDeFalsoPasse (fail-closed) e a decisão no limiar EXATO', () => {
  const base = desafioValidoExemplo();
  const mutantes = gerarMutantes(base);

  it('revisor perfeito: 0 falsos-passes; revisor mudo: taxa geral 1 (todos os mutantes escapam)', async () => {
    const perfeito = await medirTaxaDeFalsoPasse({ revisor: revisorDetector() }, { valido: base, mutantes });
    assert.equal(perfeito.taxaGeral, 0);
    assert.equal(perfeito.frenteAMutantes, 4);
    assert.equal(perfeito.amostras, 5, 'válido + 4 mutantes');
    assert.equal(perfeito.achadosNoValido, 0, 'sanity — nunca decide');
    for (const c of perfeito.porClasse) {
      assert.equal(c.falsosPasses, 0);
      assert.equal(c.razaoDeAcerto, 1);
    }

    const mudo = await medirTaxaDeFalsoPasse({ revisor: revisorSilencioso() }, { valido: base, mutantes });
    assert.equal(mudo.taxaGeral, 1);
    assert.deepEqual(mudo.porClasse.map((c) => c.falsosPasses), [1, 1, 1, 1]);
  });

  it('o achado NO VÁLIDO é diagnóstico (sanity) e NÃO entra em nenhuma decisão', async () => {
    const alarmista = async (artefato: DesafioParaMutacao): Promise<RevisaoComSeveridade> =>
      artefato === base
        ? revisao(apontamento('construcao_nao_ensinada', 'alarme falso'))
        : revisorDetector()(artefato);
    const m = await medirTaxaDeFalsoPasse({ revisor: alarmista }, { valido: base, mutantes });
    assert.equal(m.achadosNoValido, 1);
    assert.equal(m.taxaGeral, 0, 'a taxa lê SÓ os mutantes');
  });

  it('fail-closed: sem mutantes ⇒ ErroDeCalibracao SEM_MUTANTES; revisor fora do ar ⇒ REVISOR_INDISPONIVEL', async () => {
    await assert.rejects(
      () => medirTaxaDeFalsoPasse({ revisor: revisorSilencioso() }, { valido: base, mutantes: [] }),
      (e: unknown) => {
        assert.ok(e instanceof ErroDeCalibracao);
        assert.equal(e.name, 'ErroDeCalibracao');
        assert.equal(e.tipo, 'SEM_MUTANTES');
        return true;
      },
    );
    await assert.rejects(
      () => medirTaxaDeFalsoPasse({ revisor: revisorQueLanca() }, { valido: base, mutantes }),
      (e: unknown) => {
        assert.ok(e instanceof ErroDeCalibracao);
        assert.equal(e.tipo, 'REVISOR_INDISPONIVEL');
        assert.match(e.message, /fail-closed/);
        return true;
      },
    );
  });

  it('decisaoDeCalibracao: taxa IGUAL ao limiar já REPROVA (o teste é >=); abaixo aprova', () => {
    const medicao = (taxaGeral: number): MedicaoDeFalsoPasse => ({
      amostras: 5,
      frenteAMutantes: 4,
      taxaGeral,
      porClasse: [],
      achadosNoValido: 0,
    });
    const noLimiar = decisaoDeCalibracao(medicao(0.45));
    assert.equal(noLimiar.aprovado, false);
    assert.equal(noLimiar.motivo, 'LIMIAR_FALSO_PASSE');
    assert.equal(noLimiar.limiar, 0.45);
    assert.match(noLimiar.mensagem, /NUNCA remove nada/);

    const abaixo = decisaoDeCalibracao(medicao(0.4499));
    assert.equal(abaixo.aprovado, true);
    assert.equal(abaixo.motivo, undefined);
    assert.match(abaixo.mensagem, /calibração aprovada/);

    const comTau = decisaoDeCalibracao(medicao(0.2), limiarDeFalsoPasse(0.6));
    assert.equal(comTau.aprovado, false, 'taxa 0.2 ≥ limiar 0.2 de τ=0.6');
    assert.equal(comTau.limiar, 0.2);
  });
});

describe('judgeCalibration — (5) remoção por categoria e o contrato do laço', () => {
  const medicaoCom = (razao: number): MedicaoDeFalsoPasse => ({
    amostras: 5,
    frenteAMutantes: 4,
    taxaGeral: 1 - razao,
    porClasse: [
      {
        classe: 'fora_do_orcamento',
        totalMutantes: 4,
        detectados: Math.round(razao * 4),
        falsosPasses: 4 - Math.round(razao * 4),
        taxaDeFalsoPasse: 1 - razao,
        razaoDeAcerto: razao,
      },
    ],
    achadosNoValido: 0,
  });

  it('DUAS gerações consecutivas abaixo do limiar removem a classe; uma geração acima ZERA o contador', () => {
    const g = (geracao: number, razao: number): GeracaoDeMedicao => ({ geracao, medicao: medicaoCom(razao) });

    const umaSoh = categoriasParaRemover([g(1, 0.5)]);
    assert.deepEqual(umaSoh, [], '1 geração não basta (o parâmetro é 2)');

    const duas = categoriasParaRemover([g(1, 0.5), g(2, 0.5)]);
    assert.equal(duas.length, 1);
    assert.equal(duas[0].classe, 'fora_do_orcamento');
    assert.equal(duas[0].geracoesConsecutivasAbaixo, 2);
    assert.equal(duas[0].ultimaRazaoDeAcerto, 0.5);

    const interrompido = categoriasParaRemover([g(1, 0.5), g(2, 0.9), g(3, 0.5)]);
    assert.deepEqual(interrompido, [], 'a geração acima do limiar ZERA o contador');

    const exatoNaoConta = categoriasParaRemover([g(1, 0.55), g(2, 0.55)]);
    assert.deepEqual(exatoNaoConta, [], 'razão IGUAL ao limiar (0,55) não é ABAIXO — o teste é estrito');
  });

  it('parametros inválidos (geracoesConsecutivas < 1) lançam erro nominal', () => {
    assert.throws(
      () => categoriasParaRemover([], { limiarDeAcerto: 0.5, geracoesConsecutivas: 0 }),
      /geracoesConsecutivas tem de ser ≥ 1/,
    );
  });

  it('calibracaoNecessariaAntesDeLigar: histórico vazio ⇒ true; última aprovada ⇒ false; última reprovada ⇒ true', () => {
    const medicao = (taxa: number): MedicaoDeFalsoPasse => ({
      amostras: 5,
      frenteAMutantes: 4,
      taxaGeral: taxa,
      porClasse: [],
      achadosNoValido: 0,
    });
    assert.equal(calibracaoNecessariaAntesDeLigar([]), true, 'nunca se liga um laço nunca calibrado');
    assert.equal(calibracaoNecessariaAntesDeLigar([medicao(0), medicao(0.1)]), false);
    assert.equal(calibracaoNecessariaAntesDeLigar([medicao(0), medicao(0.9)]), true, 'a primeira medição que cruza o limiar volta a exigir calibração');
    assert.equal(calibracaoNecessariaAntesDeLigar([medicao(0.5)], 0.6), false, 'o limiar é parâmetro: 0,5 < 0,6 aprova');
    assert.equal(calibracaoNecessariaAntesDeLigar([medicao(0.5)]), true, '0,5 ≥ 0,45 (default) reprova');
  });
});
