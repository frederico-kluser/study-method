/**
 * tests/ipc-contract.test.ts — teste estrutural do contrato IPC.
 *
 * (a) Os constantes de canais do contrato congelado (shared/ipc-contract.ts)
 *     não têm duplicatas nem strings vazias.
 * (b) O preload exporta `createExposedApi(ipc)` (função pura, sem electron) e o
 *     objeto que ela devolve expõe TODO canal declarado no contrato — a cobertura
 *     é conferida varrendo os grupos (settings/keys/pi/localAi/study).
 *
 * O teste NÃO importa electron: usa um fake de IpcBridgeLike.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  KEYS_CHANNELS,
  LOCAL_AI_CHANNELS,
  PI_CHANNELS,
  SETTINGS_CHANNELS,
  STT_CHANNELS,
  STUDY_CHANNELS,
  TTS_CHANNELS,
} from '../shared/ipc-contract';

import { API_GROUPS, createExposedApi } from '../electron/preload/api-schema';
import type { IpcBridgeLike } from '../electron/preload/api-schema';

/** Canais de evento: expostos como on* (subscribe) em vez de invoke. */
const EVENT_CHANNELS: ReadonlySet<string> = new Set([
  PI_CHANNELS.STREAM_EVENT,
  LOCAL_AI_CHANNELS.DOWNLOAD_PROGRESS,
  STUDY_CHANNELS.LESSON_PROGRESS,
  STUDY_CHANNELS.RESEARCH_PROGRESS,
  STUDY_CHANNELS.TEST_ANSWER_EVENT,
  STT_CHANNELS.MODEL_DOWNLOAD_PROGRESS,
  STT_CHANNELS.STREAM_PARTIAL,
  STT_CHANNELS.ENGINE_STATUS,
  TTS_CHANNELS.DOWNLOAD_PROGRESS,
]);

/** Fake determinístico do transporte: registra os invoke/on chamados. */
function makeFakeIpc(): IpcBridgeLike & { invoked: string[]; subscribed: string[] } {
  const invoked: string[] = [];
  const subscribed: string[] = [];
  return {
    invoked,
    subscribed,
    invoke: async (channel: string) => {
      invoked.push(channel);
      return 'ok';
    },
    on: (channel: string) => {
      subscribed.push(channel);
      return () => {};
    },
  };
}

/** Deriva o nome do membro exposto a partir do canal (mesma convenção do preload). */
function memberName(channel: string, isEvent: boolean): string {
  const track = (channel.split(':')[1] ?? channel).replace(/-([a-z])/g, (_m, c: string) =>
    c.toUpperCase(),
  );
  return isEvent ? `on${track.replace(/^./, (c) => c.toUpperCase())}` : track;
}

describe('contrato IPC (shared/ipc-contract.ts)', () => {
  const ALL_GROUPS = [
    KEYS_CHANNELS,
    PI_CHANNELS,
    LOCAL_AI_CHANNELS,
    STUDY_CHANNELS,
    SETTINGS_CHANNELS,
    STT_CHANNELS,
    TTS_CHANNELS,
  ];

  it('não há strings vazias entre os canais', () => {
    for (const group of ALL_GROUPS) {
      for (const value of Object.values(group)) {
        assert.ok(typeof value === 'string' && value.length > 0, `canal vazio em grupo`);
      }
    }
  });

  it('não há canais duplicados entre grupos', () => {
    const seen = new Map<string, string>();
    for (const [groupName, group] of Object.entries({
      KEYS_CHANNELS,
      PI_CHANNELS,
      LOCAL_AI_CHANNELS,
      STUDY_CHANNELS,
      SETTINGS_CHANNELS,
      STT_CHANNELS,
      TTS_CHANNELS,
    })) {
      for (const value of Object.values(group)) {
        assert.ok(!/[\s]/.test(value), `canal com espaço: ${value}`);
        const prev = seen.get(value);
        assert.ok(prev === undefined, `canal '${value}' duplicado em ${prev} e ${groupName}`);
        seen.set(value, groupName);
      }
    }
  });

  it('createExposedApi expõe TODOS os canais do contrato (walk por grupos)', async () => {
    const ipc = makeFakeIpc();
    const api = createExposedApi(ipc);

    // Cada grupo do contrato tem sua chave no objeto exposto.
    for (const groupName of Object.keys(API_GROUPS)) {
      assert.ok(api && typeof api === 'object', 'api exposta deveria ser um objeto');
      assert.ok(
        groupName in (api as unknown as Record<string, unknown>),
        `grupo '${groupName}' deveria estar exposto`,
      );
    }

    let checked = 0;
    for (const [groupName, group] of Object.entries(API_GROUPS)) {
      const member = (api as unknown as Record<string, Record<string, unknown>>)[groupName];
      for (const value of Object.values(group)) {
        const channel = value;
        const isEvent = EVENT_CHANNELS.has(channel);
        const name = memberName(channel, isEvent);
        assert.ok(
          typeof member[name] === 'function',
          `canal '${channel}' deveria expor o membro '${name}' em '${groupName}'`,
        );
        checked += 1;
      }
    }

    // Garante que a string do canal chega ao transporte (invoke) ou à subscrição (on).
    // Onda 8 (voz) adicionou stt (11) + localTts (9) → 60; onda3-respostas
    // adicionou study:check-math-answer + study:judge-answer → 62 canais no total.
    assert.ok(checked >= 62, `cobertura abaixo do esperado para o contrato (${checked})`);

    // Invoca alguns membros e confere que o channel do contrato chega ao transporte.
    await (api as unknown as ApiRef).settings.get();
    await (api as unknown as ApiRef).pi.execute({ prompt: 'x', modelConfig: { provider: 'p', model: 'm' } });
    await (api as unknown as ApiRef).study.testAnswer();
    await (api as unknown as ApiRef).localAi.chat({ prompt: 'avalia' });
    assert.ok(ipc.invoked.includes(SETTINGS_CHANNELS.GET), 'settings:get deveria invocar o transporte');
    assert.ok(ipc.invoked.includes(PI_CHANNELS.EXECUTE), 'pi:execute deveria invocar o transporte');
    assert.ok(ipc.invoked.includes(STUDY_CHANNELS.TEST_ANSWER), 'study:test-answer deveria invocar');
    assert.ok(ipc.invoked.includes(LOCAL_AI_CHANNELS.CHAT), 'localAi:chat deveria invocar o transporte');
    // Onda3-respostas: os 2 canais novos chegam ao transporte via membros derivados.
    await (api as unknown as ApiRef).study.checkMathAnswer({ family: 'arithmetic', seed: 1, answerText: '2' });
    await (api as unknown as ApiRef).study.judgeAnswer({ answerText: 'x', context: { subject: 's', lessonExcerpt: 'e' } });
    assert.ok(ipc.invoked.includes(STUDY_CHANNELS.CHECK_MATH_ANSWER), 'study:check-math-answer deveria invocar');
    assert.ok(ipc.invoked.includes(STUDY_CHANNELS.JUDGE_ANSWER), 'study:judge-answer deveria invocar');

    // Subscreve os eventos expostos e confere que cada um toca o transporte.
    const unsubs: Array<() => void> = [
      (api as unknown as ApiRef).pi.onStreamEvent(() => {}),
      (api as unknown as ApiRef).localAi.onDownloadProgress(() => {}),
      (api as unknown as ApiRef).study.onLessonProgress(() => {}),
      // Onda2-research-live: canal novo do progresso da pesquisa (surf-research).
      (api as unknown as ApiRef).study.onResearchProgress(() => {}),
      (api as unknown as ApiRef).study.onTestAnswerEvent(() => {}),
      // Onda 8 (voz): eventos de STT e TTS.
      (api as unknown as ApiRef).stt.onModelDownloadProgress(() => {}),
      (api as unknown as ApiRef).stt.onStreamPartial(() => {}),
      (api as unknown as ApiRef).stt.onEngineStatus(() => {}),
      (api as unknown as ApiRef).localTts.onDownloadProgress(() => {}),
    ];
    assert.deepEqual(
      ipc.subscribed.sort(),
      [...EVENT_CHANNELS].sort(),
      'todos os canais de evento deveriam subscrever o transporte',
    );
    unsubs.forEach((stop) => assert.equal(typeof stop, 'function'));
  });
});

/** Ref menor para o teste chamar membros tipados sem carregar o App real. */
interface ApiRef {
  settings: { get: () => Promise<unknown> };
  pi: { execute: (req: unknown) => Promise<unknown>; onStreamEvent: (cb: () => void) => () => void };
  localAi: {
    chat: (req: { prompt: string }) => Promise<unknown>;
    onDownloadProgress: (cb: () => void) => () => void;
  };
  study: {
    testAnswer: () => Promise<unknown>;
    checkMathAnswer: (input: { family: string; seed: number; answerText: string }) => Promise<unknown>;
    judgeAnswer: (input: { answerText: string; context: { subject: string; lessonExcerpt: string } }) => Promise<unknown>;
    onLessonProgress: (cb: () => void) => () => void;
    onResearchProgress: (cb: () => void) => () => void;
    onTestAnswerEvent: (cb: () => void) => () => void;
  };
  stt: {
    onModelDownloadProgress: (cb: () => void) => () => void;
    onStreamPartial: (cb: () => void) => () => void;
    onEngineStatus: (cb: () => void) => () => void;
  };
  localTts: {
    onDownloadProgress: (cb: () => void) => () => void;
  };
}