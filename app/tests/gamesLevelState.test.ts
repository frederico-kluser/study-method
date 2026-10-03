/**
 * tests/gamesLevelState.test.ts — a MÁQUINA DE ESTADO do editor/runner do
 * nível (`src/views/GamesView/gameLevelState.ts`), extraída do contentor
 * `GameLevelView` (STORY-SPEC §5: estado separado da view).
 *
 * O que prova (as transições que a view fazia em `useState` soltos):
 *   1. ARRANQUE — a carga inicia com o contentor (loading, sem payload, sem
 *      resultado de submissão);
 *   2. CARGA — sucesso carrega o payload e REPOE o editor ao starter da
 *      linguagem; erro guarda o TIPO ('timeout' | 'load', nunca texto — a copy
 *      é da view); troca de linguagem/retry limpa tudo o que pertencia ao
 *      nível anterior;
 *   3. EDITOR — `code/change` só mexe no código;
 *   4. RUNNER — `run/start` liga o busy e limpa o erro de infraestrutura;
 *      `run/success` guarda o resultado (mesmo com ok=false: caso falhado NÃO
 *      é erro de infraestrutura); `run/error` marca o erro de infraestrutura e
 *      MANTÉM a lista de casos como estava;
 *   5. RETENTATIVA — `retry` incrementa o `loadToken` (o efeito de carga da
 *      view vigia-o) e limpa o estado do nível;
 *   6. `hasLevelLoadError` — o estado de erro da view (payload ausente após a
 *      tentativa, ou erro explícito).
 *
 * Sem jsdom, sem React (node:test + tsx): o reducer é uma função pura.
 *
 * Reprodução: `cd app && bash tools/t.sh tests/gamesLevelState.test.ts`
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  hasLevelLoadError,
  initialGameLevelState,
  reduceGameLevelState,
  type GameLevelEvent,
  type GameLevelState,
} from '../src/views/GamesView/gameLevelState';
import type {
  GameLevelPayload,
  GameRunResult,
} from '../src/types/games';

/* ─── Fixtures do contrato ────────────────────────────────────────────────── */

function payload(starter: string): GameLevelPayload {
  return {
    id: 'nivel-1',
    title: 'O primeiro recado',
    enunciado: 'Escreva um programa que imprima "Olá".',
    introduces: ['lacos', 'funcoes'],
    starter,
    caseCount: 3,
    hiddenCount: 1,
    optimize: { lines: { par: 4 }, timeMs: { parMs: 120 } },
    boss: false,
  };
}

function runResult(over: Partial<GameRunResult> = {}): GameRunResult {
  return {
    ok: true,
    cases: [
      { name: 'caso 1', ok: true, expected: 'Olá\n', actual: 'Olá\n' },
      { name: 'caso escondido', ok: true },
    ],
    metrics: { lines: 6, timeMs: 40 },
    best: { lines: 6, timeMs: 40 },
    histogram: { bins: [0, 1, 2, 1], myIndex: 2, par: 4 },
    completed: true,
    ...over,
  };
}

/** Aplica uma sequência de eventos a partir do estado inicial. */
function run(...events: GameLevelEvent[]): GameLevelState {
  return events.reduce(reduceGameLevelState, initialGameLevelState());
}

/* ─── 1. Arranque ─────────────────────────────────────────────────────────── */

describe('initialGameLevelState', () => {
  it('arranca em loading, sem payload nem resultado de submissão', () => {
    const s = initialGameLevelState();
    assert.equal(s.loading, true);
    assert.equal(s.payload, null);
    assert.equal(s.loadError, null);
    assert.equal(s.code, '');
    assert.equal(s.busy, false);
    assert.equal(s.runResult, null);
    assert.equal(s.runError, false);
    assert.equal(s.loadToken, 0);
    assert.equal(hasLevelLoadError(s), false);
  });
});

/* ─── 2. Carga do payload ─────────────────────────────────────────────────── */

describe('carga do nível (load/*)', () => {
  it('load/start reabre a carga e limpa o que pertencia ao nível anterior', () => {
    const s = run(
      { type: 'load/success', payload: payload('# starter') },
      { type: 'run/success', result: runResult() },
      { type: 'run/error' },
      { type: 'load/start' },
    );
    assert.equal(s.loading, true);
    assert.equal(s.payload, null);
    assert.equal(s.runResult, null);
    assert.equal(s.runError, false);
    assert.equal(s.loadError, null);
  });

  it('load/success carrega o payload e repõe o editor ao STARTER', () => {
    const s = run(
      { type: 'code/change', code: 'código do aluno' },
      { type: 'load/success', payload: payload('print("Olá")') },
    );
    assert.equal(s.loading, false);
    assert.equal(s.payload?.id, 'nivel-1');
    assert.equal(s.code, 'print("Olá")');
    assert.equal(hasLevelLoadError(s), false);
  });

  it('load/error guarda o TIPO do erro (timeout vs carga comum) — a copy é da view', () => {
    const timeout = run({ type: 'load/error', kind: 'timeout' });
    assert.equal(timeout.loading, false);
    assert.equal(timeout.loadError, 'timeout');
    assert.equal(hasLevelLoadError(timeout), true);

    const comum = run({ type: 'load/error', kind: 'load' });
    assert.equal(comum.loadError, 'load');
    assert.equal(hasLevelLoadError(comum), true);
  });

  it('load/error depois de um sucesso não pode sobreviver sem payload novo', () => {
    // O contrato: erro ⇒ payload nulo (a view mostra o Alert + retentativa).
    const s = run(
      { type: 'load/success', payload: payload('# ok') },
      { type: 'load/start' },
      { type: 'load/error', kind: 'load' },
    );
    assert.equal(s.payload, null);
    assert.equal(hasLevelLoadError(s), true);
  });
});

/* ─── 3. Editor ───────────────────────────────────────────────────────────── */

describe('editor (code/change)', () => {
  it('só mexe no código — payload/resultado ficam como estavam', () => {
    const s = run(
      { type: 'load/success', payload: payload('# starter') },
      { type: 'run/success', result: runResult() },
      { type: 'code/change', code: 'while True: pass' },
    );
    assert.equal(s.code, 'while True: pass');
    assert.equal(s.payload?.id, 'nivel-1');
    assert.equal(s.runResult?.ok, true);
    assert.equal(s.busy, false);
    assert.equal(s.runError, false);
  });
});

/* ─── 4. Runner (run/*) ───────────────────────────────────────────────────── */

describe('submissão (run/*)', () => {
  it('run/start liga o busy e limpa o erro de infraestrutura anterior', () => {
    const s = run(
      { type: 'run/error' },
      { type: 'run/start' },
    );
    assert.equal(s.busy, true);
    assert.equal(s.runError, false);
  });

  it('run/success guarda o resultado e desliga o busy', () => {
    const s = run(
      { type: 'run/start' },
      { type: 'run/success', result: runResult({ ok: false, completed: false }) },
    );
    assert.equal(s.busy, false);
    assert.equal(s.runResult?.ok, false);
    assert.equal(s.runError, false);
  });

  it('caso que falhou NÃO é erro de infraestrutura: ok=false via run/success', () => {
    const s = run({
      type: 'run/success',
      result: runResult({
        ok: false,
        completed: false,
        cases: [{ name: 'caso 1', ok: false, expected: 'a\n', actual: 'b\n' }],
      }),
    });
    assert.equal(s.runError, false);
    assert.equal(s.runResult?.cases[0]?.ok, false);
  });

  it('run/error marca a infraestrutura e MANTÉM a lista de casos anterior', () => {
    const anterior = runResult({ ok: false });
    const s = run(
      { type: 'run/success', result: anterior },
      { type: 'code/change', code: 'outra coisa' },
      { type: 'run/start' },
      { type: 'run/error' },
    );
    assert.equal(s.busy, false);
    assert.equal(s.runError, true);
    assert.equal(s.runResult, anterior);
  });
});

/* ─── 5. Retentativa ──────────────────────────────────────────────────────── */

describe('retentativa (retry)', () => {
  it('incrementa o loadToken (o efeito de carga vigia-o) e limpa o nível', () => {
    const s = run(
      { type: 'load/success', payload: payload('# starter') },
      { type: 'run/success', result: runResult() },
      { type: 'retry' },
    );
    assert.equal(s.loadToken, 1);
    assert.equal(s.loading, true);
    assert.equal(s.payload, null);
    assert.equal(s.runResult, null);
  });

  it('cada retentativa conta (token monotónico)', () => {
    const s = run({ type: 'retry' }, { type: 'retry' }, { type: 'retry' });
    assert.equal(s.loadToken, 3);
  });
});

/* ─── 6. Estado de erro da view ───────────────────────────────────────────── */

describe('hasLevelLoadError', () => {
  it('sem tentativa concluída ainda (loading) não é erro', () => {
    assert.equal(hasLevelLoadError(initialGameLevelState()), false);
  });

  it('payload ausente após a tentativa é erro (o caso "payload nulo" da view)', () => {
    const s = run({ type: 'load/error', kind: 'load' });
    assert.equal(hasLevelLoadError(s), true);
  });

  it('payload carregado não é erro', () => {
    const s = run({ type: 'load/success', payload: payload('# ok') });
    assert.equal(hasLevelLoadError(s), false);
  });
});

/* ─── Imutabilidade ───────────────────────────────────────────────────────── */

describe('reducer puro', () => {
  it('nunca muta o estado anterior', () => {
    const antes = initialGameLevelState();
    const snapshot = { ...antes };
    reduceGameLevelState(antes, { type: 'code/change', code: 'x' });
    reduceGameLevelState(antes, { type: 'retry' });
    assert.deepEqual(antes, snapshot);
  });

  it('evento desconhecido devolve o próprio estado (identidade preservada)', () => {
    const s = initialGameLevelState();
    const estranho = { type: 'misterio' } as unknown as GameLevelEvent;
    assert.equal(reduceGameLevelState(s, estranho), s);
  });
});
