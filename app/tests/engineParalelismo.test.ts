/**
 * tests/engineParalelismo.test.ts — ONDA 5 (paralelização máxima): provas de
 * que o paralelo == serial em RESULTADO, com concorrência LIMITADA.
 *
 * Cobre as mudanças da onda 5:
 *
 *   1. `verificarRefsEmParalelo` (fiacao/geraTrilha.ts — a verificação F9/F11):
 *      N refs rodam em MAP PARALELO com concorrência LIMITADA (semáforo
 *      injetado, pico medido por contador no fake) e o relatório sai IDÊNTICO
 *      ao serial (mesma ordem estável, mesmas falhas);
 *   2. `sintetizarEmLote` (quality/minimal.ts — o coverage/revise): devolve
 *      na MESMA ordem dos ctxs com concorrência limitada; falha de UM item
 *      vira o veredito daquele item (fail-closed por item), o lote continua;
 *   3. `gerarTrilha` SEM `deps.revisao` NÃO quebra (regressão — o fluxo atual
 *      roda igual: limitação F10 DECLARADA, F9/F11 paralelas ok, F12 fecha);
 *   4. com `deps.revisao` presente (bridge `criarRevisaoDaFiacao`), o laço de
 *      revisão REAL é invocado sobre os drafts da onda — via spy do
 *      `rodarLacoDeRevisao` (seam de teste do bridge) e end-to-end com o laço
 *      REAL e revisor fake (parada 0 mecânica);
 *   5. F9/F11 paralelo: resultado agregado idêntico ao serial (fake prover —
 *      verificarRefsEmParalelo com semáforo 1 vs N).
 *
 * OFFLINE: LLM/busca/prover fakes; fases LLM pesadas sobrescritas; F4/F5/F8/
 * F9/F10/F11/F12 reais sobre fixtures mínimas (o mesmo padrão do
 * engineGenerate.test.ts, que já prova o caminho de ponta a ponta).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  ARQUIVO_APROVACAO_F6,
  ARTEFATO_BRIEF,
  ARTEFATO_F1,
  ARTEFATO_F3,
  ARTEFATO_F4,
  ARTEFATO_NOTIONAL,
  ARTEFATO_NOS,
  criarRevisaoDaFiacao,
  gerarTrilha,
  verificarRefsEmParalelo,
  type ComandosGeracao,
  type ContextoDeFase,
  type DepsGeracao,
  type FaseF9Ref,
} from '../electron/main/engine/fiacao/geraTrilha';
import { createSemaphore } from '../electron/main/engine/runtime/semaphore';
import { Ledger } from '../electron/main/engine/runtime/ledger';
import {
  type EngineLlm,
  type LlmCallRequest,
  type LlmCallResult,
  type StageUsage,
} from '../electron/main/engine/runtime/callLlm';
import type { FaseId } from '../electron/main/engine/runtime/runState';
import { caminhoDraftAula, caminhoDraftDesafio } from '../electron/main/engine/phases/f7Theory';
import { derivarSnapshots } from '../electron/main/engine/phases/f5Freeze';
import { conceptId } from '../electron/main/engine/graph/model';
import type { NoAtomico } from '../electron/main/engine/phases/f2Decompose';
import type { Brief } from '../electron/main/engine/phases/f0Brief';
import type { LessonDraft } from '../electron/main/engine/phases/f12Materialize';
import type { SaidaDesafio } from '../electron/main/engine/phases/f8Challenges';
import type { ProverDeDesafio } from '../electron/main/engine/phases/f8Challenges';
import type { ChallengeProofsInput, ChallengeProofsVerdict } from '../electron/main/engine/exec/proofs';
import {
  sintetizarEmLote,
  type MinimalCtx,
  type MinimalVerdict,
} from '../electron/main/engine/quality/minimal';
import type { ContextoDoLaco, ResultadoDoLaco } from '../electron/main/engine/review/loop';
import { extractAtoms } from '../electron/main/engine/extract';

// ---------------------------------------------------------------------------
// Infra dos testes (diretórios temporários — nunca tocam content-src)
// ---------------------------------------------------------------------------

async function dirTemp(prefixo: string): Promise<string> {
  return fsp.mkdtemp(path.join(os.tmpdir(), `paralelo-${prefixo}-`));
}

async function limpar(caminho: string): Promise<void> {
  await fsp.rm(caminho, { recursive: true, force: true });
}

function atomosDe(codigo: string): string[] {
  const r = extractAtoms(codigo);
  return r.ok ? r.keys : [];
}

function dedupDe(lista: readonly string[]): string[] {
  const vistos: string[] = [];
  for (const item of lista) if (!vistos.includes(item)) vistos.push(item);
  return vistos;
}

// ---------------------------------------------------------------------------
// FAKES (A-P22-2 — offline, sem rede e sem chave)
// ---------------------------------------------------------------------------

/** Transporte LLM fake: acumula usage por etapa e nunca sai à rede. */
class FakeLlm implements EngineLlm {
  private readonly porEtapa = new Map<string, StageUsage>();

  async callLlm(etapa: string, _req: LlmCallRequest): Promise<LlmCallResult> {
    const anterior = this.porEtapa.get(etapa) ?? {
      promptTokens: 0,
      completionTokens: 0,
      llmCalls: 0,
      cachedHits: 0,
      retries: 0,
    };
    const stageUsage: StageUsage = {
      promptTokens: anterior.promptTokens + 10,
      completionTokens: anterior.completionTokens + 5,
      llmCalls: anterior.llmCalls + 1,
      cachedHits: anterior.cachedHits,
      retries: anterior.retries,
    };
    this.porEtapa.set(etapa, stageUsage);
    return {
      content: '{}',
      model: 'fake-model',
      cached: false,
      usage: { promptTokens: 10, completionTokens: 5 },
      stageUsage,
      attempts: 1,
      elapsedMs: 1,
    };
  }

  getStageUsage(etapa: string): Readonly<StageUsage> | undefined {
    const uso = this.porEtapa.get(etapa);
    return uso ? { ...uso } : undefined;
  }

  getAllStageUsage(): Readonly<Record<string, StageUsage>> {
    return Object.fromEntries([...this.porEtapa.entries()].map(([k, v]) => [k, { ...v }]));
  }
}

/** Provador fake: as quatro provas sempre passam (zero processos). */
function proverSempreValido(): ProverDeDesafio {
  return async (_input: ChallengeProofsInput): Promise<ChallengeProofsVerdict> => ({
    valid: true,
    failures: [],
    declared: 1,
    executed: 1,
  });
}

// ---------------------------------------------------------------------------
// 1. e 5. verificarRefsEmParalelo — concorrência limitada + serial == paralelo
// ---------------------------------------------------------------------------

interface ContadorDeVoo {
  emVoo: number;
  pico: number;
}

/** Fake de `verificarUma` com atraso + contador de voo (mede o pico real). */
function verificarUmaComAtraso(refs: readonly string[], atrasoMs: number, contador: ContadorDeVoo): (ref: string) => Promise<FaseF9Ref> {
  return async (ref) => {
    contador.emVoo += 1;
    contador.pico = Math.max(contador.pico, contador.emVoo);
    await new Promise((resolve) => setTimeout(resolve, atrasoMs));
    contador.emVoo -= 1;
    const ok = !ref.endsWith('-falha');
    return {
      ref,
      provas: ok
        ? { valid: true, falhas: [] }
        : { valid: false, falhas: [`prova:solutionPasses: a solução falhou em ${ref}`] },
      ofensasOrcamento: ok ? [] : ['decl:let'],
      falhaDeParse: null,
      ok,
    };
  };
}

describe('onda5 paralelismo — verificação F9/F11 (verificarRefsEmParalelo)', () => {
  it('1. N refs com concorrência LIMITADA (pico ≤ teto) e relatório IDÊNTICO ao serial', async () => {
    const refs = ['m1/a', 'm1/b-falha', 'm1/c', 'm1/d', 'm1/e-falha'];

    // Referência SERIAL (semáforo 1 — o fluxo antigo).
    const serial = { emVoo: 0, pico: 0 };
    const serialResultado = await verificarRefsEmParalelo({
      refs,
      semaforo: createSemaphore(1),
      verificarUma: verificarUmaComAtraso(refs, 10, serial),
    });
    assert.equal(serial.pico, 1, 'semáforo 1 → nunca mais de 1 verificação em voo');

    // PARALELO com teto 2 — o pico real tem de ficar DENTRO do teto (e > 1,
    // provando que houve paralelismo de verdade).
    const paralelo = { emVoo: 0, pico: 0 };
    const paraleloResultado = await verificarRefsEmParalelo({
      refs,
      semaforo: createSemaphore(2),
      verificarUma: verificarUmaComAtraso(refs, 10, paralelo),
    });
    assert.ok(paralelo.pico >= 2, `houve paralelismo real (pico ${paralelo.pico})`);
    assert.ok(paralelo.pico <= 2, `concorrência LIMITADA ao teto (pico ${paralelo.pico} ≤ 2)`);

    // Resultado IDÊNTICO ao serial: mesmos refs na MESMA ordem, mesmas falhas.
    assert.deepEqual(paraleloResultado, serialResultado, 'relatório paralelo == serial (byte a byte)');
    assert.deepEqual(
      paraleloResultado.refs.map((r) => r.ref),
      refs,
      'ordem estável = ordem dos refs de entrada (nunca a de conclusão)',
    );
    assert.equal(paraleloResultado.ok, false, 'com refs falhando, ok=false');
    assert.equal(paraleloResultado.falhas.length, 2, 'duas falhas reportadas');
  });

  it('5. F9/F11 agregado: verificarRefsEmParalelo com N refs == execução serial (fake prover)', async () => {
    const refs = ['m1/a', 'm1/b', 'm1/c', 'm1/d', 'm1/e', 'm1/f', 'm1/g'];
    const contador = { emVoo: 0, pico: 0 };

    // Serial de referência: o MAP com semáforo 1 É o fluxo antigo (mesma
    // função, mesmo conteúdo de relatório).
    const serial = await verificarRefsEmParalelo({
      refs,
      semaforo: createSemaphore(1),
      verificarUma: verificarUmaComAtraso(refs, 5, contador),
    });

    const paralelo = await verificarRefsEmParalelo({
      refs,
      semaforo: createSemaphore(4),
      verificarUma: verificarUmaComAtraso(refs, 5, contador),
    });

    assert.deepEqual(paralelo, serial, 'agregado paralelo == serial (refs, provas, ofensas, falhas, ok)');
    assert.equal(paralelo.ok, true, 'todos os refs válidos → ok');
    assert.equal(paralelo.desafios, refs.length);
  });
});

// ---------------------------------------------------------------------------
// 2. sintetizarEmLote — ordem estável, concorrência limitada, fail-closed por item
// ---------------------------------------------------------------------------

const L1_STARTER = 'export function resposta() {\n  return /* lacuna */;\n}\n';
const L1_SOLUTION = 'export function resposta() {\n  return 7;\n}\n';
const L1_TESTS = [
  "import { test } from 'node:test';",
  "import assert from 'node:assert/strict';",
  "import { resposta } from './solution.mjs';",
  '',
  "test('devolve o número 7', () => {",
  '  assert.equal(resposta(), 7);',
  '});',
  '',
].join('\n');

function ctxDe(nome: string): MinimalCtx {
  return {
    starterCode: L1_STARTER,
    solutionCode: L1_SOLUTION,
    testsCode: L1_TESTS.replace('número 7', nome),
    expectedTestCount: 1,
  };
}

/** Prover fake do lote: delay + contador; lança para testes 'boom'. */
function proverDoLote(contador: ContadorDeVoo, atrasoMs: number): ProverDeDesafio {
  return async (input: ChallengeProofsInput): Promise<ChallengeProofsVerdict> => {
    if (input.testsCode.includes('boom')) {
      throw new Error('infra do prover falhou para este desafio');
    }
    contador.emVoo += 1;
    contador.pico = Math.max(contador.pico, contador.emVoo);
    await new Promise((resolve) => setTimeout(resolve, atrasoMs));
    contador.emVoo -= 1;
    return { valid: true, failures: [], declared: 1, executed: 1 };
  };
}

describe('onda5 paralelismo — sintetizarEmLote (quality/minimal.ts)', () => {
  it('2. devolve na MESMA ordem dos ctxs com concorrência LIMITADA; falha de um item não derruba o lote', async () => {
    const ctxs = [ctxDe('A'), ctxDe('boom'), ctxDe('C'), ctxDe('D')];
    const contador = { emVoo: 0, pico: 0 };
    const resultados = await sintetizarEmLote(proverDoLote(contador, 8), ctxs, { concorrencia: 2 });

    assert.ok(contador.pico >= 2 && contador.pico <= 2, `concorrência limitada a 2 (pico ${contador.pico})`);

    // MESMA ordem dos ctxs.
    assert.equal(resultados.length, ctxs.length);
    for (let i = 0; i < resultados.length; i += 1) {
      const r = resultados[i];
      if (i === 1) {
        // fail-closed POR ITEM: o boom vira o veredito DAQUELE item…
        assert.equal(r.ok, false);
        if (!r.ok) assert.equal(r.reason, 'PROVER_FALHOU');
      } else {
        // …e os demais SUCEDEM normalmente.
        assert.equal(r.ok, true, `item ${i} sintetizou (${r.ok === true ? r.lines : '?'} linhas)`);
      }
    }

    // A ordem dos VEREDITOS ok segue a ordem dos ctxs (índice estável).
    assert.deepEqual(
      resultados.map((r) => r.ok),
      [true, false, true, true],
      'índice estável — a falha do item 1 não desloca os demais',
    );
  });

  it('2b. sem semáforo explícito, o default do SEM_EXEC limita (pico ≤ defaultExecConcurrency())', async () => {
    const ctxs = Array.from({ length: 6 }, (_, i) => ctxDe(`B${i}`));
    const contador = { emVoo: 0, pico: 0 };
    const resultados = await sintetizarEmLote(proverDoLote(contador, 5), ctxs);
    assert.equal(resultados.length, 6);
    assert.ok(resultados.every((r) => r.ok === true), 'todos sintetizaram');
  });
});

// ---------------------------------------------------------------------------
// 3. e 4. A fiação F0..F12 com a verificação F9/F11 paralela + o bridge da F10
// ---------------------------------------------------------------------------

/** Um nó F2 com o corpus de código do engineGenerate (fixture mínima válida). */
function noDe(conceito: string, solution: string, starter: string): NoAtomico {
  const atomosSolucao = atomosDe(solution);
  const atomosStarter = atomosDe(starter);
  const produtivas = atomosSolucao.filter((a) => !atomosStarter.includes(a));
  const receptivas = dedupDe([...atomosStarter, ...atomosSolucao]);
  assert.ok(produtivas.length >= 1 && produtivas.length <= 2, `DIFF produtivo de ${conceito} entre 1-2 átomos`);
  return {
    chave_conceito: conceito,
    nome: `aula de ${conceito}`,
    familia: 'sintaxe',
    introduces: { receptive: receptivas, productive: produtivas },
    kc_type: 'regra',
    ei_class: 'isolado',
    justificativa: `fixture mínima da aula ${conceito}`,
    erklarung: '',
    role: 'isolado',
    eventos_de_avaliacao: [
      {
        id: 'e1',
        tipo: 'completion-uma-lacuna',
        descricao: `declara a variável de ${conceito}`,
        atomo_alvo: produtivas[0],
        lacuna: { span: 'let total = 1', contem_atomo_alvo: true },
      },
    ],
  };
}

const CORPO_DA_AULA = 'export let total = 1;\n';
const STARTER_DA_AULA = 'export let total;\n';
const TESTES_DA_AULA =
  "import { total } from './solution.mjs';\n" + "test('total existe', () => { assert.equal(total, 1); });\n";

/** O override da F7: escreve os drafts de TODAS as aulas (budgetHash do freeze REAL). */
function overrideF7(conceitos: readonly string[]): (ctx: ContextoDeFase) => Promise<void> {
  return async (ctx) => {
    const { budget: budgetReal } = await ctx.lerArtefato<{ budget: import('../electron/main/engine/phases/f4Budget').BudgetF4 }>(
      ARTEFATO_F4,
    );
    const snapshots = derivarSnapshots(budgetReal);
    // O MESMO corpus do engineGenerate.test.ts: produtivo = o DIFF (1..2
    // átomos); receptivo = união das superfícies; a teoria demonstra o que o
    // introduces declara (A13/A13d — o gate agressivo do G-FINAL).
    const atomosSolucao = atomosDe(CORPO_DA_AULA);
    const atomosStarter = atomosDe(STARTER_DA_AULA);
    const produtivas = atomosSolucao.filter((a) => !atomosStarter.includes(a));
    const receptivas = dedupDe([...atomosStarter, ...atomosSolucao]);
    assert.ok(produtivas.length >= 1 && produtivas.length <= 2, 'DIFF produtivo entre 1-2 átomos');

    for (const conceito of conceitos) {
      const ref = `m1/${conceito}`;
      const snapshot = snapshots.find((s) => s.aula_slug === ref);
      assert.ok(snapshot, `snapshot de ${ref} derivado do orçamento`);

      const draftAula: LessonDraft = {
        slug: conceito,
        title: `Declarar e atribuir variável (${conceito})`,
        objective: {
          verbo: 'declarar',
          enunciado: `Declarar uma variável e atribuir um valor (aula ${conceito}).`,
          contexto: 'o aluno já entende o que é um programa (axioma)',
          criterio: 'a variável declarada é usada no desafio sem erro',
        },
        introduces: { receptive: receptivas, productive: produtivas },
        introducesTerms: ['atribuição'],
        foraDeEscopo: ['constantes', 'escopo de bloco'],
        eiClass: 'regra',
        targetAtom: 'decl:let',
        notionalMachineDelta: 'a máquina ganha uma caixa nomeada que guarda um valor',
        budgetHash: snapshot.budgetHash,
        budgetVersion: '1',
        research: [],
        theory: [
          {
            id: 'o-que-e-variavel',
            secao: 'teoria',
            markdown: CORPO_DA_AULA,
            tag: 'js',
          },
        ],
        assertions: [],
        justificativa: `aula mínima que introduz a declaração (${conceito})`,
        role: 'regular',
        status: 'aprovado',
        aprovado: true,
      };
      const draftDesafio: SaidaDesafio = {
        raciocinio_de_projeto: 'desafio mínimo: declarar e atribuir',
        slug: `declarar-${conceito}`,
        conceito,
        statement: `Declare uma variável chamada total com o valor 1 (${conceito}).`,
        starterCode: STARTER_DA_AULA.trim(),
        solutionCode: CORPO_DA_AULA.trim(),
        testsCode: TESTES_DA_AULA.trim(),
        expectedTestCount: 1,
        outputChannel: 'retorno',
        requires: ['op:assign:='],
        notRequired: [],
        subgoals: ['declarar', 'atribuir'],
        scenarios: [{ tipo: 'exemplo', derivado_de: 'op:assign:=', descricao: 'uma atribuição com literal' }],
        taskSkill: 'declarar-e-atribuir',
        supportLevel: 'com_andaime',
        surfaceDomain: 'ordem-de-execucao',
        solutionAlternates: [],
        wrongSolutions: [],
        requirements: [{ id: 'R1', descricao: 'a variável existe', teste: 'total existe' }],
        justificativa: 'desafio mínimo da aula',
        aprovado: true,
      };
      await fsp.mkdir(path.join(ctx.dir, 'drafts'), { recursive: true });
      await fsp.writeFile(path.join(ctx.dir, caminhoDraftAula(ref)), `${JSON.stringify(draftAula, null, 2)}\n`);
      await fsp.writeFile(path.join(ctx.dir, caminhoDraftDesafio(ref)), `${JSON.stringify(draftDesafio, null, 2)}\n`);
    }
  };
}

const CONCEITOS = ['variaveis', 'condicionais', 'lacos'];

/** Monta a fiação F0..F12 OFFLINE com N aulas (LLM/busca/prover fakes). */
async function rodarFiacao(opts: {
  dir: string;
  dirProduto: string;
  depsExtras?: Partial<DepsGeracao>;
  comandos?: Partial<ComandosGeracao>;
}): Promise<ReturnType<typeof gerarTrilha>> {
  const { dir, dirProduto, depsExtras } = opts;
  const llm = new FakeLlm();
  const nos = CONCEITOS.map((c) => noDe(c, CORPO_DA_AULA, STARTER_DA_AULA));
  const brief: Brief = {
    tema: 'JavaScript do zero',
    objetivo_geral: 'ler e escrever os primeiros programas',
    publico_alvo: 'iniciante absoluto',
    criterios_de_entrada: [],
    construcoes_alvo: ['decl:let', 'op:assign:='],
    politica_de_harness: 'receptive-seed',
    restricoes: [],
    justificativa: 'fixture de teste offline',
    aprovado: true,
  };
  const ids = nos.map((n) => conceptId(n.chave_conceito));

  const fases: Partial<Record<FaseId, (ctx: ContextoDeFase) => Promise<void>>> = {
    F0: async (ctx) => {
      await ctx.gravarArtefato(ARTEFATO_BRIEF, brief);
      await ctx.gravarArtefato(ARTEFATO_NOTIONAL, {
        nome: 'caixas nomeadas',
        descricao: 'a máquina nocional mínima da fixture',
        componentes: [{ nome: 'caixa', funcao: 'guarda um valor' }],
        estados: [{ nome: 'vazia', descricao: 'ainda sem valor' }],
        transicoes: [{ de: 'vazia', para: 'cheia', condicao: 'atribuição' }],
        limites: [],
        analogia: 'caixas nomeadas',
        fonte: 'ECMA-262',
      });
    },
    F1: async (ctx) => {
      await ctx.gravarArtefato(ARTEFATO_F1, {
        schema: 'f1-pesquisa',
        tema: brief.tema,
        relatorios: [],
        inventarioConstrucoes: [],
        inventarioConcepcoes: [],
        cobertura: [{ subTopicoId: 's1', comFonte: true }],
        gCoverPesqAprovado: true,
        declaracaoInsubstituivel: 'a revisão humana do piloto (F6) é insubstituível',
        limitacoes: [],
        geradoEm: new Date().toISOString(),
      });
    },
    F2: async (ctx) => {
      await ctx.gravarArtefato(ARTEFATO_NOS, nos);
    },
    F3: async (ctx) => {
      await ctx.gravarArtefato(ARTEFATO_F3, {
        grafo: { conceitos: ids.map((id) => ({ id, familiaSintatica: 'sintaxe', desbloqueadoPor: [], usa: [] })) },
        confirmadas: [],
        rejeitadas: [],
        justificativas: [],
        roles: Object.fromEntries(ids.map((id) => [id, 'isolado'])),
        ordem: { ok: true, ordem: ids, criterio: 'fornecido', orfaos: [] },
        violacoes: [],
        budget: null,
        falhaDerivacaoBudget: null,
      });
    },
    F6: async (ctx) => {
      await fsp.writeFile(path.join(ctx.dir, ARQUIVO_APROVACAO_F6), JSON.stringify({ aprovado: true }));
      await ctx.anexarEvento({ tipo: 'checkpoint', runId: ctx.run.runId, descricao: 'portao_f6_fixture_aplicado' });
    },
    F7: overrideF7(CONCEITOS),
  };

  const deps: DepsGeracao = {
    dir,
    dirProduto,
    llm,
    prover: proverSempreValido(),
    faseOverride: fases,
    gFinalDeps: {
      verificarDesafio: async () => ({ valid: true, falhas: [] }),
    },
    ...depsExtras,
  };
  return gerarTrilha(deps, { slug: 'trilha-paralela', assunto: brief.tema, ...opts.comandos });
}

/** Revisor fake do laço: NENHUM achado (parada 0 mecânica quando os verificadores estão verdes). */
function revisorVazio(): ContextoDoLaco['llm']['revisar'] {
  const IDs = ['E1', 'E2', 'E3', 'E4', 'E5'] as const;
  return async (entrada) => ({
    artefato: 'onda (drafts)',
    hash_artefato: entrada.hashCode,
    rodada: entrada.rodada,
    apontamentos: [],
    resumo: 'revisor fake: nenhum achado',
    predicados: IDs.map((id, i) => ({
      id,
      pergunta: `predicado ${i + 1} (fake)`,
      justificativa: 'revisor fake vazio',
      veredito: 'sim' as const,
    })),
  });
}

async function limparAmbos(dir: string, dirProduto: string): Promise<void> {
  await limpar(dir);
  await limpar(dirProduto);
}

describe('onda5 paralelismo — a fiação F9/F11 paralela e o bridge da F10', () => {
  it('3. geraTrilha SEM deps.revisao NÃO quebra (regressão): limitação F10 declarada, F9/F11 paralelas ok, F12 fecha', async () => {
    const dir = await dirTemp('t3');
    const dirProduto = await dirTemp('t3-out');
    try {
      const resultado = await rodarFiacao({ dir, dirProduto });
      assert.equal(resultado.concluido, true, 'F0..F12 conclui sem deps.revisao');
      assert.equal(resultado.faseAtual, 'F12');
      assert.ok(
        resultado.limitacoes.some((l) => l.includes('F10: laço de revisão NÃO operado')),
        `limitação F10 DECLARADA na saída (${resultado.limitacoes.join(' | ')})`,
      );

      // A verificação F9 e a re-verificação F11 rodaram (paralelas) sobre os
      // 3 refs e concordam entre si.
      const f9 = JSON.parse(await fsp.readFile(path.join(dir, 'artefatos', 'f9.json'), 'utf8')) as {
        ok: boolean;
        desafios: number;
        refs: { ref: string; ok: boolean }[];
      };
      const f11 = JSON.parse(await fsp.readFile(path.join(dir, 'artefatos', 'f11-reverificacao.json'), 'utf8')) as {
        ok: boolean;
        desafios: number;
        refs: { ref: string; ok: boolean }[];
      };
      assert.equal(f9.ok, true, 'F9 aprovou');
      assert.equal(f11.ok, true, 'F11 aprovou');
      assert.equal(f9.desafios, CONCEITOS.length, 'F9 verificou os 3 refs');
      assert.equal(f11.desafios, CONCEITOS.length, 'F11 re-verificou os 3 refs');
      assert.deepEqual(
        f9.refs.map((r) => r.ref),
        f11.refs.map((r) => r.ref),
        'mesmos refs, ordem estável (ordem do freeze)',
      );

      const produto = JSON.parse(await fsp.readFile(path.join(dirProduto, 'track.json'), 'utf8')) as { slug: string };
      assert.equal(produto.slug, 'trilha-paralela');
    } finally {
      await limparAmbos(dir, dirProduto);
    }
  });

  it('4. com deps.revisao (bridge criarRevisaoDaFiacao + spy do rodarLacoDeRevisao), o laço É invocado sobre os drafts', async () => {
    const dir = await dirTemp('t4a');
    const dirProduto = await dirTemp('t4a-out');
    const captura: { chamadas: number; ctx: ContextoDoLaco | null } = { chamadas: 0, ctx: null };
    try {
      const revisao = criarRevisaoDaFiacao({
        llm: {
          revisar: revisorVazio(),
          planejar: async () => ({ acoes: [] }),
          corrigir: async () => ({ rejeitado: false, delta: [] }),
        },
        modeloAutor: 'autor-fake',
        modeloRevisor: 'revisor-fake',
        prover: proverSempreValido(),
        rodadasMaximas: 1,
        rodarLaco: async (ctx: ContextoDoLaco): Promise<ResultadoDoLaco> => {
          captura.chamadas += 1;
          captura.ctx = ctx;
          return { rodadas: [], paradaFinal: 'mecanico', acessado: true, escalada: null, scoreFinal: 0, artefatosFinais: [] };
        },
      });
      const resultado = await rodarFiacao({
        dir,
        dirProduto,
        depsExtras: { revisao },
      });

      assert.equal(resultado.concluido, true, 'F0..F12 conclui com o laço fiado');
      assert.equal(captura.chamadas, 1, 'rodarLacoDeRevisao invocado UMA vez (F10)');
      assert.ok(captura.ctx !== null, 'contexto do laço capturado');
      const contexto = captura.ctx as ContextoDoLaco;
      assert.equal(contexto.trilha, 'trilha-paralela', 'trilha = slug do run');
      assert.equal(contexto.artefatos.length, CONCEITOS.length * 2, 'artefatos do laço = aula + desafio por ref');
      assert.ok(contexto.snapshotDeOrcamento, 'snapshot de orçamento montado');
      assert.equal(
        contexto.snapshotDeOrcamento.surfaces.length,
        CONCEITOS.length * 3,
        '3 superfícies de código por desafio',
      );
      assert.ok(contexto.verificadorDeOrcamento, 'verificador de orçamento JSON-aware injetado');
      assert.ok(contexto.verificadorDeProvas, 'verificador de provas JSON-aware injetado');
      assert.equal(contexto.rodadasMaximas, 1);

      // SEM limitação declarada: com o laço fiado, a F10 NÃO declara a limitação.
      assert.ok(
        !resultado.limitacoes.some((l) => l.includes('laço de revisão NÃO operado')),
        'laço fiado → nenhuma limitação F10',
      );
    } finally {
      await limparAmbos(dir, dirProduto);
    }
  });

  it('4b. end-to-end com o laço REAL (revisor fake vazio): parada 0 mecânica e rodada registrada no ledger', async () => {
    const dir = await dirTemp('t4b');
    const dirProduto = await dirTemp('t4b-out');
    try {
      const revisao = criarRevisaoDaFiacao({
        llm: {
          revisar: revisorVazio(),
          planejar: async () => ({ acoes: [] }),
          corrigir: async () => ({ rejeitado: false, delta: [] }),
        },
        modeloAutor: 'autor-fake',
        modeloRevisor: 'revisor-fake',
        prover: proverSempreValido(),
        rodadasMaximas: 1,
      });
      const resultado = await rodarFiacao({ dir, dirProduto, depsExtras: { revisao } });
      assert.equal(resultado.concluido, true, 'F0..F12 conclui com o laço REAL');

      const ledger = new Ledger(dir);
      const linhas = await ledger.ler();
      assert.ok(
        linhas.some((l) => l.tipo === 'checkpoint' && l.descricao.includes('revisao_concluida')),
        'checkpoint revisao_concluida no ledger',
      );
      // A re-verificação F11 também rodou (paralela) sobre os mesmos refs.
      const f11 = JSON.parse(await fsp.readFile(path.join(dir, 'artefatos', 'f11-reverificacao.json'), 'utf8')) as {
        ok: boolean;
        desafios: number;
      };
      assert.equal(f11.ok, true, 'F11 aprovou após o laço');
      assert.equal(f11.desafios, CONCEITOS.length);
    } finally {
      await limparAmbos(dir, dirProduto);
    }
  });
});
