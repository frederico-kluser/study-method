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
 * ADITIVO (P-31/A-P04-3): o ExecFn aceita `opts.env` como base do ambiente do
 * filho (default: `process.env` — comportamento do produto INALTERADO; quem
 * injeta é o provador F9, com o env endurecido do harness).
 * Verdict por EXECUÇÃO com gate de IGUALDADE:
 *   passed = exit 0 && testsRun === expectedTestCount
 * (exit code sozinho mente — arquivo de teste vazio sai 0; mesma armadilha
 * documentada em skills/study-method/references/languages.md).
 *
 * ONDA 5 — O QUE É POR LINGUAGEM VEM DO ADAPTADOR (`engine/lang/registry.ts`,
 * §6 de `docs/research/08-multilingua-trava-deterministica.md`): o binário do
 * runner (`detect().binary`), o layout dos arquivos em disco (`layout()`), o
 * regex de caminho seguro (`filePathPattern`), o comando de teste
 * (`testCommand`), a contagem DECLARADA (`countDeclared`) e os checks da UI
 * (`parseChecks`). A contagem declarada por REGEX que vivia aqui foi APAGADA:
 * o repositório tinha TRÊS implementações de "contar testes declarados" com
 * DUAS semânticas, e a divergência era medida — um `// test(` comentado fazia
 * o validador semântico entrar em retry e devolver erro de JSON inválido para
 * sempre (`docs/16-engine-de-trilha.md` §5.3: "Uma única função de contagem de
 * testes, por AST"). Sobrou UMA, por AST, alcançada por `adapter.countDeclared`.
 *
 * ⚠ DEFEITO CONHECIDO DA COSTURA, FORA DESTE ARQUIVO (medido, não suposto).
 * `engine/lang/javascript.ts` alcança as implementações de `countDeclared`,
 * `countRun`, `parseChecks` e `failureExitCodes.meaning` por `require`
 * POSTERGADO com caminho RELATIVO (`carregar('../extract')`,
 * `carregar('../../services/challengeExec')`, `carregar('../exec/proofs')`).
 * Rollup não enxerga `require(variável)`, então o bundle do main mantém a
 * string literal — e, resolvida a partir de `out/main/index.js`, ela aponta
 * para `out/extract` / `services/challengeExec`, que NÃO existem. Medido:
 *
 *   npm run build && cd app/out/main \
 *     && node -e "require('../exec/proofs')"   # MODULE_NOT_FOUND
 *
 * Consequência: rodando DO FONTE (suíte, `npm run engine`, `npm run track`) a
 * delegação funciona; no main EMPACOTADO (`npm run dev`, app instalado) esses
 * membros LANÇAM. As DUAS chamadas afetadas no produto são as deste arquivo
 * (`runStudentCode` e `verifyChallengePair`) — `verifyChallengeProofs` e a F9
 * não entram no bundle do main (são caminho de CLI, rodam sob tsx).
 *
 * E o conserto NÃO é "trocar por import estático", porque o `require`
 * postergado é LOAD-BEARING de peso: `../extract` puxa o compilador TypeScript
 * inteiro, e medido no bundle de hoje nem `extract` nem `typescript` estão em
 * `out/main/index.js` (414 KB). O conserto precisa ser BUNDLER-AWARE — por
 * exemplo, promover `typescript` a dependência de runtime externalizada e
 * deixar o Rollup enxergar o `require` (literal no ponto de chamada, não por
 * variável). É decisão de quem é dono de `lang/javascript.ts`; está registrada
 * no handoff da onda como bloqueio, com o comando que a reproduz.
 */

import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawn } from 'node:child_process';

import { TrackChallengeSource } from '../content/trackTypes';
import { defaultAdapter, type LanguageAdapter } from '../engine/lang/registry';

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * ADITIVO (P-31/A-P04-3): `opts.env` é a BASE do ambiente do processo filho
 * quando presente (`nodeExec` usa `opts.env ?? process.env` — default
 * INALTERADO: o caminho do produto segue usando `process.env`; o caminho F9
 * injeta o env ENDURECIDO do harness). Tipo do executor — o aditivo é só
 * isso: um slot opcional no opts.
 */
export type ExecFn = (
  dir: string,
  args: string[],
  opts?: { timeoutMs?: number; env?: NodeJS.ProcessEnv },
) => Promise<ExecResult>;

/**
 * Binário do NODE a usar nos processos filhos.
 *
 * ONDA 5: a IMPLEMENTAÇÃO mudou de casa — vive em `LanguageAdapter.detect()`
 * (`lang/javascript.ts`, `jsDetect`/`jsNodeBinary`), que é o membro 15 do §6
 * ("`command -v` + versão, e a mensagem de degradação"). A regra continua a
 * mesma: DENTRO DO ELECTRON, `process.execPath` é o binário do Electron (que
 * não entende `--test` e travaria) — usa o node do PATH (`npm_node_execpath`
 * quando o app roda via npm, senão `node`); em node puro (testes/CLI) usa o
 * processo atual. O símbolo continua exportado porque a suíte de paridade do
 * registro o compara com `detect().binary`.
 */
export function nodeBinary(): string {
  return defaultAdapter().detect().binary;
}

/** Exec real de `node --test` num diretório (DI injeta fake nos testes). */
export const nodeExec: ExecFn = (dir, args, opts) =>
  new Promise((resolve) => {
    // NODE_TEST_CONTEXT é setado pelo node:test do processo PAI (quando esta
    // app roda sob o runner de testes); herdado pelo filho, faz o node:test
    // do filho acreditar que já está dentro de um runner e PULAR os arquivos
    // (exit 0 sem testar nada — o furo de "exit code sozinho mente" de
    // languages.md). Remove sempre do ambiente do filho.
    // ADITIVO (P-31/A-P04-3): o env do filho parte de `opts.env` quando o
    // chamador injeta (o provador F9 passa o env endurecido do harness — sem
    // NODE_TEST_CONTEXT/proxies/NODE_OPTIONS/FORCE_COLOR, com NO_PROXY=*);
    // SEM opts.env o comportamento é o de sempre: process.env.
    const env = { ...(opts?.env ?? process.env) };
    delete env.NODE_TEST_CONTEXT;
    const child = spawn(defaultAdapter().detect().binary, args, {
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
 * Prepara o diretório de execução com os arquivos que o ADAPTADOR manda
 * escrever, na ordem que ele manda (§6, membro 7 — `layout(challenge)`).
 * Em JavaScript isso é `package.json {type:'module'}` + o código do aluno
 * (arquivo único `solution.mjs`, ou os `files` do desafio multi-arquivo, com
 * mkdir dos subdirs) + `test.mjs` — exatamente o que esta função escrevia à
 * mão antes da onda 5, agora sem nenhum nome de arquivo hardcoded aqui.
 */
export async function prepareChallengeDir(
  workDir: string,
  files: { solutionCode: string; testsCode: string; files?: { path: string; code: string }[] },
  adapter: LanguageAdapter = defaultAdapter(),
): Promise<void> {
  const layout = adapter.layout({
    code: files.solutionCode,
    files: files.files,
    testsCode: files.testsCode,
  });
  for (const arquivo of layout.files) {
    const full = path.join(workDir, arquivo.path);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, arquivo.content, 'utf8');
  }
}

/**
 * Extrai as contagens do relatório spec do node:test (linhas `ℹ tests N`).
 * O relatório pode chegar COM códigos ANSI (`\x1b[34mℹ tests 3\x1b[39m` —
 * o node:test pinta quando o ambiente pede cor, ex.: FORCE_COLOR herdado do
 * runner do Playwright): os escapes são removidos ANTES do match — senão a
 * linha "não começa com ℹ" e a contagem vira 0 (gate de igualdade derruba
 * um resultado que passou).
 *
 * DUPLICAÇÃO CONHECIDA E DECLARADA (onda 5 — NÃO resolvida aqui de propósito).
 * Esta função é a SEGUNDA implementação de `LanguageAdapter.countRun` (§6,
 * membro 11) que sobra no repositório; a primeira é `parseSpecCounts` de
 * `engine/exec/proofs.ts`, para onde `adapter.countRun` delega. As duas NÃO
 * são equivalentes: a de `proofs.ts` lê o ÚLTIMO bloco de resumo (defesa
 * contra RELATÓRIO FORJADO — o código sob teste pode imprimir
 * `console.log('ℹ tests 2\nℹ pass 2\nℹ fail 0')` no próprio stdout) e conta
 * `skipped`; esta lê a PRIMEIRA ocorrência e ignora `skipped`. Ou seja: o
 * caminho do ALUNO (`runStudentCode`) não tem a defesa que o caminho das
 * PROVAS tem. Trocar esta função por `adapter.countRun` muda o veredito
 * mostrado ao aluno e por isso ficou FORA do escopo desta sub-tarefa — está
 * escrito aqui para não virar dívida invisível.
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
 *
 * ONDA 5 — QUEM CHAMA MUDOU. Esta é a implementação JAVASCRIPT de
 * `LanguageAdapter.parseChecks` (§6, membro 12): `lang/javascript.ts`
 * (`jsParseChecks`) delega a ela, e `runStudentCode` passou a chamar
 * `adapter.parseChecks`. Continua exportada porque é o corpo do membro do
 * adaptador; um adaptador de outra linguagem traz o seu (o formato `✔`/`✖`
 * é do relatório spec do node:test, não é universal).
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
  adapter: LanguageAdapter = defaultAdapter(),
): Promise<RunStudentCodeResult> {
  // FIX (revisão adversarial): defesa em profundidade — valida os paths dos
  // arquivos ANTES de criar o workdir. Este runner é usado pelo main E pelo
  // CLI; um path malicioso ('a/../../escape.mjs') escreveria FORA do workdir
  // (path.join resolve o '..' antes do writeFile). Nunca lança.
  // ONDA 5: o regex é o `filePathPattern` do adaptador (§6 obs. 1) — travá-lo
  // em `.mjs` aqui impediria qualquer outra linguagem de existir.
  if (input.files && input.files.some((f) => typeof f?.path !== 'string' || !adapter.filePathPattern.test(f.path))) {
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
    await prepareChallengeDir(
      work,
      { solutionCode: input.studentCode, testsCode: input.testsCode, files: input.files },
      adapter,
    );
    const res = await exec(work, [...adapter.testCommand], {
      timeoutMs: input.timeoutMs ?? 30_000,
    });
    const output = `${res.stdout}\n${res.stderr}`.trim();
    const counts = parseSpecCounts(output);
    // A contagem DECLARADA é a ÚNICA do repositório (por AST, via o adaptador):
    // a regex que vivia neste arquivo foi apagada na onda 5.
    const declared = adapter.countDeclared(input.testsCode);
    const passed = res.code === 0 && counts.testsRun === input.expectedTestCount && declared === input.expectedTestCount;
    const checks = adapter.parseChecks(output);
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
export async function verifyChallengePair(
  pair: ChallengePair,
  exec: ExecFn = nodeExec,
  adapter: LanguageAdapter = defaultAdapter(),
): Promise<ChallengePairVerdict> {
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'track-verify-'));
  try {
    // ADITIVO (rodada 9): multi-arquivo — solução roda TODOS os arquivos;
    // starter idem. Sem files → o `layout()` do adaptador decide o arquivo
    // único (em JavaScript, `solution.mjs`) — nenhum nome hardcoded aqui.
    const solutionFiles = pair.solutionFiles && pair.solutionFiles.length > 0 ? pair.solutionFiles : undefined;
    const starterFiles = pair.starterFiles && pair.starterFiles.length > 0 ? pair.starterFiles : undefined;
    const testArgs = [...adapter.testCommand];

    await prepareChallengeDir(work, { solutionCode: pair.solutionCode, testsCode: pair.testsCode, files: solutionFiles }, adapter);
    const sol = await exec(work, testArgs, { timeoutMs: 30_000 });
    const solCounts = parseSpecCounts(`${sol.stdout}\n${sol.stderr}`);
    const declared = adapter.countDeclared(pair.testsCode);
    const solutionPasses = sol.code === 0 && solCounts.testsRun === pair.expectedTestCount && declared === pair.expectedTestCount;

    await prepareChallengeDir(work, { solutionCode: pair.starterCode, testsCode: pair.testsCode, files: starterFiles }, adapter);
    const stub = await exec(work, testArgs, { timeoutMs: 30_000 });
    const starterFails = adapter.failureExitCodes.isFailure(stub.code);

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
