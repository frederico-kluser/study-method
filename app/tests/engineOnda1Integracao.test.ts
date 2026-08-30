/**
 * tests/engineOnda1Integracao.test.ts — TESTES DE INTEGRAÇÃO entre os pacotes
 * da onda 1 da engine de trilhas.
 *
 * Escopo: os SEAMS entre pacotes da onda 0/1 (docs/16-engine-de-trilha.md),
 * NÃO os contratos individuais (cada pacote tem suíte própria:
 * engineCallLlm/engineScheduler/engineLedger/engineSchemas/engineForm/
 * engineVocab/engineGraph/engineExecProofs/engineBudgetGate). Cada caso aqui
 * cruza DOIS ou mais pacotes:
 *
 *   1. callLlm (runtime) × scheduler (runtime): UM semáforo serve ao
 *      transporte E aos limiters da onda — pico de concorrência do CONJUNTO
 *      respeita o teto (cronômetro fake, sem timers reais de negócio);
 *   2. callLlm × llmCache: stageVersion bumpar invalida; system diferente
 *      invalida (system entra na chave); etapa NÃO entra na chave;
 *   3. scheduler × runState/ledger: resultado da onda persistido no diretório
 *      de run e retomado — tarefas done não reexecutam, dependentes de done
 *      não reexecutam, cadeia do ledger segue íntegra;
 *   4. ledger: a cadeia é sha256(prev_hash + "\n" + corpo canônico) via as
 *      primitivas exportadas (sha256Hex/canonicalizarJson); anexos sequenciais
 *      mantêm a cadeia; runId OBRIGATÓRIO reprova na validação; adulteração e
 *      runId divergente quebram;
 *   5. schemas/artifacts × schemas/fieldOrder: registro real passa no lint;
 *      draft válido parseia; schema com decisão antes da justificativa
 *      REPROVA nomeando os campos;
 *   6. atomKeys (vocaB seed) × form/selector × form/rules: toda chave da
 *      HARNESS_RECEPTIVE_SEED casa ATOM_KEY_RE; as duas chaves form: da seed
 *      parseiam (parseFormKey) e compilam (buildFormRules) na bateria atual;
 *   7. exec/proofs × exec/harness: verifyChallengeProofs com env endurecido DE
 *      VERDADE (prepareIsolatedDir + escreverExitGuard + createHardenedExec em
 *      diretório temp, executor FAKE — A-P07-2): prova 1 exige consistência
 *      ESTRITA (skipped>0 ⇒ inválido) e o ÚLTIMO bloco spec vence
 *      (relatório forjado no stdout não passa);
 *   8. graph (model/dag/invariants): ciclo REAL fechado com caminho; DAG passa
 *      I1–I4 com ordenação; fechoTransitivoRedundante é puro (não muta o grafo);
 *   9. audit (onda 0) sobre trilha fixture em memória cujo `introduces`
 *      declarado inclui as FORMAS da seed: zero violações espúrias (modo
 *      declarado, gate não é ruído).
 *
 * REGRAS DE HIGIENE: aleatório zero, sem rede, sem processos reais — LLM e
 * execução são sempre fakes injetados; diretórios temporários criados e
 * removidos pelo próprio teste (try/finally). Execução real de `node --test`
 * NUNCA (A-P07-2).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fsPromises } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { z } from 'zod';

import { createCallLlm, type LlmCallRequest } from '../electron/main/engine/runtime/callLlm';
import { createSemaphore, type Semaphore } from '../electron/main/engine/runtime/semaphore';
import { createInMemoryCacheStore } from '../electron/main/engine/runtime/llmCache';
import {
  runWave,
  type RateLimiter,
  type RateLimiters,
  type SchedulerEnv,
  type Executor,
  type WaveResult,
} from '../electron/main/engine/runtime/scheduler';
import type { Task } from '../electron/main/engine/runtime/task';
import { criarRun, lerRun, lerArquivoOuVazio, salvarRun, escreverAtomico } from '../electron/main/engine/runtime/runState';
import {
  Ledger,
  LedgerError,
  canonicalizarJson,
  montarCadeia,
  sha256Hex,
  verificarCadeia,
  type EventoNovo,
} from '../electron/main/engine/runtime/ledger';
import {
  SCHEMA_REGISTRY,
  LessonDraftSchema,
  type SchemaRegistrado,
} from '../electron/main/engine/schemas/artifacts';
import {
  garantirSchemasValidos,
  formatarErroCampos,
  lintOrdemCampos,
  lintSchemasDaEngine,
} from '../electron/main/engine/schemas/fieldOrder';
import { ATOM_KEY_RE, HARNESS_RECEPTIVE_SEED, isAtomKey } from '../electron/main/engine/atomKeys';
import { buildFormRules, FORM_RULES } from '../electron/main/engine/form/rules';
import { parseFormKey } from '../electron/main/engine/form/selector';
import {
  verifyChallengeProofs,
  type ChallengeProofsInput,
  type ExecFn,
  type ExecResult,
  type ProofEnv,
} from '../electron/main/engine/exec/proofs';
import {
  EXIT_GUARD_SOURCE,
  cleanupDir,
  createHardenedExec,
  createSemaphore as harnessCreateSemaphore,
  escreverExitGuard,
  prepareIsolatedDir,
} from '../electron/main/engine/exec/harness';
import { conceptId, type Concept, type ConceptGraph, type ConceptId } from '../electron/main/engine/graph/model';
import { fechoTransitivoRedundante, toposort } from '../electron/main/engine/graph/dag';
import { checkInvariants, type VisaoDeEnsino } from '../electron/main/engine/graph/invariants';
import { auditTrack } from '../electron/main/engine/audit';
import { deriveTrackBudget } from '../electron/main/engine/budget';
import type { LoadedLesson, LoadedModule, LoadedTrack } from '../electron/main/content/trackLoader';
import type { TrackChallengeSource, TrackTheorySection } from '../electron/main/content/trackTypes';
import type {
  DeepSeekChatRequest,
  DeepSeekChatResponse,
  DeepSeekClient,
} from '../electron/main/services/deepseekClient';

// ---------------------------------------------------------------------------
// Fakes e helpers compartilhados (PURAS — sem IO, sem rede, sem processo)
// ---------------------------------------------------------------------------

function okResponse(promptTokens = 10, completionTokens = 5): DeepSeekChatResponse {
  return {
    content: '{"ok":true}',
    model: 'deepseek-v4-flash',
    usage: { promptTokens, completionTokens },
  };
}

/** Requisição base de etapa — timeout alto por default (o teste reduz quando precisa). */
function baseReq(over: Partial<LlmCallRequest> = {}): LlmCallRequest {
  return {
    prompt: 'gere o artefato',
    stageVersion: 'v1',
    timeoutMs: 60_000,
    ...over,
  };
}

/** Cliente fake que conta chamadas e mede o pico de chamadas em voo. */
function makeFakeClient(
  respond: (req: DeepSeekChatRequest, callIndex: number) => Promise<unknown> | unknown,
): { client: DeepSeekClient; calls: DeepSeekChatRequest[]; peak: () => number } {
  const calls: DeepSeekChatRequest[] = [];
  let inflight = 0;
  let peakSeen = 0;
  return {
    calls,
    peak: () => peakSeen,
    client: {
      async chatCompletion(req: DeepSeekChatRequest): Promise<DeepSeekChatResponse> {
        calls.push(req);
        inflight += 1;
        if (inflight > peakSeen) peakSeen = inflight;
        try {
          return (await respond(req, calls.length - 1)) as DeepSeekChatResponse;
        } finally {
          inflight -= 1;
        }
      },
    },
  };
}

/** Espera uma condição no event loop sem timer de negócio (só microtasks/setImmediate). */
async function until(cond: () => boolean, oQue: string): Promise<void> {
  for (let i = 0; i < 50_000 && !cond(); i += 1) {
    await new Promise<void>((res) => setImmediate(res));
  }
  assert.ok(cond(), oQue);
}

/**
 * A PONTE do seam testado: Semaphore (P-01, acquire→release-fn) → RateLimiter
 * (P-02, acquire/release). Cada acquire guarda a fn de liberação do slot e o
 * release consome uma (1:1 com os acquires — a contagem do semáforo é
 * conservada; slots são fungíveis para fins de teto de concorrência).
 */
function rateLimiterDoSemaphore(s: Semaphore): RateLimiter {
  const slots: Array<() => void> = [];
  return {
    async acquire(): Promise<void> {
      slots.push(await s.acquire());
    },
    release(): void {
      const liberar = slots.shift();
      if (liberar) liberar();
    },
  };
}

function task(over: Partial<Task> & { id: string }): Task {
  return {
    fase: 'F7',
    deps: [],
    recurso: 'cpu',
    cacheKey: `key-${over.id}`,
    outputs: [],
    writes: [],
    status: 'pending',
    ...over,
  };
}

function mkdirTemp(prefix: string): Promise<string> {
  return fsPromises.mkdtemp(path.join(os.tmpdir(), prefix));
}

// Fixtures de trilha (P-00/onda 0 — audit) — mesmo formato dos testes do gate.
function theory(id: string, markdown: string, code?: string): TrackTheorySection {
  return {
    id,
    title: id,
    markdown,
    ...(code ? { code: { language: 'javascript', code } } : {}),
  };
}

function challenge(slug: string, over: Partial<TrackChallengeSource> = {}): TrackChallengeSource {
  return {
    schemaVersion: 1,
    slug,
    title: slug,
    concept: 'conceito',
    difficulty: 1,
    language: 'nodejs',
    statement: `# ${slug}`,
    starterCode: 'export function f() {\n}\n',
    testsCode:
      "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { f } from './solution.mjs';\ntest('ok', () => { assert.equal(f(), 'a'); });\n",
    solutionCode: "export function f() {\n  return 'a';\n}\n",
    expectedTestCount: 1,
    ...over,
  };
}

function lesson(
  slug: string,
  sections: TrackTheorySection[],
  challenges: TrackChallengeSource[],
  concepts: string[] = ['conceito'],
): LoadedLesson {
  return {
    meta: {
      schemaVersion: 1,
      slug,
      title: slug,
      summary: slug,
      difficulty: 1,
      concepts,
      prerequisites: [],
      theory: sections,
      sources: [],
      challenges: challenges.map((c) => c.slug),
    },
    challenges,
  };
}

function moduleOf(slug: string, order: number, lessons: LoadedLesson[]): LoadedModule {
  return {
    meta: { schemaVersion: 1, slug, title: slug, order, lessons: lessons.map((l) => l.meta.slug) },
    lessons,
    challenge: null,
  };
}

function trackOf(modules: LoadedModule[]): LoadedTrack {
  return {
    root: {
      schemaVersion: 1,
      slug: 'fixture',
      title: 'fixture',
      description: 'fixture',
      language: 'pt-BR',
      domain: 'programming',
      modules: modules.map((m) => m.meta.slug),
    },
    modules,
    proficiency: null,
    dir: '/tmp/fixture',
  };
}

// ---------------------------------------------------------------------------
// 1. callLlm × scheduler — UM semáforo para o transporte E para a onda
// ---------------------------------------------------------------------------

describe('onda 1: callLlm × scheduler — semáforo único', () => {
  it('um createSemaphore(2) serve ao transporte E aos limiters: pico do CONJUNTO ≤ 2', async () => {
    const shared = createSemaphore(2);
    const clock = { agora: 0 };
    // Transporte: cada ida fica PENDENTE até o teste liberar (cronômetro fake:
    // cada liberação avança o relógio em +100 — o elapsedMs observado é o
    // avanço exato, sem timers reais).
    const pendentes: Array<() => void> = [];
    const client: DeepSeekClient = {
      chatCompletion(_req: DeepSeekChatRequest): Promise<DeepSeekChatResponse> {
        return new Promise<DeepSeekChatResponse>((resolve) => {
          pendentes.push(() => {
            clock.agora += 100;
            resolve(okResponse());
          });
        });
      },
    };
    const llm = createCallLlm({
      client,
      apiKey: async () => 'sk-teste',
      semaphore: shared,
      now: () => clock.agora,
      log: () => {},
    });

    // Tarefas da onda (cpu): seguram o slot do limiter até o teste liberar a
    // comporta — é o lado "limiters" do pool compartilhado.
    const execCalls: string[] = [];
    const gates: Array<() => void> = [];
    const execute: Executor = async (t) => {
      execCalls.push(t.id);
      await new Promise<void>((resolve) => gates.push(resolve));
      return { ok: true };
    };

    const limiters: RateLimiters = {
      llm: rateLimiterDoSemaphore(shared),
      exec: rateLimiterDoSemaphore(shared),
      cpu: rateLimiterDoSemaphore(shared),
    };
    const env: SchedulerEnv = { limiters, execute };

    let maxAtivo = 0;
    let pronto = false;
    const amostrador = (async () => {
      while (!pronto) {
        maxAtivo = Math.max(maxAtivo, shared.active);
        await new Promise<void>((r) => setImmediate(r));
      }
    })();

    try {
      const pRun: Promise<WaveResult> = runWave(
        { tasks: [task({ id: 't1' }), task({ id: 't2' })], reducers: {} },
        env,
      );

      // As DUAS tarefas da onda ocupam os 2 slots (limiters) e ficam vivas —
      // o pool não tem vaga para mais nada.
      await until(() => shared.active === 2 && gates.length === 2, 'onda com 2 tarefas em voo (2 slots)');

      // Três chamadas de transporte diretas entram NA MESMA fila do semáforo:
      // só progridem quando um slot da onda é liberado.
      const prs = [1, 2, 3].map((i) => llm.callLlm('F7', { ...baseReq(), prompt: `transporte-${i}` }));
      await until(() => shared.active === 2 && pendentes.length === 0, 'transporte enfileirado atrás dos slots ocupados');
      assert.equal(prs.length, 3);

      // Libera UMA tarefa da onda → o slot vai para o transporte 1 → CPU e
      // LLM CONCORRENTES no mesmo pool (exatamente 2), sem nunca furar o teto.
      gates.shift()!();
      await until(() => pendentes.length === 1, 'transporte 1 no ar com a tarefa 2 ainda viva');
      assert.equal(gates.length, 1, 'tarefa 2 da onda continua em voo');
      assert.equal(shared.active, 2, 'onda (1) + transporte (1) = 2 slots');

      const transporte1 = pendentes.shift();
      assert.ok(transporte1);
      transporte1(); // cronômetro +100
      const r1 = await prs[0];
      // startedAt é capturado na criação da chamada (todas nasceram com o
      // relógio em 0) — o elapsed é o avanço ACUMULADO até a liberação.
      assert.equal(r1.elapsedMs, 100);

      // Idem para os outros dois; a tarefa 2 da onda segue presa ao outro slot.
      await until(() => pendentes.length === 1, 'transporte 2 no ar');
      pendentes.shift()!();
      const r2 = await prs[1];
      assert.equal(r2.elapsedMs, 200);

      await until(() => pendentes.length === 1, 'transporte 3 no ar');
      pendentes.shift()!();
      const r3 = await prs[2];
      assert.equal(r3.elapsedMs, 300);

      gates.shift()!(); // libera a segunda tarefa da onda
      const resultado = await pRun;
      assert.deepEqual([...resultado.executed].sort(), ['t1', 't2']);
      assert.deepEqual(resultado.skipped, []);
      // O teto foi EFETIVAMENTE alcançado (o pool constrangeu) e nunca furado.
      assert.equal(maxAtivo, 2);
      assert.ok(maxAtivo <= 2);
      assert.deepEqual([...execCalls].sort(), ['t1', 't2']);
    } finally {
      pronto = true;
      await amostrador;
    }
  });
});

// ---------------------------------------------------------------------------
// 2. callLlm × llmCache — invalidação por stageVersion/system; etapa fora da chave
// ---------------------------------------------------------------------------

describe('onda 1: callLlm × llmCache — identidade do artefato', () => {
  it('bump de stageVersion invalida; system diferente invalida; etapa NÃO entra na chave', async () => {
    const fake = makeFakeClient(() => okResponse());
    const store = createInMemoryCacheStore();
    const llm = createCallLlm({ client: fake.client, apiKey: async () => 'sk-teste', cache: store, log: () => {} });

    const reqBase = { ...baseReq(), prompt: 'mesmo prompt' };

    // 1ª ida: miss.
    const r1 = await llm.callLlm('F7', reqBase);
    assert.equal(r1.cached, false);

    // Mesma entrada, mesma etapa: acerto — UMA ida ao provedor.
    const r2 = await llm.callLlm('F7', reqBase);
    assert.equal(r2.cached, true);
    assert.equal(fake.calls.length, 1);
    assert.equal(r2.stageUsage.llmCalls, 1);
    assert.equal(r2.stageUsage.cachedHits, 1);

    // Mesmo prompt/stageVersion, SYSTEM diferente: nova ida (system entra na
    // chave — buildMessages o envia ao provedor).
    const r3 = await llm.callLlm('F7', { ...reqBase, system: 'instruções de outro sistema' });
    assert.equal(r3.cached, false);
    assert.equal(fake.calls.length, 2);

    // MESMA entrada, OUTRA etapa: acerto — a etapa não participa da chave
    // (o artefato é função só dos seis componentes de cacheKeyFor).
    const r4 = await llm.callLlm('F9', reqBase);
    assert.equal(r4.cached, true);
    assert.equal(fake.calls.length, 2);

    // Bumpar stageVersion: invalidação EXPLÍCITA — nova ida.
    const r5 = await llm.callLlm('F7', { ...reqBase, stageVersion: 'v2' });
    assert.equal(r5.cached, false);
    assert.equal(fake.calls.length, 3);

    // Contabilidade por etapa: F7 fez 3 idas reais + 1 acerto; F9 só acerto.
    const f7 = llm.getStageUsage('F7');
    const f9 = llm.getStageUsage('F9');
    assert.equal(f7?.llmCalls, 3);
    assert.equal(f7?.cachedHits, 1);
    assert.equal(f9?.llmCalls, 0);
    assert.equal(f9?.cachedHits, 1);
    // promptTokens: 3 idas × 10 do fake.
    assert.equal(f7?.promptTokens, 30);
    assert.equal(f9?.promptTokens, 0);
  });
});

// ---------------------------------------------------------------------------
// 3. scheduler × runState × ledger — retomada de onda a partir do disco
// ---------------------------------------------------------------------------

describe('onda 1: scheduler × runState — retomada', () => {
  it('persistir result.tasks no dir do run e retomar: done puladas, dependentes não reexecutam', async () => {
    const dir = await mkdirTemp('onda1-runstate-');
    try {
      const run = criarRun({
        slug: 'integracao',
        budgetHash: 'a'.repeat(64),
        graphHash: 'b'.repeat(64),
        modelosPorEtapa: { F7: 'modelo-x' },
        promptVersao: 'v1',
        catalogoVersao: 'v1',
      });
      await salvarRun(dir, run);
      const ledger = new Ledger(dir);
      await ledger.anexar({ tipo: 'run_criado', runId: run.runId, slug: 'integracao' });

      const calls: string[] = [];
      const execute: Executor = async (t) => {
        calls.push(t.id);
        return { ok: true };
      };
      // Limiters próprios (semáforos separados — o seam do semáforo é o caso 1).
      const limiters: RateLimiters = {
        llm: rateLimiterDoSemaphore(createSemaphore(4)),
        exec: rateLimiterDoSemaphore(createSemaphore(4)),
        cpu: rateLimiterDoSemaphore(createSemaphore(4)),
      };

      // Primeira onda: a1 → a2 (DAG de 2).
      const onda1 = await runWave(
        { tasks: [task({ id: 'a1' }), task({ id: 'a2', deps: ['a1'] })], reducers: {} },
        { limiters, execute },
      );
      assert.deepEqual([...onda1.executed].sort(), ['a1', 'a2']);

      // Persistência via runState no MESMO diretório do run (layout D-WRITE:
      // escrita atômica da primitiva compartilhada — o disco é a fronteira
      // entre as duas ondas).
      const caminhoTarefas = path.join(dir, 'onda-tarefas.json');
      await escreverAtomico(caminhoTarefas, JSON.stringify(onda1.tasks));
      const salvas = JSON.parse(await lerArquivoOuVazio(caminhoTarefas)) as Task[];

      // Retomada: a1/a2 entram done com doneCacheKey === cacheKey; o DAG
      // ganha a3 (depende de a2, que está done) — ela roda, as done não.
      const a3 = task({ id: 'a3', deps: ['a2'] });
      const onda2 = await runWave({ tasks: [...salvas, a3], reducers: {} }, { limiters, execute });

      assert.deepEqual([...onda2.skipped].sort(), ['a1', 'a2']);
      assert.deepEqual([...onda2.executed].sort(), ['a3']);
      assert.deepEqual([...calls].sort(), ['a1', 'a2', 'a3']);
      // Tarefa done PERSISTIDA ficou com doneCacheKey (idempotência provável).
      for (const t of salvas) {
        assert.equal(t.status, 'done');
        assert.equal(t.doneCacheKey, t.cacheKey);
      }

      // O run.json continua válido/legível e o ledger segue íntegro após as
      // duas ondas (seam runState ↔ ledger no mesmo diretório).
      await ledger.anexar({ tipo: 'checkpoint', runId: run.runId, descricao: 'apos retomada' });
      const verificacao = await ledger.verificarCadeiaEmDisco();
      assert.deepEqual(verificacao, { ok: true, linhas: 2, primeiraQuebrada: null });
      const recarregado = await lerRun(dir);
      assert.equal(recarregado.runId, run.runId);
      assert.equal(recarregado.slug, 'integracao');
    } finally {
      await fsPromises.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  });
});

// ---------------------------------------------------------------------------
// 4. ledger — cadeia sha256(corpo canônico), anexos, runId obrigatório
// ---------------------------------------------------------------------------

describe('onda 1: ledger — cadeia e âncora runId', () => {
  it('montarCadeia usa sha256Hex(canonicalizarJson); anexos sequenciais íntegros; runId reprova/divergente quebra', async () => {
    const dir = await mkdirTemp('onda1-ledger-');
    try {
      const runId = '11111111-2222-3333-4444-555555555555';
      const eventos: EventoNovo[] = [
        { tipo: 'run_criado', runId, slug: 'integracao' },
        { tipo: 'fase_iniciada', runId, fase: 'F0' },
        { tipo: 'checkpoint', runId, descricao: 'ponto A' },
        { tipo: 'fase_concluida', runId, fase: 'F0' },
      ];

      // Bateria PURA: montarCadeia + verificarCadeia (sem disco).
      const cadeia = montarCadeia(eventos, '2026-08-30T12:00:00.000Z');
      assert.deepEqual(verificarCadeia(cadeia), { ok: true, linhas: 4, primeiraQuebrada: null });

      // A cadeia é, linha a linha, PRECISAMENTE sha256(prev_hash + "\n" +
      // corpo canônico) — as primitivas exportadas que F5/P-10 vão reusar.
      let prev: string | null = null;
      for (const bruta of cadeia.split('\n')) {
        const linha = JSON.parse(bruta) as Record<string, unknown>;
        const corpo: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(linha)) {
          if (k !== 'prev_hash' && k !== 'hash') corpo[k] = v;
        }
        assert.equal(linha.prev_hash, prev);
        assert.equal(linha.hash, sha256Hex(`${prev ?? ''}\n${canonicalizarJson(corpo)}`));
        prev = linha.hash as string;
      }

      // Anexos SEQUENCIAIS em disco encadeiam o mesmo hash — cadeia íntegra.
      const ledger = new Ledger(dir);
      for (const e of eventos) await ledger.anexar(e);
      assert.deepEqual(await ledger.verificarCadeiaEmDisco(), { ok: true, linhas: 4, primeiraQuebrada: null });

      // Adulteração ingênua (tocar o corpo sem recalcular) quebra NO ÍNDICE.
      const conteudo = await fsPromises.readFile(path.join(dir, 'ledger.jsonl'), 'utf8');
      const brutas = conteudo.trim().split('\n');
      const mutado = JSON.parse(brutas[1]) as Record<string, unknown>;
      mutado['fase'] = 'F1';
      brutas[1] = JSON.stringify(mutado);
      const v = verificarCadeia(brutas.join('\n'));
      assert.equal(v.ok, false);
      assert.equal(v.primeiraQuebrada, 1);
      assert.equal(v.motivo, 'HASH_DIVERGENTE');

      // runId OBRIGATÓRIO (D-ÂNCORA-RUNID): evento sem runId é reprovado na
      // validação — nunca silêncio nem linha órfã.
      await assert.rejects(
        ledger.anexar({ tipo: 'run_criado', slug: 'x' } as never),
        (e: unknown) => e instanceof LedgerError && e.code === 'EVENTO_INVALIDO' && e.campo === 'runId',
      );

      // Linha de OUTRO run quebra MESMO com a cadeia íntegra (RUN_ID_DIVERGENTE
      // — a verificação olha o runId ANTES do hash).
      const outra = montarCadeia(
        [
          { tipo: 'run_criado', runId, slug: 'integracao' },
          { tipo: 'checkpoint', runId: 'outro-run-9999', descricao: 'x' },
        ],
        '2026-08-30T12:00:00.000Z',
      );
      const v2 = verificarCadeia(outra);
      assert.equal(v2.ok, false);
      assert.equal(v2.primeiraQuebrada, 1);
      assert.equal(v2.motivo, 'RUN_ID_DIVERGENTE');
    } finally {
      await fsPromises.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  });
});

// ---------------------------------------------------------------------------
// 5. schemas/artifacts × schemas/fieldOrder — lint de ordem e drafts
// ---------------------------------------------------------------------------

/** Draft de aula VÁLIDO (todos os campos obrigatórios; INV-04: justificativa antes da decisão). */
const DRAFT_VALIDO = {
  slug: 'aula-variaveis',
  title: 'Variáveis',
  objective: {
    verbo: 'declarar',
    enunciado: 'declarar uma variável',
    contexto: 'em JavaScript',
    criterio: 'usar const/let sem erro de sintaxe',
  },
  introduces: { receptive: ['node:Identifier'], productive: [] },
  introducesTerms: [],
  foraDeEscopo: ['ponteiros', 'closures'],
  eiClass: 'fato',
  targetAtom: 'node:Identifier',
  notionalMachineDelta: 'ligar o nome ao valor em memória',
  budgetHash: 'hash-do-orcamento-congelado-do-fixture',
  budgetVersion: 'v1',
  research: ['mdn'],
  theory: [{ id: 't1', secao: 'teoria', markdown: 'texto da teoria', tag: '' }],
  justificativa: 'primeiro contato com estado mutável',
  role: 'regular',
  status: 'rascunho',
  aprovado: false,
} as const;

describe('onda 1: schemas × fieldOrder — memória de build', () => {
  it('registro real passa (ordem + opcionais); draft válido parseia; inversão reprova NOMEANDO o campo', () => {
    // O registro REAL é aprovado pelo lint de build (INV-04 ordem, INV-05 opcionais).
    assert.doesNotThrow(() => garantirSchemasValidos(SCHEMA_REGISTRY));
    assert.deepEqual(lintOrdemCampos(SCHEMA_REGISTRY), []);
    const lint = lintSchemasDaEngine(SCHEMA_REGISTRY);
    assert.deepEqual(lint.ordem, []);
    assert.deepEqual(lint.camposOpcionais, []);

    // Um draft VÁLIDO passa no schema do artefato (P-04).
    const parsed = LessonDraftSchema.safeParse(DRAFT_VALIDO as unknown as z.input<typeof LessonDraftSchema>);
    assert.equal(parsed.success, true);

    // Falta de campo obrigatório reprova citando o CAMPO (formatarErroCampos).
    const semJustificativa = { ...DRAFT_VALIDO } as unknown as Record<string, unknown>;
    delete semJustificativa['justificativa'];
    const r = LessonDraftSchema.safeParse(semJustificativa);
    assert.equal(r.success, false);
    if (!r.success) {
      assert.match(formatarErroCampos(r.error), /"justificativa"/);
    }

    // SEAM: um schema REGISTRADO com decisão (aprovado) ANTES da justificativa
    // é pego pelo lint — campo de decisão NOMEADO (INV-04 em código).
    const invertido = registrarLessonDraftInvertido();
    const problemas = lintOrdemCampos(invertido);
    assert.equal(problemas.length, 1);
    assert.equal(problemas[0].campo_decisao, 'aprovado');
    assert.equal(problemas[0].campo_justificativa, 'justificativa');
    assert.ok(problemas[0].indice_decisao < problemas[0].indice_justificativa);
    assert.throws(() => garantirSchemasValidos(invertido), /aprovado/);
    assert.throws(() => garantirSchemasValidos(invertido), /justificativa/);
  });
});

/** Reconstrói o lesson-draft com `aprovado` movido para ANTES de `justificativa`. */
function registrarLessonDraftInvertido(): SchemaRegistrado[] {
  const shape: Record<string, z.ZodTypeAny> = { ...LessonDraftSchema.shape };
  const chaves = Object.keys(shape).filter((k) => k !== 'aprovado');
  chaves.splice(chaves.indexOf('justificativa'), 0, 'aprovado');
  const shapeInvertido: Record<string, z.ZodTypeAny> = {};
  for (const chave of chaves) shapeInvertido[chave] = shape[chave];
  return [{ nome: 'lesson-draft-invertido', schema: z.object(shapeInvertido as z.ZodRawShape) }];
}

// ---------------------------------------------------------------------------
// 6. atomKeys (seed) × form/selector × form/rules
// ---------------------------------------------------------------------------

describe('onda 1: vocab (seed) × form — contrato das chaves form:', () => {
  it('toda chave da HARNESS_RECEPTIVE_SEED casa ATOM_KEY_RE; as form: parseiam e compilam', () => {
    for (const chave of HARNESS_RECEPTIVE_SEED) {
      assert.ok(isAtomKey(chave), `isAtomKey rejeitou a seed: "${chave}"`);
      assert.ok(ATOM_KEY_RE.test(chave), `ATOM_KEY_RE rejeitou a seed: "${chave}"`);
    }

    // As DUAS chaves form: da seed — leitura obrigatória que o harness congela.
    const formKeys = HARNESS_RECEPTIVE_SEED.filter((k) => k.startsWith('form:'));
    assert.deepEqual([...formKeys].sort(), [
      'form:ArrowFunction[body!=Block]',
      'form:Parameter[initializer!=null]',
    ]);

    // parseFormKey (P-06): a chave form: da seed É um seletor da DSL parseável.
    for (const k of formKeys) {
      const compilado = parseFormKey(k);
      assert.equal(compilado.canonical, k.slice('form:'.length));
      assert.ok(compilado.steps.length >= 1);
    }

    // buildFormRules (P-06): as DUAS formas da seed já existem na bateria
    // FORM_RULES — um orçamento que declare a seed nunca falha na carga.
    const chavesDasRegras = new Set(FORM_RULES.map((r) => r.key));
    for (const k of formKeys) {
      assert.ok(chavesDasRegras.has(k), `forma da seed fora da bateria existente: ${k}`);
    }

    // Recompilar a bateria existente é idempotente e refaz chaves ATOM_KEY_RE-válidas.
    const recompiladas = buildFormRules(FORM_RULES.map((r) => ({ selector: r.selector, description: r.description })));
    assert.deepEqual(
      recompiladas.map((r) => r.key).sort(),
      FORM_RULES.map((r) => r.key).sort(),
    );
    for (const r of recompiladas) assert.ok(ATOM_KEY_RE.test(r.key), `chave recompilada inválida: ${r.key}`);
  });
});

// ---------------------------------------------------------------------------
// 7. exec/proofs × exec/harness — consistência estrita e fixtura do relatório
// ---------------------------------------------------------------------------

/** Monta um ProofEnv REAL (diretórios isolados de verdade) com executor FAKE. */
function montarEnvProvador(
  baseDir: string,
  solutionCode: string,
  solutionResult: ExecResult,
  registros: Array<{ dir: string }>,
): ProofEnv {
  const execFake: ExecFn = async (dir, _args, opts) => {
    registros.push({ dir });
    // Endurecimento do harness presente no env que chega ao executor:
    // sem NODE_TEST_CONTEXT (armadilha do runner pai), sem proxy/ANSI/options
    // herdados, com NO_PROXY=*.
    assert.equal(opts?.env?.NODE_TEST_CONTEXT, undefined, 'NODE_TEST_CONTEXT vazou para o executor');
    assert.equal(opts?.env?.NO_PROXY, '*', 'NO_PROXY=* ausente do env endurecido');
    assert.equal(opts?.env?.FORCE_COLOR, undefined, 'FORCE_COLOR não foi removido');
    assert.equal(opts?.env?.NODE_OPTIONS, undefined, 'NODE_OPTIONS herdado não foi removido');
    // Exit guard escrito no diretório isolado (a integração real passa via
    // --require; aqui provamos que o arquivo existe e tem a fonte exata).
    const guard = path.join(dir, 'exit-guard.cjs');
    assert.equal(await fsPromises.readFile(guard, 'utf8'), EXIT_GUARD_SOURCE, 'exit-guard ausente ou divergente');

    // Decide o lado pelo conteúdo do solution.mjs do diretório ISOLADO.
    const sol = await fsPromises.readFile(path.join(dir, 'solution.mjs'), 'utf8');
    if (sol === solutionCode) return solutionResult;
    // starter e stub vazio FALHAM (exit 1) — provas 2 e 4 passam.
    return { exitCode: 1, stdout: '✖ falhou\n', stderr: '' };
  };

  const env: ProofEnv = {
    prepare: async (side) => {
      const d = await prepareIsolatedDir(baseDir, side);
      await escreverExitGuard(d);
      return d;
    },
    cleanup: cleanupDir,
    exec: createHardenedExec({ limiter: harnessCreateSemaphore(2), exec: execFake }),
  };
  return env;
}

const SOLUCAO_REFERENCIA = 'export function soma(a, b) {\n  return a + b;\n}\n';
const STARTER_QUEBRADO = 'export function soma(a, b) {\n  throw new Error("não implementado");\n}\n';

/** Relatório spec do node:test (o corpo real do runner). */
function specOut(tests: number, pass: number, fail: number, skipped = 0): string {
  return [
    '✔ caso 1 (0.5ms)',
    `ℹ tests ${tests}`,
    `ℹ pass ${pass}`,
    `ℹ fail ${fail}`,
    `ℹ skipped ${skipped}`,
    'ℹ todo 0',
    'ℹ duration_ms 5',
  ].join('\n');
}

describe('onda 1: provas × harness — execução endurecida com executor fake', () => {
  it('prova 1 exige consistência ESTRITA: relatório com skipped>0 ⇒ desafio INVÁLIDO', async () => {
    const baseDir = await mkdirTemp('onda1-provas-skip-');
    const registros: Array<{ dir: string }> = [];
    try {
      const testsCode =
        "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { soma } from './solution.mjs';\ntest('positivos', () => { assert.equal(soma(1, 2), 3); });\ntest('com zero', () => { assert.equal(soma(0, 5), 5); });\n";
      const input: ChallengeProofsInput = {
        solutionCode: SOLUCAO_REFERENCIA,
        starterCode: STARTER_QUEBRADO,
        testsCode,
        expectedTestCount: 2,
      };
      // Relatório com 1 teste skipado: `tests 2 / pass 1 / fail 0 / skipped 1`
      // NÃO é passagem integral — a prova 1 reprova mesmo com exit 0.
      const env = montarEnvProvador(baseDir, SOLUCAO_REFERENCIA, {
        exitCode: 0,
        stdout: specOut(2, 1, 0, 1),
        stderr: '',
      }, registros);

      const v = await verifyChallengeProofs(input, env);
      assert.equal(v.valid, false);
      assert.equal(v.failures.length, 1);
      assert.equal(v.failures[0].proof, 'solutionPasses');
      assert.match(v.failures[0].reason ?? '', /SKIPADOS|skipado/i);
      assert.equal(v.declared, 2);
      assert.equal(v.executed, 2);
      // Três diretórios ISOLADOS distintos + 3 execuções, todas endurecidas.
      assert.equal(registros.length, 3);
      assert.equal(new Set(registros.map((r) => r.dir)).size, 3);
    } finally {
      await fsPromises.rm(baseDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('dois blocos spec no stdout: o ÚLTIMO vence (relatório forjado não passa)', async () => {
    const baseDir = await mkdirTemp('onda1-provas-forjado-');
    const registros: Array<{ dir: string }> = [];
    try {
      const testsCode =
        "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { soma } from './solution.mjs';\ntest('positivos', () => { assert.equal(soma(1, 2), 3); });\n";
      const input: ChallengeProofsInput = {
        solutionCode: SOLUCAO_REFERENCIA,
        starterCode: STARTER_QUEBRADO,
        testsCode,
        expectedTestCount: 1,
      };
      // O código sob teste imprime um resumo FORJADO (tests 7/pass 7) ANTES do
      // runner real imprimir o dele (tests 1/pass 1). O parser lê o ÚLTIMO
      // bloco — o do runner — e o desafio vale.
      const stdoutForjado = [
        'console.log da forja:',
        'ℹ tests 7',
        'ℹ pass 7',
        'ℹ fail 0',
        'ℹ skipped 0',
        specOut(1, 1, 0, 0),
      ].join('\n');
      const env = montarEnvProvador(baseDir, SOLUCAO_REFERENCIA, {
        exitCode: 0,
        stdout: stdoutForjado,
        stderr: '',
      }, registros);

      const v = await verifyChallengeProofs(input, env);
      assert.equal(v.valid, true);
      assert.deepEqual(v.failures, []);
      assert.equal(v.declared, 1);
      assert.equal(v.executed, 1);
      assert.equal(registros.length, 3);
      assert.equal(new Set(registros.map((r) => r.dir)).size, 3);
    } finally {
      await fsPromises.rm(baseDir, { recursive: true, force: true }).catch(() => {});
    }
  });
});

// ---------------------------------------------------------------------------
// 8. graph — ciclo real, DAG com I1–I4, fecho transitivo puro
// ---------------------------------------------------------------------------

function conceito(id: string, desbloqueadoPor: string[] = [], usa: string[] = []): Concept {
  return {
    id: conceptId(id),
    desbloqueadoPor: desbloqueadoPor.map(conceptId),
    usa: usa.map(conceptId),
  };
}

const A = (): ConceptId => conceptId('a');
const B = (): ConceptId => conceptId('b');
const C = (): ConceptId => conceptId('c');

describe('onda 1: graph — ciclo, invariantes e fecho transitivo', () => {
  it('ciclo REAL e fechado é detectado pelo toposort COM o caminho', () => {
    const cid = (s: string): ConceptId => conceptId(s);
    const ciclico: ConceptGraph = {
      conceitos: [
        { id: cid('a'), desbloqueadoPor: [cid('c')], usa: [] }, // c→a fecha o ciclo
        { id: cid('b'), desbloqueadoPor: [cid('a')], usa: [] }, // a→b
        { id: cid('c'), desbloqueadoPor: [cid('b')], usa: [] }, // b→c
      ],
    };
    const r = toposort(ciclico);
    if (r.ok) {
      assert.fail('esperava falha de ciclo');
    } else {
      assert.equal(r.falha, 'ciclo');
      // Caminho FECHADO com todas as arestas reais: a→b→c→a.
      assert.deepEqual(r.ciclo, [A(), B(), C(), A()]);
      assert.equal(r.ciclo.length - 1, 3);
    }
  });

  it('DAG passa I1–I4 com ordenação; fechoTransitivoRedundante NÃO muta o grafo', () => {
    const dag: ConceptGraph = {
      conceitos: [
        conceito('variaveis'),
        conceito('funcoes', ['variaveis'], ['variaveis']),
        conceito('escopo', ['funcoes'], ['variaveis', 'funcoes']),
      ],
    };
    const ord = toposort(dag);
    assert.equal(ord.ok, true);
    if (ord.ok) {
      assert.equal(ord.criterio, 'ordem-lexicografica-por-id');
      assert.deepEqual(ord.ordem, [conceptId('variaveis'), conceptId('funcoes'), conceptId('escopo')]);
    }

    const visao: VisaoDeEnsino = {
      construcoesDeEntrada: [],
      aulas: [
        {
          ref: 'm1/a1',
          introduces: [conceptId('variaveis')],
          usa: [],
          teoriaExemplos: [[conceptId('variaveis')]],
          desafios: [[conceptId('variaveis')]],
          artefatos: [[conceptId('variaveis')]],
        },
        {
          ref: 'm1/a2',
          introduces: [conceptId('funcoes')],
          usa: [conceptId('variaveis')],
          teoriaExemplos: [[conceptId('funcoes')]],
          desafios: [[conceptId('funcoes')]],
          artefatos: [[conceptId('funcoes')]],
        },
        {
          ref: 'm1/a3',
          introduces: [conceptId('escopo')],
          usa: [conceptId('funcoes'), conceptId('variaveis')],
          teoriaExemplos: [[conceptId('escopo')]],
          desafios: [[conceptId('escopo')]],
          artefatos: [[conceptId('escopo')]],
        },
      ],
    };
    const violacoes = checkInvariants(dag, visao);
    const estruturais = violacoes.filter((v) => ['I1', 'I2', 'I3', 'I4'].includes(v.invariante));
    assert.deepEqual(estruturais, []);

    // fecho transitivo: a→c é REDUNDANTE (caminho alternativo a→b→c).
    const comRedundante: ConceptGraph = {
      conceitos: [conceito('a'), conceito('b', ['a']), conceito('c', ['a', 'b'])],
    };
    const antes = JSON.stringify(comRedundante);
    const redundantes = fechoTransitivoRedundante(comRedundante);
    assert.deepEqual(redundantes, [{ origem: A(), destino: C(), caminho: [A(), B(), C()] }]);
    // PURO: nada foi removido do grafo armazenado (visão de renderização).
    assert.equal(JSON.stringify(comRedundante), antes);
  });
});

// ---------------------------------------------------------------------------
// 9. audit (onda 0) × orçamento — introduces com form: da seed, sem ruído
// ---------------------------------------------------------------------------

describe('onda 1: audit (onda 0) × introduces declarado com formas da seed', () => {
  it('introduces incluindo form: da seed → zero violações espúrias', () => {
    // Aula que DECLARA introduces: o produtivo é o currículo real; o receptivo
    // inclui as DUAS formas que a seed (HARNESS_RECEPTIVE_SEED) congela para
    // leitura (releitura obrigatória do starter com parâmetro default e de
    // arrow de expressão) — exatamente a política receptive-seed (§3.2/D1).
    const aulaComIntroduces: LoadedLesson = {
      ...lesson(
        'a1',
        [theory('s', 'Uma função dobra o valor.', "const dobra = (n) => n * 2;\nconsole.log(dobra(1));")],
        [
          challenge('c1', {
            starterCode: "export function cumprimentar(nome, versao = '1.0.0') {\n}\n",
            solutionCode: 'export function f(n) {\n  const x = n;\n  return x;\n}\n',
            testsCode:
              "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { f } from './solution.mjs';\ntest('devolve o que recebe', () => { assert.equal(f(1), 1); });\n",
          }),
        ],
      ),
      meta: {
        ...lesson('a1', [theory('s', 'x')], []).meta,
        introduces: {
          productive: [
            'decl:const',
            'node:ReturnStatement',
            'node:VariableDeclaration',
            'node:VariableDeclarationList',
            'node:VariableStatement',
          ],
          receptive: [
            // formas da seed — declaradas no introduces RECEPTIVO da aula,
            // como a política receptive-seed manda (nunca no produtivo).
            'form:ArrowFunction[body!=Block]',
            'form:Parameter[initializer!=null]',
            // resto do que a teoria/starter demonstram, para o gate não ser ruído
            'node:FunctionDeclaration',
            'node:Parameter',
            'api:console.log',
            'global:console',
            'node:BinaryExpression',
            'op:binary:*',
          ],
        },
      } as LoadedLesson['meta'],
    };

    const t = trackOf([moduleOf('m1', 1, [aulaComIntroduces])]);
    const orcamento = deriveTrackBudget(t);
    assert.equal(orcamento.source, 'declared');
    const bAula = orcamento.byRef.get('m1/a1');
    assert.ok(bAula, 'orçamento da aula a1 não derivado');
    // As formas da seed entraram no introduces receptivo declarado.
    assert.ok(bAula?.introduces.receptive.includes('form:ArrowFunction[body!=Block]'));
    assert.ok(bAula?.introduces.receptive.includes('form:Parameter[initializer!=null]'));
    // E NUNCA no produtivo (aluno não é cobrado por escrever a forma).
    assert.ok(!bAula?.introduces.productive.includes('form:ArrowFunction[body!=Block]'));

    const report = auditTrack(t);
    assert.deepEqual(report.violations, []);
    assert.equal(report.totals.violacoes, 0);
    assert.equal(report.totals.desafiosComViolacao, 0);
    assert.deepEqual(report.parseErrors, []);
  });
});