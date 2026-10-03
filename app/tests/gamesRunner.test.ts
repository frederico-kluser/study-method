/**
 * tests/gamesRunner.test.ts — o runner de níveis io (`engine/games/runner.ts`)
 * com execução REAL (python3 sempre; C/Rust quando a toolchain existe).
 *
 * O que prova:
 *   1. normalização da comparação (CRLF→LF, whitespace final por linha,
 *      newlines finais) — o contrato de julgamento;
 *   2. happy path python3 real: ok=true, cases na ordem, metrics.lines;
 *   3. saída errada: ok=false com expected/actual (brutos) e hidden SEM os dois;
 *   4. erro de compilação (exec injetado): todos os casos falham com
 *      diagnóstico do compilador no `actual` dos visíveis;
 *   5. timeout (exec injetado, code 137): caso falha com o texto de timeout;
 *   6. C e Rust reais quando há toolchain (gcc/rustc existem neste ambiente);
 *   7. o slice vertical do IPC (`buildGamesHandlers`): games:run grava a
 *      tentativa, devolve best/histogram/completed e games:list-worlds reflete
 *      o progresso.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { spawnSync } from 'node:child_process';
import * as os from 'node:os';
import * as path from 'node:path';

import { GAMES_CHANNELS } from '@shared/ipc-contract';
import type { GameLang, GameRunResult, GameWorldSummary } from '../src/types/games';
import { buildGamesHandlers } from '../electron/main/engine/games/ipc';
import { createGamesProgressStore } from '../electron/main/engine/games/progress';
import {
  countCodeLines,
  normalizeOutput,
  runGameCases,
  type IoExecFn,
} from '../electron/main/engine/games/runner';
import type { GameCaseContent, GameLevelContent } from '../electron/main/engine/games/schema';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CASES: GameCaseContent[] = [
  { name: 'caso-1', input: '1 2\n', expectedOutput: '3\n', hidden: false },
  { name: 'caso-2', input: '10 20\n', expectedOutput: '30\n', hidden: false },
  { name: 'oculto', input: '2 2\n', expectedOutput: '4\n', hidden: true },
];

function nivelCom(cases: GameCaseContent[], langs: GameLevelContent['langs']): GameLevelContent {
  return {
    id: 'l1',
    title: 'Soma',
    enunciado: 'Leia dois números e escreva a soma.',
    introduces: ['entrada-saida'],
    boss: false,
    contract: { mode: 'io', cases },
    langs,
    optimize: { lines: { par: 3 }, timeMs: { parMs: 100 } },
  };
}

const PY_OK = 'a, b = map(int, input().split())\nprint(a + b)\n';
const PY_ERRADO = 'print(int(input().split()[0]))\n';

const C_OK = [
  '#include <stdio.h>',
  'int main(void) {',
  '  long a, b;',
  '  if (scanf("%ld %ld", &a, &b) == 2) printf("%ld\\n", a + b);',
  '  return 0;',
  '}',
  '',
].join('\n');

const RS_OK = [
  'use std::io::Read;',
  'fn main() {',
  '    let mut s = String::new();',
  '    std::io::stdin().read_to_string(&mut s).unwrap();',
  '    let mut it = s.split_whitespace();',
  '    let a: i64 = it.next().unwrap().parse().unwrap();',
  '    let b: i64 = it.next().unwrap().parse().unwrap();',
  '    println!("{}", a + b);',
  '}',
  '',
].join('\n');

function temFerramenta(bin: string): boolean {
  return spawnSync(bin, ['--version'], { stdio: 'ignore' }).status === 0;
}

// ---------------------------------------------------------------------------
// 1 — normalização (o contrato de julgamento)
// ---------------------------------------------------------------------------

describe('runner — normalizeOutput / countCodeLines', () => {
  it('CRLF→LF, whitespace final por linha e newlines finais não reprova', () => {
    assert.equal(normalizeOutput('3  \r\n\r\n'), normalizeOutput('3\n'));
    assert.equal(normalizeOutput('a \nb\t\nc'), 'a\nb\nc');
    assert.equal(normalizeOutput('x\n\n\n'), 'x');
    // whitespace NO MEIO é conteúdo e preserva-se.
    assert.notEqual(normalizeOutput('a  b'), normalizeOutput('a b'));
  });

  it('countCodeLines conta só linhas não-vazias', () => {
    assert.equal(countCodeLines('a\n\n  \nb\n'), 2);
    assert.equal(countCodeLines(PY_OK), 2);
    assert.equal(countCodeLines(''), 0);
  });
});

// ---------------------------------------------------------------------------
// 2–3 — python3 real
// ---------------------------------------------------------------------------

describe('runner — python3 real (contrato io)', () => {
  const level = nivelCom(CASES, {
    python: { starter: '# TODO\n', reference: 'ref\n' },
  });

  it('happy path: ok=true, 3 cases na ordem, lines=2, hidden sem expected/actual', async () => {
    const res = await runGameCases(level, 'python', PY_OK);
    assert.equal(res.ok, true);
    assert.deepEqual(res.cases.map((c) => c.name), ['caso-1', 'caso-2', 'oculto']);
    assert.deepEqual(res.cases.map((c) => c.ok), [true, true, true]);
    assert.equal(res.metrics.lines, 2);
    assert.ok(res.metrics.timeMs >= 0 && Number.isFinite(res.metrics.timeMs));
    const oculto = res.cases[2];
    assert.deepEqual(Object.keys(oculto).sort(), ['name', 'ok'], 'hidden NUNCA leva expected/actual');
  });

  it('saída errada: ok=false com expected/actual brutos no caso visível', async () => {
    const res = await runGameCases(level, 'python', PY_ERRADO);
    assert.equal(res.ok, false);
    assert.equal(res.cases[0].ok, false);
    assert.equal(res.cases[0].expected, '3\n');
    assert.equal(res.cases[0].actual, '1\n', 'actual = stdout BRUTO (o que o programa imprimiu)');
  });

  it('normalização vale na comparação: esperado com CRLF/whitespace passa', async () => {
    const levelSujo = nivelCom(
      [{ name: 'sujo', input: '1 2\n', expectedOutput: '3  \r\n\r\n', hidden: false }],
      { python: { starter: '', reference: 'x' } },
    );
    const res = await runGameCases(levelSujo, 'python', PY_OK);
    assert.equal(res.ok, true);
    assert.equal(res.cases[0].ok, true);
  });

  it('código que estoura: caso falha e actual mostra o stderr', async () => {
    const levelUm = nivelCom(CASES.slice(0, 1), { python: { starter: '', reference: 'x' } });
    const res = await runGameCases(levelUm, 'python', 'raise RuntimeError("bum")\n');
    assert.equal(res.ok, false);
    assert.match(String(res.cases[0].actual), /RuntimeError|bum/);
  });
});

// ---------------------------------------------------------------------------
// 4–5 — compilação e timeout (exec INJETADO — determinístico)
// ---------------------------------------------------------------------------

describe('runner — falhas de infraestrutura (exec injetado)', () => {
  it('erro de compilação: TODOS os casos falham com diagnóstico no actual', async () => {
    const exec: IoExecFn = async (_dir, _args, _opts) => ({
      code: 1,
      stdout: '',
      stderr: 'solucao.c:1:1: error: expected expression',
    });
    const level = nivelCom(CASES, { c: { starter: '/* t */\n', reference: 'ref\n' } });
    const res = await runGameCases(level, 'c', 'int main(void){ return 0', { exec });
    assert.equal(res.ok, false);
    assert.ok(res.cases.every((c) => !c.ok));
    assert.equal(res.cases[0].expected, '3\n');
    assert.match(String(res.cases[0].actual), /error: expected expression/);
    assert.equal(res.cases[2].actual, undefined, 'hidden continua sem actual');
  });

  it('timeout (137): caso falha com o texto de tempo esgotado', async () => {
    const exec: IoExecFn = async (_dir, _args, _opts) => ({ code: 137, stdout: '', stderr: '' });
    const level = nivelCom(CASES.slice(0, 1), { python: { starter: '', reference: 'x' } });
    const res = await runGameCases(level, 'python', PY_OK, { exec });
    assert.equal(res.ok, false);
    assert.match(String(res.cases[0].actual), /tempo esgotado/);
    assert.equal(res.metrics.timeMs, 0, 'nenhum caso passou: sem mediana');
  });

  it('a mediana só considera os casos que passaram', async () => {
    // fake: caso 1 passa (exit 0 + stdout certo), caso 2 falha.
    let n = 0;
    const exec: IoExecFn = async () => {
      n += 1;
      return n === 1 ? { code: 0, stdout: '3\n', stderr: '' } : { code: 1, stdout: '0\n', stderr: '' };
    };
    const level = nivelCom(CASES.slice(0, 2), { python: { starter: '', reference: 'x' } });
    const res = await runGameCases(level, 'python', PY_OK, { exec });
    assert.equal(res.ok, false);
    assert.deepEqual(res.cases.map((c) => c.ok), [true, false]);
    assert.ok(res.metrics.timeMs >= 0);
  });
});

// ---------------------------------------------------------------------------
// 6 — C e Rust reais (toolchain do ambiente)
// ---------------------------------------------------------------------------

describe('runner — C real (quando há compilador)', { skip: !['cc', 'gcc', 'clang'].some(temFerramenta) }, () => {
  it('programa C completo passa no contrato io', async () => {
    const level = nivelCom(CASES, { c: { starter: '/* t */\n', reference: 'ref\n' } });
    const res = await runGameCases(level, 'c', C_OK);
    assert.equal(res.ok, true);
    assert.equal(res.metrics.lines, 6);
  });
});

describe('runner — Rust real (quando há rustc)', { skip: !temFerramenta('rustc') }, () => {
  it('programa Rust completo passa no contrato io', async () => {
    const level = nivelCom(CASES, { rust: { starter: '// t\n', reference: 'ref\n' } });
    const res = await runGameCases(level, 'rust', RS_OK);
    assert.equal(res.ok, true);
    assert.equal(res.metrics.lines, 9);
  });
});

// ---------------------------------------------------------------------------
// 7 — slice vertical do IPC (handlers reais com conteúdo/tempo reais)
// ---------------------------------------------------------------------------

describe('games/ipc — games:run grava tentativa e devolve o contrato', () => {
  let root: string;
  let gamesDir: string;
  let userData: string;

  before(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'games-ipc-'));
    gamesDir = path.join(root, 'games');
    userData = path.join(root, 'userData');
    await fs.mkdir(path.join(gamesDir, 'alpha'), { recursive: true });
    await fs.writeFile(
      path.join(gamesDir, 'alpha', 'world.json'),
      JSON.stringify({ id: 'alpha', title: 'Alpha', description: 'desc' }),
      'utf8',
    );
    await fs.writeFile(
      path.join(gamesDir, 'alpha', 'l1.json'),
      JSON.stringify({
        id: 'l1',
        title: 'Soma',
        enunciado: 'Leia dois números e escreva a soma.',
        introduces: ['entrada-saida'],
        contract: {
          mode: 'io',
          cases: [
            { name: 'caso-1', input: '1 2\n', expectedOutput: '3\n' },
            { name: 'oculto', input: '2 2\n', expectedOutput: '4\n', hidden: true },
          ],
        },
        langs: { python: { starter: '# t\n', reference: 'ref\n' } },
        optimize: { lines: { par: 2 }, timeMs: { parMs: 100 } },
      }),
      'utf8',
    );
  });

  after(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('run → completed na 1ª vez; run de novo → completed:false e records melhoram', async () => {
    const store = createGamesProgressStore({ userDataPath: userData });
    const handlers = buildGamesHandlers({ getGamesDir: () => gamesDir, getProgressStore: () => store });

    const runHandler = handlers.get(GAMES_CHANNELS.RUN);
    assert.ok(runHandler, 'games:run tem de estar registado');

    const primeira = (await runHandler(null, 'alpha', 'l1', 'python', PY_OK)) as GameRunResult;
    assert.equal(primeira.ok, true);
    assert.equal(primeira.completed, true, '1ª conclusão é TRANSIÇÃO');
    assert.equal(primeira.best.lines, 2);
    assert.ok(typeof primeira.best.timeMs === 'number', 'bestTimeMs vem do run ok');
    assert.equal(primeira.histogram.myIndex, 2);
    assert.equal(primeira.histogram.par, 2);
    assert.ok(primeira.histogram.bins[2] >= 1, 'o histograma tem esta tentativa');

    const segunda = (await runHandler(null, 'alpha', 'l1', 'python', PY_OK)) as GameRunResult;
    assert.equal(segunda.ok, true);
    assert.equal(segunda.completed, false, 'já concluído: não repete a transição');
    assert.equal(segunda.best.lines, 2, 'bestLines SÓ melhora');
    assert.equal(segunda.histogram.bins[2], 2, 'as duas tentativas estão no histograma');

    // progresso em disco reflete tudo.
    const progress = await store.load();
    const entry = progress.worlds.alpha?.l1;
    assert.equal(entry?.attempts, 2);
    assert.ok(entry?.completedAt, 'completedAt fica gravado');
    assert.equal(entry?.bestLines, 2);

    // listWorlds reflete o progresso.
    const listHandler = handlers.get(GAMES_CHANNELS.LIST_WORLDS);
    const worlds = (await listHandler?.(null)) as GameWorldSummary[];
    assert.equal(worlds[0].levels[0].completed, true);
    assert.equal(worlds[0].levels[0].bestLines, 2);

    // loadLevel devolve o payload sem spoilers.
    const loadHandler = handlers.get(GAMES_CHANNELS.LOAD_LEVEL);
    const payload = (await loadHandler?.(null, 'alpha', 'l1', 'python')) as { caseCount: number; hiddenCount: number };
    assert.equal(payload.caseCount, 1);
    assert.equal(payload.hiddenCount, 1);
  });

  it('run com linguagem/nível inválidos REJEITA (fail-closed)', async () => {
    const store = createGamesProgressStore({ userDataPath: userData });
    const handlers = buildGamesHandlers({ getGamesDir: () => gamesDir, getProgressStore: () => store });
    const runHandler = handlers.get(GAMES_CHANNELS.RUN);
    await assert.rejects(() => Promise.resolve(runHandler?.(null, 'alpha', 'l1', 'go' as GameLang, PY_OK)), /lang/);
    await assert.rejects(() => Promise.resolve(runHandler?.(null, 'alpha', 'nao-existe', 'python', PY_OK)), /não encontrado/);
  });
});
