/**
 * electron/main/services/challengeExec.ts — execução determinística de desafios
 * nodejs (rodada 8). ÚNICA implementação do runner de desafios de trilha:
 * usada pelo CLI de autoria (verificação de conteúdo) E pelo main (submissão
 * do aluno + validação de desafios regenerados).
 *
 * Modelo de desafio: solution.mjs (código do aluno) + test.mjs (node:test
 * ESM) + package.json {type:'module'} num diretório temporário; roda
 * `node --test`. ADITIVO (rodada 9): desafio MULTI-ARQUIVO — N arquivos
 * (paths relativos, mkdir dos subdirs) + test.mjs; o aluno edita todos.
 * Verdict por EXECUÇÃO com gate de IGUALDADE:
 *   passed = exit 0 && testsRun === expectedTestCount
 * (exit code sozinho mente — arquivo de teste vazio sai 0; mesma armadilha
 * documentada em skills/study-method/references/languages.md).
 */

import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawn } from 'node:child_process';

import { SAFE_FILE_PATH_RE, TrackChallengeSource } from '../content/trackTypes';

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

/**
 * Prepara o diretório de execução: package.json + test.mjs + o código do
 * aluno. ADITIVO (rodada 9): `files` (multi-arquivo) escreve cada arquivo no
 * caminho relativo dele (mkdir dos subdirs) — sem `files`, escreve o arquivo
 * único solution.mjs (comportamento atual intacto).
 */
export async function prepareChallengeDir(
  workDir: string,
  files: { solutionCode: string; testsCode: string; files?: { path: string; code: string }[] },
): Promise<void> {
  await fs.writeFile(path.join(workDir, 'package.json'), JSON.stringify({ type: 'module' }), 'utf8');
  if (files.files && files.files.length > 0) {
    for (const f of files.files) {
      const full = path.join(workDir, f.path);
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, f.code, 'utf8');
    }
  } else {
    await fs.writeFile(path.join(workDir, 'solution.mjs'), files.solutionCode, 'utf8');
  }
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

/**
 * Extrai os checks INDIVIDUAIS do relatório spec do node:test (linhas
 * `✔ nome` / `✖ nome` — ONDA 1, checks por teste no veredito). Apenas as
 * linhas ANTES do resumo (`ℹ tests N`) contam: o relatório REPRIME cada teste
 * falho numa seção "failing tests:" no fim — sem truncar, cada falha entraria
 * DUAS vezes. O nome sai sem a duração traiçoeira (` (0.42175ms)`) e sem os
 * códigos ANSI (mesma limpeza do parseSpecCounts — o node:test pinta quando o
 * ambiente pede cor). Linhas ancoradas no INÍCIO da linha: subtests indentados
 * (`  ✔ filho`) nunca entram; o cabeçalho `✖ failing tests:` é filtrado
 * explicitamente (sem o resumo `ℹ tests N` — output truncado — ele NÃO é
 * cortado pelo truncamento e viraria um check sintético falso).
 */
export function parseSpecChecks(output: string): { name: string; passed: boolean }[] {
  const plain = output.replace(/\x1b\[[0-9;]*m/g, '');
  const lines = plain.split('\n');
  const summaryIdx = lines.findIndex((l) => /^ℹ tests /m.test(l));
  const head = (summaryIdx >= 0 ? lines.slice(0, summaryIdx) : lines).join('\n');
  const checks: { name: string; passed: boolean }[] = [];
  const re = /^[✔✖] (.+)$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(head)) !== null) {
    const raw = m[1].trim();
    if (!raw) continue;
    // tira a duração do fim ("caso 1 (0.42175ms)" → "caso 1").
    const name = raw.replace(/\s*\(\d+(?:\.\d+)?\s*m?s\)\s*$/, '');
    // DEFENSIVO (revisão adversarial): teste SEM nome (`test('')`) deixa só a
    // duração — sem fallback para a duração (não é um check de verdade).
    if (!name) continue;
    // Nomes SINTÉTICOS de falha de LOAD: quando o arquivo não carrega (sintaxe
    // no solution.mjs), o node:test trata O ARQUIVO como um teste e emite
    // `✖ test.mjs` (v24) / `✖ test failed` (v20) — não é um check de verdade;
    // a saída já traz o SyntaxError para o aluno ver. DEFENSIVO (revisão
    // adversarial): `✖ failing tests:` — sem a linha de resumo `ℹ tests N`
    // (output truncado), o cabeçalho vira um check sintético falso que
    // inflaria totalCount.
    if (/^test\.mjs$/.test(name) || /^tests? failed$/.test(name) || /^failing tests?:/.test(name)) continue;
    checks.push({ name, passed: m[0].charAt(0) === '✔' });
  }
  return checks;
}

export interface RunStudentCodeInput {
  /** código enviado pelo aluno (substitui o starter). */
  studentCode: string;
  /**
   * ADITIVO (rodada 9): código do aluno POR ARQUIVO (desafio multi-arquivo).
   * Presente → roda estes arquivos (studentCode ignorado); ausente → roda
   * studentCode como solution.mjs (comportamento atual).
   */
  files?: { path: string; code: string }[];
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
  /**
   * ADITIVO (onda1-ux): checks INDIVIDUAIS do relatório spec (nome + passou?).
   * Vazio quando a execução não chegou a rodar os testes (sintaxe, spawn).
   */
  checks: { name: string; passed: boolean }[];
  /** nº de checks que passaram. */
  passedCount: number;
  /** nº total de checks (0 quando o parse não achou linha real — erro de execução). */
  totalCount: number;
  /** erro de execução (spawn falhou, timeout etc.) — output tem o detalhe. */
  error?: string;
}

/** Roda o código do aluno contra os testes. Gate: exit 0 E igualdade de contagem. */
export async function runStudentCode(
  input: RunStudentCodeInput,
  exec: ExecFn = nodeExec,
): Promise<RunStudentCodeResult> {
  // FIX (revisão adversarial): defesa em profundidade — valida os paths dos
  // arquivos ANTES de criar o workdir. Este runner é usado pelo main E pelo
  // CLI; um path malicioso ('a/../../escape.mjs') escreveria FORA do workdir
  // (path.join resolve o '..' antes do writeFile). Nunca lança.
  if (input.files && input.files.some((f) => typeof f?.path !== 'string' || !SAFE_FILE_PATH_RE.test(f.path))) {
    return {
      passed: false,
      testsRun: 0,
      pass: 0,
      fail: 0,
      error: 'path inválido',
      checks: [],
      passedCount: 0,
      totalCount: 0,
      output: '',
    };
  }
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'track-submit-'));
  try {
    await prepareChallengeDir(work, {
      solutionCode: input.studentCode,
      testsCode: input.testsCode,
      files: input.files,
    });
    const res = await exec(work, ['--test', '--test-reporter=spec', 'test.mjs'], {
      timeoutMs: input.timeoutMs ?? 30_000,
    });
    const output = `${res.stdout}\n${res.stderr}`.trim();
    const counts = parseSpecCounts(output);
    const declared = countTestDeclarations(input.testsCode);
    const passed = res.code === 0 && counts.testsRun === input.expectedTestCount && declared === input.expectedTestCount;
    const checks = parseSpecChecks(output);
    // totalCount/passedCount vêm dos checks; se o parse não achou NENHUMA
    // linha real (ex.: erro de sintaxe — sobra só o `✖ test.mjs` sintético,
    // filtrado), caem nas contagens do resumo quando a execução foi limpa
    // (exit 0), senão 0 — a UI nunca mostra "N de M" inventado.
    const totalCount = checks.length > 0 ? checks.length : res.code === 0 ? counts.testsRun : 0;
    const passedCount = checks.length > 0 ? checks.filter((c) => c.passed).length : res.code === 0 ? counts.pass : 0;
    return {
      passed,
      testsRun: counts.testsRun,
      pass: counts.pass,
      fail: counts.fail,
      output,
      checks,
      passedCount,
      totalCount,
    };
  } catch (err) {
    return {
      passed: false,
      testsRun: 0,
      pass: 0,
      fail: 0,
      output: String(err),
      checks: [],
      passedCount: 0,
      totalCount: 0,
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
  /**
   * ADITIVO (rodada 9): desafio MULTI-ARQUIVO — arquivos da SOLUÇÃO e do
   * STARTER por caminho. Presentes → o par roda TODOS os arquivos de cada lado
   * (solutionCode/starterCode de topo ignorados); ausentes → arquivo único
   * solution.mjs (comportamento atual).
   */
  solutionFiles?: { path: string; code: string }[];
  starterFiles?: { path: string; code: string }[];
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
 * ADITIVO (rodada 9): monta o PAR solução/starter de um desafio — multi-arquivo
 * quando `files` presente (cada lado com TODOS os arquivos), senão arquivo
 * único solution.mjs. Função pura (sem disco) — implementação ÚNICA usada pelo
 * CLI de autoria (track:challenge:verify / track:validate) E pelo main. Antes
 * vivia no track-cli.ts; extraída aqui para o runner (módulo puro já testado)
 * e para o validate ter guarda automatizada.
 */
export function challengePairFromSource(challenge: TrackChallengeSource): ChallengePair {
  return {
    // `?? ''`: multi-arquivo (files presente) não carrega starter/solution de
    // topo — o verify usa os solutionFiles/starterFiles quando presentes.
    solutionCode: challenge.solutionCode ?? '',
    starterCode: challenge.starterCode ?? '',
    testsCode: challenge.testsCode,
    expectedTestCount: challenge.expectedTestCount,
    solutionFiles: challenge.files?.map((f) => ({ path: f.path, code: f.solutionCode })),
    starterFiles: challenge.files?.map((f) => ({ path: f.path, code: f.starterCode })),
  };
}

/**
 * Provas por execução de UM par solução/starter (filosofia do
 * challenge-verify.sh passos 1–2, sem mutação): solução passa com igualdade
 * de contagem E starter falha.
 */
export async function verifyChallengePair(pair: ChallengePair, exec: ExecFn = nodeExec): Promise<ChallengePairVerdict> {
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'track-verify-'));
  try {
    // ADITIVO (rodada 9): multi-arquivo — solução roda TODOS os arquivos;
    // starter idem. Sem files → solution.mjs único (comportamento atual).
    const solutionFiles: { path: string; code: string }[] =
      pair.solutionFiles && pair.solutionFiles.length > 0 ? pair.solutionFiles : [{ path: 'solution.mjs', code: pair.solutionCode }];
    const starterFiles: { path: string; code: string }[] =
      pair.starterFiles && pair.starterFiles.length > 0 ? pair.starterFiles : [{ path: 'solution.mjs', code: pair.starterCode }];

    await prepareChallengeDir(work, { solutionCode: pair.solutionCode, testsCode: pair.testsCode, files: solutionFiles });
    const sol = await exec(work, ['--test', '--test-reporter=spec', 'test.mjs'], { timeoutMs: 30_000 });
    const solCounts = parseSpecCounts(`${sol.stdout}\n${sol.stderr}`);
    const declared = countTestDeclarations(pair.testsCode);
    const solutionPasses = sol.code === 0 && solCounts.testsRun === pair.expectedTestCount && declared === pair.expectedTestCount;

    await prepareChallengeDir(work, { solutionCode: pair.starterCode, testsCode: pair.testsCode, files: starterFiles });
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
