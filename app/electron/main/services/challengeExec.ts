/**
 * electron/main/services/challengeExec.ts — execução determinística de desafios
 * nodejs (rodada 8). ÚNICA implementação do runner de desafios de trilha:
 * usada pelo CLI de autoria (verificação de conteúdo) E pelo main (submissão
 * do aluno + validação de desafios regenerados).
 *
 * Modelo de desafio: solution.mjs (código do aluno) + test.mjs (node:test
 * ESM) + package.json {type:'module'} num diretório temporário; roda
 * `node --test`. Verdict por EXECUÇÃO com gate de IGUALDADE:
 *   passed = exit 0 && testsRun === expectedTestCount
 * (exit code sozinho mente — arquivo de teste vazio sai 0; mesma armadilha
 * documentada em skills/study-method/references/languages.md).
 */

import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawn } from 'node:child_process';

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

export type ExecFn = (dir: string, args: string[], opts?: { timeoutMs?: number }) => Promise<ExecResult>;

/**
 * Binário do NODE a usar nos processos filhos. DENTRO DO ELECTRON,
 * `process.execPath` é o binário do Electron (que não entende `--test` e
 * travaria) — usa o node do PATH (`npm_node_execpath` quando o app roda via
 * npm, senão `node`). Em node puro (testes/CLI) usa o processo atual.
 */
export function nodeBinary(): string {
  if (process.versions.electron) {
    return process.env.npm_node_execpath || 'node';
  }
  return process.execPath;
}

/** Exec real de `node --test` num diretório (DI injeta fake nos testes). */
export const nodeExec: ExecFn = (dir, args, opts) =>
  new Promise((resolve) => {
    // NODE_TEST_CONTEXT é setado pelo node:test do processo PAI (quando esta
    // app roda sob o runner de testes); herdado pelo filho, faz o node:test
    // do filho acreditar que já está dentro de um runner e PULAR os arquivos
    // (exit 0 sem testar nada — o furo de "exit code sozinho mente" de
    // languages.md). Remove sempre do ambiente do filho.
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    const child = spawn(nodeBinary(), args, {
      cwd: dir,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer =
      opts?.timeoutMs && opts.timeoutMs > 0
        ? setTimeout(() => child.kill('SIGKILL'), opts.timeoutMs)
        : null;
    child.stdout.on('data', (d) => (stdout += String(d)));
    child.stderr.on('data', (d) => (stderr += String(d)));
    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr });
    });
    child.on('error', (err) => {
      if (timer) clearTimeout(timer);
      resolve({ code: 1, stdout, stderr: String(err) });
    });
  });

/** Prepara o diretório de execução: solution.mjs + test.mjs + package.json. */
export async function prepareChallengeDir(
  workDir: string,
  files: { solutionCode: string; testsCode: string },
): Promise<void> {
  await fs.writeFile(path.join(workDir, 'package.json'), JSON.stringify({ type: 'module' }), 'utf8');
  await fs.writeFile(path.join(workDir, 'solution.mjs'), files.solutionCode, 'utf8');
  await fs.writeFile(path.join(workDir, 'test.mjs'), files.testsCode, 'utf8');
}

/**
 * Conta os testes executáveis do arquivo (gate de igualdade). Remove
 * comentários ANTES de contar — `// test(...)` num comentário não é um teste.
 */
export function countTestDeclarations(testsCode: string): number {
  const stripped = testsCode
    .replace(/\/\*[\s\S]*?\*\//g, '') // comentários de bloco
    .replace(/\/\/[^\n]*/g, ''); // comentários de linha
  return (stripped.match(/\btest\(/g) ?? []).length;
}

/**
 * Extrai as contagens do relatório spec do node:test (linhas `ℹ tests N`).
 * O relatório pode chegar COM códigos ANSI (`\x1b[34mℹ tests 3\x1b[39m` —
 * o node:test pinta quando o ambiente pede cor, ex.: FORCE_COLOR herdado do
 * runner do Playwright): os escapes são removidos ANTES do match — senão a
 * linha "não começa com ℹ" e a contagem vira 0 (gate de igualdade derruba
 * um resultado que passou).
 */
export function parseSpecCounts(output: string): { testsRun: number; pass: number; fail: number } {
  const plain = output.replace(/\x1b\[[0-9;]*m/g, '');
  const testsRun = Number(/^ℹ tests (\d+)/m.exec(plain)?.[1] ?? 0);
  const pass = Number(/^ℹ pass (\d+)/m.exec(plain)?.[1] ?? 0);
  const fail = Number(/^ℹ fail (\d+)/m.exec(plain)?.[1] ?? 0);
  return { testsRun, pass, fail };
}

export interface RunStudentCodeInput {
  /** código enviado pelo aluno (substitui o starter). */
  studentCode: string;
  testsCode: string;
  expectedTestCount: number;
  timeoutMs?: number;
}

export interface RunStudentCodeResult {
  passed: boolean;
  testsRun: number;
  pass: number;
  fail: number;
  output: string;
  /** erro de execução (spawn falhou, timeout etc.) — output tem o detalhe. */
  error?: string;
}

/** Roda o código do aluno contra os testes. Gate: exit 0 E igualdade de contagem. */
export async function runStudentCode(
  input: RunStudentCodeInput,
  exec: ExecFn = nodeExec,
): Promise<RunStudentCodeResult> {
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'track-submit-'));
  try {
    await prepareChallengeDir(work, { solutionCode: input.studentCode, testsCode: input.testsCode });
    const res = await exec(work, ['--test', '--test-reporter=spec', 'test.mjs'], {
      timeoutMs: input.timeoutMs ?? 30_000,
    });
    const counts = parseSpecCounts(`${res.stdout}\n${res.stderr}`);
    const declared = countTestDeclarations(input.testsCode);
    const passed = res.code === 0 && counts.testsRun === input.expectedTestCount && declared === input.expectedTestCount;
    return {
      passed,
      testsRun: counts.testsRun,
      pass: counts.pass,
      fail: counts.fail,
      output: `${res.stdout}\n${res.stderr}`.trim(),
    };
  } catch (err) {
    return {
      passed: false,
      testsRun: 0,
      pass: 0,
      fail: 0,
      output: String(err),
      error: String(err),
    };
  } finally {
    await fs.rm(work, { recursive: true, force: true }).catch(() => {});
  }
}

export interface ChallengePair {
  solutionCode: string;
  starterCode: string;
  testsCode: string;
  expectedTestCount: number;
}

export interface ChallengePairVerdict {
  /** teste PASSA contra a solução de referência. */
  solutionPasses: boolean;
  /** teste FALHA contra o starter (o aluno tem o que fazer). */
  starterFails: boolean;
  /** nº de testes declarados bate com o esperado. */
  countMatches: boolean;
  output: string;
}

export function pairIsValid(v: ChallengePairVerdict): boolean {
  return v.solutionPasses && v.starterFails && v.countMatches;
}

/**
 * Provas por execução de UM par solução/starter (filosofia do
 * challenge-verify.sh passos 1–2, sem mutação): solução passa com igualdade
 * de contagem E starter falha.
 */
export async function verifyChallengePair(pair: ChallengePair, exec: ExecFn = nodeExec): Promise<ChallengePairVerdict> {
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'track-verify-'));
  try {
    await prepareChallengeDir(work, { solutionCode: pair.solutionCode, testsCode: pair.testsCode });
    const sol = await exec(work, ['--test', '--test-reporter=spec', 'test.mjs'], { timeoutMs: 30_000 });
    const solCounts = parseSpecCounts(`${sol.stdout}\n${sol.stderr}`);
    const declared = countTestDeclarations(pair.testsCode);
    const solutionPasses = sol.code === 0 && solCounts.testsRun === pair.expectedTestCount && declared === pair.expectedTestCount;

    await fs.writeFile(path.join(work, 'solution.mjs'), pair.starterCode, 'utf8');
    const stub = await exec(work, ['--test', '--test-reporter=spec', 'test.mjs'], { timeoutMs: 30_000 });
    const starterFails = stub.code !== 0;

    return {
      solutionPasses,
      starterFails,
      countMatches: declared === pair.expectedTestCount,
      output: `${sol.stdout}\n${sol.stderr}\n--- starter ---\n${stub.stdout}\n${stub.stderr}`.trim(),
    };
  } finally {
    await fs.rm(work, { recursive: true, force: true }).catch(() => {});
  }
}
