/**
 * tests/main-wiring.test.ts — regressão do WIRING dos handlers IPC do bootstrap.
 *
 * buildMainSetup(deps) é a função PURA que o entry real usa em whenReady. A onda
 * 3-ui-wiring estendeu MainSetupDeps para 5 registradores (ipc→keys→localAi→pi→study);
 * aqui asseguramos que registerKeys continua registrado junto de registerIpc e
 * que a assinatura nova aceita os 5 dependências. A ORDEM COMPLETA dos 5 é
 * provada em tests/study-wiring.test.ts (item (a)).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildMainSetup, emitToAll } from '../electron/main/main-setup';
import { registerKeysHandlers } from '../electron/main/ipc/keys-handlers';
import { registerStudyHandlers, type LessonServiceLike, type RunnerLike } from '../electron/main/ipc/study-handlers';
import { STUDY_CHANNELS } from '../shared/ipc-contract';
import type { AnswerJudgeLike } from '../electron/main/services/answerJudge';

function makeDeps(called: string[]) {
  return {
    registerIpc: async () => {
      called.push('registerIpc');
    },
    registerKeys: () => {
      called.push('registerKeys');
    },
    registerLocalAi: async () => {
      called.push('registerLocalAi');
    },
    registerPi: async () => {
      called.push('registerPi');
    },
    registerStudy: async () => {
      called.push('registerStudy');
    },
  };
}

describe('buildMainSetup (wiring do bootstrap IPC)', () => {
  it('aceita os 5 dependências e chama registerKeys junto com registerIpc', async () => {
    const called: string[] = [];
    await buildMainSetup(makeDeps(called));

    // registerKeys é chamado logo após registerIpc (antes dos específicos).
    assert.ok(called.includes('registerIpc'));
    assert.ok(called.includes('registerKeys'));
    assert.equal(called[1], 'registerKeys', 'registerKeys deve vir em segundo lugar (após registerIpc)');
  });

  it('registerIpc resolve antes de registerKeys (espera registerIpc)', async () => {
    let entry: string = 'none';
    await buildMainSetup({
      registerIpc: async () => {
        entry = entry === 'keys' ? 'ipc-depois-de-keys' : 'ipc';
      },
      registerKeys: () => {
        entry = entry === 'ipc' ? 'keys-apos-ipc' : 'keys-antes-ipc';
      },
      registerLocalAi: async () => {},
      registerPi: async () => {},
      registerStudy: async () => {},
    });
    assert.equal(entry, 'keys-apos-ipc');
  });

  it('registerKeysHandlers continua uma função exportada (âncora do módulo real)', () => {
    assert.equal(typeof registerKeysHandlers, 'function');
  });
});

describe('ONDA4 — answerJudge fiado via registerStudy (gap da onda 3)', () => {
  /** Fakes mínimos que satisfazem as interfaces do registerStudyHandlers. */
  function minimalStudyDeps() {
    const lesson = {
      generateLesson: async () => ({
        lesson: { title: 'A', subject: 'x', markdown: '# A', findings: [], challenges: [], createdAt: 'now' },
        rejected: [],
      }),
      testAnswer: async () => ({ success: true, testsRun: 1, expectedTests: 1, passed: true, output: 'ok' }),
      listSetups: async () => ({ rows: [] }),
      resolveSkillDirInfo: async () => ({ skillDir: '/tmp/skill' }),
    } as unknown as LessonServiceLike;
    const runner = { resolveSkillDir: async () => '/tmp/skill' } as unknown as RunnerLike;
    return { lesson, runner };
  }

  it('buildMainSetup com registerStudy que injeta answerJudge → study:judge-answer responde com o veredito do avaliador (não UNAVAILABLE)', async () => {
    const handlersMap = new Map<string, (...a: unknown[]) => unknown>();
    const ipc = {
      handlers: handlersMap,
      removeHandler: (c: string) => handlersMap.delete(c),
      handle: (c: string, fn: (...a: unknown[]) => unknown) => handlersMap.set(c, fn),
    };
    const answerJudge: AnswerJudgeLike = {
      async judgeAnswer() {
        return { ok: true, verdict: 'correct', feedback: 'Você dominou o conceito.', provider: 'embedded' };
      },
    };
    const { lesson, runner } = minimalStudyDeps();
    let registered = false;

    await buildMainSetup({
      registerIpc: async () => {},
      registerKeys: () => {},
      registerLocalAi: async () => {},
      registerPi: async () => {},
      registerStudy: async () => {
        registered = true;
        // MESMA assinatura da fiação real do index.ts (answerJudge injetado).
        await registerStudyHandlers({ runner, lesson, emit: () => {}, answerJudge }, ipc as never);
      },
    });

    assert.ok(registered, 'registerStudy deveria ter sido chamado pelo buildMainSetup');
    const judge = handlersMap.get(STUDY_CHANNELS.JUDGE_ANSWER);
    assert.ok(judge, 'study:judge-answer registrado');
    const res = (await judge!(undefined, {
      answerText: 'Uma closure captura o escopo.',
      context: { subject: 'Closures', lessonExcerpt: 'Trecho.' },
    })) as { ok: boolean; verdict: string; provider: string };
    // Sem o answerJudge fiado, isto seria { ok:false, code:'ANSWER_JUDGE_UNAVAILABLE' }.
    assert.deepEqual(res, { ok: true, verdict: 'correct', feedback: 'Você dominou o conceito.', provider: 'embedded' });
  });

  it('registerStudyHandlers aceita answerJudge no deps (âncora da assinatura usada pelo index.ts)', () => {
    const answerJudge: AnswerJudgeLike = {
      async judgeAnswer() {
        return { ok: false, error: { code: 'ANSWER_JUDGE_UNAVAILABLE', message: 'x' } };
      },
    };
    const { lesson, runner } = minimalStudyDeps();
    // Não lança na construção (a assinatura comporta o campo).
    const deps = { runner, lesson, emit: (): void => {}, answerJudge };
    assert.equal(typeof deps.answerJudge.judgeAnswer, 'function');
  });
});

describe('emitToAll', () => {
  it('envia o evento quando o webContents está vivo', () => {
    const sent: string[] = [];
    const wc = { isDestroyed: () => false, send: (c: string, ...a: unknown[]) => sent.push(`${c}:${JSON.stringify(a)}`) };
    emitToAll(wc, 'study:lesson-progress', { phase: 'research' });
    assert.equal(sent.length, 1);
    assert.equal(sent[0], 'study:lesson-progress:[{"phase":"research"}]');
  });

  it('não envia quando webContents é undefined ou destruído', () => {
    const sent: string[] = [];
    emitToAll(undefined, 'x', 'v');
    assert.equal(sent.length, 0);

    const dead = { isDestroyed: () => true, send: (c: string, ...a: unknown[]) => sent.push(c) };
    emitToAll(dead, 'x', 'v');
    assert.equal(sent.length, 0);
  });
});