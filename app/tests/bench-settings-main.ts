/**
 * bench-settings-main.ts — BENCHMARK (TEMPORÁRIO) dos handlers IPC reais de
 * Settings, FORA do Electron (os builders são DI-puros).
 *
 * Mede, com o MESMO backend do app (sql.js/WASM — node:sqlite não existe no
 * Electron), o custo real de cada canal que os 4 painéis chamam no mount:
 *   - track:orphans  (reconciliação: disco + SQLite)
 *   - keys:get-status (settingsStore em arquivo, safeStorage fake)
 *   - settings:get    (leitura do arquivo de settings)
 *   - localAi:list    (modelStore + catálogo, sem node-llama-cpp)
 *
 * Executar:  cd app && npx tsx tests/bench-settings-main.ts
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { performance } from 'node:perf_hooks';

import { openSqliteSqlJs } from '../electron/main/db/connection';
import { createLessonRepo } from '../electron/main/db/repo';
import { buildTrackHandlers } from '../electron/main/ipc/track-handlers';
import { TRACK_CHANNELS } from '../shared/ipc-contract';
import { createSettingsStore } from '../electron/main/services/settingsStore';
import { buildKeysHandlers } from '../electron/main/ipc/keys-handlers';
import { KEYS_CHANNELS } from '../shared/ipc-contract';
import { createModelStore } from '../electron/main/services/embeddedLlm/modelStore';

function stats(samples: number[]): string {
  const sorted = [...samples].sort((a, b) => a - b);
  const min = sorted[0];
  const p50 = sorted[Math.floor(sorted.length / 2)];
  const max = sorted[sorted.length - 1];
  return `min=${min.toFixed(1)}ms p50=${p50.toFixed(1)}ms max=${max.toFixed(1)}ms`;
}

async function timeAsync(n: number, fn: () => Promise<unknown>): Promise<number[]> {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    await fn();
    out.push(performance.now() - t0);
  }
  return out;
}

async function main(): Promise<void> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-settings-'));
  const dbPath = path.join(tmp, 'study.db');

  // ── Banco com dados REALISTAS (backend idêntico ao Electron: sql.js) ──
  const conn = await openSqliteSqlJs(dbPath);
  conn.migrate.migrate();
  const repo = createLessonRepo(() => conn.db);

  // 12 trilhas: 8 instaladas (python-iniciante é real) + 4 órfãs. Cada uma com
  // 40 aulas concluídas, proficiência, 10 desafios regenerados e 30 tentativas.
  const slugs = ['python-iniciante'];
  for (let s = 0; s < 11; s++) slugs.push(`trilha-bench-${s}`);
  const tSeed = performance.now();
  for (const slug of slugs) {
    const { subject } = await repo.upsertSubject(`Bench ${slug}`, 'programming');
    for (let l = 0; l < 40; l++) {
      await repo.markTrackLessonDone(slug, `lesson-${l}`);
    }
    await repo.setTrackProficiency(slug, 'passed', 3);
    for (let c = 0; c < 10; c++) {
      await repo.insertGeneratedChallenge({
        id: `gen-${slug}-${c}`,
        trackSlug: slug,
        lessonId: `lesson-${c}`,
        challengeId: `ch-${slug}-${c}`,
        statement: '# enunciado',
        starterCode: '',
        testsCode: '',
        solutionCode: '',
        expectedTestCount: 0,
        createdAt: new Date().toISOString(),
      });
    }
    // Tentativas de desafio: 30 por matéria (INSERT direto — a repo grava
    // attempts por outro fluxo e o bench só precisa de linhas para COUNT).
    for (let a = 0; a < 30; a++) {
      conn.db
        .prepare('INSERT INTO challenge_attempts (id, subject_id, lesson_id, challenge_id, verdict, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(`att-${slug}-${a}`, subject.id, `lesson-${a % 40}`, `ch-${slug}-${a % 10}`, 'passed', new Date().toISOString());
    }
  }
  console.log(`seed: ${slugs.length} trilhas em ${(performance.now() - tSeed).toFixed(0)}ms`);

  // O BANCO DO ELECTRON VIVE EM MEMÓRIA (sql.js carrega o arquivo na abertura,
  // no boot do app) — as queries abaixo são exatamente o custo por IPC call.

  // ── 1) track:orphans (reconciliação) ──
  const tracksDir = path.resolve(__dirname, '..', 'resources', 'tracks');
  const trackHandlers = buildTrackHandlers({ getTracksDir: () => tracksDir, repo });
  const orphansHandler = trackHandlers.get(TRACK_CHANNELS.ORPHANS)!;
  const orphansTimes = await timeAsync(15, () =>
    Promise.resolve(orphansHandler({ sender: { send: () => undefined } })),
  );
  console.log(`track:orphans   (reconciliação, ${slugs.length} trilhas): ${stats(orphansTimes)}`);

  // ── 2) keys:get-status + settings:get (settingsStore real em arquivo) ──
  const store = createSettingsStore({
    userDataPath: tmp,
    safeStorage: {
      isEncryptionAvailable: () => false,
      encryptString: (s: string) => Buffer.from(s),
      decryptString: (b: Buffer) => b.toString(),
    },
  } as never);
  await store.setApiKey('openrouter', 'sk-or-v1-bench');
  await store.setValue('llmValidated', true);
  const keysHandlers = buildKeysHandlers(async () => store);
  const statusHandler = keysHandlers.get(KEYS_CHANNELS.GET_STATUS)!;
  const statusTimes = await timeAsync(15, () =>
    Promise.resolve(statusHandler({ sender: { send: () => undefined } })),
  );
  console.log(`keys:get-status (settingsStore arquivo):    ${stats(statusTimes)}`);
  const settingsTimes = await timeAsync(15, () => store.getValue('defaultModelProvider'));
  console.log(`settings:get    (leitura de arquivo):       ${stats(settingsTimes)}`);

  // ── 3) localAi:list (modelStore real, catálogo compartilhado) ──
  const modelsDir = path.join(tmp, 'models');
  fs.mkdirSync(modelsDir, { recursive: true });
  const modelStore = createModelStore({ modelsDir });
  const listTimes = await timeAsync(15, async () => {
    const list = await modelStore.list();
    const activeId = await modelStore.getActive();
    return list.map((info) => ({ ...info, active: info.id === activeId }));
  });
  console.log(`localAi:list    (índice vazio + catálogo):  ${stats(listTimes)}`);

  conn.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}

void main();
