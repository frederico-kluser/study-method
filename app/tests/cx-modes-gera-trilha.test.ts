/**
 * tests/cx-modes-gera-trilha.test.ts — CARACTERIZAÇÃO (golden master) de
 * `engine/fiacao/geraTrilha.ts`: os helpers determinísticos (dossiês, plano de
 * aulas, piloto, limiters, config F1), o núcleo paralelo de verificação, os
 * papéis LLM do laço, o bridge de revisão e a MÁQUINA DE FASES (run.json,
 * retomada, portão F6, teto de tokens, checkpoints e erros estruturados).
 *
 * OFFLINE: fases sobrescritas por fakes (`faseOverride`), tmpdirs próprios
 * (`mkdtemp('do-cxmodes-')`), zero produção tocada.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fsp } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { HARNESS_RECEPTIVE_SEED } from '../electron/main/engine/atomKeys';
import type { EngineLlm, LlmCallRequest } from '../electron/main/engine/runtime/callLlm';
import { sha256Hex } from '../electron/main/engine/runtime/ledger';
import {
  FASES_ORDEM,
  criarRun,
  concluirFase,
  iniciarFase,
  lerRun,
  salvarRun,
  type FaseId,
} from '../electron/main/engine/runtime/runState';
import { caminhoDraftAula, caminhoDraftDesafio, type DossieDeAula } from '../electron/main/engine/phases/f7Theory';
import type { BudgetF4 } from '../electron/main/engine/phases/f4Budget';
import type { NoAtomico } from '../electron/main/engine/phases/f2Decompose';
import type { Brief } from '../electron/main/engine/phases/f0Brief';
import type { Freeze } from '../electron/main/engine/phases/f5Freeze';
import { LLM_ERROR_CODES } from '../electron/main/services/llmClient';
import type { ContextoDoLaco, EntradaDoCorretor, EntradaDoPlanejador, EntradaDeRevisao } from '../electron/main/engine/review/loop';
import {
  ARQUIVO_APROVACAO_F6,
  ARTEFATO_BRIEF,
  ARTEFATO_F5,
  ARTEFATO_NOS,
  ARTEFATO_REPORT,
  DIR_ARTEFATOS,
  ErroGeracao,
  GeradorDeTrilha,
  atomosDeHarnessReceptivo,
  construirDossiesDeAula,
  criarLimitersDefault,
  criarPapeisDoLacoLlm,
  criarRevisaoDaFiacao,
  f1ConfigDefault,
  gerarTrilha,
  planoDeAulasDosNos,
  selecionarPiloto,
  verificarRefsEmParalelo,
  type ComandosGeracao,
  type DepsGeracao,
  type ArtefatosDaRevisao,
  type FaseF9Ref,
} from '../electron/main/engine/fiacao/geraTrilha';
import { PREDICADOS_DA_AULA, type RevisaoDoRevisor } from '../electron/main/engine/prompts/reviewer';
import { createSemaphore } from '../electron/main/engine/runtime/semaphore';

// ---------------------------------------------------------------------------
// Fakes e fixtures
// ---------------------------------------------------------------------------

interface LlmFake {
  llm: EngineLlm;
  chamadas: Array<{ etapa: string; req: LlmCallRequest }>;
}

function criarLlmFake(responder: (etapa: string, req: LlmCallRequest) => string): LlmFake {
  const chamadas: Array<{ etapa: string; req: LlmCallRequest }> = [];
  const llm: EngineLlm = {
    async callLlm(etapa, req) {
      chamadas.push({ etapa, req });
      return {
        content: responder(etapa, req),
        model: 'fake',
        cached: false,
        stageUsage: { promptTokens: 0, completionTokens: 0, llmCalls: 1, cachedHits: 0, retries: 0 },
        attempts: 1,
        elapsedMs: 0,
      };
    },
    getStageUsage: () => undefined,
    getAllStageUsage: () => ({}),
  };
  return { llm, chamadas };
}

function revisaoVazia(rodada = 1): RevisaoDoRevisor {
  return {
    artefato: 'gera-trilha',
    hash_artefato: 'h',
    rodada,
    apontamentos: [],
    resumo: 'revisão sintética da suíte',
    predicados: PREDICADOS_DA_AULA.map((p) => ({
      id: p.id as 'E1' | 'E2' | 'E3' | 'E4' | 'E5',
      pergunta: p.pergunta,
      justificativa: 'justificativa sintética',
      veredito: 'sim' as const,
    })),
  };
}

function noAtomico(chave: string, over: Partial<NoAtomico> = {}): NoAtomico {
  return {
    chave_conceito: chave,
    nome: `Nó ${chave}`,
    familia: 'sintaxe',
    introduces: { receptive: [`node:${chave}`], productive: [`node:${chave}`] },
    kc_type: 'regra',
    ei_class: 'isolado',
    justificativa: 'fixture',
    erklarung: '',
    role: 'isolado',
    ...over,
  } as unknown as NoAtomico;
}

function budgetDe(refs: Array<{ ref: string; element_count?: number }>): BudgetF4 {
  return {
    aulas: refs.map((r, i) => ({
      ref: r.ref,
      entryConstructs: [],
      budget_entrada: { receptive: [], productive: [] },
      budget_saida: { receptive: [], productive: [] },
      introduces: { receptive: [], productive: [] },
      matrix: [],
      element_count: r.element_count ?? 1,
      tetos: { produtivasNovas: 2, novasTotal: 4, formasPorChave: 2, secoesDeTeoria: 2 },
      index: i,
    })),
    fonte: 'declared',
    politica_de_harness: 'receptive-seed',
    hash: sha256Hex('budget'),
  } as unknown as BudgetF4;
}

function freezeDe(refs: string[]): Freeze {
  return {
    hash_orcamento: sha256Hex('o'),
    hash_grafo: sha256Hex('g'),
    carimbo: '2026-01-01T00:00:00.000Z',
    dossies: refs.map((r) => ({ aula_slug: r, hash: sha256Hex(r), caminho: `snapshots/${r}.json` })),
    snapshots: refs.map((r, i) => ({
      aula_slug: r,
      caminho: `snapshots/${r}.json`,
      budgetHash: sha256Hex(r),
      hash: sha256Hex(`s${i}`),
    })),
  } as unknown as Freeze;
}

const BRIEF: Brief = {
  tema: 'laços de repetição',
  objetivo_geral: 'aprender laços',
  criterios_de_entrada: ['saber somar'],
  construcoes_alvo: ['node:ForStatement'],
} as unknown as Brief;

function dossieDe(aula_slug: string): DossieDeAula {
  return {
    aula_slug,
    snapshot: { aula_slug, caminho: `snapshots/${aula_slug}.json`, budgetHash: sha256Hex(aula_slug), hash: sha256Hex(aula_slug) },
    dossie: {} as DossieDeAula['dossie'],
    desafios_anteriores: [],
  };
}

function depsDeGeracao(dir: string, dirProduto: string, over: Partial<DepsGeracao> = {}): DepsGeracao {
  const { llm } = criarLlmFake(() => '{}');
  return {
    dir,
    dirProduto,
    llm: over.llm ?? llm,
    prover: over.prover ?? (async () => ({ valid: true, failures: [], declared: 1, executed: 1 })),
    ...over,
  };
}

function comandos(over: Partial<ComandosGeracao> = {}): ComandosGeracao {
  return { slug: 'cx-run-teste', assunto: 'laços de repetição', ...over };
}

/** Todos os fases viram no-op — a máquina de estados fica sob teste puro. */
function fasesNoOp(): NonNullable<DepsGeracao['faseOverride']> {
  const over: NonNullable<DepsGeracao['faseOverride']> = {};
  for (const fase of FASES_ORDEM) {
    over[fase] = async () => {};
  }
  return over;
}

async function tmp(): Promise<string> {
  return fsp.mkdtemp(path.join(os.tmpdir(), 'do-cxmodes-'));
}

/** Eventos do ledger do run, na ordem gravada. */
async function eventosDoLedger(dir: string): Promise<Array<{ tipo: string; fase?: string }>> {
  const texto = await fsp.readFile(path.join(dir, 'ledger.jsonl'), 'utf8');
  return texto
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as { tipo: string; fase?: string });
}

// ---------------------------------------------------------------------------
// 1. Constantes e helpers determinísticos
// ---------------------------------------------------------------------------

describe('geraTrilha — constantes de layout pinadas', () => {
  it('GOLDEN: diretório de artefatos, marker F6 e nomes de artefato', () => {
    assert.equal(DIR_ARTEFATOS, 'artefatos');
    assert.equal(ARQUIVO_APROVACAO_F6, 'aprovacaoF6.json');
    assert.equal(ARTEFATO_BRIEF, 'brief.json');
    assert.equal(ARTEFATO_F5, 'f5.json');
    assert.equal(ARTEFATO_NOS, 'nos.json');
    assert.equal(ARTEFATO_REPORT, 'report.json');
    assert.deepEqual([...FASES_ORDEM], ['F0', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12']);
  });

  it('atomosDeHarnessReceptivo é a semente curada, em CÓPIA (mutar não contamina)', () => {
    const a = atomosDeHarnessReceptivo();
    assert.deepEqual(a, [...HARNESS_RECEPTIVE_SEED]);
    a.push('mutado-pelo-teste');
    assert.deepEqual(atomosDeHarnessReceptivo(), [...HARNESS_RECEPTIVE_SEED]);
  });

  it('GOLDEN: f1ConfigDefault — os parâmetros declarados do paralelismo §4.1', () => {
    assert.deepEqual(f1ConfigDefault(), {
      concorrenciaDeAssuntos: 2,
      atrasoEntreLotesMs: 250,
      atrasoSobRateLimitMs: 30_000,
      tetoTokensPorRetorno: 2000,
      tetoAchadosPorSubTopico: 15,
      tetoQueriesPorSubTopico: 8,
      stageVersion: 'f1-plano-v1',
      timeoutMs: 120_000,
    });
  });
});

describe('planoDeAulasDosNos / selecionarPiloto / criarLimitersDefault', () => {
  it('plano 1-conceito-por-aula, ORDENADO por chave, com ref m1/<id>', () => {
    const plano = planoDeAulasDosNos([noAtomico('zebra'), noAtomico('abelha')]);
    assert.deepEqual(plano, [
      { ref: 'm1/abelha', introduz: ['abelha'] },
      { ref: 'm1/zebra', introduz: ['zebra'] },
    ]);
    assert.deepEqual(planoDeAulasDosNos([]), []);
  });

  it('piloto: ≤ 3 são todas; mais → raiz, a mais armadilhada (element_count) e a tardia', () => {
    const refs = ['m1/a', 'm1/b', 'm1/c', 'm1/d'];
    const budget = budgetDe([
      { ref: 'm1/a', element_count: 1 },
      { ref: 'm1/b', element_count: 9 },
      { ref: 'm1/c', element_count: 2 },
      { ref: 'm1/d', element_count: 3 },
    ]);
    const todos = refs.map(dossieDe);
    assert.deepEqual(selecionarPiloto([todos[3], todos[0]], budget).map((d) => d.aula_slug), ['m1/a', 'm1/d'], '≤ 3: todas, na ordem do orçamento');
    assert.deepEqual(selecionarPiloto(todos, budget).map((d) => d.aula_slug), ['m1/a', 'm1/b', 'm1/d']);
    assert.deepEqual(selecionarPiloto([], budget), []);
    assert.deepEqual(selecionarPiloto([dossieDe('m1/so')], budget).map((d) => d.aula_slug), ['m1/so']);
  });

  it('criarLimitersDefault: 3 pools, e o semáforo injetado vira o pool de LLM', () => {
    const semaforo = createSemaphore(2);
    const l = criarLimitersDefault(semaforo);
    assert.equal(l.llm, semaforo);
    assert.ok(l.exec !== undefined && l.cpu !== undefined);
    assert.ok(criarLimitersDefault().llm !== undefined);
  });
});

describe('construirDossiesDeAula — determinístico, com o harness no budget_teste', () => {
  it('um dossiê por snapshot; budget_teste = harness + introduces do nó F2', () => {
    const freeze = freezeDe(['m1/abelha', 'm1/sol']);
    const budget = budgetDe([{ ref: 'm1/abelha' }, { ref: 'm1/sol' }]);
    // NOTA: `ei_class` do dossiê usa o enum §7.1 ('fato'|'categoria'|'regra'|
    // 'principio'|'integrativo') — ver o teste SKIPADO abaixo sobre o choque
    // de vocabulários com o `ei_class` do nó F2 ('isolado'|'interativo').
    const nos = [
      { ...noAtomico('abelha'), ei_class: 'regra' } as unknown as NoAtomico,
      { ...noAtomico('sol'), ei_class: 'fato' } as unknown as NoAtomico,
    ];
    const dossies = construirDossiesDeAula({ freeze, budget, nos, brief: BRIEF });
    assert.deepEqual(dossies.map((d) => d.aula_slug), ['m1/abelha', 'm1/sol']);
    const comNo = dossies[0].dossie;
    assert.deepEqual(comNo.introduces_productive, ['node:abelha']);
    assert.equal(comNo.ei_class, 'regra');
    assert.equal(comNo.kc_type, 'regra');
    assert.ok(comNo.budget_teste.includes('node:abelha'));
    assert.ok(comNo.budget_teste.some((k) => HARNESS_RECEPTIVE_SEED.includes(k)));
    assert.deepEqual(comNo.budget_produtivo, ['node:abelha']);
  });

  it.skip('BUG: construirDossiesDeAula repassa o ei_class do nó F2 (isolado/interativo) ao dossiê, cujo enum é fato/categoria/regra/principio/integrativo — montarDossie recusa TODO nó real (ErroDossieIncompleto "ei_class"), o fallback `?? isolado` de snapshot SEM nó tem o mesmo destino, e as fases reais F6/F7 não constroem dossiê nenhum — app/electron/main/engine/fiacao/geraTrilha.ts:489', () => {
    // COMPORTAMENTO CORRETO (quando o bug for corrigido, destipe este teste):
    // um NoAtomico VÁLIDO do F2 (ei_class ∈ EI_CLASSES = 'isolado'|'interativo',
    // o único que f2Decompose.ts:317 aceita) produz dossiê, com a classe §7.1
    // DERIVADA dele; e um snapshot sem nó F2 produz dossiê com introduces vazio.
    const freeze = freezeDe(['m1/abelha', 'm1/fantasma']);
    const budget = budgetDe([{ ref: 'm1/abelha' }, { ref: 'm1/fantasma' }]);
    const nos = [noAtomico('abelha')]; // ei_class: 'isolado' — vocabulário REAL do F2
    const dossies = construirDossiesDeAula({ freeze, budget, nos, brief: BRIEF });
    assert.equal(dossies.length, 2);
    assert.deepEqual(dossies[0].dossie.introduces_productive, ['node:abelha']);
    assert.deepEqual(dossies[1].dossie.introduces_productive, [], 'sem nó F2 o dossiê nasce sem introduces');
  });

  it('LIMITE: snapshot sem entrada no orçamento → ErroGeracao ARTEFATO_AUSENTE (fail-closed)', () => {
    assert.throws(
      () =>
        construirDossiesDeAula({
          freeze: freezeDe(['m1/fantasma']),
          budget: budgetDe([]),
          nos: [],
          brief: BRIEF,
        }),
      (e: unknown) => e instanceof ErroGeracao && e.code === 'ARTEFATO_AUSENTE',
    );
  });
});

// ---------------------------------------------------------------------------
// 2. O núcleo paralelo da verificação (F9/F11)
// ---------------------------------------------------------------------------

describe('verificarRefsEmParalelo — ordem ESTÁVEL, nunca a de conclusão', () => {
  function refDe(ref: string, ok = true): FaseF9Ref {
    return {
      ref,
      provas: { valid: ok, falhas: ok ? [] : ['g-test: falhou'] },
      ofensasOrcamento: ok ? [] : ['op:unary:typeof'],
      falhaDeParse: null,
      ok,
    };
  }

  it('o relatório sai na ordem dos refs de ENTRADA, mesmo com conclusão em ordem inversa', async () => {
    const atrasos: Record<string, number> = { 'm1/a': 30, 'm1/b': 20, 'm1/c': 0 };
    const r = await verificarRefsEmParalelo({
      refs: ['m1/a', 'm1/b', 'm1/c'],
      semaforo: createSemaphore(3),
      verificarUma: async (ref) => {
        await new Promise((res) => setTimeout(res, atrasos[ref] ?? 0));
        return refDe(ref);
      },
    });
    assert.equal(r.ok, true);
    assert.equal(r.desafios, 3);
    assert.deepEqual(r.refs.map((x) => x.ref), ['m1/a', 'm1/b', 'm1/c']);
  });

  it('reprovado entra em `falhas` com o formato pinado (provas/orçamento/parse)', async () => {
    const r = await verificarRefsEmParalelo({
      refs: ['m1/a', 'm1/b'],
      semaforo: createSemaphore(2),
      verificarUma: async (ref) => refDe(ref, ref !== 'm1/b'),
    });
    assert.equal(r.ok, false);
    assert.deepEqual(r.falhas, ['m1/b: provas [g-test: falhou] orçamento [op:unary:typeof] parse [-]']);
  });

  it('fail-closed: verificarUma que LANÇA propaga (a fase aborta com checkpoint)', async () => {
    await assert.rejects(
      verificarRefsEmParalelo({
        refs: ['m1/a'],
        semaforo: createSemaphore(1),
        verificarUma: async () => {
          throw new ErroGeracao('DRAFTS_INVALIDOS', 'draft ausente');
        },
      }),
      (e: unknown) => e instanceof ErroGeracao && e.code === 'DRAFTS_INVALIDOS',
    );
  });
});

// ---------------------------------------------------------------------------
// 3. Os três papéis LLM do laço (P-12/P-13) cabeados no transporte único
// ---------------------------------------------------------------------------

describe('criarPapeisDoLacoLlm — roteamento por papel e fail-closed de saída', () => {
  function papeis(resposta: string) {
    const { llm, chamadas } = criarLlmFake(() => resposta);
    return { papeis: criarPapeisDoLacoLlm(llm, { modeloAutor: 'autor-x', modeloRevisor: 'revisor-y' }), chamadas };
  }

  const apontamentoDeFixture = {
    id: 'MEC-0001',
    rodada: 0,
    artefato: 'solutionCode',
    alvo: { caminho: 'x#solutionCode', linha: 1, span: [0, 6] as [number, number], no_ast: 'op:unary:typeof', token: 'typeof' },
    evidencia: { tipo: 'orcamento', prova: 'p', introduzido_em: null, reproduzivel_por: 'mec' },
    defeito: 'd',
    regra_violada: 'C1',
    categoria: 'construcao_nao_ensinada',
    severity: 'bloqueante',
    acao_sugerida: 'a',
    confianca: 1,
  };
  const entradaDeRevisao: EntradaDeRevisao = {
    instrumento: 'aula',
    artefatoNormalizado: 'conteúdo normalizado',
    regras: [{ id: 'C1', texto: 'toda construção usada é ensinada antes de usada' }],
    verificadores: 'verificadores verdes',
    rodada: 1,
    hashCode: 'abc',
  };
  const entradaDoPlanejador: EntradaDoPlanejador = {
    trilha: 't',
    rodada: 1,
    apontamentos: [apontamentoDeFixture] as unknown as EntradaDoPlanejador['apontamentos'],
    excluidosComoExcecao: [],
    ledgerDeRejeicoes: '',
  };
  const entradaDoCorretor: EntradaDoCorretor = {
    trilha: 't',
    rodada: 1,
    decisao: {
      apontamento: apontamentoDeFixture,
      acao: 'REWRITE_IN_BUDGET',
      alvo: { arquivo: 'x#solutionCode', span: [0, 6] as [number, number] },
      resultado_esperado: 'o verificador fica verde',
    } as unknown as EntradaDoCorretor['decisao'],
    pins: [],
  };

  it('ROTEAMENTO §6.2: revisor vai para modeloRevisor; planejador e corretor para modeloAutor', async () => {
    const { papeis: p, chamadas } = papeis(JSON.stringify(revisaoVazia()));
    await p.revisar(entradaDeRevisao);
    assert.equal(chamadas[0].req.modelId, 'revisor-y');
    assert.equal(chamadas[0].etapa.startsWith('laco-revisor'), true);

    const acoes = JSON.stringify({
      acoes: [
        {
          posicao: 0,
          apontamento_id: 'MEC-0001',
          alvo: { arquivo: 'x#solutionCode', span: [0, 6] },
          motivo: 'remover a construção',
          acao: 'REWRITE_IN_BUDGET',
          resultado_esperado: 'verificador verde',
        },
      ],
    });
    const { papeis: p2, chamadas: c2 } = papeis(acoes);
    const saida = await p2.planejar(entradaDoPlanejador);
    assert.equal(saida.acoes.length, 1);
    assert.equal(c2[0].req.modelId, 'autor-x');

    const { papeis: p3, chamadas: c3 } = papeis(JSON.stringify({ delta: [{ inicio: 0, fim: 6, substituicao: 'valor' }] }));
    const correcao = await p3.corrigir(entradaDoCorretor);
    assert.ok('delta' in correcao && correcao.delta.length === 1);
    assert.equal(c3[0].req.modelId, 'autor-x');
  });

  it('saída não-JSON em QUALQUER papel → erro LACO_PAPEL_INVALIDO (nunca veredito por omissão)', async () => {
    const { papeis: p } = papeis('isto não é json');
    for (const chamada of [
      () => p.revisar(entradaDeRevisao),
      () => p.planejar(entradaDoPlanejador),
      () => p.corrigir(entradaDoCorretor),
    ]) {
      await assert.rejects(chamada(), (e: unknown) => (e as { code?: string }).code === 'LACO_PAPEL_INVALIDO');
    }
  });

  it('schema inválido rejeita: ação fora do catálogo fechado e revisão violando o RevisaoSchema', async () => {
    const acoesRuins = JSON.stringify({
      acoes: [
        {
          posicao: 0,
          apontamento_id: 'MEC-0001',
          alvo: { arquivo: 'x#solutionCode', span: [0, 6] },
          motivo: 'ação inventada',
          acao: 'INVENTEI_UMA_ACAO',
          resultado_esperado: 'x',
        },
      ],
    });
    const { papeis: p } = papeis(acoesRuins);
    await assert.rejects(
      p.planejar(entradaDoPlanejador),
      (e: unknown) => (e as { code?: string }).code === 'LACO_PAPEL_INVALIDO',
    );

    const { papeis: p2 } = papeis(JSON.stringify({ artefato: 'x' }));
    await assert.rejects(
      p2.revisar(entradaDeRevisao),
      (e: unknown) => (e as { code?: string }).code === 'LACO_PAPEL_INVALIDO',
    );
  });

  it('corretor: rejeição com justificativa curta e delta malformado são erro estruturado', async () => {
    const rejeicaoCurta = JSON.stringify({ rejeitado: true, justificativa: 'curta' });
    const { papeis: p } = papeis(rejeicaoCurta);
    await assert.rejects(
      p.corrigir(entradaDoCorretor),
      (e: unknown) => (e as { code?: string }).code === 'LACO_PAPEL_INVALIDO',
    );

    const rejeicaoValida = JSON.stringify({
      rejeitado: true,
      justificativa: 'a correção não pode ser feita sem quebrar o contrato público do módulo envolvido',
    });
    const { papeis: p2 } = papeis(rejeicaoValida);
    const r = await p2.corrigir(entradaDoCorretor);
    assert.ok('rejeitado' in r && r.rejeitado === true);

    const deltaRuim = JSON.stringify({ delta: [{ inicio: 'x', fim: 1 }] });
    const { papeis: p3 } = papeis(deltaRuim);
    await assert.rejects(
      p3.corrigir(entradaDoCorretor),
      (e: unknown) => (e as { code?: string }).code === 'LACO_PAPEL_INVALIDO',
    );
  });
});

// ---------------------------------------------------------------------------
// 4. O bridge da F10 (criarRevisaoDaFiacao)
// ---------------------------------------------------------------------------

describe('criarRevisaoDaFiacao — o laço REAL sobre os drafts, com as deps da fiação', () => {
  it('monta o ContextoDoLaco (artefatos por ref, trilha do run.json) e devolve a contagem de rodadas', async () => {
    const dir = await tmp();
    try {
      const run = criarRun({
        slug: 'cx-run-teste',
        budgetHash: sha256Hex(''),
        graphHash: sha256Hex(''),
        modelosPorEtapa: {},
        promptVersao: '1.0.0',
        catalogoVersao: '1.0.0',
      });
      await salvarRun(dir, run);
      await fsp.mkdir(path.join(dir, DIR_ARTEFATOS), { recursive: true });
      await fsp.writeFile(path.join(dir, DIR_ARTEFATOS, ARTEFATO_NOS), JSON.stringify([noAtomico('abelha')]));

      let contextoVisto: ContextoDoLaco | null = null;
      const revisao = criarRevisaoDaFiacao({
        llm: { revisar: async () => revisaoVazia(), planejar: async () => ({ acoes: [] }), corrigir: async () => ({ rejeitado: false, delta: [] }) },
        modeloAutor: 'autor-x',
        modeloRevisor: 'revisor-y',
        prover: async () => ({ valid: true, failures: [], declared: 1, executed: 1 }),
        rodarLaco: (async (ctx: ContextoDoLaco) => {
          contextoVisto = ctx;
          return { rodadas: [{}], paradaFinal: 'corrigido', acessado: true, artefatosFinais: ctx.artefatos };
        }) as never,
      });

      const r = await revisao.rodar({
        dir,
        freeze: freezeDe(['m1/abelha']),
        budget: budgetDe([{ ref: 'm1/abelha' }]),
        aulas: [{ ref: 'm1/abelha', aula: { slug: 'abelha' }, desafio: { slug: 'd1' } }] as unknown as ArtefatosDaRevisao['aulas'],
      });
      assert.deepEqual(r, { rodadas: 1 });
      assert.ok(contextoVisto !== null);
      const ctx = contextoVisto as unknown as ContextoDoLaco;
      assert.equal(ctx.trilha, 'cx-run-teste');
      assert.deepEqual(
        ctx.artefatos.map((a) => a.caminho),
        [caminhoDraftAula('m1/abelha'), caminhoDraftDesafio('m1/abelha')],
      );
    } finally {
      await fsp.rm(dir, { recursive: true, force: true });
    }
  });

  it('LIMITE: run sem artefato F2 → ErroGeracao ARTEFATO_AUSENTE (nunca silêncio)', async () => {
    const dir = await tmp();
    try {
      await salvarRun(
        dir,
        criarRun({
          slug: 'cx-run-teste',
          budgetHash: sha256Hex(''),
          graphHash: sha256Hex(''),
          modelosPorEtapa: {},
          promptVersao: '1.0.0',
          catalogoVersao: '1.0.0',
        }),
      );
      const revisao = criarRevisaoDaFiacao({
        llm: { revisar: async () => revisaoVazia(), planejar: async () => ({ acoes: [] }), corrigir: async () => ({ rejeitado: false, delta: [] }) },
        modeloAutor: 'autor-x',
        modeloRevisor: 'revisor-y',
        prover: async () => ({ valid: true, failures: [], declared: 1, executed: 1 }),
      });
      await assert.rejects(
        revisao.rodar({ dir, freeze: freezeDe([]), budget: budgetDe([]), aulas: [] }),
        (e: unknown) => e instanceof ErroGeracao && e.code === 'ARTEFATO_AUSENTE',
      );
    } finally {
      await fsp.rm(dir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// 5. A máquina de fases (gerarTrilha) — run.json, retomada, portões e falhas
// ---------------------------------------------------------------------------

describe('gerarTrilha — a máquina de estados do runState dirigida pela fiação', () => {
  it('run completo com fases fake: 13 fases done, ledger com a sequência pinada, retomada idempotente', async () => {
    const dir = await tmp();
    const dirProduto = await tmp();
    try {
      const linhas: string[] = [];
      const r = await gerarTrilha(
        depsDeGeracao(dir, dirProduto, { faseOverride: fasesNoOp(), onEvento: (l) => linhas.push(l) }),
        comandos(),
      );
      assert.equal(r.slug, 'cx-run-teste');
      assert.equal(r.concluido, true);
      assert.equal(r.faseAtual, 'F12');
      assert.equal(r.destino, dirProduto);
      assert.deepEqual(r.limitacoes, []);
      assert.ok(r.runId.length > 0);
      assert.ok(linhas.every((l) => l.startsWith(`[${r.runId}]`)));

      const eventos = await eventosDoLedger(dir);
      assert.equal(eventos[0].tipo, 'run_criado');
      assert.deepEqual(
        eventos.slice(1).map((e) => e.tipo),
        FASES_ORDEM.flatMap((f) => ['fase_iniciada', 'fase_concluida']),
      );
      assert.deepEqual(eventos.slice(1).filter((e) => e.tipo === 'fase_concluida').map((e) => e.fase), [...FASES_ORDEM]);

      // RETOMADA de run concluído: nenhuma fase roda de novo (idempotente)
      const r2 = await gerarTrilha(depsDeGeracao(dir, dirProduto, { faseOverride: fasesNoOp() }), comandos());
      assert.equal(r2.runId, r.runId);
      assert.equal(r2.concluido, true);
      const eventos2 = await eventosDoLedger(dir);
      assert.equal(eventos2.length, eventos.length, 'nenhum evento novo — nada a executar');
    } finally {
      await fsp.rm(dir, { recursive: true, force: true });
      await fsp.rm(dirProduto, { recursive: true, force: true });
    }
  });

  it('RETOMADA_INCOMPATIVEL × SEM_RUN_PARA_RETOMAR: --from nunca salta fase', async () => {
    const dir = await tmp();
    try {
      // sem run: --from que não seja F0 exige run existente
      await assert.rejects(
        gerarTrilha(depsDeGeracao(dir, await tmp(), { faseOverride: fasesNoOp() }), comandos({ from: 'F5' })),
        (e: unknown) => e instanceof ErroGeracao && e.code === 'SEM_RUN_PARA_RETOMAR',
      );

      // run com F0 concluída: --from F3 não casa com a pendente (F1)
      let run = criarRun({
        slug: 'cx-run-teste',
        budgetHash: sha256Hex(''),
        graphHash: sha256Hex(''),
        modelosPorEtapa: {},
        promptVersao: '1.0.0',
        catalogoVersao: '1.0.0',
      });
      run = concluirFase(iniciarFase(run, 'F0'), 'F0');
      await salvarRun(dir, run);
      await assert.rejects(
        gerarTrilha(depsDeGeracao(dir, await tmp(), { faseOverride: fasesNoOp() }), comandos({ from: 'F3' })),
        (e: unknown) => e instanceof ErroGeracao && e.code === 'RETOMADA_INCOMPATIVEL',
      );
    } finally {
      await fsp.rm(dir, { recursive: true, force: true });
    }
  });

  it('PORTÃO F6: --from F7+ exige o marker ANTES de qualquer autoria; aprovado, a retomada segue', async () => {
    const dir = await tmp();
    const dirProduto = await tmp();
    try {
      let run = criarRun({
        slug: 'cx-run-teste',
        budgetHash: sha256Hex(''),
        graphHash: sha256Hex(''),
        modelosPorEtapa: {},
        promptVersao: '1.0.0',
        catalogoVersao: '1.0.0',
      });
      for (const fase of FASES_ORDEM.slice(0, 7) as FaseId[]) {
        run = concluirFase(iniciarFase(run, fase), fase);
      }
      await salvarRun(dir, run);

      // marker ausente → F6_NAO_APROVADO, e NENHUMA fase F7+ executa
      await assert.rejects(
        gerarTrilha(depsDeGeracao(dir, dirProduto, { faseOverride: fasesNoOp() }), comandos({ from: 'F7' })),
        (e: unknown) => e instanceof ErroGeracao && e.code === 'F6_NAO_APROVADO',
      );

      // marker aprovado → a retomada de F7 conclui o run
      await fsp.writeFile(path.join(dir, ARQUIVO_APROVACAO_F6), JSON.stringify({ aprovado: true }));
      const r = await gerarTrilha(depsDeGeracao(dir, dirProduto, { faseOverride: fasesNoOp() }), comandos({ from: 'F7' }));
      assert.equal(r.concluido, true);
    } finally {
      await fsp.rm(dir, { recursive: true, force: true });
      await fsp.rm(dirProduto, { recursive: true, force: true });
    }
  });

  it('TOKENS_ESGOTADOS: o teto é checado na ENTRADA da fase, com checkpoint e run intacto', async () => {
    const dir = await tmp();
    try {
      await assert.rejects(
        gerarTrilha(depsDeGeracao(dir, await tmp(), { faseOverride: fasesNoOp() }), comandos({ tetoTokens: 0 })),
        (e: unknown) => e instanceof ErroGeracao && e.code === 'TOKENS_ESGOTADOS',
      );
      const eventos = await eventosDoLedger(dir);
      assert.ok(eventos.some((e) => e.tipo === 'checkpoint'));
      const run = await lerRun(dir);
      assert.equal(run.fases.F0, 'pendente', 'a fase nem inicia — a retomada herda o consumo registrado');
    } finally {
      await fsp.rm(dir, { recursive: true, force: true });
    }
  });

  it('SEM_CHAVE × FASE_FALHOU: falha de fase vira erro estruturado + checkpoint + fase em_andamento (retomável)', async () => {
    for (const [codigo, esperado] of [
      [LLM_ERROR_CODES.KEY_MISSING, 'SEM_CHAVE'],
      ['OUTRO_ERRO_QUALQUER', 'FASE_FALHOU'],
    ] as const) {
      const dir = await tmp();
      try {
        const overrides = fasesNoOp();
        overrides.F0 = async () => {
          throw Object.assign(new Error('falha de fixture'), { code: codigo });
        };
        await assert.rejects(
          gerarTrilha(depsDeGeracao(dir, await tmp(), { faseOverride: overrides }), comandos()),
          (e: unknown) => e instanceof ErroGeracao && e.code === esperado && e.fase === 'F0',
        );
        const eventos = await eventosDoLedger(dir);
        assert.equal(eventos[eventos.length - 1].tipo, 'checkpoint');
        const run = await lerRun(dir);
        assert.equal(run.fases.F0, 'em_andamento', 'checkpoint + run.json intacto: a retomada reexecuta SÓ ela');
      } finally {
        await fsp.rm(dir, { recursive: true, force: true });
      }
    }
  });

  it('lerAprovacaoF6 (default): marker ausente/inválido/ok, exatamente como o contrato do P-25', async () => {
    const dir = await tmp();
    try {
      const gerador = new GeradorDeTrilha(depsDeGeracao(dir, await tmp()), comandos());
      const ausente = await gerador.lerAprovacaoF6();
      assert.equal(ausente.aprovado, false);
      assert.match(ausente.parecer ?? '', /marker ausente/);

      await fsp.writeFile(path.join(dir, ARQUIVO_APROVACAO_F6), JSON.stringify({ aprovado: true, parecer: 'ok do humano' }));
      assert.deepEqual(await gerador.lerAprovacaoF6(), { aprovado: true, parecer: 'ok do humano' });

      await fsp.writeFile(path.join(dir, ARQUIVO_APROVACAO_F6), '{ quebrou');
      await assert.rejects(
        gerador.lerAprovacaoF6(),
        (e: unknown) => e instanceof ErroGeracao && e.code === 'F6_NAO_APROVADO',
      );
    } finally {
      await fsp.rm(dir, { recursive: true, force: true });
    }
  });
});
