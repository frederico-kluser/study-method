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
 *     O limitador É o semáforo do P-01 (`runtime/semaphore.ts`) — fonte única
 *     do protocolo `{ acquire(): Promise<() => void> }` (release vem do
 *     acquire, idempotente). P-27: o `createSemaphore`/`Semaphore`/
 *     `defaultMaxConcurrency` PRÓPRIOS deste arquivo foram removidos; o default
 *     é `createExecSemaphore()` (teto `defaultExecConcurrency()`) e
 *     `maxConcurrency` custom vira `createSemaphore(n)` do P-01 (fail-fast em
 *     `n < 1` — RangeError, nunca deadlock silencioso).
 *     ONDA 5: o SEM_EXEC limita cada SPAWN individual; o paralelismo ENTRE
 *     desafios vive nos chamadores — a F9/F11 da fiação (`verificarRefsEmParalelo`)
 *     e o G-FINAL (`gFinal` em f12Materialize) fazem map paralelo com
 *     `createExecSemaphore()` sobre os desafios, e as quatro provas de UM
 *     desafio já rodam em `Promise.all` dentro de `verifyChallengeProofs`.
 *   - SEM REDE: o código executado foi escrito por LLM. A isolação é aplicada
 *     NO LUGAR CERTO — na construção do ambiente do processo filho
 *     (`buildChildEnv`): remove variáveis de rede herdadas do pai e injeta
 *     `NO_PROXY=*`. LIMITES DECLARADOS: isso derruba tráfego via proxy
 *     (acidental ou hostil) e força verificação TLS padrão, mas NÃO bloqueia
 *     socket cru (TCP/UDP) — o corte de rede de verdade exige wrapper de SO
 *     (o slot `wrapperCommand` de `NETWORK_HARDENING` é onde o executor real
 *     pluga, ex.: sandbox-exec/nsjail). A provas dos percevejos:
 *     `NODE_TEST_CONTEXT` removido SEMPRE do filho (herdado do runner pai, o
 *     node:test do filho pularia tudo e sairia 0) — e o endurecimento é
 *     INVARIANTE: mesmo com `envBuilder` custom, o env final SEMPRE passa pelo
 *     passo base (`createHardenedExec` encadeia, nunca substitui); ANSI
 *     tolerado no parser (`parseSpecCounts` em proofs.ts) e `FORCE_COLOR`
 *     também removido aqui.
 *   - EXIT GUARD: o código sob teste não pode matar o runner com
 *     `process.exit(0)`/`process.abort()` antes do relatório (forjando
 *     `ℹ tests N`). `escreverExitGuard` escreve um `.cjs` no diretório isolado
 *     que sobrescreve exit/abort para LANÇAR; o executor real (integração
 *     F9/adaptador P-28) o passa via `--require` no spawn do `node --test`.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { SAFE_FILE_PATH_RE } from '../../content/trackTypes';
import type { ExecFn, ExecResult } from './proofs';
import {
  createExecSemaphore,
  createSemaphore,
  defaultExecConcurrency,
  type Semaphore,
} from '../runtime/semaphore';

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
// EXIT GUARD — o código sob teste não mata o runner (bridge de endurecimento)
// ---------------------------------------------------------------------------

/**
 * Fonte EXATA do exit-guard (o teste de strings garante o conteúdo do arquivo
 * escrito por `escreverExitGuard`). Sobrescreve `process.exit` e
 * `process.abort` para LANÇAR: um `process.exit(0)` no topo do módulo sob
 * teste (a forja de `ℹ tests N` do CRITICAL 1) deixa de matar o runner — vira
 * exceção no próprio módulo, o arquivo de teste FALHA e o relatório real do
 * node:test é impresso por último. Fail-closed: em vez de exit 0 mentiroso, o
 * processo termina com teste falho.
 */
export const EXIT_GUARD_SOURCE = `'use strict';
// exit-guard do harness de provas (exec/harness.ts — escreverExitGuard).
// O codigo sob teste nao pode encerrar o processo antes do relatorio do
// node:test: um process.exit(0) no topo do modulo imprime um resumo spec
// forjado ('ℹ tests N') e mata o runner — as provas leriam um relatorio que
// nunca veio do runner real. Sobrescrever exit/abort para LANCAR faz o teste
// falhar (fail-closed) em vez de o processo morrer com exit 0.
// O executor real (integracao F9/adaptador P-28) deve passar este arquivo
// via --require no spawn do node --test.
const block = (api) => new Error(
  'exit-guard: process.' + api + ' bloqueado — codigo sob teste nao pode encerrar o processo das provas'
);
process.exit = function exitGuardExit(_code) { throw block('exit'); };
process.abort = function exitGuardAbort() { throw block('abort'); };
`;

/**
 * Escreve o exit-guard (`exit-guard.cjs`) no diretório isolado e devolve o
 * caminho do arquivo. Função PURA e testável: só escreve no `dir` injetado
 * (não o cria, não toca em mais nada). Este helper NÃO muda as provas — o
 * `ExecFn` continua injetado (A-P07-2); é a ponte de endurecimento para o
 * executor real: a integração F9/adaptador P-28 deve passá-lo via `--require`
 * no spawn, ex.: `['--require', path.join(dir, 'exit-guard.cjs'), '--test',
 * '--test-reporter=spec', 'test.mjs']`.
 */
export async function escreverExitGuard(dir: string): Promise<string> {
  const file = path.join(dir, 'exit-guard.cjs');
  await fs.promises.writeFile(file, EXIT_GUARD_SOURCE, 'utf8');
  return file;
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
// SEM_EXEC — teto de concorrência (semáforo do P-01, fonte única — P-27)
// ---------------------------------------------------------------------------

/**
 * O SEM_EXEC É o semáforo do P-01 (`engine/runtime/semaphore.ts`) — mesma
 * implementação e MESMO protocolo do resto da engine: `acquire()` resolve com
 * a função de liberação (release idempotente — liberar duas vezes é no-op).
 * Default: `createExecSemaphore()` (teto = `defaultExecConcurrency()` =
 * `availableParallelism()-1`, nunca abaixo de 1 — §4.1). `maxConcurrency`
 * custom vira `createSemaphore(n)` do P-01, que REJEITA `n < 1` com
 * RangeError — fail-fast: um semáforo que nunca libera slot é pior que um
 * erro de configuração; quem quiser desligar a execução injeta o próprio
 * limitador via `HardenedExecOptions.limiter`.
 */

export interface HardenedExecOptions {
  /** a execução a endurecer (no executor real: um spawn de `node --test`). */
  exec: ExecFn;
  /** limitador SEM_EXEC injetável (default: createExecSemaphore()). */
  limiter?: Semaphore;
  /**
   * Teto usado quando `limiter` não é injetado: cria `createSemaphore(teto)`
   * do P-01. `teto < 1` é RangeError do P-01 (fail-fast); default:
   * `defaultExecConcurrency()` via `createExecSemaphore()`.
   */
  maxConcurrency?: number;
  /**
   * ADITIVO (ENCADEADO, nunca substituto): enriquece o env JÁ endurecido por
   * `buildChildEnv` — recebe um env SEM `NODE_TEST_CONTEXT`/proxies/
   * `NODE_OPTIONS`/`FORCE_COLOR` e com `NO_PROXY=*`. O endurecimento base é
   * aplicado de novo na SAÍDA: mesmo um envBuilder hostil não reintroduz as
   * variáveis removidas.
   */
  envBuilder?: (base?: NodeJS.ProcessEnv | undefined) => NodeJS.ProcessEnv;
}

/**
 * Envolve QUALQUER ExecFn com o endurecimento do harness: adquire vaga no
 * SEM_EXEC antes de executar (libera SEMPRE, via finally) e injeta o env do
 * filho com o endurecimento base garantido por ENCADEAMENTO:
 *  1. `buildChildEnv(base)` endurece a base (seja ela `process.env` ou o env
 *     de execOpts): SEM `NODE_TEST_CONTEXT`, SEM proxies/NODE_OPTIONS/
 *     FORCE_COLOR, com `NO_PROXY=*`;
 *  2. `envBuilder` custom (se houver) ENRIQUECE a partir desse env JÁ
 *     endurecido — ele nunca vê as variáveis removidas;
 *  3. `buildChildEnv` de novo sobre o resultado: o env que chega ao executor
 *     injetado SEMPRE passou pelo passo base — o endurecimento é invariante,
 *     não uma promessa que o custom pode derrubar (WARNING 3).
 * O executor real pluga o próprio spawn aqui dentro e ganha as duas camadas
 * de graça.
 */
export function createHardenedExec(opts: HardenedExecOptions): ExecFn {
  // P-27: semáforo do P-01 — default pronto (createExecSemaphore) ou custom
  // por teto (createSemaphore(n), fail-fast em n < 1); limiter injetado vence.
  const limiter =
    opts.limiter ??
    (opts.maxConcurrency !== undefined ? createSemaphore(opts.maxConcurrency) : createExecSemaphore());
  return async (
    dir: string,
    args: string[],
    execOpts?: { timeoutMs?: number; env?: NodeJS.ProcessEnv },
  ): Promise<ExecResult> => {
    const release = await limiter.acquire();
    try {
      const hardenedBase = buildChildEnv(execOpts?.env);
      const enriched = opts.envBuilder ? opts.envBuilder(hardenedBase) : hardenedBase;
      const finalEnv = buildChildEnv(enriched);
      return await opts.exec(dir, args, { ...execOpts, env: finalEnv });
    } finally {
      release();
    }
  };
}