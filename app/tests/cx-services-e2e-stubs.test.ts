/**
 * tests/cx-services-e2e-stubs.test.ts — CARACTERIZAÇÃO (golden master) de
 * `electron/main/services/e2eStubs.ts` ANTES da refatoração de core/services.
 *
 * Fixa o harness E2E do main: o gate de segurança (fora do modo E2E é no-op),
 * as fases do gate de início por cenário de envars e o CICLO DO QUIZ ADAPTATIVO
 * do stub (attempt → explain → remedial → history), incluindo o fail-closed
 * com `E2E_QUIZ_AI=off` (paridade com o contrato QUIZ_ERROR_CODES).
 *
 * O flag STUDY_METHOD_E2E é lido no LOAD do módulo: cada cenário usa import
 * cache-busted (query string). Envars restauradas no final; workspace E2E
 * PRÓPRIO (o harness nunca escreve no workspace compartilhado).
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fsp } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { QUIZ_ERROR_CODES, TRACK_CHANNELS } from '../shared/ipc-contract';
import type { QuizAttemptReply, QuizRemedialReply } from '../shared/ipc-contract';
import type { IpcMainHandleLike } from '../electron/main/ipc/safeHandle';
import type * as E2EStubs from '../electron/main/services/e2eStubs';

const ENV_KEYS = ['STUDY_METHOD_E2E', 'E2E_GATE', 'E2E_NETWORK', 'E2E_KEYS', 'E2E_WORKSPACE_ROOT', 'E2E_QUIZ_AI'] as const;

let savedEnv = new Map<string, string | undefined>();
let tmpRoot = '';

before(async () => {
  for (const k of ENV_KEYS) savedEnv.set(k, process.env[k]);
  tmpRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'do-cxsvc-e2estubs-'));
  process.env.E2E_WORKSPACE_ROOT = tmpRoot;
});

after(async () => {
  await fsp.rm(tmpRoot, { recursive: true, force: true });
  for (const [k, v] of savedEnv) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  savedEnv = new Map();
});

let loadSeq = 0;

/** Instância fresca do e2eStubs (os flags são lidos no load do módulo). */
async function loadE2EStubs(): Promise<typeof E2EStubs> {
  loadSeq += 1;
  const url = `../electron/main/services/e2eStubs.ts?cx-${loadSeq}`;
  return (await import(url)) as typeof E2EStubs;
}

function makeFakeIpc(): { channels: string[]; ipc: IpcMainHandleLike } {
  const channels: string[] = [];
  return {
    channels,
    ipc: {
      removeHandler(): void {
        /* fake sem handlers prévios */
      },
      handle(channel: string, _fn: unknown): void {
        channels.push(channel);
      },
    },
  };
}

function assertionQuiz(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'af-1',
    statement: 'Toda função é um objeto.',
    question: 'O que é uma função?',
    options: ['Um objeto', 'Uma string', 'Um número', 'Um símbolo'],
    answerIndex: 0,
    feedback: 'Funções são objetos chamáveis.',
    ...over,
  };
}

// ─── gate de segurança e fases ───────────────────────────────────────────────

describe('cx/e2eStubs: gate de segurança e fases do gate de início', () => {
  it('fora do modo E2E, registerE2EStubs é NO-OP (retorna false e registra nada)', async () => {
    delete process.env.STUDY_METHOD_E2E;
    const mod = await loadE2EStubs();
    const { channels, ipc } = makeFakeIpc();
    assert.equal(mod.registerE2EStubs(ipc), false);
    assert.deepEqual(channels, []);
  });

  it('no modo E2E registra (idempotente) e expõe a fase do gate por cenário', async () => {
    process.env.STUDY_METHOD_E2E = '1';
    delete process.env.E2E_NETWORK;
    delete process.env.E2E_KEYS;

    process.env.E2E_GATE = 'ready';
    const ready = await loadE2EStubs();
    const { channels, ipc } = makeFakeIpc();
    assert.equal(ready.registerE2EStubs(ipc), true);
    assert.ok(channels.length > 0, 'canais registrados de verdade');
    assert.equal(ready.registerE2EStubs(ipc), true, 're-registro idempotente');
    assert.equal(ready.e2eGatePhase(), 'ready');

    delete process.env.E2E_GATE;
    const semGate = await loadE2EStubs();
    semGate.registerE2EStubs(makeFakeIpc().ipc);
    assert.equal(semGate.e2eGatePhase(), 'blocked', 'sem chaves ⇒ blocked');

    process.env.E2E_GATE = 'ready';
    process.env.E2E_NETWORK = 'offline';
    const offline = await loadE2EStubs();
    offline.registerE2EStubs(makeFakeIpc().ipc);
    assert.equal(offline.e2eGatePhase(), 'offline');
    delete process.env.E2E_NETWORK;
  });
});

// ─── o ciclo do QUIZ no stub (paridade de contrato) ──────────────────────────

describe('cx/e2eStubs: buildQuizStubHandlers (o ciclo errar → explicar → quiz novo)', () => {
  it('QUIZ_ATTEMPT: pedido incompleto ⇒ QUIZ_NOT_FOUND; completo ⇒ attemptNo derivado por seção', async () => {
    const mod = await loadE2EStubs();
    const map = mod.buildQuizStubHandlers();
    const attempt = map.get(TRACK_CHANNELS.QUIZ_ATTEMPT)!;

    const incompleto = (await attempt(undefined, { trackSlug: 't' })) as QuizAttemptReply;
    assert.equal(incompleto.ok, false);
    assert.ok(!incompleto.ok && incompleto.code === QUIZ_ERROR_CODES.NOT_FOUND);
    assert.ok(!incompleto.ok && /sem trilha\/aula\/seção\/afirmação/.test(incompleto.message));

    const p1 = (await attempt(undefined, {
      trackSlug: 'cx-t',
      lessonId: 'cx-a',
      sectionKey: 'sec-1',
      assertionId: 'af-1',
      selectedIndex: 2,
      correct: true,
    })) as QuizAttemptReply;
    assert.ok(p1.ok);
    const p2 = (await attempt(undefined, {
      trackSlug: 'cx-t',
      lessonId: 'cx-a',
      sectionKey: 'sec-1',
      assertionId: 'af-1',
      selectedIndex: 0,
      correct: false,
    })) as QuizAttemptReply;
    const outra = (await attempt(undefined, {
      trackSlug: 'cx-t',
      lessonId: 'cx-a',
      sectionKey: 'sec-2',
      assertionId: 'af-2',
      selectedIndex: 'x', // não-numérico ⇒ -1
      correct: 'sim', // não-boolean estrito ⇒ false
    })) as QuizAttemptReply;
    assert.ok(p2.ok && outra.ok);
    if (p1.ok && p2.ok && outra.ok) {
      assert.equal(p1.attempt.attemptNo, 1, 'ordinal derivado por SEÇÃO');
      assert.equal(p2.attempt.attemptNo, 2);
      assert.equal(outra.attempt.attemptNo, 1, 'seção diferente zera a contagem');
      assert.equal(p1.attempt.quizOrigin, 'authored', 'default authored');
      assert.equal(p1.attempt.correct, true);
      assert.equal(outra.attempt.correct, false, "correct é comparação === true (não coerce)");
      assert.equal(outra.attempt.selectedIndex, -1, 'selectedIndex não-numérico vira -1');
      assert.equal(p2.mastery.length > 0, true, 'maestria recalculada a cada attempt');
    }
  });

  it('QUIZ_EXPLAIN: com IA ligada explica; com E2E_QUIZ_AI=off cai no fail-closed QUIZ_UNAVAILABLE', async () => {
    const mod = await loadE2EStubs();
    const map = mod.buildQuizStubHandlers();
    const explain = map.get(TRACK_CHANNELS.QUIZ_EXPLAIN)!;
    const pedido = {
      trackSlug: 'cx-t',
      lessonId: 'cx-a',
      sectionKey: 'sec-1',
      assertion: assertionQuiz(),
      selectedIndex: 1,
    };

    process.env.E2E_QUIZ_AI = 'on';
    const ligada = (await explain(undefined, pedido)) as { ok: true; explanation: string } | { ok: false; code: string };
    assert.ok(ligada.ok, 'IA ligada ⇒ explicação stub');
    assert.ok(ligada.ok && ligada.explanation.length > 0);

    process.env.E2E_QUIZ_AI = 'off';
    const desligada = (await explain(undefined, pedido)) as { ok: false; code: string; message: string };
    assert.equal(desligada.ok, false);
    assert.equal(desligada.code, QUIZ_ERROR_CODES.UNAVAILABLE, 'paridade com "sem chat" do serviço real');
    delete process.env.E2E_QUIZ_AI;
  });

  it('QUIZ_REMEDIAL ⇒ quiz novo validado + remediação guardada no histórico (id @e2e)', async () => {
    const mod = await loadE2EStubs();
    const map = mod.buildQuizStubHandlers();
    const remedial = map.get(TRACK_CHANNELS.QUIZ_REMEDIAL)!;
    const history = map.get(TRACK_CHANNELS.QUIZ_HISTORY)!;

    const pedido = {
      trackSlug: 'cx-hist',
      lessonId: 'cx-a',
      sectionKey: 'sec-1',
      originAssertionId: 'af-1',
      generation: 1,
      assertion: assertionQuiz({ sectionId: 'sec-t' }),
      explanation: 'A opção escolhida descreve…',
    };
    const reply = (await remedial(undefined, pedido)) as QuizRemedialReply;
    assert.ok(reply.ok, 'o stub devolve um quiz dentro do contrato');
    if (reply.ok) {
      assert.equal(reply.quiz.id, 'sec-t::af-1#g1', 'id determinística <chave>#g<N>');
      assert.equal(reply.quiz.originAssertionId, 'af-1');
      assert.equal(reply.quiz.generation, 1);
      assert.equal(reply.quiz.options.length, 4);
      assert.ok(reply.quiz.answerIndex >= 0 && reply.quiz.answerIndex <= 3);
    }

    const hist = (await history(undefined, { trackSlug: 'cx-hist', lessonId: 'cx-a' })) as {
      ok: true;
      attempts: unknown[];
      remediations: Array<{ id: string; quiz: unknown }>;
      mastery: unknown[];
    };
    assert.ok(hist.ok);
    assert.equal(hist.remediations.length, 1);
    assert.equal(hist.remediations[0].id, 'sec-t::af-1#g1@e2e', 'o par explicação+quiz fica no histórico');
  });

  it('QUIZ_REMEDIAL com a IA desligada ⇒ QUIZ_UNAVAILABLE e NENHUMA remediação guardada', async () => {
    const mod = await loadE2EStubs();
    const map = mod.buildQuizStubHandlers();
    const remedial = map.get(TRACK_CHANNELS.QUIZ_REMEDIAL)!;
    const history = map.get(TRACK_CHANNELS.QUIZ_HISTORY)!;

    process.env.E2E_QUIZ_AI = 'off';
    const reply = (await remedial(undefined, {
      trackSlug: 'cx-off',
      lessonId: 'cx-a',
      sectionKey: 'sec-1',
      originAssertionId: 'af-1',
      generation: 1,
      assertion: assertionQuiz(),
    })) as { ok: false; code: string };
    assert.equal(reply.ok, false);
    assert.equal(reply.code, QUIZ_ERROR_CODES.UNAVAILABLE);
    delete process.env.E2E_QUIZ_AI;

    const hist = (await history(undefined, { trackSlug: 'cx-off', lessonId: 'cx-a' })) as {
      ok: true;
      remediations: unknown[];
    };
    assert.ok(hist.ok);
    assert.deepEqual(hist.remediations, []);
  });

  it('QUIZ_HISTORY: filtra por trilha+aula e recusa pedido incompleto', async () => {
    const mod = await loadE2EStubs();
    const map = mod.buildQuizStubHandlers();
    const history = map.get(TRACK_CHANNELS.QUIZ_HISTORY)!;

    const incompleto = (await history(undefined, { trackSlug: 'cx-t' })) as { ok: false; code: string };
    assert.equal(incompleto.ok, false);
    assert.ok(!incompleto.ok && incompleto.code === QUIZ_ERROR_CODES.NOT_FOUND);

    const vazio = (await history(undefined, { trackSlug: 'cx-nunca', lessonId: 'cx-a' })) as {
      ok: true;
      attempts: unknown[];
      remediations: unknown[];
      mastery: unknown[];
    };
    assert.ok(vazio.ok);
    assert.deepEqual(vazio.attempts, []);
    assert.deepEqual(vazio.remediations, []);
    assert.deepEqual(vazio.mastery, []);
  });
});

describe('cx/e2eStubs: buildKeysStubHandlers e buildTrackStubHandlers (shapes observáveis)', () => {
  it('keys: status/set-key/validação no slot "openrouter" (migração do provedor)', async () => {
    const mod = await loadE2EStubs();
    const map = mod.buildKeysStubHandlers();
    const setKey = map.get('keys:set-key')!;
    const getStatus = map.get('keys:get-status')!;
    const validateLlm = map.get('keys:validate-llm')!;

    const antes = (await getStatus()) as Record<string, unknown>;
    assert.deepEqual(Object.keys(antes).sort(), [
      'braveConfigured',
      'braveValidated',
      'llmConfigured',
      'llmValidated',
    ]);

    await setKey(undefined, 'openrouter', 'sk-or-v1-cx');
    const depois = (await getStatus()) as { llmConfigured: boolean; llmValidated: boolean };
    assert.equal(depois.llmConfigured, true);
    assert.equal(depois.llmValidated, true);
    const validacao = (await validateLlm(undefined, undefined)) as { isValid: boolean; provider: string };
    assert.equal(validacao.isValid, true);
    assert.equal(validacao.provider, 'openrouter', 'o stub reporta o provider REAL');

    await setKey(undefined, 'openrouter', '');
    assert.equal(((await getStatus()) as { llmConfigured: boolean }).llmConfigured, false);
  });

  it('track: os 16 canais de trilha no mapa e LESSON inexistente ⇒ ok:true com lesson:null', async () => {
    const mod = await loadE2EStubs();
    const map = mod.buildTrackStubHandlers();
    for (const ch of [
      TRACK_CHANNELS.LIST,
      TRACK_CHANNELS.GET,
      TRACK_CHANNELS.LESSON,
      TRACK_CHANNELS.LESSON_DONE,
      TRACK_CHANNELS.TUTOR_CHAT,
      TRACK_CHANNELS.CHALLENGE_GET,
      TRACK_CHANNELS.CHALLENGE_SUBMIT,
      TRACK_CHANNELS.CHALLENGE_REGENERATE,
      TRACK_CHANNELS.PROFICIENCY_GET,
      TRACK_CHANNELS.PROFICIENCY_SUBMIT,
      TRACK_CHANNELS.ORPHANS,
      TRACK_CHANNELS.PURGE_ORPHANS,
      TRACK_CHANNELS.QUIZ_ATTEMPT,
      TRACK_CHANNELS.QUIZ_EXPLAIN,
      TRACK_CHANNELS.QUIZ_REMEDIAL,
      TRACK_CHANNELS.QUIZ_HISTORY,
    ]) {
      assert.ok(map.has(ch), `handler de trilha ausente: ${ch}`);
    }
    const lesson = map.get(TRACK_CHANNELS.LESSON)!;
    const res = (await lesson(undefined, {
      trackSlug: 'nodejs-do-zero',
      lessonId: 'nao-existe',
    })) as { ok: true; lesson: unknown };
    assert.equal(res.ok, true);
    assert.equal(res.lesson, null);
  });
});
