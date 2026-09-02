/**
 * app/electron/main/engine/lang/javascript.ts — O ADAPTADOR JAVASCRIPT.
 *
 * A primeira linha da tabela do §6 de
 * `docs/research/08-multilingua-trava-deterministica.md` (linhas 866-891), e
 * a única que existe hoje. §7, item 1: "JavaScript. Não é escolha, é
 * obrigação: é a linguagem da trilha que já existe e tem 32% de desafios
 * violando a trava. Nenhuma peça nova."
 *
 * ─── O CONTRATO DESTE ARQUIVO NESTA ONDA: ZERO MUDANÇA DE COMPORTAMENTO ───
 *
 * Este adaptador REÚNE valores que hoje vivem espalhados. Cada um deles está
 * marcado com `FONTE DA VERDADE a partir da onda 5 — ver <arquivo:linha>`: na
 * onda 5 o arquivo citado passa a IMPORTAR daqui e a sua cópia é apagada.
 * Enquanto isso, o valor existe nos dois lugares DE PROPÓSITO — duplicar o
 * valor é o que permite publicar a interface sem tocar em `extract.ts`,
 * `atomKeys.ts`, `exec/**` e `services/challengeExec.ts`, que pertencem às
 * outras sub-tarefas.
 *
 * Duas técnicas convivem aqui, e a escolha entre elas tem regra:
 *
 *   - VALOR (regex, lista de args, lista de proibições, exit codes, layout de
 *     arquivos): COPIADO literalmente. Um valor copiado não pode divergir em
 *     comportamento — ou é igual, ou o teste de paridade
 *     (`tests/engineLangRegistry.test.ts`) acusa.
 *   - COMPORTAMENTO (parse, contagens, checks): DELEGADO por `require`
 *     POSTERGADO à implementação que já existe. Delegar é a única forma de
 *     garantir que `countRun` desta onda é byte a byte o `parseSpecCounts` de
 *     hoje, com todas as armadilhas já resolvidas lá dentro (ANSI, relatório
 *     forjado, último bloco de resumo). A onda 5 inverte a seta: a
 *     implementação muda de casa para cá e `proofs.ts`/`extract.ts` passam a
 *     consumir o adaptador.
 *
 * POR QUE `require` POSTERGADO E NÃO `import` ESTÁTICO:
 *   1. CICLO. `content/trackTypes.ts` importa `lang/registry.ts`, que importa
 *      ESTE arquivo. `services/challengeExec.ts` e `engine/exec/harness.ts`
 *      importam `content/trackTypes.ts`. Um import estático daqui para lá
 *      fecharia o ciclo na CARGA do módulo — o `require` postergado só toca
 *      esses módulos quando a função é chamada, com o registro já pronto.
 *   2. PESO. `extract.ts` puxa o compilador TypeScript inteiro. O loader de
 *      conteúdo (que só quer abrir uma aula) não pode pagar por isso.
 *   O precedente do repositório é `engine/schemas/artifacts.ts:681`
 *   (`carregarSchemaLazy`), que resolve o mesmo ciclo do mesmo jeito.
 */

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

// NOTA DE CICLO: o import acima é `import type` — e TEM de continuar sendo.
// `registry.ts` importa o VALOR `javascriptAdapter` daqui; um import de valor
// na volta fecharia o ciclo em tempo de AVALIAÇÃO (o `const` de registry.ts
// ainda estaria na zona morta quando este módulo montasse `JS_ENV_SCRUB`).
// Import de tipo é apagado na compilação — não existe em runtime.

// ---------------------------------------------------------------------------
// Módulos carregados sob demanda (ver "POR QUE `require` POSTERGADO")
// ---------------------------------------------------------------------------

type TypeScriptModule = typeof import('typescript');
type ExtractModule = typeof import('../extract');
type ProofsModule = typeof import('../exec/proofs');
type ChallengeExecModule = typeof import('../../services/challengeExec');

function carregar<T>(modulo: string): T {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(modulo) as T;
}

function ts(): TypeScriptModule {
  return carregar<TypeScriptModule>('typescript');
}

// ---------------------------------------------------------------------------
// (8) filePathPattern
// ---------------------------------------------------------------------------

/**
 * Regex de caminho seguro de arquivo de desafio multi-arquivo: só
 * letras/dígitos/_/-//, termina em `.mjs`. Proíbe `..`, pontos no meio e
 * qualquer outra coisa que escape do diretório de execução.
 *
 * FONTE DA VERDADE a partir da onda 5 — ver `content/trackTypes.ts:67`
 * (`SAFE_FILE_PATH_RE`, que a partir desta onda já REEXPORTA este valor).
 * §6 obs. 1: "`SAFE_FILE_PATH_RE` está travado em `.mjs`" — com Go o arquivo
 * tem de terminar em `_test.go`, com Rust o fonte vive em `src/`.
 *
 * SEM a flag `g`: `RegExp` com `g` guarda `lastIndex` entre chamadas e o
 * mesmo objeto compartilhado por quatro arquivos daria falso-negativo
 * alternado em `.test()`.
 */
export const JS_SAFE_FILE_PATH_RE = /^[a-zA-Z0-9_\-/]+\.mjs$/;

// ---------------------------------------------------------------------------
// (9) testCommand
// ---------------------------------------------------------------------------

/**
 * Args canônicos do runner: `node --test` com relatório spec, arquivo único.
 * FONTE DA VERDADE a partir da onda 5 — ver `engine/exec/proofs.ts:74`
 * (`SPEC_TEST_ARGS`).
 */
export const JS_TEST_COMMAND: readonly string[] = ['--test', '--test-reporter=spec', 'test.mjs'];

// ---------------------------------------------------------------------------
// (6) forbiddenInvariants
// ---------------------------------------------------------------------------

/**
 * PROIBIÇÕES GLOBAIS — construções que quebram a decidibilidade da análise
 * estática. Se o código pode montar nomes em tempo de execução, nenhuma
 * promessa de orçamento se sustenta.
 * FONTE DA VERDADE a partir da onda 5 — ver `engine/atomKeys.ts:163`
 * (`FORBIDDEN_ALWAYS`).
 */
export const JS_FORBIDDEN_INVARIANTS: readonly string[] = [
  'global:eval',
  'global:Function',
  'node:WithStatement',
  'node:DebuggerStatement',
  'node:LabeledStatement',
  'node:CommaListExpression',
  'global:arguments',
  'node:ComputedNonLiteralAccess',
];

// ---------------------------------------------------------------------------
// (14) envScrub — ALLOWLIST (§6 obs. 2) + a denylist VIGENTE
// ---------------------------------------------------------------------------

/**
 * A política de ambiente do filho.
 *
 * `strip` reproduz EXATAMENTE o que `buildChildEnv` apaga hoje, na mesma
 * ordem: `NODE_TEST_CONTEXT` primeiro (a armadilha medida: herdado do runner
 * pai, o `node:test` do filho pula tudo e sai 0) e depois a
 * `NETWORK_HARDENING.stripEnv`. `fixed` reproduz `NETWORK_HARDENING.fixedEnv`
 * — e SÓ ele: `LC_ALL`/`TZ` NÃO entram aqui, porque quem os injeta é
 * `applyEnvScrub` (a allowlist normativa). Assim
 * `applyLegacyEnvScrub(envScrub, base)` é byte a byte o `buildChildEnv(base)`
 * de hoje, e a troca para a allowlist do §6 fica sendo uma decisão explícita
 * da onda 5, com o próprio teste — nunca um efeito colateral.
 *
 * FONTE DA VERDADE a partir da onda 5 — ver `engine/exec/harness.ts:175-217`
 * (`NETWORK_HARDENING` e `buildChildEnv`).
 */
export const JS_ENV_SCRUB: EnvScrubPolicy = {
  // Só os EXTRAS desta linguagem — `applyEnvScrub` já une a
  // `ENV_ALLOWLIST_COMUM` (PATH/HOME/TMPDIR/…) do registro, para que nenhuma
  // linguagem possa esquecer o mínimo nem redefini-lo.
  // `nodeBinary()` resolve o binário do filho por `npm_node_execpath` quando o
  // app roda sob npm dentro do Electron — sem ela, na semântica de ALLOWLIST o
  // filho perderia a referência ao node do PATH do npm.
  allow: ['npm_node_execpath'],
  fixed: { NO_PROXY: '*', no_proxy: '*' },
  strip: [
    // ARMADILHA NODE_TEST_CONTEXT: setada pelo node:test do processo PAI;
    // herdada, faz o node:test do filho sair 0 sem rodar NADA.
    'NODE_TEST_CONTEXT',
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'ALL_PROXY',
    'http_proxy',
    'https_proxy',
    'all_proxy',
    // Força verificação TLS padrão no filho.
    'NODE_TLS_REJECT_UNAUTHORIZED',
    // ANSI no relatório derruba o regex de contagem (defesa em profundidade).
    'FORCE_COLOR',
    // NODE_OPTIONS herdado carregaria flags do ambiente do pai.
    'NODE_OPTIONS',
  ],
  scope: [
    'remove proxies herdados (HTTP/HTTPS/ALL) e injeta NO_PROXY=*: derruba tráfego via proxy, acidental ou hostil',
    'remove NODE_TLS_REJECT_UNAUTHORIZED herdado: força verificação TLS padrão',
    'remove NODE_TEST_CONTEXT: sem ela o node:test do filho sai 0 sem rodar nada',
    'LIMITE: não bloqueia socket cru (TCP/UDP) — um payload LLM deliberado ainda conecta via socket puro',
    'LIMITE: o corte de rede de verdade exige wrapper de SO (slot wrapperCommand do harness)',
    'LIMITE: a semântica VIGENTE é denylist (applyLegacyEnvScrub); a allowlist do §6 obs.2 (applyEnvScrub) é a troca deliberada da onda 5',
  ],
};

// ---------------------------------------------------------------------------
// (13) failureExitCodes
// ---------------------------------------------------------------------------

/**
 * §6 obs. 3: "`passed = code === 0 && …` não é universal". Em Node o exit 0
 * mente de duas formas (arquivo de teste vazio e glob vazio saem 0), por isso
 * `successRequiresCountMatch` é invariante — a dupla-igualdade continua
 * obrigatória em toda linguagem.
 * FONTE DA VERDADE a partir da onda 5 — ver `engine/exec/proofs.ts:156`
 * (`exitCodeMeaning`) e o `exitCode !== 0` dos julgadores de `proofs.ts`.
 */
export const JS_FAILURE_POLICY: FailurePolicy = {
  isFailure: (exitCode: number): boolean => exitCode !== 0,
  meaning: (exitCode: number): string =>
    carregar<ProofsModule>('../exec/proofs').exitCodeMeaning(exitCode),
  successRequiresCountMatch: true,
};

// ---------------------------------------------------------------------------
// (7) layout(challenge)
// ---------------------------------------------------------------------------

/** O manifesto obrigatório do runtime — `package.json {type:'module'}`. */
const JS_MANIFEST_PATH = 'package.json';
const JS_ENTRY_PATH = 'solution.mjs';
const JS_TEST_PATH = 'test.mjs';

/**
 * Os arquivos do desafio em disco, na ORDEM de escrita.
 * FONTE DA VERDADE a partir da onda 5 — ver `engine/exec/harness.ts:78-100`
 * (`prepareIsolatedDir`) e `services/challengeExec.ts:96-116`
 * (`prepareChallengeDir`): `package.json {type:'module'}` + os arquivos do
 * lado (ou `solution.mjs`) + `test.mjs`.
 */
export function jsLayout(challenge: ChallengeLayoutInput): ChallengeLayout {
  const files: { path: string; content: string }[] = [
    { path: JS_MANIFEST_PATH, content: JSON.stringify({ type: 'module' }) },
  ];
  if (challenge.files && challenge.files.length > 0) {
    for (const f of challenge.files) files.push({ path: f.path, content: f.code });
  } else {
    files.push({ path: JS_ENTRY_PATH, content: challenge.code });
  }
  files.push({ path: JS_TEST_PATH, content: challenge.testsCode });
  return {
    files,
    entryPath: JS_ENTRY_PATH,
    testPath: JS_TEST_PATH,
    manifestPath: JS_MANIFEST_PATH,
  };
}

// ---------------------------------------------------------------------------
// (4) globals() / builtins()
// ---------------------------------------------------------------------------

let globaisMemo: ReadonlySet<string> | null = null;

/**
 * Globais do runtime, LIDOS DA MÁQUINA e nunca digitados à mão. Uma lista
 * escrita à mão erra nos dois sentidos: esquecer um nome faz o gate deixar
 * passar, e inventar um nome faz o gate reprovar código correto. `globalThis`
 * é a fonte que não mente.
 * FONTE DA VERDADE a partir da onda 5 — ver `engine/extract.ts:121`
 * (`RUNTIME_GLOBALS`). A EXPRESSÃO é copiada literalmente (não o resultado):
 * dois `Set` construídos da mesma expressão no mesmo processo são iguais.
 */
export function jsGlobals(): ReadonlySet<string> {
  if (globaisMemo === null) {
    globaisMemo = new Set<string>([
      ...Object.getOwnPropertyNames(globalThis),
      // Valores que são palavra da linguagem e não propriedade de globalThis
      // em todos os runtimes — incluídos para que o gate os enxergue sempre.
      'undefined',
      'NaN',
      'Infinity',
      'arguments',
      'eval',
    ]);
  }
  return globaisMemo;
}

/**
 * Em JavaScript o conjunto de BUILTINS coincide com o de GLOBAIS: tudo o que
 * a linguagem embute é propriedade de `globalThis`. O §6 lista `globals()` e
 * `builtins()` com barra justamente porque em outras linguagens eles se
 * separam — em Python `len`/`range` são builtins e não são globais de módulo.
 */
export function jsBuiltins(): ReadonlySet<string> {
  return jsGlobals();
}

// ---------------------------------------------------------------------------
// (1) parse(source) — a árvore normalizada
// ---------------------------------------------------------------------------

/**
 * Operadores LÓGICOS e de ATRIBUIÇÃO por TEXTO — a família de um operador
 * decide o eixo da chave (`op:logical:&&` vs `op:binary:+`), porque
 * curto-circuito e atribuição são aulas distintas de comparação.
 * FONTE DA VERDADE a partir da onda 5 — ver `engine/extract.ts:130-165`
 * (`ASSIGNMENT_TOKENS`/`LOGICAL_TOKENS`, hoje por `ts.SyntaxKind`).
 */
const OPS_LOGICOS: ReadonlySet<string> = new Set(['&&', '||', '??']);
const OPS_ATRIBUICAO: ReadonlySet<string> = new Set([
  '=',
  '+=',
  '-=',
  '*=',
  '**=',
  '/=',
  '%=',
  '&=',
  '|=',
  '^=',
  '<<=',
  '>>=',
  '>>>=',
  '&&=',
  '||=',
  '??=',
]);

function familiaDoOperador(texto: string): string {
  if (OPS_ATRIBUICAO.has(texto)) return 'assign';
  if (OPS_LOGICOS.has(texto)) return 'logical';
  return 'binary';
}

/**
 * Os atributos que participam da CHAVE (§6: "tipo + atributo, não só tipo").
 * Só o que a chave usa entra — um mapa de atributos exaustivo seria um
 * segundo AST, e o consumidor tem `native` quando precisa do resto.
 */
function atributosDoNo(node: unknown, T: TypeScriptModule): Record<string, string> {
  const n = node as import('typescript').Node;
  const attrs: Record<string, string> = {};
  if (T.isBinaryExpression(n)) {
    const texto = T.tokenToString(n.operatorToken.kind) ?? T.SyntaxKind[n.operatorToken.kind];
    attrs.operator = texto;
    attrs.operatorFamily = familiaDoOperador(texto);
  } else if (T.isPrefixUnaryExpression(n) || T.isPostfixUnaryExpression(n)) {
    const texto = T.tokenToString(n.operator) ?? T.SyntaxKind[n.operator];
    attrs.operator = texto;
    attrs.operatorFamily = T.isPrefixUnaryExpression(n) ? 'unary' : 'update';
  } else if (T.isVariableDeclarationList(n)) {
    // `let`/`const`/`var` — três aulas distintas com o MESMO tipo de nó.
    const flags = n.flags;
    attrs.kind = (flags & T.NodeFlags.Const) !== 0 ? 'const' : (flags & T.NodeFlags.Let) !== 0 ? 'let' : 'var';
  } else if (T.isIdentifier(n)) {
    attrs.name = n.text;
  }
  return attrs;
}

function normalizarNo(node: unknown, source: unknown, T: TypeScriptModule): LangNode {
  const n = node as import('typescript').Node;
  const sf = source as import('typescript').SourceFile;
  const start = n.getStart(sf);
  const end = n.getEnd();
  const pos = sf.getLineAndCharacterOfPosition(start);
  const filhos: LangNode[] = [];
  T.forEachChild(n, (filho) => {
    filhos.push(normalizarNo(filho, sf, T));
  });
  return {
    type: carregar<ExtractModule>('../extract').kindName(n.kind),
    line: pos.line + 1,
    column: pos.character + 1,
    start,
    end,
    text: sf.text.slice(start, end),
    attributes: atributosDoNo(n, T),
    children: filhos,
    native: n,
  };
}

/**
 * Parseia JavaScript com o compilador TypeScript (o repositório NÃO tem acorn
 * nem eslint-visitor-keys, e o AST do TS modela como NÓ o que o ESTree
 * esconde em atributo — `engine/extract.ts:16-23`).
 *
 * FONTE DA VERDADE a partir da onda 5 — ver `engine/extract.ts:340-357`
 * (`coletarOcorrencias`): mesmo `createSourceFile` (com `setParentNodes`,
 * que `isValueReference` exige), mesmo `ScriptTarget.Latest`, mesmo
 * `ScriptKind` por dialeto e MESMO erro estruturado (`PARSE_ERROR` com
 * linha/coluna 1-based do primeiro diagnóstico).
 *
 * "PARSEIE TUDO, REPROVE NO ORÇAMENTO": o adaptador nunca restringe a
 * gramática — quem reprova é `budget.ts`.
 */
export function jsParse(source: string, options: ParseOptions = {}): ParseResult {
  const T = ts();
  const fileName = options.fileName ?? 'trecho.mjs';
  const scriptKind = options.dialect === 'ts' ? T.ScriptKind.TS : T.ScriptKind.JS;
  const sf = T.createSourceFile(fileName, source, T.ScriptTarget.Latest, true, scriptKind);

  // `parseDiagnostics` não está na superfície pública do TypeScript; o acesso
  // é por cast explícito e isolado, como em `extract.ts:311-315`.
  const holder = sf as import('typescript').SourceFile & {
    parseDiagnostics?: import('typescript').Diagnostic[];
  };
  const diagnostics = holder.parseDiagnostics ?? [];
  if (diagnostics.length > 0) {
    const first = diagnostics[0];
    const pos = sf.getLineAndCharacterOfPosition(first.start ?? 0);
    return {
      ok: false,
      error: {
        code: 'PARSE_ERROR',
        message: T.flattenDiagnosticMessageText(first.messageText, ' '),
        line: pos.line + 1,
        column: pos.character + 1,
      },
    };
  }

  return { ok: true, root: normalizarNo(sf, sf, T), source, native: sf };
}

// ---------------------------------------------------------------------------
// (2) constructKey(node)
// ---------------------------------------------------------------------------

/**
 * Um nó vira ITEM DE ORÇAMENTO. O formato das chaves é o de
 * `engine/atomKeys.ts:76-98` (`nodeKey`/`declKey`/`opKey`) — copiado como
 * TEMPLATE, não importado, para manter este arquivo sem import estático
 * (ver o cabeçalho).
 *
 * LIMITE DECLARADO: este membro cobre os três eixos que saem SÓ do nó
 * (`node:`, `decl:`, `op:`). Os eixos `global:` e `api:` dependem de escopo e
 * de cadeia de acesso e continuam sendo produzidos por
 * `engine/extract.ts:400-440` — a onda 5 (sub-tarefa do extrator) move esse
 * mapeamento para cá inteiro. Nada consome `constructKey` nesta onda; ele é
 * publicado para que o adaptador de Python tenha o alvo.
 */
export function jsConstructKey(node: LangNode): string | null {
  const familia = node.attributes.operatorFamily;
  const operador = node.attributes.operator;
  if (familia !== undefined && operador !== undefined) return `op:${familia}:${operador}`;
  if (node.type === 'VariableDeclarationList' && node.attributes.kind !== undefined) {
    return `decl:${node.attributes.kind}`;
  }
  return `node:${node.type}`;
}

// ---------------------------------------------------------------------------
// (3) inventory()
// ---------------------------------------------------------------------------

let inventarioMemo: readonly string[] | null = null;

/**
 * O enum FECHADO de tipos de nó — o universo do qual o COMPLEMENTO (o que a
 * aula não ensina) é materializado, e a fonte do `enum` de
 * `lesson.introduces.nodeTypes` (§6: "gerado do `inventory()`, nunca
 * digitado").
 *
 * Um nome é CANÔNICO se, e somente se, `kindName(valor) === nome` — isso
 * elimina os marcadores de faixa (`First*`/`Last*`) e os aliases sombreados
 * sem duplicar a tabela canônica do extrator.
 * FONTE DA VERDADE a partir da onda 5 — ver `engine/vocab/generate.ts:180`
 * (`nomesCanonicosSyntaxKind`), que faz exatamente esta varredura sobre o
 * runtime injetado.
 */
export function jsInventory(): readonly string[] {
  if (inventarioMemo === null) {
    const T = ts();
    const kindName = carregar<ExtractModule>('../extract').kindName;
    const enumeracao = T.SyntaxKind as unknown as Record<string, number>;
    const canonicos: string[] = [];
    for (const [nome, valor] of Object.entries(enumeracao)) {
      if (/^\d+$/.test(nome)) continue; // chaves numéricas (busca reversa do enum)
      if (nome.startsWith('First') || nome.startsWith('Last')) continue; // marcador de faixa
      if (kindName(valor) !== nome) continue; // alias sombreado — não canônico
      canonicos.push(nome);
    }
    canonicos.sort();
    inventarioMemo = canonicos;
  }
  return inventarioMemo;
}

// ---------------------------------------------------------------------------
// (5) resolveScopes(AST)
// ---------------------------------------------------------------------------

/**
 * Resolução de escopo PLANA, com o limite DECLARADO (`extract.ts:38-43`): o
 * extrator junta todos os nomes declarados no arquivo e trata como global o
 * identificador que sobrou. Para trecho de aula (dezenas de linhas) isso
 * acerta; um shadowing deliberado de nome global (`const console = …`) faria
 * o extrator deixar de reportar `global:console`.
 *
 * FONTE DA VERDADE a partir da onda 5 — ver `engine/extract.ts:255`
 * (`collectDeclaredNames`, hoje NÃO exportada) e `engine/extract.ts:295`
 * (`isValueReference`). ESTE é o único membro do arquivo em que o
 * comportamento foi PORTADO em vez de delegado, porque a função de origem não
 * é exportável sem tocar `extract.ts` (que é de outra sub-tarefa). A onda 5
 * tem DUAS saídas legítimas: exportar `collectDeclaredNames` e fazer este
 * membro delegar, ou mover as duas funções para cá e `extract.ts` passar a
 * consumir daqui. O que NÃO pode é as duas versões seguirem vivas.
 */
export function jsResolveScopes(parsed: ParseOk): ScopeResolution {
  const T = ts();
  const sf = parsed.native as import('typescript').SourceFile;
  const declared = new Set<string>();
  const imported = new Set<string>();

  const addBinding = (name: import('typescript').BindingName): void => {
    if (T.isIdentifier(name)) {
      declared.add(name.text);
      return;
    }
    for (const el of name.elements) {
      if (T.isBindingElement(el)) addBinding(el.name);
    }
  };

  const walk = (node: import('typescript').Node): void => {
    if (T.isVariableDeclaration(node)) addBinding(node.name);
    else if (T.isParameter(node)) addBinding(node.name);
    else if (T.isFunctionDeclaration(node) && node.name) declared.add(node.name.text);
    else if (T.isClassDeclaration(node) && node.name) declared.add(node.name.text);
    else if (T.isFunctionExpression(node) && node.name) declared.add(node.name.text);
    else if (T.isImportSpecifier(node)) {
      declared.add(node.name.text);
      imported.add(node.name.text);
    } else if (T.isImportClause(node) && node.name) {
      declared.add(node.name.text);
      imported.add(node.name.text);
    } else if (T.isNamespaceImport(node)) {
      declared.add(node.name.text);
      imported.add(node.name.text);
    } else if (T.isCatchClause(node) && node.variableDeclaration) {
      addBinding(node.variableDeclaration.name);
    }
    T.forEachChild(node, walk);
  };
  T.forEachChild(sf, walk);

  // `free`: identificador em posição de VALOR que ninguém declarou.
  const ehReferenciaDeValor = (node: import('typescript').Identifier): boolean => {
    const parent = node.parent;
    if (!parent) return false;
    if (T.isPropertyAccessExpression(parent) && parent.name === node) return false;
    if (T.isPropertyAssignment(parent) && parent.name === node) return false;
    if (T.isBindingElement(parent) && parent.propertyName === node) return false;
    if (T.isImportSpecifier(parent) || T.isExportSpecifier(parent)) return false;
    if (T.isParameter(parent) && parent.name === node) return false;
    if (T.isVariableDeclaration(parent) && parent.name === node) return false;
    if (T.isFunctionDeclaration(parent) && parent.name === node) return false;
    if (T.isClassDeclaration(parent) && parent.name === node) return false;
    if (T.isMethodDeclaration(parent) && parent.name === node) return false;
    if (T.isLabeledStatement(parent) && parent.label === node) return false;
    return true;
  };

  const free = new Set<string>();
  const globais = new Set<string>();
  const runtimeGlobals = jsGlobals();
  const visitar = (node: import('typescript').Node): void => {
    if (T.isIdentifier(node) && ehReferenciaDeValor(node) && !declared.has(node.text)) {
      free.add(node.text);
      if (runtimeGlobals.has(node.text)) globais.add(node.text);
    }
    T.forEachChild(node, visitar);
  };
  T.forEachChild(sf, visitar);

  return { declared, imported, free, globals: globais };
}

// ---------------------------------------------------------------------------
// (10)(11)(12) a dupla-igualdade e os checks — DELEGADOS
// ---------------------------------------------------------------------------

/**
 * Contagem DECLARADA de testes, por AST. Existe UMA função para isso na
 * engine, e é esta — comentário não é nó, e um `// test(` comentado não conta.
 * FONTE DA VERDADE a partir da onda 5 — ver `engine/extract.ts:494`
 * (`countTestDeclarations`).
 */
export function jsCountDeclared(testsCode: string): number {
  return carregar<ExtractModule>('../extract').countTestDeclarations(testsCode);
}

/**
 * Contagem EXECUTADA, do ÚLTIMO bloco de resumo spec (o código sob teste pode
 * imprimir um resumo FORJADO no próprio stdout; o do runner real vem sempre
 * por último). Tolerante a ANSI.
 * FONTE DA VERDADE a partir da onda 5 — ver `engine/exec/proofs.ts:115`
 * (`parseSpecCounts`).
 */
export function jsCountRun(output: string): RunCounts {
  return carregar<ProofsModule>('../exec/proofs').parseSpecCounts(output);
}

/**
 * Checks individuais para a UI do aluno (`✔`/`✖`), sem a duração e sem os
 * nomes sintéticos de falha de load.
 * FONTE DA VERDADE a partir da onda 5 — ver `services/challengeExec.ts:158`
 * (`parseSpecChecks`).
 */
export function jsParseChecks(output: string): RunCheck[] {
  return carregar<ChallengeExecModule>('../../services/challengeExec').parseSpecChecks(output);
}

// ---------------------------------------------------------------------------
// (15) detect()
// ---------------------------------------------------------------------------

/**
 * Binário do NODE a usar nos processos filhos. DENTRO DO ELECTRON,
 * `process.execPath` é o binário do Electron (que não entende `--test` e
 * travaria) — usa o node do PATH (`npm_node_execpath` quando o app roda via
 * npm, senão `node`). Em node puro (testes/CLI) usa o processo atual.
 * FONTE DA VERDADE a partir da onda 5 — ver `services/challengeExec.ts:52`
 * (`nodeBinary`).
 */
export function jsNodeBinary(): string {
  if (process.versions.electron) {
    return process.env.npm_node_execpath || 'node';
  }
  return process.execPath;
}

/**
 * Detecção da toolchain. SÍNCRONA e SEM subprocesso: em JavaScript o runtime
 * do filho é o mesmo do processo, então a versão sai de `process.versions` —
 * não há o que sondar. Os adaptadores de Tier B (Python, Go) usam `spawnSync`
 * aqui, e é por isso que a assinatura do §6 tem de continuar síncrona.
 *
 * `degradacao` é a "mensagem de degradação" que o §6 pede: quando a toolchain
 * falta, o produto DIZ o que deixou de funcionar. Em JavaScript o único caso
 * é o Electron sem `npm_node_execpath`, em que o fallback é o `node` do PATH
 * e a existência dele não é conferida aqui (o `spawn` acusa).
 */
export function jsDetect(): DetectResult {
  const binary = jsNodeBinary();
  const version = process.versions.node ?? null;
  const incerto = process.versions.electron !== undefined && !process.env.npm_node_execpath;
  return {
    ok: true,
    binary,
    version,
    degradacao: incerto
      ? "rodando sob Electron sem npm_node_execpath: o binário do filho é o 'node' do PATH e não foi verificado — um PATH sem node faz as provas de execução falharem no spawn"
      : null,
  };
}

// ---------------------------------------------------------------------------
// O ADAPTADOR
// ---------------------------------------------------------------------------

/**
 * Tags de bloco cercado que a engine trata como JavaScript executável.
 * FONTE DA VERDADE a partir da onda 5 — ver `engine/theoryCode.ts:32`
 * (`JS_FENCE_TAGS`, que a partir desta onda já REEXPORTA este valor).
 */
export const JS_THEORY_FENCE_TAGS: readonly string[] = ['js', 'javascript', 'mjs', 'cjs', 'node', 'jsx'];

/**
 * Tokens de `challenge.language` / `track.programmingLanguage` que resolvem
 * para este adaptador. `'nodejs'` é o RUNTIME (§6: "`nodejs` não é uma
 * linguagem, é um runtime") e continua sendo o valor no disco das 112
 * trilhas; `'javascript'` é a linguagem, e é o id.
 */
export const JS_CHALLENGE_LANGUAGES: readonly ChallengeLanguageToken[] = ['javascript', 'nodejs'];

export const javascriptAdapter: LanguageAdapter = {
  id: 'javascript',
  label: 'JavaScript',
  challengeLanguages: JS_CHALLENGE_LANGUAGES,
  defaultRuntime: 'nodejs',
  theoryFenceTags: JS_THEORY_FENCE_TAGS,

  parse: jsParse,
  constructKey: jsConstructKey,
  inventory: jsInventory,
  globals: jsGlobals,
  builtins: jsBuiltins,
  resolveScopes: jsResolveScopes,
  forbiddenInvariants: JS_FORBIDDEN_INVARIANTS,
  layout: jsLayout,
  filePathPattern: JS_SAFE_FILE_PATH_RE,
  testCommand: JS_TEST_COMMAND,
  countDeclared: jsCountDeclared,
  countRun: jsCountRun,
  parseChecks: jsParseChecks,
  failureExitCodes: JS_FAILURE_POLICY,
  envScrub: JS_ENV_SCRUB,
  detect: jsDetect,
};
