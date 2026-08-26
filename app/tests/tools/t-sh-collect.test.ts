/**
 * tests/tools/t-sh-collect.test.ts — regressão da coleta recursiva do tools/t.sh.
 *
 * A Onda 1 trocou o globstar (bash 5) por `find | sort` no caso DIRETÓRIO para
 * portar ao bash 3.2 do macOS. Este teste SPAWNA o t.sh sobre o fixture
 * `tests/_fixtures/t-sh-collect/` e confere que TODOS os `*.test.ts` /
 * `*.test.tsx` — incluindo o de profundidade 3 e o dotfile — foram executados.
 *
 * Também exercita a EMPTY-GLOB GUARD (dir/glob/arquivo sem match → exit 1) e o
 * uso incorreto (sem argumento → exit 2). Roda sob `/bin/bash` e sob o `bash`
 * do PATH (nesta máquina ambos são o 3.2.57; em outra podem ser bash 5 — a
 * coleta precisa ser portável nos dois).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { join } from 'node:path';

/** Raiz da app (o t.sh faz `cd "$repo_root"` sozinho, mas o cwd do spawn é aqui). */
const APP_ROOT = join(__dirname, '..', '..');
const FIXTURE = 'tests/_fixtures/t-sh-collect';

interface RunResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}

/**
 * SPAWNA o t.sh com o shell indicado e captura stdout/stderr/exit.
 * `shell` é o caminho do interpretador (`/bin/bash` ou `bash` do PATH).
 */
function runTsh(args: string[], shell: string): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    // Sem NODE_TEST_CONTEXT: quando este teste roda DENTRO de um `node --test`
    // (suite completa), o env herda `NODE_TEST_CONTEXT=child-v8` e o `node --test`
    // aninhado do t.sh se recusa a rodar ("run() is being called recursively").
    // Remover a variável faz o processo aninhado rodar os fixtures normalmente.
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    const child = spawn(shell, ['tools/t.sh', ...args], {
      cwd: APP_ROOT,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (d: string) => {
      stdout += d;
    });
    child.stderr.on('data', (d: string) => {
      stderr += d;
    });
    child.on('error', reject);
    child.on('close', (code, signal) => resolve({ code, signal, stdout, stderr }));
  });
}

/** Nomes EXATOS dos testes do fixture (1 test() por arquivo). */
const EXPECTED_TEST_NAMES = [
  't-sh coletou a.test.ts (profundidade 1)',
  't-sh coletou sub/b.test.ts (profundidade 2)',
  't-sh coletou sub/sub/c.test.ts (profundidade 3)',
  't-sh coletou d.test.tsx (extensão tsx)',
  't-sh coletou .hidden.test.ts (dotfile)',
];
const EXPECTED_TESTS = EXPECTED_TEST_NAMES.length; // 5

function summaryCount(output: string, key: string): number {
  const m = new RegExp(`${key} (\\d+)`).exec(output);
  assert.ok(m, `saída sem linha de resumo "${key} N"`);
  return Number(m![1]);
}

describe('tools/t.sh — coleta recursiva do caso DIRETÓRIO', () => {
  it('executa TODOS os *.test.ts/*.test.tsx (profundidades 1/2/3 + tsx + dotfile) via /bin/bash', async () => {
    const r = await runTsh([FIXTURE], '/bin/bash');
    assert.equal(r.code, 0, `exit != 0\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`);

    const combined = r.stdout + r.stderr;
    // cada arquivo do fixture tem exatamente 1 test(): `pass == N arquivos`
    // prova que o find não perdeu nenhum (inclusive o de profundidade 3 e o dotfile).
    assert.equal(summaryCount(combined, 'tests'), EXPECTED_TESTS);
    assert.equal(summaryCount(combined, 'pass'), EXPECTED_TESTS);
    assert.equal(summaryCount(combined, 'fail'), 0);

    // prova complementar: cada teste nomeado (1 por arquivo) apareceu na saída.
    for (const name of EXPECTED_TEST_NAMES) {
      assert.ok(combined.includes(name), `teste não executado: ${name}`);
    }
  });

  it('mesma coleta via `bash` do PATH (portabilidade bash 3.2/5)', async () => {
    const r = await runTsh([FIXTURE], 'bash');
    assert.equal(r.code, 0, `exit != 0\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
    const combined = r.stdout + r.stderr;
    assert.equal(summaryCount(combined, 'pass'), EXPECTED_TESTS);
    assert.equal(summaryCount(combined, 'fail'), 0);
  });
});

describe('tools/t.sh — EMPTY-GLOB GUARD e uso', () => {
  it('diretório sem nenhum *.test.ts → exit 1 com "[t.sh GUARD]"', async () => {
    const r = await runTsh([`${FIXTURE}/empty`], '/bin/bash');
    assert.equal(r.code, 1);
    assert.ok(r.stderr.includes('[t.sh GUARD]'), `stderr sem guard:\n${r.stderr}`);
  });

  it('glob sem match → exit 1 com "[t.sh GUARD]"', async () => {
    const r = await runTsh([`${FIXTURE}/nao-existe-*.test.ts`], '/bin/bash');
    assert.equal(r.code, 1);
    assert.ok(r.stderr.includes('[t.sh GUARD]'), `stderr sem guard:\n${r.stderr}`);
  });

  it('arquivo literal inexistente → exit 1 com "[t.sh GUARD]"', async () => {
    const r = await runTsh([`${FIXTURE}/nao-existe.test.ts`], '/bin/bash');
    assert.equal(r.code, 1);
    assert.ok(r.stderr.includes('[t.sh GUARD]'), `stderr sem guard:\n${r.stderr}`);
  });

  it('sem argumento → exit 2 (uso incorreto)', async () => {
    const r = await runTsh([], '/bin/bash');
    assert.equal(r.code, 2);
    assert.ok(r.stderr.includes('usage:'), `stderr sem usage:\n${r.stderr}`);
  });
});

describe('tools/t.sh — caso GLOB (expansão de shell)', () => {
  it('globo positivo casa só os arquivos do nível 1 (com dotglob, sem recursão)', async () => {
    // `*.test.ts` casa a.test.ts e .hidden.test.ts (dotglob ON), mas NÃO
    // sub/*.test.ts (sem `**`) nem d.test.tsx (extensão diferente).
    const r = await runTsh([`${FIXTURE}/*.test.ts`], '/bin/bash');
    assert.equal(r.code, 0, `exit != 0\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
    const combined = r.stdout + r.stderr;
    assert.equal(summaryCount(combined, 'pass'), 2);
    assert.ok(combined.includes('t-sh coletou a.test.ts (profundidade 1)'));
    assert.ok(combined.includes('t-sh coletou .hidden.test.ts (dotfile)'));
  });
});
