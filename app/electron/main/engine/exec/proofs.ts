/**
 * app/electron/main/engine/exec/proofs.ts — as QUATRO PROVAS de execução de um
 * desafio (`docs/16-engine-de-trilha.md` §5.4). Um desafio só é válido por
 * EXECUÇÃO, e por quatro provas, não duas:
 *
 *   1. a solução de referência PASSA em todos os testes;
 *   2. o `starterCode` FALHA;
 *   3. o número de testes executados BATE com `expectedTestCount`;
 *   4. um stub vazio FALHA (protege contra teste tautológico).
 *
 * TODO o design deste arquivo obedece a duas leis do plano de execução:
 *
 *   - A-P07-2 — ExecFn INJETÁVEL: a execução (roda um arquivo de teste e
 *     devolve {exitCode, stdout, stderr}) é uma dependência injetada. Os
 *     julgadores abaixo são FUNÇÕES PURAS sobre `ExecResult` + contagens; a
 *     suíte de testes NÃO gera processo real (usa executor fake). O
 *     orquestrador `verifyChallengeProofs` também só toca o mundo via as
 *     funções injetadas (`env.prepare` / `env.exec` / `env.cleanup`).
 *   - FAIL-CLOSED (regra 1 do plano): qualquer sinal de dúvida — exit 0 com
 *     ZERO testes executados, contagem divergente, stub vazio que passou,
 *     exceção na infraestrutura — derruba o veredito como inválido, com a
 *     prova que falhou e o porquê.
 *
 * As armadilhas medidas são tratadas AQUI nas provas (as de execução ficam no
 * harness):
 *
 *   - exit code sozinho mente (arquivo de teste vazio / glob vazio saem 0):
 *     provas 1 e 3 exigem testsRun > 0 — "exit 0 com zero testes executados"
 *     é FALHA, não sucesso.
 *   - ANSI no relatório quebra o regex de contagem: `parseSpecCounts` sanitiza
 *     códigos de escape ANTES do match (o node:test pinta quando o ambiente
 *     pede cor — FORCE_COLOR herdado do runner).
 *   - RELATÓRIO FORJADO (CRITICAL): o código sob teste pode imprimir um resumo
 *     spec FALSO no próprio stdout (ex.: `console.log('ℹ tests 2\nℹ pass 2\nℹ
 *     fail 0')`) — até com `process.exit(0)` para matar o runner antes dos
 *     testes. `parseSpecCounts` lê o ÚLTIMO bloco de resumo: o do runner real
 *     vem SEMPRE depois de qualquer stdout do código sob teste. E a prova 1
 *     exige consistência interna ESTRITA (fail 0 E skipped 0 E pass ===
 *     testsRun) — um teste skipado NÃO é "passou em todos os testes". O vetor
 *     `process.exit/process.abort` é fechado no HARNESS (`escreverExitGuard`,
 *     passado via `--require` pelo executor real).
 *   - timeout devolve 137, que também é OOM: `exitCodeMeaning(137)` é
 *     literalmente "timeout-ou-OOM" — nunca afirmamos qual dos dois.
 *   - NODE_TEST_CONTEXT herdado faz o filho pular tudo e sair 0: a remoção é
 *     do HARNESS (`buildChildEnv` em harness.ts) — a prova fica lá.
 *
 * A contagem DECLARADA usa `countTestDeclarations` de `../extract` — a ÚNICA
 * função do repositório, por AST (`§5.3`): comentário não é nó, e um
 * `// test(` comentado não conta (as outras duas implementações do repo quebram
 * exatamente aí, com retry para sempre no validador semântico).
 */

import { countTestDeclarations } from '../extract';

// ---------------------------------------------------------------------------
// Contrato de execução (A-P07-2 — injetável, a suíte nunca gera processo)
// ---------------------------------------------------------------------------

export interface ExecResult {
  /** exit code do processo. 137 = timeout-ou-OOM (ambiguidade NÃO resolvida aqui). */
  exitCode: number;
  stdout: string;
  stderr: string;
}

/** Roda um arquivo de teste e devolve o resultado bruto. Injetada nos testes. */
export type ExecFn = (
  dir: string,
  args: string[],
  opts?: { timeoutMs?: number; env?: NodeJS.ProcessEnv },
) => Promise<ExecResult>;

/** Args canônicos do runner: `node --test` com relatório spec, arquivo único. */
export const SPEC_TEST_ARGS: readonly string[] = ['--test', '--test-reporter=spec', 'test.mjs'];

/** Saída combinada (stdout + stderr) — é o que um relatório spec real deixa. */
export function execOutput(res: ExecResult): string {
  return `${res.stdout}\n${res.stderr}`.trim();
}

// ---------------------------------------------------------------------------
// Parser do relatório spec (executado) — tolerante a ANSI
// ---------------------------------------------------------------------------

export interface SpecCounts {
  testsRun: number;
  pass: number;
  fail: number;
  /** linhas `ℹ skipped N` do resumo — a prova 1 exige 0 (passagem integral). */
  skipped: number;
}

/**
 * Extrai as contagens do ÚLTIMO bloco de resumo spec do node:test (linhas
 * `ℹ tests N` …).
 *
 * POR QUE O ÚLTIMO: o código sob teste pode imprimir um resumo spec FORJADO no
 * próprio stdout (CRITICAL 1 — `console.log('ℹ tests 2\nℹ pass 2\nℹ fail 0')`
 * no topo do módulo, de olho no parser que confiava na PRIMEIRA ocorrência).
 * O resumo do runner REAL é emitido por último, depois de todo stdout do
 * código sob teste (testes rodam, depois o runner imprime o fechamento) — o
 * último bloco é, por construção, o do runner. Bloco = da última linha
 * `ℹ tests N` até o fim (as seções posteriores — `✖ failing tests:` — não têm
 * linhas `ℹ` de resumo).
 *
 * Formato tolerado nas DUAS variantes que o node:test emite: bloco COMPLETO
 * (`tests/suites/pass/fail/cancelled/skipped/todo/duration_ms`) e bloco MÍNIMO
 * (`tests/pass/fail`, como nos fixtures), com ou sem códigos ANSI — os escapes
 * são removidos ANTES do bloco (`\x1b[34mℹ tests 3\x1b[39m` — o node:test pinta
 * quando o ambiente pede cor; senão a linha "não começa com ℹ" e a contagem
 * viraria 0, derrubando o gate de um resultado que passou). Linha ausente em
 * qualquer posição ⇒ 0 (fail-closed: sem relatório não há como provar que algo
 * rodou).
 */
export function parseSpecCounts(output: string): SpecCounts {
  const plain = output.replace(/\x1b\[[0-9;]*m/g, '');
  const lines = plain.split('\n');

  // varre TODAS as linhas e guarda o índice + match da ÚLTIMA `ℹ tests N`.
  let summaryIdx = -1;
  let summaryMatch: RegExpExecArray | null = null;
  for (let i = 0; i < lines.length; i += 1) {
    const m = /^ℹ tests\s+(\d+)/.exec(lines[i]);
    if (m) {
      summaryIdx = i;
      summaryMatch = m;
    }
  }

  if (summaryIdx === -1 || summaryMatch === null) {
    return { testsRun: 0, pass: 0, fail: 0, skipped: 0 };
  }

  const testsRun = Number(summaryMatch[1]);
  // pass/fail/skipped são lidos DENTRO do último bloco (primeira ocorrência a
  // partir da linha do resumo) — nunca de blocos anteriores/não-relacionados.
  const blockLines = lines.slice(summaryIdx);
  const valueInBlock = (re: RegExp): number => {
    for (const line of blockLines) {
      const m = re.exec(line);
      if (m) return Number(m[1]);
    }
    return 0;
  };
  const pass = valueInBlock(/^ℹ pass\s+(\d+)/);
  const fail = valueInBlock(/^ℹ fail\s+(\d+)/);
  const skipped = valueInBlock(/^ℹ skipped\s+(\d+)/);
  return { testsRun, pass, fail, skipped };
}

/**
 * Classificação HONESTA de um exit code para as mensagens das provas.
 * 137 (SIGKILL) não distingue timeout de OOM — devolve exatamente
 * "timeout-ou-OOM" e o chamador nunca afirma qual dos dois.
 */
export function exitCodeMeaning(exitCode: number): string {
  if (exitCode === 137) return 'timeout-ou-OOM';
  return `exit ${exitCode}`;
}

// ---------------------------------------------------------------------------
// As quatro provas — julgadores puros
// ---------------------------------------------------------------------------

export type ProofId = 'solutionPasses' | 'starterFails' | 'countMatches' | 'emptyStubFails' | 'execError';

export interface ProofJudgement {
  /** qual prova foi julgada. */
  proof: ProofId;
  /** passou? */
  passed: boolean;
  /** por quê — mensagem precisa, voltada a quem escreve o desafio. */
  reason?: string;
  /** contexto numérico da falha (exitCode, contagens). */
  detail?: Readonly<Record<string, unknown>>;
}

/** Conteúdo do stub vazio: módulo ESM válido SEM nenhuma exportação. */
export const EMPTY_STUB_CODE = 'export {};\n';

/**
 * PROVA 1 — a solução de referência PASSA EM TODOS os testes (passagem
 * INTEGRAL — um teste skipado/cancelado que não rodou não é "passou").
 *
 * Armadilha medida: exit code sozinho não distingue "passou" de "nada rodou"
 * (arquivo de teste vazio sai 0; glob vazio no `node --test` sai 0). Por isso
 * a prova exige, além de exit 0:
 *   - ao menos UM teste executado (exit 0 sem relatório é FALHA);
 *   - consistência interna ESTRITA do relatório: fail === 0 E skipped === 0 E
 *     pass === testsRun (defesa contra relatório forjado/parcial — HIGH 2: um
 *     `test.skip` produz `tests 2/pass 1/fail 0/skipped 1`, que NÃO é
 *     passagem integral);
 *   - igualdade com o esperado (defesa em profundidade — se o relatório
 *     mente, a igualdade segura; a dona oficial da contagem é a prova 3,
 *     `judgeCountMatches`).
 */
export function judgeSolutionPasses(res: ExecResult, expectedTestCount: number): ProofJudgement {
  const counts = parseSpecCounts(execOutput(res));
  if (res.exitCode !== 0) {
    return {
      proof: 'solutionPasses',
      passed: false,
      reason: `solução de referência não passou: ${exitCodeMeaning(res.exitCode)}`,
      detail: { exitCode: res.exitCode, testsRun: counts.testsRun, expectedTestCount },
    };
  }
  if (counts.testsRun === 0) {
    return {
      proof: 'solutionPasses',
      passed: false,
      reason:
        'exit 0 com ZERO testes executados — nada rodou. Exit code sozinho não prova sucesso (arquivo de teste vazio / glob vazio também saem 0).',
      detail: { exitCode: 0, testsRun: 0, expectedTestCount },
    };
  }
  if (counts.fail > 0) {
    return {
      proof: 'solutionPasses',
      passed: false,
      reason: `solução de referência tem testes falhando (fail ${counts.fail})`,
      detail: { exitCode: res.exitCode, fail: counts.fail, testsRun: counts.testsRun },
    };
  }
  if (counts.skipped > 0) {
    return {
      proof: 'solutionPasses',
      passed: false,
      reason: `solução de referência tem testes SKIPADOS (skipped ${counts.skipped}) — a prova 1 é passagem INTEGRAL: todo teste tem de ter passado`,
      detail: { exitCode: res.exitCode, skipped: counts.skipped, testsRun: counts.testsRun, pass: counts.pass },
    };
  }
  if (counts.pass !== counts.testsRun) {
    return {
      proof: 'solutionPasses',
      passed: false,
      reason: `relatório internamente inconsistente: pass ${counts.pass} ≠ testsRun ${counts.testsRun} — há teste que não passou`,
      detail: { exitCode: res.exitCode, pass: counts.pass, testsRun: counts.testsRun, fail: counts.fail, skipped: counts.skipped },
    };
  }
  if (counts.testsRun !== expectedTestCount) {
    return {
      proof: 'solutionPasses',
      passed: false,
      reason: `solução de referência executou ${counts.testsRun} de ${expectedTestCount} testes esperados`,
      detail: { exitCode: res.exitCode, testsRun: counts.testsRun, expectedTestCount },
    };
  }
  return { proof: 'solutionPasses', passed: true };
}

/**
 * PROVA 2 — o `starterCode` FALHA (o aluno tem o que fazer).
 *
 * Fail-closed no espelho: starter que SAI 0 (passou) reprova a prova — mesmo
 * que "nada tenha rodado", um starter que sai 0 não dá ao aluno nenhuma
 * correção a fazer. Exit não-zero é falha legítima (execução real falhou);
 * a qualidade da falha é coberta pelas outras provas.
 */
export function judgeStarterFails(res: ExecResult): ProofJudgement {
  if (res.exitCode === 0) {
    return {
      proof: 'starterFails',
      passed: false,
      reason: 'starterCode passou (exit 0) — o aluno não teria nada para corrigir',
      detail: { exitCode: 0 },
    };
  }
  return { proof: 'starterFails', passed: true };
}

/**
 * PROVA 3 — a contagem de testes executados BATE com `expectedTestCount`.
 *
 * A prova de contagem é DUPLA (fix adversarial): o AST DECLARA e o relatório
 * EXECUTA — são os DOIS lados que esta prova confronta com o esperado:
 *   - `declared` — `countTestDeclarations` de `../extract`, a contagem ÚNICA
 *     por AST do repositório (§5.3): `// test(` comentado não é nó; esse é o
 *     lado DECLARADO (estático, sobre `testsCode`);
 *   - `executed` — saída do relatório spec da rodada da SOLUÇÃO (o ÚLTIMO
 *     bloco de resumo — o do runner real), lida por `parseSpecCounts`; esse é
 *     o lado EXECUTADO (dinâmico, medido na rodada que comprovadamente roda
 *     os testes de verdade);
 *   - `expectedTestCount` — o declarado no desafio.
 *
 * expectedTestCount === 0 é inválido por construção: sem teste não há prova.
 */
export function judgeCountMatches(declared: number, expectedTestCount: number, solutionRun: ExecResult): ProofJudgement {
  if (expectedTestCount < 1) {
    return {
      proof: 'countMatches',
      passed: false,
      reason: `expectedTestCount deve ser ≥ 1 (recebido ${expectedTestCount}) — sem teste não há prova de execução`,
      detail: { declared, expectedTestCount },
    };
  }
  if (declared !== expectedTestCount) {
    return {
      proof: 'countMatches',
      passed: false,
      reason: `testes declarados (${declared}) ≠ expectedTestCount (${expectedTestCount}) — confira o arquivo de testes`,
      detail: { declared, expectedTestCount },
    };
  }
  const executed = parseSpecCounts(execOutput(solutionRun)).testsRun;
  if (executed === 0) {
    return {
      proof: 'countMatches',
      passed: false,
      reason: 'nenhum teste executado na rodada da solução — nada rodou',
      detail: { declared, expectedTestCount, executed },
    };
  }
  if (executed !== expectedTestCount) {
    return {
      proof: 'countMatches',
      passed: false,
      reason: `testes executados (${executed}) ≠ expectedTestCount (${expectedTestCount})`,
      detail: { declared, expectedTestCount, executed },
    };
  }
  return { proof: 'countMatches', passed: true };
}

/**
 * PROVA 4 — um stub vazio FALHA (protege contra teste tautológico).
 *
 * Um teste que passa sem nenhuma implementação (`test('sempre passa', () => {})`)
 * faz o stub vazio sair 0 — a prova reprova o desafio: ou os testes são
 * tautológicos, ou não exercitam o código do aluno. Exit não-zero aqui significa
 * que o arquivo de testes REFERENCIA o módulo (import quebrado) ou falha sem ele.
 */
export function judgeEmptyStubFails(res: ExecResult): ProofJudgement {
  if (res.exitCode === 0) {
    return {
      proof: 'emptyStubFails',
      passed: false,
      reason: 'stub vazio passou (exit 0) — testes são tautológicos ou não exercitam o código do aluno',
      detail: { exitCode: 0 },
    };
  }
  return { proof: 'emptyStubFails', passed: true };
}

// ---------------------------------------------------------------------------
// Orquestração — roda os três lados (solução, starter, stub vazio) e combina
// as quatro provas num veredito ESTRUTURADO, fail-closed.
// ---------------------------------------------------------------------------

export interface ChallengeProofSide {
  /** código do lado (arquivo único solution.mjs quando `files` ausente). */
  code: string;
  /** ADITIVO multi-arquivo: caminho + código por arquivo (como o challengeExec). */
  files?: { path: string; code: string }[];
}

export interface ChallengeProofsInput {
  solutionCode: string;
  starterCode: string;
  testsCode: string;
  expectedTestCount: number;
  /** multi-arquivo: arquivos da solução (ausente ⇒ solution.mjs único). */
  solutionFiles?: { path: string; code: string }[];
  /** multi-arquivo: arquivos do starter (ausente ⇒ solution.mjs único). */
  starterFiles?: { path: string; code: string }[];
  /** conteúdo do stub vazio (default EMPTY_STUB_CODE). */
  emptyStubCode?: string;
  /** multi-arquivo: arquivos do stub vazio (default espelha solutionFiles). */
  emptyStubFiles?: { path: string; code: string }[];
  timeoutMs?: number;
}

/**
 * Ambiente de execução injetado (A-P07-2). `prepare` devolve um diretório
 * ISOLADO com o código de um lado + os testes; `cleanup` o remove. O harness
 * real (`harness.ts`) implementa os três com mkdtemp/rm e limiter SEM_EXEC.
 */
export interface ProofEnv {
  exec: ExecFn;
  prepare: (side: ChallengeProofSide & { testsCode: string }) => Promise<string>;
  cleanup: (dir: string) => Promise<void>;
}

export interface ChallengeProofsVerdict {
  /** fail-closed: true somente quando as QUATRO provas passaram. */
  valid: boolean;
  /** provas que falharam (vazio quando válido) — qual prova e por quê. */
  failures: ProofJudgement[];
  /** resultados brutos das três rodadas (presentes quando a infra não falhou). */
  executions?: { solution: ExecResult; starter: ExecResult; emptyStub: ExecResult };
  /**
   * A prova de contagem é DUPLA (fix adversarial): o AST DECLARA (`declared`,
   * via `countTestDeclarations` de `../extract`) e o relatório EXECUTA
   * (`executed`, via `parseSpecCounts` — o ÚLTIMO bloco de resumo, o do runner
   * real). `judgeCountMatches` confronta os dois lados com
   * `expectedTestCount`; um veredito válido exige declared === executed ===
   * expectedTestCount.
   */
  declared: number;
  /** testes executados, medidos na rodada da solução. */
  executed: number;
  /** falha de infraestrutura (prepare/exec/cleanup lançou) — veredito inválido. */
  execError?: string;
}

function emptyStubSide(input: ChallengeProofsInput): ChallengeProofSide {
  if (input.emptyStubFiles) return { code: EMPTY_STUB_CODE, files: input.emptyStubFiles };
  if (input.solutionFiles && input.solutionFiles.length > 0) {
    // multi-arquivo: mesmo layout da solução, cada arquivo vazio (`export {};`).
    return {
      code: EMPTY_STUB_CODE,
      files: input.solutionFiles.map((f) => ({ path: f.path, code: input.emptyStubCode ?? EMPTY_STUB_CODE })),
    };
  }
  return { code: input.emptyStubCode ?? EMPTY_STUB_CODE };
}

/**
 * Roda as QUATRO PROVAS de um desafio. Cada lado roda num diretório ISOLADO
 * próprio (nunca compartilham diretório — contaminação zero entre rodadas).
 * As provas são os julgadores puros acima; aqui só se decide o veredito:
 * `valid = failures.length === 0`. Qualquer exceção de infraestrutura vira
 * veredito inválido com `execError` (fail-closed). Cleanup roda SEMPRE,
 * mesmo em falha.
 */
export async function verifyChallengeProofs(
  input: ChallengeProofsInput,
  env: ProofEnv,
): Promise<ChallengeProofsVerdict> {
  const declared = countTestDeclarations(input.testsCode);
  const timeoutMs = input.timeoutMs;
  const dirs: string[] = [];
  try {
    const solDir = await env.prepare({ code: input.solutionCode, files: input.solutionFiles, testsCode: input.testsCode });
    dirs.push(solDir);
    const starterDir = await env.prepare({ code: input.starterCode, files: input.starterFiles, testsCode: input.testsCode });
    dirs.push(starterDir);
    const emptyDir = await env.prepare({ ...emptyStubSide(input), testsCode: input.testsCode });
    dirs.push(emptyDir);

    const execOpts = timeoutMs !== undefined ? { timeoutMs } : {};
    const [solution, starter, emptyStub] = await Promise.all([
      env.exec(solDir, [...SPEC_TEST_ARGS], execOpts),
      env.exec(starterDir, [...SPEC_TEST_ARGS], execOpts),
      env.exec(emptyDir, [...SPEC_TEST_ARGS], execOpts),
    ]);

    const failures: ProofJudgement[] = [
      judgeSolutionPasses(solution, input.expectedTestCount),
      judgeStarterFails(starter),
      judgeCountMatches(declared, input.expectedTestCount, solution),
      judgeEmptyStubFails(emptyStub),
    ].filter((j) => !j.passed);

    return {
      valid: failures.length === 0,
      failures,
      executions: { solution, starter, emptyStub },
      declared,
      executed: parseSpecCounts(execOutput(solution)).testsRun,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      valid: false,
      failures: [{ proof: 'execError', passed: false, reason: `falha de infraestrutura nas provas: ${message}` }],
      declared,
      executed: 0,
      execError: message,
    };
  } finally {
    // limpa SEMPRE — diretórios isolados não podem vazar; falha de cleanup
    // não pode derrubar o veredito (o problema real já foi julgado).
    await Promise.all(dirs.map((d) => env.cleanup(d))).catch(() => {});
  }
}

/** Conveniência: veredito válido apenas se todas as provas passaram. */
export function proofsAllPass(v: ChallengeProofsVerdict): boolean {
  return v.valid;
}