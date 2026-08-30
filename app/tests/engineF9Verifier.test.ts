/**
 * tests/engineF9Verifier.test.ts — P-31 (onda 2): o PROVADOR OFICIAL de provas
 * de execução (`engine/phases/f9Verifier.ts` — integração F9).
 *
 * A-P07-2: a suíte NÃO gera processo real — o provador recebe executor FAKE:
 * o default compõe `createHardenedExec({ exec: fromChallengeExec(nodeExec),
 * limiter })`, mas os testes injetam o fake (engine-shaped) ou o ADAPTADOR
 * sobre um fake do produto (challengeExec-shaped) e a cadeia completa —
 * provador → hardened → adapter → fake — prova o furo fechado sem spawn.
 *
 * As provas do pacote:
 *
 *   1. provador com exec FAKE produz veredito e os diretórios isolados são
 *      limpos (base injetada VAZIA ao final — nada de proof-exec-* no tmp);
 *   2. os args recebidos pelo exec fake contêm `--require <dir>/exit-guard.cjs`
 *      (no DIR isolado — o arquivo EXISTE, o prepare o escreveu) + os args de
 *      teste do PRODUTO (`--test --test-reporter=spec test.mjs`, espelho do
 *      challengeExec — o modo do produto NÃO muda);
 *   3. as camadas de env: a cadeia COMPLETA com adapter — o exec fake
 *      (challengeExec-shaped) captura `opts.env` SEM NODE_TEST_CONTEXT /
 *      proxies / NODE_OPTIONS / FORCE_COLOR e com NO_PROXY=* — o env
 *      endurecido do harness ATRAVESSA o adapter até o spawn (o furo do
 *      replan fechado);
 *   4. falha de infra (prepare E exec) → veredito INVÁLIDO com `execError`,
 *      NUNCA exceção ao chamador (fail-closed), e o isolamento continua limpo;
 *   4b. falha do EXIT-GUARD (seam `opts.escreverGuard` injetado — sem
 *      rede/FS hacky): o mkdtemp JÁ criou o dir, o guard rejeita ⇒ veredito
 *      inválido com execError (fail-closed) E o dir do mkdtemp é LIMPO AQUI
 *      (janela de vazamento fechada — nenhum proof-exec-* órfão na base);
 *   5. o adaptador repassa env: `fromChallengeExec` sobre fake do produto
 *      verifica o env encaminhado (e a ausência que não cria a chave);
 *   6. o limitador do provador (SEM_EXEC, semáforo do P-01) respeita teto 1
 *      com 3 chamadas concorrentes (fake lento — pico medido == 1).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fsPromises } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { criarProverDeDesafio, argsDeTeste } from '../electron/main/engine/phases/f9Verifier';
import { fromChallengeExec } from '../electron/main/engine/exec/adapter';
import {
  SPEC_TEST_ARGS,
  type ChallengeProofsInput,
  type ExecFn,
} from '../electron/main/engine/exec/proofs';
import { createSemaphore } from '../electron/main/engine/runtime/semaphore';
import { type ExecFn as ChallengeExecFn } from '../electron/main/services/challengeExec';

// ---------------------------------------------------------------------------
// Fixtures — relatório spec mínimo (regra 3: nenhum conteúdo didático)
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

const OK = { code: 0, stdout: specOut(2, 2, 0), stderr: '' };
const FAIL = { code: 1, stdout: specOut(2, 1, 1), stderr: '' };

const BASE_INPUT: ChallengeProofsInput = {
  solutionCode: 'export function f(x) { return x + 1; }\n',
  starterCode: 'export function f(x) { throw new Error("não implementado"); }\n',
  testsCode:
    "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { f } from './solution.mjs';\ntest('caso 1', () => { assert.equal(f(1), 2); });\ntest('caso 2', () => { assert.equal(f(2), 3); });\n",
  expectedTestCount: 2,
};

interface FakeCall {
  dir: string;
  args: string[];
  opts?: { timeoutMs?: number; env?: NodeJS.ProcessEnv };
}

/**
 * Fake do EXECUTOR DO PRODUTO (challengeExec-shaped): devolve em ordem.
 * `onCall` roda DENTRO da chamada (antes do resolve) — o diretório isolado
 * ainda existe aí; depois do prover resolver o cleanup já o removeu.
 */
function fakeProdutoExec(
  results: Array<{ code: number; stdout: string; stderr: string }>,
  onCall?: (dir: string) => Promise<void>,
) {
  const calls: FakeCall[] = [];
  let i = 0;
  const exec: ChallengeExecFn = async (dir, args, opts) => {
    calls.push({ dir, args, opts });
    if (onCall) await onCall(dir);
    const r = results[Math.min(i, results.length - 1)];
    i += 1;
    return r;
  };
  return { exec, calls };
}

/** Base injetada NOVA (provas observam isolamento sem tocar o tmp global). */
async function novaBase(): Promise<string> {
  return fsPromises.mkdtemp(path.join(os.tmpdir(), 'f9-base-'));
}

// ---------------------------------------------------------------------------
// 1. Veredito com exec FAKE + diretório isolado LIMPO ao final
// ---------------------------------------------------------------------------

describe('criarProverDeDesafio — veredito com exec FAKE e isolamento', () => {
  it('produz veredito estruturado e a base injetada fica VAZIA ao final (cleanup SEMPRE)', async () => {
    const base = await novaBase();
    try {
      const { exec, calls } = fakeProdutoExec([OK, FAIL, FAIL]);
      const prover = criarProverDeDesafio({ exec: fromChallengeExec(exec), baseDir: base });
      const v = await prover(BASE_INPUT);
      assert.equal(v.valid, true, 'as quatro provas passaram com os resultados certos');
      assert.deepEqual(v.failures, []);
      assert.equal(v.declared, 2, 'declarados via AST (countTestDeclarations do extract)');
      assert.equal(v.executed, 2, 'executados medidos no relatório da rodada da solução');
      assert.equal(calls.length, 3, 'exatamente 3 rodadas (solução, starter, stub)');
      assert.equal(v.executions?.solution.exitCode, 0);
      assert.equal(v.executions?.starter.exitCode, 1);
      assert.equal(v.executions?.emptyStub.exitCode, 1);
      const restantes = await fsPromises.readdir(base);
      assert.deepEqual(restantes, [], 'nenhum diretório proof-exec-* sobrou — cleanup rodou para os 3 lados');
    } finally {
      await fsPromises.rm(base, { recursive: true, force: true }).catch(() => {});
    }
  });
});

// ---------------------------------------------------------------------------
// 2. --require do exit-guard (no DIR isolado) + args de teste do PRODUTO
// ---------------------------------------------------------------------------

describe('criarProverDeDesafio — args do runner', () => {
  it('exec fake recebe --require do exit-guard no dir isolado + os args de teste do produto', async () => {
    const base = await novaBase();
    try {
      // o guard é conferido DENTRO da chamada (o onCall roda antes do resolve
      // do exec) — depois do prover resolver o cleanup já removeu os dirs.
      const guardesVistos: string[] = [];
      const { exec, calls } = fakeProdutoExec([OK, FAIL, FAIL], async (dir) => {
        const guard = path.join(dir, 'exit-guard.cjs');
        const stat = await fsPromises.stat(guard);
        assert.ok(stat.isFile(), 'exit-guard.cjs existe no dir isolado na hora da execução');
        guardesVistos.push(guard);
      });
      const prover = criarProverDeDesafio({ exec: fromChallengeExec(exec), baseDir: base });
      const v = await prover(BASE_INPUT);
      assert.equal(v.valid, true);
      assert.equal(calls.length, 3);
      assert.equal(guardesVistos.length, 3, 'cada rodada viu o próprio exit-guard.cjs');
      for (const c of calls) {
        assert.ok(c.dir.startsWith(path.join(base, 'proof-exec-')), `dir isolado sob a base injetada: ${c.dir}`);
        const guard = path.join(c.dir, 'exit-guard.cjs');
        // --require do guard ANTES dos args de teste — espelho do produto:
        // `node --test --test-reporter=spec test.mjs` (o MODO não muda;
        // multi-arquivo vive no CONTEÚDO do diretório).
        assert.deepEqual(c.args, ['--require', guard, ...SPEC_TEST_ARGS]);
      }
      assert.deepEqual(argsDeTeste(BASE_INPUT), [...SPEC_TEST_ARGS]);
    } finally {
      await fsPromises.rm(base, { recursive: true, force: true }).catch(() => {});
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Camadas de env — o env endurecido ATRAVESSA o adapter (furo fechado)
// ---------------------------------------------------------------------------

describe('criarProverDeDesafio — camadas de env (endurecimento atravessa o adapter)', () => {
  it('exec fake do PRODUTO (atrás do adapter) captura opts.env sem NODE_TEST_CONTEXT/proxies/NODE_OPTIONS/FORCE_COLOR e com NO_PROXY=*', async () => {
    const base = await novaBase();
    try {
      const { exec, calls } = fakeProdutoExec([OK, FAIL, FAIL]);
      // cadeia COMPLETA: provador → createHardenedExec (env endurecido) →
      // fromChallengeExec (adapter — antigamente DESCARTAVA o env) → fake.
      const prover = criarProverDeDesafio({ exec: fromChallengeExec(exec), baseDir: base });
      const v = await prover(BASE_INPUT);
      assert.equal(v.valid, true);
      assert.equal(calls.length, 3);
      for (const c of calls) {
        const env = c.opts?.env;
        assert.ok(env, 'o env chegou ao executor do PRODUTO — o adaptador repassou');
        assert.equal(env.NODE_TEST_CONTEXT, undefined, 'NODE_TEST_CONTEXT não atravessa (filho rodaria 0 testes)');
        assert.equal(env.HTTP_PROXY, undefined);
        assert.equal(env.https_proxy, undefined);
        assert.equal(env.ALL_PROXY, undefined);
        assert.equal(env.NODE_OPTIONS, undefined);
        assert.equal(env.FORCE_COLOR, undefined);
        assert.equal(env.NO_PROXY, '*', 'NO_PROXY=* injetado no env que chega ao spawn');
      }
    } finally {
      await fsPromises.rm(base, { recursive: true, force: true }).catch(() => {});
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Fail-closed: falha de infra → veredito inválido com execError (nunca lança)
// ---------------------------------------------------------------------------

describe('criarProverDeDesafio — fail-closed em falha de infra', () => {
  it('falha do EXEC → veredito inválido com execError, NUNCA exceção; isolamento limpo', async () => {
    const base = await novaBase();
    try {
      const quebrado: ExecFn = async () => {
        throw new Error('boom do executor (fake)');
      };
      const prover = criarProverDeDesafio({ exec: quebrado, baseDir: base });
      const v = await prover(BASE_INPUT); // resolve — não rejeita (fail-closed)
      assert.equal(v.valid, false);
      assert.equal(v.failures[0].proof, 'execError', 'a falha vira a 5ª "prova" execError');
      assert.match(v.failures[0].reason ?? '', /boom do executor/);
      assert.match(v.execError ?? '', /boom do executor/);
      assert.equal(v.executed, 0);
      const restantes = await fsPromises.readdir(base);
      assert.deepEqual(restantes, [], 'cleanup rodou MESMO com falha de execução');
    } finally {
      await fsPromises.rm(base, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('falha do PREPARE (path inválido no multi-arquivo) → veredito inválido com execError, NUNCA exceção', async () => {
    const base = await novaBase();
    try {
      const { exec } = fakeProdutoExec([OK, FAIL, FAIL]);
      const prover = criarProverDeDesafio({ exec: fromChallengeExec(exec), baseDir: base });
      const inputComEscape = {
        ...BASE_INPUT,
        solutionFiles: [{ path: '../escape.mjs', code: 'export {};' }],
      };
      const v = await prover(inputComEscape); // resolve — não rejeita
      assert.equal(v.valid, false);
      assert.equal(v.failures[0].proof, 'execError');
      assert.match(v.execError ?? '', /path de arquivo inválido/);
      assert.equal(v.executed, 0, 'nem chegou a rodar');
      const restantes = await fsPromises.readdir(base);
      assert.deepEqual(restantes, [], 'prepare falhou ANTES de criar diretório — nada vazou');
    } finally {
      await fsPromises.rm(base, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('falha do EXIT-GUARD (seam injetado) → dir do mkdtemp LIMPO (sem vazamento), veredito inválido com execError', async () => {
    const base = await novaBase();
    try {
      const dirsVistos: string[] = [];
      const { exec, calls } = fakeProdutoExec([OK, FAIL, FAIL]);
      const prover = criarProverDeDesafio({
        exec: fromChallengeExec(exec),
        baseDir: base,
        // Seam de injeção (testabilidade SEM rede/FS hacky): a escrita do
        // guard é a única parte "não fakeável" do prepare — aqui ela LANÇA
        // DEPOIS do mkdtemp, exatamente a janela do defeito (dir já criado,
        // guard falhou, dir ainda não registrado no verify).
        escreverGuard: async (dir) => {
          dirsVistos.push(dir);
          throw new Error('boom do exit-guard (fake injetado)');
        },
      });
      // (b) fail-closed: resolve — NUNCA rejeita; veredito INVÁLIDO com
      // execError (o erro ORIGINAL do guard, não o da limpeza).
      const v = await prover(BASE_INPUT);
      assert.equal(v.valid, false);
      assert.equal(v.failures[0].proof, 'execError');
      assert.match(v.failures[0].reason ?? '', /boom do exit-guard/);
      assert.match(v.execError ?? '', /boom do exit-guard/);
      assert.equal(v.executed, 0, 'nem chegou a rodar');
      assert.equal(calls.length, 0, 'o exec nunca rodou — a falha foi no prepare do 1º lado');
      assert.equal(dirsVistos.length, 1, 'o guard falhou na PRIMEIRA preparação (solução); nada mais preparou');
      // (a) o dir do mkdtemp NÃO existe após a falha — a limpeza rodou AQUI
      // (o verify não o registrou: prepare rejeitou antes do dirs.push).
      await assert.rejects(fsPromises.stat(dirsVistos[0]), { code: 'ENOENT' });
      const restantes = await fsPromises.readdir(base);
      assert.deepEqual(restantes, [], 'base injetada VAZIA — o mkdtemp órfão foi limpo, nenhum proof-exec-* vazou');
    } finally {
      await fsPromises.rm(base, { recursive: true, force: true }).catch(() => {});
    }
  });
});

// ---------------------------------------------------------------------------
// 5. O adaptador repassa env (teste direto — fromChallengeExec sobre fake)
// ---------------------------------------------------------------------------

describe('fromChallengeExec — repasse de env (o furo do replan, direto)', () => {
  it('env do chamador chega ao executor subjacente (produto)', async () => {
    const { exec, calls } = fakeProdutoExec([OK]);
    const adapted = fromChallengeExec(exec);
    const env: NodeJS.ProcessEnv = { PATH: '/usr/bin', NO_PROXY: '*', SM_F9: '1' };
    await adapted('/tmp/d', [...SPEC_TEST_ARGS], { timeoutMs: 7_000, env });
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].opts, { timeoutMs: 7_000, env }, 'timeoutMs E env atravessam o adapter');
  });

  it('env sozinho (sem timeoutMs) também é repassado; ausente não cria a chave', async () => {
    const { exec, calls } = fakeProdutoExec([OK, OK]);
    const adapted = fromChallengeExec(exec);
    const env: NodeJS.ProcessEnv = { SM_F9: '1' };
    await adapted('/tmp/d', [...SPEC_TEST_ARGS], { env });
    await adapted('/tmp/d2', [...SPEC_TEST_ARGS], { timeoutMs: 5_000 });
    assert.deepEqual(calls[0].opts, { env });
    assert.deepEqual(calls[1].opts, { timeoutMs: 5_000 }, 'sem env no chamador ⇒ sem a chave no produto (default inalterado)');
  });
});

// ---------------------------------------------------------------------------
// 6. SEM_EXEC — o limitador do provador respeita teto 1 (fake lento)
// ---------------------------------------------------------------------------

describe('criarProverDeDesafio — limitador SEM_EXEC (semáforo do P-01)', () => {
  it('teto 1 com 3 chamadas concorrentes: pico de execução simultânea == 1', async () => {
    const base = await novaBase();
    try {
      let concurrent = 0;
      let maxSeen = 0;
      const fakeLento: ExecFn = async () => {
        concurrent += 1;
        maxSeen = Math.max(maxSeen, concurrent);
        await new Promise((resolve) => setTimeout(resolve, 8));
        concurrent -= 1;
        return { exitCode: 0, stdout: specOut(2, 2, 0), stderr: '' };
      };
      const prover = criarProverDeDesafio({ exec: fakeLento, baseDir: base, limiter: createSemaphore(1) });
      const [v1, v2, v3] = await Promise.all([prover(BASE_INPUT), prover(BASE_INPUT), prover(BASE_INPUT)]);
      assert.equal(maxSeen, 1, 'teto 1 ⇒ nunca dois runners simultâneos (as 9 rodadas serializam)');
      // o veredito aqui é IRRELEVANTE para a prova do limiter (o fake devolve
      // "ok" também para starter/stub — veredito inválido por semântica); o
      // que importa: resolveu ESTRUTURADO, sem travar nem lançar.
      assert.ok([v1, v2, v3].every((v) => typeof v?.valid === 'boolean'), 'todas as chamadas produzem veredito');
      const restantes = await fsPromises.readdir(base);
      assert.deepEqual(restantes, [], 'as 9 rodadas limparam os diretórios isolados');
    } finally {
      await fsPromises.rm(base, { recursive: true, force: true }).catch(() => {});
    }
  });
});