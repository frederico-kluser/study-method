/**
 * app/electron/main/engine/exec/harness.ts — endurecimento da EXECUÇÃO das
 * provas de desafio (`§5.4`): diretório ISOLADO, teto de concorrência SEM_EXEC
 * e isolamento de rede, com os limites documentados. As provas em si são puras
 * (`proofs.ts`); aqui mora tudo o que toca o mundo.
 *
 * Princípios deste arquivo:
 *
 *   - A-P07-2 — a SUÍTE usa executor FAKE: nenhuma função deste módulo gera
 *     processo real. O endurecimento é montável em torno de QUALQUER ExecFn
 *     (`createHardenedExec`), e o executor real (outro pacote — hoje
 *     `services/challengeExec.ts`) é quem pluga o próprio spawn.
 *   - SEM_EXEC (`§4.1`): teto de `spawn node --test` = `availableParallelism()-1`.
 *     Usamos um limitador PRÓPRIO e mínimo (`createSemaphore`, acquire/release
 *     injetáveis). O `semaphore.ts` do P-01 (`engine/runtime/semaphore`) é o
 *     futuro dono do SEM_EXEC — um follow-up deve trocar `createSemaphore`
 *     pelo de lá, mantendo a MESMA interface `{ acquire(): Promise<() => void> }`.
 *   - SEM REDE: o código executado foi escrito por LLM. A isolação é aplicada
 *     NO LUGAR CERTO — na construção do ambiente do processo filho
 *     (`buildChildEnv`): remove variáveis de rede herdadas do pai e injeta
 *     `NO_PROXY=*`. LIMITES DECLARADOS: isso derruba tráfego via proxy
 *     (acidental ou hostil) e força verificação TLS padrão, mas NÃO bloqueia
 *     socket cru (TCP/UDP) — o corte de rede de verdade exige wrapper de SO
 *     (o slot `wrapperCommand` de `NETWORK_HARDENING` é onde o executor real
 *     pluga, ex.: sandbox-exec/nsjail). A provas dos percevejos:
 *     `NODE_TEST_CONTEXT` removido SEMPRE do filho (herdado do runner pai, o
 *     node:test do filho pularia tudo e sairia 0); ANSI tolerado no parser
 *     (`parseSpecCounts` em proofs.ts) e `FORCE_COLOR` também removido aqui.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { SAFE_FILE_PATH_RE } from '../../content/trackTypes';
import type { ExecFn, ExecResult } from './proofs';

// ---------------------------------------------------------------------------
// Diretório de execução ISOLADO (raiz injetável)
// ---------------------------------------------------------------------------

export interface IsolatedSide {
  /** código do lado (solution.mjs quando `files` ausente). */
  code: string;
  /** ADITIVO multi-arquivo: caminho + código por arquivo. */
  files?: { path: string; code: string }[];
  testsCode: string;
}

/**
 * Prepara um diretório de execução ISOLADO, novo a cada chamada (mkdtemp sob
 * `baseDir` — a raiz é INJETÁVEL), com package.json `{type:'module'}` + os
 * arquivos do lado + test.mjs. Nenhum lado de uma prova compartilha diretório.
 * Nunca lança por paths malformados: usa o MESMO `SAFE_FILE_PATH_RE` do
 * challengeExec (fonte única — proíbe '..' e qualquer escape do diretório).
 */
export async function prepareIsolatedDir(baseDir: string, side: IsolatedSide): Promise<string> {
  if (side.files && side.files.some((f) => typeof f?.path !== 'string' || !SAFE_FILE_PATH_RE.test(f.path))) {
    throw new Error(`path de arquivo inválido no lado isolado: ${JSON.stringify(side.files.map((f) => f.path))}`);
  }
  const dir = await fs.promises.mkdtemp(path.join(baseDir, 'proof-exec-'));
  try {
    await fs.promises.writeFile(path.join(dir, 'package.json'), JSON.stringify({ type: 'module' }), 'utf8');
    if (side.files && side.files.length > 0) {
      for (const f of side.files) {
        const full = path.join(dir, f.path);
        await fs.promises.mkdir(path.dirname(full), { recursive: true });
        await fs.promises.writeFile(full, f.code, 'utf8');
      }
    } else {
      await fs.promises.writeFile(path.join(dir, 'solution.mjs'), side.code, 'utf8');
    }
    await fs.promises.writeFile(path.join(dir, 'test.mjs'), side.testsCode, 'utf8');
    return dir;
  } catch (err) {
    await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
    throw err;
  }
}

/** Remove um diretório de execução isolado. Nunca lança (best-effort). */
export async function cleanupDir(dir: string): Promise<void> {
  await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
}

// ---------------------------------------------------------------------------
// SEM REDE — configuração de hardening (exposta para o executor REAL)
// ---------------------------------------------------------------------------

/**
 * A configuração de isolação de rede do harness. O executor real (outro
 * pacote) pluga isto no seu spawn — hoje `challengeExec.nodeExec` monta o env
 * à mão; o follow-up deve passar a usar `buildChildEnv` (abaixo).
 */
export const NETWORK_HARDENING: Readonly<{
  /** variáveis de rede/ambiente removidas do filho (herdadas do pai). */
  stripEnv: readonly string[];
  /** valores injetados no filho para anular roteamento via proxy herdado. */
  fixedEnv: Readonly<Record<string, string>>;
  /**
   * SLOT documentado para o corte de rede DE VERDADE: prefixo de comando
   * wrapper de sandbox de SO (macOS: `['sandbox-exec', '-f', '<perfil>']`,
   * Linux: nsjail/systemd-run — `['nsjail', '--config', '<cfg>', '--']`).
   * Quando presente, o executor real roda `...wrapper, node, args`.
   */
  wrapperCommand?: readonly string[];
  /** o que esta configuração cobre e o que NÃO cobre (honestidade de limite). */
  scope: readonly string[];
}> = {
  stripEnv: [
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'ALL_PROXY',
    'http_proxy',
    'https_proxy',
    'all_proxy',
    // Força verificação TLS padrão no filho (o pai pode ter desligado para a
    // própria rede dev; código de LLM não merece herdar isso).
    'NODE_TLS_REJECT_UNAUTHORIZED',
    // ANSI no relatório derruba o regex de contagem — removemos a fonte além
    // de tolerar no parser (defesa em profundidade).
    'FORCE_COLOR',
    // NODE_OPTIONS herdado poderia carregar flags do ambiente do pai (require
    // de loader, certificados custom) — fail-closed: filho roda limpo.
    'NODE_OPTIONS',
  ],
  fixedEnv: { NO_PROXY: '*', no_proxy: '*' },
  wrapperCommand: undefined,
  scope: [
    'remove proxies herdados (HTTP/HTTPS/ALL) e injeta NO_PROXY=*: derruba tráfego via proxy, acidental ou hostil',
    'remove NODE_TLS_REJECT_UNAUTHORIZED herdado: força verificação TLS padrão',
    'LIMITE: não bloqueia socket cru (TCP/UDP) — um payload LLM deliberado ainda conecta via socket puro',
    'LIMITE: o corte de rede de verdade exige wrapper de SO no slot wrapperCommand (executor real pluga)',
  ],
};

/**
 * Monta o ambiente do processo filho: cópia explícita do base (nunca muta o
 * original), SEM `NODE_TEST_CONTEXT` (a armadilha: herdado do runner pai, o
 * node:test do filho PULA todos os arquivos e sai 0), SEM as variáveis de rede
 * de `NETWORK_HARDENING` e com `NO_PROXY=*` injetado.
 */
export function buildChildEnv(base?: NodeJS.ProcessEnv | undefined): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...(base ?? process.env) };
  // ARMADILHA NODE_TEST_CONTEXT (medida em challengeExec.ts): o node --test do
  // processo pai seta esta var; herdada, faz o node:test do filho acreditar que
  // já está dentro de um runner e sair 0 sem rodar NADA. Remove sempre.
  delete env.NODE_TEST_CONTEXT;
  for (const key of NETWORK_HARDENING.stripEnv) delete env[key];
  Object.assign(env, NETWORK_HARDENING.fixedEnv);
  return env;
}

// ---------------------------------------------------------------------------
// SEM_EXEC — teto de concorrência (limitador PRÓPRIO e mínimo)
// ---------------------------------------------------------------------------

export interface Semaphore {
  /**
   * Espera por uma vaga e devolve a função `release()`. Injetável — o
   * follow-up troca a implementação pelo `semaphore.ts` do P-01 (runtime)
   * mantendo esta interface.
   */
  acquire(): Promise<() => void>;
  /** vagas em uso agora (diagnóstico). */
  activeCount(): number;
}

/**
 * Limitador mínimo FIFO. `max <= 0` é preso em 1 (fail-closed: nunca um
 * deadlock silencioso por teto zero; quem quiser desligar a execução injeta
 * o próprio limitador).
 */
export function createSemaphore(max: number): Semaphore {
  const limit = Math.max(1, Math.floor(max));
  let active = 0;
  const waiters: Array<() => void> = [];
  const release = (): void => {
    active -= 1;
    const next = waiters.shift();
    if (next) {
      active += 1;
      next();
    }
  };
  return {
    acquire(): Promise<() => void> {
      return new Promise((resolve) => {
        if (active < limit) {
          active += 1;
          resolve(release);
          return;
        }
        waiters.push(() => resolve(release));
      });
    },
    activeCount: () => active,
  };
}

/** Default do SEM_EXEC (`§4.1`): `availableParallelism()-1`, nunca 0. */
export function defaultMaxConcurrency(): number {
  const p = typeof os.availableParallelism === 'function' ? os.availableParallelism() : 1;
  return Math.max(1, p - 1);
}

export interface HardenedExecOptions {
  /** a execução a endurecer (no executor real: um spawn de `node --test`). */
  exec: ExecFn;
  /** limitador SEM_EXEC injetável (default: createSemaphore(defaultMaxConcurrency())). */
  limiter?: Semaphore;
  /** teto usado quando `limiter` não é injetado. */
  maxConcurrency?: number;
  /** montador de env do filho (default: buildChildEnv — remove NODE_TEST_CONTEXT + rede). */
  envBuilder?: (base?: NodeJS.ProcessEnv | undefined) => NodeJS.ProcessEnv;
}

/**
 * Envolve QUALQUER ExecFn com o endurecimento do harness: adquire vaga no
 * SEM_EXEC antes de executar (libera SEMPRE, via finally) e injeta o env do
 * filho montado por `buildChildEnv` (NODE_TEST_CONTEXT removido, rede anulada).
 * O executor real pluga o próprio spawn aqui dentro e ganha as duas camadas
 * de graça.
 */
export function createHardenedExec(opts: HardenedExecOptions): ExecFn {
  const limiter = opts.limiter ?? createSemaphore(opts.maxConcurrency ?? defaultMaxConcurrency());
  const envBuilder = opts.envBuilder ?? buildChildEnv;
  return async (
    dir: string,
    args: string[],
    execOpts?: { timeoutMs?: number; env?: NodeJS.ProcessEnv },
  ): Promise<ExecResult> => {
    const release = await limiter.acquire();
    try {
      return await opts.exec(dir, args, { ...execOpts, env: envBuilder(execOpts?.env) });
    } finally {
      release();
    }
  };
}