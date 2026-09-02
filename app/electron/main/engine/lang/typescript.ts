/**
 * app/electron/main/engine/lang/typescript.ts — O ADAPTADOR TYPESCRIPT.
 *
 * A TERCEIRA linha da tabela do §6 de
 * `docs/research/08-multilingua-trava-deterministica.md` (linhas 866-891), e a
 * segunda da ORDEM do §7 — que a coloca antes de Python por um motivo escrito:
 * "é aqui que se descobre se a arquitetura de adaptadores aguenta uma SEGUNDA
 * CAMADA DE TRAVA (a semântica de tipos)".
 *
 * ─── POR QUE ESTE ARQUIVO É QUASE TODO COMPOSIÇÃO ─────────────────────────
 *
 * §7 item 2: "Praticamente de graça depois de (1): mesmo runner, mesmo
 * ecossistema, `SyntaxKind` no lugar do ESTree." A apuração feita neste
 * repositório confirmou, medindo:
 *
 *   - O EXTRATOR JÁ PARSEIA TYPESCRIPT. `ts.createSourceFile(...)` devolve
 *     ZERO `parseDiagnostics` para `interface`, anotação de tipo, `as`, `enum`
 *     e `keyof` — nos DOIS `ScriptKind` (medido: JS e TS produzem o MESMO
 *     conjunto de nomes de nó para o mesmo fonte TypeScript). O erro "type
 *     annotations can only be used in TypeScript files" é diagnóstico do
 *     CHECKER, e o código só lê `parseDiagnostics`.
 *   - `ParseOptions.dialect?: 'js' | 'ts'` já existia SEM CHAMADOR. O
 *     `adapter.parse` deste arquivo é o chamador que faltava.
 *   - `vocab/atoms.json` JÁ CONTÉM o universo TypeScript inteiro — 275 chaves
 *     `node:`, incluindo `InterfaceDeclaration`, `TypeAliasDeclaration`,
 *     `EnumDeclaration`, `AsExpression`, `UnionType`, `TypeReference`,
 *     `ArrayType` e as keyword-types. Nenhum artefato de vocabulário novo.
 *   - Node 24 roda `.ts` DIRETO (type stripping é o default, sem flag —
 *     medido: `node --test --test-reporter=spec test.ts` sai 0 com `ℹ pass 1`).
 *
 * ⇒ Onze dos quinze membros são o adaptador `javascript` INTACTO. Os quatro
 *   que mudam são identidade/layout (`.ts` no lugar de `.mjs`), o dialeto do
 *   parser, as proibições da camada semântica e a resolução de escopo (que
 *   precisa enxergar `interface`/`type`/`enum`/`<T>` como DECLARAÇÕES).
 *
 * ─── COMO A DELEGAÇÃO É FEITA, E POR QUE NÃO POR `require` DINÂMICO ───────
 *
 * Por COMPOSIÇÃO sobre o objeto do adaptador: `javascriptAdapter.countDeclared(…)`.
 * Nunca por `require` postergado com o caminho em VARIÁVEL — esse padrão tem
 * um modo de falha MEDIDO em produção: o Rollup não enxerga `require(variavel)`,
 * o bundle preserva a string, e no app EMPACOTADO dá `MODULE_NOT_FOUND`.
 * Composição não tem esse problema: o import é estático, o bundler o vê, e o
 * objeto delegado é EXATAMENTE o mesmo que o registro registra.
 *
 * NOTA DE CICLO (a mesma de `javascript.ts:63-67` e `python.ts:72-75`): o
 * import de `./registry` é `import type` e TEM de continuar sendo — o registro
 * importa o VALOR `typescriptAdapter` daqui. O import de `./javascript` é de
 * VALOR e isso é seguro por construção: ESM garante que `javascript.ts` está
 * INTEIRAMENTE avaliado antes do corpo deste módulo rodar, justamente porque
 * este módulo o importa. É por isso que a composição é feita por import
 * direto e não por `getAdapter('javascript')`: quando este arquivo é avaliado,
 * `registry.ts` ainda está no meio da própria avaliação e `registerAdapter`
 * ainda não rodou — `getAdapter` LANÇARIA. O objeto é o mesmo; a ordem, não.
 */

import { javascriptAdapter } from './javascript';

import type {
  ChallengeLanguageToken,
  ChallengeLayout,
  ChallengeLayoutInput,
  DetectResult,
  EnvScrubPolicy,
  FailurePolicy,
  LangNode,
  LanguageAdapter,
  ParseOk,
  ParseOptions,
  ParseResult,
  RunCheck,
  RunCounts,
  ScopeResolution,
} from './registry';

/** Só em posição de TIPO — apagado na compilação, zero custo em runtime. */
type TsNode = import('typescript').Node;
type TsSourceFile = import('typescript').SourceFile;

// ---------------------------------------------------------------------------
// Identidade
// ---------------------------------------------------------------------------

/**
 * Tokens de `challenge.language` / `track.programmingLanguage` que resolvem
 * para este adaptador. `'typescript'` é a LINGUAGEM (e é o id);
 * `docs/18-trilha-typescript.md` §"Regras para os desafios de aula" crava
 * `language: 'typescript'`. `'ts'` acompanha pelo mesmo motivo que `'nodejs'`
 * acompanha `'javascript'`: é a grafia que o autor de trilha vai escrever (é a
 * extensão do arquivo e a tag da cerca), e reprovar uma trilha por escrever a
 * MESMA coisa com dois nomes é ruído, não trava.
 */
export const TS_CHALLENGE_LANGUAGES: readonly ChallengeLanguageToken[] = ['typescript', 'ts'];

/**
 * Tags de bloco cercado que a engine manda para ESTE parser.
 *
 * `tsx` NÃO entra, e isso é decisão, não esquecimento, por dois motivos que se
 * somam: (1) `docs/18-trilha-typescript.md` declara "JSX/TSX" FORA do escopo
 * do produto (§"O que fica fora de escopo"); (2) `ScriptKind.TS` não parseia
 * JSX — `<div/>` num `.ts` é asserção de tipo, não elemento —, então reivindicar
 * a tag faria um bloco TSX CORRETO virar `PARSE_ERROR`. Sem a tag, ele cai em
 * `desconhecida` e não vai a parser nenhum, que é o comportamento fail-closed
 * certo. O dia em que TSX entrar no produto, entra com `ScriptKind.TSX` junto.
 */
export const TS_THEORY_FENCE_TAGS: readonly string[] = ['ts', 'typescript'];

/**
 * O `track.runtime` default. É `'nodejs'` — e a escolha tem de ser explicada,
 * porque ela é o pé da QUINTA PROVA.
 *
 * O par (toolchain, runner) do §6 tem DUAS metades em TypeScript, e só uma
 * delas é RUNTIME: Node 24 roda `.ts` nativamente, SEM flag (medido), e é ele
 * que executa `node --test --test-reporter=spec test.ts`. A outra metade é o
 * CONFERIDOR DE TIPOS (`tsc`), e ele não roda o programa — Node **APAGA** os
 * tipos, não os confere (medido: `const x: number = "texto"` roda, imprime e
 * sai 0). Cravar `'nodejs+tsc'` aqui misturaria as duas coisas no campo que o
 * §6 reserva para o runner; a metade `tsc` é política da camada de EXECUÇÃO e
 * vive em `POLITICAS_DE_TIPOS` (`engine/exec/typesCheck.ts`), que é fail-closed
 * quando o compilador falta.
 *
 * A versão PINADA (`docs/18`: `runtime: 'node-24 + typescript-5.8.3'`) é campo
 * da TRILHA, escrito por trilha; o default do ADAPTADOR é a toolchain, como
 * `'cpython'` é o do Python (`python.ts`) e `'nodejs'` o do JavaScript.
 */
export const TS_DEFAULT_RUNTIME = 'nodejs';

// ---------------------------------------------------------------------------
// (7)(8)(9) layout, caminho seguro e comando de teste — `.ts`, nunca `.mjs`
// ---------------------------------------------------------------------------

/**
 * Regex de caminho seguro: mesma gramática do JavaScript (só
 * letras/dígitos/`_`/`-`/`/`, proibindo `..` e ponto no meio), terminando em
 * `.ts`. §6 obs. 1: "`SAFE_FILE_PATH_RE` está travado em `.mjs`" — é
 * exatamente esta linha que destrava.
 *
 * SEM a flag `g`, pelo mesmo motivo do JavaScript: um `RegExp` com `g`
 * compartilhado guarda `lastIndex` entre chamadas e daria falso-negativo
 * alternado em `.test()`.
 */
export const TS_SAFE_FILE_PATH_RE = /^[a-zA-Z0-9_\-/]+\.ts$/;

/** O manifesto obrigatório do runtime. */
export const TS_MANIFEST_PATH = 'package.json';
/** O arquivo que o teste importa (`from './solution.ts'`, extensão explícita). */
export const TS_ENTRY_PATH = 'solution.ts';
/** O arquivo de teste — a especificação executável. */
export const TS_TEST_PATH = 'test.ts';

/**
 * Args canônicos do runner. `docs/18` §"Regras para os desafios de aula":
 * "roda com `node --test --test-reporter=spec test.ts`, SEM FLAG NENHUMA no
 * Node 24 (medido)". O único byte diferente do JavaScript é a extensão.
 */
export const TS_TEST_COMMAND: readonly string[] = ['--test', '--test-reporter=spec', 'test.ts'];

/**
 * Os arquivos do desafio em disco, na ORDEM de escrita.
 *
 * O `package.json {"type":"module"}` FICA, e a decisão é dupla:
 *   - RUNNER: Node decide ESM×CJS de um `.ts` pelo mesmo `type` do
 *     `package.json` mais próximo que usa para um `.js`. Sem ele, o
 *     `import { … } from './solution.ts'` do arquivo de teste depende da
 *     detecção de sintaxe em vez de um contrato escrito.
 *   - CONFERIDOR: a quinta prova roda `tsc` com `--module nodenext`, e
 *     `nodenext` LÊ esse mesmo campo para decidir ESM×CJS. Manter o manifesto
 *     é o que faz o compilador e o runner concordarem sobre o que o arquivo é
 *     — se divergissem, a prova 5 aprovaria um programa que a prova 1 reprova
 *     (ou o contrário), que é o pior defeito possível numa trava.
 */
export function tsLayout(challenge: ChallengeLayoutInput): ChallengeLayout {
  const files: { path: string; content: string }[] = [
    { path: TS_MANIFEST_PATH, content: JSON.stringify({ type: 'module' }) },
  ];
  if (challenge.files && challenge.files.length > 0) {
    for (const f of challenge.files) files.push({ path: f.path, content: f.code });
  } else {
    files.push({ path: TS_ENTRY_PATH, content: challenge.code });
  }
  files.push({ path: TS_TEST_PATH, content: challenge.testsCode });
  return {
    files,
    entryPath: TS_ENTRY_PATH,
    testPath: TS_TEST_PATH,
    manifestPath: TS_MANIFEST_PATH,
  };
}

// ---------------------------------------------------------------------------
// (1) parse — o MESMO parser, com `dialect: 'ts'`
// ---------------------------------------------------------------------------

/**
 * Parseia TypeScript. É `jsParse` com `ScriptKind.TS`: mesmo
 * `createSourceFile` (com `setParentNodes`, que a resolução de escopo exige),
 * mesmo `ScriptTarget.Latest`, mesmo `PARSE_ERROR` estruturado com
 * linha/coluna 1-based do primeiro diagnóstico de SINTAXE.
 *
 * O `dialect` é FORÇADO e um `dialect` do chamador é IGNORADO de propósito: o
 * adaptador de TypeScript que parseasse como JavaScript sob pedido seria uma
 * porta para o gate mentir — `const x = <T>y` significa coisas diferentes nos
 * dois dialetos, e quem escolheu este adaptador já disse qual quer.
 *
 * "PARSEIE TUDO, REPROVE NO ORÇAMENTO": o adaptador nunca restringe a
 * gramática — quem reprova é `budget.ts`.
 */
export function tsParse(source: string, options: ParseOptions = {}): ParseResult {
  return javascriptAdapter.parse(source, {
    fileName: options.fileName ?? 'trecho.ts',
    dialect: 'ts',
  });
}

// ---------------------------------------------------------------------------
// (2) constructKey — as chaves SINTÉTICAS da camada de tipos
// ---------------------------------------------------------------------------

/**
 * `keyof T` e `readonly T[]` produzem O MESMO `node:TypeOperator` (medido, e
 * registrado em `docs/18` §"As três chaves sintéticas que faltam"). O
 * discriminante (`TypeOperatorNode.operator`) é um `SyntaxKind` guardado como
 * NÚMERO — e comparar contra o número cru travaria este arquivo numa versão
 * do compilador. O `text` do nó normalizado começa EXATAMENTE no operador
 * (`LangNode.text` é `source.slice(getStart(sf), getEnd())`, e `getStart`
 * pula a trivia), então a primeira palavra dele é o operador, sempre.
 */
const TS_TYPE_OPERATOR_KEYS: Readonly<Record<string, string>> = {
  keyof: 'node:KeyOfType',
  readonly: 'node:ReadonlyArrayType',
};

/** Chave sintética de `x as unknown as T` — a fuga da camada semântica. */
export const TS_DOUBLE_ASSERTION_KEY = 'node:DoubleAssertionViaUnknown';

/** As chaves que só existem neste adaptador (não são nomes de `ts.SyntaxKind`). */
export const TS_SYNTHETIC_NODE_TYPES: readonly string[] = [
  'KeyOfType',
  'ReadonlyArrayType',
  'TypeOnlyImport',
  'TypeOnlyExport',
  'DoubleAssertionViaUnknown',
  'TsIgnoreDirective',
  'TsExpectErrorDirective',
];

/** O primeiro token do texto de um nó (o operador de um `TypeOperator`). */
function primeiraPalavra(texto: string): string {
  const m = /^[A-Za-z_$][\w$]*/.exec(texto);
  return m === null ? '' : m[0];
}

/**
 * A chave SINTÉTICA de um nó, ou `null` quando o nó não pede uma.
 *
 * Precedente do repositório para chave sintética no eixo `node:`:
 * `node:ComputedNonLiteralAccess`, emitida por `engine/extract.ts:430-433` e
 * listada nas proibições globais — ela também não existe em `ts.SyntaxKind`.
 */
function tsChaveSintetica(node: LangNode): string | null {
  if (node.type === 'TypeOperator') {
    return TS_TYPE_OPERATOR_KEYS[primeiraPalavra(node.text)] ?? null;
  }
  // `isTypeOnly` é propriedade PRÓPRIA e booleana do nó nativo — nada de
  // número de enum, nada de olhar texto (`docs/18`: "a diferença é
  // `ImportClause.isTypeOnly`, um booleano").
  if (node.type === 'ImportClause' && ehTypeOnly(node)) return 'node:TypeOnlyImport';
  if (node.type === 'ExportDeclaration' && ehTypeOnly(node)) return 'node:TypeOnlyExport';
  if (node.type === 'AsExpression' && ehDuplaAssercaoViaUnknown(node)) {
    return TS_DOUBLE_ASSERTION_KEY;
  }
  return null;
}

function ehTypeOnly(node: LangNode): boolean {
  return (node.native as { isTypeOnly?: boolean } | undefined)?.isTypeOnly === true;
}

/**
 * `x as unknown as T` — `AsExpression(AsExpression(x, unknown), T)`. A dupla
 * asserção é a forma idiomática de DESLIGAR a camada semântica sem escrever
 * `any`, e por isso `docs/18` §"Regras para os desafios de aula" a proíbe em
 * qualquer nível junto com `any`.
 */
function ehDuplaAssercaoViaUnknown(node: LangNode): boolean {
  const interno = node.children[0];
  if (interno === undefined || interno.type !== 'AsExpression') return false;
  return interno.children.some((f) => f.type === 'UnknownKeyword' || f.type === 'AnyKeyword');
}

/**
 * Um nó vira ITEM DE ORÇAMENTO. Delega ao JavaScript (os eixos `node:`,
 * `decl:` e `op:` são os mesmos) e antepõe as chaves sintéticas de TIPO.
 *
 * LIMITE DECLARADO, e ele é o mesmo do adaptador JavaScript: NADA consome
 * `constructKey` hoje — o mapeamento nó→chave que o gate usa continua sendo o
 * `record`/`visit` de `engine/extract.ts:402-467`, que é JAVASCRIPT-ONLY por
 * guarda explícita (`exigirAdaptadorJavascript`). Quando o extrator passar a
 * consumir o adaptador, ele deve RECORDAR AS DUAS chaves (a sintética e a
 * genérica), como já faz com `node:ComputedNonLiteralAccess` ao lado de
 * `node:ElementAccessExpression`; a interface do §6 devolve UMA chave por nó e
 * este membro devolve a MAIS ESPECÍFICA.
 */
export function tsConstructKey(node: LangNode): string | null {
  return tsChaveSintetica(node) ?? javascriptAdapter.constructKey(node);
}

// ---------------------------------------------------------------------------
// (3) inventory
// ---------------------------------------------------------------------------

let inventarioMemo: readonly string[] | null = null;

/**
 * O enum FECHADO de tipos de nó. O `ts.SyntaxKind` já é o universo dos DOIS
 * dialetos (é o mesmo compilador), então o inventário do JavaScript entra
 * inteiro; o que se acrescenta são as chaves SINTÉTICAS deste adaptador, sem
 * as quais uma aula não conseguiria declarar `introduces.nodeTypes:
 * ['KeyOfType']` (o `enum` de `lesson.introduces.nodeTypes` é GERADO daqui —
 * §6: "nunca digitado").
 *
 * DIVERGÊNCIA DECLARADA: `javascriptAdapter.inventory()` NÃO inclui a sintética
 * dele (`ComputedNonLiteralAccess`), embora `extract.ts` a emita. Corrigir lá é
 * mudança de comportamento em `lang/javascript.ts`, que pertence a outra
 * sub-tarefa desta onda; aqui o inventário é COMPLETO por construção.
 */
export function tsInventory(): readonly string[] {
  if (inventarioMemo === null) {
    inventarioMemo = [...new Set([...javascriptAdapter.inventory(), ...TS_SYNTHETIC_NODE_TYPES])].sort();
  }
  return inventarioMemo;
}

// ---------------------------------------------------------------------------
// (4) globals / builtins — o `lib.d.ts` tem globais que `globalThis` não tem
// ---------------------------------------------------------------------------

/**
 * Os globais que existem SÓ NO MUNDO DOS TIPOS — `Partial`, `Pick`, `Omit`,
 * `Record` e companhia são declarados por `lib.es5.d.ts` e NÃO são
 * propriedades de `globalThis`. `docs/18` §"As três chaves sintéticas que
 * faltam" é explícito: eles "entram no eixo `global:` (`global:Partial`,
 * `global:Pick`…), exatamente como `Array` e `Math` são globais de valor".
 *
 * LIMITE DECLARADO, e é honesto dizê-lo alto: esta lista é DIGITADA, ao
 * contrário de `jsGlobals()`, que é lida da máquina (`Object.
 * getOwnPropertyNames(globalThis)`). O motivo é estrutural — o espaço de nomes
 * de TIPO não tem `globalThis`; ele não existe em runtime. A derivação
 * legítima seria varrer os `lib.*.d.ts` do compilador instalado, e ela custa um
 * `ts.createProgram` inteiro na carga do adaptador: caro demais para o membro
 * que `content/trackTypes.ts` arrasta ao abrir uma aula. O conteúdo abaixo é o
 * conjunto FECHADO de tipos utilitários e de tipos ambientes de `lib.es5.d.ts`
 * / `lib.es2015.iterable.d.ts` / `lib.es2018.asynciterable.d.ts`, mais os que
 * `docs/18` nomeia por escrito.
 */
export const TS_TYPE_GLOBALS: readonly string[] = [
  // tipos utilitários de `lib.es5.d.ts`
  'Awaited',
  'Capitalize',
  'ConstructorParameters',
  'Exclude',
  'Extract',
  'InstanceType',
  'Lowercase',
  'NoInfer',
  'NonNullable',
  'Omit',
  'OmitThisParameter',
  'Parameters',
  'Partial',
  'Pick',
  'Readonly',
  'Record',
  'Required',
  'ReturnType',
  'ThisParameterType',
  'ThisType',
  'Uncapitalize',
  'Uppercase',
  // tipos AMBIENTES que só existem em posição de tipo
  'ArrayLike',
  'AsyncGenerator',
  'AsyncIterable',
  'AsyncIterableIterator',
  'AsyncIterator',
  'Generator',
  'Iterable',
  'IterableIterator',
  'Iterator',
  'PromiseLike',
  'PropertyKey',
  'ReadonlyArray',
  'ReadonlyMap',
  'ReadonlySet',
  'TemplateStringsArray',
];

let globaisMemo: ReadonlySet<string> | null = null;

/**
 * Globais do runtime UNIDOS aos globais de tipo. A metade de runtime continua
 * sendo LIDA DA MÁQUINA pelo adaptador JavaScript — a fonte que não mente.
 */
export function tsGlobals(): ReadonlySet<string> {
  if (globaisMemo === null) {
    globaisMemo = new Set<string>([...javascriptAdapter.globals(), ...TS_TYPE_GLOBALS]);
  }
  return globaisMemo;
}

/**
 * Em TypeScript, como em JavaScript, o conjunto de BUILTINS coincide com o de
 * GLOBAIS: tudo o que a linguagem embute é global (de valor, por `globalThis`,
 * ou de tipo, por `lib.d.ts`). É em Python que os dois se separam.
 */
export function tsBuiltins(): ReadonlySet<string> {
  return tsGlobals();
}

// ---------------------------------------------------------------------------
// (5) resolveScopes — `interface`, `type`, `enum` e `<T>` TAMBÉM declaram nome
// ---------------------------------------------------------------------------

/**
 * Formas que declaram um nome no espaço de TIPOS (ou nos dois espaços) e que a
 * resolução de escopo do JavaScript, por construção, não conhece. Sem elas,
 * `type Pessoa = …; function f(p: Pessoa)` deixaria `Pessoa` em `free` — um
 * nome livre FANTASMA, que é exatamente o defeito que o §7 proíbe ao dizer
 * "nunca promover uma linguagem a Tier A sem resolução de escopo".
 */
const TS_FORMAS_DECLARANTES: ReadonlySet<string> = new Set([
  'InterfaceDeclaration',
  'TypeAliasDeclaration',
  'EnumDeclaration',
  'ModuleDeclaration',
  'TypeParameter',
]);

/**
 * O nome declarado por uma dessas formas: o PRIMEIRO filho `Identifier`.
 * (`forEachChild` visita os modificadores antes do nome, então
 * `export interface I` tem `ExportKeyword` como primeiro filho — daí procurar
 * pelo tipo, e não pegar `children[0]`.)
 */
function nomeDeclarado(node: LangNode): string | null {
  for (const filho of node.children) {
    if (filho.type === 'Identifier') return filho.attributes.name ?? filho.text;
  }
  return null;
}

/**
 * Resolução de escopo. Compõe sobre a do JavaScript em DUAS direções:
 *
 *   1. ACRESCENTA a `declared` os nomes das formas de tipo (`interface`,
 *      `type`, `enum`, `namespace`, parâmetro de tipo) e os TIRA de `free`.
 *   2. RECALCULA `globals` contra `tsGlobals()` — `free ∩ globals()`, como
 *      manda o contrato de `ScopeResolution` —, que é o que faz `Partial` e
 *      `Pick` aparecerem no eixo `global:` (`docs/18`, exigência 6 da lista
 *      acionável).
 *
 * LIMITE HERDADO E DECLARADO: a resolução do JavaScript é PLANA
 * (`extract.ts:38-43`) — junta todo nome declarado no arquivo e trata como
 * global o identificador que sobrou. Um shadowing deliberado (`const console =
 * …`, ou um `type Partial = …` local) faz o extrator parar de reportar o
 * global. TypeScript herda esse limite inteiro; ele não é pior aqui, mas também
 * não é melhor.
 */
export function tsResolveScopes(parsed: ParseOk): ScopeResolution {
  const base = javascriptAdapter.resolveScopes(parsed);

  const declared = new Set<string>(base.declared);
  const visitar = (node: LangNode): void => {
    if (TS_FORMAS_DECLARANTES.has(node.type)) {
      const nome = nomeDeclarado(node);
      if (nome !== null && nome !== '') declared.add(nome);
    }
    for (const filho of node.children) visitar(filho);
  };
  visitar(parsed.root);

  const universo = tsGlobals();
  const free = new Set<string>();
  const globals = new Set<string>();
  for (const nome of base.free) {
    if (declared.has(nome)) continue;
    free.add(nome);
    if (universo.has(nome)) globals.add(nome);
  }

  return { declared, imported: base.imported, free, globals };
}

// ---------------------------------------------------------------------------
// (6) forbiddenInvariants — a SEGUNDA camada de trava, e o que ela não alcança
// ---------------------------------------------------------------------------

/**
 * As diretivas de COMENTÁRIO que desligam o conferidor de tipos linha a linha.
 * Elas são a razão de existir da varredura de trivia abaixo.
 */
export const TS_SUPPRESSION_DIRECTIVES: readonly { readonly directive: string; readonly key: string }[] = [
  { directive: '@ts-ignore', key: 'node:TsIgnoreDirective' },
  { directive: '@ts-expect-error', key: 'node:TsExpectErrorDirective' },
];

/**
 * PROIBIÇÕES GLOBAIS. Herda as do JavaScript INTEIRAS (as que quebram a
 * decidibilidade da análise estática: `eval`, `new Function`, `with`,
 * `arguments`, acesso computado não-literal) e acrescenta as da camada
 * SEMÂNTICA, que `docs/research/08` §5 (ficha TypeScript) e `docs/18`
 * §"Regras para os desafios de aula" listam nominalmente: `any`,
 * `as unknown as`, `@ts-ignore` e `@ts-expect-error`.
 *
 * A diferença entre os dois grupos é a razão de existir do segundo. As
 * proibições do JavaScript existem porque tornam a análise INDECIDÍVEL; estas
 * quatro existem porque ANULAM a camada que a trilha ensina — uma trilha de
 * TypeScript com `any` liberado é uma trilha de JavaScript com anotação
 * decorativa.
 *
 * ⚠ COBERTURA DESIGUAL, DECLARADA — leia antes de confiar nesta lista:
 *
 *   - `node:AnyKeyword` e `node:AsExpression` SÃO nós, e o passe `node:` do
 *     extrator (`extract.ts:403-406`) já os emite hoje para fonte TypeScript.
 *     Estas duas o gate pega.
 *   - `node:DoubleAssertionViaUnknown` é SINTÉTICA e sai de `tsConstructKey` —
 *     que ninguém consome ainda (ver o limite declarado lá). Enquanto o
 *     extrator não a emitir, ela é proibição SEM EMISSOR.
 *   - `node:TsIgnoreDirective` e `node:TsExpectErrorDirective` são
 *     COMENTÁRIOS, e `extract.ts:520-529` depende explicitamente de
 *     "comentário não é nó" (é o que faz um `// test(` comentado não contar).
 *     A caminhada do AST NÃO pode emiti-las, por construção. O emissor é
 *     `tsScanSuppressionDirectives` abaixo — implementado, testado e ainda SEM
 *     CHAMADOR, porque quem teria de chamá-lo é `engine/extract.ts`, de outra
 *     sub-tarefa desta onda.
 */
export const TS_FORBIDDEN_INVARIANTS: readonly string[] = [
  ...javascriptAdapter.forbiddenInvariants,
  'node:AnyKeyword',
  TS_DOUBLE_ASSERTION_KEY,
  ...TS_SUPPRESSION_DIRECTIVES.map((d) => d.key),
];

/** Uma diretiva de supressão encontrada no fonte, com posição 1-based. */
export interface TsSuppressionOccurrence {
  /** a chave de átomo (`node:TsIgnoreDirective` | `node:TsExpectErrorDirective`). */
  key: string;
  /** a diretiva literal (`@ts-ignore` | `@ts-expect-error`). */
  directive: string;
  /** 1-based, como todo editor mostra. */
  line: number;
  /** 1-based. */
  column: number;
  /** offset absoluto 0-based do início da diretiva no fonte. */
  start: number;
  /** offset absoluto do fim (exclusivo). */
  end: number;
  /** o comentário inteiro em que ela apareceu, sem quebra de linha. */
  snippet: string;
}

/**
 * TODOS os blocos de TRIVIA do arquivo — o espaço entre o fim de um token e o
 * começo do próximo, que é onde todo comentário vive.
 *
 * A varredura é por TOKEN, e não por nó: `forEachChild` pula a pontuação, e um
 * comentário colado num `}` (ou na última linha do arquivo) é trivia de um
 * TOKEN que `forEachChild` nunca visita. `getChildren()` desce até os tokens,
 * e a união de `[getFullStart(), getStart())` sobre TODAS as folhas cobre o
 * arquivo inteiro. Medido em nove formas (linha, bloco, JSDoc, colado no fim
 * da linha, última linha, dentro de bloco, antes do `}`, dentro de
 * `interface`) — e o caso que importa mais: uma diretiva escrita DENTRO de uma
 * string (`const s = "@ts-ignore"`) NÃO é encontrada, porque literais são nós
 * e nós não são trivia.
 *
 * Nenhum uso do namespace `ts` — só métodos do próprio nó (`getChildren`,
 * `getFullStart`, `getStart`). Este arquivo não carrega o compilador.
 */
function blocosDeTrivia(sf: TsSourceFile): { start: number; text: string }[] {
  const out: { start: number; text: string }[] = [];
  const visitar = (n: TsNode): void => {
    const filhos = n.getChildren(sf);
    if (filhos.length === 0) {
      const inicio = n.getFullStart();
      const fim = n.getStart(sf);
      if (fim > inicio) out.push({ start: inicio, text: sf.text.slice(inicio, fim) });
      return;
    }
    for (const filho of filhos) visitar(filho);
  };
  visitar(sf);
  return out;
}

/**
 * Encontra `@ts-ignore` e `@ts-expect-error` no fonte JÁ PARSEADO, com
 * arquivo:linha:coluna — o formato que o relatório de violação usa.
 *
 * Existe porque a proibição do §"Regras para os desafios de aula" de `docs/18`
 * ("proibições sempre, em qualquer aula, starter, teste, teoria ou solução")
 * é sobre COMENTÁRIOS, e a caminhada do AST não os enxerga. Fingir que o eixo
 * `node:` cobriria seria pior que não cobrir: a proibição existiria no papel e
 * o gate passaria em silêncio.
 *
 * PURA: mesma entrada, mesma saída. Sem IO, sem estado.
 */
export function tsScanSuppressionDirectives(parsed: ParseOk): TsSuppressionOccurrence[] {
  const sf = parsed.native as TsSourceFile;
  const achados: TsSuppressionOccurrence[] = [];

  for (const bloco of blocosDeTrivia(sf)) {
    for (const { directive, key } of TS_SUPPRESSION_DIRECTIVES) {
      let de = bloco.text.indexOf(directive);
      while (de !== -1) {
        const start = bloco.start + de;
        const pos = sf.getLineAndCharacterOfPosition(start);
        achados.push({
          key,
          directive,
          line: pos.line + 1,
          column: pos.character + 1,
          start,
          end: start + directive.length,
          snippet: bloco.text.slice(de).split('\n')[0].trim(),
        });
        de = bloco.text.indexOf(directive, de + directive.length);
      }
    }
  }

  return achados.sort((a, b) => a.start - b.start);
}

// ---------------------------------------------------------------------------
// (10)(11)(12) a dupla-igualdade e os checks — DELEGADOS
// ---------------------------------------------------------------------------

/**
 * Contagem DECLARADA de testes, por AST. Delega — existe UMA implementação
 * disso na engine (`countTestDeclarations`, `engine/extract.ts:530`), e
 * comentário não é nó nas duas linguagens.
 *
 * A implementação delegada parseia com `ScriptKind.JS`. Medido: para um
 * `test.ts` real (import com extensão explícita, anotação no corpo do teste,
 * `test.skip` com retorno anotado, um `test(` comentado) as duas contagens são
 * IGUAIS — 2 e 2. A ÚNICA divergência medida é a chamada GENÉRICA
 * `test<T>('x', …)`: sob `ScriptKind.JS` ela conta 0 e sob `ScriptKind.TS`
 * conta 1, porque `<T>` vira comparação no dialeto JavaScript. Nenhum harness
 * do produto instancia `test` genericamente (`node:test` não é genérico); se
 * um dia instanciar, o lado DECLARADO da dupla-igualdade divergiria do
 * EXECUTADO e a prova 3 REPROVARIA — fail-closed, nunca um verde silencioso.
 */
export function tsCountDeclared(testsCode: string): number {
  return javascriptAdapter.countDeclared(testsCode);
}

/**
 * Contagem EXECUTADA, do ÚLTIMO bloco de resumo spec. Delega: o runner é o
 * MESMO (`node --test --test-reporter=spec`), então o relatório é byte a byte
 * o mesmo — inclusive a armadilha do resumo FORJADO pelo código sob teste, que
 * a implementação do JavaScript já trata pegando o último bloco.
 */
export function tsCountRun(output: string): RunCounts {
  return javascriptAdapter.countRun(output);
}

/** Checks individuais para a UI do aluno. Mesmo relatório, mesma leitura. */
export function tsParseChecks(output: string): RunCheck[] {
  return javascriptAdapter.parseChecks(output);
}

// ---------------------------------------------------------------------------
// (13)(14)(15) execução — DELEGADOS
// ---------------------------------------------------------------------------

/**
 * Como se reconhece FALHA. É a política do JavaScript, e tem de ser: o
 * processo é o MESMO `node`, com os MESMOS exit codes (0 mentiroso de arquivo
 * de teste vazio incluso — por isso `successRequiresCountMatch` continua
 * `true`, invariante do tipo).
 */
export const TS_FAILURE_POLICY: FailurePolicy = javascriptAdapter.failureExitCodes;

/**
 * Ambiente do processo filho. A política do JavaScript, INTEIRA, mais uma
 * linha de escopo — porque em TypeScript ela protege DUAS execuções, e a
 * segunda é nova.
 *
 * A armadilha específica de TypeScript é `NODE_OPTIONS`, e ela já está coberta
 * pela política herdada: um `NODE_OPTIONS=--no-experimental-strip-types`
 * herdado do ambiente faria TODO `.ts` deixar de carregar, e as quatro provas
 * de execução falhariam por motivo que não é o desafio. `NODE_OPTIONS` está na
 * denylist desde o JavaScript; nada a acrescentar.
 */
export const TS_ENV_SCRUB: EnvScrubPolicy = {
  allow: javascriptAdapter.envScrub.allow,
  fixed: javascriptAdapter.envScrub.fixed,
  strip: javascriptAdapter.envScrub.strip,
  scope: [
    ...javascriptAdapter.envScrub.scope,
    'a QUINTA PROVA (tsc --noEmit) passa pelo MESMO ExecFn endurecido e herda esta política inteira — inclusive o corte de NODE_OPTIONS, que é o que garante que o type stripping do Node 24 não seja desligado por herança',
  ],
};

/**
 * Detecção da toolchain. Delega ao JavaScript: o binário do filho é o MESMO
 * `node` (Node 24 roda `.ts` sem flag), a versão sai de `process.versions` e a
 * degradação é a mesma (Electron sem `npm_node_execpath`).
 *
 * A METADE `tsc` NÃO É SONDADA AQUI, e isso é decisão de camada, não omissão:
 * `exec/typesCheck.ts` documenta que a quinta prova "não é um dos 15 membros —
 * ela é política da camada de EXECUÇÃO", e é lá que o compilador é resolvido,
 * com mensagem de degradação FAIL-CLOSED própria ("um desafio de linguagem
 * tipada não é aprovado sem ela"). Sondar aqui também criaria duas fontes de
 * verdade para a mesma pergunta, e a de baixo é a que decide.
 */
export function tsDetect(): DetectResult {
  return javascriptAdapter.detect();
}

// ---------------------------------------------------------------------------
// O ADAPTADOR
// ---------------------------------------------------------------------------

export const typescriptAdapter: LanguageAdapter = {
  id: 'typescript',
  label: 'TypeScript',
  challengeLanguages: TS_CHALLENGE_LANGUAGES,
  defaultRuntime: TS_DEFAULT_RUNTIME,
  theoryFenceTags: TS_THEORY_FENCE_TAGS,

  parse: tsParse,
  constructKey: tsConstructKey,
  inventory: tsInventory,
  globals: tsGlobals,
  builtins: tsBuiltins,
  resolveScopes: tsResolveScopes,
  forbiddenInvariants: TS_FORBIDDEN_INVARIANTS,
  layout: tsLayout,
  filePathPattern: TS_SAFE_FILE_PATH_RE,
  testCommand: TS_TEST_COMMAND,
  countDeclared: tsCountDeclared,
  countRun: tsCountRun,
  parseChecks: tsParseChecks,
  failureExitCodes: TS_FAILURE_POLICY,
  envScrub: TS_ENV_SCRUB,
  detect: tsDetect,
};

/**
 * O eixo `form:` ESTÁ disponível em TypeScript (ao contrário de Python) — o
 * seletor de `engine/form/selector.ts` é tipado sobre `ts.Node`, e é o mesmo
 * `ts.Node` que este adaptador produz. Declarado como VALOR, e não como
 * comentário, para que o consumidor possa PERGUNTAR em vez de descobrir por
 * ausência.
 *
 * O que ainda NÃO existe é a BATERIA: `engine/form/rules.ts` compila cinco
 * formas, todas de JavaScript, e `docs/18` §"As formas novas que a bateria
 * precisa registrar" exige CATORZE (verificadas atributo por atributo contra a
 * DSL do seletor). Escrevê-las é trabalho em `form/rules.ts`, que não pertence
 * a este arquivo — está registrado no handoff desta sub-tarefa.
 */
export const TS_FORM_AXIS_SUPPORTED = true;
