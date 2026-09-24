/**
 * tests/cx-phases-exec-proofs.test.ts — CARACTERIZAÇÃO (golden master) de
 * `engine/exec/proofs.ts` (as provas de execução de um desafio, §5.4).
 *
 * PINA: os quatro julgadores puros (solutionPasses/starterFails/
 * countMatches/emptyStubFails) + a quinta prova (typesCheck), o parser do
 * relatório spec (último bloco de resumo, tolerante a ANSI), o fail-closed do
 * orquestrador `verifyChallengeProofs` (veredito estruturado, execError,
 * cleanup SEMPRE) e o contrato observável do veredito.
 *
 * ExecFn/ProofEnv INJETADOS — nenhum processo real, nenhum disco.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  EMPTY_STUB_CODE,
  SPEC_TEST_ARGS,
  adapterDoDesafio,
  execOutput,
  exitCodeMeaning,
  judgeCountMatches,
  judgeEmptyStubFails,
  judgeSolutionPasses,
  judgeStarterFails,
  judgeTypesCheck,
  parseSpecCounts,
  proofsAllPass,
  verifyChallengeProofs,
  type ChallengeProofsInput,
  type ExecResult,
  type ProofEnv,
} from '../electron/main/engine/exec/proofs';
import {
  TYPES_CHECK_NAO_APLICAVEL,
  type TypesCheckResult,
} from '../electron/main/engine/exec/typesCheck';
import { getAdapter, type LanguageAdapter } from '../electron/main/engine/lang/registry';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Relatório spec do node:test (o formato real: bloco ℹ no fim). */
function relatorio(tests: number, pass: number, fail: number, skipped = 0): string {
  return [
    '✔ teste qualquer',
    '',
    `ℹ tests ${tests}`,
    `ℹ suites 0`,
    `ℹ pass ${pass}`,
    `ℹ fail ${fail}`,
    'ℹ cancelled 0',
    `ℹ skipped ${skipped}`,
  ].join('\n');
}

function execOk(tests: number): ExecResult {
  return { exitCode: 0, stdout: relatorio(tests, tests, 0), stderr: '' };
}

function execFalhando(exitCode = 1, stdout = ''): ExecResult {
  return { exitCode, stdout, stderr: 'rodada falhou' };
}

const TESTS_CODE_2 = `import { test } from 'node:test';\ntest('a', () => {});\ntest('b', () => {});\n`;

function entrada(over: Partial<ChallengeProofsInput> = {}): ChallengeProofsInput {
  return {
    solutionCode: 'export function soma(a, b) { return a + b; }',
    starterCode: 'export function soma(a, b) { /* TODO */ }',
    testsCode: TESTS_CODE_2,
    expectedTestCount: 2,
    ...over,
  };
}

interface EnvFake {
  env: ProofEnv;
  preparados: string[];
  executados: { dir: string; args: string[] }[];
  limpos: string[];
  tiposChamados: string[];
}

/**
 * Env fake: prepare gera dirs 'dir-1..3', exec devolve o resultado pedido por
 * `rodadas` (por índice de chamada) e registra tudo.
 */
function envFake(
  rodadas: ExecResult[],
  over: Partial<ProofEnv> = {},
): EnvFake {
  const fake: EnvFake = {
    preparados: [],
    executados: [],
    limpos: [],
    tiposChamados: [],
    env: null as unknown as ProofEnv,
  };
  fake.env = {
    async prepare(side) {
      fake.preparados.push(side.code);
      return `dir-${fake.preparados.length}`;
    },
    async exec(dir, args) {
      fake.executados.push({ dir, args });
      return rodadas[fake.executados.length - 1] ?? execFalhando(9);
    },
    async cleanup(dir) {
      fake.limpos.push(dir);
    },
    ...over,
  };
  return fake;
}

// ---------------------------------------------------------------------------
// 1. Superfície de apoio
// ---------------------------------------------------------------------------

describe('proofs — superfície de apoio', () => {
  it('EMPTY_STUB_CODE é ESM válido sem exportação; SPEC_TEST_ARGS vem do adaptador default', () => {
    assert.equal(EMPTY_STUB_CODE, 'export {};\n');
    assert.deepEqual([...SPEC_TEST_ARGS], ['--test', '--test-reporter=spec', 'test.mjs']);
  });

  it('execOutput junta stdout+stderr aparados', () => {
    assert.equal(execOutput({ exitCode: 0, stdout: ' saída ', stderr: ' erro ' }), 'saída \n erro');
    assert.equal(execOutput({ exitCode: 0, stdout: '', stderr: '' }), '');
  });

  it('exitCodeMeaning: 137 é "timeout-ou-OOM" (ambiguidade preservada); o resto é "exit N"', () => {
    assert.equal(exitCodeMeaning(137), 'timeout-ou-OOM');
    assert.equal(exitCodeMeaning(2), 'exit 2');
    assert.equal(exitCodeMeaning(0), 'exit 0');
  });

  it('parseSpecCounts lê o ÚLTIMO bloco de resumo (defesa contra relatório forjado)', () => {
    const forjado = relatorio(9, 9, 0) + '\nconsole.log do código sob teste\n' + relatorio(2, 2, 0);
    assert.deepEqual(parseSpecCounts(forjado), { testsRun: 2, pass: 2, fail: 0, skipped: 0 }, 'o do runner real vem por último');
  });

  it('parseSpecCounts tolera ANSI e devolve zeros sem bloco de resumo', () => {
    const colorido = '\x1b[32mℹ tests 3\x1b[39m\n\x1b[32mℹ pass 3\x1b[39m\nℹ fail 0\nℹ skipped 0';
    assert.deepEqual(parseSpecCounts(colorido), { testsRun: 3, pass: 3, fail: 0, skipped: 0 });
    assert.deepEqual(parseSpecCounts('nada aqui'), { testsRun: 0, pass: 0, fail: 0, skipped: 0 });
  });

  it('adapterDoDesafio: token ausente/vazio cai no default; token conhecido resolve; desconhecido LANÇA', () => {
    assert.equal(adapterDoDesafio(undefined).id, 'javascript');
    assert.equal(adapterDoDesafio(null).id, 'javascript');
    assert.equal(adapterDoDesafio('').id, 'javascript');
    assert.equal(adapterDoDesafio('nodejs').id, 'javascript', "'nodejs' é runtime alias do javascript");
    assert.equal(adapterDoDesafio('python').id, 'python');
    assert.throws(() => adapterDoDesafio('cobol'), /cobol/, 'token desconhecido é fail-closed, nunca default silencioso');
  });
});

// ---------------------------------------------------------------------------
// 2. Prova 1 — judgeSolutionPasses
// ---------------------------------------------------------------------------

describe('proofs — prova 1 (solução passa em TODOS)', () => {
  it('passagem integral com consistência estrita: passa', () => {
    const j = judgeSolutionPasses(execOk(2), 2);
    assert.deepEqual(j, { proof: 'solutionPasses', passed: true });
  });

  it('exit não-zero reprova com o significado do adaptador', () => {
    const j = judgeSolutionPasses(execFalhando(137), 2);
    assert.equal(j.passed, false);
    assert.match(j.reason ?? '', /timeout-ou-OOM/);
    assert.equal(j.detail?.exitCode, 137);
  });

  it('exit 0 com ZERO testes executados é FALHA (exit code sozinho mente)', () => {
    const j = judgeSolutionPasses({ exitCode: 0, stdout: 'sem resumo nenhum', stderr: '' }, 2);
    assert.equal(j.passed, false);
    assert.match(j.reason ?? '', /ZERO testes executados/);
  });

  it('teste falhando reprova; teste SKIPADO reprova (passagem integral é do bloco)', () => {
    const cFalha = judgeSolutionPasses({ exitCode: 0, stdout: relatorio(2, 1, 1), stderr: '' }, 2);
    assert.equal(cFalha.passed, false);
    assert.match(cFalha.reason ?? '', /testes falhando \(fail 1\)/);

    const cSkip = judgeSolutionPasses({ exitCode: 0, stdout: relatorio(2, 1, 0, 1), stderr: '' }, 2);
    assert.equal(cSkip.passed, false);
    assert.match(cSkip.reason ?? '', /SKIPADOS/);
  });

  it('relatório internamente inconsistente (pass ≠ testsRun) reprova', () => {
    const j = judgeSolutionPasses({ exitCode: 0, stdout: relatorio(2, 1, 0, 0), stderr: '' }, 2);
    assert.equal(j.passed, false);
    assert.match(j.reason ?? '', /pass 1 ≠ testsRun 2/);
  });

  it('contagem executada ≠ expectedTestCount reprova', () => {
    const j = judgeSolutionPasses(execOk(3), 2);
    assert.equal(j.passed, false);
    assert.match(j.reason ?? '', /executou 3 de 2 testes esperados/);
  });
});

// ---------------------------------------------------------------------------
// 3. Provas 2 e 4 — o espelho do starter e do stub vazio
// ---------------------------------------------------------------------------

describe('proofs — provas 2 e 4 (starter e stub vazio FALHAM)', () => {
  it('starter que falha (exit ≠ 0) passa; starter que sai 0 reprova', () => {
    assert.equal(judgeStarterFails(execFalhando(1)).passed, true);
    const passou = judgeStarterFails(execOk(2));
    assert.equal(passou.passed, false);
    assert.match(passou.reason ?? '', /starterCode passou \(exit 0\)/);
    assert.equal(passou.detail?.exitCode, 0);
  });

  it('stub vazio que falha passa; stub vazio que sai 0 reprova (teste tautológico)', () => {
    assert.equal(judgeEmptyStubFails(execFalhando(1)).passed, true);
    const tautologico = judgeEmptyStubFails(execOk(2));
    assert.equal(tautologico.passed, false);
    assert.match(tautologico.reason ?? '', /tautológicos/);
  });
});

// ---------------------------------------------------------------------------
// 4. Prova 3 — judgeCountMatches (dupla contagem: declarada × executada)
// ---------------------------------------------------------------------------

describe('proofs — prova 3 (contagem declarada × executada)', () => {
  it('declarado === executado === expected: passa', () => {
    assert.equal(judgeCountMatches(2, 2, execOk(2)).passed, true);
  });

  it('expectedTestCount < 1 é inválido por construção', () => {
    const j = judgeCountMatches(0, 0, execOk(0));
    assert.equal(j.passed, false);
    assert.match(j.reason ?? '', /deve ser ≥ 1/);
  });

  it('declarado ≠ expected reprova nomeando os dois números', () => {
    const j = judgeCountMatches(3, 2, execOk(2));
    assert.equal(j.passed, false);
    assert.match(j.reason ?? '', /testes declarados \(3\) ≠ expectedTestCount \(2\)/);
  });

  it('nada executado ou executado ≠ expected reprova', () => {
    const nada = judgeCountMatches(2, 2, { exitCode: 0, stdout: '', stderr: '' });
    assert.equal(nada.passed, false);
    assert.match(nada.reason ?? '', /nenhum teste executado/);
    const divergente = judgeCountMatches(2, 2, execOk(3));
    assert.equal(divergente.passed, false);
    assert.match(divergente.reason ?? '', /testes executados \(3\) ≠ expectedTestCount \(2\)/);
  });
});

// ---------------------------------------------------------------------------
// 5. Prova 5 — judgeTypesCheck (opcional por linguagem, SÓ a solução)
// ---------------------------------------------------------------------------

describe('proofs — prova 5 (verificação de tipos da solução)', () => {
  function tiposOk(over: Partial<TypesCheckResult> = {}): TypesCheckResult {
    return { applicable: true, ok: true, output: '', exitCode: 0, degradacao: null, ...over };
  }

  it('não rodou + linguagem que NÃO exige (javascript) ⇒ PASSA com applicable:false', () => {
    const j = judgeTypesCheck(TYPES_CHECK_NAO_APLICAVEL);
    assert.deepEqual(j, { proof: 'typesCheck', passed: true });
  });

  it('não rodou + linguagem QUE EXIGE (typescript) ⇒ REPROVA (fail-closed)', () => {
    const ts = getAdapter('typescript');
    const j = judgeTypesCheck(tiposOk({ applicable: false, ok: true, degradacao: 'compilador ausente' }), ts);
    assert.equal(j.passed, false);
    assert.match(j.reason ?? '', /exige verificação de TIPO/);
    assert.match(j.reason ?? '', /compilador ausente/);
  });

  it('rodou degradada reprova; rodou e falhou reprova com diagnósticos, qualquer que seja a política', () => {
    const degradada = judgeTypesCheck(tiposOk({ degradacao: 'tsc não encontrado' }));
    assert.equal(degradada.passed, false);
    assert.match(degradada.reason ?? '', /indisponível: tsc não encontrado/);

    const reprovada = judgeTypesCheck(tiposOk({ ok: false, output: 'solution.ts(1,1): error TS2322', exitCode: 2 }));
    assert.equal(reprovada.passed, false);
    assert.match(reprovada.reason ?? '', /NÃO passa na verificação de tipos/);
    assert.match(reprovada.reason ?? '', /error TS2322/);
  });

  it('rodou e passou ⇒ approved', () => {
    assert.equal(judgeTypesCheck(tiposOk()).passed, true);
  });
});

// ---------------------------------------------------------------------------
// 6. Orquestrador — verifyChallengeProofs (fail-closed, cleanup SEMPRE)
// ---------------------------------------------------------------------------

describe('proofs — verifyChallengeProofs (veredito estruturado)', () => {
  it('todas as provas passam: veredito válido com declared/executed e as 3 rodadas', async () => {
    const fake = envFake([execOk(2), execFalhando(1), execFalhando(1)]);
    const v = await verifyChallengeProofs(entrada(), fake.env);
    assert.equal(v.valid, true);
    assert.deepEqual(v.failures, []);
    assert.equal(v.declared, 2, 'declarado por AST sobre testsCode');
    assert.equal(v.executed, 2);
    assert.ok(v.executions, 'as três rodadas brutas acompanham o veredito');
    assert.equal(proofsAllPass(v), true);
    assert.deepEqual(fake.preparados.length, 3, 'três diretórios isolados (solução, starter, stub)');
    assert.deepEqual(fake.limpos.sort(), ['dir-1', 'dir-2', 'dir-3'], 'cleanup roda sempre');
  });

  it('cada lado recebe os args de teste do adaptador e roda em dir próprio', async () => {
    const fake = envFake([execOk(2), execFalhando(1), execFalhando(1)]);
    await verifyChallengeProofs(entrada(), fake.env);
    assert.deepEqual(fake.executados.map((e) => e.dir), ['dir-1', 'dir-2', 'dir-3']);
    for (const e of fake.executados) {
      assert.deepEqual(e.args, [...SPEC_TEST_ARGS]);
    }
  });

  it('uma prova que falha vira failures[] com o id da prova; valid=false', async () => {
    // starter sai 0 (prova 2 reprova) — tudo o mais ok.
    const fake = envFake([execOk(2), execOk(2), execFalhando(1)]);
    const v = await verifyChallengeProofs(entrada(), fake.env);
    assert.equal(v.valid, false);
    assert.deepEqual(v.failures.map((f) => f.proof), ['starterFails']);
    assert.equal(proofsAllPass(v), false);
  });

  it('solução que não passa + contagem divergente reporta as DUAS provas', async () => {
    const fake = envFake([
      { exitCode: 0, stdout: relatorio(3, 2, 1), stderr: '' },
      execFalhando(1),
      execFalhando(1),
    ]);
    const v = await verifyChallengeProofs(entrada(), fake.env);
    assert.deepEqual(
      v.failures.map((f) => f.proof).sort(),
      ['countMatches', 'solutionPasses'],
    );
  });

  it('language desconhecido é fail-closed: veredito inválido com execError (nunca parser errado)', async () => {
    const fake = envFake([]);
    const v = await verifyChallengeProofs(entrada({ language: 'cobol' }), fake.env);
    assert.equal(v.valid, false);
    assert.equal(v.execError !== undefined, true);
    assert.deepEqual(v.failures.map((f) => f.proof), ['execError']);
    assert.equal(fake.executados.length, 0, 'nada roda com adaptador desconhecido');
    assert.equal(v.executed, 0);
  });

  it('exceção da infraestrutura (exec lançou) vira veredito inválido com execError', async () => {
    const fake = envFake([], {
      async exec() {
        throw new Error('spawn morreu');
      },
    });
    const v = await verifyChallengeProofs(entrada(), fake.env);
    assert.equal(v.valid, false);
    assert.match(v.execError ?? '', /spawn morreu/);
    assert.deepEqual(v.failures.map((f) => f.proof), ['execError']);
    assert.deepEqual(fake.limpos.sort(), ['dir-1', 'dir-2', 'dir-3'], 'cleanup roda MESMO em falha');
  });

  it('o seam typesCheck é chamado SÓ com o diretório da SOLUÇÃO', async () => {
    const fake = envFake([execOk(2), execFalhando(1), execFalhando(1)], {
      async typesCheck(dir) {
        fake.tiposChamados.push(dir);
        return TYPES_CHECK_NAO_APLICAVEL;
      },
    });
    await verifyChallengeProofs(entrada(), fake.env);
    assert.deepEqual(fake.tiposChamados, ['dir-1']);
  });

  it('stub vazio multi-arquivo espelha os paths da solução com EMPTY_STUB_CODE', async () => {
    const lados: { code: string; files?: { path: string; code: string }[] }[] = [];
    const fake = envFake([execOk(2), execFalhando(1), execFalhando(1)], {
      async prepare(side) {
        lados.push({ code: side.code, files: side.files });
        return `dir-${lados.length}`;
      },
    });
    await verifyChallengeProofs(
      entrada({
        solutionFiles: [
          { path: 'solution.mjs', code: 'export const a = 1;' },
          { path: 'lib/extra.mjs', code: 'export const b = 2;' },
        ],
      }),
      fake.env,
    );
    assert.equal(lados[2].code, EMPTY_STUB_CODE, 'o lado do stub é SEMPRE o stub vazio');
    assert.deepEqual(lados[2].files, [
      { path: 'solution.mjs', code: EMPTY_STUB_CODE },
      { path: 'lib/extra.mjs', code: EMPTY_STUB_CODE },
    ], 'mesmos paths da solução, cada arquivo vazio');
  });

  it('emptyStubCode/emptyStubFiles explícitos são respeitados no lado do stub', async () => {
    let codigoDoStub: string | null = null;
    const fake = envFake([execOk(2), execFalhando(1), execFalhando(1)], {
      async prepare(side) {
        if (side.code !== 'solução' && side.code !== 'starter' && codigoDoStub === null) codigoDoStub = side.code;
        return `dir-${++contador}`;
      },
    });
    let contador = 0;
    await verifyChallengeProofs(
      entrada({ solutionCode: 'solução', starterCode: 'starter', emptyStubCode: 'export const vazio = true;' }),
      fake.env,
    );
    assert.equal(codigoDoStub, 'export const vazio = true;');
  });

  it('timeoutMs da entrada é repassado a todas as rodadas de execução', async () => {
    const vistas: number[] = [];
    const fake = envFake([execOk(2), execFalhando(1), execFalhando(1)], {
      async exec(_dir, _args, opts) {
        vistas.push(opts?.timeoutMs ?? -1);
        return vistas.length === 1 ? execOk(2) : execFalhando(1);
      },
    });
    await verifyChallengeProofs(entrada({ timeoutMs: 5_000 }), fake.env);
    assert.deepEqual(vistas, [5_000, 5_000, 5_000]);
  });
});
