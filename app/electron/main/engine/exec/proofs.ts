/**
 * app/electron/main/engine/exec/proofs.ts — as PROVAS de execução de um
 * desafio (`docs/16-engine-de-trilha.md` §5.4). Um desafio só é válido por
 * EXECUÇÃO, e por quatro provas, não duas:
 *
 *   1. a solução de referência PASSA em todos os testes;
 *   2. o `starterCode` FALHA;
 *   3. o número de testes executados BATE com `expectedTestCount`;
 *   4. um stub vazio FALHA (protege contra teste tautológico).
 *
 * A QUINTA PROVA (`typesCheck`) — verificação de TIPO do lado da SOLUÇÃO — é
 * OPCIONAL POR LINGUAGEM e vive em `exec/typesCheck.ts`, que documenta por que
 * ela precisou ser uma prova NOVA em vez de uma dobra das provas 2 e 4 (as
 * duas seriam trivialmente satisfeitas por falha de compilação e parariam de
 * provar qualquer coisa). As provas 2 e 4 continuam RUNTIME-ONLY: os
 * julgadores `judgeStarterFails` e `judgeEmptyStubFails` deste arquivo leem
 * SOMENTE o `exitCode` da rodada de `node --test`, e nada de `typesCheck.ts`
 * entra neles.
 *
 * TUDO O QUE É POR LINGUAGEM vem do ADAPTADOR (`engine/lang/registry.ts`, os
 * 15 membros do §6 de `docs/research/08-multilingua-trava-deterministica.md`):
 * o comando de teste (`testCommand`), a contagem declarada (`countDeclared`),
 * a contagem executada (`countRun`) e o reconhecimento de falha
 * (`failureExitCodes` — `isFailure`/`meaning`). Nenhum julgador deste arquivo
 * compara `exitCode` com 0 na mão: `passed = code === 0` NÃO é universal (§6
 * obs. 3 — R sai 0 com teste quebrado, Go sai 0 quando não achou arquivo de
 * teste, Node sai 0 com arquivo de teste vazio).
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
 * A contagem DECLARADA usa `adapter.countDeclared`, que no adaptador
 * JavaScript é `countTestDeclarations` de `../extract` — a ÚNICA função do
 * repositório, por AST (`§5.3`): comentário não é nó, e um `// test(`
 * comentado não conta. A onda 5 APAGOU a segunda implementação (a regex de
 * `services/challengeExec.ts`), que quebrava exatamente aí e fazia o validador
 * semântico entrar em retry para sempre.
 */

import {
  defaultAdapter,
  getAdapter,
  adapterIdForChallengeLanguage,
  type ChallengeLanguageToken,
  type LanguageAdapter,
  type RunCounts,
} from '../lang/registry';
import {
  TYPES_CHECK_NAO_APLICAVEL,
  politicaDeTipos,
  type TypesCheckFn,
  type TypesCheckResult,
} from './typesCheck';

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

/**
 * Args canônicos do runner do adaptador DEFAULT (`node --test` com relatório
 * spec, arquivo único).
 *
 * ONDA 5: o VALOR vem do adaptador (`javascriptAdapter.testCommand` —
 * `lang/javascript.ts`), não é mais uma cópia literal aqui. O símbolo continua
 * exportado porque `phases/f9Verifier.ts` e três testes o importam; quem
 * precisa da linguagem CERTA (e não da default) usa `adapter.testCommand`, que
 * é o que `verifyChallengeProofs` e `argsDeTeste` fazem.
 */
export const SPEC_TEST_ARGS: readonly string[] = defaultAdapter().testCommand;

/**
 * Resolve o ADAPTADOR de um token de `challenge.language` (`'nodejs'`,
 * `'javascript'`, …). FAIL-CLOSED: token declarado e desconhecido LANÇA
 * `LanguageRegistryError` — cair no default silencioso é exatamente como um
 * gate multilíngua passa a mentir (um desafio `language: 'python'` seria
 * provado com o runner de JavaScript). Token AUSENTE cai no adaptador default,
 * que é o que as 112 trilhas do disco significam.
 */
export function adapterDoDesafio(language?: string | null): LanguageAdapter {
  if (language === undefined || language === null || language === '') return defaultAdapter();
  const id = adapterIdForChallengeLanguage(language);
  // `getAdapter` LANÇA com a lista de ids conhecidos quando não há adaptador —
  // a mensagem é para quem escreve a trilha, então ela precisa dizer o que É
  // válido, e não só que o valor recebido não é.
  return getAdapter(id ?? language);
}

/** Saída combinada (stdout + stderr) — é o que um relatório spec real deixa. */
export function execOutput(res: ExecResult): string {
  return `${res.stdout}\n${res.stderr}`.trim();
}

// ---------------------------------------------------------------------------
// Parser do relatório spec (executado) — tolerante a ANSI
// ---------------------------------------------------------------------------

/**
 * As contagens do relatório executado (`tests`/`pass`/`fail`/`skipped` — a
 * prova 1 exige `skipped === 0`, porque teste skipado não é teste que passou).
 *
 * ONDA 6: é um ALIAS de `RunCounts` (§6, membro 11), não uma segunda definição
 * da mesma forma. O nome fica porque este arquivo e os seus testes falam em
 * "SpecCounts"; a forma passa a ter um dono só, junto do membro do adaptador.
 */
export type SpecCounts = RunCounts;

/**
 * Contagem EXECUTADA do relatório spec — o ÚLTIMO bloco de resumo, tolerante a
 * ANSI, com `skipped`.
 *
 * ONDA 6 — A IMPLEMENTAÇÃO MUDOU DE CASA para `engine/lang/javascript.ts`
 * (`jsCountRun`, o membro 11 do §6), e este arquivo REEXPORTA daqui em diante.
 * A inversão não é estética: até a onda 5 a seta apontava para cá e
 * `lang/javascript.ts` alcançava esta função por `require('../exec/proofs')` —
 * um caminho RELATIVO, invisível ao Rollup, que sobrevivia literal ao bundle e
 * apontava para `out/exec/proofs`, inexistente. Efeito medido: no app
 * EMPACOTADO, `runStudentCode` (a submissão do aluno) lançava MODULE_NOT_FOUND.
 * Com a implementação no adaptador — um módulo FOLHA, sem import de valor —
 * ninguém mais precisa de caminho relativo postergado. O corpo é byte a byte o
 * mesmo (a defesa contra RELATÓRIO FORJADO documentada no cabeçalho deste
 * arquivo continua sendo esta função), e o teste de paridade de
 * `tests/engineLangRegistry.test.ts` compara as duas pontas.
 *
 * O símbolo continua exportado porque `phases/f9Verifier.ts` e os testes o
 * importam daqui; quem tem um adaptador na mão usa `adapter.countRun`.
 */
export { jsCountRun as parseSpecCounts, exitCodeMeaning } from '../lang/javascript';

// ---------------------------------------------------------------------------
// As quatro provas — julgadores puros
// ---------------------------------------------------------------------------

/**
 * As provas julgáveis. `typesCheck` é a QUINTA (ver `exec/typesCheck.ts`):
 * OPCIONAL POR LINGUAGEM e aplicada SÓ ao lado da SOLUÇÃO — nunca ao starter
 * (prova 2) nem ao stub vazio (prova 4), que continuam runtime-only.
 */
export type ProofId =
  | 'solutionPasses'
  | 'starterFails'
  | 'countMatches'
  | 'emptyStubFails'
  | 'typesCheck'
  | 'execError';

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
export function judgeSolutionPasses(
  res: ExecResult,
  expectedTestCount: number,
  adapter: LanguageAdapter = defaultAdapter(),
): ProofJudgement {
  const counts = adapter.countRun(execOutput(res));
  if (adapter.failureExitCodes.isFailure(res.exitCode)) {
    return {
      proof: 'solutionPasses',
      passed: false,
      reason: `solução de referência não passou: ${adapter.failureExitCodes.meaning(res.exitCode)}`,
      detail: { exitCode: res.exitCode, testsRun: counts.testsRun, expectedTestCount },
    };
  }
  if (counts.testsRun === 0) {
    return {
      proof: 'solutionPasses',
      passed: false,
      reason:
        'exit 0 com ZERO testes executados — nada rodou. Exit code sozinho não prova sucesso (arquivo de teste vazio / glob vazio também saem 0).',
      detail: { exitCode: res.exitCode, testsRun: 0, expectedTestCount },
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
 *
 * RUNTIME-ONLY, E ISSO É DELIBERADO (ver `exec/typesCheck.ts`): esta prova lê
 * SOMENTE o exit code da rodada de `node --test`. Um starter de linguagem
 * tipada quase sempre tem erro de TIPO por construção (o corpo é um `TODO`,
 * logo o retorno declarado não é satisfeito) — se falha de compilador contasse
 * como "o starter falhou", a prova seria TRIVIALMENTE satisfeita por todo
 * starter, inclusive um starter que já resolve o exercício, e pararia de
 * provar que o aluno tem o que fazer. A prova de tipo é a QUINTA, e só olha a
 * SOLUÇÃO.
 */
export function judgeStarterFails(
  res: ExecResult,
  adapter: LanguageAdapter = defaultAdapter(),
): ProofJudgement {
  if (!adapter.failureExitCodes.isFailure(res.exitCode)) {
    return {
      proof: 'starterFails',
      passed: false,
      reason: 'starterCode passou (exit 0) — o aluno não teria nada para corrigir',
      detail: { exitCode: res.exitCode },
    };
  }
  return { proof: 'starterFails', passed: true };
}

/**
 * PROVA 3 — a contagem de testes executados BATE com `expectedTestCount`.
 *
 * A prova de contagem é DUPLA (fix adversarial): o fonte DECLARA e o relatório
 * EXECUTA — são os DOIS lados que esta prova confronta com o esperado:
 *   - `declared` — `adapter.countDeclared` (em JavaScript,
 *     `countTestDeclarations` de `../extract`, a contagem ÚNICA por AST do
 *     repositório — §5.3: `// test(` comentado não é nó); esse é o lado
 *     DECLARADO (estático, sobre `testsCode`);
 *   - `executed` — saída do relatório da rodada da SOLUÇÃO, lida por
 *     `adapter.countRun` (em JavaScript, o ÚLTIMO bloco de resumo spec — o do
 *     runner real); esse é o lado EXECUTADO (dinâmico, medido na rodada que
 *     comprovadamente roda os testes de verdade);
 *   - `expectedTestCount` — o declarado no desafio.
 *
 * expectedTestCount === 0 é inválido por construção: sem teste não há prova.
 * A dupla-igualdade é INVARIANTE DE TODA LINGUAGEM (§6 obs. 3): nenhum
 * adaptador pode declarar `failureExitCodes.successRequiresCountMatch: false`
 * — o tipo do registro só aceita o literal `true`.
 */
export function judgeCountMatches(
  declared: number,
  expectedTestCount: number,
  solutionRun: ExecResult,
  adapter: LanguageAdapter = defaultAdapter(),
): ProofJudgement {
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
  const executed = adapter.countRun(execOutput(solutionRun)).testsRun;
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
 *
 * RUNTIME-ONLY, E ISSO É DELIBERADO (ver `exec/typesCheck.ts`): o stub vazio é
 * `export {};`, e numa linguagem tipada o `import { f } from './solution'` do
 * teste vira erro de COMPILAÇÃO ("has no exported member"), não erro de
 * execução. Se falha de compilador contasse aqui, a prova passaria SEMPRE — e
 * ela existe justamente para pegar o teste TAUTOLÓGICO, que continua rodando
 * VERDE contra o stub vazio. Só a EXECUÇÃO o detecta.
 */
export function judgeEmptyStubFails(
  res: ExecResult,
  adapter: LanguageAdapter = defaultAdapter(),
): ProofJudgement {
  if (!adapter.failureExitCodes.isFailure(res.exitCode)) {
    return {
      proof: 'emptyStubFails',
      passed: false,
      reason: 'stub vazio passou (exit 0) — testes são tautológicos ou não exercitam o código do aluno',
      detail: { exitCode: res.exitCode },
    };
  }
  return { proof: 'emptyStubFails', passed: true };
}

/**
 * PROVA 5 (opcional por linguagem) — os TIPOS do lado da SOLUÇÃO conferem.
 *
 * Node APAGA os tipos, não os confere: `node --test` sobre um `.ts`
 * transpilado nunca reprova `const n: number = 'texto'`. Numa trilha de
 * linguagem tipada, sem esta prova a trava seria a trava de uma trilha sem
 * tipos com anotações decorativas.
 *
 * O QUE ELA JULGA — a primeira pergunta é "a checagem RODOU?", não "a
 * linguagem exige?", e a ordem importa:
 *   - NÃO RODOU (`applicable: false`) e a linguagem não exige (o caso do
 *     adaptador `javascript`, cuja política é `required: false`) ⇒ PASSA. O
 *     veredito carrega `types.applicable === false`: a prova não se aplica, e
 *     isso fica dito, nunca um "pulei" mudo;
 *   - NÃO RODOU e a linguagem EXIGE (compilador ausente, ou o provador não
 *     ligou o seam `ProofEnv.typesCheck`) ⇒ REPROVA com a mensagem de
 *     degradação. FAIL-CLOSED: um desafio de linguagem tipada não é aprovado
 *     por falta de ferramenta;
 *   - RODOU e reprovou ⇒ REPROVA com os diagnósticos, INDEPENDENTE da
 *     política. Uma checagem que rodou e falhou é informação, não ruído:
 *     silenciá-la porque "esta linguagem não exigia" seria descartar um
 *     defeito já provado.
 *
 * SÓ A SOLUÇÃO. As provas 2 e 4 continuam runtime-only — o porquê está nos
 * docstrings delas e no cabeçalho de `exec/typesCheck.ts`.
 */
export function judgeTypesCheck(
  result: TypesCheckResult,
  adapter: LanguageAdapter = defaultAdapter(),
): ProofJudgement {
  if (!result.applicable) {
    if (!politicaDeTipos(adapter.id).required) return { proof: 'typesCheck', passed: true };
    return {
      proof: 'typesCheck',
      passed: false,
      reason:
        `${adapter.label} exige verificação de TIPO da solução e ela não rodou` +
        `${result.degradacao !== null ? `: ${result.degradacao}` : ' — o provador não ligou ProofEnv.typesCheck'}`,
      detail: { applicable: false, exitCode: result.exitCode },
    };
  }
  if (result.degradacao !== null) {
    return {
      proof: 'typesCheck',
      passed: false,
      reason: `verificação de TIPO indisponível: ${result.degradacao}`,
      detail: { applicable: true, exitCode: result.exitCode },
    };
  }
  if (!result.ok) {
    return {
      proof: 'typesCheck',
      passed: false,
      reason: `a solução de referência NÃO passa na verificação de tipos (${adapter.failureExitCodes.meaning(result.exitCode)}): ${result.output}`,
      detail: { applicable: true, exitCode: result.exitCode },
    };
  }
  return { proof: 'typesCheck', passed: true };
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
  /**
   * O token de `challenge.language` (`'nodejs'`, `'javascript'`, …) — resolve
   * QUAL adaptador prova este desafio. Ausente ⇒ adaptador default, que é o
   * que as 112 trilhas do disco significam; token desconhecido ⇒ veredito
   * inválido com `execError` (fail-closed, nunca o parser errado).
   */
  language?: ChallengeLanguageToken | string;
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
  /**
   * A QUINTA PROVA (opcional por linguagem): verificação de TIPO do lado da
   * SOLUÇÃO, num SPAWN SEPARADO — nunca uma flag do runner de teste. Ausente
   * ⇒ a prova é julgada como não-aplicável, e isso REPROVA quando a linguagem
   * a exige (`judgeTypesCheck`, fail-closed).
   *
   * O provador oficial (`phases/f9Verifier.ts`) a monta com `criarTypesCheck`
   * sobre o MESMO ExecFn endurecido das rodadas de teste — é assim que ela
   * herda o teto SEM_EXEC. `tsc` custa da ordem de 1–2 s contra ~290 ms de uma
   * rodada de teste: fora do semáforo, ele dominaria a F9 inteira.
   */
  typesCheck?: TypesCheckFn;
}

export interface ChallengeProofsVerdict {
  /**
   * fail-closed: true somente quando TODAS as provas passaram — as quatro de
   * execução e, quando a linguagem a exige, a quinta (tipos da solução).
   */
  valid: boolean;
  /** provas que falharam (vazio quando válido) — qual prova e por quê. */
  failures: ProofJudgement[];
  /** resultados brutos das três rodadas (presentes quando a infra não falhou). */
  executions?: { solution: ExecResult; starter: ExecResult; emptyStub: ExecResult };
  /**
   * A prova de contagem é DUPLA (fix adversarial): o fonte DECLARA
   * (`declared`, via `adapter.countDeclared` — por AST no adaptador
   * JavaScript) e o relatório EXECUTA (`executed`, via `adapter.countRun` — o
   * ÚLTIMO bloco de resumo, o do runner real). `judgeCountMatches` confronta
   * os dois lados com `expectedTestCount`; um veredito válido exige declared
   * === executed === expectedTestCount.
   *
   * A dupla-igualdade é INVARIANTE DA ENGINE, não política por linguagem:
   * `FailurePolicy.successRequiresCountMatch` é `true` LITERAL no tipo do
   * registro, e nenhum adaptador pode declará-lo `false` (§6 obs. 3).
   */
  declared: number;
  /** testes executados, medidos na rodada da solução. */
  executed: number;
  /** o resultado da QUINTA prova (tipos) — não-aplicável quando a linguagem não a exige. */
  types?: TypesCheckResult;
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
 * Roda as provas de um desafio: as QUATRO de execução, mais a QUINTA (tipos da
 * solução) quando a linguagem a exige. Cada lado roda num diretório ISOLADO
 * próprio (nunca compartilham diretório — contaminação zero entre rodadas).
 * As provas são os julgadores puros acima; aqui só se decide o veredito:
 * `valid = failures.length === 0`. Qualquer exceção de infraestrutura vira
 * veredito inválido com `execError` (fail-closed). Cleanup roda SEMPRE,
 * mesmo em falha.
 *
 * MULTILÍNGUA (onda 5): o adaptador sai de `input.language` pelo registro —
 * é ele que dá o comando de teste, as duas contagens e o reconhecimento de
 * falha. `language` desconhecido NÃO cai no default: vira `execError`.
 *
 * PARALELISMO (onda 5 — confirmado e documentado): as TRÊS rodadas de
 * execução (solução, starter, stub vazio) MAIS a checagem de tipos rodam em
 * `Promise.all` — as provas de UM desafio são paralelas por construção. O
 * limite de spawns em voo NÃO vive aqui: o executor endurecido
 * (`createHardenedExec` em `harness.ts`, usado pelo provador oficial de
 * `f9Verifier.ts`) adquire o SEM_EXEC por execução, e a checagem de tipos
 * passa pelo MESMO executor justamente para concorrer pelas mesmas vagas; o
 * paralelismo ENTRE desafios é responsabilidade do chamador (a F9/F11 da
 * fiação e o G-FINAL fazem map paralelo com SEM_EXEC).
 */
export async function verifyChallengeProofs(
  input: ChallengeProofsInput,
  env: ProofEnv,
): Promise<ChallengeProofsVerdict> {
  const timeoutMs = input.timeoutMs;
  const dirs: string[] = [];
  // `declared` fica FORA do try porque o catch o reporta; a resolução do
  // adaptador e a contagem ficam DENTRO para que um `language` desconhecido
  // (fail-closed no registro) vire veredito inválido em vez de exceção solta.
  let declared = 0;
  try {
    const adapter = adapterDoDesafio(input.language);
    declared = adapter.countDeclared(input.testsCode);
    const testArgs = [...adapter.testCommand];

    const solSide = { code: input.solutionCode, files: input.solutionFiles, testsCode: input.testsCode };
    const solDir = await env.prepare(solSide);
    dirs.push(solDir);
    const starterDir = await env.prepare({ code: input.starterCode, files: input.starterFiles, testsCode: input.testsCode });
    dirs.push(starterDir);
    const emptyDir = await env.prepare({ ...emptyStubSide(input), testsCode: input.testsCode });
    dirs.push(emptyDir);

    const execOpts = timeoutMs !== undefined ? { timeoutMs } : {};
    const [solution, starter, emptyStub, types] = await Promise.all([
      env.exec(solDir, [...testArgs], execOpts),
      env.exec(starterDir, [...testArgs], execOpts),
      env.exec(emptyDir, [...testArgs], execOpts),
      // QUINTA PROVA — SÓ o diretório da SOLUÇÃO. `prepare` não sabe qual lado
      // preparou (os três passam por ele), então a checagem é disparada AQUI,
      // onde o lado é conhecido; o spawn é separado e vive no MESMO ExecFn
      // endurecido, logo no mesmo SEM_EXEC.
      env.typesCheck ? env.typesCheck(solDir, solSide) : Promise.resolve(TYPES_CHECK_NAO_APLICAVEL),
    ]);

    const failures: ProofJudgement[] = [
      judgeSolutionPasses(solution, input.expectedTestCount, adapter),
      judgeStarterFails(starter, adapter),
      judgeCountMatches(declared, input.expectedTestCount, solution, adapter),
      judgeEmptyStubFails(emptyStub, adapter),
      judgeTypesCheck(types, adapter),
    ].filter((j) => !j.passed);

    return {
      valid: failures.length === 0,
      failures,
      executions: { solution, starter, emptyStub },
      declared,
      executed: adapter.countRun(execOutput(solution)).testsRun,
      types,
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