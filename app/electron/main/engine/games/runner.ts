/**
 * app/electron/main/engine/games/runner.ts — EXECUTOR dos níveis de game
 * (contrato de I/O: stdin → stdout).
 *
 * ONDA-GAMES (motor). Para (world, level, lang, código do aluno):
 *   1. escreve o fonte por CONVENÇÃO DA LINGUAGEM (tabela `GAME_LANG_PLANS`;
 *      nomes alinhados com as constantes dos adaptadores — ver cada entrada);
 *   2. compila se preciso (C: cc/gcc/clang `-std=c11`; Rust: rustc pinado);
 *   3. corre CADA caso com `stdin = case.input` e compara o stdout NORMALIZADO
 *      (CRLF→LF + trim de whitespace final por linha + sem newlines finais);
 *   4. mede: `lines` = linhas não-vazias do código; `timeMs` = mediana dos
 *      casos que PASSARAM (medida honesta: casos correm SEQUENCIALMENTE —
 *      em paralelo a mediana mediria contenção, não o programa).
 *
 * TIMEOUT ~5s por caso (`CASE_TIMEOUT_MS`); compilação tem teto próprio
 * (`COMPILE_TIMEOUT_MS` — rustc é lento a primeira vez).
 *
 * ─── COMO ISTO REUSA O CAMINHO DE EXECUÇÃO DO APP ──────────────────────────
 * A execução endurecida é a composição CANÓNICA documentada em
 * `exec/adapter.ts`:
 *
 *   createHardenedExec({ adapter, exec: fromChallengeExec(execIoComStdin) })
 *
 *   - `execIo` (aqui) tem o shape do `ExecFn` do PRODUTO
 *     (`services/challengeExec.ts`: `{code, stdout, stderr}`) — a ÚNICA
 *     diferença é o `opts.stdin`, que o spawn do produto não aceita
 *     (`stdio[0] = 'ignore'`) e que o contrato io exige; a ponte oficial
 *     `fromChallengeExec` mapeia o resultado para a ENGINE;
 *   - `createHardenedExec` (`exec/harness.ts`) envolve tudo com SEM_EXEC +
 *     env por ALLOWLIST (`buildChildEnv`) + reforço de invariantes — o mesmo
 *     endurecimento das provas de desafio;
 *   - o ADAPTADOR da linguagem (`adapterDoDesafio`) decide binário, flags e
 *     política de env (`envScrub`) — nada de convenção solta aqui.
 *
 * `prepareIsolatedDir` do harness NÃO serve aqui (ele escreve o layout de
 * TESTE do adaptador — test.mjs/run.sh); o contrato io precisa só do fonte do
 * aluno. Usamos mkdtemp + `cleanupDir` (o helper de limpeza do harness).
 *
 * DIAGNÓSTICO SEM CANAL DE ERRO NO CONTRATO: `GameRunResult` (tipo TRAVADO)
 * não tem campo `error`. Um caso que falha mostra `expected`/`actual`, e a
 * regra de `actual` é: stdout bruto se existiu; senão o stderr truncado
 * (erro de compilação/runtime é o que o aluno precisa ver); timeout tem texto
 * próprio. Casos `hidden` nunca mostram `expected`/`actual`.
 */

import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawn } from 'node:child_process';

import type { GameCaseResult, GameLang } from '../../../../src/types/games';
import { fromChallengeExec } from '../exec/adapter';
import { createHardenedExec, cleanupDir } from '../exec/harness';
import { adapterDoDesafio } from '../exec/proofsCore';
import type { LanguageAdapter } from '../lang/registry';
import type { ExecResult as ChallengeExecResult } from '../../services/challengeExec';
import type { GameCaseContent, GameLevelContent } from './schema';

// ---------------------------------------------------------------------------
// Limites (decisões documentadas)
// ---------------------------------------------------------------------------

/** Teto por caso — "quase instantâneo" é a mecânica; 5s é generoso. */
export const CASE_TIMEOUT_MS = 5_000;
/** Teto da compilação (C é rápido; rustc a frio pode demorar). */
export const COMPILE_TIMEOUT_MS = 60_000;
/** Nome do binário compilado dentro do diretório isolado. */
const PROG_BIN = 'game_prog';
/** Teto do diagnóstico (stderr) mostrado em `actual`. */
const DIAG_MAX_CHARS = 400;

// ---------------------------------------------------------------------------
// Normalização da comparação (contrato: trim final por linha + CRLF→LF)
// ---------------------------------------------------------------------------

/**
 * Normaliza stdout/expected para comparação: CRLF→LF, trim do whitespace
 * FINAL de cada linha e remoção das linhas vazias do FIM. Assim `print("a")`
 * e `print("a\n")` são o mesmo contrato — a mecânica julga o CONTEÚDO da
 * saída, não os bytes de acabamento (decisão: whitespace final nunca reprova).
 */
export function normalizeOutput(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n+$/, '');
}

// ---------------------------------------------------------------------------
// Execução com stdin (shape do PRODUTO + opts.stdin)
// ---------------------------------------------------------------------------

/** Opts do executor io: o `ExecFn` do produto + `stdin` (o contrato io). */
export interface IoExecOpts {
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  stdin?: string;
}

/** O executor io: shape do PRODUTO (`{code, stdout, stderr}`) + `opts.stdin`. */
export type IoExecFn = (
  dir: string,
  args: string[],
  opts?: IoExecOpts,
) => Promise<ChallengeExecResult>;

/**
 * Spawn direto com stdin — o `nodeExec`/`criarExecDeLinguagem` do produto
 * ignora stdin (`stdio[0]='ignore'`) e trava o binário no `detect()` do
 * adaptador; aqui o chamador comanda binário+args (compilação E execução).
 * Shape do resultado idêntico ao do produto, para atravessar
 * `fromChallengeExec` sem adapter extra (a assinatura é compatível: o
 * `IoExecOpts` é SUPERconjunto do opts do produto). Timeout resolve 137
 * (a convenção do repositório: timeout-ou-OOM, sem afirmar qual).
 */
export const execIo: IoExecFn = (dir, args, opts) =>
    new Promise((resolve) => {
      const env = { ...(opts?.env ?? process.env) };
      delete env.NODE_TEST_CONTEXT;
      const child = spawn(args[0] ?? '', args.slice(1), {
        cwd: dir,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      const timer =
        opts?.timeoutMs && opts.timeoutMs > 0
          ? setTimeout(() => {
              timedOut = true;
              child.kill('SIGKILL');
            }, opts.timeoutMs)
          : null;
      child.stdout.on('data', (d) => (stdout += String(d)));
      child.stderr.on('data', (d) => (stderr += String(d)));
      child.on('close', (code) => {
        if (timer) clearTimeout(timer);
        resolve({ code: timedOut ? 137 : code ?? 1, stdout, stderr });
      });
      child.on('error', (err) => {
        if (timer) clearTimeout(timer);
        resolve({ code: 1, stdout, stderr: String(err) });
      });
      if (opts?.stdin !== undefined) {
        child.stdin.on('error', () => {}); // filho morreu sem ler o stdin
        child.stdin.end(opts.stdin, 'utf8');
      } else {
        child.stdin.end();
      }
    });

/**
 * Envolve o exec io com o endurecimento do harness (SEM_EXEC + env allowlist)
 * usando a composição canónica `createHardenedExec(fromChallengeExec(...))`.
 * `stdin` é amarrado por CASO (closure) — a ponte do produto não tem slot
 * para ele e o endurecimento não o conhece (nem deve).
 */
export function hardenIoExec(
  adapter: LanguageAdapter,
  stdin: string,
): ReturnType<typeof createHardenedExec> {
  return createHardenedExec({
    adapter,
    exec: fromChallengeExec((dir, args, opts) => execIo(dir, args, { ...opts, stdin })),
  });
}

/**
 * O executor DEFAULT de `runGameCases`: `execIo` endurecido pelo harness
 * (composição canónica acima). Quem injeta `deps.exec` (testes) fica com o
 * executor cru — a injeção é o slot A-P07-2.
 */
function defaultExec(adapter: LanguageAdapter): IoExecFn {
  return async (dir, args, opts) => {
    const hardened = hardenIoExec(adapter, opts?.stdin ?? '');
    const res = await hardened(dir, args, {
      ...(opts?.timeoutMs !== undefined ? { timeoutMs: opts.timeoutMs } : {}),
      ...(opts?.env !== undefined ? { env: opts.env } : {}),
    });
    return { code: res.exitCode, stdout: res.stdout, stderr: res.stderr };
  };
}

// ---------------------------------------------------------------------------
// Plano por linguagem (a "convenção da linguagem (adaptador)")
// ---------------------------------------------------------------------------

/** Um passo de comando (binário + args) num diretório de execução. */
export interface GameExecStep {
  bin: string;
  args: string[];
}

/** O plano io de uma linguagem: onde o fonte vive, como compila, como corre. */
export interface GameLangPlan {
  /** caminho do fonte do aluno (convenção da linguagem). */
  sourcePath: string;
  /** passos de compilação, por ordem de preferência (o 1º que compila vence). */
  compile: (adapter: LanguageAdapter) => GameExecStep[];
  /** comando de execução do programa compilado/intepretado. */
  run: (adapter: LanguageAdapter) => GameExecStep;
}

/**
 * O binário REAL do rustc — o `fixed.RUSTC` do adaptador Rust (o rustc do
 * PATH é o PROXY do rustup numa máquina de dev; `lang/rust.ts` decisão 6
 * resolve e pina o real). Fallback `rustc` quando a resolução falhou.
 */
function rustcReal(adapter: LanguageAdapter): string {
  const pinned = adapter.envScrub.fixed.RUSTC;
  return typeof pinned === 'string' && pinned !== '' ? pinned : 'rustc';
}

/**
 * AS CONVENÇÕES POR LINGUAGEM.
 *
 *   - C: fonte `solucao.c` (o `C_ENTRY_PATH` do adaptador C); compilação com
 *     `-std=c11` (a linha MEDIDA de `languages.md` §3.1, a mesma que o
 *     `run.sh` do adaptador gera) nos candidatos `cc → gcc → clang` (a ordem
 *     de `C_BINARIOS_RUNNER`); o aluno escreve um PROGRAMA COMPLETO (com
 *     `main`) — o contrato é io, não o harness de funções do desafio.
 *   - Python: fonte `solucao.py` (o `PY_ENTRY_PATH` do adaptador); corre com o
 *     binário do `detect()` do adaptador e flag `-I` (isolado: sem PYTHONPATH
 *     nem user-site — o mesmo espírito do extrator `python3 -I -S`).
 *   - Rust: fonte `src/main.rs`. DIVERGE DO ADAPTADOR DE PROPÓSITO:
 *     `RS_ENTRY_PATH` é `src/lib.rs` porque desafio Rust é crate de testes;
 *     um programa io é um BINÁRIO, e binário mora em `src/main.rs`. Compila
 *     com o rustc REAL pinado (`fixed.RUSTC`), `--edition 2021 -O`.
 */
export const GAME_LANG_PLANS: Record<GameLang, GameLangPlan> = {
  c: {
    sourcePath: 'solucao.c',
    compile: () =>
      ['cc', 'gcc', 'clang'].map((bin) => ({
        bin,
        args: ['-std=c11', '-O2', '-o', PROG_BIN, 'solucao.c'],
      })),
    run: () => ({ bin: `./${PROG_BIN}`, args: [] }),
  },
  python: {
    sourcePath: 'solucao.py',
    compile: () => [],
    run: (adapter) => ({ bin: adapter.detect().binary, args: ['-I', 'solucao.py'] }),
  },
  rust: {
    sourcePath: path.join('src', 'main.rs'),
    compile: (adapter) => [
      { bin: rustcReal(adapter), args: ['--edition', '2021', '-O', '-o', PROG_BIN, path.join('src', 'main.rs')] },
    ],
    run: () => ({ bin: `./${PROG_BIN}`, args: [] }),
  },
};

// ---------------------------------------------------------------------------
// runGameCases — o julgamento por execução
// ---------------------------------------------------------------------------

export interface GameRunCasesResult {
  /** TODOS os casos passaram (hidden incluídos). */
  ok: boolean;
  /** resultados na ordem dos casos do contrato. */
  cases: GameCaseResult[];
  /** lines = linhas não-vazias do código; timeMs = mediana dos casos que passaram. */
  metrics: { lines: number; timeMs: number };
}

export interface GameRunnerDeps {
  /** executor io injetável (testes). Default: `execIo` real. */
  exec?: IoExecFn;
  caseTimeoutMs?: number;
  compileTimeoutMs?: number;
}

/** Linhas NÃO-VAZIAS do código (a métrica de otimização do jogo). */
export function countCodeLines(code: string): number {
  return code.split('\n').filter((line) => line.trim() !== '').length;
}

/** Mediana (ms, arredondado) — par central de valores → média dos dois. */
function mediana(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return Math.round(median);
}

/** `actual` de um caso que falhou (regra de diagnóstico do cabeçalho). */
function diagnosticoFalha(stdout: string, stderr: string, timedOut: boolean): string {
  if (timedOut) return `(tempo esgotado — ${CASE_TIMEOUT_MS}ms)`;
  const out = normalizeOutput(stdout);
  if (out !== '') return stdout;
  const err = normalizeOutput(stderr);
  return err !== '' ? `${stderr}`.trim().slice(0, DIAG_MAX_CHARS) : '(sem saída)';
}

/**
 * Corre UM nível inteiro para UM código de aluno. Sequencial por caso
 * (honestidade da mediana); compila UMA vez antes dos casos. NUNCA lança por
 * código do aluno quebrado — erro de compilação/runtime é run falhado, com
 * diagnóstico nos casos visíveis.
 */
export async function runGameCases(
  level: GameLevelContent,
  lang: GameLang,
  code: string,
  deps: GameRunnerDeps = {},
): Promise<GameRunCasesResult> {
  const adapter = adapterDoDesafio(lang);
  const exec = deps.exec ?? defaultExec(adapter);
  const caseTimeout = deps.caseTimeoutMs ?? CASE_TIMEOUT_MS;
  const compileTimeout = deps.compileTimeoutMs ?? COMPILE_TIMEOUT_MS;
  const plan = GAME_LANG_PLANS[lang];
  const lines = countCodeLines(code);
  const cases: GameCaseContent[] = level.contract.cases;

  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'game-run-'));
  try {
    // 1. fonte por convenção da linguagem (mkdir dos subdirs — src/main.rs).
    const sourceFull = path.join(work, plan.sourcePath);
    await fs.mkdir(path.dirname(sourceFull), { recursive: true });
    await fs.writeFile(sourceFull, code, 'utf8');

    // 2. compilação (se preciso): o 1º candidato que compila vence.
    const compileSteps = plan.compile(adapter);
    let compiled = compileSteps.length === 0; // interpretada: nada a compilar
    let compileErr = '';
    for (const step of compileSteps) {
      const res = await exec(work, [step.bin, ...step.args], { timeoutMs: compileTimeout });
      if (res.code === 0) {
        compiled = true;
        compileErr = '';
        break;
      }
      compileErr = res.stderr !== '' ? res.stderr : res.stdout;
    }
    if (!compiled) {
      // Compilação falhou: NENHUM caso corre. Cada caso vira falha com o
      // diagnóstico do compilador no `actual` dos visíveis (o contrato não
      // tem canal de erro — ver cabeçalho).
      const casesOut: GameCaseResult[] = cases.map((c) =>
        c.hidden
          ? { name: c.name, ok: false }
          : {
              name: c.name,
              ok: false,
              expected: c.expectedOutput,
              actual: compileErr.trim().slice(0, DIAG_MAX_CHARS),
            },
      );
      return { ok: false, cases: casesOut, metrics: { lines, timeMs: 0 } };
    }

    // 3. cada caso: stdin=input, stdout comparado normalizado.
    const runStep = plan.run(adapter);
    const durationsPassing: number[] = [];
    const casesOut: GameCaseResult[] = [];
    for (const c of cases) {
      const started = performance.now();
      const res = await exec(work, [runStep.bin, ...runStep.args], {
        timeoutMs: caseTimeout,
        stdin: c.input,
      });
      const elapsed = Math.round(performance.now() - started);
      const timedOut = res.code === 137;
      const ok = !timedOut && res.code === 0 && normalizeOutput(res.stdout) === normalizeOutput(c.expectedOutput);
      if (ok) durationsPassing.push(elapsed);
      casesOut.push(
        c.hidden
          ? { name: c.name, ok }
          : {
              name: c.name,
              ok,
              expected: c.expectedOutput,
              actual: ok ? res.stdout : diagnosticoFalha(res.stdout, res.stderr, timedOut),
            },
      );
    }

    return {
      ok: casesOut.every((c) => c.ok),
      cases: casesOut,
      metrics: { lines, timeMs: mediana(durationsPassing) },
    };
  } finally {
    await cleanupDir(work);
  }
}
