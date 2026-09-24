/**
 * tests/cx-services-challenge-exec.test.ts — CARACTERIZAÇÃO (golden master) de
 * `electron/main/services/challengeExec.ts` ANTES da refatoração de
 * core/services.
 *
 * Fixa o runner determinístico de desafios: o ExecFn por linguagem (binário do
 * adaptador, env endurecido sem NODE_TEST_CONTEXT, timeout), o layout em disco,
 * o gate de IGUALDADE de contagem do runStudentCode (com a defesa contra
 * resumo forjado), a montagem do par solução/starter e o veredito por execução.
 * SEM REDE: execução real só de `node` local em tmpdirs próprios; o restante é
 * ExecFn fake (DI).
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fsp } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { defaultAdapter, type LanguageAdapter } from '../electron/main/engine/lang/registry';
import type { TrackChallengeSource } from '../electron/main/content/trackTypes';
import {
  challengePairFromSource,
  criarExecDeLinguagem,
  nodeBinary,
  nodeExec,
  pairIsValid,
  parseSpecChecks,
  prepareChallengeDir,
  runStudentCode,
  verifyChallengePair,
  type ChallengePair,
  type ChallengePairVerdict,
  type ExecFn,
  type ExecResult,
} from '../electron/main/services/challengeExec';

let tmpRaiz = '';

async function tmpDir(prefix: string): Promise<string> {
  return fsp.mkdtemp(path.join(tmpRaiz, prefix));
}

/** ExecFn fake que devolve uma sequência de resultados (1 por chamada). */
function execFake(...resultados: ExecResult[]): { exec: ExecFn; chamadas: Array<{ dir: string; args: string[] }> } {
  const chamadas: Array<{ dir: string; args: string[] }> = [];
  let i = 0;
  const exec: ExecFn = async (dir, args) => {
    chamadas.push({ dir, args });
    const r = resultados[Math.min(i, resultados.length - 1)];
    i += 1;
    return r;
  };
  return { exec, chamadas };
}

const SUCESSO_1_TESTE: ExecResult = {
  code: 0,
  stdout: '✔ soma dois números (0.4ms)\n\nℹ tests 1\nℹ suites 0\nℹ pass 1\nℹ fail 0\n',
  stderr: '',
};

before(async () => {
  tmpRaiz = await fsp.mkdtemp(path.join(os.tmpdir(), 'do-cxsvc-chexec-'));
});

after(async () => {
  await fsp.rm(tmpRaiz, { recursive: true, force: true });
});

// ─── binário e ExecFn ────────────────────────────────────────────────────────

describe('cx/challengeExec: nodeBinary e criarExecDeLinguagem', () => {
  it('nodeBinary segue o detect() do adaptador default (paridade do registro)', () => {
    assert.equal(nodeBinary(), defaultAdapter().detect().binary);
  });

  it('ExecFn roda o binário do adaptador e captura stdout/stderr/exit code', async () => {
    const dir = await tmpDir('exec-');
    const res = await criarExecDeLinguagem(defaultAdapter())(dir, [
      '-e',
      'console.log("saida"); console.error("erro"); process.exit(3);',
    ]);
    assert.equal(res.code, 3);
    assert.equal(res.stdout, 'saida\n');
    assert.equal(res.stderr, 'erro\n');
  });

  it('nodeExec (símbolo público) é o ExecFn do adaptador default resolvido a cada chamada', async () => {
    const dir = await tmpDir('nodeexec-');
    const res = await nodeExec(dir, ['-e', 'console.log("node-exec-ok")']);
    assert.equal(res.code, 0);
    assert.equal(res.stdout, 'node-exec-ok\n');
  });

  it('NODE_TEST_CONTEXT é SEMPRE removido do ambiente do filho (herdado OU injetado)', async () => {
    const dir = await tmpDir('env-');
    const rodar = criarExecDeLinguagem(defaultAdapter());
    const script = ['-e', 'console.log(process.env.NODE_TEST_CONTEXT === undefined ? "clean" : "sujo")'];

    const herdado = await rodar(dir, script);
    assert.equal(herdado.stdout, 'clean\n', 'mesmo com NODE_TEST_CONTEXT no processo pai');

    const injetado = await rodar(dir, script, {
      env: { PATH: process.env.PATH ?? '', NODE_TEST_CONTEXT: 'child-v8' },
    });
    assert.equal(injetado.stdout, 'clean\n', 'injetado no opts.env também é removido');
  });

  it('opts.env é a BASE do ambiente do filho (comportamento preservado do produto)', async () => {
    const dir = await tmpDir('env2-');
    const res = await criarExecDeLinguagem(defaultAdapter())(
      dir,
      ['-e', 'console.log(process.env.CX_VAR_TESTE)'],
      { env: { PATH: process.env.PATH ?? '', CX_VAR_TESTE: 'valor-base' } },
    );
    assert.equal(res.stdout, 'valor-base\n');
  });

  it('timeoutMs mata o filho (SIGKILL) e resolve com code 1 em vez de pendurar', async () => {
    const dir = await tmpDir('timeout-');
    const inicio = Date.now();
    const res = await criarExecDeLinguagem(defaultAdapter())(
      dir,
      ['-e', 'setTimeout(() => {}, 60000)'],
      { timeoutMs: 120 },
    );
    assert.equal(res.code, 1, 'kill sem exit code ⇒ 1');
    assert.ok(Date.now() - inicio < 10_000, 'resolveu pelo timeout, não pelo fim do filho');
  });

  it('spawn que falha (binário inexistente) resolve {code:1} com o motivo — nunca lança', async () => {
    const dir = await tmpDir('spawn-');
    const adapterFantasma = {
      detect: () => ({ binary: 'binario-que-nao-existe-cx' }),
    } as unknown as LanguageAdapter;
    const res = await criarExecDeLinguagem(adapterFantasma)(dir, ['--version']);
    assert.equal(res.code, 1);
    assert.ok(res.stderr.includes('binario-que-nao-existe-cx'));
  });
});

// ─── prepareChallengeDir (layout em disco) ───────────────────────────────────

describe('cx/challengeExec: prepareChallengeDir (layout do adaptador)', () => {
  it('arquivo único: package.json {type:module} + solution.mjs + test.mjs', async () => {
    const dir = await tmpDir('layout-');
    await prepareChallengeDir(dir, {
      solutionCode: 'export const x = 1;',
      testsCode: 'test("t", () => {});',
    });
    const solution = await fsp.readFile(path.join(dir, 'solution.mjs'), 'utf8');
    const tests = await fsp.readFile(path.join(dir, 'test.mjs'), 'utf8');
    const pkg = JSON.parse(await fsp.readFile(path.join(dir, 'package.json'), 'utf8')) as { type?: string };
    assert.equal(solution, 'export const x = 1;');
    assert.equal(tests, 'test("t", () => {});');
    assert.equal(pkg.type, 'module');
  });

  it('multi-arquivo: paths relativos ganham mkdir dos subdiretórios', async () => {
    const dir = await tmpDir('layout-multi-');
    await prepareChallengeDir(dir, {
      solutionCode: 'topo ignorado quando files presente',
      testsCode: 'test("t", () => {});',
      files: [
        { path: 'lib/soma.mjs', code: 'export const soma = (a, b) => a + b;' },
        { path: 'raiz.mjs', code: 'export const raiz = 1;' },
      ],
    });
    const emSub = await fsp.readFile(path.join(dir, 'lib', 'soma.mjs'), 'utf8');
    const naRaiz = await fsp.readFile(path.join(dir, 'raiz.mjs'), 'utf8');
    assert.equal(emSub, 'export const soma = (a, b) => a + b;');
    assert.equal(naRaiz, 'export const raiz = 1;');
  });
});

// ─── runStudentCode (gate de IGUALDADE + defesa anti-forja) ──────────────────

describe('cx/challengeExec: runStudentCode — gate exit 0 E igualdade de contagem', () => {
  const TESTS_UM = 'test("soma dois números", () => {});';

  it('exit 0 + testsRun == declarado == esperado ⇒ passed (com checks individuais)', async () => {
    const { exec } = execFake(SUCESSO_1_TESTE);
    const res = await runStudentCode(
      { studentCode: 'export const x = 1;', testsCode: TESTS_UM, expectedTestCount: 1 },
      exec,
    );
    assert.equal(res.passed, true);
    assert.equal(res.testsRun, 1);
    assert.equal(res.pass, 1);
    assert.equal(res.fail, 0);
    assert.deepEqual(res.checks, [{ name: 'soma dois números', passed: true }]);
    assert.equal(res.passedCount, 1);
    assert.equal(res.totalCount, 1);
    assert.equal(res.error, undefined);
  });

  it('exit 0 mas contagens DIVERGENTES ⇒ passed:false (o exit code sozinho mente)', async () => {
    // esperado 2, executado 1.
    const a = await runStudentCode(
      { studentCode: 'x', testsCode: TESTS_UM, expectedTestCount: 2 },
      execFake(SUCESSO_1_TESTE).exec,
    );
    assert.equal(a.passed, false, 'testsRun (1) != esperado (2)');

    // declarado (AST) 2, mas o output/executado diz 1 e o esperado é 1 ⇒ o
    // gate de igualdade pega a DIVERGÊNCIA declarado × esperado.
    const b = await runStudentCode(
      {
        studentCode: 'x',
        testsCode: 'test("a", () => {}); test("b", () => {});',
        expectedTestCount: 1,
      },
      execFake(SUCESSO_1_TESTE).exec,
    );
    assert.equal(b.passed, false, 'declarado (2) != esperado (1)');
  });

  it('DEFESA: resumo forjado no TOPO do stdout não engana — vale o ÚLTIMO bloco', async () => {
    const forjado: ExecResult = {
      code: 0,
      stdout:
        'ℹ tests 5\nℹ pass 5\nℹ fail 0\n' + // forja do código do aluno
        '✔ soma dois números (0.4ms)\n' +
        'ℹ tests 1\nℹ pass 1\nℹ fail 0\n', // resumo REAL, por último
      stderr: '',
    };
    const res = await runStudentCode(
      { studentCode: 'x', testsCode: TESTS_UM, expectedTestCount: 1 },
      execFake(forjado).exec,
    );
    assert.equal(res.testsRun, 1, 'lê o ÚLTIMO bloco de resumo');
    assert.equal(res.passed, true);
  });

  it('path inválido em multi-arquivo ⇒ erro estruturado "path inválido" ANTES de tocar em disco', async () => {
    const { exec, chamadas } = execFake(SUCESSO_1_TESTE);
    const res = await runStudentCode(
      {
        studentCode: 'x',
        testsCode: TESTS_UM,
        expectedTestCount: 1,
        files: [{ path: 'a/../../escape.mjs', code: 'malicioso' }],
      },
      exec,
    );
    assert.deepEqual(res, {
      passed: false,
      testsRun: 0,
      pass: 0,
      fail: 0,
      error: 'path inválido',
      checks: [],
      passedCount: 0,
      totalCount: 0,
      output: '',
    });
    assert.equal(chamadas.length, 0, 'nada foi executado');
  });

  it('linguagem desconhecida ⇒ erro estruturado (runStudentCode NUNCA lança)', async () => {
    const { exec } = execFake(SUCESSO_1_TESTE);
    const res = await runStudentCode(
      { studentCode: 'x', testsCode: TESTS_UM, expectedTestCount: 1, language: 'cobol' },
      exec,
    );
    assert.equal(res.passed, false);
    assert.equal(res.testsRun, 0);
    assert.equal(typeof res.error, 'string');
    assert.ok((res.error ?? '').length > 0);
  });

  it('falha de execução (sintaxe/spawn) ⇒ contagens zeradas, sem "N de M" inventado', async () => {
    const falha: ExecResult = {
      code: 1,
      stdout: '✖ test.mjs\nSyntaxError: Unexpected token',
      stderr: 'node:internal boom',
    };
    const res = await runStudentCode(
      { studentCode: 'x', testsCode: TESTS_UM, expectedTestCount: 1 },
      execFake(falha).exec,
    );
    assert.equal(res.passed, false);
    assert.equal(res.testsRun, 0);
    assert.deepEqual(res.checks, []);
    assert.equal(res.passedCount, 0);
    assert.equal(res.totalCount, 0, 'erro de execução não mostra "N de M"');
  });

  it('exit 0 sem checks parseados ⇒ total/passados caem nas contagens do resumo', async () => {
    const soResumo: ExecResult = { code: 0, stdout: 'ℹ tests 1\nℹ pass 1\nℹ fail 0\n', stderr: '' };
    const res = await runStudentCode(
      { studentCode: 'x', testsCode: TESTS_UM, expectedTestCount: 1 },
      execFake(soResumo).exec,
    );
    assert.deepEqual(res.checks, []);
    assert.equal(res.totalCount, 1);
    assert.equal(res.passedCount, 1);
  });
});

// ─── o par solução/starter ───────────────────────────────────────────────────

describe('cx/challengeExec: pairIsValid e challengePairFromSource', () => {
  it('pairIsValid: só a tripla verdadeira valida (tabela de verdade)', () => {
    for (const solutionPasses of [true, false]) {
      for (const starterFails of [true, false]) {
        for (const countMatches of [true, false]) {
          const v: ChallengePairVerdict = {
            solutionPasses,
            starterFails,
            countMatches,
            output: '',
          };
          assert.equal(
            pairIsValid(v),
            solutionPasses && starterFails && countMatches,
            `(${solutionPasses}, ${starterFails}, ${countMatches})`,
          );
        }
      }
    }
  });

  function fonte(over: Partial<TrackChallengeSource> = {}): TrackChallengeSource {
    return {
      schemaVersion: 1,
      slug: 'soma',
      title: 'Soma',
      concept: 'funcoes',
      difficulty: 2,
      language: 'nodejs',
      statement: 'st',
      starterCode: 'starter topo',
      solutionCode: 'solução topo',
      testsCode: 'test("t", () => {});',
      expectedTestCount: 1,
      ...over,
    };
  }

  it('arquivo único: copia códigos/contagem E a linguagem (a linha que decide o adaptador)', () => {
    const par = challengePairFromSource(fonte());
    assert.deepEqual(par, {
      solutionCode: 'solução topo',
      starterCode: 'starter topo',
      testsCode: 'test("t", () => {});',
      expectedTestCount: 1,
      solutionFiles: undefined,
      starterFiles: undefined,
      language: 'nodejs',
    });
  });

  it('multi-arquivo: mapeia solutionFiles/starterFiles e o topo vira "" (ausente no tipo)', () => {
    const par = challengePairFromSource(
      fonte({
        starterCode: undefined,
        solutionCode: undefined,
        files: [
          { path: 'lib/a.mjs', starterCode: 'sa', solutionCode: 'za' },
          { path: 'b.mjs', starterCode: 'sb', solutionCode: 'zb' },
        ],
      }),
    );
    assert.equal(par.solutionCode, '');
    assert.equal(par.starterCode, '');
    assert.deepEqual(par.solutionFiles, [
      { path: 'lib/a.mjs', code: 'za' },
      { path: 'b.mjs', code: 'zb' },
    ]);
    assert.deepEqual(par.starterFiles, [
      { path: 'lib/a.mjs', code: 'sa' },
      { path: 'b.mjs', code: 'sb' },
    ]);
    assert.equal(par.language, 'nodejs');
  });
});

describe('cx/challengeExec: verifyChallengePair (solução passa E starter falha)', () => {
  function par(over: Partial<ChallengePair> = {}): ChallengePair {
    return {
      solutionCode: 'export const x = 1;',
      starterCode: 'export function f() {}',
      testsCode: 'test("a", () => {});',
      expectedTestCount: 1,
      ...over,
    };
  }

  const starterFalha: ExecResult = {
    code: 1,
    stdout: '✖ a (0.2ms)\nℹ tests 1\nℹ pass 0\nℹ fail 1\n',
    stderr: '',
  };

  it('par saudável ⇒ solutionPasses + starterFails + countMatches (e o output junta os dois lados)', async () => {
    const { exec, chamadas } = execFake(SUCESSO_1_TESTE, starterFalha);
    const v = await verifyChallengePair(par(), exec);
    assert.deepEqual(
      { solutionPasses: v.solutionPasses, starterFails: v.starterFails, countMatches: v.countMatches },
      { solutionPasses: true, starterFails: true, countMatches: true },
    );
    assert.ok(v.output.includes('--- starter ---'), 'os dois lados ficam no output');
    assert.equal(pairIsValid(v), true);
    assert.equal(chamadas.length, 2, 'solução primeiro, starter depois');
  });

  it('contagem declarada ≠ esperada ⇒ countMatches false e o par reprova', async () => {
    const { exec } = execFake(SUCESSO_1_TESTE, starterFalha);
    const v = await verifyChallengePair(par({ expectedTestCount: 2 }), exec);
    assert.equal(v.countMatches, false);
    assert.equal(v.solutionPasses, false);
    assert.equal(pairIsValid(v), false);
  });

  it('starter que PASSA ⇒ starterFails false (o aluno não teria o que fazer)', async () => {
    const { exec } = execFake(SUCESSO_1_TESTE, SUCESSO_1_TESTE);
    const v = await verifyChallengePair(par(), exec);
    assert.equal(v.solutionPasses, true);
    assert.equal(v.starterFails, false);
    assert.equal(pairIsValid(v), false);
  });

  it('linguagem desconhecida LANÇA aqui (diferença deliberada de contrato vs runStudentCode)', async () => {
    const { exec } = execFake(SUCESSO_1_TESTE, starterFalha);
    await assert.rejects(() => verifyChallengePair(par({ language: 'cobol' }), exec));
  });
});

describe('cx/challengeExec: parseSpecChecks (re-export de jsParseChecks)', () => {
  it('parseia checks ✔/✖ sem duração e ignora o resumo', () => {
    const checks = parseSpecChecks('✔ soma (0.4ms)\n✖ outra (1ms)\nℹ tests 2\nℹ pass 1\nℹ fail 1\n');
    assert.deepEqual(checks, [
      { name: 'soma', passed: true },
      { name: 'outra', passed: false },
    ]);
  });
});
