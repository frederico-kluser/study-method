/**
 * tests/engineExecProofs.test.ts — as QUATRO PROVAS de execução de desafio
 * (`docs/16-engine-de-trilha.md` §5.4), pacote P-07 do plano de execução.
 *
 * Contratos que mordem aqui (todos com executor FAKE — A-P07-2: a suíte NÃO
 * gera processo real; nenhum child_process é tocado):
 *
 *   1. as quatro provas (solutionPasses, starterFails, countMatches,
 *      emptyStubFails) falham CADA UMA pelo motivo certo, isoladamente;
 *   2. stub vazio que PASSA reprova o desafio (teste tautológico);
 *   3. exit 0 com ZERO testes executados é FALHA, não sucesso (arquivo de
 *      teste vazio / glob vazio também saem 0 — exit code sozinho mente);
 *   4. NODE_TEST_CONTEXT não vaza para o processo filho (env montado pelo
 *      harness remove a var — e nunca muta o env base);
 *   5. ANSI no relatório não zera a contagem (parser sanitiza escapes);
 *   6. 137 é reportado como "timeout-ou-OOM", SEM afirmar qual dos dois;
 *   7. SEM_EXEC: limitador próprio limita concorrência (acquire/release
 *      injetáveis) e createHardenedExec serializa/paraleliza conforme o teto.
 *
 * A contagem DECLARADA vem de `countTestDeclarations` de `engine/extract` (a
 * única por AST — `// test(` comentado NÃO conta) via `verifyChallengeProofs`.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fsPromises } from 'node:fs';
import * as os from 'node:os';

import { countTestDeclarations } from '../electron/main/engine/extract';
import {
  EMPTY_STUB_CODE,
  SPEC_TEST_ARGS,
  exitCodeMeaning,
  judgeCountMatches,
  judgeEmptyStubFails,
  judgeSolutionPasses,
  judgeStarterFails,
  parseSpecCounts,
  verifyChallengeProofs,
  type ChallengeProofsInput,
  type ExecFn,
  type ExecResult,
  type ProofEnv,
} from '../electron/main/engine/exec/proofs';
import {
  NETWORK_HARDENING,
  buildChildEnv,
  cleanupDir,
  createHardenedExec,
  createSemaphore,
  defaultMaxConcurrency,
  prepareIsolatedDir,
} from '../electron/main/engine/exec/harness';

// ---------------------------------------------------------------------------
// Fixtures — código mínimo de exemplo (regra 3: nenhum conteúdo didático)
// ---------------------------------------------------------------------------

function specOut(tests: number, pass: number, fail: number): string {
  return [
    '✔ caso 1 (0.5ms)',
    `ℹ tests ${tests}`,
    `ℹ pass ${pass}`,
    `ℹ fail ${fail}`,
    'ℹ cancelled 0',
    'ℹ skipped 0',
    'ℹ todo 0',
    'ℹ duration_ms 5',
  ].join('\n');
}

/** Relatório spec com as linhas de resumo EMBRULHADAS em códigos ANSI. */
function ansiSpecOut(tests: number, pass: number, fail: number): string {
  return [
    '✔ caso 1',
    `\x1b[34mℹ tests ${tests}\x1b[39m`,
    `\x1b[32mℹ pass ${pass}\x1b[39m`,
    `\x1b[31mℹ fail ${fail}\x1b[39m`,
    'ℹ cancelled 0',
  ].join('\n');
}

function okRun(n = 2): ExecResult {
  return { exitCode: 0, stdout: specOut(n, n, 0), stderr: '' };
}

function failRun(): ExecResult {
  return { exitCode: 1, stdout: specOut(2, 1, 1), stderr: '' };
}

function emptyOkRun(): ExecResult {
  return { exitCode: 0, stdout: '', stderr: '' };
}

const BASE_INPUT: ChallengeProofsInput = {
  solutionCode: 'export function f(x) { return x + 1; }\n',
  starterCode: 'export function f(x) { throw new Error("não implementado"); }\n',
  testsCode: `import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { f } from './solution.mjs';\ntest('caso 1', () => { assert.equal(f(1), 2); });\ntest('caso 2', () => { assert.equal(f(2), 3); });\n`,
  expectedTestCount: 2,
};

/** Ambiente fake (A-P07-2): prepare/cleanup em memória, exec devolve fixtures. */
function makeFakeProofEnv(solution: ExecResult, starter: ExecResult, emptyStub: ExecResult) {
  const results = [solution, starter, emptyStub];
  const dirs = new Map<string, ExecResult>();
  const prepared: Array<{ code: string; testsCode: string; files?: { path: string; code: string }[] }> = [];
  const cleaned: string[] = [];
  const calls: Array<{ dir: string; args: string[]; opts?: { timeoutMs?: number; env?: NodeJS.ProcessEnv } }> = [];
  let n = 0;
  const env: ProofEnv = {
    async prepare(side) {
      const dir = `prova-dir-${(n += 1)}`;
      prepared.push(side);
      dirs.set(dir, results[prepared.length - 1]);
      return dir;
    },
    async cleanup(dir) {
      cleaned.push(dir);
    },
    async exec(dir, args, opts) {
      calls.push({ dir, args, opts });
      const r = dirs.get(dir);
      if (!r) throw new Error(`exec chamado em diretório não preparado: ${dir}`);
      return r;
    },
  };
  return { env, prepared, cleaned, calls };
}

// ---------------------------------------------------------------------------
// 1. As quatro provas — cada uma falha isoladamente pelo motivo certo
// ---------------------------------------------------------------------------

describe('as quatro provas de execução (§5.4)', () => {
  it('solutionPasses falha quando a solução NÃO roda limpa (exit != 0)', () => {
    const j = judgeSolutionPasses({ exitCode: 1, stdout: specOut(2, 1, 1), stderr: '' }, 2);
    assert.equal(j.passed, false);
    assert.equal(j.proof, 'solutionPasses');
    assert.match(j.reason ?? '', /não passou/);
    assert.match(j.reason ?? '', /exit 1/);
  });

  it('solutionPasses falha quando a solução tem testes falhando', () => {
    // exit 0 inventado por um executor fake não salva: relatório mostra fail > 0.
    const j = judgeSolutionPasses({ exitCode: 0, stdout: specOut(2, 1, 1), stderr: '' }, 2);
    assert.equal(j.passed, false);
    assert.match(j.reason ?? '', /testes falhando/);
  });

  it('solutionPasses falha quando a contagem executada difere do esperado', () => {
    const j = judgeSolutionPasses(okRun(1), 2);
    assert.equal(j.passed, false);
    assert.match(j.reason ?? '', /executou 1 de 2/);
  });

  it('starterFails falha quando o starter PASSA (exit 0)', () => {
    const j = judgeStarterFails(okRun(2));
    assert.equal(j.passed, false);
    assert.equal(j.proof, 'starterFails');
    assert.match(j.reason ?? '', /starterCode passou/);
  });

  it('countMatches falha quando o declarado difere do esperado', () => {
    const j = judgeCountMatches(1, 2, okRun(2));
    assert.equal(j.passed, false);
    assert.equal(j.proof, 'countMatches');
    assert.match(j.reason ?? '', /declarados \(1\) ≠ expectedTestCount \(2\)/);
  });

  it('countMatches falha com expectedTestCount === 0 (sem teste não há prova)', () => {
    const j = judgeCountMatches(0, 0, emptyOkRun());
    assert.equal(j.passed, false);
    assert.match(j.reason ?? '', /expectedTestCount deve ser ≥ 1/);
  });

  it('emptyStubFails falha quando o stub vazio PASSA (teste tautológico)', () => {
    const j = judgeEmptyStubFails(okRun(1));
    assert.equal(j.passed, false);
    assert.equal(j.proof, 'emptyStubFails');
    assert.match(j.reason ?? '', /tautológicos/);
  });

  it('as quatro passam com os resultados corretos (caminho verde)', () => {
    assert.equal(judgeSolutionPasses(okRun(2), 2).passed, true);
    assert.equal(judgeStarterFails(failRun()).passed, true);
    assert.equal(judgeCountMatches(2, 2, okRun(2)).passed, true);
    assert.equal(judgeEmptyStubFails(failRun()).passed, true);
  });

  it('veredito estruturado: qual prova falhou e por quê (agrega TODAS as falhas)', async () => {
    // solução roda 3 testes (exit 0) mas o esperado é 2 → solutionPasses e
    // countMatches falham (igualdade de contagem, defesa em profundidade);
    // stub vazio exit 0 → emptyStubFails. Três provas falham de uma vez.
    const triplePass = { exitCode: 0, stdout: specOut(3, 3, 0), stderr: '' };
    const { env } = makeFakeProofEnv(triplePass, failRun(), okRun(1));
    const v = await verifyChallengeProofs({ ...BASE_INPUT, expectedTestCount: 2 }, env);
    assert.equal(v.valid, false);
    assert.deepEqual(
      v.failures.map((f) => f.proof).sort(),
      ['countMatches', 'emptyStubFails', 'solutionPasses'].sort(),
    );
    assert.ok(v.failures.every((f) => typeof f.reason === 'string' && f.reason.length > 0));
  });
});

// ---------------------------------------------------------------------------
// 2. Stub vazio que PASSA reprova o desafio (tautologia)
// ---------------------------------------------------------------------------

describe('stub vazio contra o desafio', () => {
  it('stub vazio exit 0 → desafio INVÁLIDO (emptyStubFails)', async () => {
    const { env } = makeFakeProofEnv(okRun(2), failRun(), okRun(1));
    const v = await verifyChallengeProofs(BASE_INPUT, env);
    assert.equal(v.valid, false);
    assert.equal(v.failures.length, 1);
    assert.equal(v.failures[0].proof, 'emptyStubFails');
  });

  it('stub vazio exit diferente de 0 → prova 4 passa (testes exercitam o código)', async () => {
    const { env } = makeFakeProofEnv(okRun(2), failRun(), failRun());
    const v = await verifyChallengeProofs(BASE_INPUT, env);
    assert.equal(v.valid, true);
    assert.deepEqual(v.failures, []);
  });

  it('EMPTY_STUB_CODE é um módulo ESM válido sem exportações', () => {
    // Declarado como fixture de código mínimo: `export {};` (sem nenhuma
    // exportação nomeada/default — qualquer import nomeado do aluno quebra).
    assert.equal(EMPTY_STUB_CODE, 'export {};\n');
  });
});

// ---------------------------------------------------------------------------
// 3. Exit 0 com zero testes executados é FALHA
// ---------------------------------------------------------------------------

describe('exit 0 com ZERO testes executados (arquivo vazio / glob vazio)', () => {
  it('solutionPasses reprova exit 0 sem relatório', () => {
    const j = judgeSolutionPasses(emptyOkRun(), 2);
    assert.equal(j.passed, false);
    assert.match(j.reason ?? '', /ZERO testes executados/);
  });

  it('countMatches reprova exit 0 sem relatório (nada rodou)', () => {
    const j = judgeCountMatches(2, 2, emptyOkRun());
    assert.equal(j.passed, false);
    assert.match(j.reason ?? '', /nenhum teste executado/);
  });

  it('orquestrador: exit 0 com 0 executados derruba o desafio mesmo com starter falhando', async () => {
    // A armadilha completa: solução "passa" com exit 0, mas nada rodou.
    const { env } = makeFakeProofEnv(emptyOkRun(), failRun(), failRun());
    const v = await verifyChallengeProofs(BASE_INPUT, env);
    assert.equal(v.valid, false);
    assert.ok(v.failures.some((f) => f.proof === 'solutionPasses'));
    assert.ok(v.failures.some((f) => f.proof === 'countMatches'));
    assert.equal(v.executed, 0);
  });
});

// ---------------------------------------------------------------------------
// 4. NODE_TEST_CONTEXT não vaza para o processo filho
// ---------------------------------------------------------------------------

describe('NODE_TEST_CONTEXT não vaza (harness monta o env do filho)', () => {
  it('buildChildEnv remove a var (e NUNCA muta o env base)', () => {
    const base: NodeJS.ProcessEnv = {
      PATH: '/usr/bin',
      NODE_TEST_CONTEXT: 'runner-pai',
      FORCE_COLOR: '1',
      HTTP_PROXY: 'http://proxy',
      NODE_TLS_REJECT_UNAUTHORIZED: '0',
    };
    const env = buildChildEnv(base);
    assert.equal(env.NODE_TEST_CONTEXT, undefined, 'NODE_TEST_CONTEXT deve sumir do filho');
    assert.equal(env.FORCE_COLOR, undefined);
    assert.equal(env.HTTP_PROXY, undefined);
    assert.equal(env.NODE_TLS_REJECT_UNAUTHORIZED, undefined);
    assert.equal(env.NO_PROXY, '*');
    assert.equal(env.PATH, '/usr/bin', 'o resto do ambiente é preservado');
    assert.equal(base.NODE_TEST_CONTEXT, 'runner-pai', 'buildChildEnv não pode mutar o base');
  });

  it('createHardenedExec entrega o env limpo ao executor injetado', async () => {
    let captured: NodeJS.ProcessEnv | undefined;
    const inner: ExecFn = async (_dir, _args, opts) => {
      captured = opts?.env;
      return okRun(2);
    };
    const hard = createHardenedExec({ exec: inner });
    await hard('dir', [...SPEC_TEST_ARGS]);
    assert.ok(captured, 'o env deve chegar ao executor injetado');
    assert.equal(captured?.NODE_TEST_CONTEXT, undefined);
  });
});

// ---------------------------------------------------------------------------
// 5. ANSI no relatório não zera a contagem
// ---------------------------------------------------------------------------

describe('ANSI no relatório do node:test (cores herdadas do ambiente)', () => {
  it('parseSpecCounts sanitiza escapes antes do match', () => {
    const counts = parseSpecCounts(ansiSpecOut(2, 2, 0));
    assert.deepEqual(counts, { testsRun: 2, pass: 2, fail: 0 });
  });

  it('solutionPasses aprova solução cujo relatório vem com ANSI', () => {
    const j = judgeSolutionPasses({ exitCode: 0, stdout: ansiSpecOut(2, 2, 0), stderr: '' }, 2);
    assert.equal(j.passed, true);
  });

  it('countMatches mede executado mesmo com ANSI no meio do relatório', () => {
    const j = judgeCountMatches(2, 2, { exitCode: 0, stdout: ansiSpecOut(2, 2, 0), stderr: '' });
    assert.equal(j.passed, true);
  });
});

// ---------------------------------------------------------------------------
// 6. 137 = timeout-ou-OOM, sem afirmar qual dos dois
// ---------------------------------------------------------------------------

describe('exit 137 (timeout devolve 137, que também é OOM)', () => {
  it('exitCodeMeaning(137) é literalmente timeout-ou-OOM', () => {
    assert.equal(exitCodeMeaning(137), 'timeout-ou-OOM');
  });

  it('solutionPasses reporta a ambiguidade SEM afirmar qual dos dois', () => {
    const j = judgeSolutionPasses({ exitCode: 137, stdout: '', stderr: '' }, 2);
    assert.equal(j.passed, false);
    const reason = j.reason ?? '';
    assert.ok(reason.includes('timeout-ou-OOM'), `reason deve citar timeout-ou-OOM: ${reason}`);
    assert.ok(!reason.includes('por timeout'), `não pode afirmar timeout: ${reason}`);
    assert.ok(!reason.includes('por OOM'), `não pode afirmar OOM: ${reason}`);
  });

  it('veredito estruturado expõe o 137 no detail da prova que falhou', async () => {
    const { env } = makeFakeProofEnv({ exitCode: 137, stdout: '', stderr: '' }, failRun(), failRun());
    const v = await verifyChallengeProofs(BASE_INPUT, env);
    assert.equal(v.valid, false);
    const sol = v.failures.find((f) => f.proof === 'solutionPasses');
    assert.ok(sol, 'solutionPasses deve ter falhado');
    assert.equal(sol?.detail?.exitCode, 137);
    assert.ok((sol?.reason ?? '').includes('timeout-ou-OOM'));
  });
});

// ---------------------------------------------------------------------------
// A-P07-2 + orquestração — executor fake, diretórios isolados, contagem AST
// ---------------------------------------------------------------------------

describe('verifyChallengeProofs — orquestração (executor FAKE, zero processos)', () => {
  it('desafio válido: as quatro provas passam e o veredito é estruturado', async () => {
    const { env, prepared, cleaned, calls } = makeFakeProofEnv(okRun(2), failRun(), failRun());
    const v = await verifyChallengeProofs(BASE_INPUT, env);
    assert.equal(v.valid, true);
    assert.deepEqual(v.failures, []);
    assert.equal(v.declared, 2, 'declarados via countTestDeclarations (AST)');
    assert.equal(v.executed, 2, 'executados medidos na rodada da solução');
    assert.equal(calls.length, 3, 'exatamente 3 execuções — a única via é o ExecFn injetado');
    assert.ok(calls.every((c) => c.args.includes('--test') && c.args[c.args.length - 1] === 'test.mjs'));
    assert.equal(new Set(calls.map((c) => c.dir)).size, 3, 'cada lado roda num diretório ISOLADO próprio');
    assert.equal(prepared.length, 3);
    assert.equal(cleaned.length, 3, 'cleanup roda para os três diretórios');
    assert.deepEqual(v.executions, { solution: okRun(2), starter: failRun(), emptyStub: failRun() });
  });

  it('contagem declarada usa o AST: `// test(` comentado NÃO conta', async () => {
    const commented = `import { test } from 'node:test';\n// test('comentado — não é nó', () => {});\ntest('real 1', () => {});\ntest('real 2', () => {});\n`;
    assert.equal(countTestDeclarations(commented), 2, 'comentário não é nó (§5.3)');
    const { env } = makeFakeProofEnv(okRun(2), failRun(), failRun());
    const v = await verifyChallengeProofs({ ...BASE_INPUT, testsCode: commented }, env);
    assert.equal(v.valid, true);
    assert.equal(v.declared, 2);
  });

  it('timeoutMs é repassado ao ExecFn injetado', async () => {
    const { env, calls } = makeFakeProofEnv(okRun(2), failRun(), failRun());
    await verifyChallengeProofs({ ...BASE_INPUT, timeoutMs: 1234 }, env);
    assert.ok(calls.every((c) => c.opts?.timeoutMs === 1234));
  });

  it('falha de infraestrutura no prepare → veredito inválido com execError (fail-closed)', async () => {
    const env: ProofEnv = {
      async prepare() {
        throw new Error('disco cheio (fake)');
      },
      async cleanup() {},
      async exec() {
        throw new Error('nunca deve rodar');
      },
    };
    const v = await verifyChallengeProofs(BASE_INPUT, env);
    assert.equal(v.valid, false);
    assert.ok(v.execError);
    assert.equal(v.failures[0].proof, 'execError');
  });
});

// ---------------------------------------------------------------------------
// SEM_EXEC — limitador próprio, acquire/release injetáveis
// ---------------------------------------------------------------------------

describe('SEM_EXEC — teto de concorrência do harness', () => {
  it('createSemaphore limita e libera em FIFO', async () => {
    const sem = createSemaphore(2);
    const r1 = await sem.acquire();
    const r2 = await sem.acquire();
    assert.equal(sem.activeCount(), 2);

    let thirdResolved = false;
    const third = sem.acquire().then((release) => {
      thirdResolved = true;
      return release;
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(thirdResolved, false, 'terceiro acquire deve esperar vaga');

    r2(); // libera uma vaga
    const releaseThird = await third;
    assert.equal(thirdResolved, true, 'FIFO: o terceiro entra na ordem');
    assert.equal(sem.activeCount(), 2);

    releaseThird();
    r1();
    assert.equal(sem.activeCount(), 0);
  });

  it('teto padrão SEM_EXEC: availableParallelism()-1, nunca 0', () => {
    const max = defaultMaxConcurrency();
    const p = typeof os.availableParallelism === 'function' ? os.availableParallelism() : 1;
    assert.equal(max, Math.max(1, p - 1));
  });

  it('createHardenedExec usa o limitador injetado (serializa com teto 1)', async () => {
    let concurrent = 0;
    let maxSeen = 0;
    const inner: ExecFn = async () => {
      concurrent += 1;
      maxSeen = Math.max(maxSeen, concurrent);
      await new Promise((resolve) => setTimeout(resolve, 5));
      concurrent -= 1;
      return okRun(2);
    };
    const hard = createHardenedExec({ exec: inner, maxConcurrency: 1 });
    await Promise.all([hard('d', ['--test']), hard('d', ['--test']), hard('d', ['--test'])]);
    assert.equal(maxSeen, 1, 'teto 1 ⇒ nunca dois processos simultâneos');
  });

  it('createHardenedExec libera a vaga mesmo quando o exec lança', async () => {
    let releases = 0;
    const inner: ExecFn = async () => {
      throw new Error('boom');
    };
    const limiter: ReturnType<typeof createSemaphore> = {
      activeCount: () => 0,
      acquire: () => Promise.resolve(() => {
        releases += 1;
      }),
    };
    const hard = createHardenedExec({ exec: inner, limiter });
    await assert.rejects(() => hard('d', ['--test']));
    assert.equal(releases, 1, 'release sempre roda (finally)');
  });

  it('config de rede exposta para o executor real (documenta cobertura e limites)', () => {
    assert.ok(NETWORK_HARDENING.stripEnv.includes('HTTP_PROXY'));
    assert.ok(NETWORK_HARDENING.stripEnv.includes('NODE_TEST_CONTEXT') === false);
    assert.equal(NETWORK_HARDENING.fixedEnv.NO_PROXY, '*');
    assert.ok(NETWORK_HARDENING.scope.length >= 2, 'limites documentados');
  });
});

// ---------------------------------------------------------------------------
// prepareIsolatedDir — diretório isolado (raiz injetável) — sem processo real
// ---------------------------------------------------------------------------

describe('prepareIsolatedDir (workdir isolado injetável)', () => {
  it('escreve package.json + test.mjs + solution.mjs e é limpo via cleanupDir', async () => {
    const base = await fsPromises.mkdtemp('/tmp/proof-test-');
    try {
      const dir = await prepareIsolatedDir(base, {
        code: 'export const x = 1;\n',
        testsCode: "import { test } from 'node:test';\ntest('t', () => {});\n",
      });
      assert.ok(dir.startsWith(base), 'diretório criado SOB a raiz injetável');
      const files = await fsPromises.readdir(dir);
      assert.deepEqual(files.sort(), ['package.json', 'solution.mjs', 'test.mjs']);
      await cleanupDir(dir);
      await assert.rejects(() => fsPromises.stat(dir));
    } finally {
      await fsPromises.rm(base, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('rejeita path malicioso com `..` (defesa em profundidade)', async () => {
    await assert.rejects(() =>
      prepareIsolatedDir('/tmp', {
        code: 'x',
        testsCode: '',
        files: [{ path: '../escape.mjs', code: 'x' }],
      }),
    );
  });
});