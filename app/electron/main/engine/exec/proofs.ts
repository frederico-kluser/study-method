/**
 * app/electron/main/engine/exec/proofs.ts — FACHADA das PROVAS de execução de
 * um desafio (`docs/16-engine-de-trilha.md` §5.4).
 *
 * REFATORAÇÃO L06: este arquivo virou FACHADA (re-export) — TODO o contrato
 * público continua exportado por ESTE caminho (nenhum consumidor mudou de
 * import):
 *   - `proofsCore.ts` — contrato de execução, parser do relatório, os QUATRO
 *     julgadores puros de execução e os tipos de lado/entrada;
 *   - AQUI — a QUINTA PROVA (`judgeTypesCheck`) e o orquestrador
 *     `verifyChallengeProofs`, os únicos que tocam `exec/typesCheck.ts`.
 *
 * POR QUE A QUINTA PROVA E O ORQUESTRADOR FICARAM NESTA FACHADA: eles são os
 * únicos pontos que importam `exec/typesCheck.ts`, e `typesCheck.ts` importa
 * tipos DESTE caminho (`ChallengeProofSide`/`ExecFn`/`ExecResult`). O par
 * `exec/proofs.ts ↔ exec/typesCheck.ts` é o ciclo PRÉ-EXISTENTE allowlistado
 * por `tests/engineModuleGraphAcyclic.test.ts`; manter a referência AQUI (e não
 * no núcleo) preserva a assinatura EXATA daquele ciclo — nenhum ciclo novo
 * aparece no grafo de `engine/**`.
 *
 * Um desafio só é válido por EXECUÇÃO, e por quatro provas, não duas (a
 * solução PASSA, o starter FALHA, a contagem BATE, o stub vazio FALHA) — mais
 * a QUINTA (tipos da solução), OPCIONAL POR LINGUAGEM (ver
 * `exec/typesCheck.ts`): as provas 2 e 4 continuam RUNTIME-ONLY por decisão
 * documentada (falha de compilador não pode satisfazê-las).
 *
 * FAIL-CLOSED (regra 1 do plano): exit 0 com ZERO testes é FALHA; teste
 * skipado reprova a passagem integral; qualquer exceção de infraestrutura vira
 * veredito inválido com `execError`; `137` é "timeout-ou-OOM" (nunca afirmar
 * qual dos dois). Detalhes e armadilhas medidas: cabeçalho de `proofsCore.ts`.
 */

import {
  TYPES_CHECK_NAO_APLICAVEL,
  politicaDeTipos,
  type TypesCheckFn,
  type TypesCheckResult,
} from './typesCheck';
import {
  adapterDoDesafio,
  emptyStubSide,
  execOutput,
  judgeCountMatches,
  judgeEmptyStubFails,
  judgeSolutionPasses,
  judgeStarterFails,
  type ChallengeProofSide,
  type ChallengeProofsInput,
  type ExecFn,
  type ExecResult,
  type ProofJudgement,
} from './proofsCore';
import { defaultAdapter, type LanguageAdapter } from '../lang/registry';

// ─── núcleo: execução, parser, provas 1–4 e tipos (proofsCore.ts) ────────────
export {
  SPEC_TEST_ARGS,
  adapterDoDesafio,
  execOutput,
  parseSpecCounts,
  exitCodeMeaning,
  EMPTY_STUB_CODE,
  judgeSolutionPasses,
  judgeStarterFails,
  judgeCountMatches,
  judgeEmptyStubFails,
  type ExecResult,
  type ExecFn,
  type SpecCounts,
  type ProofId,
  type ProofJudgement,
  type ChallengeProofSide,
  type ChallengeProofsInput,
} from './proofsCore';

// ---------------------------------------------------------------------------
// Orquestração — roda os três lados (solução, starter, stub vazio) e combina
// as quatro provas num veredito ESTRUTURADO, fail-closed.
// ---------------------------------------------------------------------------

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

/**
 * PROVA 5 (opcional por linguagem) — os TIPOS do lado da SOLUÇÃO conferem.
 *
 * Node APAGA os tipos, não os confere: `node --test` sobre um `.ts`
 * transpilado nunca reprova `const n: number = 'texto'`. Num trilha de
 * linguagem tipada, sem esta prova a trava seria a trava de uma trilha sem
 * tipos com anotações decorativas.
 *
 * O QUE ELA JULGA — a primeira pergunta é "a checagem RODOU?", não "a linguagem
 * exige?", e a ordem importa:
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

/**
 * Roda as provas de um desafio: as QUATRO de execução, mais a QUINTA (tipos da
 * solução) quando a linguagem a exige. Cada lado roda num diretório ISOLADO
 * próprio (nunca compartilham diretório — contaminação zero entre rodadas).
 * As provas são os julgadores puros; aqui só se decide o veredito:
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

    const failures = [
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
      executed: adapter.countRun(execOutput(solution), declared).testsRun,
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
