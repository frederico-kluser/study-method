/**
 * tests/e2eStubs.test.ts — contrato do harness E2E do main (services/e2eStubs).
 *
 * Onda 1 (onda1-alinhar-imports-main) converteu os imports dinâmicos deste
 * módulo (trackLoader, trackService, tutorChat, challengeExec) para estáticos
 * e tocou os handlers de trilha (buildTrackStubHandlers). O módulo NÃO tinha
 * teste unitário: só as specs Playwright o exercitavam (com build). Este
 * arquivo fixa, em node:test SEM electron:
 *   - o gate de segurança (registerE2EStubs é no-op fora do modo E2E);
 *   - o registro EXATO dos canais de cada grupo num ipc fake (keys/study/pi/
 *     track/localAi/voz — sem folga: nenhum canal pode sumir nem sobrar);
 *   - e2eGatePhase por cenário de envars (blocked/ready/invalid/offline);
 *   - smoke dos handlers de trilha (LIST/GET/LESSON rodam de verdade num
 *     E2E_WORKSPACE_ROOT temporário — o grafo estático pós-conversão).
 *
 * O flag STUDY_METHOD_E2E é lido no LOAD do módulo; cada cenário usa um
 * import cache-busted (query string) para obter uma instância fresca com o
 * ambiente desejado. Envars são restauradas no final. TODOS os testes usam um
 * E2E_WORKSPACE_ROOT próprio (tmpRoot do arquivo) — o harness nunca escreve
 * no workspace compartilhado /tmp/study-method-e2e.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fsp } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  KEYS_CHANNELS,
  LOCAL_AI_CHANNELS,
  PI_CHANNELS,
  STT_CHANNELS,
  STUDY_CHANNELS,
  TRACK_CHANNELS,
  TTS_CHANNELS,
} from '../shared/ipc-contract';
import type { IpcMainHandleLike } from '../electron/main/ipc/safeHandle';
import type * as E2EStubs from '../electron/main/services/e2eStubs';

const ENV_KEYS = [
  'STUDY_METHOD_E2E',
  'E2E_GATE',
  'E2E_NETWORK',
  'E2E_KEYS',
  'E2E_WORKSPACE_ROOT',
] as const;

let savedEnv = new Map<string, string | undefined>();
let tmpRoot = '';

before(async () => {
  for (const k of ENV_KEYS) savedEnv.set(k, process.env[k]);
  // Workspace E2E PRÓPRIO do arquivo: o harness (writeFixtureTrack etc.)
  // nunca toca no workspace compartilhado /tmp/study-method-e2e.
  tmpRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'e2e-stubs-unit-'));
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

/** Instância fresca do e2eStubs (o flag E2E é lido no load do módulo). */
async function loadE2EStubs(): Promise<typeof E2EStubs> {
  loadSeq += 1;
  const url = `../electron/main/services/e2eStubs.ts?unit-${loadSeq}`;
  return (await import(url)) as typeof E2EStubs;
}

function makeFakeIpc(): { channels: string[]; ipc: IpcMainHandleLike } {
  const channels: string[] = [];
  return {
    channels,
    ipc: {
      removeHandler(_channel: string): void {
        /* no-op — fake não tem handlers prévios */
      },
      handle(channel: string, _fn: unknown): void {
        channels.push(channel);
      },
    },
  };
}

/**
 * Conjunto EXATO de canais registrados por registerE2EStubs (sem folga),
 * derivado do source de cada builder:
 *  - buildKeysStubHandlers (e2eStubs.ts): todos os 5 de KEYS_CHANNELS;
 *  - buildStudyHandlers (ipc/study-handlers.ts): os 24 canais invoke de
 *    STUDY_CHANNELS — NÃO registra os push-only (PLAN_LESSON,
 *    LESSON_PROGRESS, RESEARCH_PROGRESS, TEST_ANSWER_EVENT);
 *  - buildPiHandlers (ipc/pi-handlers.ts): 3 invoke — STREAM_EVENT é emit;
 *  - buildTrackStubHandlers (e2eStubs.ts): 10 invoke — exclui o push
 *    CHALLENGE_REGENERATE_PROGRESS;
 *  - buildLocalAiStubHandlers (e2eStubs.ts): 8 invoke — exclui o push
 *    DOWNLOAD_PROGRESS;
 *  - buildVoiceStubHandlers (e2eStubs.ts): STT/TTS invoke — exclui os push
 *    STT (MODEL_DOWNLOAD_PROGRESS, STREAM_PARTIAL, ENGINE_STATUS) e
 *    TTS (DOWNLOAD_PROGRESS).
 */
function expectedRegisteredChannels(): string[] {
  const expected = [
    ...Object.values(KEYS_CHANNELS),
    // study (24 invoke — fonte: ipc/study-handlers.ts, linhas 450-840)
    STUDY_CHANNELS.RESOLVE_SKILL_DIR,
    STUDY_CHANNELS.GET_SETUPS,
    STUDY_CHANNELS.CREATE_SETUP,
    STUDY_CHANNELS.NEW_SESSION,
    STUDY_CHANNELS.GENERATE_LESSON,
    STUDY_CHANNELS.GET_LESSON,
    STUDY_CHANNELS.GET_FINDINGS,
    STUDY_CHANNELS.LIST_CHALLENGES,
    STUDY_CHANNELS.CREATE_CHALLENGE,
    STUDY_CHANNELS.VERIFY_CHALLENGE,
    STUDY_CHANNELS.TEST_ANSWER,
    STUDY_CHANNELS.LIST_WORKSPACE_FILES,
    STUDY_CHANNELS.READ_WORKSPACE_FILE,
    STUDY_CHANNELS.WRITE_WORKSPACE_FILE,
    STUDY_CHANNELS.DELETE_WORKSPACE_FILE,
    STUDY_CHANNELS.LIST_TOPICS,
    STUDY_CHANNELS.LIST_LESSONS_BY_SUBJECT,
    STUDY_CHANNELS.GET_LESSON_BY_ID,
    STUDY_CHANNELS.RECORD_ANSWER,
    STUDY_CHANNELS.MARK_LESSON_COMPLETED,
    STUDY_CHANNELS.CLEAR_PROGRESS,
    STUDY_CHANNELS.MARK_CHALLENGE_ATTEMPT,
    STUDY_CHANNELS.CHECK_MATH_ANSWER,
    STUDY_CHANNELS.JUDGE_ANSWER,
    // pi (3 invoke — STREAM_EVENT é emit-only)
    ...Object.values(PI_CHANNELS).filter((ch) => ch !== PI_CHANNELS.STREAM_EVENT),
    // track (10 invoke — fonte: buildTrackStubHandlers)
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
    // localAi (8 invoke — DOWNLOAD_PROGRESS é push)
    ...Object.values(LOCAL_AI_CHANNELS).filter(
      (ch) => ch !== LOCAL_AI_CHANNELS.DOWNLOAD_PROGRESS,
    ),
    // voz (STT 8 + TTS 8 invoke — os demais são push)
    ...Object.values(STT_CHANNELS).filter(
      (ch) =>
        ch !== STT_CHANNELS.MODEL_DOWNLOAD_PROGRESS &&
        ch !== STT_CHANNELS.STREAM_PARTIAL &&
        ch !== STT_CHANNELS.ENGINE_STATUS,
    ),
    ...Object.values(TTS_CHANNELS).filter((ch) => ch !== TTS_CHANNELS.DOWNLOAD_PROGRESS),
  ];
  return expected;
}

describe('e2eStubs: gate de segurança (fora do modo E2E)', () => {
  it('registerE2EStubs é no-op: retorna false e NÃO registra nada no ipc fake', async () => {
    delete process.env.STUDY_METHOD_E2E;
    const mod = await loadE2EStubs();
    const { channels, ipc } = makeFakeIpc();
    assert.equal(mod.registerE2EStubs(ipc), false);
    assert.deepEqual(channels, []);
  });
});

describe('e2eStubs: registro no modo E2E', () => {
  it('registerE2EStubs devolve true e registra EXATAMENTE os canais de cada grupo', async () => {
    process.env.STUDY_METHOD_E2E = '1';
    process.env.E2E_GATE = 'ready';
    const mod = await loadE2EStubs();
    const { channels, ipc } = makeFakeIpc();

    assert.equal(mod.registerE2EStubs(ipc), true);

    // Sem folga: nem falta nem sobra nenhum canal invoke dos grupos do harness.
    assert.deepEqual(
      [...channels].sort(),
      expectedRegisteredChannels().sort(),
      `canais registrados ≠ esperados (ausentes/extras no diff acima)`,
    );

    // Idempotente: re-registro não falha e devolve true de novo.
    assert.equal(mod.registerE2EStubs(ipc), true);
  });

  it('e2eGatePhase: sem chaves → blocked', async () => {
    process.env.STUDY_METHOD_E2E = '1';
    delete process.env.E2E_GATE;
    delete process.env.E2E_NETWORK;
    delete process.env.E2E_KEYS;
    const mod = await loadE2EStubs();
    const { ipc } = makeFakeIpc();
    mod.registerE2EStubs(ipc); // seedKeys sem gate → chaves vazias
    assert.equal(mod.e2eGatePhase(), 'blocked');
  });

  it('e2eGatePhase: E2E_GATE=ready → ready', async () => {
    process.env.STUDY_METHOD_E2E = '1';
    process.env.E2E_GATE = 'ready';
    delete process.env.E2E_NETWORK;
    delete process.env.E2E_KEYS; // E2E_KEYS=invalid herdado faria seed de chave inválida
    const mod = await loadE2EStubs();
    const { ipc } = makeFakeIpc();
    mod.registerE2EStubs(ipc);
    assert.equal(mod.e2eGatePhase(), 'ready');
  });

  it('e2eGatePhase: chaves inválidas → blocked', async () => {
    process.env.STUDY_METHOD_E2E = '1';
    process.env.E2E_GATE = 'invalid';
    delete process.env.E2E_NETWORK;
    delete process.env.E2E_KEYS;
    const mod = await loadE2EStubs();
    const { ipc } = makeFakeIpc();
    mod.registerE2EStubs(ipc);
    assert.equal(mod.e2eGatePhase(), 'blocked');
  });

  it('e2eGatePhase: E2E_NETWORK=offline → offline', async () => {
    process.env.STUDY_METHOD_E2E = '1';
    process.env.E2E_GATE = 'ready';
    process.env.E2E_NETWORK = 'offline';
    delete process.env.E2E_KEYS;
    const mod = await loadE2EStubs();
    const { ipc } = makeFakeIpc();
    mod.registerE2EStubs(ipc);
    assert.equal(mod.e2eGatePhase(), 'offline');
  });
});

describe('e2eStubs: chaves no slot openrouter (migração)', () => {
  it('E2E_GATE=ready semeia uma chave no formato sk-or-v1-… e o gate fica ready', async () => {
    process.env.STUDY_METHOD_E2E = '1';
    process.env.E2E_GATE = 'ready';
    delete process.env.E2E_NETWORK;
    delete process.env.E2E_KEYS;
    const mod = await loadE2EStubs();
    const { ipc } = makeFakeIpc();
    mod.registerE2EStubs(ipc);

    const map = mod.buildKeysStubHandlers();
    const status = (await map.get(KEYS_CHANNELS.GET_STATUS)!()) as {
      llmConfigured: boolean;
      llmValidated: boolean;
    };
    assert.equal(status.llmConfigured, true);
    assert.equal(status.llmValidated, true);

    // A validação do stub reporta o provider REAL.
    const result = (await map.get(KEYS_CHANNELS.VALIDATE_LLM)!(undefined)) as {
      isValid: boolean;
      provider: string;
    };
    assert.equal(result.isValid, true);
    assert.equal(result.provider, 'openrouter');
  });

  it('keys:set-key grava a chave do LLM no slot "openrouter"', async () => {
    process.env.STUDY_METHOD_E2E = '1';
    delete process.env.E2E_GATE;
    delete process.env.E2E_NETWORK;
    delete process.env.E2E_KEYS;
    const mod = await loadE2EStubs();
    const map = mod.buildKeysStubHandlers();
    const setKey = map.get(KEYS_CHANNELS.SET_KEY)!;
    const getStatus = map.get(KEYS_CHANNELS.GET_STATUS)!;

    await setKey(undefined, 'openrouter', 'sk-or-v1-nova');
    let status = (await getStatus()) as { llmConfigured: boolean };
    assert.equal(status.llmConfigured, true);

    // Apagar pelo mesmo nome limpa o slot.
    await setKey(undefined, 'openrouter', '');
    status = (await getStatus()) as { llmConfigured: boolean };
    assert.equal(status.llmConfigured, false);
  });
});

describe('e2eStubs: buildTrackStubHandlers (smoke real, sem build)', () => {
  it('mapa expõe todos os canais de trilha e LIST/GET/LESSON rodam de verdade', async () => {
    const mod = await loadE2EStubs();
    const map = mod.buildTrackStubHandlers();

    for (const ch of [
      TRACK_CHANNELS.LIST,
      TRACK_CHANNELS.GET,
      TRACK_CHANNELS.LESSON,
      TRACK_CHANNELS.TUTOR_CHAT,
      TRACK_CHANNELS.CHALLENGE_GET,
      TRACK_CHANNELS.CHALLENGE_SUBMIT,
      TRACK_CHANNELS.PROFICIENCY_GET,
    ]) {
      assert.ok(map.has(ch), `handler de trilha ausente: ${ch}`);
    }

    // LIST — cria os fixtures no workspace temporário e lista a trilha.
    // O slug `nodejs-do-zero` daqui é o da fixture que o PRÓPRIO stub escreve
    // (`services/e2eStubs.ts`, writeFixtureTrack) num workspace temporário —
    // nunca o de uma trilha publicada. A trilha de produção com esse slug foi
    // apagada em 2026-09-02 e este teste não sentiu: ele nunca a leu.
    const listHandler = map.get(TRACK_CHANNELS.LIST)!;
    const list = (await listHandler()) as { ok: true; tracks: Array<{ slug: string }> };
    assert.equal(list.ok, true);
    assert.ok(list.tracks.length >= 1, 'esperava ao menos a trilha fixture');
    assert.equal(list.tracks[0].slug, 'nodejs-do-zero');

    // GET — detalhe da trilha fixture. (assinatura dos handlers: (event, payload))
    const getHandler = map.get(TRACK_CHANNELS.GET)!;
    const detail = (await getHandler(undefined, { trackSlug: 'nodejs-do-zero' })) as {
      ok: true;
      track: { slug: string } | null;
    };
    assert.equal(detail.ok, true);
    assert.equal(detail.track?.slug, 'nodejs-do-zero');

    // LESSON — aula fixture do módulo.
    const lessonHandler = map.get(TRACK_CHANNELS.LESSON)!;
    const lessonRes = (await lessonHandler(undefined, {
      trackSlug: 'nodejs-do-zero',
      lessonId: 'aula-1',
    })) as { ok: true; lesson: { slug: string; title: string } | null };
    assert.equal(lessonRes.ok, true);
    assert.equal(lessonRes.lesson?.slug, 'aula-1');
    assert.ok(lessonRes.lesson && lessonRes.lesson.title.length > 0);
  });

  it('LESSON de aula inexistente → ok:true com lesson:null (mesmo shape do e2e)', async () => {
    const mod = await loadE2EStubs();
    const map = mod.buildTrackStubHandlers();
    const lessonHandler = map.get(TRACK_CHANNELS.LESSON)!;
    const lessonRes = (await lessonHandler(undefined, {
      trackSlug: 'nodejs-do-zero',
      lessonId: 'nao-existe',
    })) as { ok: true; lesson: unknown };
    assert.equal(lessonRes.ok, true);
    assert.equal(lessonRes.lesson, null);
  });
});
