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
 *   7. SEM_EXEC: o semáforo do P-01 (runtime/semaphore — P-27) limita
 *      concorrência (acquire→release-fn, release idempotente) e
 *      createHardenedExec serializa/paraleliza conforme o teto.
 *
 * A contagem DECLARADA vem de `countTestDeclarations` de `engine/extract` (a
 * única por AST — `// test(` comentado NÃO conta) via `verifyChallengeProofs`.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fsPromises } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import vm from 'node:vm';

import { countTestDeclarations } from '../electron/main/engine/extract';
import {
  EMPTY_STUB_CODE,
  SPEC_TEST_ARGS,
  execOutput,
  exitCodeMeaning,
  judgeCountMatches,
  judgeEmptyStubFails,
  judgeSolutionPasses,
  judgeStarterFails,
  judgeTypesCheck,
  parseSpecCounts,
  verifyChallengeProofs,
  type ChallengeProofsInput,
  type ExecFn,
  type ExecResult,
  type ProofEnv,
} from '../electron/main/engine/exec/proofs';
import {
  TYPES_CHECK_NAO_APLICAVEL,
  alvosDaChecagem,
  criarTypesCheck,
  politicaDeTipos,
  resolverCompiladorNpm,
} from '../electron/main/engine/exec/typesCheck';
import { listAdapters, type LanguageAdapter } from '../electron/main/engine/lang/registry';
import { javascriptAdapter } from '../electron/main/engine/lang/javascript';
import {
  EXIT_GUARD_SOURCE,
  NETWORK_HARDENING,
  buildChildEnv,
  cleanupDir,
  createHardenedExec,
  escreverExitGuard,
  prepareIsolatedDir,
} from '../electron/main/engine/exec/harness';
import {
  createSemaphore,
  defaultExecConcurrency,
  type Semaphore,
} from '../electron/main/engine/runtime/semaphore';

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
// 3.5. Relatório FORJADO (CRITICAL 1) — o parser lê o ÚLTIMO bloco do runner
// ---------------------------------------------------------------------------

describe('relatório FORJADO pelo código sob teste (CRITICAL 1 — primeiro bloco não vale)', () => {
  it('parseSpecCounts lê o ÚLTIMO bloco: a forja (primeiro) não mascara o runner (último)', () => {
    const forgedThenReal = [
      // forjado: o código sob teste imprime um resumo spec falso no próprio stdout
      'ℹ tests 2',
      'ℹ pass 2',
      'ℹ fail 0',
      '✔ caso real (0.5ms)',
      // resumo REAL do runner — emitido por ÚLTIMO, depois de todo stdout do código sob teste
      'ℹ tests 1',
      'ℹ suites 0',
      'ℹ pass 1',
      'ℹ fail 0',
      'ℹ cancelled 0',
      'ℹ skipped 0',
      'ℹ todo 0',
      'ℹ duration_ms 5',
    ].join('\n');
    assert.deepEqual(
      parseSpecCounts(execOutput({ exitCode: 0, stdout: forgedThenReal, stderr: '' })),
      { testsRun: 1, pass: 1, fail: 0, skipped: 0 },
      'executado vem do ÚLTIMO bloco (o do runner real), não da forja',
    );
  });

  it('a forja ANSI também não mascara: sanitização antes do bloco, último bloco vence', () => {
    const forgedAnsiThenReal = [
      '\x1b[32mℹ tests 2\x1b[39m',
      '\x1b[32mℹ pass 2\x1b[39m',
      '\x1b[31mℹ fail 0\x1b[39m',
      '\x1b[34mℹ tests 1\x1b[39m',
      '\x1b[32mℹ pass 1\x1b[39m',
      '\x1b[31mℹ fail 0\x1b[39m',
    ].join('\n');
    const counts = parseSpecCounts(forgedAnsiThenReal);
    assert.deepEqual(counts, { testsRun: 1, pass: 1, fail: 0, skipped: 0 });
  });

  it('veredito INVÁLIDO: forja "tests 2/pass 2/fail 0" + resumo real "tests 1" + exit 0', async () => {
    // A prova empírica com executor real: o código sob teste imprime o resumo
    // falso e o runner ainda emite o dele por último (o arquivo vira um teste
    // que "passou"). Com o ÚLTIMO bloco lido, executado real = 1 ≠ expected 2
    // → a prova 1 e/ou a 3 falham.
    const forgedThenReal: ExecResult = {
      exitCode: 0,
      stdout: [
        'ℹ tests 2',
        'ℹ pass 2',
        'ℹ fail 0',
        '✔ caso de verdade (0.5ms)',
        'ℹ tests 1',
        'ℹ suites 0',
        'ℹ pass 1',
        'ℹ fail 0',
        'ℹ cancelled 0',
        'ℹ skipped 0',
        'ℹ todo 0',
        'ℹ duration_ms 5',
      ].join('\n'),
      stderr: '',
    };
    const { env } = makeFakeProofEnv(forgedThenReal, failRun(), failRun());
    const v = await verifyChallengeProofs(BASE_INPUT, env);
    assert.equal(v.valid, false, 'forja + exit 0 não pode produzir veredito válido');
    assert.ok(
      v.failures.some((f) => f.proof === 'solutionPasses') || v.failures.some((f) => f.proof === 'countMatches'),
      'a prova 1 e/ou a 3 falham — a forja deixa de satisfazer as provas',
    );
    assert.equal(v.executed, 1, 'executado medido no ÚLTIMO bloco (o do runner), nunca na forja');
    assert.ok(v.failures.some((f) => f.proof === 'countMatches'), 'prova 3: executado real (1) ≠ expected (2)');
  });

  it('bloco de resumo REAL vindo por último com contagem consistente segue passando', () => {
    // Caso legítimo: stdout do código sob teste SEM linhas de resumo + resumo
    // real por último — nada muda, continua passando.
    const legit = [
      'resultado intermediário do aluno (stdout normal)',
      '✔ caso 1 (0.5ms)',
      '✔ caso 2 (0.3ms)',
      'ℹ tests 2',
      'ℹ suites 0',
      'ℹ pass 2',
      'ℹ fail 0',
      'ℹ cancelled 0',
      'ℹ skipped 0',
      'ℹ todo 0',
      'ℹ duration_ms 5',
    ].join('\n');
    const j = judgeSolutionPasses({ exitCode: 0, stdout: legit, stderr: '' }, 2);
    assert.equal(j.passed, true);
  });
});

// ---------------------------------------------------------------------------
// 3.6. Passagem INTEGRAL (HIGH 2) — skipped > 0 / pass < testsRun reprova a prova 1
// ---------------------------------------------------------------------------

describe('prova 1 é passagem INTEGRAL: relatório internamente inconsistente reprova', () => {
  /** `test('x', { skip: true })` → tests 2 / pass 1 / fail 0 / skipped 1. */
  const skippedReport = (): string =>
    ['✔ caso 1 (0.5ms)', '﹣ caso 2 (0.1ms) # SKIP', 'ℹ tests 2', 'ℹ pass 1', 'ℹ fail 0', 'ℹ cancelled 0', 'ℹ skipped 1', 'ℹ todo 0'].join('\n');

  it('judgeSolutionPasses reprova relatório com skipped > 0', () => {
    const j = judgeSolutionPasses({ exitCode: 0, stdout: skippedReport(), stderr: '' }, 2);
    assert.equal(j.passed, false);
    assert.equal(j.proof, 'solutionPasses');
    assert.match(j.reason ?? '', /SKIPADOS/);
  });

  it('judgeSolutionPasses reprova pass < testsRun mesmo com fail 0 e skipped 0', () => {
    // sem skip nem falha declarada, mas um teste não passou (ex.: cancelado).
    const partial = [
      '✔ caso 1 (0.5ms)',
      'ℹ tests 2',
      'ℹ pass 1',
      'ℹ fail 0',
      'ℹ cancelled 0',
      'ℹ skipped 0',
      'ℹ todo 0',
    ].join('\n');
    const j = judgeSolutionPasses({ exitCode: 0, stdout: partial, stderr: '' }, 2);
    assert.equal(j.passed, false);
    assert.match(j.reason ?? '', /inconsistente/);
    assert.match(j.reason ?? '', /pass 1 ≠ testsRun 2/);
  });

  it('veredito: relatório com skipped 1 derruba o desafio inteiro', async () => {
    const { env } = makeFakeProofEnv({ exitCode: 0, stdout: skippedReport(), stderr: '' }, failRun(), failRun());
    const v = await verifyChallengeProofs(BASE_INPUT, env);
    assert.equal(v.valid, false);
    assert.ok(v.failures.some((f) => f.proof === 'solutionPasses'), 'prova 1 falha: skipado não é passagem integral');
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
    assert.equal(env.PATH, '/usr/bin', 'PATH está na allowlist — sem ele o spawn nem acha o binário');
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

  it('envBuilder custom ENRIQUECE o env já endurecido — nunca o substitui (WARNING 3)', async () => {
    let seenByBuilder: NodeJS.ProcessEnv | undefined;
    let captured: NodeJS.ProcessEnv | undefined;
    const inner: ExecFn = async (_dir, _args, opts) => {
      captured = opts?.env;
      return okRun(2);
    };
    const hard = createHardenedExec({
      exec: inner,
      envBuilder: (env) => {
        seenByBuilder = env;
        // aditivo: o custom PARTE do env endurecido e soma o que precisar.
        return { ...env, PATH: '/custom', SM_FLAG: '1' };
      },
    });
    await hard('dir', [...SPEC_TEST_ARGS]);
    assert.ok(seenByBuilder, 'envBuilder custom recebe o env');
    assert.equal(seenByBuilder?.NODE_TEST_CONTEXT, undefined, 'o custom recebe env SEM NODE_TEST_CONTEXT');
    assert.equal(seenByBuilder?.HTTP_PROXY, undefined, 'o custom recebe env sem proxies herdados');
    assert.equal(seenByBuilder?.NO_PROXY, '*', 'o custom parte de um env já com NO_PROXY=*');
    assert.equal(captured?.NODE_TEST_CONTEXT, undefined, 'o env entregue ao exec nunca tem NODE_TEST_CONTEXT');
    assert.equal(captured?.SM_FLAG, '1', 'o enriquecimento do custom é preservado (aditivo)');
    assert.equal(captured?.PATH, '/custom');
  });

  it('envBuilder hostil que TENTA reintroduzir NODE_TEST_CONTEXT não consegue', async () => {
    let captured: NodeJS.ProcessEnv | undefined;
    const inner: ExecFn = async (_dir, _args, opts) => {
      captured = opts?.env;
      return okRun(2);
    };
    const hard = createHardenedExec({
      exec: inner,
      envBuilder: (env) => ({
        ...env,
        NODE_TEST_CONTEXT: 'reintrodução-hostil',
        HTTP_PROXY: 'http://proxy-ruim',
        FORCE_COLOR: '1',
      }),
    });
    await hard('dir', [...SPEC_TEST_ARGS]);
    assert.equal(captured?.NODE_TEST_CONTEXT, undefined, 'a reintrodução é revertida pelo endurecimento de saída');
    assert.equal(captured?.HTTP_PROXY, undefined);
    assert.equal(captured?.FORCE_COLOR, undefined);
    assert.equal(captured?.NO_PROXY, '*', 'NO_PROXY=* é invariante na saída, com ou sem custom');
  });
});

// ---------------------------------------------------------------------------
// 4b. A MIGRAÇÃO DENYLIST → ALLOWLIST DO ENV (onda 5)
//
// A ÚNICA mudança de comportamento deliberada desta sub-tarefa, e por isso ela
// tem teste próprio. §6 obs. 2 de
// `docs/research/08-multilingua-trava-deterministica.md`: "Cada linguagem tem
// o seu veneno (GOFLAGS, GOCACHE, RUSTFLAGS, CARGO_TARGET_DIR, PYTHONPATH,
// CLASSPATH, DOTNET_*), e a lista nunca vai estar completa. O correto é montar
// o ambiente do filho a partir de uma allowlist explícita mais
// `LC_ALL=C.UTF-8 TZ=UTC`."
//
// ANTES: `buildChildEnv` copiava `process.env` INTEIRO e apagava 9 nomes.
// AGORA: constrói o env do NADA — só o que a allowlist permite herdar.
// ---------------------------------------------------------------------------

describe('env do filho — ALLOWLIST (§6 obs. 2), a mudança deliberada da onda 5', () => {
  it('o que NÃO está na allowlist não chega ao filho — nem o veneno de outra linguagem', () => {
    const env = buildChildEnv({
      PATH: '/usr/bin',
      HOME: '/home/x',
      // veneno que a DENYLIST de antes não conhecia (e nunca conheceria toda):
      PYTHONPATH: '/veneno',
      GOFLAGS: '-mod=mod',
      RUSTFLAGS: '-C target-cpu=native',
      CLASSPATH: '/injecao.jar',
      DOTNET_ROOT: '/dotnet',
      // e ambiente arbitrário do desenvolvedor, que vazava inteiro:
      MINHA_VAR: 'vazava antes',
      AWS_SECRET_ACCESS_KEY: 'segredo que não tem o que fazer no filho',
    });
    for (const nome of ['PYTHONPATH', 'GOFLAGS', 'RUSTFLAGS', 'CLASSPATH', 'DOTNET_ROOT', 'MINHA_VAR', 'AWS_SECRET_ACCESS_KEY']) {
      assert.equal(env[nome], undefined, `${nome} não pode chegar ao filho`);
    }
    assert.equal(env.PATH, '/usr/bin', 'PATH herda — sem ele o spawn nem acha o binário');
    assert.equal(env.HOME, '/home/x');
  });

  it('o DETERMINISMO passa a ser imposto: LC_ALL=C.UTF-8 e TZ=UTC (nunca eram fixados)', () => {
    const env = buildChildEnv({ PATH: '/usr/bin', LC_ALL: 'pt_BR.UTF-8', TZ: 'America/Sao_Paulo' });
    assert.equal(env.LC_ALL, 'C.UTF-8', 'ordenação de string deixa de depender da máquina');
    assert.equal(env.TZ, 'UTC', 'formatação de data deixa de depender do fuso da máquina');
  });

  it('npm_node_execpath continua herdando — é por ele que o filho acha o node sob Electron', () => {
    // `detect().binary` devolve `npm_node_execpath` quando o app roda sob npm
    // dentro do Electron. Sem ela na allowlist, a allowlist quebraria o spawn
    // no ambiente exato em que o produto roda.
    const env = buildChildEnv({ PATH: '/usr/bin', npm_node_execpath: '/usr/bin/node' });
    assert.equal(env.npm_node_execpath, '/usr/bin/node');
  });

  it('o endurecimento antigo NÃO regrediu: veneno de Node continua fora, NO_PROXY continua dentro', () => {
    const env = buildChildEnv({
      PATH: '/usr/bin',
      NODE_TEST_CONTEXT: 'runner-pai',
      HTTP_PROXY: 'http://proxy',
      https_proxy: 'http://proxy',
      NODE_TLS_REJECT_UNAUTHORIZED: '0',
      FORCE_COLOR: '1',
      NODE_OPTIONS: '--require evil',
    });
    for (const nome of ['NODE_TEST_CONTEXT', 'HTTP_PROXY', 'https_proxy', 'NODE_TLS_REJECT_UNAUTHORIZED', 'FORCE_COLOR', 'NODE_OPTIONS']) {
      assert.equal(env[nome], undefined, `${nome} continua fora do filho`);
    }
    assert.equal(env.NO_PROXY, '*');
    assert.equal(env.no_proxy, '*');
  });

  it('PURA: não muta o base (nem o `process.env` quando o base é omitido)', () => {
    const base: NodeJS.ProcessEnv = { PATH: '/usr/bin', MINHA_VAR: 'intacta', NODE_TEST_CONTEXT: 'x' };
    buildChildEnv(base);
    assert.equal(base.MINHA_VAR, 'intacta');
    assert.equal(base.NODE_TEST_CONTEXT, 'x');
    const semBase = buildChildEnv();
    assert.equal(semBase.NODE_TEST_CONTEXT, undefined, 'o default é process.env, e ele também é filtrado');
    assert.equal(semBase.LC_ALL, 'C.UTF-8');
  });

  it('o passo de SAÍDA é denylist de propósito: o enriquecimento do envBuilder sobrevive, o veneno não', async () => {
    // A allowlist decide o que é HERDADO do pai; um `envBuilder` custom INJETA
    // valores explícitos. Se o passo 3 fosse a allowlist de novo, ele apagaria
    // justamente o que o chamador pediu e o slot `envBuilder` seria inútil —
    // por isso ele é `reforcarInvariantesDeEnv` (strip + fixed).
    let captured: NodeJS.ProcessEnv | undefined;
    const hard = createHardenedExec({
      exec: async (_dir, _args, opts) => {
        captured = opts?.env;
        return okRun(2);
      },
      envBuilder: (env) => ({ ...env, SM_FLAG: '1', NODE_OPTIONS: '--require evil' }),
    });
    await hard('dir', [...SPEC_TEST_ARGS], { env: { PATH: '/usr/bin', MINHA_VAR: 'vazava antes' } });
    assert.equal(captured?.SM_FLAG, '1', 'o enriquecimento explícito do custom sobrevive');
    assert.equal(captured?.NODE_OPTIONS, undefined, 'o veneno reintroduzido pelo custom é reapagado');
    assert.equal(captured?.MINHA_VAR, undefined, 'o que veio por HERANÇA continua barrado pela allowlist do passo 1');
    assert.equal(captured?.LC_ALL, 'C.UTF-8');
    assert.equal(captured?.NO_PROXY, '*');
  });
});

// ---------------------------------------------------------------------------
// 5. ANSI no relatório não zera a contagem
// ---------------------------------------------------------------------------

describe('ANSI no relatório do node:test (cores herdadas do ambiente)', () => {
  it('parseSpecCounts sanitiza escapes antes do match', () => {
    const counts = parseSpecCounts(ansiSpecOut(2, 2, 0));
    assert.deepEqual(counts, { testsRun: 2, pass: 2, fail: 0, skipped: 0 });
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
// SEM_EXEC — teto de concorrência (semáforo do P-01 — fonte única, P-27)
// ---------------------------------------------------------------------------

describe('SEM_EXEC — teto de concorrência do harness (semáforo do P-01, P-27)', () => {
  it('createSemaphore (P-01) limita e libera em FIFO', async () => {
    const sem = createSemaphore(2);
    const r1 = await sem.acquire();
    const r2 = await sem.acquire();
    assert.equal(sem.active, 2, 'dois slots ocupados');

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
    assert.equal(sem.active, 2);

    releaseThird();
    r1();
    assert.equal(sem.active, 0);
  });

  it('release é IDEMPOTENTE: liberar a MESMA vaga duas vezes é no-op (P-27)', async () => {
    // A garantia é do contrato unificado (P-01): o release vem do acquire e
    // a segunda chamada não corrompe a contagem — prova direta no SEM_EXEC.
    const sem = createSemaphore(1);
    const release = await sem.acquire();
    assert.equal(sem.active, 1);
    release();
    assert.equal(sem.active, 0, 'primeira liberação devolve o slot');
    release(); // segunda chamada: no-op — contagem NÃO corrompe
    assert.equal(sem.active, 0, '-1 slot é impossível: a dupla liberação é no-op');
    // e a vaga continua utilizável depois da dupla liberação.
    const release2 = await sem.acquire();
    assert.equal(sem.active, 1, 'a vaga volta a servir após o release duplo');
    release2();
    assert.equal(sem.active, 0);
  });

  it('teto padrão SEM_EXEC: defaultExecConcurrency() é inteiro em [1, availableParallelism()]', () => {
    const max = defaultExecConcurrency();
    const p = typeof os.availableParallelism === 'function' ? os.availableParallelism() : 1;
    assert.ok(Number.isInteger(max), `teto do SEM_EXEC deve ser inteiro (recebido ${max})`);
    assert.ok(max >= 1, 'nunca 0: um spawn mínimo sempre cabe');
    assert.ok(max <= p, 'nunca mais que o número de núcleos');
  });

  it('maxConcurrency inválido (< 1) é fail-fast do P-01, nunca deadlock silencioso', () => {
    // O createSemaphore PRÓPRIO do harness antigo achatava teto ≤ 0 em 1; o
    // P-01 prefere falhar cedo (semáforo que nunca libera slot é pior que
    // erro de configuração — P-27 documenta a mudança no harness).
    assert.throws(() => createSemaphore(0), RangeError);
    assert.throws(() => createSemaphore(-1), RangeError);
    assert.throws(() => createSemaphore(1.5), RangeError, 'teto fracionário também é rejeitado (inteiro ≥ 1)');
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
    const limiter: Semaphore = {
      limit: 1,
      active: 0,
      acquire: () =>
        Promise.resolve(() => {
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

// ---------------------------------------------------------------------------
// escreverExitGuard — bridge de endurecimento (exit 0 forjado não mata o runner)
// ---------------------------------------------------------------------------

describe('escreverExitGuard (bridge de endurecimento — code under test não mata o runner)', () => {
  it('escreve exit-guard.cjs com o conteúdo EXATO e lança em process.exit/process.abort', async () => {
    const base = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'exit-guard-test-'));
    try {
      const file = await escreverExitGuard(base);
      assert.equal(file, path.join(base, 'exit-guard.cjs'));
      const source = await fsPromises.readFile(file, 'utf8');
      assert.equal(source, EXIT_GUARD_SOURCE, 'conteúdo exato do guard (teste de strings)');
      assert.match(source, /process\.exit/);
      assert.match(source, /process\.abort/);
      assert.match(source, /bloqueado/, 'a mensagem de bloqueio está no conteúdo');

      // carrega num vm context — o processo do teste NÃO é tocado (sem spawn).
      const sandboxProcess = {
        exit: () => {
          throw new Error('exit real não pode rodar no teste');
        },
        abort: () => {
          throw new Error('abort real não pode rodar no teste');
        },
      };
      const ctx = vm.createContext({ process: sandboxProcess });
      vm.runInContext(source, ctx);
      assert.throws(() => vm.runInContext('process.exit(0)', ctx), /bloqueado/);
      assert.throws(() => vm.runInContext('process.abort()', ctx), /bloqueado/);
    } finally {
      await fsPromises.rm(base, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('é função pura: só escreve o arquivo no dir injetado e não cria diretórios', async () => {
    const base = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'exit-guard-test-'));
    try {
      const file = await escreverExitGuard(base);
      assert.ok(file.startsWith(base), 'escreve DENTRO do dir injetado');
      const entries = await fsPromises.readdir(base);
      assert.deepEqual(entries, ['exit-guard.cjs'], 'nada além do guard no diretório');
      // não cria diretório: dir inexistente → rejeita (fail-closed, não inventa um).
      await assert.rejects(() => escreverExitGuard(path.join(base, 'subdir-inexistente')));
    } finally {
      await fsPromises.rm(base, { recursive: true, force: true }).catch(() => {});
    }
  });
});
// ---------------------------------------------------------------------------
// 8. A QUINTA PROVA — typesCheck (onda 5)
//
// Node APAGA os tipos, não os confere: `node --test` sobre um `.ts`
// transpilado nunca reprova `const n: number = 'texto'`. A prova de tipo é
// SEPARADA e aplicada SÓ ao lado da SOLUÇÃO.
//
// O CONTRATO QUE MAIS IMPORTA AQUI é o NEGATIVO: as provas 2 (starter falha) e
// 4 (stub vazio falha) continuam RUNTIME-ONLY. Dobrar o type check dentro
// delas as destruiria — um starter de linguagem tipada quase sempre tem erro
// de tipo por construção (prova 2 viraria trivialmente satisfeita) e um stub
// `export {}` vira erro de COMPILAÇÃO no import do teste (prova 4 passaria
// sempre e pararia de pegar teste tautológico).
// ---------------------------------------------------------------------------

/**
 * Um adaptador FAKE de linguagem TIPADA: o adaptador `javascript` com outro
 * `id`, que é a chave da tabela `POLITICAS_DE_TIPOS`. Existe porque
 * `lang/typescript.ts` ainda não foi escrito (§7, item 2 do documento de
 * multilíngua) e a quinta prova precisa ser exercitável hoje.
 */
const tipadoAdapter = { ...javascriptAdapter, id: 'typescript', label: 'TypeScript' } as unknown as LanguageAdapter;

describe('a QUINTA prova — typesCheck (só a solução, opcional por linguagem)', () => {
  it('política: javascript NÃO exige; typescript exige; linguagem sem entrada NÃO exige', () => {
    assert.equal(politicaDeTipos('javascript').required, false);
    assert.equal(politicaDeTipos('typescript').required, true);
    assert.equal(politicaDeTipos('linguagem-que-nao-existe').required, false);
  });

  it('judgeTypesCheck PASSA quando a linguagem não exige a prova (adaptador javascript)', () => {
    const j = judgeTypesCheck(TYPES_CHECK_NAO_APLICAVEL);
    assert.equal(j.passed, true);
    assert.equal(j.proof, 'typesCheck');
  });

  it('checagem que RODOU e reprovou derruba a prova mesmo em linguagem que não a exige', () => {
    // Silenciar um defeito já PROVADO porque "esta linguagem não exigia a
    // prova" seria descartar informação. A política decide se a checagem é
    // obrigatória, não se um resultado ruim conta.
    const j = judgeTypesCheck(
      { applicable: true, ok: false, output: 'error TS2322', exitCode: 2, degradacao: null },
      javascriptAdapter,
    );
    assert.equal(j.passed, false);
  });

  it('FAIL-CLOSED: linguagem EXIGE e o provador não ligou o seam ⇒ REPROVA', () => {
    const j = judgeTypesCheck(TYPES_CHECK_NAO_APLICAVEL, tipadoAdapter);
    assert.equal(j.passed, false);
    assert.match(j.reason ?? '', /exige verificação de TIPO/);
  });

  it('FAIL-CLOSED: linguagem EXIGE e o compilador está ausente ⇒ REPROVA (nunca verde silencioso)', () => {
    const j = judgeTypesCheck(
      { applicable: true, ok: false, output: '', exitCode: -1, degradacao: 'tsc não resolveu' },
      tipadoAdapter,
    );
    assert.equal(j.passed, false);
    assert.match(j.reason ?? '', /indisponível/);
    assert.match(j.reason ?? '', /tsc não resolveu/);
  });

  it('REPROVA com os diagnósticos quando o compilador reprova a SOLUÇÃO', () => {
    const j = judgeTypesCheck(
      { applicable: true, ok: false, output: "solution.ts(1,7): error TS2322: Type 'string' is not assignable to type 'number'.", exitCode: 2, degradacao: null },
      tipadoAdapter,
    );
    assert.equal(j.passed, false);
    assert.match(j.reason ?? '', /TS2322/);
  });

  it('PASSA quando a linguagem exige e o compilador aprova', () => {
    const j = judgeTypesCheck({ applicable: true, ok: true, output: '', exitCode: 0, degradacao: null }, tipadoAdapter);
    assert.equal(j.passed, true);
  });

  it('PROVA 2 continua RUNTIME-ONLY: starter que SAI 0 reprova, mesmo em linguagem tipada', () => {
    // Se falha de `tsc` contasse como "o starter falhou", ESTE caso passaria —
    // e a prova 2 deixaria de provar que o aluno tem o que corrigir.
    const j = judgeStarterFails(okRun(2), tipadoAdapter);
    assert.equal(j.passed, false, 'a prova 2 lê SOMENTE o exit code da rodada de teste');
    assert.equal(judgeStarterFails(failRun(), tipadoAdapter).passed, true);
  });

  it('PROVA 4 continua RUNTIME-ONLY: stub vazio que SAI 0 reprova, mesmo em linguagem tipada', () => {
    // O stub vazio é `export {};`. Numa linguagem tipada o import do teste vira
    // erro de COMPILAÇÃO — se isso contasse aqui, a prova passaria SEMPRE e o
    // teste TAUTOLÓGICO (que roda verde contra o stub) nunca seria pego.
    const j = judgeEmptyStubFails(okRun(2), tipadoAdapter);
    assert.equal(j.passed, false, 'a prova 4 lê SOMENTE o exit code da rodada de teste');
    assert.match(j.reason ?? '', /tautológicos/);
    assert.equal(judgeEmptyStubFails(failRun(), tipadoAdapter).passed, true);
  });

  it('a DUPLA-IGUALDADE continua obrigatória em TODA linguagem (§6 obs. 3)', () => {
    for (const adapter of listAdapters()) {
      assert.equal(adapter.failureExitCodes.successRequiresCountMatch, true, adapter.id);
    }
    assert.equal(tipadoAdapter.failureExitCodes.successRequiresCountMatch, true);
  });
});

describe('criarTypesCheck — o SPAWN SEPARADO do compilador', () => {
  const SIDE = { code: 'export const f = 1;\n', testsCode: "import './solution.mjs';\n" };

  it('alvosDaChecagem manda os FONTES ao compilador e NUNCA o manifesto do runtime', () => {
    const alvos = alvosDaChecagem(tipadoAdapter, SIDE);
    assert.deepEqual(alvos, ['solution.mjs', 'test.mjs']);
    assert.ok(!alvos.includes('package.json'), 'package.json não é fonte');
    const multi = alvosDaChecagem(tipadoAdapter, {
      code: 'ignorado',
      files: [{ path: 'lib/soma.mjs', code: 'export const soma = 1;' }],
      testsCode: 'x',
    });
    assert.deepEqual(multi, ['lib/soma.mjs', 'test.mjs'], 'multi-arquivo: todos os fontes + o teste');
  });

  it('linguagem que NÃO exige: devolve não-aplicável SEM chamar o executor', async () => {
    let chamou = false;
    const check = criarTypesCheck({
      adapter: javascriptAdapter,
      exec: async () => {
        chamou = true;
        return okRun(1);
      },
    });
    assert.deepEqual(await check('dir', SIDE), TYPES_CHECK_NAO_APLICAVEL);
    assert.equal(chamou, false, 'nenhum spawn em linguagem sem checagem de tipo');
  });

  it('linguagem que EXIGE: spawn SEPARADO do compilador, com --noEmit e SEM flag de runner', async () => {
    const calls: Array<{ dir: string; args: string[]; opts?: { timeoutMs?: number } }> = [];
    const check = criarTypesCheck({
      adapter: tipadoAdapter,
      resolverCompilador: () => '/fake/node_modules/typescript/bin/tsc',
      timeoutMs: 60_000,
      exec: async (dir, args, opts) => {
        calls.push({ dir, args, opts });
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    });
    const r = await check('dir-da-solucao', SIDE);
    assert.equal(calls.length, 1, 'UM spawn, separado da rodada de teste');
    assert.equal(calls[0].dir, 'dir-da-solucao');
    assert.equal(calls[0].args[0], '/fake/node_modules/typescript/bin/tsc');
    assert.ok(calls[0].args.includes('--noEmit'), 'a prova é de TIPO, não de build');
    assert.ok(calls[0].args.includes('--strict'), 'trava de tipo frouxa não trava nada');
    assert.ok(!calls[0].args.includes('--test'), 'NUNCA uma flag do runner de teste');
    assert.deepEqual(calls[0].args.slice(-2), ['solution.mjs', 'test.mjs']);
    assert.equal(calls[0].opts?.timeoutMs, 60_000, 'teto próprio: o compilador é mais lento que o runner');
    assert.deepEqual(r, { applicable: true, ok: true, output: '', exitCode: 0, degradacao: null });
  });

  it('compilador ausente ⇒ applicable com degradação (o julgador reprova)', async () => {
    const check = criarTypesCheck({
      adapter: tipadoAdapter,
      resolverCompilador: () => null,
      exec: async () => okRun(1),
    });
    const r = await check('dir', SIDE);
    assert.equal(r.applicable, true);
    assert.equal(r.ok, false);
    assert.match(r.degradacao ?? '', /compilador de tipos ausente/);
    assert.equal(judgeTypesCheck(r, tipadoAdapter).passed, false);
  });

  it('exit code do compilador é lido pelo failureExitCodes do adaptador', async () => {
    const check = criarTypesCheck({
      adapter: tipadoAdapter,
      resolverCompilador: () => '/fake/tsc',
      exec: async () => ({ exitCode: 2, stdout: 'error TS2322', stderr: '' }),
    });
    const r = await check('dir', SIDE);
    assert.equal(r.ok, false);
    assert.equal(r.exitCode, 2);
    assert.match(r.output, /TS2322/);
  });

  it('o compilador é resolvível de verdade: typescript é dependência DIRETA do repositório', () => {
    const bin = resolverCompiladorNpm('typescript/bin/tsc');
    assert.ok(bin !== null, 'require.resolve("typescript/bin/tsc") tem de funcionar — nada a instalar');
    assert.match(bin ?? '', /typescript[/\\]bin[/\\]tsc$/);
    assert.equal(resolverCompiladorNpm('modulo-que-nao-existe-mesmo'), null, 'ausência vira null, nunca exceção');
  });

  it('SOB O MESMO SEM_EXEC: a checagem concorre pelas MESMAS vagas das rodadas de teste', async () => {
    // `tsc` custa ordem de 1–2 s contra ~290 ms de uma rodada de teste. Fora do
    // semáforo ele dominaria a F9 inteira — por isso a checagem é montada sobre
    // o MESMO ExecFn endurecido, que adquire o SEM_EXEC por execução.
    let emVoo = 0;
    let pico = 0;
    const soltar: Array<() => void> = [];
    const hard = createHardenedExec({
      maxConcurrency: 1,
      exec: async () => {
        emVoo += 1;
        pico = Math.max(pico, emVoo);
        await new Promise<void>((r) => soltar.push(r));
        emVoo -= 1;
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    });
    const check = criarTypesCheck({ adapter: tipadoAdapter, exec: hard, resolverCompilador: () => '/fake/tsc' });
    const teste = hard('dir', [...SPEC_TEST_ARGS]);
    const tipos = check('dir', SIDE);
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(pico, 1, 'a checagem de tipos NÃO fura o teto SEM_EXEC');
    while (soltar.length > 0) soltar.shift()?.();
    await new Promise((r) => setTimeout(r, 10));
    while (soltar.length > 0) soltar.shift()?.();
    await Promise.all([teste, tipos]);
    assert.equal(pico, 1);
  });
});

describe('verifyChallengeProofs — a quinta prova no veredito', () => {
  it('JavaScript: sem typesCheck no env, o veredito continua válido (a prova não se aplica)', async () => {
    const { env } = makeFakeProofEnv(okRun(2), failRun(), failRun());
    const v = await verifyChallengeProofs(BASE_INPUT, env);
    assert.equal(v.valid, true);
    assert.equal(v.types?.applicable, false);
    assert.ok(!v.failures.some((f) => f.proof === 'typesCheck'));
  });

  it('a checagem recebe o diretório da SOLUÇÃO — nunca o do starter nem o do stub vazio', async () => {
    const { env, prepared } = makeFakeProofEnv(okRun(2), failRun(), failRun());
    const vistos: Array<{ dir: string; code: string }> = [];
    env.typesCheck = async (dir, side) => {
      vistos.push({ dir, code: side.code });
      return { applicable: true, ok: true, output: '', exitCode: 0, degradacao: null };
    };
    const v = await verifyChallengeProofs(BASE_INPUT, env);
    assert.equal(v.valid, true);
    assert.equal(vistos.length, 1, 'UMA checagem por desafio');
    assert.equal(vistos[0].dir, 'prova-dir-1', 'o primeiro prepare é o da solução');
    assert.equal(vistos[0].code, BASE_INPUT.solutionCode);
    assert.equal(prepared[0].code, BASE_INPUT.solutionCode);
  });

  it('a checagem que REPROVA derruba o veredito com a prova typesCheck', async () => {
    const { env } = makeFakeProofEnv(okRun(2), failRun(), failRun());
    env.typesCheck = async () => ({
      applicable: true,
      ok: false,
      output: "solution.ts(1,7): error TS2322: Type 'string' is not assignable to type 'number'.",
      exitCode: 2,
      degradacao: null,
    });
    const v = await verifyChallengeProofs(BASE_INPUT, env);
    assert.equal(v.valid, false);
    const falha = v.failures.find((f) => f.proof === 'typesCheck');
    assert.ok(falha, 'a prova 5 tem de aparecer nas falhas');
    assert.match(falha?.reason ?? '', /TS2322/);
    // as QUATRO de execução continuam verdes — a falha é SÓ a de tipos.
    assert.equal(v.failures.length, 1);
  });

  it('language desconhecido NÃO cai no adaptador default: vira execError (fail-closed)', async () => {
    const { env } = makeFakeProofEnv(okRun(2), failRun(), failRun());
    const v = await verifyChallengeProofs({ ...BASE_INPUT, language: 'brainfuck' }, env);
    assert.equal(v.valid, false);
    assert.ok(v.failures.some((f) => f.proof === 'execError'));
    assert.match(v.execError ?? '', /linguagem sem adaptador/);
  });

  it("language 'javascript' e 'nodejs' resolvem para o MESMO adaptador (runtime vs linguagem)", async () => {
    for (const language of ['javascript', 'nodejs'] as const) {
      const { env, calls } = makeFakeProofEnv(okRun(2), failRun(), failRun());
      const v = await verifyChallengeProofs({ ...BASE_INPUT, language }, env);
      assert.equal(v.valid, true, language);
      assert.deepEqual(calls[0].args, [...SPEC_TEST_ARGS], language);
    }
  });
});
