/**
 * tests/engineExecAdapter.test.ts — P-28 (onda 2 batch B): a PONTE engine ↔
 * challengeExec (`engine/exec/adapter.ts`).
 *
 * Dois contratos de execução convivem no repositório, com o mesmo campo em
 * nomes diferentes:
 *
 *   - ENGINE (`engine/exec/proofs.ts`): `ExecResult { exitCode, stdout,
 *     stderr }` — o contrato dos julgadores puros das provas e do harness;
 *   - PRODUTO (`services/challengeExec.ts`): `ExecResult { code, stdout,
 *     stderr }` — o executor REAL da UI (nodeExec).
 *
 * A prova do pacote: `fromChallengeExec` é a ÚNICA ponte entre os dois —
 * mapeia `code` → `exitCode`, deixa `stdout`/`stderr` INTACTOS (bytes) e
 * lança erro ESTRUTURADO fail-closed quando o resultado não tem `code`.
 *
 * Contratos que mordem aqui (A-P07-2 — a suíte NÃO gera processo real; o
 * nodeExec do produto entra só na ADAPTAÇÃO DE ASSINATURA, nunca é chamado):
 *
 *   1. code → exitCode: 0 é sucesso; 1 e 137 (timeout-ou-OOM) preservados;
 *   2. stdout/stderr intactos em BYTES (ANSI, unicode, brancos de fim);
 *   3. dir/args repassados intactos, timeoutMs encaminhado e — P-31/A-P04-3 —
 *      `env` REPASSADO quando presente (o env endurecido do harness atravessa
 *      o adaptador até o nodeExec); chamada sem opts = sem opts no produto, e
 *      env ausente não cria a chave (defaults seguros);
 *   4. resultado sem `code` (shape inesperado — incl. null/undefined e
 *      `code` não-numérico) → `ExecShapeError` estruturado, fail-closed;
 *   5. a assinatura COMPILA com o ExecFn real do produto:
 *      `fromChallengeExec(challengeExec.nodeExec)` vira ExecFn da engine, e a
 *      composição documentada `createHardenedExec({ exec:
 *      fromChallengeExec(nodeExec) })` também compila;
 *   6. ponte provada nas duas pontas: o resultado adaptado alimenta os
 *      julgadores puros da engine (prova 2, `judgeStarterFails`).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { EXEC_SHAPE_INVALID, ExecShapeError, fromChallengeExec } from '../electron/main/engine/exec/adapter';
import { createHardenedExec } from '../electron/main/engine/exec/harness';
import { judgeStarterFails, type ExecFn } from '../electron/main/engine/exec/proofs';
import { nodeExec, type ExecFn as ChallengeExecFn } from '../electron/main/services/challengeExec';

// ---------------------------------------------------------------------------
// Fakes — executor no shape do PRODUTO, gravando as chamadas (A-P07-2)
// ---------------------------------------------------------------------------

interface RecordedCall {
  dir: string;
  args: string[];
  opts?: { timeoutMs?: number; env?: NodeJS.ProcessEnv };
}

/** Executor fake com shape do challengeExec: devolve os resultados em ordem. */
function recordingExec(results: Array<{ code: number; stdout: string; stderr: string }>) {
  const calls: RecordedCall[] = [];
  let i = 0;
  const exec: ChallengeExecFn = async (dir, args, opts) => {
    calls.push({ dir, args, opts });
    const r = results[Math.min(i, results.length - 1)];
    i += 1;
    return r;
  };
  return { exec, calls };
}

// ---------------------------------------------------------------------------
// 1. code → exitCode
// ---------------------------------------------------------------------------

describe('fromChallengeExec — mapeia code → exitCode', () => {
  it('0 é sucesso; 1 e 137 (timeout-ou-OOM) preservados', async () => {
    const { exec } = recordingExec([
      { code: 0, stdout: 'a', stderr: '' },
      { code: 1, stdout: '', stderr: 'falhou' },
      { code: 137, stdout: '', stderr: '' },
    ]);
    const adapted = fromChallengeExec(exec);
    assert.deepEqual(await adapted('d1', ['--test']), { exitCode: 0, stdout: 'a', stderr: '' });
    assert.deepEqual(await adapted('d2', ['--test']), { exitCode: 1, stdout: '', stderr: 'falhou' });
    assert.deepEqual(await adapted('d3', ['--test']), { exitCode: 137, stdout: '', stderr: '' });
  });

  it('stdout/stderr INTACTOS (bytes): ANSI, unicode e brancos de fim preservados', async () => {
    const stdout = '\x1b[31mℹ tests 2\x1b[39m\nслед строки  \nemoji 🧪 e fim\n\n';
    const stderr = 'trace: linha com  espaços   \n';
    const { exec } = recordingExec([{ code: 0, stdout, stderr }]);
    const res = await fromChallengeExec(exec)('d', ['--test']);
    assert.deepEqual(res, { exitCode: 0, stdout, stderr });
    assert.equal(res.stdout, stdout, 'stdout byte a byte — nada foi trimmado/decodificado');
    assert.equal(res.stderr, stderr, 'stderr byte a byte');
    // round-trip utf8 idêntico (bytes, não só igualdade de string).
    assert.equal(Buffer.compare(Buffer.from(res.stdout, 'utf8'), Buffer.from(stdout, 'utf8')), 0);
    assert.equal(Buffer.compare(Buffer.from(res.stderr, 'utf8'), Buffer.from(stderr, 'utf8')), 0);
  });
});

// ---------------------------------------------------------------------------
// 2. dir/args/opts repassados ao executor subjacente
// ---------------------------------------------------------------------------

describe('fromChallengeExec — repasse de dir/args/opts', () => {
  it('dir e args repassados intactos; timeoutMs encaminhado; env REPASSADO quando presente (P-31)', async () => {
    const args = ['--test', '--test-reporter=spec', 'test.mjs'];
    const { exec, calls } = recordingExec([{ code: 0, stdout: '', stderr: '' }]);
    const adapted = fromChallengeExec(exec);
    // opts no shape da ENGINE (timeoutMs + env): o aditivo P-31/A-P04-3 faz o
    // env atravessar o adaptador — o env endurecido do harness chega ao
    // nodeExec (`opts.env ?? process.env`).
    const env: NodeJS.ProcessEnv = { PATH: '/usr/bin', NO_PROXY: '*' };
    await adapted('/tmp/trilha-prova', args, { timeoutMs: 42_000, env });
    assert.equal(calls.length, 1, 'uma chamada ao executor subjacente por chamada do adaptado');
    assert.equal(calls[0].dir, '/tmp/trilha-prova');
    assert.deepEqual(calls[0].args, args, 'args repassados intactos');
    assert.deepEqual(calls[0].opts, { timeoutMs: 42_000, env }, 'timeoutMs E env encaminhados — o furo do replan fechado');
  });

  it('env ausente não cria a chave (defaults seguros — histórico com só timeoutMs intacto)', async () => {
    const { exec, calls } = recordingExec([{ code: 0, stdout: '', stderr: '' }]);
    await fromChallengeExec(exec)('d', ['--test'], { timeoutMs: 9_000 });
    assert.deepEqual(calls[0].opts, { timeoutMs: 9_000 }, 'sem env no chamador ⇒ sem env no produto');
  });

  it('env sozinho (sem timeoutMs) também é repassado', async () => {
    const { exec, calls } = recordingExec([{ code: 0, stdout: '', stderr: '' }]);
    const env: NodeJS.ProcessEnv = { SM_F9: '1' };
    await fromChallengeExec(exec)('d', ['--test'], { env });
    assert.deepEqual(calls[0].opts, { env });
  });

  it('chamada sem opts → executor subjacente chamado sem opts (defaults seguros)', async () => {
    const { exec, calls } = recordingExec([{ code: 0, stdout: '', stderr: '' }]);
    await fromChallengeExec(exec)('d', ['--test']);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].opts, undefined);
  });
});

// ---------------------------------------------------------------------------
// 3. Fail-closed: resultado sem `code` → erro estruturado
// ---------------------------------------------------------------------------

describe('fromChallengeExec — fail-closed em shape inesperado (sem code)', () => {
  it('resultado SEM code (shape errado) → ExecShapeError estruturado', async () => {
    const malformed = { stdout: 'relatório', stderr: '' }; // sem `code`
    const broken: ChallengeExecFn = async () => malformed as never;
    await assert.rejects(() => fromChallengeExec(broken)('d', ['--test']), (err: unknown) => {
      assert.ok(err instanceof ExecShapeError, 'instância do erro estruturado');
      assert.equal(err.name, 'ExecShapeError');
      assert.equal(err.code, EXEC_SHAPE_INVALID, 'code estável para a UI/log');
      assert.match(err.message, /sem 'code'/, 'mensagem aponta a causa');
      assert.deepEqual(err.received, malformed, 'o resultado cru fica disponível para diagnóstico');
      return true;
    });
  });

  it('executor que devolve null/undefined também derruba fechado', async () => {
    await assert.rejects(() => fromChallengeExec(async () => null as never)('d', ['--test']), ExecShapeError);
    await assert.rejects(() => fromChallengeExec(async () => undefined as never)('d', ['--test']), ExecShapeError);
  });

  it('code não-numérico (ex.: "0" string) é shape inesperado → erro estruturado', async () => {
    const broken: ChallengeExecFn = async () => ({ code: '0' as never, stdout: '', stderr: '' });
    await assert.rejects(() => fromChallengeExec(broken)('d', ['--test']), ExecShapeError);
  });

  it('erro estruturado NUNCA se transforma em exitCode inventado (propaga)', async () => {
    const broken: ChallengeExecFn = async () => ({ stdout: 'x', stderr: '' }) as never;
    const adapted = fromChallengeExec(broken);
    await assert.rejects(() => adapted('d', ['--test']), ExecShapeError);
  });
});

// ---------------------------------------------------------------------------
// 4. Assinatura compila com o ExecFn REAL do produto + composição documentada
// ---------------------------------------------------------------------------

describe('fromChallengeExec — assinatura com o ExecFn real do challengeExec', () => {
  it('fromChallengeExec(nodeExec) vira ExecFn da engine (compila sem chamar nada)', () => {
    // A-P07-2: o nodeExec real NUNCA é chamado aqui — só a adaptação de
    // assinatura é provada (o mapeamento acontece na chamada, coberto pelos
    // fakes acima).
    const adapted: ExecFn = fromChallengeExec(nodeExec);
    assert.equal(typeof adapted, 'function');
    assert.notEqual(adapted, nodeExec, 'a engine nunca recebe o ExecFn do produto direto');
  });

  it('a composição documentada compila: createHardenedExec({ exec: fromChallengeExec(nodeExec) })', () => {
    // P-07 AO REDOR do adaptador — também sem chamar nada (sem semáforo
    // adquirido, sem spawn).
    const hardened = createHardenedExec({ exec: fromChallengeExec(nodeExec) });
    assert.equal(typeof hardened, 'function');
  });
});

// ---------------------------------------------------------------------------
// 5. Ponte nas duas pontas: resultado adaptado alimenta os juízes da engine
// ---------------------------------------------------------------------------

describe('fromChallengeExec — o resultado adaptado alimenta a engine', () => {
  it('prova 2 (judgeStarterFails): exit != 0 vindo do produto FAILHA a prova? não — passa', async () => {
    const { exec } = recordingExec([
      { code: 1, stdout: 'ℹ tests 1\nℹ pass 0\nℹ fail 1\n', stderr: '' },
    ]);
    const j = judgeStarterFails(await fromChallengeExec(exec)('d', ['--test']));
    assert.equal(j.passed, true, 'starter falhou (exit 1) === o que a prova 2 espera');
  });

  it('o fluxo vira um ExecFn da engine em qualquer ponto que espere ExecFn (spec args canônicos)', async () => {
    const adapted = fromChallengeExec(
      recordingExec([{ code: 137, stdout: '', stderr: 'timeout' }]).exec,
    );
    const res = await adapted('/tmp/d', ['--test', '--test-reporter=spec', 'test.mjs'], { timeoutMs: 30_000 });
    assert.equal(res.exitCode, 137);
    assert.equal(res.stderr, 'timeout');
  });
});