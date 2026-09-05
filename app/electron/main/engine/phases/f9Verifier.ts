/**
 * app/electron/main/engine/phases/f9Verifier.ts — P-31 (onda 2): INTEGRAÇÃO
 * F9 — o PROVADOR OFICIAL de provas de execução de desafio
 * (`docs/16-engine-de-trilha.md` §5.4). Fecha o seam que o adapter e o harness
 * declaram como follow-up:
 *
 *   - o harness (`exec/harness.ts`) endurece o ENV (`buildChildEnv` — sem
 *     `NODE_TEST_CONTEXT`/proxies/`NODE_OPTIONS`/`FORCE_COLOR`, com
 *     `NO_PROXY=*`) e endurece o EXIT (exit-guard via `--require`), mas quem
 *     spawna é OUTRO pacote (`services/challengeExec.ts` — `nodeExec`);
 *   - o adaptador (`exec/adapter.ts`) ponteia a assinatura engine ↔ produto
 *     (`{exitCode,…}` ↔ `{code,…}`), mas ATÉ AQUI DESCARTAVA o `opts.env`
 *     (furo medido pelo replan — o env endurecido do harness nunca chegava ao
 *     processo filho).
 *
 * `criarProverDeDesafio` compõe as peças na ordem oficial:
 *
 *   prepareIsolatedDir(baseDir) → escreverExitGuard(dir) → exec endurecido →
 *   `['--require', path.join(dir, 'exit-guard.cjs'), ...argsDeTeste(input)]`
 *   → cleanupDir SEMPRE (finally — as provas == a única autoridade de
 *   isolamento; diretório que vaza é defeito). A ESCRITA DO GUARD vive DENTRO
 *   do escopo de limpeza do prepare: se ela rejeitar, o diretório do mkdtemp
 *   é removido AQUI (o `verifyChallengeProofs` só registra o dir PARA limpeza
 *   depois que o prepare resolve — `dirs.push` em exec/proofs.ts — então um
 *   dir já criado com guard falho nunca entraria na lista e vazaria no tmp).
 *
 * O executor DEFAULT é o OFICIAL do produto: `createHardenedExec({ exec:
 * fromChallengeExec(nodeExec), limiter })` — o MESMO runner que o aluno vê
 * (`node --test --test-reporter=spec test.mjs`, espelho do `runStudentCode`),
 * com o env endurecido ATRAVESSANDO o adaptador até o spawn (o furo fechado,
 * aditivo A-P04-3 no challengeExec e no adapter). Nenhuma semântica das provas
 * muda: os julgadores e o veredito continuam os de `verifyChallengeProofs`
 * (puros — `exec/proofs.ts`).
 *
 * ONDA 5 — DUAS ADIÇÕES NESTE ARQUIVO:
 *
 *   - MULTILÍNGUA: o ADAPTADOR do desafio (`input.language` → registro) passa a
 *     ser resolvido AQUI e injetado em `prepareIsolatedDir` (layout + regex de
 *     caminho) e nos `argsDeTeste` (`testCommand`). Nada mais neste arquivo
 *     conhece `.mjs` ou `--test-reporter=spec`.
 *   - A QUINTA PROVA (`typesCheck`): verificação de TIPO do lado da SOLUÇÃO,
 *     montada com `criarTypesCheck` sobre o MESMO `exec` endurecido — SPAWN
 *     SEPARADO (o `node --test` não confere tipo: Node os APAGA) e MESMO
 *     SEM_EXEC (o compilador custa ordem de 1–2 s contra ~290 ms de uma rodada
 *     de teste; fora do semáforo dominaria a F9 inteira). É OPCIONAL POR
 *     LINGUAGEM: o adaptador `javascript` não a exige. As provas 2 e 4
 *     continuam RUNTIME-ONLY — ver `exec/typesCheck.ts` para o porquê.
 *
 * Fail-closed (regra 1 do plano): qualquer falha de INFRA (prepare/exec/
 * cleanup) vira veredito INVÁLIDO com `execError` — o provador NUNCA lança
 * para o chamador (o `verifyChallengeProofs` já converte a falha de execução;
 * o try externo é a última linha contra o que ele não cobre, ex.: o próprio
 * input inválido).
 *
 * CONTRATO EXATO (consumidores P-17/P-18/P-19/P-23 IMPORTAM ESTA INTERFACE):
 *
 *   const prover = criarProverDeDesafio();        // defaults oficiais
 *   const v: ChallengeProofsVerdict = await prover(input);
 *   // v = { valid, failures, executions?, declared, executed, execError? }
 *
 *   RECOMENDAÇÃO DE IMPORTAÇÃO: o PROVADOR (`criarProverDeDesafio`, opções)
 *   de `../phases/f9Verifier`; os TIPOS (`ChallengeProofsInput`,
 *   `ChallengeProofsVerdict`, `ProofJudgement`, `ExecFn`) de `../exec/proofs`
 *   — ou tudo do f9Verifier (os dois tipos centrais são re-exportados abaixo).
 */

import * as os from 'node:os';
import * as path from 'node:path';

import { criarExecDeLinguagem } from '../../services/challengeExec';
import { fromChallengeExec } from '../exec/adapter';
import {
  cleanupDir,
  createHardenedExec,
  escreverExitGuard,
  prepareIsolatedDir,
} from '../exec/harness';
import {
  adapterDoDesafio,
  verifyChallengeProofs,
  type ChallengeProofsInput,
  type ChallengeProofsVerdict,
  type ExecFn,
  type ExecResult,
  type ProofEnv,
} from '../exec/proofs';
import { criarTypesCheck } from '../exec/typesCheck';
import type { LanguageAdapter } from '../lang/registry';
import { createExecSemaphore, type Semaphore } from '../runtime/semaphore';

// Re-export dos tipos centrais do contrato — consumidores podem importar TUDO
// de f9Verifier, ou os tipos de exec/proofs (recomendado: o provador daqui,
// os tipos de lá — a fonte única das provas).
export type { ChallengeProofsInput, ChallengeProofsVerdict } from '../exec/proofs';

/** O provador de desafio: input → veredito das provas (nunca lança). */
export type ProverDeDesafio = (input: ChallengeProofsInput) => Promise<ChallengeProofsVerdict>;

export interface CriarProverDeDesafioOptions {
  /**
   * ExecFn da ENGINE a usar nas rodadas (A-P07-2 — a suíte injeta fake).
   * Default: o executor OFICIAL do produto endurecido —
   * `createHardenedExec({ exec: fromChallengeExec(nodeExec), limiter })` —
   * SEM_EXEC + env endurecido + `--require` do exit-guard, tudo compose AQUI.
   */
  exec?: ExecFn;
  /**
   * Raiz dos diretórios isolados das provas (`prepareIsolatedDir` mkdtemp sob
   * esta raiz). Default: `os.tmpdir()`. Injetável para os testes observarem a
   * limpeza (nada de prova-exec-* ao final) e para ambientes com tmp próprio.
   */
  baseDir?: string;
  /**
   * Limitador SEM_EXEC (semáforo do P-01 — `runtime/semaphore.ts`, fonte
   * única). Default: `createExecSemaphore()` (teto =
   * `availableParallelism()-1`). Aplica-se a QUALQUER exec, injetado ou
   * default: o spawn é um recurso global da engine, o teto não pode depender
   * de quem plugou o executor.
   */
  limiter?: Semaphore;
  /**
   * SEAM DE INJEÇÃO do exit-guard (testabilidade da falha do guard — revisão
   * adversarial). Recebe o dir isolado JÁ criado pelo mkdtemp e deve escrever
   * `exit-guard.cjs` nele; o retorno é ignorado. Default: `escreverExitGuard`
   * (o oficial do harness). O teste injeta uma função que LANÇA para provar a
   * janela de vazamento fechada: dir criado ⇒ ou devolvido (limpo no finally
   * do verify) ou limpo AQUI no catch do prepare — nunca órfão no tmp.
   */
  escreverGuard?: (dir: string) => Promise<unknown>;
  /**
   * SEAM DE INJEÇÃO do resolvedor do compilador da QUINTA PROVA (tipos).
   * Recebe o nome do módulo npm cujo `bin` é o compilador (ex.:
   * `'typescript/bin/tsc'`) e devolve o caminho absoluto, ou `null` quando não
   * está na máquina. Default: `require.resolve` (`resolverCompiladorNpm`).
   * O teste injeta o seu para exercitar a prova SEM spawn real (A-P07-2).
   */
  resolverCompilador?: (modulo: string) => string | null;
  /**
   * OVERRIDE do adaptador de linguagem. Default: resolvido de `input.language`
   * pelo registro (`adapterDoDesafio`). Existe para quem JÁ resolveu o
   * adaptador (evita resolver duas vezes) e para a suíte exercitar uma
   * linguagem TIPADA antes de `lang/typescript.ts` existir — sem ele, a quinta
   * prova só seria testável pelo caminho de baixo (`criarTypesCheck`), e a
   * fiação do provador ficaria sem cobertura.
   */
  adapter?: LanguageAdapter;
  /**
   * Teto de tempo da QUINTA PROVA. Separado do `timeoutMs` das rodadas de
   * teste porque o compilador é MUITO mais lento que o runner (ordem de 1–2 s
   * contra ~290 ms) — usar o mesmo teto mataria a checagem em máquina fria.
   * Default: 60 s.
   */
  typesTimeoutMs?: number;
}

/**
 * COMO O EXIT-GUARD CHEGA AO FILHO, POR LINGUAGEM.
 *
 * O guard existe para que o código sob teste não mate o runner antes do
 * relatório (`process.exit(0)` forjando `tests N`). Em Node ele é um `.cjs`
 * que o spawn carrega com `--require`; `--require` é uma FLAG DO NODE, e
 * mandá-la para outro interpretador não é "um argumento a mais": é um erro de
 * uso. Medido em `main@26dbc19` num desafio da trilha `python`:
 * `node: bad option: -B`, exit 9, zero teste executado.
 *
 * Em Python o guard vive DENTRO do layout do adaptador — `tests/__init__.py`
 * sobrescreve `os._exit`/`os.abort` (`lang/python.ts`, PY_PACKAGE_MARKER) —,
 * então não há nada a passar na linha de comando.
 *
 * FAIL-CLOSED, no mesmo espírito de `CAMINHADA_POR_LINGUAGEM`
 * (`engine/extract.ts`): linguagem registrada e AUSENTE desta tabela LANÇA, e
 * o provador converte isso em veredito inválido com `execError` — nunca um
 * spawn com a flag da linguagem errada, nunca aprovação por omissão.
 */
export const GUARD_POR_REQUIRE: Readonly<Record<string, boolean>> = {
  javascript: true,
  typescript: true,
  python: false,
};

/** Resolve a política de exit-guard da linguagem. LANÇA quando não há linha. */
export function exigirPoliticaDeGuard(adapter: LanguageAdapter): boolean {
  const politica = GUARD_POR_REQUIRE[adapter.id];
  if (politica === undefined) {
    throw new Error(
      `phases/f9Verifier.ts: linguagem ${JSON.stringify(adapter.id)} sem política de exit-guard — ` +
        `acrescente a linha em GUARD_POR_REQUIRE (declaradas: ${Object.keys(GUARD_POR_REQUIRE).sort().join(', ')})`,
    );
  }
  return politica;
}

/** Teto de tempo default do compilador da quinta prova (ver `typesTimeoutMs`). */
export const TYPES_CHECK_TIMEOUT_MS = 60_000;

/**
 * Args de teste do PRODUTO (espelho do `challengeExec` — `runStudentCode`/
 * `verifyChallengePair`). O MODO não muda com o input (desafio multi-arquivo é
 * resolvido pelo CONTEÚDO do diretório isolado — `prepareIsolatedDir` — nunca
 * por args); a função existe para espelhar LITERALMENTE o caminho do produto
 * num ponto único e dar às integrações (P-17/P-18/P-19/P-23) o mesmo canônico.
 *
 * ONDA 5: os args são o `testCommand` do ADAPTADOR da linguagem do desafio
 * (§6, membro 9) — em JavaScript, `node --test --test-reporter=spec test.mjs`,
 * exatamente o de antes. `input.language` ausente ⇒ adaptador default.
 */
export function argsDeTeste(input: ChallengeProofsInput): string[] {
  return [...adapterDoDesafio(input.language).testCommand];
}

/**
 * Monta o PROVADOR OFICIAL de provas de execução (integração F9). Compõe, por
 * chamada de prover:
 *
 *   1. `prepareIsolatedDir(baseDir, side)` — diretório NOVO e isolado por
 *      lado (solução/starter/stub nunca compartilham diretório);
 *   2. `escreverGuard(dir)` — exit-guard.cjs no diretório isolado (seam de
 *      injeção; default `escreverExitGuard`). Código sob teste não mata o
 *      runner com `process.exit(0)` forjando `ℹ tests N`. A escrita fica NO
 *      escopo de limpeza do prepare: rejeitou ⇒ limpa AQUI, nunca vaza;
 *   3. exec (hardened + limitado) com `['--require', exit-guard, ...]` + os
 *      args de teste do produto;
 *   4. `cleanupDir` SEMPRE (finally), mesmo em falha de infra;
 *   5. o veredito ESTRUTURADO de `verifyChallengeProofs` (input + env com
 *      prepare/exec/cleanup) — fail-closed: falha de infra vira `execError`,
 *      nunca exceção.
 */
export function criarProverDeDesafio(opts: CriarProverDeDesafioOptions = {}): ProverDeDesafio {
  const baseDir = opts.baseDir ?? os.tmpdir();
  const limiter = opts.limiter ?? createExecSemaphore();
  const escreverGuard = opts.escreverGuard ?? escreverExitGuard;
  // Executor default = OFICIAL do produto endurecido; exec injetado vira o
  // SUBJACENTE do mesmo endurecimento (limiter SEMPRE vale — o teto SEM_EXEC
  // é global, não depende de quem plugou o executor).
  // O EXECUTOR É POR LINGUAGEM (memoizado por adaptador): o binário do spawn
  // e a política de ambiente do filho (`envScrub`) saem do ADAPTADOR do
  // desafio, não do default. Para JavaScript o resultado é byte a byte o de
  // antes (`fromChallengeExec(nodeExec)` == `criarExecDeLinguagem(javascript)`
  // e `createHardenedExec` já defaultava para o adaptador default). O `limiter`
  // é COMPARTILHADO entre linguagens de propósito: o teto SEM_EXEC conta
  // spawns, e um spawn de Python custa uma vaga igual a um de Node.
  const execPorAdaptador = new Map<string, ExecFn>();
  const execDe = (adapter: LanguageAdapter): ExecFn => {
    const memo = execPorAdaptador.get(adapter.id);
    if (memo !== undefined) return memo;
    const base = opts.exec ?? fromChallengeExec(criarExecDeLinguagem(adapter));
    const criado = createHardenedExec({ exec: base, limiter, adapter });
    execPorAdaptador.set(adapter.id, criado);
    return criado;
  };

  return async (input): Promise<ChallengeProofsVerdict> => {
    try {
      // O ADAPTADOR do desafio (§6): decide layout, regex de path, comando de
      // teste, as duas contagens, o significado do exit code — e se a QUINTA
      // PROVA (tipos) se aplica. A resolução fica DENTRO do try porque
      // `language` desconhecido LANÇA (fail-closed no registro — nunca o parser
      // errado) e o provador NUNCA lança para o chamador.
      const adapter = opts.adapter ?? adapterDoDesafio(input.language);
      // Fail-closed: linguagem sem linha em GUARD_POR_REQUIRE LANÇA aqui e o
      // catch externo a converte em execError — nunca um spawn com a flag da
      // linguagem errada.
      const guardPorRequire = exigirPoliticaDeGuard(adapter);
      const exec = execDe(adapter);
      const env: ProofEnv = {
        exec: async (dir, _args, execOpts): Promise<ExecResult> => {
          // `--require` do exit-guard ANTES dos args de teste do produto — o
          // fluxo do verifyChallengeProofs passa o `testCommand` do adaptador;
          // aqui o modo é re-derivado do input (argsDeTeste) para espelhar o
          // challengeExec. Sem `--require` na linguagem cujo guard vive no
          // layout (ver GUARD_POR_REQUIRE).
          const args = guardPorRequire
            ? ['--require', path.join(dir, 'exit-guard.cjs'), ...argsDeTeste(input)]
            : [...argsDeTeste(input)];
          return exec(dir, args, execOpts);
        },
        /**
         * A QUINTA PROVA (`docs/16` §5.4 + `exec/typesCheck.ts`): verificação de
         * TIPO do lado da SOLUÇÃO. Três decisões visíveis aqui:
         *
         *   1. SPAWN SEPARADO, montado sobre o MESMO `exec` endurecido das
         *      rodadas de teste — nunca uma flag do `node --test` (o runner não
         *      confere tipo; Node os APAGA). Como passa pelo mesmo ExecFn, ela
         *      adquire o MESMO SEM_EXEC: `tsc` custa ordem de 1–2 s contra ~290
         *      ms de uma rodada de teste e, fora do semáforo, dominaria a F9.
         *   2. SÓ A SOLUÇÃO. `prepare` não sabe qual lado preparou (os três
         *      passam por ele), então quem dispara é o `verifyChallengeProofs`,
         *      que conhece o `solDir`. As provas 2 (starter falha) e 4 (stub
         *      vazio falha) NÃO recebem type check — o porquê está nos
         *      docstrings delas: falha de compilação as tornaria trivialmente
         *      satisfeitas.
         *   3. SEM exit-guard e SEM `--require`: o compilador não roda o código
         *      do desafio, então não há `process.exit` a bloquear.
         */
        typesCheck: criarTypesCheck({
          exec,
          adapter,
          ...(opts.resolverCompilador !== undefined ? { resolverCompilador: opts.resolverCompilador } : {}),
          timeoutMs: opts.typesTimeoutMs ?? TYPES_CHECK_TIMEOUT_MS,
        }),
        prepare: async (side) => {
          const dir = await prepareIsolatedDir(baseDir, side, adapter);
          // Nada de `exit-guard.cjs` num diretório de Python: lá o guard já
          // veio no layout (`tests/__init__.py`), e um `.cjs` solto seria lixo
          // que ninguém carrega.
          if (!guardPorRequire) return dir;
          try {
            await escreverGuard(dir);
            return dir;
          } catch (err) {
            // SEM JANELA DE VAZAMENTO (revisão adversarial — HIGH): o dir JÁ
            // EXISTE (mkdtemp resolveu) e o verifyChallengeProofs só registra
            // para limpeza DEPOIS do prepare resolver (`dirs.push` em
            // exec/proofs.ts) — se a escrita do guard rejeitar AQUI, o dir nunca
            // entraria na lista e o finally do verify não o limparia (vazaria
            // órfão no tmp). Limpa AGORA (cleanupDir é best-effort e nunca
            // lança; o catch extra é a garantia de que uma falha de limpeza não
            // mascara o erro original) e relança: prepare rejeitou ⇒ o verify
            // não registra ⇒ o veredito vira execError (fail-closed).
            await cleanupDir(dir).catch(() => {});
            throw err;
          }
        },
        cleanup: cleanupDir,
      };

      return await verifyChallengeProofs(input, env);
    } catch (err) {
      // Fail-closed (regra 1): o que o verifyChallengeProofs não converteu
      // (linguagem sem adaptador, input inválido na contagem declarada, erro
      // inesperado) vira veredito inválido com execError — o provador nunca
      // lança.
      const message = err instanceof Error ? err.message : String(err);
      return {
        valid: false,
        failures: [
          { proof: 'execError', passed: false, reason: `falha de infraestrutura nas provas: ${message}` },
        ],
        declared: 0,
        executed: 0,
        execError: message,
      };
    }
  };
}