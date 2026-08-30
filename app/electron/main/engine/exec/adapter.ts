/**
 * app/electron/main/engine/exec/adapter.ts — P-28 (onda 2 batch B): PONTE entre
 * o contrato de execução da ENGINE e o executor OFICIAL do produto.
 *
 * Dois contratos de execução convivem no repositório, com o MESMO campo em
 * nomes diferentes:
 *
 *   - ENGINE (`exec/proofs.ts`, A-P07-2): `ExecResult { exitCode, stdout,
 *     stderr }` e `ExecFn = (dir, args, opts?) => Promise<ExecResult>` — o
 *     contrato dos julgadores puros das provas e do harness;
 *   - PRODUTO (`services/challengeExec.ts` — INTOCADO): `ExecResult { code,
 *     stdout, stderr }` e `ExecFn = (dir, args, opts?: { timeoutMs? })` — o
 *     executor REAL que a UI usa (nodeExec: spawn de `node --test`).
 *
 * O executor real da UI é o challengeExec; a engine precisa dirigir a
 * execução OFICIAL do produto — rodar os testes OFICIAIS nos lugares em que o
 * veredito TEM de ser o do produto (o mesmo runner que o aluno vê):
 *
 *   - F9 — verificação determinística (zero LLM, `docs/16-engine-de-trilha.md`
 *     §5.4): as quatro provas de `verifyChallengeProofs` precisam rodar
 *     EXATAMENTE o runner oficial;
 *   - F11 — laço revisor → provador → planejador → corretor: o provador
 *     re-verifica o desafio (e o reparo) com o runner oficial;
 *   - P-23 (repair — o corretor do laço F11): o código reparado é validado
 *     pelo runner oficial antes de voltar para o aluno.
 *
 * `fromChallengeExec` é a ÚNICA ponte: o mapeamento `{code, stdout, stderr}`
 * → `{exitCode, stdout, stderr}` mora AQUI, e a engine nunca espalha
 * `{...r, exitCode: r.code}` pelos pacotes. A função é PURA (A-P07-2): não
 * spawna nada, não toca em arquivos, não monta env — só adapta assinatura e
 * shape do resultado. A suíte NÃO gera processo real.
 *
 * COMPOSIÇÃO COM O ENDURECIMENTO (P-07, exec/harness.ts) — o ponto exato:
 *
 *   const execOficial = createHardenedExec({ exec: fromChallengeExec(challengeExec.nodeExec) });
 *
 * `nodeExec` é o export REAL do spawn no challengeExec (verificado:
 * `export const nodeExec: ExecFn`). `createHardenedExec` envolve QUALQUER
 * ExecFn com SEM_EXEC e env endurecido — montado AO REDOR do adaptador. Duas
 * ressalvas de composição (documentadas aqui, seguindo o que o próprio
 * harness.ts declara nos docstrings de NETWORK_HARDENING/EXIT_GUARD_SOURCE):
 *
 *   1. ENV: o ExecFn do challengeExec NÃO aceita `env` no opts — o adaptador
 *      repassa só `timeoutMs`. O `nodeExec` monta o env do filho internamente
 *      e JÁ remove NODE_TEST_CONTEXT no spawn (a armadilha crítica está
 *      fechada no produto). O enriquecimento de rede do harness
 *      (`buildChildEnv`/`NETWORK_HARDENING`) só alcança o processo filho
 *      quando o challengeExec passar a construir o env do filho com
 *      `buildChildEnv` — o follow-up que o harness.ts aponta ("hoje
 *      `challengeExec.nodeExec` monta o env à mão").
 *   2. EXIT GUARD (`--require`): `escreverExitGuard(dir)` grava o
 *      exit-guard.cjs no diretório isolado; quem recebe `(dir, args)` do
 *      `verifyChallengeProofs` é o ExecFn injetado — a integração F9 que
 *      monta o ProofEnv deve inserir
 *      `['--require', path.join(dir, 'exit-guard.cjs'), ...args]` ANTES de
 *      chamar o adaptador endurecido. O adaptador NÃO injeta o flag: é puro
 *      por contrato (A-P07-2), e a composição fica visível no ponto único que
 *      constrói os args.
 *
 * FAIL-CLOSED (regra 1 do plano): resultado do executor que NÃO tem `code` é
 * shape inesperado — um executor que não seguiu o contrato do produto não
 * merece veredito (exitCode inventado seria juiz mentindo). Lança
 * `ExecShapeError` (erro estruturado com `code` estável + `received` para
 * diagnóstico). `stdout`/`stderr` passam INTACTOS (bytes): o adaptador não
 * trima, não decodifica, não toca.
 */

import type { ExecFn as ChallengeExecFn } from '../../services/challengeExec';
import type { ExecFn, ExecResult } from './proofs';

/** Código estável do erro estruturado de shape inesperado (fail-closed). */
export const EXEC_SHAPE_INVALID = 'EXEC_SHAPE_INVALID' as const;

/**
 * Erro ESTRUTURADO: o executor devolveu um resultado SEM `code` — shape que
 * não segue o contrato do challengeExec (fail-closed: nunca inventa exitCode).
 * `received` carrega o que o executor devolveu, para diagnóstico (log/IPC).
 */
export class ExecShapeError extends Error {
  readonly code: typeof EXEC_SHAPE_INVALID = EXEC_SHAPE_INVALID;
  /** o resultado cru devolvido pelo executor (o que não tinha `code`). */
  readonly received: unknown;

  constructor(received: unknown) {
    super(`executor devolveu resultado sem 'code' — shape inesperado (fail-closed): ${inspectShape(received)}`);
    this.name = 'ExecShapeError';
    this.received = received;
  }
}

/** Serializa o resultado recebido com segurança (objeto circular não estoura). */
function inspectShape(value: unknown): string {
  try {
    const seen = new WeakSet<object>();
    const json = JSON.stringify(value, (_key, v) => {
      if (typeof v === 'object' && v !== null) {
        if (seen.has(v)) return '[circular]';
        seen.add(v);
      }
      return v;
    });
    return json !== undefined ? json : String(value);
  } catch {
    return String(value);
  }
}

/**
 * Adapta um ExecFn do challengeExec (produto) para o ExecFn da ENGINE
 * (proofs.ts). Mapeia `code` → `exitCode`; repassa `dir`/`args` intactos e
 * `opts.timeoutMs` quando o chamador o fornece — o ExecFn do produto NÃO tem
 * slot de `env` (ver composição no cabeçalho; o nodeExec monta o env do filho
 * por conta própria). Qualquer resultado sem `code` (shape inesperado) lança
 * `ExecShapeError` — fail-closed.
 */
export function fromChallengeExec(exec: ChallengeExecFn): ExecFn {
  return async (dir, args, opts): Promise<ExecResult> => {
    const result = await exec(dir, args, opts === undefined ? undefined : { timeoutMs: opts.timeoutMs });
    if (result === null || result === undefined || typeof result.code !== 'number') {
      throw new ExecShapeError(result);
    }
    return { exitCode: result.code, stdout: result.stdout, stderr: result.stderr };
  };
}