/**
 * app/electron/main/engine/phases/f9Verifier.ts — P-31 (onda 2): INTEGRAÇÃO
 * F9 — o PROVADOR OFICIAL de provas de execução de desafio
 * (`docs/16-engine-de-trilha.md` §5.4). Fecha o seam que o adapter e o harness
 * declaram como follow-up:
 *
 *   - o harness (`exec/harness.ts`) endurece o ENV (`buildChildEnv` — sem
 *     `NODE_TEST_CONTEXT`/proxies/`NODE_OPTIONS`/`FORCE_COLOR`, com
 *     `NO_PROXY=*`) e endurece o EXIT (exit-guard via `--require`), mas quem
 *     spawna é OUTRO pacote (`services/challengeExec.ts` — `nodeExec`);
 *   - o adaptador (`exec/adapter.ts`) ponteia a assinatura engine ↔ produto
 *     (`{exitCode,…}` ↔ `{code,…}`), mas ATÉ AQUI DESCARTAVA o `opts.env`
 *     (furo medido pelo replan — o env endurecido do harness nunca chegava ao
 *     processo filho).
 *
 * `criarProverDeDesafio` compõe as peças na ordem oficial:
 *
 *   prepareIsolatedDir(baseDir) → escreverExitGuard(dir) → exec endurecido →
 *   `['--require', path.join(dir, 'exit-guard.cjs'), ...argsDeTeste(input)]`
 *   → cleanupDir SEMPRE (finally — as provas == a única autoridade de
 *   isolamento; diretório que vaza é defeito).
 *
 * O executor DEFAULT é o OFICIAL do produto: `createHardenedExec({ exec:
 * fromChallengeExec(nodeExec), limiter })` — o MESMO runner que o aluno vê
 * (`node --test --test-reporter=spec test.mjs`, espelho do `runStudentCode`),
 * com o env endurecido ATRAVESSANDO o adaptador até o spawn (o furo fechado,
 * aditivo A-P04-3 no challengeExec e no adapter). Nenhuma semântica das provas
 * muda: os julgadores e o veredito continuam os de `verifyChallengeProofs`
 * (puros — `exec/proofs.ts`).
 *
 * Fail-closed (regra 1 do plano): qualquer falha de INFRA (prepare/exec/
 * cleanup) vira veredito INVÁLIDO com `execError` — o provador NUNCA lança
 * para o chamador (o `verifyChallengeProofs` já converte a falha de execução;
 * o try externo é a última linha contra o que ele não cobre, ex.: o próprio
 * input inválido).
 *
 * CONTRATO EXATO (consumidores P-17/P-18/P-19/P-23 IMPORTAM ESTA INTERFACE):
 *
 *   const prover = criarProverDeDesafio();        // defaults oficiais
 *   const v: ChallengeProofsVerdict = await prover(input);
 *   // v = { valid, failures, executions?, declared, executed, execError? }
 *
 *   RECOMENDAÇÃO DE IMPORTAÇÃO: o PROVADOR (`criarProverDeDesafio`, opções)
 *   de `../phases/f9Verifier`; os TIPOS (`ChallengeProofsInput`,
 *   `ChallengeProofsVerdict`, `ProofJudgement`, `ExecFn`) de `../exec/proofs`
 *   — ou tudo do f9Verifier (os dois tipos centrais são re-exportados abaixo).
 */

import * as os from 'node:os';
import * as path from 'node:path';

import { nodeExec } from '../../services/challengeExec';
import { fromChallengeExec } from '../exec/adapter';
import {
  cleanupDir,
  createHardenedExec,
  escreverExitGuard,
  prepareIsolatedDir,
} from '../exec/harness';
import {
  SPEC_TEST_ARGS,
  verifyChallengeProofs,
  type ChallengeProofsInput,
  type ChallengeProofsVerdict,
  type ExecFn,
  type ExecResult,
  type ProofEnv,
} from '../exec/proofs';
import { createExecSemaphore, type Semaphore } from '../runtime/semaphore';

// Re-export dos tipos centrais do contrato — consumidores podem importar TUDO
// de f9Verifier, ou os tipos de exec/proofs (recomendado: o provador daqui,
// os tipos de lá — a fonte única das provas).
export type { ChallengeProofsInput, ChallengeProofsVerdict } from '../exec/proofs';

/** O provador de desafio: input → veredito das quatro provas (nunca lança). */
export type ProverDeDesafio = (input: ChallengeProofsInput) => Promise<ChallengeProofsVerdict>;

export interface CriarProverDeDesafioOptions {
  /**
   * ExecFn da ENGINE a usar nas rodadas (A-P07-2 — a suíte injeta fake).
   * Default: o executor OFICIAL do produto endurecido —
   * `createHardenedExec({ exec: fromChallengeExec(nodeExec), limiter })` —
   * SEM_EXEC + env endurecido + `--require` do exit-guard, tudo compose AQUI.
   */
  exec?: ExecFn;
  /**
   * Raiz dos diretórios isolados das provas (`prepareIsolatedDir` mkdtemp sob
   * esta raiz). Default: `os.tmpdir()`. Injetável para os testes observarem a
   * limpeza (nada de prova-exec-* ao final) e para ambientes com tmp próprio.
   */
  baseDir?: string;
  /**
   * Limitador SEM_EXEC (semáforo do P-01 — `runtime/semaphore.ts`, fonte
   * única). Default: `createExecSemaphore()` (teto =
   * `availableParallelism()-1`). Aplica-se a QUALQUER exec, injetado ou
   * default: o spawn é um recurso global da engine, o teto não pode depender
   * de quem plugou o executor.
   */
  limiter?: Semaphore;
}

/**
 * Args de teste do PRODUTO (espelho do `challengeExec` — `runStudentCode`/
 * `verifyChallengePair`): `node --test --test-reporter=spec test.mjs`, sempre
 * com o arquivo único. O MODO não muda com o input (desafio multi-arquivo é
 * resolvido pelo CONTEÚDO do diretório isolado — `prepareIsolatedDir` — nunca
 * por args); a função existe para espelhar LITERALMENTE o caminho do produto
 * num ponto único e dar às integrações (P-17/P-18/P-19/P-23) o mesmo canônico.
 */
export function argsDeTeste(_input: ChallengeProofsInput): string[] {
  return [...SPEC_TEST_ARGS];
}

/**
 * Monta o PROVADOR OFICIAL de provas de execução (integração F9). Compõe, por
 * chamada de prover:
 *
 *   1. `prepareIsolatedDir(baseDir, side)` — diretório NOVO e isolado por
 *      lado (solução/starter/stub nunca compartilham diretório);
 *   2. `escreverExitGuard(dir)` — exit-guard.cjs no diretório isolado (o
 *      código sob teste não mata o runner com `process.exit(0)` forjando
 *      `ℹ tests N`);
 *   3. exec (hardened + limitado) com `['--require', exit-guard, ...]` + os
 *      args de teste do produto;
 *   4. `cleanupDir` SEMPRE (finally), mesmo em falha de infra;
 *   5. o veredito ESTRUTURADO de `verifyChallengeProofs` (input + env com
 *      prepare/exec/cleanup) — fail-closed: falha de infra vira `execError`,
 *      nunca exceção.
 */
export function criarProverDeDesafio(opts: CriarProverDeDesafioOptions = {}): ProverDeDesafio {
  const baseDir = opts.baseDir ?? os.tmpdir();
  const limiter = opts.limiter ?? createExecSemaphore();
  // Executor default = OFICIAL do produto endurecido; exec injetado vira o
  // SUBJACENTE do mesmo endurecimento (limiter SEMPRE vale — o teto SEM_EXEC
  // é global, não depende de quem plugou o executor).
  const exec = createHardenedExec({ exec: opts.exec ?? fromChallengeExec(nodeExec), limiter });

  return async (input): Promise<ChallengeProofsVerdict> => {
    const env: ProofEnv = {
      exec: async (dir, _args, execOpts): Promise<ExecResult> => {
        // `--require` do exit-guard ANTES dos args de teste do produto — o
        // fluxo do verifyChallengeProofs passa SPEC_TEST_ARGS; aqui o modo é
        // re-derivado do input (argsDeTeste) para espelhar o challengeExec.
        const args = ['--require', path.join(dir, 'exit-guard.cjs'), ...argsDeTeste(input)];
        return exec(dir, args, execOpts);
      },
      prepare: async (side) => {
        const dir = await prepareIsolatedDir(baseDir, side);
        await escreverExitGuard(dir);
        return dir;
      },
      cleanup: cleanupDir,
    };

    try {
      return await verifyChallengeProofs(input, env);
    } catch (err) {
      // Fail-closed (regra 1): o que o verifyChallengeProofs não converteu
      // (input inválido no countTestDeclarations, erro inesperado) vira
      // veredito inválido com execError — o provador nunca lança.
      const message = err instanceof Error ? err.message : String(err);
      return {
        valid: false,
        failures: [
          { proof: 'execError', passed: false, reason: `falha de infraestrutura nas provas: ${message}` },
        ],
        declared: 0,
        executed: 0,
        execError: message,
      };
    }
  };
}