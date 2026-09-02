/**
 * app/electron/main/engine/lang/registry.ts — O REGISTRO DE ADAPTADORES DE
 * LINGUAGEM (a costura multilíngua).
 *
 * Fonte NORMATIVA: `docs/research/08-multilingua-trava-deterministica.md` §6
 * (linhas 855-957) e §7 (linhas 960-991). O §6 especifica o registro como uma
 * TABELA de 15 responsabilidades por linguagem; este arquivo é essa tabela em
 * forma de tipo, e `javascript.ts` é a primeira linha dela.
 *
 * O problema que o registro resolve (§6, primeiro parágrafo):
 *
 *     export type TrackChallengeLanguage = 'nodejs';
 *
 *   "O primeiro problema é conceitual: `'nodejs'` não é uma linguagem, é um
 *    runtime. A linguagem é `javascript`; `nodejs` é o par (toolchain, runner).
 *    Enquanto os dois estiverem no mesmo campo, é impossível dizer 'TypeScript
 *    rodando em Node' ou 'JavaScript rodando em Deno'."
 *
 * Por isso o registro separa DOIS vocabulários:
 *   - `LanguageId`             — a LINGUAGEM (`javascript`), chave do adaptador;
 *   - `ChallengeLanguageToken` — o que `challenge.language` aceita hoje no
 *     disco, que inclui o alias de RUNTIME `'nodejs'` (as 112 trilhas do disco
 *     dizem `"language": "nodejs"` e continuam válidas — a compatibilidade é
 *     requisito, não gentileza).
 *
 * ─── TRÊS DECISÕES DE DESENHO, TODAS COM MOTIVO ───────────────────────────
 *
 * 1. A ASSINATURA É SÍNCRONA, E ISSO É DELIBERADO.
 *    O adaptador de Python vai chamar o `ast` do CPython por `spawnSync` (§7,
 *    item 3: "é aqui que se prova que o adaptador de Porta 1 pode ser um
 *    SUBPROCESSO e não só uma lib npm"). Tornar `parse`/`resolveScopes`/
 *    `inventory` assíncronos obrigaria a converter ~20 call sites de
 *    `engine/extract.ts` (`coletarOcorrencias`, `extractAtoms`,
 *    `extractAllOccurrences`, `countTestDeclarations` e todo o `budget.ts`/
 *    `audit.ts` que os chama em laço) — e explodiria o escopo das outras três
 *    sub-tarefas da onda 5. `spawnSync` é a ferramenta certa para uma etapa de
 *    build determinística; `async` aqui seria contágio sem ganho.
 *
 * 2. FAIL-CLOSED NA RESOLUÇÃO. `getAdapter(id)` de id desconhecido LANÇA
 *    `LanguageRegistryError` (erro estruturado, com a lista de ids conhecidos)
 *    — nunca cai em default silencioso. Cair no default é exatamente como um
 *    gate multilíngua passa a mentir: um `challenge.language: 'python'` num
 *    mundo sem adaptador de Python seria auditado com o parser de JavaScript e
 *    aprovaria qualquer coisa. Quem QUER o comportamento tolerante pede
 *    explicitamente (`findAdapter`, que devolve `null`).
 *
 * 3. `envScrub` É ALLOWLIST (§6, observação 2): "Cada linguagem tem o seu
 *    veneno (`GOFLAGS`, `GOCACHE`, `RUSTFLAGS`, `CARGO_TARGET_DIR`,
 *    `PYTHONPATH`, `CLASSPATH`, `DOTNET_*`), e a lista nunca vai estar
 *    completa. O correto é montar o ambiente do filho a partir de uma
 *    allowlist explícita mais `LC_ALL=C.UTF-8 TZ=UTC PYTHONHASHSEED=0`."
 *    O núcleo comum (`ENV_NUCLEO_COMUM`, `ENV_ALLOWLIST_COMUM`) vive AQUI,
 *    para que nenhuma linguagem invente o próprio determinismo.
 *
 * ─── O QUE ESTE ARQUIVO NÃO FAZ ───────────────────────────────────────────
 * Não parseia nada (é o adaptador), não decide o que é permitido (é
 * `budget.ts`), não lê trilha (é `audit.ts`) e não importa NADA em tempo de
 * execução além do adaptador default — `content/trackTypes.ts` depende deste
 * módulo, e `content/trackTypes.ts` é carregado pelo loader de conteúdo:
 * puxar `typescript` ou `node:child_process` por import estático aqui poria o
 * compilador inteiro no caminho de quem só quer abrir uma aula.
 */

import { javascriptAdapter } from './javascript';
import { pythonAdapter } from './python';
import { typescriptAdapter } from './typescript';

// ---------------------------------------------------------------------------
// Vocabulário FECHADO de ids (o enum de linguagens que a engine conhece)
// ---------------------------------------------------------------------------

/**
 * Os ids de LINGUAGEM que a engine conhece. Lista literal (não derivada do
 * registro em runtime) porque ela é a fonte do TIPO `LanguageId` — e o tipo é
 * o contrato que o schema de trilha, o loader e os prompts usam.
 *
 * ONDA 5: `python` é a SEGUNDA linha, e ela é a prova da arquitetura — o
 * adaptador dela parseia por SUBPROCESSO (`python3 -I -S` + o `ast`/`symtable`
 * da stdlib), não por lib npm (§7 item 3). Adicionar uma linguagem continua
 * sendo UMA linha aqui + um arquivo `lang/<id>.ts` + um `registerAdapter` no
 * fim deste arquivo. A ordem do §7 (linhas 960-991) é:
 * javascript → typescript → python → go → ruby → …
 * O teste `tests/engineLangRegistry.test.ts` cobra que esta lista e os
 * adaptadores REGISTRADOS não divirjam (lista sem adaptador = id fantasma).
 *
 * ONDA 6: `typescript` fecha a fila do §7 até Go. Ele é a prova da SEGUNDA
 * CAMADA DE TRAVA (a semântica de tipos): mesmo runner, mesmo `SyntaxKind`,
 * mesmo vocabulário — e uma prova a mais, a QUINTA (`exec/typesCheck.ts`),
 * porque Node APAGA os tipos em vez de conferi-los.
 */
export const KNOWN_LANGUAGE_IDS = ['javascript', 'python', 'typescript'] as const;

/** Um id de linguagem conhecido (`'javascript'`, `'python'`, `'typescript'`). */
export type LanguageId = (typeof KNOWN_LANGUAGE_IDS)[number];

/**
 * O adaptador DEFAULT — a linguagem da trilha que já existe (§7, item 1:
 * "JavaScript. Não é escolha, é obrigação"). É o default de `TrackSource.
 * programmingLanguage` e o parser de bloco de teoria SEM tag.
 */
export const DEFAULT_ADAPTER_ID: LanguageId = 'javascript';

/**
 * Os tokens aceitos em `challenge.language` e em `track.programmingLanguage`.
 * União dos `id` com os `runtimeAliases` de cada adaptador — declarada como
 * literal pelo mesmo motivo de `KNOWN_LANGUAGE_IDS` (é a fonte do tipo).
 *
 * `'nodejs'` está aqui porque é o que as 112 trilhas do disco declaram. Ele
 * NÃO é uma linguagem (§6): é o runtime do par (javascript, node). O registro
 * o resolve para `'javascript'` em `adapterIdForChallengeLanguage`. Pelo mesmo
 * motivo `'python3'` e `'cpython'` acompanham `'python'`: o primeiro é o nome
 * do BINÁRIO e o segundo o da IMPLEMENTAÇÃO — nenhum dos dois é a linguagem.
 * E `'ts'` acompanha `'typescript'` como grafia curta (é a extensão do arquivo
 * e a tag da cerca); `docs/18-trilha-typescript.md` crava `'typescript'` no
 * `challenge.json`, e aceitar as duas evita reprovar uma trilha por escrever a
 * mesma coisa com dois nomes.
 */
export const KNOWN_CHALLENGE_LANGUAGES = [
  'javascript',
  'nodejs',
  'python',
  'python3',
  'cpython',
  'typescript',
  'ts',
] as const;

/** Valor válido de `challenge.language` / `track.programmingLanguage`. */
export type ChallengeLanguageToken = (typeof KNOWN_CHALLENGE_LANGUAGES)[number];

/**
 * O DEFAULT de `challenge.language`. Continua sendo `'nodejs'` — mudar isso
 * reescreveria 112 arquivos de desafio no disco por motivo estético, e o §6
 * pede separação de campos, não renomeação de dados existentes.
 */
export const DEFAULT_CHALLENGE_LANGUAGE: ChallengeLanguageToken = 'nodejs';

/**
 * O DEFAULT de `track.runtime` (§6, linhas 918-927: "toolchain + versão
 * pinada — o inventário depende dela"). Para JavaScript o par é
 * (javascript, nodejs); a versão pinada entra quando o inventário passar a
 * ser gerado por runtime (hoje ele sai do `ts.SyntaxKind` do compilador
 * embutido, que é pinado pelo `package.json`).
 */
export const DEFAULT_RUNTIME = 'nodejs';

// ---------------------------------------------------------------------------
// Tags de bloco de código da TEORIA (o campo que escolhe o parser)
// ---------------------------------------------------------------------------

/**
 * Tags de bloco cercado / de `TrackTheorySection.code.language` que NÃO são
 * linguagem de programação analisável: dados, protocolo, saída de terminal e
 * prosa. Um bloco com uma destas tags NÃO vai para parser nenhum — e isso é
 * uma decisão de conteúdo, não um esquecimento.
 *
 * A lista existe porque o §6 (linha 954) pede que `TrackTheorySection.code.
 * language` vire enum "porque é ela que diz ao extrator qual parser aplicar a
 * cada bloco cercado da teoria". Sem o lado NÃO-CÓDIGO, o enum reprovaria os
 * blocos `json` e `http` que a trilha real já tem no disco (medido:
 * `grep -rho '"language": *"[^"]*"' app/resources/tracks` → js 148,
 * javascript 20, http 1, json 1).
 */
export const NON_CODE_THEORY_TAGS = [
  'json',
  'jsonc',
  'http',
  'bash',
  'sh',
  'shell',
  'zsh',
  'console',
  'terminal',
  'output',
  'text',
  'txt',
  'plain',
  'md',
  'markdown',
  'diff',
  'yaml',
  'yml',
  'toml',
  'ini',
  'env',
  'csv',
  'xml',
  'log',
  // Transcrição de REPL do Python (`>>> ...` + saída): NÃO é Python
  // parseável. Sem esta linha o bloco cairia em 'desconhecida' ou, pior,
  // iria para o parser e viraria PARSE_ERROR num texto que está correto.
  'pycon',
  'py-repl',
  'traceback',
] as const;

/** Uma tag de bloco declaradamente NÃO analisável (dados/prosa/saída). */
export type NonCodeTheoryTag = (typeof NON_CODE_THEORY_TAGS)[number];

/**
 * A tag de linguagem de um bloco de código da teoria.
 *
 * ABERTA POR CONSTRUÇÃO, e o motivo é concreto: `engine/phases/
 * f12Materialize.ts:416` escreve `code: { language: secao.tag }` com a tag
 * CRUA da cerca que o autor (LLM) emitiu — fechar o tipo aqui quebraria a
 * compilação de um arquivo que pertence a outra sub-tarefa. O fechamento REAL
 * é o resolvedor `adapterIdForTheoryTag`, que é TOTAL: toda tag cai em
 * exatamente um de três baldes (adaptador · não-código · desconhecida), e
 * `classifyTheoryTag` devolve qual.
 *
 * A união literal existe para autocompletar e para documentar o universo
 * conhecido; `(string & {})` mantém `string` atribuível.
 */
export type TheoryCodeLanguage = LanguageId | NonCodeTheoryTag | (string & {});

/** Como uma tag de bloco de teoria foi classificada pelo registro. */
export type TheoryTagKind = 'codigo' | 'nao-codigo' | 'desconhecida' | 'ausente';

export interface TheoryTagClassification {
  kind: TheoryTagKind;
  /** adaptador a aplicar; `null` quando o bloco não vai a parser nenhum. */
  adapterId: LanguageId | null;
  /** a tag normalizada (minúscula, sem espaços) — `''` quando ausente. */
  tag: string;
}

// ---------------------------------------------------------------------------
// (1) parse(source) — Porta 1: o AST normalizado
// ---------------------------------------------------------------------------

/**
 * Um nó de AST NORMALIZADO. É o formato mínimo que o extrator precisa para
 * emitir uma `AtomOccurrence` — que hoje exige `line`, `column` e os offsets
 * absolutos `start`/`end` (`engine/extract.ts:69-85`: os offsets são o que a
 * bateria A13–A16 usa para classificar a ocorrência dentro/fora dos spans
 * mecânicos S13 e para a contagem por linha do A14b).
 *
 * `attributes` é o que o §6 quer dizer com "tipo + atributo, não só tipo":
 * `BinaryExpression[operator='!==']`. Metade da didática está no atributo
 * (`atomKeys.ts:11-16`), e um AST normalizado que só carregasse `type` não
 * distinguiria a aula de `let` da aula de `const`.
 *
 * `native` carrega o nó da árvore ORIGINAL (um `ts.Node`, um `dict` do `ast`
 * do Python já desserializado, …) — o adaptador é livre para usá-lo nos
 * próprios membros; nenhum consumidor genérico deve tocá-lo.
 */
export interface LangNode {
  /** tipo do nó, do enum fechado de `inventory()` (ex.: `IfStatement`). */
  type: string;
  /** 1-based, como todo editor mostra. */
  line: number;
  /** 1-based. */
  column: number;
  /** offset absoluto 0-based do início no fonte. */
  start: number;
  /** offset absoluto do fim (exclusivo). */
  end: number;
  /** texto do nó no fonte (o `snippet` da ocorrência sai daqui). */
  text: string;
  /** atributos que participam da chave (`operator`, `kind`, `name`, …). */
  attributes: Readonly<Record<string, string>>;
  children: readonly LangNode[];
  /** o nó da árvore nativa do adaptador (opaco para consumidores). */
  native?: unknown;
  /**
   * NÓ PORTADOR: ele NÃO existe na árvore nativa — o adaptador o criou para
   * carregar uma distinção que o parser da linguagem colapsa (ONDA 7, aditivo).
   *
   * Por que a caminhada genérica precisa saber disso. Ela emite DUAS chaves por
   * nó — a específica (`constructKey`) e a genérica (`node:<type>`) —, como o
   * repositório já faz com `node:ComputedNonLiteralAccess` ao lado de
   * `node:ElementAccessExpression`. Para um nó portador a genérica seria LIXO:
   * o `Binding` que o adaptador Python cria para distinguir `a, b = 1, 2` de
   * `x = 1` viraria `node:Binding`, que não existe em `inventory()` e que
   * nenhum orçamento poderia declarar. Marcado como `synthetic`, o nó rende
   * SÓ a chave de `constructKey` (`decl:unpack`), que é a que tem valor.
   *
   * ATENÇÃO — `synthetic` não quer dizer "fora do inventário": `Elif`,
   * `MethodDef` e `IntLiteral` também são portadores e ESTÃO no inventário,
   * porque para eles `constructKey` já devolve `node:<type>`. O campo diz de
   * onde o nó veio, não em que eixo ele cai.
   */
  synthetic?: boolean;
}

export interface ParseOk {
  ok: true;
  root: LangNode;
  /** o fonte que foi parseado (os offsets de `LangNode` indexam ESTA string). */
  source: string;
  /** a árvore NATIVA completa (ex.: o `ts.SourceFile`). */
  native: unknown;
}

export interface ParseFailed {
  ok: false;
  /** MESMO formato de `ExtractError` (`engine/extract.ts:105-108`). */
  error: { code: 'PARSE_ERROR'; message: string; line: number; column: number };
}

/**
 * O resultado de `parse`. Fail-closed: erro de sintaxe é ERRO ESTRUTURADO,
 * nunca exceção solta e nunca árvore parcial — o extrator de hoje já depende
 * disso (`extract.ts:344-357`).
 */
export type ParseResult = ParseOk | ParseFailed;

export interface ParseOptions {
  /** nome usado nas mensagens (NÃO abre arquivo — o fonte vem em `source`). */
  fileName?: string;
  /** dialeto do adaptador (JS: `'js'` default | `'ts'`). */
  dialect?: string;
}

// ---------------------------------------------------------------------------
// (5) resolveScopes(AST) — o que separa Tier A de Tier C
// ---------------------------------------------------------------------------

/**
 * Resolução de escopo: quais nomes são declarados no arquivo, quais vêm de
 * import e quais sobraram (candidatos a global).
 *
 * O §7 fecha com "nunca promover uma linguagem a Tier A sem resolução de
 * escopo" — é este membro que decide o tier. O adaptador JS de hoje entrega a
 * versão PLANA e o limite está DECLARADO (`extract.ts:38-43`): junta todos os
 * nomes declarados no arquivo e trata como global o identificador que sobrou;
 * um `const console = …` deliberado faria o extrator deixar de reportar
 * `global:console`.
 */
export interface ScopeResolution {
  /** todo nome declarado no arquivo (var/let/const/função/classe/param/…). */
  declared: ReadonlySet<string>;
  /** nomes trazidos por import (subconjunto de `declared`). */
  imported: ReadonlySet<string>;
  /** nomes usados e NÃO declarados — candidatos a global. */
  free: ReadonlySet<string>;
  /** `free` ∩ `globals()` — os globais de runtime efetivamente usados. */
  globals: ReadonlySet<string>;
}

// ---------------------------------------------------------------------------
// (7) layout(challenge) — os arquivos do desafio e o manifesto obrigatório
// ---------------------------------------------------------------------------

/** O material de UM lado da prova (solução, starter ou stub vazio). */
export interface ChallengeLayoutInput {
  /** código do lado quando o desafio é de arquivo único. */
  code: string;
  /** desafio MULTI-ARQUIVO: caminho relativo + código de cada arquivo. */
  files?: readonly { path: string; code: string }[];
  /** o arquivo de teste (a especificação executável). */
  testsCode: string;
}

export interface ChallengeLayoutFile {
  /** caminho relativo ao diretório de execução. */
  path: string;
  content: string;
}

/**
 * O layout em disco de um desafio. §6, observação 1: "com Go o arquivo tem de
 * terminar em `_test.go` e ficar no mesmo pacote; com Java o nome do arquivo
 * tem de ser exatamente o da classe pública; com Rust o fonte vive em `src/`.
 * O regex vira um campo do adaptador, e o `layout` deixa de ser implícito."
 */
export interface ChallengeLayout {
  /** TODO arquivo a escrever, na ordem de escrita (manifesto incluso). */
  files: readonly ChallengeLayoutFile[];
  /** o arquivo que o teste importa (JS: `solution.mjs`). */
  entryPath: string;
  /** o arquivo de teste (JS: `test.mjs`). */
  testPath: string;
  /** manifesto obrigatório do runtime (JS: `package.json`), ou `null`. */
  manifestPath: string | null;
}

// ---------------------------------------------------------------------------
// (11)(12) contagem e checks do relatório do runner
// ---------------------------------------------------------------------------

/**
 * As contagens EXECUTADAS lidas da saída do runner. `skipped` existe porque a
 * prova 1 exige passagem INTEGRAL (`proofs.ts:197`): um teste pulado não é
 * "passou em todos os testes".
 */
export interface RunCounts {
  testsRun: number;
  pass: number;
  fail: number;
  skipped: number;
}

/** UM check individual do relatório, para a UI do aluno. */
export interface RunCheck {
  name: string;
  passed: boolean;
}

// ---------------------------------------------------------------------------
// (13) failureExitCodes — "passed = exitCode === 0" NÃO é universal
// ---------------------------------------------------------------------------

/**
 * Como se reconhece FALHA nesta linguagem. §6, observação 3: "R sai 0 com
 * teste quebrado; Go sai 0 quando não achou arquivo de teste; Node sai 0 com
 * arquivo de teste vazio. O gate de igualdade duplo é o que salva, e ele tem
 * de continuar obrigatório em toda linguagem — nunca só o exit code."
 *
 * Por isso `successRequiresCountMatch` é `true` LITERAL no tipo: nenhum
 * adaptador pode declarar `false`. A dupla-igualdade (contagem DECLARADA no
 * fonte == contagem EXECUTADA no relatório == `expectedTestCount`) é
 * invariante da engine, não política por linguagem.
 */
export interface FailurePolicy {
  /** verdadeiro quando este exit code significa FALHA (JS: `code !== 0`). */
  isFailure(exitCode: number): boolean;
  /** rótulo humano do exit code (137 = "timeout-ou-OOM", nunca "qual dos dois"). */
  meaning(exitCode: number): string;
  /** INVARIANTE §6 obs.3 — exit 0 sozinho NUNCA prova sucesso. */
  readonly successRequiresCountMatch: true;
}

// ---------------------------------------------------------------------------
// (14) envScrub — ALLOWLIST (§6 obs. 2)
// ---------------------------------------------------------------------------

/**
 * O núcleo COMUM de determinismo do ambiente do filho, igual em toda
 * linguagem (§6 obs. 2 e §7 de `skills/study-method/references/languages.md`).
 * Ordenação de collation e fuso mudam o resultado de teste em qualquer
 * linguagem que ordene strings ou formate data.
 */
export const ENV_NUCLEO_COMUM: Readonly<Record<string, string>> = Object.freeze({
  LC_ALL: 'C.UTF-8',
  TZ: 'UTC',
});

/**
 * As variáveis que TODA linguagem precisa herdar para o binário sequer ser
 * encontrado. Allowlist mínima; cada adaptador ACRESCENTA as suas
 * (`envScrub.allow`), nunca substitui esta.
 */
export const ENV_ALLOWLIST_COMUM: readonly string[] = Object.freeze([
  'PATH',
  'HOME',
  'TMPDIR',
  'TEMP',
  'TMP',
  'SystemRoot', // Windows: sem ela o próprio spawn falha
  'COMSPEC',
  'PATHEXT',
]);

/**
 * A política de ambiente do processo filho.
 *
 * DUAS SEMÂNTICAS CONVIVEM AQUI DE PROPÓSITO, e a diferença é a mudança de
 * comportamento que a onda 5 tem de fazer DELIBERADAMENTE:
 *
 *   - `allow` + `fixed` → `applyEnvScrub` = a ALLOWLIST do §6 obs. 2 (o
 *     ambiente do filho é CONSTRUÍDO, não herdado). É o alvo normativo.
 *   - `strip` + `fixed` → `applyLegacyEnvScrub` = EXATAMENTE o que
 *     `engine/exec/harness.ts:207-217` (`buildChildEnv`) faz hoje: copia o
 *     ambiente inteiro e apaga uma denylist. É o comportamento vigente e o
 *     que esta onda preserva byte a byte.
 *
 * Trocar `applyLegacyEnvScrub` por `applyEnvScrub` MUDA o ambiente de todo
 * processo filho de prova — precisa do próprio teste e da própria linha no
 * relatório da onda. Não é refactor; é decisão.
 */
export interface EnvScrubPolicy {
  /**
   * ALLOWLIST: os EXTRAS desta linguagem. `applyEnvScrub` já une a
   * `ENV_ALLOWLIST_COMUM` — nenhum adaptador pode esquecer o mínimo (sem
   * `PATH` o spawn nem acha o binário) nem redefini-lo por conta própria.
   */
  allow: readonly string[];
  /**
   * Valores IMPOSTOS ao filho, ESPECÍFICOS desta linguagem. `applyEnvScrub`
   * injeta o `ENV_NUCLEO_COMUM` antes destes; `applyLegacyEnvScrub` NÃO
   * injeta o núcleo (é o comportamento vigente, que não o tem).
   */
  fixed: Readonly<Record<string, string>>;
  /** DENYLIST residual — o veneno específico, apagado nas duas semânticas. */
  strip: readonly string[];
  /** o que esta política cobre e o que NÃO cobre (honestidade de limite). */
  scope: readonly string[];
}

/** Um ambiente de processo (o mesmo shape de `NodeJS.ProcessEnv`). */
export type ChildEnv = Record<string, string | undefined>;

/**
 * ALLOWLIST (§6 obs. 2): monta o ambiente do filho a partir do NADA — só o
 * que a política permite herdar, mais os valores impostos, menos o veneno.
 * PURA: nunca muta `base`.
 */
export function applyEnvScrub(policy: EnvScrubPolicy, base: ChildEnv): ChildEnv {
  const env: ChildEnv = {};
  for (const nome of [...ENV_ALLOWLIST_COMUM, ...policy.allow]) {
    const valor = base[nome];
    if (valor !== undefined) env[nome] = valor;
  }
  Object.assign(env, ENV_NUCLEO_COMUM, policy.fixed);
  for (const nome of policy.strip) delete env[nome];
  return env;
}

/**
 * DENYLIST (o comportamento VIGENTE): copia o ambiente do pai e apaga o
 * veneno. Reprodução fiel de `buildChildEnv` (`engine/exec/harness.ts:212`) —
 * existe para que a onda 5 possa trocar a fonte SEM trocar o comportamento no
 * mesmo commit. PURA: nunca muta `base`.
 */
export function applyLegacyEnvScrub(policy: EnvScrubPolicy, base: ChildEnv): ChildEnv {
  const env: ChildEnv = { ...base };
  for (const nome of policy.strip) delete env[nome];
  Object.assign(env, policy.fixed);
  return env;
}

// ---------------------------------------------------------------------------
// (15) detect() — `command -v` + versão, e a mensagem de degradação
// ---------------------------------------------------------------------------

/**
 * O resultado de detectar a toolchain. A "mensagem de degradação" do §6 é o
 * campo `degradacao`: quando a toolchain não está na máquina, o produto tem
 * de DIZER o que deixou de funcionar — nunca falhar em silêncio nem fingir
 * que rodou.
 */
export interface DetectResult {
  ok: boolean;
  /** binário resolvido (o que iria para o `spawn`). */
  binary: string;
  /** versão detectada, ou `null` quando não foi possível apurar. */
  version: string | null;
  /** mensagem de degradação quando `ok === false`; `null` quando ok. */
  degradacao: string | null;
}

// ---------------------------------------------------------------------------
// A INTERFACE — os 15 membros do §6 (linhas 866-891), em ordem
// ---------------------------------------------------------------------------

/**
 * Um adaptador de linguagem. Implementar os 15 membros é o que basta para a
 * engine inteira (extrator, orçamento, provas, auditoria, relatório) passar a
 * valer para a linguagem nova — nada mais da engine é por linguagem (§6, "O
 * que continua COMUM": a álgebra do orçamento, `cumulative(N)`, as três
 * direções, o formato `arquivo:linha:coluna` e as provas por execução).
 *
 * Cada membro documenta O QUE ELE SUBSTITUI HOJE, com arquivo:linha, para que
 * quem implementar Python saiba exatamente o que está portando.
 */
export interface LanguageAdapter {
  // ── identidade ───────────────────────────────────────────────────────────

  /** o id da LINGUAGEM (`'javascript'`), chave do registro. */
  readonly id: LanguageId;
  /** nome humano, para mensagem de erro e relatório. */
  readonly label: string;
  /**
   * tokens que `challenge.language`/`track.programmingLanguage` podem trazer
   * e que resolvem para ESTE adaptador — inclui o próprio `id` e os aliases
   * de RUNTIME (`'nodejs'` para javascript). §6: "`nodejs` é o par
   * (toolchain, runner)", não a linguagem.
   */
  readonly challengeLanguages: readonly ChallengeLanguageToken[];
  /** o `track.runtime` default desta linguagem (§6 linhas 918-927). */
  readonly defaultRuntime: string;
  /**
   * tags de bloco cercado / `TrackTheorySection.code.language` que a engine
   * manda para o parser DESTE adaptador.
   * SUBSTITUI: `JS_FENCE_TAGS` (`engine/theoryCode.ts:32`).
   */
  readonly theoryFenceTags: readonly string[];

  // ── (1) Porta 1: a árvore ────────────────────────────────────────────────

  /**
   * Parseia o fonte e devolve a árvore normalizada.
   * SUBSTITUI: `ts.createSourceFile` + `syntaxDiagnostics` em
   * `engine/extract.ts:340-357` (`coletarOcorrencias`).
   * SÍNCRONO de propósito (ver decisão 1 no cabeçalho).
   */
  parse(source: string, options?: ParseOptions): ParseResult;

  // ── (2) a chave de orçamento ─────────────────────────────────────────────

  /**
   * Como um nó vira ITEM DE ORÇAMENTO — "tipo + atributo, não só tipo" (§6).
   * `null` quando o nó não gera chave (nó estrutural sem valor didático).
   * SUBSTITUI: o mapeamento nó→chave de `engine/extract.ts:362-455`
   * (`record`/`visit`), com os construtores de `engine/atomKeys.ts:76-98`.
   */
  constructKey(node: LangNode): string | null;

  // ── (3) o enum fechado de tipos de nó ────────────────────────────────────

  /**
   * O universo ENUMERÁVEL de tipos de nó — é o que materializa o COMPLEMENTO
   * (o que a aula NÃO ensina) e o `enum` de `lesson.introduces.nodeTypes`
   * (§6: "gerado do `inventory()` do adaptador, nunca digitado").
   * SUBSTITUI: `nomesCanonicosSyntaxKind` (`engine/vocab/generate.ts:180`).
   */
  inventory(): readonly string[];

  // ── (4) globais e builtins ───────────────────────────────────────────────

  /**
   * Nomes GLOBAIS do runtime — o eixo `global:` do vocabulário.
   * SUBSTITUI: `RUNTIME_GLOBALS` (`engine/extract.ts:121`).
   */
  globals(): ReadonlySet<string>;

  /**
   * Nomes BUILTIN da linguagem (funções/tipos embutidos). Em JavaScript o
   * conjunto coincide com `globals()` (tudo é propriedade de `globalThis`);
   * em Python `len`/`range` são builtins e NÃO são "globais de runtime" —
   * é por isso que o §6 lista os dois com barra (`globals()`/`builtins()`).
   */
  builtins(): ReadonlySet<string>;

  // ── (5) escopo ───────────────────────────────────────────────────────────

  /**
   * Quais nomes são globais, locais e importados.
   * SUBSTITUI: `collectDeclaredNames` (`engine/extract.ts:255`) + o cruzamento
   * com `RUNTIME_GLOBALS` de `engine/extract.ts:425-435`.
   * O `parsed` é o `ParseOk` devolvido por `parse` (a árvore NATIVA está em
   * `parsed.native` — o adaptador usa a sua, não a normalizada).
   */
  resolveScopes(parsed: ParseOk): ScopeResolution;

  // ── (6) Porta 3: proibições globais ──────────────────────────────────────

  /**
   * Construções proibidas em QUALQUER nível — as que quebram a
   * decidibilidade da análise estática (`eval`, `new Function`, `obj[expr]`).
   * SUBSTITUI: `FORBIDDEN_ALWAYS` (`engine/atomKeys.ts:163`).
   */
  readonly forbiddenInvariants: readonly string[];

  // ── (7) layout dos arquivos do desafio ───────────────────────────────────

  /**
   * Nomes e caminhos dos arquivos do desafio, e o manifesto obrigatório.
   * SUBSTITUI: a escrita de `prepareIsolatedDir`
   * (`engine/exec/harness.ts:78-100`) e de `prepareChallengeDir`
   * (`services/challengeExec.ts:96-116`) — `package.json {type:'module'}` +
   * `solution.mjs` (ou os `files`) + `test.mjs`.
   */
  layout(challenge: ChallengeLayoutInput): ChallengeLayout;

  // ── (8) caminho seguro de arquivo ────────────────────────────────────────

  /**
   * Regex de caminho SEGURO por extensão — proíbe `..` e qualquer escape do
   * diretório de execução.
   * SUBSTITUI: `SAFE_FILE_PATH_RE` (`content/trackTypes.ts:67`), hoje travado
   * em `.mjs` (§6 obs. 1).
   */
  readonly filePathPattern: RegExp;

  // ── (9) comando de teste ─────────────────────────────────────────────────

  /**
   * Comando exato e flags do runner (sem o binário — ele vem de `detect()`).
   * SUBSTITUI: `SPEC_TEST_ARGS` (`engine/exec/proofs.ts:74`).
   */
  readonly testCommand: readonly string[];

  // ── (10)(11)(12) a dupla-igualdade e os checks ───────────────────────────

  /**
   * Contagem ESTÁTICA de testes no fonte (o lado DECLARADO da igualdade).
   * SUBSTITUI: `countTestDeclarations` (`engine/extract.ts:494`).
   */
  countDeclared(testsCode: string): number;

  /**
   * Contagem DINÂMICA na saída do runner (o lado EXECUTADO da igualdade).
   * SUBSTITUI: `parseSpecCounts` (`engine/exec/proofs.ts:115`).
   */
  countRun(output: string): RunCounts;

  /**
   * Checks individuais para a UI do aluno.
   * SUBSTITUI: `parseSpecChecks` (`services/challengeExec.ts:158`).
   */
  parseChecks(output: string): RunCheck[];

  // ── (13)(14)(15) execução ────────────────────────────────────────────────

  /**
   * Como se reconhece FALHA (quase nunca é só `code !== 0` — §6 obs. 3).
   * SUBSTITUI: `exitCodeMeaning` (`engine/exec/proofs.ts:156`) e o
   * `res.exitCode !== 0` espalhado pelos julgadores de `proofs.ts`.
   */
  readonly failureExitCodes: FailurePolicy;

  /**
   * Ambiente do processo filho — ALLOWLIST (§6 obs. 2).
   * SUBSTITUI: `NETWORK_HARDENING` + `buildChildEnv`
   * (`engine/exec/harness.ts:175-217`).
   */
  readonly envScrub: EnvScrubPolicy;

  /**
   * `command -v` + versão, e a mensagem de degradação.
   * SUBSTITUI: `nodeBinary()` (`services/challengeExec.ts:52`).
   * SÍNCRONO: adaptadores de subprocesso usam `spawnSync` (decisão 1).
   */
  detect(): DetectResult;
}

// ---------------------------------------------------------------------------
// O erro estruturado do registro (FAIL-CLOSED)
// ---------------------------------------------------------------------------

export type LanguageRegistryErrorCode =
  | 'ADAPTADOR_DESCONHECIDO'
  | 'ADAPTADOR_DUPLICADO'
  | 'ID_NAO_DECLARADO'
  | 'TOKEN_NAO_DECLARADO';

/**
 * Erro do registro. Estruturado (código + ids conhecidos) porque a mensagem
 * vai para o autor da trilha e para o CLI: "language inválido" sem a lista do
 * que É válido não conserta nada.
 */
export class LanguageRegistryError extends Error {
  constructor(
    readonly code: LanguageRegistryErrorCode,
    message: string,
    readonly detalhes: { pedido?: string; conhecidos: readonly string[] },
  ) {
    super(message);
    this.name = 'LanguageRegistryError';
  }
}

// ---------------------------------------------------------------------------
// O REGISTRO
// ---------------------------------------------------------------------------

const adaptadores = new Map<LanguageId, LanguageAdapter>();

function idsConhecidos(): LanguageId[] {
  return [...adaptadores.keys()].sort();
}

/**
 * Registra um adaptador. FAIL-CLOSED em três frentes: id fora de
 * `KNOWN_LANGUAGE_IDS` (id fantasma), id já registrado (dois adaptadores para
 * a mesma linguagem é ambiguidade silenciosa) e token de desafio fora de
 * `KNOWN_CHALLENGE_LANGUAGES` (o schema de trilha não saberia validá-lo).
 */
export function registerAdapter(adapter: LanguageAdapter): void {
  if (!(KNOWN_LANGUAGE_IDS as readonly string[]).includes(adapter.id)) {
    throw new LanguageRegistryError(
      'ID_NAO_DECLARADO',
      `adaptador com id não declarado: ${JSON.stringify(adapter.id)} — ` +
        `acrescente-o a KNOWN_LANGUAGE_IDS em engine/lang/registry.ts (ids declarados: ${KNOWN_LANGUAGE_IDS.join(', ')})`,
      { pedido: adapter.id, conhecidos: KNOWN_LANGUAGE_IDS },
    );
  }
  if (adaptadores.has(adapter.id)) {
    throw new LanguageRegistryError(
      'ADAPTADOR_DUPLICADO',
      `adaptador duplicado para ${JSON.stringify(adapter.id)} — um id, um adaptador`,
      { pedido: adapter.id, conhecidos: idsConhecidos() },
    );
  }
  for (const token of adapter.challengeLanguages) {
    if (!(KNOWN_CHALLENGE_LANGUAGES as readonly string[]).includes(token)) {
      throw new LanguageRegistryError(
        'TOKEN_NAO_DECLARADO',
        `adaptador ${adapter.id} declara challengeLanguages ${JSON.stringify(token)}, que não está em ` +
          `KNOWN_CHALLENGE_LANGUAGES (declarados: ${KNOWN_CHALLENGE_LANGUAGES.join(', ')})`,
        { pedido: token, conhecidos: KNOWN_CHALLENGE_LANGUAGES },
      );
    }
  }
  adaptadores.set(adapter.id, adapter);
}

/**
 * O adaptador de um id. LANÇA `LanguageRegistryError` quando o id é
 * desconhecido — NUNCA cai no default (ver decisão 2 no cabeçalho).
 */
export function getAdapter(id: string): LanguageAdapter {
  const adapter = adaptadores.get(id as LanguageId);
  if (adapter === undefined) {
    throw new LanguageRegistryError(
      'ADAPTADOR_DESCONHECIDO',
      `linguagem sem adaptador: ${JSON.stringify(id)} (conhecidas: ${idsConhecidos().join(', ')})`,
      { pedido: id, conhecidos: idsConhecidos() },
    );
  }
  return adapter;
}

/** Variante TOLERANTE de `getAdapter` — `null` em vez de lançar. */
export function findAdapter(id: string): LanguageAdapter | null {
  return adaptadores.get(id as LanguageId) ?? null;
}

/** O adaptador DEFAULT (`javascript`). Sempre registrado. */
export function defaultAdapter(): LanguageAdapter {
  return getAdapter(DEFAULT_ADAPTER_ID);
}

/** Ids REGISTRADOS, em ordem alfabética (ordem estável para relatório). */
export function listAdapterIds(): LanguageId[] {
  return idsConhecidos();
}

/** Todos os adaptadores registrados, na ordem de `listAdapterIds`. */
export function listAdapters(): LanguageAdapter[] {
  return idsConhecidos().map((id) => getAdapter(id));
}

/** `true` quando existe adaptador para o id. */
export function hasAdapter(id: string): boolean {
  return adaptadores.has(id as LanguageId);
}

// ---------------------------------------------------------------------------
// Resolução de TOKEN (challenge.language / track.programmingLanguage)
// ---------------------------------------------------------------------------

/**
 * TODOS os tokens que algum adaptador registrado aceita, em ordem estável.
 * É a lista que a mensagem de erro do validador de desafio mostra.
 */
export function listChallengeLanguages(): ChallengeLanguageToken[] {
  const out: ChallengeLanguageToken[] = [];
  for (const adapter of listAdapters()) {
    for (const token of adapter.challengeLanguages) {
      if (!out.includes(token)) out.push(token);
    }
  }
  return out.sort();
}

/**
 * Resolve um token de `challenge.language`/`track.programmingLanguage` para o
 * id do adaptador. `null` quando nenhum adaptador registrado o aceita —
 * quem chama decide se isso é erro (o loader) ou pergunta (o CLI).
 *
 * É AQUI que `'nodejs'` (runtime) vira `'javascript'` (linguagem): a
 * igualdade que o §6 (linhas 934-940) pede entre `challenge.language` e
 * `track.programmingLanguage` é conferida SOBRE ESTE RESULTADO, não sobre a
 * string crua — senão uma trilha `programmingLanguage: 'javascript'` com
 * desafios `language: 'nodejs'` (que é EXATAMENTE o disco de hoje, já que o
 * default de trilha é a linguagem e o dos desafios é o runtime) seria
 * reprovada por escrever a mesma coisa com dois nomes.
 */
export function adapterIdForChallengeLanguage(token: unknown): LanguageId | null {
  if (typeof token !== 'string') return null;
  const alvo = token.trim().toLowerCase();
  for (const adapter of listAdapters()) {
    if ((adapter.challengeLanguages as readonly string[]).includes(alvo)) return adapter.id;
  }
  return null;
}

/** `true` quando o valor é um token de linguagem aceito por algum adaptador. */
export function isChallengeLanguage(value: unknown): value is ChallengeLanguageToken {
  return adapterIdForChallengeLanguage(value) !== null;
}

// ---------------------------------------------------------------------------
// Resolução de TAG DE TEORIA (qual parser recebe cada bloco cercado)
// ---------------------------------------------------------------------------

const TAGS_NAO_CODIGO: ReadonlySet<string> = new Set(NON_CODE_THEORY_TAGS);

/**
 * Classifica a tag de um bloco de código da teoria. TOTAL: toda entrada cai
 * em exatamente um balde.
 *
 * `ausente` é o caso do §6 (linha 956) — "68 de 262 blocos da trilha atual
 * não têm tag de linguagem nenhuma". O que o registro faz com ele NÃO é
 * decidido aqui: `theoryCode.ts` aplica a política, que é ASSIMÉTRICA por
 * motivo histórico e está documentada lá.
 */
export function classifyTheoryTag(tag: unknown): TheoryTagClassification {
  if (typeof tag !== 'string' || tag.trim() === '') {
    return { kind: 'ausente', adapterId: null, tag: '' };
  }
  const alvo = tag.trim().toLowerCase();
  for (const adapter of listAdapters()) {
    if ((adapter.theoryFenceTags as readonly string[]).includes(alvo)) {
      return { kind: 'codigo', adapterId: adapter.id, tag: alvo };
    }
  }
  if (TAGS_NAO_CODIGO.has(alvo)) return { kind: 'nao-codigo', adapterId: null, tag: alvo };
  return { kind: 'desconhecida', adapterId: null, tag: alvo };
}

/**
 * O adaptador que deve parsear um bloco de teoria com esta tag, ou `null`
 * quando o bloco não vai a parser nenhum (não-código, desconhecida, ausente).
 * É a função que o §6 (linha 954) descreve: "é ela que diz ao extrator qual
 * parser aplicar a cada bloco cercado da teoria".
 */
export function adapterIdForTheoryTag(tag: unknown): LanguageId | null {
  return classifyTheoryTag(tag).adapterId;
}

/** Todas as tags de teoria que resolvem para algum adaptador, em ordem. */
export function listTheoryCodeTags(): string[] {
  const out: string[] = [];
  for (const adapter of listAdapters()) {
    for (const tag of adapter.theoryFenceTags) if (!out.includes(tag)) out.push(tag);
  }
  return out.sort();
}

// ---------------------------------------------------------------------------
// Registro dos adaptadores — UMA LINHA POR LINGUAGEM
// ---------------------------------------------------------------------------
//
// A ordem importa só para o erro: `idsConhecidos()` ordena antes de mostrar.
// `javascript` roda o compilador TypeScript DENTRO do processo; `python`
// roda `python3` por `spawnSync` — as duas formas cabem na MESMA interface, e
// é isso que o §7 item 3 pede que fique provado. `typescript` é a TERCEIRA
// forma: um adaptador que é quase todo COMPOSIÇÃO sobre outro (`lang/
// typescript.ts` delega onze dos quinze membros ao `javascriptAdapter`), o que
// prova que a interface aguenta uma linguagem que difere da vizinha por
// camada, e não por toolchain.

registerAdapter(javascriptAdapter);
registerAdapter(pythonAdapter);
registerAdapter(typescriptAdapter);
