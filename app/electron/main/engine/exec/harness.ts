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
 *   - SEM REDE, E POR ALLOWLIST (onda 5): o código executado foi escrito por
 *     LLM. A isolação é aplicada NO LUGAR CERTO — na construção do ambiente do
 *     processo filho (`buildChildEnv`), que a partir desta onda CONSTRÓI o env
 *     em vez de copiar-e-apagar: só herda o que `ENV_ALLOWLIST_COMUM` +
 *     `adapter.envScrub.allow` permitem, impõe `LC_ALL=C.UTF-8 TZ=UTC` e
 *     `NO_PROXY=*`, e apaga o veneno residual de `strip`. LIMITES DECLARADOS:
 *     isso derruba tráfego via proxy (acidental ou hostil) e força verificação
 *     TLS padrão, mas NÃO bloqueia socket cru (TCP/UDP) — o corte de rede de
 *     verdade exige wrapper de SO (o slot `wrapperCommand` de
 *     `NETWORK_HARDENING` é onde o executor real pluga, ex.:
 *     sandbox-exec/nsjail). A prova dos percevejos: `NODE_TEST_CONTEXT`
 *     removido SEMPRE do filho (herdado do runner pai, o node:test do filho
 *     pularia tudo e sairia 0) — e o endurecimento é INVARIANTE: mesmo com
 *     `envBuilder` custom, o env final SEMPRE passa pelo reforço de saída
 *     (`createHardenedExec` encadeia, nunca substitui); ANSI tolerado no
 *     parser (`adapter.countRun` em proofs.ts) e `FORCE_COLOR` também removido
 *     aqui.
 *   - TUDO O QUE É POR LINGUAGEM VEM DO ADAPTADOR (§6 de
 *     `docs/research/08-multilingua-trava-deterministica.md`): o layout de
 *     arquivos e o regex de caminho seguro (`prepareIsolatedDir`) e a política
 *     de ambiente (`buildChildEnv`). Este arquivo não conhece `.mjs`,
 *     `package.json` nem `solution.mjs` — quem conhece é `lang/javascript.ts`.
 *   - EXIT GUARD: o código sob teste não pode matar o runner com
 *     `process.exit(0)`/`process.abort()` antes do relatório (forjando
 *     `ℹ tests N`). `escreverExitGuard` escreve um `.cjs` no diretório isolado
 *     que sobrescreve exit/abort para LANÇAR; o executor real (integração
 *     F9/adaptador P-28) o passa via `--require` no spawn do `node --test`.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import type { ExecFn, ExecResult } from './proofs';
import {
  applyEnvScrub,
  applyLegacyEnvScrub,
  defaultAdapter,
  type ChildEnv,
  type LanguageAdapter,
} from '../lang/registry';
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
  /** código do lado (o `entryPath` do layout do adaptador quando `files` ausente). */
  code: string;
  /** ADITIVO multi-arquivo: caminho + código por arquivo. */
  files?: { path: string; code: string }[];
  testsCode: string;
}

/**
 * Prepara um diretório de execução ISOLADO, novo a cada chamada (mkdtemp sob
 * `baseDir` — a raiz é INJETÁVEL) com os arquivos que o ADAPTADOR manda
 * escrever, na ordem que ele manda. Nenhum lado de uma prova compartilha
 * diretório.
 *
 * ONDA 5 — O LAYOUT É DO ADAPTADOR (§6 obs. 1 de
 * `docs/research/08-multilingua-trava-deterministica.md`): "com Go o arquivo
 * tem de terminar em `_test.go` e ficar no mesmo pacote; com Java o nome do
 * arquivo tem de ser exatamente o da classe pública; com Rust o fonte vive em
 * `src/`. O regex vira um campo do adaptador, e o `layout` deixa de ser
 * implícito." Nada aqui conhece `package.json`, `solution.mjs` nem `.mjs`:
 * `adapter.layout(side).files` diz TODO arquivo e o conteúdo dele, e
 * `adapter.filePathPattern` diz o que é caminho seguro (proíbe '..' e qualquer
 * escape do diretório). Nunca lança por path malformado sem dizer qual.
 */
export async function prepareIsolatedDir(
  baseDir: string,
  side: IsolatedSide,
  adapter: LanguageAdapter = defaultAdapter(),
): Promise<string> {
  if (side.files && side.files.some((f) => typeof f?.path !== 'string' || !adapter.filePathPattern.test(f.path))) {
    throw new Error(`path de arquivo inválido no lado isolado: ${JSON.stringify(side.files.map((f) => f.path))}`);
  }
  const layout = adapter.layout({ code: side.code, files: side.files, testsCode: side.testsCode });
  const dir = await fs.promises.mkdtemp(path.join(baseDir, 'proof-exec-'));
  try {
    for (const arquivo of layout.files) {
      const full = path.join(dir, arquivo.path);
      await fs.promises.mkdir(path.dirname(full), { recursive: true });
      await fs.promises.writeFile(full, arquivo.content, 'utf8');
    }
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
 * A configuração de isolação de rede do harness, DERIVADA do `envScrub` do
 * adaptador default (§6, membro 14). Continua exportada porque
 * `engine/review/filter.ts` a cita e dois testes a leem — mas o VALOR vive no
 * adaptador (`lang/javascript.ts`, `JS_ENV_SCRUB`), não mais numa lista solta
 * aqui.
 *
 * `NODE_TEST_CONTEXT` NÃO aparece em `stripEnv` (embora esteja no `strip` do
 * adaptador): historicamente ela é removida no passo separado de
 * `buildChildEnv` — é uma armadilha do RUNNER, não de rede. A separação é
 * preservada byte a byte para não mudar o significado deste objeto público.
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
  stripEnv: defaultAdapter().envScrub.strip.filter((nome) => nome !== 'NODE_TEST_CONTEXT'),
  fixedEnv: defaultAdapter().envScrub.fixed,
  wrapperCommand: undefined,
  scope: defaultAdapter().envScrub.scope,
};

/**
 * Monta o ambiente do processo filho — ALLOWLIST (§6 obs. 2 de
 * `docs/research/08-multilingua-trava-deterministica.md`).
 *
 * ─── A MUDANÇA DE COMPORTAMENTO DELIBERADA DA ONDA 5 ─────────────────────
 *
 * ANTES: copiava `process.env` INTEIRO e apagava uma denylist de 9 nomes.
 * AGORA: o ambiente do filho é CONSTRUÍDO — só entra o que
 * `ENV_ALLOWLIST_COMUM` + `adapter.envScrub.allow` permitem herdar, mais o
 * núcleo de determinismo (`LC_ALL=C.UTF-8`, `TZ=UTC`) e os `fixed` da
 * linguagem, menos o veneno residual de `strip`.
 *
 * POR QUE, na letra do documento: "Cada linguagem tem o seu veneno
 * (`GOFLAGS`, `GOCACHE`, `RUSTFLAGS`, `CARGO_TARGET_DIR`, `PYTHONPATH`,
 * `CLASSPATH`, `DOTNET_*`), e a lista nunca vai estar completa. O correto é
 * montar o ambiente do filho a partir de uma allowlist explícita mais
 * `LC_ALL=C.UTF-8 TZ=UTC`." Uma denylist é uma promessa que só vale até
 * alguém inventar uma variável nova; uma allowlist é uma promessa que vale
 * por construção.
 *
 * O QUE ISSO CONSERTA DE FATO, e não é hipotético: `LC_ALL`/`TZ` NUNCA eram
 * fixados antes. Um teste que ordena strings acentuadas ou formata data
 * passava na máquina de quem escreveu o desafio e falhava na do aluno, e a
 * denylist não pegava isso porque não é veneno — é ambiente legítimo com
 * valor diferente. `NODE_TEST_CONTEXT` continua removida (agora pelo `strip`
 * do adaptador, e também por não estar na allowlist).
 *
 * A semântica ANTERIOR continua disponível e testada como
 * `applyLegacyEnvScrub` no registro — é ela que `createHardenedExec` usa para
 * REFORÇAR os invariantes sobre um env já construído (ver abaixo).
 */
export function buildChildEnv(
  base?: NodeJS.ProcessEnv | undefined,
  adapter: LanguageAdapter = defaultAdapter(),
): NodeJS.ProcessEnv {
  return applyEnvScrub(adapter.envScrub, (base ?? process.env) as ChildEnv) as NodeJS.ProcessEnv;
}

/**
 * REFORÇO DE INVARIANTE sobre um env que JÁ foi construído — a denylist
 * (`strip` + `fixed`), nunca a allowlist.
 *
 * POR QUE NÃO A ALLOWLIST AQUI, e a distinção é a chave do desenho: a
 * allowlist decide o que é HERDADO do processo pai. Um `envBuilder` custom
 * (slot documentado de `HardenedExecOptions`) não herda nada — ele INJETA
 * valores explícitos, e passá-los pela allowlist de novo apagaria justamente o
 * enriquecimento que o chamador pediu, tornando o slot inútil. O que o passo
 * de saída precisa garantir é o INVARIANTE: o veneno conhecido continua fora e
 * os `fixed` continuam valendo, mesmo que o custom tenha tentado reintroduzi-los
 * (WARNING 3 — "o endurecimento é invariante, não uma promessa que o custom
 * pode derrubar").
 */
export function reforcarInvariantesDeEnv(
  env: NodeJS.ProcessEnv,
  adapter: LanguageAdapter = defaultAdapter(),
): NodeJS.ProcessEnv {
  return applyLegacyEnvScrub(adapter.envScrub, env as ChildEnv) as NodeJS.ProcessEnv;
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
  /**
   * O adaptador cuja política de ambiente vale para os filhos (§6 membro 14).
   * Default: o adaptador default (`javascript`).
   */
  adapter?: LanguageAdapter;
}

/**
 * Envolve QUALQUER ExecFn com o endurecimento do harness: adquire vaga no
 * SEM_EXEC antes de executar (libera SEMPRE, via finally) e injeta o env do
 * filho com o endurecimento base garantido por ENCADEAMENTO:
 *  1. `buildChildEnv(base)` CONSTRÓI o env do filho por ALLOWLIST (§6 obs. 2)
 *     a partir da base (seja ela `process.env` ou o env de execOpts): só o
 *     que a política permite herdar, mais `LC_ALL=C.UTF-8 TZ=UTC` e os
 *     `fixed` da linguagem (`NO_PROXY=*`), menos o veneno de `strip`
 *     (`NODE_TEST_CONTEXT`, proxies, `NODE_OPTIONS`, `FORCE_COLOR`);
 *  2. `envBuilder` custom (se houver) ENRIQUECE a partir desse env JÁ
 *     construído — ele nunca vê as variáveis removidas;
 *  3. `reforcarInvariantesDeEnv` sobre o resultado: o env que chega ao
 *     executor injetado SEMPRE teve o veneno reapagado e os `fixed`
 *     reimpostos — o endurecimento é invariante, não uma promessa que o custom
 *     pode derrubar (WARNING 3). O passo 3 é DENYLIST de propósito: passar a
 *     allowlist de novo apagaria o enriquecimento explícito do passo 2 e
 *     tornaria o slot `envBuilder` inútil (ver `reforcarInvariantesDeEnv`).
 * O executor real pluga o próprio spawn aqui dentro e ganha as duas camadas
 * de graça.
 */
export function createHardenedExec(opts: HardenedExecOptions): ExecFn {
  // P-27: semáforo do P-01 — default pronto (createExecSemaphore) ou custom
  // por teto (createSemaphore(n), fail-fast em n < 1); limiter injetado vence.
  const limiter =
    opts.limiter ??
    (opts.maxConcurrency !== undefined ? createSemaphore(opts.maxConcurrency) : createExecSemaphore());
  const adapter = opts.adapter ?? defaultAdapter();
  return async (
    dir: string,
    args: string[],
    execOpts?: { timeoutMs?: number; env?: NodeJS.ProcessEnv },
  ): Promise<ExecResult> => {
    const release = await limiter.acquire();
    try {
      const hardenedBase = buildChildEnv(execOpts?.env, adapter);
      const enriched = opts.envBuilder ? opts.envBuilder(hardenedBase) : hardenedBase;
      const finalEnv = reforcarInvariantesDeEnv(enriched, adapter);
      return await opts.exec(dir, args, { ...execOpts, env: finalEnv });
    } finally {
      release();
    }
  };
}