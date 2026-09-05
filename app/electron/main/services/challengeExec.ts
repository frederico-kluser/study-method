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
 * ONDA 6 — DOIS DEFEITOS FECHADOS AQUI, e vale registrar quais eram.
 *
 * 1. O MAIN EMPACOTADO QUEBRAVA NA SUBMISSÃO DO ALUNO. `engine/lang/javascript.ts`
 *    alcançava `countDeclared`/`countRun`/`parseChecks`/`failureExitCodes.meaning`
 *    por `require` POSTERGADO com caminho RELATIVO (`carregar('../extract')`,
 *    `carregar('../../services/challengeExec')`, `carregar('../exec/proofs')`).
 *    Rollup não enxerga `require(variável)`: a string sobrevivia literal ao
 *    bundle e, resolvida a partir de `out/main/index.js`, apontava para
 *    `out/extract` e `out/services/challengeExec`, que não existem. Rodando DO
 *    FONTE (suíte, `npm run engine`, `npm run track`) tudo funcionava; no app
 *    empacotado, `runStudentCode` e `verifyChallengePair` — as duas chamadas
 *    deste arquivo, e as únicas do produto — lançavam MODULE_NOT_FOUND. O
 *    conserto foi inverter a seta: as implementações mudaram de casa para o
 *    adaptador (um módulo FOLHA), este arquivo e `exec/proofs.ts` REEXPORTAM de
 *    lá, e `typescript` virou `dependency` para o Rollup poder externalizá-lo
 *    (e para o electron-builder empacotá-lo). Ver o cabeçalho de
 *    `engine/lang/javascript.ts`.
 *
 * 2. O CAMINHO DO ALUNO NÃO TINHA A DEFESA CONTRA RELATÓRIO FORJADO. A
 *    `parseSpecCounts` deste arquivo lia a PRIMEIRA linha `ℹ tests N`; a das
 *    provas lê o ÚLTIMO bloco. Código do aluno que imprime um resumo falso
 *    antes do real enganava a primeira e não a segunda. Foi apagada; as duas
 *    pontas agora usam `adapter.countRun`. Detalhe na nota acima de
 *    `parseSpecChecks`.
 *
 * ─── ONDA 2 (python-roda): A LINGUAGEM DO DESAFIO ATRAVESSA O ARQUIVO ───────
 *
 * O DEFEITO, medido pelo caminho de produção. A onda 5 pôs o adaptador em
 * TODAS as decisões por linguagem deste arquivo — layout, args de teste, as
 * duas contagens, regex de path — e deixou de fora a única coisa que decide
 * QUAL adaptador: `challengePairFromSource` não copiava `challenge.language`, e
 * as três funções públicas defaultavam para `defaultAdapter()` (javascript). O
 * resultado, reproduzido pelo handler REAL de `track:challenge-submit`: o aluno
 * digitava `print("oi")` — a SOLUÇÃO DE REFERÊNCIA da trilha `python` — e
 * recebia `passed:false`, `checks:[]` e `SyntaxError: Unexpected token
 * 'import'`, porque o `test.mjs` que o layout do JavaScript escreveu continha
 * código Python e foi entregue ao `node --test`. Uma raiz, seis consumidores.
 *
 * A CORREÇÃO, e o formato dela. `language` viaja no DADO (`RunStudentCodeInput
 * .language`, `ChallengePair.language`) e é resolvida por `adapterDoDesafio`
 * (`engine/exec/proofs.ts` — a MESMA função das provas F9; fail-closed: token
 * declarado e desconhecido LANÇA, token ausente cai no default). Os parâmetros
 * `exec`/`adapter` deixaram de ter valor default e passaram a ser OPCIONAIS:
 *
 *   - chamador que passa adaptador  → manda ele, como antes (a suíte faz isso);
 *   - chamador que passa exec       → manda ele, como antes (DI dos fakes);
 *   - chamador que não passa nada   → o adaptador vem de `language`, e o exec
 *     vem de `criarExecDeLinguagem(adaptador)` — o binário CERTO.
 *
 * JAVASCRIPT NÃO REGRIDE, e é verificável linha a linha: `language` ausente ⇒
 * `adapterDoDesafio(undefined)` = `defaultAdapter()` = javascript, e
 * `criarExecDeLinguagem(javascript)` é literalmente o corpo do `nodeExec`. As
 * trilhas do disco dizem `"language": "nodejs"`, que o registro resolve para o
 * MESMO adaptador javascript.
 */

import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawn } from 'node:child_process';

import { TrackChallengeSource } from '../content/trackTypes';
import { defaultAdapter, type LanguageAdapter } from '../engine/lang/registry';
// A resolução token → adaptador é a das PROVAS (`adapterDoDesafio`), não uma
// segunda cópia: o repositório já pagou caro por ter duas semânticas para a
// mesma pergunta (ver a nota da onda 5 sobre a contagem de testes). Importar
// daqui não fecha ciclo — `engine/exec/proofs.ts` só importa `lang/registry` e
// `exec/typesCheck`, e nenhum dos dois alcança este arquivo.
import { adapterDoDesafio } from '../engine/exec/proofs';

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

/**
 * Exec real num diretório, com o BINÁRIO DO ADAPTADOR da linguagem (§6 membro
 * 15 — `detect()`), e não com o do adaptador default.
 *
 * POR QUE A FÁBRICA EXISTE (defeito MEDIDO). `nodeExec` resolvia
 * `defaultAdapter().detect().binary` — o binário do NODE — para QUALQUER
 * desafio. Num desafio de Python o provador oficial (`phases/f9Verifier.ts`)
 * montava os args do adaptador certo e os entregava ao binário errado; a saída
 * medida era `node: bad option: -B` / `bad option: -m`, exit 9, zero teste
 * executado. O gate não aprovava por omissão (a prova reprova), mas também
 * nunca MEDIA nada. A linguagem passa a decidir o binário aqui.
 */
export function criarExecDeLinguagem(adapter: LanguageAdapter = defaultAdapter()): ExecFn {
  return (dir, args, opts) =>
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
    const child = spawn(adapter.detect().binary, args, {
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
}

/**
 * Exec real de `node --test` num diretório (DI injeta fake nos testes).
 * É `criarExecDeLinguagem` com o adaptador DEFAULT, resolvido a cada chamada
 * (como antes): o símbolo público e o comportamento de JavaScript não mudam.
 */
export const nodeExec: ExecFn = (dir, args, opts) =>
  criarExecDeLinguagem(defaultAdapter())(dir, args, opts);

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
 * Contagem EXECUTADA (`ℹ tests/pass/fail/skipped`) e checks INDIVIDUAIS
 * (`✔`/`✖`) do relatório spec do node:test.
 *
 * ONDA 6 — AS DUAS IMPLEMENTAÇÕES SAÍRAM DAQUI, e por motivos diferentes.
 *
 * `parseSpecCounts` foi APAGADA, não movida. Ela era a SEGUNDA implementação de
 * `LanguageAdapter.countRun` no repositório e era MAIS FRACA que a primeira: lia
 * a PRIMEIRA linha `ℹ tests N` do output e ignorava `skipped`. A consequência
 * não era estética — era uma diferença de DEFESA. O código do aluno roda no
 * mesmo processo que imprime o relatório, então ele pode forjar um resumo:
 *
 *     console.log('ℹ tests 5\nℹ pass 5\nℹ fail 0');   // no topo do solution.mjs
 *
 * O resumo do runner REAL sai depois de todo stdout do código sob teste, ou
 * seja, por ÚLTIMO. Lendo a PRIMEIRA ocorrência, esta função entregava a forja;
 * lendo o ÚLTIMO bloco (o que `adapter.countRun` faz), entrega o runner. O
 * caminho das PROVAS já tinha a defesa; o caminho que o ALUNO vê, não. Agora
 * `runStudentCode` e `verifyChallengePair` chamam `adapter.countRun` — a mesma
 * função das provas, o mesmo veredito.
 *
 * `parseSpecChecks` MUDOU DE CASA para `engine/lang/javascript.ts`
 * (`jsParseChecks`, o membro 12 do §6) e é REEXPORTADA daqui — a assinatura e o
 * comportamento não mudam. O motivo é o bundle: o adaptador a alcançava por
 * `require('../../services/challengeExec')`, um caminho RELATIVO que o Rollup
 * não enxerga; resolvido a partir de `out/main/index.js` ele apontava para
 * `out/services/challengeExec`, inexistente, e o main EMPACOTADO lançava
 * MODULE_NOT_FOUND exatamente quando o aluno apertava "verificar". O caminho
 * relativo ainda fechava o ciclo `challengeExec → registry → javascript →
 * challengeExec`, que só não explodia por ser postergado.
 */
export { jsParseChecks as parseSpecChecks } from '../engine/lang/javascript';

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
  /**
   * ADITIVO (onda2-python-roda): o `challenge.language` do desafio submetido —
   * o token do disco (`'nodejs'`, `'python'`, …), não o id do adaptador. É ele
   * que decide layout, binário, args e contagens. AUSENTE = adaptador default
   * (javascript), que é o que as trilhas antigas significam.
   *
   * Por que no INPUT e não num parâmetro: o parâmetro `adapter` já existia e
   * ninguém o passava — `ipc/track-handlers.ts` chamava `runStudentCode({...})`
   * e pronto. Um dado que precisa atravessar seis chamadores viaja melhor no
   * objeto que já atravessa todos eles do que num terceiro argumento posicional
   * que é fácil esquecer (e foi).
   */
  language?: string | null;
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

/** Resultado vazio de falha — a forma que a UI sabe ler (nunca "N de M" inventado). */
function resultadoDeErro(mensagem: string, output = ''): RunStudentCodeResult {
  return {
    passed: false,
    testsRun: 0,
    pass: 0,
    fail: 0,
    error: mensagem,
    checks: [],
    passedCount: 0,
    totalCount: 0,
    output,
  };
}

/** Roda o código do aluno contra os testes. Gate: exit 0 E igualdade de contagem. */
export async function runStudentCode(
  input: RunStudentCodeInput,
  exec?: ExecFn,
  adapter?: LanguageAdapter,
): Promise<RunStudentCodeResult> {
  // ONDA 2 (python-roda): o adaptador sai da LINGUAGEM DO DESAFIO quando o
  // chamador não impõe um. `adapterDoDesafio` LANÇA em token desconhecido
  // (fail-closed do registro) — e `runStudentCode` NUNCA lança para o chamador
  // (o handler IPC do aluno depende disso), então a resolução vira erro
  // estruturado aqui, antes de qualquer escrita em disco.
  let adaptador: LanguageAdapter;
  try {
    adaptador = adapter ?? adapterDoDesafio(input.language);
  } catch (err) {
    return resultadoDeErro(String(err), String(err));
  }
  // O exec default é o DA LINGUAGEM (binário do `detect()` do adaptador), não
  // o `nodeExec`: era este default que entregava um desafio Python ao node.
  const rodar = exec ?? criarExecDeLinguagem(adaptador);
  // FIX (revisão adversarial): defesa em profundidade — valida os paths dos
  // arquivos ANTES de criar o workdir. Este runner é usado pelo main E pelo
  // CLI; um path malicioso ('a/../../escape.mjs') escreveria FORA do workdir
  // (path.join resolve o '..' antes do writeFile). Nunca lança.
  // ONDA 5: o regex é o `filePathPattern` do adaptador (§6 obs. 1) — travá-lo
  // em `.mjs` aqui impediria qualquer outra linguagem de existir.
  if (input.files && input.files.some((f) => typeof f?.path !== 'string' || !adaptador.filePathPattern.test(f.path))) {
    return resultadoDeErro('path inválido');
  }
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'track-submit-'));
  try {
    await prepareChallengeDir(
      work,
      { solutionCode: input.studentCode, testsCode: input.testsCode, files: input.files },
      adaptador,
    );
    const res = await rodar(work, [...adaptador.testCommand], {
      timeoutMs: input.timeoutMs ?? 30_000,
    });
    const output = `${res.stdout}\n${res.stderr}`.trim();
    // A contagem EXECUTADA vem do adaptador (§6, membro 11) — a MESMA função
    // das provas, que lê o ÚLTIMO bloco de resumo. A cópia fraca que vivia
    // neste arquivo (primeira linha `ℹ tests N`) aceitava relatório forjado.
    const counts = adaptador.countRun(output);
    // A contagem DECLARADA é a ÚNICA do repositório (por AST, via o adaptador):
    // a regex que vivia neste arquivo foi apagada na onda 5.
    const declared = adaptador.countDeclared(input.testsCode);
    const passed = res.code === 0 && counts.testsRun === input.expectedTestCount && declared === input.expectedTestCount;
    const checks = adaptador.parseChecks(output);
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
    return resultadoDeErro(String(err), String(err));
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
  /**
   * ADITIVO (onda2-python-roda): o `challenge.language` da FONTE. Sem ele o par
   * chegava ao verificador sem identidade e todo desafio era provado com o
   * runner de JavaScript — inclusive os 21 desafios Python da trilha, que
   * `track:validate` reportava como `NÃO VERIFICADO ✗` (e, até esta onda,
   * ainda assim saía 0). Ausente = adaptador default.
   */
  language?: string | null;
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
    // ONDA 2 (python-roda): A LINHA QUE FALTAVA. O campo é obrigatório no
    // schema do desafio (`validateChallengeSource` reprova quem não o declara),
    // então ele SEMPRE existe na fonte — era só aqui que ele morria.
    language: challenge.language,
  };
}

/**
 * Provas por execução de UM par solução/starter (filosofia do
 * challenge-verify.sh passos 1–2, sem mutação): solução passa com igualdade
 * de contagem E starter falha.
 */
export async function verifyChallengePair(
  pair: ChallengePair,
  exec?: ExecFn,
  adapter?: LanguageAdapter,
): Promise<ChallengePairVerdict> {
  // ONDA 2 (python-roda): mesmo desenho de `runStudentCode` — adaptador e
  // binário saem de `pair.language` quando o chamador não impõe. Diferença de
  // contrato deliberada: esta função PODE lançar (já lançava em mkdtemp/spawn),
  // e um token de linguagem desconhecido lança aqui em vez de virar veredito.
  // Quem chama (o CLI de autoria e o regenerador) trata a exceção como
  // reprovação — nunca como aprovação por omissão.
  const adaptador = adapter ?? adapterDoDesafio(pair.language);
  const rodar = exec ?? criarExecDeLinguagem(adaptador);
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'track-verify-'));
  try {
    // ADITIVO (rodada 9): multi-arquivo — solução roda TODOS os arquivos;
    // starter idem. Sem files → o `layout()` do adaptador decide o arquivo
    // único (em JavaScript, `solution.mjs`) — nenhum nome hardcoded aqui.
    const solutionFiles = pair.solutionFiles && pair.solutionFiles.length > 0 ? pair.solutionFiles : undefined;
    const starterFiles = pair.starterFiles && pair.starterFiles.length > 0 ? pair.starterFiles : undefined;
    const testArgs = [...adaptador.testCommand];

    await prepareChallengeDir(work, { solutionCode: pair.solutionCode, testsCode: pair.testsCode, files: solutionFiles }, adaptador);
    const sol = await rodar(work, testArgs, { timeoutMs: 30_000 });
    const solCounts = adaptador.countRun(`${sol.stdout}\n${sol.stderr}`);
    const declared = adaptador.countDeclared(pair.testsCode);
    const solutionPasses = sol.code === 0 && solCounts.testsRun === pair.expectedTestCount && declared === pair.expectedTestCount;

    await prepareChallengeDir(work, { solutionCode: pair.starterCode, testsCode: pair.testsCode, files: starterFiles }, adaptador);
    const stub = await rodar(work, testArgs, { timeoutMs: 30_000 });
    const starterFails = adaptador.failureExitCodes.isFailure(stub.code);

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
