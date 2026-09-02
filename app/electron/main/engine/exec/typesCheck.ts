/**
 * app/electron/main/engine/exec/typesCheck.ts — A QUINTA PROVA: verificação de
 * TIPOS do lado da SOLUÇÃO.
 *
 * ─── POR QUE UMA QUINTA PROVA, E NÃO UMA DOBRA DAS QUATRO ─────────────────
 *
 * As quatro provas de `docs/16-engine-de-trilha.md` §5.4 são de EXECUÇÃO:
 * 1 solução passa · 2 starter falha · 3 contagem bate · 4 stub vazio falha.
 * Uma trilha de TypeScript precisa de mais uma, porque **Node APAGA os tipos,
 * não os confere**: `node --test` roda um `.ts` transpilado e nunca reprova
 * `const n: number = 'texto'`. Sem uma prova de tipo, a trava de uma trilha de
 * TypeScript seria a trava de uma trilha de JavaScript com anotações decorativas.
 *
 * A tentação óbvia é dobrar o type check dentro das provas 2 e 4. As duas
 * seriam DESTRUÍDAS por isso, e o motivo é o mesmo nas duas: falha de
 * COMPILAÇÃO é gratuita, e uma prova que se satisfaz de graça deixa de provar.
 *
 *   - PROVA 2 (starter falha). Um starter de TypeScript quase sempre tem erro
 *     de tipo POR CONSTRUÇÃO: o corpo da função é um `TODO`, então o retorno
 *     declarado não é satisfeito e o `tsc` reprova. Se falha de `tsc` contasse
 *     como "o starter falhou", a prova 2 passaria a valer para todo starter de
 *     TypeScript, inclusive o starter que JÁ RESOLVE o exercício. Ela deixaria
 *     de provar que o aluno tem o que fazer.
 *   - PROVA 4 (stub vazio falha). O stub vazio é `export {};` — um módulo sem
 *     nenhuma exportação. Em TypeScript o `import { f } from './solution'` do
 *     arquivo de teste vira erro de COMPILAÇÃO ("has no exported member"), não
 *     erro de execução. Se falha de `tsc` contasse aqui, a prova 4 passaria
 *     SEMPRE — e ela existe exatamente para pegar o teste TAUTOLÓGICO, o
 *     teste que passa sem implementação nenhuma. Um teste tautológico continua
 *     rodando verde no `node --test` do stub; só a EXECUÇÃO o detecta.
 *
 * ⇒ As provas 2 e 4 continuam RUNTIME-ONLY (o julgamento delas em
 *   `exec/proofs.ts` lê `ExecResult.exitCode` da rodada de `node --test`, e
 *   NADA deste arquivo entra lá). A verificação de tipo é uma prova SEPARADA,
 *   aplicada SÓ ao lado da SOLUÇÃO — o único lado em que "não compila" é
 *   inequivocamente um DEFEITO DO DESAFIO, e não o estado esperado.
 *
 * ─── O QUE NÃO MUDA, E NÃO PODE MUDAR ────────────────────────────────────
 *
 * A DUPLA-IGUALDADE (contagem DECLARADA no fonte == contagem EXECUTADA no
 * relatório == `expectedTestCount`) continua obrigatória em TODA linguagem:
 * `FailurePolicy.successRequiresCountMatch` é `true` LITERAL no tipo do
 * registro (`lang/registry.ts`), e nenhum adaptador pode declarar `false`.
 * A quinta prova SOMA; ela nunca substitui a §6 obs. 3
 * (`docs/research/08-multilingua-trava-deterministica.md`): "o gate de
 * igualdade duplo é o que salva, e ele tem de continuar obrigatório em toda
 * linguagem — nunca só o exit code".
 *
 * ─── COMO ELA RODA ───────────────────────────────────────────────────────
 *
 *   - SPAWN SEPARADO, nunca uma flag do runner. `node --test` não tem modo
 *     "confira os tipos"; o compilador é outro programa. O comando montado
 *     aqui é `<node> <caminho do tsc> --noEmit …` — passado ao MESMO `ExecFn`
 *     que roda os testes, porque esse ExecFn é quem spawna o node.
 *   - SOB O MESMO SEM_EXEC. `createHardenedExec` (`exec/harness.ts`) adquire o
 *     semáforo por execução; como a checagem passa pelo mesmo ExecFn
 *     endurecido, ela concorre pelas MESMAS vagas dos testes. Isso não é
 *     detalhe: `tsc` custa da ordem de 1–2 s contra ~290 ms de uma rodada de
 *     teste — fora do semáforo, a F9 de uma trilha inteira seria dominada pelo
 *     compilador e a máquina do aluno derreteria.
 *   - OPCIONAL POR ADAPTADOR. O adaptador `javascript` NÃO exige a prova (JS
 *     não tem tipos a conferir); um adaptador `typescript` exigiria. A política
 *     vive na tabela `POLITICAS_DE_TIPOS` abaixo, indexada pelo id do
 *     adaptador, porque a interface `LanguageAdapter` do §6 tem 15 membros
 *     FECHADOS e a quinta prova não é um deles — ela é política da camada de
 *     EXECUÇÃO, que é onde este arquivo vive.
 *   - FAIL-CLOSED. Quando a política EXIGE a prova e o compilador não está na
 *     máquina, o veredito é INVÁLIDO com mensagem de degradação — nunca um
 *     verde silencioso. `typescript@5.8.3` já é dependência direta do
 *     repositório (`package.json`), então em desenvolvimento e no CI o
 *     `require.resolve` acha o binário sem instalar nada.
 */

// `node:path` é builtin: import ESTÁTICO, sem peso e sem `require` em
// variável (o padrão que o bundler não enxerga e que quebra no app
// EMPACOTADO). Este arquivo continua sem NENHUM outro import de valor.
import * as path from 'node:path';

import type { ChallengeProofSide, ExecFn, ExecResult } from './proofs';
import type { LanguageAdapter } from '../lang/registry';

// ---------------------------------------------------------------------------
// A POLÍTICA POR LINGUAGEM (o "opcional por adaptador")
// ---------------------------------------------------------------------------

export interface PoliticaDeTipos {
  /**
   * A quinta prova é EXIGIDA por esta linguagem? `false` ⇒ a prova não se
   * aplica e é julgada como passada (não como pulada em silêncio: o veredito
   * carrega `applicable: false`).
   */
  readonly required: boolean;
  /**
   * Flags do compilador, SEM o binário e SEM os arquivos (que saem do
   * `layout()` do adaptador). Vazio quando `required` é `false`.
   */
  readonly args: readonly string[];
  /** o módulo npm cujo `bin` é o compilador (`require.resolve`). */
  readonly compilador: string | null;
}

/**
 * Onde moram os `@types` do repositório — resolvido UMA vez, na carga.
 *
 * POR QUE ISSO É NECESSÁRIO, e foi medido: o diretório de execução da prova é
 * um `mkdtemp` sob `os.tmpdir()` (`exec/harness.ts:110` com o `baseDir` de
 * `phases/f9Verifier.ts:192`), e a resolução de módulo do TypeScript sobe a
 * partir do arquivo — de `/tmp/proof-exec-XXXX/` ela nunca chega a um
 * `node_modules`. Sem esta flag, o `test.ts` de TODO desafio de TypeScript
 * reprova com dois `TS2307` ("Cannot find module 'node:test'" e
 * "'node:assert/strict'"), e a quinta prova viraria um "não" constante que não
 * fala sobre o desafio nenhum. Medido, nesta máquina:
 *
 *     tsc --noEmit --strict … solution.ts test.ts
 *     # test.ts(1,18): error TS2307: Cannot find module 'node:test' …
 *     # test.ts(3,23): error TS5097: An import path can only end with a '.ts' …
 *     # EXIT=2
 *
 * O caminho sai do binário do compilador que a própria política já resolve
 * (`<node_modules>/typescript/bin/tsc` → `<node_modules>/@types`), e não de um
 * `require.resolve` novo: um só ponto de resolução, uma só forma de falhar.
 * `null` quando o compilador não está na máquina — e aí a prova já é
 * fail-closed por outro caminho (`criarTypesCheck` devolve `degradacao`).
 */
export const TYPE_ROOTS_DO_REPO: string | null = (() => {
  const tsc = resolverCompiladorNpm('typescript/bin/tsc');
  if (tsc === null) return null;
  return path.resolve(path.dirname(tsc), '..', '..', '@types');
})();

/**
 * Flags de `tsc` para conferir tipos SEM tsconfig e SEM emitir nada.
 *
 * `--noEmit` é o ponto inteiro (a prova é de TIPO, não de build). `--strict`
 * porque uma trava de tipo frouxa não trava nada: sem ele, `any` implícito
 * passaria e a prova aprovaria o mesmo código que Node aprovaria.
 * `--skipLibCheck` porque os `.d.ts` de terceiros não são o artefato sob prova
 * e um erro lá viraria falha do DESAFIO. `--pretty false` porque a saída de
 * diagnóstico entra numa `reason` de `ProofJudgement`, e código ANSI ali só
 * suja o relatório (a mesma armadilha que o parser de contagem já trata).
 *
 * ─── AS TRÊS FLAGS QUE MUDARAM NA ONDA 6, CADA UMA POR MEDIÇÃO ────────────
 *
 * `--module nodenext --moduleResolution nodenext` (era `ESNext`/`bundler`).
 * O runner é o `node --test` — e `bundler` aprova um programa que o runner
 * REJEITA. Medido, sobre o MESMO par de arquivos com `import { f } from
 * './solution'` (sem extensão):
 *
 *     moduleResolution bundler  → EXIT=0     (o tsc aprova)
 *     moduleResolution nodenext → EXIT=2     TS2835: "Relative import paths
 *                                            need explicit file extensions…"
 *     node --test test.ts       → EXIT=1     (ERR_MODULE_NOT_FOUND)
 *
 * Uma prova de tipo que aprova o que o runtime derruba não é uma prova a mais:
 * é uma segunda opinião errada. `nodenext` é o único modo que modela o que o
 * Node de fato faz — e a medição é a tabela logo acima, refeita nesta máquina.
 *
 * `--allowImportingTsExtensions` porque o teste de um desafio importa
 * `from './solution.ts'` com a extensão EXPLÍCITA (é o que o ESM do Node pede,
 * e é o que `lang/typescript.ts` escreve em `TS_ENTRY_PATH`); sem a flag isso é
 * `TS5097` — erro de configuração do provador, não do desafio. Ela exige
 * `--noEmit`, que já está aqui. Travado em `tests/engineLangTypescript.test.ts`
 * §"os args do tsc são os medidos".
 *
 * `--typeRoots <@types> --types node` porque o diretório da prova não tem
 * `node_modules` (ver `TYPE_ROOTS_DO_REPO`). `--types node` restringe a
 * inclusão automática ao pacote que o harness usa, e isso não é higiene: sem
 * ele o compilador carrega TODO `@types` do repositório (react, katex, babel…)
 * em cada prova. Medido: 373/388/405 ms com `--types node` contra 531/538 ms
 * sem — e o `tsc` já é ~6× a rodada de teste.
 */
export const TSC_NOEMIT_ARGS: readonly string[] = [
  '--noEmit',
  '--strict',
  '--skipLibCheck',
  '--pretty',
  'false',
  '--target',
  'ES2022',
  '--module',
  'nodenext',
  '--moduleResolution',
  'nodenext',
  '--allowImportingTsExtensions',
  ...(TYPE_ROOTS_DO_REPO === null ? [] : ['--typeRoots', TYPE_ROOTS_DO_REPO, '--types', 'node']),
];

/**
 * A tabela de política, por id de adaptador.
 *
 * `javascript` está aqui EXPLÍCITO com `required: false` — não por omissão. A
 * entrada `typescript` foi escrita antes do adaptador existir, porque ela é o
 * alvo declarado do §7, item 2 do documento de multilíngua ("TypeScript … é
 * aqui que se descobre se a arquitetura de adaptadores aguenta uma segunda
 * camada de trava (a semântica de tipos)").
 *
 * ONDA 6: `lang/typescript.ts` existe, e a promessa se cumpriu — a quinta
 * prova ligou para ele SEM UMA LINHA em `exec/proofs.ts`. O que a chegada do
 * adaptador real mudou aqui foi só o CONTEÚDO de `TSC_NOEMIT_ARGS` (as três
 * flags documentadas acima), porque só com um `layout()` de verdade — o
 * `test.ts` importando `./solution.ts` com extensão explícita, num diretório
 * `mkdtemp` sem `node_modules` — dava para MEDIR o que o compilador precisa
 * para julgar o desafio em vez de reprovar a própria montagem.
 */
export const POLITICAS_DE_TIPOS: Readonly<Record<string, PoliticaDeTipos>> = Object.freeze({
  javascript: { required: false, args: [], compilador: null },
  typescript: { required: true, args: TSC_NOEMIT_ARGS, compilador: 'typescript/bin/tsc' },
});

/**
 * A política de UM adaptador. Linguagem sem entrada na tabela NÃO exige a
 * prova — e isso é a resposta certa, não um fail-open: a esmagadora maioria
 * das linguagens não tem etapa de checagem de tipo separada da execução, e o
 * que NUNCA pode ser afrouxado (a dupla-igualdade de contagem) é invariante do
 * tipo `FailurePolicy`, não desta tabela.
 */
export function politicaDeTipos(adapterId: string): PoliticaDeTipos {
  return POLITICAS_DE_TIPOS[adapterId] ?? { required: false, args: [], compilador: null };
}

// ---------------------------------------------------------------------------
// O RESULTADO (o que a prova 5 julga) e a função injetável que o produz
// ---------------------------------------------------------------------------

export interface TypesCheckResult {
  /** a linguagem EXIGE esta prova? `false` ⇒ prova não aplicável (passa). */
  applicable: boolean;
  /** a checagem passou? (`true` por vacuidade quando não aplicável). */
  ok: boolean;
  /** diagnósticos do compilador (vazio quando `ok`). */
  output: string;
  /** exit code do compilador (0 quando não aplicável). */
  exitCode: number;
  /** por que a prova não pôde rodar (toolchain ausente) — `null` quando rodou. */
  degradacao: string | null;
}

/**
 * A quinta prova, INJETÁVEL como todo o resto da execução (A-P07-2): recebe o
 * diretório isolado da SOLUÇÃO e o lado que foi escrito nele; devolve o
 * resultado. A suíte injeta um fake e NÃO gera processo real.
 */
export type TypesCheckFn = (
  dir: string,
  side: ChallengeProofSide & { testsCode: string },
) => Promise<TypesCheckResult>;

/** O resultado de "esta linguagem não exige a prova" — passa, e diz por quê. */
export const TYPES_CHECK_NAO_APLICAVEL: TypesCheckResult = Object.freeze({
  applicable: false,
  ok: true,
  output: '',
  exitCode: 0,
  degradacao: null,
});

/**
 * Resolve o binário do compilador do módulo npm pedido pela política.
 * `null` quando o módulo não está na máquina (produção empacotada, por
 * exemplo: `typescript` é devDependency e não viaja no app).
 *
 * O `require` é POSTERGADO e recebe o nome por VARIÁVEL, pelo mesmo motivo de
 * `lang/javascript.ts`: o bundler do `electron-vite` não consegue (nem deve)
 * resolver estaticamente um binário de devDependency.
 */
export function resolverCompiladorNpm(modulo: string): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require.resolve(modulo);
  } catch {
    return null;
  }
}

/**
 * Os ARQUIVOS que o compilador recebe: tudo o que o `layout()` do adaptador
 * escreve, MENOS o manifesto do runtime (`package.json` não é fonte).
 * PURA — é o que torna a montagem do comando testável sem spawn.
 *
 * O arquivo de TESTE entra de propósito: metade dos erros de tipo de um
 * desafio mora na fronteira entre o teste e a solução (assinatura exportada
 * que o teste chama com outro tipo), e conferir só a solução deixaria passar
 * exatamente o caso que interessa.
 */
export function alvosDaChecagem(
  adapter: LanguageAdapter,
  side: ChallengeProofSide & { testsCode: string },
): string[] {
  const layout = adapter.layout({ code: side.code, files: side.files, testsCode: side.testsCode });
  return layout.files.filter((f) => f.path !== layout.manifestPath).map((f) => f.path);
}

export interface CriarTypesCheckOptions {
  /** o MESMO ExecFn endurecido dos testes — é ele que carrega o SEM_EXEC. */
  exec: ExecFn;
  /** o adaptador da linguagem do desafio (decide política e arquivos). */
  adapter: LanguageAdapter;
  /** seam de injeção do resolvedor de binário (o teste injeta o seu). */
  resolverCompilador?: (modulo: string) => string | null;
  /** teto de tempo do compilador (o `tsc` é mais lento que a rodada de teste). */
  timeoutMs?: number;
}

/**
 * Monta a quinta prova em torno de um ExecFn. NÃO spawna nada por si: delega
 * ao `exec` recebido, que no provador oficial é o `createHardenedExec` — daí a
 * checagem herdar SEM_EXEC, env endurecido e teto de tempo de graça.
 */
export function criarTypesCheck(opts: CriarTypesCheckOptions): TypesCheckFn {
  const resolver = opts.resolverCompilador ?? resolverCompiladorNpm;
  return async (dir, side): Promise<TypesCheckResult> => {
    const politica = politicaDeTipos(opts.adapter.id);
    if (!politica.required) return TYPES_CHECK_NAO_APLICAVEL;

    const modulo = politica.compilador;
    const binario = modulo === null ? null : resolver(modulo);
    if (binario === null) {
      return {
        applicable: true,
        ok: false,
        output: '',
        exitCode: -1,
        degradacao:
          `compilador de tipos ausente para ${opts.adapter.label}` +
          `${modulo === null ? '' : ` (${modulo} não resolveu)`} — a prova de TIPO não pôde rodar; ` +
          'fail-closed: um desafio de linguagem tipada não é aprovado sem ela',
      };
    }

    const args = [binario, ...politica.args, ...alvosDaChecagem(opts.adapter, side)];
    const res: ExecResult = await opts.exec(
      dir,
      args,
      opts.timeoutMs !== undefined ? { timeoutMs: opts.timeoutMs } : {},
    );
    return {
      applicable: true,
      ok: !opts.adapter.failureExitCodes.isFailure(res.exitCode),
      output: `${res.stdout}\n${res.stderr}`.trim(),
      exitCode: res.exitCode,
      degradacao: null,
    };
  };
}
