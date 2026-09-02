/**
 * app/electron/main/engine/lang/javascript.ts — O ADAPTADOR JAVASCRIPT.
 *
 * A primeira linha da tabela do §6 de
 * `docs/research/08-multilingua-trava-deterministica.md` (linhas 866-891), e
 * a única que existe hoje. §7, item 1: "JavaScript. Não é escolha, é
 * obrigação: é a linguagem da trilha que já existe e tem 32% de desafios
 * violando a trava. Nenhuma peça nova."
 *
 * ─── ONDA 6: A SETA INVERTEU, E POR QUE ELA TINHA DE INVERTER ─────────────
 *
 * Até a onda 5 este adaptador DELEGAVA comportamento por `require` POSTERGADO
 * com caminho RELATIVO, dentro de um helper `carregar(modulo)`:
 *
 *     carregar<ProofsModule>('../exec/proofs').parseSpecCounts(saida)
 *     carregar<ExtractModule>('../extract').countTestDeclarations(codigo)
 *     carregar<ChallengeExecModule>('../../services/challengeExec').parseSpecChecks(s)
 *
 * Isso QUEBRAVA O APP EMPACOTADO, e de forma invisível para o gate. Rollup não
 * enxerga `require(variável)` — a string literal sobrevive ao bundle e, quando
 * resolvida a partir de `out/main/index.js`, aponta para `out/exec/proofs` e
 * `out/services/challengeExec`, que não existem. Reprodução medida:
 *
 *     npm run build && cd out/main && node -e "require('../exec/proofs')"
 *     → Error: Cannot find module '../exec/proofs'   (MODULE_NOT_FOUND)
 *
 * Raio de explosão: `runStudentCode` (a submissão de código DO ALUNO, via IPC)
 * e `verifyChallengePair` (regeneração de desafio), as duas em
 * `services/challengeExec.ts` — as únicas chamadas destes membros que entram no
 * bundle do main. Rodando DO FONTE (suíte, `npm run engine`, `npm run track`,
 * provas/F9/F12 sob `tsx`) tudo funcionava; no app instalado o aluno apertava
 * "verificar" e o processo main lançava MODULE_NOT_FOUND.
 *
 * O CONSERTO NÃO FOI TROCAR POR `import` ESTÁTICO — seria trocar um defeito por
 * outro. `../extract` puxa o compilador TypeScript inteiro (medido:
 * `require('typescript')` custa ~42 ms e ~45 MB de RSS), e este módulo é
 * avaliado na CARGA do main (registry ← trackTypes ← challengeExec). Um import
 * estático faria todo start do app pagar o compilador só para abrir uma aula.
 * O conserto foi BUNDLER-AWARE, e tem três partes:
 *
 *   1. OS MEMBROS PUROS MUDARAM DE CASA PARA CÁ. `parseSpecCounts`,
 *      `exitCodeMeaning` (eram de `exec/proofs.ts`) e `parseSpecChecks` (era de
 *      `services/challengeExec.ts`) são funções de STRING — zero peso, zero
 *      dependência. Elas vivem aqui agora e os arquivos de origem REEXPORTAM
 *      daqui. Uma implementação, um lugar: é a inversão que o cabeçalho da onda
 *      5 já prometia ("a implementação muda de casa para cá").
 *   2. `countTestDeclarations` IDEM: o corpo JavaScript veio para cá
 *      (`jsCountDeclared`) e `engine/extract.ts` virou o DESPACHANTE puro
 *      (`getAdapter(language).countDeclared(...)`). Ele precisa do compilador,
 *      mas agora o alcança pelo mesmo `ts()` POSTERGADO deste arquivo.
 *   3. O ÚNICO `require` que sobrou é `require('typescript')` — especificador
 *      BARE e LITERAL. Bare porque o Node resolve por `node_modules` de
 *      qualquer diretório (o bundle inclusive); literal porque assim o Rollup o
 *      ENXERGA, e `externalizeDepsPlugin()` o mantém externo em vez de inlinar
 *      o compilador no `out/main/index.js`. Para isso `typescript` deixou de ser
 *      devDependency e virou DEPENDENCY (`app/package.json`): como devDep, o
 *      electron-builder não o empacotava e o app instalado morreria no
 *      `require('typescript')` de qualquer jeito.
 *
 * REGRA QUE FICA (guardada por teste em `tests/engineLangRegistry.test.ts`):
 * NENHUM `require`/`import()` de caminho RELATIVO neste arquivo. Se um membro
 * precisar de algo de fora, ou o algo vem para cá, ou entra por `import type`.
 *
 * A técnica de VALOR continua: regex, lista de args, lista de proibições, exit
 * codes e layout de arquivos são COPIADOS literalmente, e o teste de paridade
 * (`tests/engineLangRegistry.test.ts`) acusa qualquer divergência.
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
// O COMPILADOR, sob demanda (o único `require` do arquivo — ver o cabeçalho)
// ---------------------------------------------------------------------------

type TypeScriptModule = typeof import('typescript');

let tsMemo: TypeScriptModule | null = null;

/**
 * O compilador TypeScript, carregado na PRIMEIRA chamada e memoizado.
 *
 * `require('typescript')` — LITERAL e BARE, e as duas coisas importam:
 *   - LITERAL: `require(variável)` é invisível ao Rollup; com o literal ele vê
 *     a dependência, e `externalizeDepsPlugin()` (que externaliza tudo o que
 *     está em `dependencies`) a deixa FORA do bundle. Sem isso o compilador
 *     inteiro entraria em `out/main/index.js`.
 *   - BARE: um caminho relativo não sobrevive ao bundle (a árvore de `out/`
 *     não é a de `electron/`). Um especificador de pacote resolve por
 *     `node_modules` a partir de qualquer diretório — do fonte e do bundle.
 *   - POSTERGADO: este módulo é avaliado na carga do main; o compilador custa
 *     ~42 ms e ~45 MB, e só é preciso quando alguém parseia código de verdade.
 */
function ts(): TypeScriptModule {
  if (tsMemo === null) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    tsMemo = require('typescript') as TypeScriptModule;
  }
  return tsMemo;
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
 * Classificação HONESTA de um exit code para as mensagens das provas.
 * 137 (SIGKILL) não distingue timeout de OOM — devolve exatamente
 * "timeout-ou-OOM", e o chamador nunca afirma qual dos dois.
 *
 * ONDA 6 — MUDOU DE CASA. Esta é a implementação de `FailurePolicy.meaning`, e
 * ela vive AQUI: `engine/exec/proofs.ts` REEXPORTA daqui. Antes era o
 * contrário, alcançada por `require('../exec/proofs')` — o caminho relativo que
 * não sobrevive ao bundle do main (ver o cabeçalho).
 */
export function exitCodeMeaning(exitCode: number): string {
  if (exitCode === 137) return 'timeout-ou-OOM';
  return `exit ${exitCode}`;
}

/**
 * §6 obs. 3: "`passed = code === 0 && …` não é universal". Em Node o exit 0
 * mente de duas formas (arquivo de teste vazio e glob vazio saem 0), por isso
 * `successRequiresCountMatch` é invariante — a dupla-igualdade continua
 * obrigatória em toda linguagem.
 */
export const JS_FAILURE_POLICY: FailurePolicy = {
  isFailure: (exitCode: number): boolean => exitCode !== 0,
  meaning: exitCodeMeaning,
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

// ---------------------------------------------------------------------------
// A tabela canônica de nomes de `SyntaxKind` — construída do compilador LAZY
// ---------------------------------------------------------------------------

let kindNamesMemo: ReadonlyMap<number, string> | null = null;

/**
 * `SyntaxKind` → nome CANÔNICO, construída na PRIMEIRA necessidade e memoizada.
 *
 * A ARMADILHA QUE ELA RESOLVE (a mesma de `engine/kindNames.ts`): o enum
 * `ts.SyntaxKind` tem marcadores de FAIXA (`FirstLiteralToken`,
 * `FirstStatement`, `FirstBinaryOperator`, …) que compartilham o valor numérico
 * de um kind real, e a busca reversa de um enum do TypeScript devolve o ÚLTIMO
 * nome atribuído ao valor — `ts.SyntaxKind[ts.SyntaxKind.NumericLiteral]` é
 * `"FirstLiteralToken"`. Um orçamento escrito contra `node:NumericLiteral`
 * nunca casaria. A tabela prefere sempre o nome que NÃO é marcador de faixa.
 *
 * POR QUE ELA NÃO É IMPORTADA DE `engine/kindNames.ts`: aquele módulo importa
 * `typescript` ESTATICAMENTE, e um import estático daqui faria todo start do
 * main pagar o compilador (~42 ms, ~45 MB) só para abrir uma aula — a razão de
 * PESO do cabeçalho. O algoritmo é curto e a divergência é impossível de
 * passar: `tests/engineLangRegistry.test.ts` compara `jsKindName` com o
 * `kindName` de `engine/kindNames.ts` para TODO valor do enum, um a um.
 */
function tabelaDeNomesDeKind(): ReadonlyMap<number, string> {
  if (kindNamesMemo === null) {
    const enumeracao = ts().SyntaxKind as unknown as Record<string, number>;
    const map = new Map<number, string>();
    for (const nome of Object.keys(enumeracao)) {
      if (!Number.isNaN(Number(nome))) continue; // chave numérica (busca reversa)
      const valor = enumeracao[nome];
      const ehMarcadorDeFaixa = nome.startsWith('First') || nome.startsWith('Last');
      const atual = map.get(valor);
      if (
        atual === undefined ||
        (ehMarcadorDeFaixa === false && (atual.startsWith('First') || atual.startsWith('Last')))
      ) {
        map.set(valor, nome);
      }
    }
    kindNamesMemo = map;
  }
  return kindNamesMemo;
}

/** Nome canônico de um `SyntaxKind` (`ts.SyntaxKind.NumericLiteral` → `NumericLiteral`). */
export function jsKindName(kind: number): string {
  return tabelaDeNomesDeKind().get(kind) ?? String(kind);
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

/**
 * Um `ts.Node` visto como `LangNode` SOB DEMANDA — a ponte que faltava entre a
 * caminhada NATIVA do extrator e `constructKey` (ONDA 7).
 *
 * O PROBLEMA QUE ELA RESOLVE. `engine/extract.ts` caminha o `ts.Node` (ela
 * depende de `ts.isPropertyAccessExpression`, do eixo `form:` e das posições
 * absolutas — nada disso existe no `LangNode`), mas o membro 2 dos 15 do §6 é
 * `constructKey(node: LangNode)`. Sem uma vista, as chaves SINTÉTICAS do
 * adaptador de TypeScript (`node:KeyOfType`, `node:ReadonlyArrayType`,
 * `node:TypeOnlyImport`, `node:DoubleAssertionViaUnknown`) existiriam, seriam
 * testadas e nunca chegariam ao gate.
 *
 * POR QUE PREGUIÇOSA, E NÃO `normalizarNo`. `normalizarNo` é RECURSIVA E
 * EAGER: ela materializa a árvore inteira e refatia o texto do fonte uma vez
 * por NÍVEL. Chamá-la por nó, dentro de uma caminhada que já visita todo nó,
 * seria quadrático — e a onda 6 tornou `ParseOk.root` preguiçoso exatamente
 * para não pagar essa conta no `audit`, que roda em laço. Aqui cada campo é um
 * getter memoizado: `constructKey` toca `type` e `attributes` (baratos), toca
 * `text` só num `TypeOperator` e `children` só num `AsExpression`.
 *
 * O objeto devolvido é a MESMA forma de `normalizarNo` — `synthetic` fica
 * `undefined` porque em JavaScript/TypeScript todo nó da vista vem da árvore
 * real; quem cria nó PORTADOR é o adaptador de subprocesso (Python).
 */
export function jsViewNode(node: unknown, source: unknown): LangNode {
  return vistaDoNo(node, source, ts(), tabelaDeNomesDeKind());
}

function vistaDoNo(
  node: unknown,
  source: unknown,
  T: TypeScriptModule,
  nomeDoKind: ReadonlyMap<number, string>,
): LangNode {
  const n = node as import('typescript').Node;
  const sf = source as import('typescript').SourceFile;
  let inicioMemo: number | null = null;
  const inicio = (): number => (inicioMemo ??= n.getStart(sf));
  let posMemo: { line: number; character: number } | null = null;
  const pos = (): { line: number; character: number } =>
    (posMemo ??= sf.getLineAndCharacterOfPosition(inicio()));
  let textoMemo: string | null = null;
  let attrsMemo: Record<string, string> | null = null;
  let filhosMemo: LangNode[] | null = null;
  return {
    type: nomeDoKind.get(n.kind) ?? String(n.kind),
    get line(): number {
      return pos().line + 1;
    },
    get column(): number {
      return pos().character + 1;
    },
    get start(): number {
      return inicio();
    },
    get end(): number {
      return n.getEnd();
    },
    get text(): string {
      return (textoMemo ??= sf.text.slice(inicio(), n.getEnd()));
    },
    get attributes(): Readonly<Record<string, string>> {
      return (attrsMemo ??= atributosDoNo(n, T));
    },
    get children(): readonly LangNode[] {
      if (filhosMemo === null) {
        const out: LangNode[] = [];
        T.forEachChild(n, (filho) => {
          out.push(vistaDoNo(filho, sf, T, nomeDoKind));
        });
        filhosMemo = out;
      }
      return filhosMemo;
    },
    native: n,
  };
}

/**
 * Um `ts.Node` vira um `LangNode` da interface do §6.
 *
 * `nomeDoKind` entra por PARÂMETRO (e não por `jsKindName`) porque esta função
 * é chamada UMA VEZ POR NÓ: resolver a tabela canônica aqui dentro custaria uma
 * chamada + um teste de memo por nó da árvore inteira. O chamador resolve uma
 * vez e passa a referência.
 */
function normalizarNo(
  node: unknown,
  source: unknown,
  T: TypeScriptModule,
  nomeDoKind: ReadonlyMap<number, string>,
): LangNode {
  const n = node as import('typescript').Node;
  const sf = source as import('typescript').SourceFile;
  const start = n.getStart(sf);
  const end = n.getEnd();
  const pos = sf.getLineAndCharacterOfPosition(start);
  const filhos: LangNode[] = [];
  T.forEachChild(n, (filho) => {
    filhos.push(normalizarNo(filho, sf, T, nomeDoKind));
  });
  return {
    type: nomeDoKind.get(n.kind) ?? String(n.kind),
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
 *
 * ─── `root` É PREGUIÇOSO (onda 6, regressão de performance medida) ─────────
 *
 * `root` é um GETTER MEMOIZADO: a árvore normalizada só é materializada quando
 * alguém a acessa. O contrato de `ParseOk` não muda — `r.root` continua sendo
 * um `LangNode` e o consumidor não vê diferença nenhuma.
 *
 * O QUE ESTAVA QUEBRADO. `normalizarNo` constrói um objeto NOVO por nó do AST,
 * com `text` fatiado do fonte (O(tamanho do fonte) por NÍVEL da árvore, porque
 * cada ancestral refatia o texto dos descendentes), um `attributes` e uma lista
 * de filhos. Isso era pago em TODA chamada de `parse` — e o único consumidor de
 * `parse` no repositório, `engine/extract.ts:coletarOcorrencias`, NÃO usa
 * `root`: a caminhada do extrator é sobre `parsed.native` (o `ts.SourceFile`),
 * porque ela depende de `ts.isPropertyAccessExpression`, do eixo `form:` e das
 * posições absolutas — nada disso existe no `LangNode` normalizado. O extrator
 * pagava a árvore inteira para jogá-la fora.
 *
 * Por que isso importava: `audit` é o comando que roda EM LAÇO no ciclo
 * "gerar → auditar → consertar → regerar", e cada aula/desafio auditado é um
 * `parse`. Medido em `nodejs-do-zero --limite 0`, e reportado no handoff da
 * onda 6.
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

  let rootMemo: LangNode | null = null;
  return {
    ok: true,
    get root(): LangNode {
      if (rootMemo === null) rootMemo = normalizarNo(sf, sf, T, tabelaDeNomesDeKind());
      return rootMemo;
    },
    source,
    native: sf,
  };
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
 * de cadeia de acesso, e continuam sendo produzidos pela caminhada nativa de
 * `engine/extract.ts` — que os grava com uma POSIÇÃO que o `LangNode` não sabe
 * expressar (o NOME da propriedade, o especificador do import, a ocorrência do
 * identificador). Não é dívida: é onde a informação está.
 *
 * ONDA 7 — ELE GANHOU CONSUMIDOR. `engine/extract.ts` chama `constructKey` por
 * nó, nas duas caminhadas, e aceita dele o eixo `node:` ao lado da chave
 * genérica. Para ESTE adaptador isso é, por construção, um NO-OP: `node:<type>`
 * é idêntico à genérica, e `op:`/`decl:` não são do eixo aceito. É por isso que
 * o placar de `nodejs-do-zero` (717 · 112 · 249) não se moveu — a mudança só
 * tem efeito onde há chave SINTÉTICA, isto é, em `typescript` e em `python`.
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
    const nomeDoKind = tabelaDeNomesDeKind();
    const enumeracao = T.SyntaxKind as unknown as Record<string, number>;
    const canonicos: string[] = [];
    for (const [nome, valor] of Object.entries(enumeracao)) {
      if (/^\d+$/.test(nome)) continue; // chaves numéricas (busca reversa do enum)
      if (nome.startsWith('First') || nome.startsWith('Last')) continue; // marcador de faixa
      if (nomeDoKind.get(valor) !== nome) continue; // alias sombreado — não canônico
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
// (10)(11)(12) a dupla-igualdade e os checks — A IMPLEMENTAÇÃO MORA AQUI
// ---------------------------------------------------------------------------

/**
 * Contagem DECLARADA de testes, por AST. Existe UMA função para isso na engine,
 * e é esta — comentário não é nó, e um `// test(` comentado não conta.
 *
 * POR QUE POR AST E NÃO POR REGEX: a segunda implementação do repositório era
 * uma regex, e ela contava `// test('x', …)` comentado. O efeito medido: o
 * validador semântico entrava em retry e devolvia erro de JSON inválido para
 * sempre (`docs/16-engine-de-trilha.md` §5.3). Comentário não é nó.
 *
 * `test.skip(...)` / `test.only(...)` também DECLARAM um teste e contam.
 *
 * ONDA 6 — MUDOU DE CASA. O corpo era de `engine/extract.ts`
 * (`countTestDeclarations`), alcançado daqui por `require('../extract')` — o
 * caminho relativo que quebrava o bundle do main (ver o cabeçalho), e que ainda
 * arrastava o extrator inteiro para dentro de uma contagem de testes.
 * `countTestDeclarations` continua existindo e continua sendo a API pública:
 * virou o DESPACHANTE por linguagem, que chama este membro.
 */
export function jsCountDeclared(testsCode: string): number {
  const T = ts();
  const source = T.createSourceFile('tests.mjs', testsCode, T.ScriptTarget.Latest, true, T.ScriptKind.JS);
  let count = 0;
  const visit = (node: import('typescript').Node): void => {
    if (T.isCallExpression(node)) {
      const callee = node.expression;
      if (T.isIdentifier(callee) && callee.text === 'test') count += 1;
      else if (
        T.isPropertyAccessExpression(callee) &&
        T.isIdentifier(callee.expression) &&
        callee.expression.text === 'test'
      ) {
        // `test.skip(...)` / `test.only(...)` também declaram um teste.
        count += 1;
      }
    }
    T.forEachChild(node, visit);
  };
  T.forEachChild(source, visit);
  return count;
}

/**
 * Contagem EXECUTADA: as contagens do ÚLTIMO bloco de resumo spec do node:test
 * (linhas `ℹ tests N` …).
 *
 * POR QUE O ÚLTIMO: o código sob teste pode imprimir um resumo spec FORJADO no
 * próprio stdout (CRITICAL 1 — `console.log('ℹ tests 2\nℹ pass 2\nℹ fail 0')`
 * no topo do módulo, de olho no parser que confiava na PRIMEIRA ocorrência).
 * O resumo do runner REAL é emitido por último, depois de todo stdout do código
 * sob teste (testes rodam, depois o runner imprime o fechamento) — o último
 * bloco é, por construção, o do runner. Bloco = da última linha `ℹ tests N` até
 * o fim (as seções posteriores — `✖ failing tests:` — não têm linhas `ℹ` de
 * resumo).
 *
 * Formato tolerado nas DUAS variantes que o node:test emite: bloco COMPLETO
 * (`tests/suites/pass/fail/cancelled/skipped/todo/duration_ms`) e bloco MÍNIMO
 * (`tests/pass/fail`, como nos fixtures), com ou sem códigos ANSI — os escapes
 * são removidos ANTES do bloco (`\x1b[34mℹ tests 3\x1b[39m`: o node:test pinta
 * quando o ambiente pede cor; senão a linha "não começa com ℹ" e a contagem
 * viraria 0, derrubando o gate de um resultado que passou). Linha ausente em
 * qualquer posição ⇒ 0 (fail-closed: sem relatório não há como provar que algo
 * rodou).
 *
 * ONDA 6 — MUDOU DE CASA. O corpo era de `engine/exec/proofs.ts`
 * (`parseSpecCounts`), que agora REEXPORTA daqui. E o caminho do ALUNO
 * (`services/challengeExec.ts`) tinha uma SEGUNDA implementação, mais fraca —
 * lia a PRIMEIRA linha `ℹ tests N` e ignorava `skipped`, ou seja, engolia o
 * relatório forjado que o caminho das provas rejeitava. Ela foi APAGADA: agora
 * as duas pontas chamam `adapter.countRun`, que é esta função.
 */
export function jsCountRun(output: string): RunCounts {
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
 * Checks INDIVIDUAIS do relatório spec do node:test (linhas `✔ nome` / `✖ nome`
 * — os `N de M` da UI do aluno), sem a duração e sem os nomes sintéticos de
 * falha de load.
 *
 * Apenas as linhas ANTES do resumo (`ℹ tests N`) contam: o relatório REPRIME
 * cada teste falho numa seção "failing tests:" no fim — sem truncar, cada falha
 * entraria DUAS vezes. O nome sai sem a duração traiçoeira (` (0.42175ms)`) e
 * sem os códigos ANSI (mesma limpeza de `jsCountRun`). Linhas ancoradas no
 * INÍCIO da linha: subtests indentados (`  ✔ filho`) nunca entram; o cabeçalho
 * `✖ failing tests:` é filtrado explicitamente (sem o resumo `ℹ tests N` —
 * output truncado — ele NÃO é cortado pelo truncamento e viraria um check
 * sintético falso).
 *
 * ONDA 6 — MUDOU DE CASA. O corpo era de `services/challengeExec.ts`
 * (`parseSpecChecks`), que agora REEXPORTA daqui: alcançá-lo por
 * `require('../../services/challengeExec')` quebrava o bundle do main (ver o
 * cabeçalho) e ainda fechava um ciclo `challengeExec → registry → javascript →
 * challengeExec` que só não explodia por ser postergado.
 */
export function jsParseChecks(output: string): RunCheck[] {
  const plain = output.replace(/\x1b\[[0-9;]*m/g, '');
  const lines = plain.split('\n');
  const summaryIdx = lines.findIndex((l) => /^ℹ tests /m.test(l));
  const head = (summaryIdx >= 0 ? lines.slice(0, summaryIdx) : lines).join('\n');
  const checks: RunCheck[] = [];
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
