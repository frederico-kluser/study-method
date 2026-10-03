/**
 * tests/gamesProgress.test.ts — progresso dos games em disco
 * (`engine/games/progress.ts`).
 *
 * O que prova:
 *   1. recordAttempt conta TODA tentativa (ok ou não) e guarda as linhas em
 *      history (máx. 50 — as últimas);
 *   2. bestLines/bestTimeMs SÓ registam run ok e SÓ MELHORAM (mínimo);
 *   3. completed é TRANSIÇÃO (completedAt seta 1x); ok repetido não repete;
 *   4. histograma: bins[i] = tentativas com i linhas, myIndex = esta tentativa,
 *      par = marcador do nível;
 *   5. persistência no padrão settingsStore: userData + JSON, corrompido ⇒
 *      vazio (nunca lança), normalização defensiva de arquivo editado.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  createGamesProgressStore,
  emptyGameProgress,
  histogramFor,
  normalizarProgresso,
  recordAttempt,
  HISTORY_MAX,
} from '../electron/main/engine/games/progress';

const AGORA = '2026-10-03T12:00:00.000Z';

describe('games/progress — recordAttempt (função pura)', () => {
  it('tentativa que falha conta attempt+history mas NÃO conclui nem dá record', () => {
    const r = recordAttempt(emptyGameProgress(), 'w', 'l', { lines: 9, timeMs: 50 }, false, { par: 3, now: AGORA });
    assert.equal(r.completed, false);
    assert.deepEqual(r.best, {});
    const entry = r.progress.worlds.w?.l;
    assert.equal(entry?.attempts, 1);
    assert.deepEqual(entry?.history, [9]);
    assert.equal(entry?.completedAt, undefined);
    assert.equal(entry?.bestLines, undefined);
    assert.equal(entry?.bestTimeMs, undefined);
  });

  it('run ok conclui (transição) e fixa os records', () => {
    const r = recordAttempt(emptyGameProgress(), 'w', 'l', { lines: 7, timeMs: 40 }, true, { par: 3, now: AGORA });
    assert.equal(r.completed, true);
    assert.equal(r.progress.worlds.w?.l?.completedAt, AGORA);
    assert.deepEqual(r.best, { lines: 7, timeMs: 40 });
  });

  it('ok repetido: completed=false (já concluído) e records SÓ MELHORAM', () => {
    const base = recordAttempt(emptyGameProgress(), 'w', 'l', { lines: 7, timeMs: 40 }, true, { par: 3, now: AGORA }).progress;
    const pior = recordAttempt(base, 'w', 'l', { lines: 9, timeMs: 60 }, true, { par: 3, now: AGORA });
    assert.equal(pior.completed, false, 'a transição já aconteceu');
    assert.deepEqual(pior.best, { lines: 7, timeMs: 40 }, 'nada piora o record');

    const melhorLinhas = recordAttempt(pior.progress, 'w', 'l', { lines: 5, timeMs: 90 }, true, { par: 3, now: AGORA });
    assert.deepEqual(melhorLinhas.best, { lines: 5, timeMs: 40 }, 'só as linhas melhoram');

    const melhorTempo = recordAttempt(melhorLinhas.progress, 'w', 'l', { lines: 8, timeMs: 10 }, true, { par: 3, now: AGORA });
    assert.deepEqual(melhorTempo.best, { lines: 5, timeMs: 10 }, 'só o tempo melhora');
  });

  it('history guarda as linhas de toda tentativa e corta nas últimas 50', () => {
    let progress = emptyGameProgress();
    for (let i = 0; i < HISTORY_MAX + 5; i += 1) {
      progress = recordAttempt(progress, 'w', 'l', { lines: i, timeMs: 1 }, false, { par: 3 }).progress;
    }
    const entry = progress.worlds.w?.l;
    assert.equal(entry?.attempts, HISTORY_MAX + 5);
    assert.equal(entry?.history.length, HISTORY_MAX);
    assert.equal(entry?.history[0], 5, 'as 5 primeiras tentativas caíram fora');
    assert.equal(entry?.history[entry.history.length - 1], HISTORY_MAX + 4);
  });
});

describe('games/progress — histogramFor', () => {
  it('bins[i] = contagens por nº de linhas; myIndex e par no mesmo eixo', () => {
    const h = histogramFor([3, 3, 5], 3, 4);
    assert.deepEqual(h.bins, [0, 0, 0, 2, 0, 1], 'índice = nº de linhas, valor = contagem');
    assert.equal(h.myIndex, 3);
    assert.equal(h.par, 4);
    assert.equal(h.bins.length, 6, 'domínio cobre max(history, par, myLines)');
  });

  it('histórico vazio: o domínio cobre par e tentativa atual (contagens só do history)', () => {
    // bins conta APENAS o history (no fluxo real a tentativa atual já lá está,
    // gravada antes do histograma — ver games:run); myIndex/par são posições
    // no eixo e ainda assim estendem o domínio dos bins.
    const h = histogramFor([], 2, 2);
    assert.deepEqual(h.bins, [0, 0, 0]);
    assert.equal(h.myIndex, 2);
    assert.equal(h.par, 2);
  });
});

describe('games/progress — normalização defensiva', () => {
  it('lixo no arquivo vira progresso vazio; entradas inválidas caem fora', () => {
    assert.deepEqual(normalizarProgresso(null), emptyGameProgress());
    assert.deepEqual(normalizarProgresso({ worlds: 'não é objeto' }), emptyGameProgress());
    const n = normalizarProgresso({
      worlds: {
        w: {
          boa: { attempts: '3', history: [2, 'x', -1, 4.6], completedAt: 7, bestLines: 2.2 },
          ma: 'lixo',
        },
      },
    });
    const boa = n.worlds.w?.boa;
    assert.equal(boa?.attempts, 0, 'attempts não-numérico não é inventado');
    assert.deepEqual(boa?.history, [2, 5], 'só números finitos ≥0, arredondados');
    assert.equal(boa?.completedAt, undefined, 'completedAt não-string cai fora');
    assert.equal(boa?.bestLines, 2, 'bestLines arredonda');
    assert.equal(n.worlds.w?.ma, undefined);
  });
});

describe('games/progress — persistência (padrão settingsStore)', () => {
  let root: string;
  let userData: string;

  before(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'games-progress-'));
    userData = path.join(root, 'userData');
  });

  after(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('load de arquivo ausente ⇒ vazio; save/load faz round-trip', async () => {
    const store = createGamesProgressStore({ userDataPath: userData });
    assert.deepEqual(await store.load(), emptyGameProgress());

    const r = await store.recordAttempt('w1', 'l1', { lines: 4, timeMs: 20 }, true, { par: 3, now: AGORA });
    assert.equal(r.completed, true);
    const relido = await store.load();
    assert.equal(relido.worlds.w1?.l1?.bestLines, 4);
    assert.equal(relido.worlds.w1?.l1?.completedAt, AGORA);
  });

  it('recordAttempt acumula entre chamadas (persistido a cada run)', async () => {
    const store = createGamesProgressStore({ userDataPath: userData });
    await store.recordAttempt('w1', 'l1', { lines: 6, timeMs: 30 }, false, { par: 3, now: AGORA });
    const relido = await store.load();
    assert.equal(relido.worlds.w1?.l1?.attempts, 2);
    assert.deepEqual(relido.worlds.w1?.l1?.history, [4, 6]);
  });

  it('arquivo corrompido ⇒ vazio (nunca lança) e o próximo save regrava', async () => {
    const store = createGamesProgressStore({ userDataPath: userData });
    await fs.writeFile(path.join(userData, 'games-progress.json'), '{ não é json', 'utf8');
    assert.deepEqual(await store.load(), emptyGameProgress());
    await store.recordAttempt('w2', 'l', { lines: 1, timeMs: 1 }, true, { par: 1, now: AGORA });
    const relido = await store.load();
    assert.equal(relido.worlds.w2?.l?.bestLines, 1);
  });
});
