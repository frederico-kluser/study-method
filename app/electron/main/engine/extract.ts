/**
 * app/electron/main/engine/extract.ts — o EXTRATOR DETERMINÍSTICO de construções.
 *
 * Problema real: hoje o único gate de uma trilha prova FORMA (schema válido,
 * solução passa, starter falha) e nunca prova CONHECIMENTO. Resultado medido:
 * 43 dos 136 desafios cobram construção que nenhuma aula anterior ensinou, e
 * os módulos 1 a 6 violam em 100% dos desafios. Perguntar isso a uma LLM não
 * resolve — juiz de LLM julgando corretude de código sem executar concorda com
 * o resultado real a Cohen's κ ≈ 0,21 e aceita metade do código errado.
 *
 * Premissa deste arquivo: "quais construções este código exige" é uma pergunta
 * de PARSER, não de julgamento. Entra código, sai um conjunto de chaves de
 * átomo (`atomKeys.ts`) com linha, coluna e trecho ofensor. Roda em
 * milissegundos, sem rede, sem chave de API, e tem poder de veto.
 *
 * Por que TypeScript e não acorn: o repositório NÃO tem acorn, nem
 * eslint-visitor-keys, nem esquery, nem eslint-scope — nem transitivamente
 * (medido em `app/node_modules`). Tem `typescript@5.8.3` como dependência
 * direta. Além de custar zero dependência nova, o AST do TypeScript modela
 * como NÓ o que o ESTree esconde em atributo: `typeof` é `TypeOfExpression` e
 * `!==` é `ExclamationEqualsEqualsToken`, em vez de `UnaryExpression[operator]`
 * e `BinaryExpression[operator]`. E a versão fica presa em 5.8.3, longe da
 * armadilha do `typescript@7`, que moveu a API de AST de lugar.
 *
 * PARSEIE TUDO, REPROVE NO ORÇAMENTO. O extrator nunca restringe a gramática:
 * restringir no parser produz "unexpected token", que não ensina nada a quem
 * escreve a trilha. Ele aceita a linguagem inteira e devolve o que encontrou;
 * quem reprova é `budget.ts`.
 *
 * Além dos seis eixos de `atomKeys.ts`, este módulo emite o eixo `form:`
 * previsto em §3.1: FORMAS de uso (pares construção × restrição de forma),
 * casadas por um seletor mínimo sobre o MESMO AST. A bateria de formas é fixa
 * e vive em `form/rules.ts` (compilada na carga — seletor malformado é erro de
 * inicialização, nunca silêncio); este arquivo só aplica as regras compiladas.
 * É mudança ADITIVA: liberar `FunctionDeclaration` não libera função como valor
 * de variável, e liberar `if` não libera `if` sem `else` (I9/I11).
 *
 * LIMITE CONHECIDO E DECLARADO: a resolução de escopo é PLANA — o extrator
 * junta todos os nomes declarados no arquivo e trata como global o identificador
 * que sobrou. Para trecho de aula (dezenas de linhas) isso acerta; um shadowing
 * deliberado de nome global (`const console = …`) faria o extrator deixar de
 * reportar `global:console`. Está documentado aqui porque um gate com limite
 * escondido é pior que gate nenhum.
 *
 * O que este arquivo NÃO faz: não sabe o que é permitido (é `budget.ts`), não
 * lê trilha (é `audit.ts`) e não chama LLM nenhuma — nunca.
 *
 * Referência: `docs/16-engine-de-trilha.md` §5.3.
 */

import * as ts from 'typescript';
import {
  AtomKey,
  DeclarationKind,
  OperatorFamily,
  apiKey,
  declKey,
  globalKey,
  nodeKey,
  opKey,
} from './atomKeys';
import { FORM_RULES } from './form/rules';
import { selectorMatches } from './form/selector';

/** Tamanho máximo do trecho ofensor citado na violação (uma linha legível). */
export const SNIPPET_MAX_CHARS = 72;

/** Uma ocorrência de uma construção: onde ela apareceu e com que texto. */
export interface AtomOccurrence {
  key: AtomKey;
  /** 1-based, como todo editor mostra. */
  line: number;
  /** 1-based. */
  column: number;
  snippet: string;
}

export interface ExtractOk {
  ok: true;
  /** chaves únicas, em ordem estável (ordem alfabética). */
  keys: AtomKey[];
  /** PRIMEIRA ocorrência de cada chave — é o que a violação cita. */
  occurrences: AtomOccurrence[];
}

export interface ExtractError {
  ok: false;
  error: { code: 'PARSE_ERROR'; message: string; line: number; column: number };
}

export type ExtractResult = ExtractOk | ExtractError;

/**
 * Globais do runtime, LIDOS DA MÁQUINA e nunca digitados à mão. Uma lista
 * escrita à mão erra nos dois sentidos: esquecer um nome faz o gate deixar
 * passar, e inventar um nome (19,7% dos pacotes citados por LLM não existem)
 * faz o gate reprovar código correto. `globalThis` é a fonte que não mente.
 */
export const RUNTIME_GLOBALS: ReadonlySet<string> = new Set<string>([
  ...Object.getOwnPropertyNames(globalThis),
  // Valores que são palavra da linguagem e não propriedade de globalThis em
  // todos os runtimes — incluídos para que o gate os enxergue sempre.
  'undefined',
  'NaN',
  'Infinity',
  'arguments',
  'eval',
]);

/** Operadores de atribuição — família própria porque `=` e `+=` são aulas distintas. */
const ASSIGNMENT_TOKENS: ReadonlySet<ts.SyntaxKind> = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.EqualsToken,
  ts.SyntaxKind.PlusEqualsToken,
  ts.SyntaxKind.MinusEqualsToken,
  ts.SyntaxKind.AsteriskEqualsToken,
  ts.SyntaxKind.AsteriskAsteriskEqualsToken,
  ts.SyntaxKind.SlashEqualsToken,
  ts.SyntaxKind.PercentEqualsToken,
  ts.SyntaxKind.AmpersandEqualsToken,
  ts.SyntaxKind.BarEqualsToken,
  ts.SyntaxKind.CaretEqualsToken,
  ts.SyntaxKind.LessThanLessThanEqualsToken,
  ts.SyntaxKind.GreaterThanGreaterThanEqualsToken,
  ts.SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken,
  ts.SyntaxKind.AmpersandAmpersandEqualsToken,
  ts.SyntaxKind.BarBarEqualsToken,
  ts.SyntaxKind.QuestionQuestionEqualsToken,
]);

/** Operadores lógicos — separados dos binários porque curto-circuito é outra aula. */
const LOGICAL_TOKENS: ReadonlySet<ts.SyntaxKind> = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.QuestionQuestionToken,
]);

function familyOfBinary(kind: ts.SyntaxKind): OperatorFamily {
  if (ASSIGNMENT_TOKENS.has(kind)) return 'assign';
  if (LOGICAL_TOKENS.has(kind)) return 'logical';
  return 'binary';
}

/** Nome legível de um token de operador (`!==`, `+=`, `??`). */
function operatorText(kind: ts.SyntaxKind): string {
  return ts.tokenToString(kind) ?? ts.SyntaxKind[kind];
}

/**
 * Nome CANÔNICO de um SyntaxKind.
 *
 * Armadilha medida, e ela envenenaria o orçamento em silêncio: o enum
 * `ts.SyntaxKind` tem marcadores de faixa (`FirstLiteralToken`,
 * `FirstStatement`, `FirstBinaryOperator`, …) que compartilham o valor numérico
 * de um kind real. Como a busca reversa de um enum do TypeScript devolve o
 * ÚLTIMO nome atribuído ao valor, `ts.SyntaxKind[ts.SyntaxKind.NumericLiteral]`
 * devolve `"FirstLiteralToken"`. Um orçamento escrito contra `node:NumericLiteral`
 * nunca casaria com o que o extrator emite.
 *
 * A tabela é construída UMA vez, preferindo o nome que não é marcador de faixa.
 */
const CANONICAL_KIND_NAME: ReadonlyMap<ts.SyntaxKind, string> = (() => {
  const map = new Map<ts.SyntaxKind, string>();
  for (const name of Object.keys(ts.SyntaxKind)) {
    if (!Number.isNaN(Number(name))) continue;
    const value = (ts.SyntaxKind as unknown as Record<string, number>)[name];
    const isRangeMarker = name.startsWith('First') || name.startsWith('Last');
    const current = map.get(value);
    if (current === undefined || (isRangeMarker === false && (current.startsWith('First') || current.startsWith('Last')))) {
      map.set(value, name);
    }
  }
  return map;
})();

export function kindName(kind: ts.SyntaxKind): string {
  return CANONICAL_KIND_NAME.get(kind) ?? String(kind);
}

/**
 * Pontuação (`+`, `{`, `=>`, `!==`) não vira chave do eixo `node:`. O operador
 * já é reportado pelo eixo `op:`, com família e texto; emitir também
 * `node:PlusToken` duplicaria a mesma construção em dois eixos e obrigaria todo
 * orçamento a listar as duas formas — dobrando a chance de esquecer uma.
 * Palavras-chave (`export`, `async`, `static`) CONTINUAM valendo: elas não têm
 * eixo próprio e são conteúdo de aula.
 */
function isPunctuationKind(kind: ts.SyntaxKind): boolean {
  return kind >= ts.SyntaxKind.FirstPunctuation && kind <= ts.SyntaxKind.LastPunctuation;
}

/** `let` / `const` / `var` a partir das flags do TypeScript. */
function declarationKindOf(list: ts.VariableDeclarationList): DeclarationKind {
  if ((list.flags & ts.NodeFlags.Let) !== 0) return 'let';
  if ((list.flags & ts.NodeFlags.Const) !== 0) return 'const';
  return 'var';
}

/**
 * Caminho de um acesso a propriedade, quando ele é uma cadeia de identificadores
 * (`console.log`, `assert.deepEqual`, `Array.isArray`). Devolve null quando o
 * receptor não é identificável — nesse caso o extrator emite a forma `.<prop>`,
 * que ainda é suficiente para vigiar `.push` ou `.length` antes de serem
 * ensinados, sem fingir que resolveu o tipo do receptor.
 */
function identifierChain(node: ts.PropertyAccessExpression): string | null {
  const parts: string[] = [node.name.getText()];
  let cur: ts.Expression = node.expression;
  while (ts.isPropertyAccessExpression(cur)) {
    parts.unshift(cur.name.getText());
    cur = cur.expression;
  }
  if (ts.isIdentifier(cur)) {
    parts.unshift(cur.text);
    return parts.join('.');
  }
  return null;
}

/** Nomes declarados no arquivo, separando os que vieram de `import`. */
interface DeclaredNames {
  /** todo nome declarado — base da detecção de global. */
  all: Set<string>;
  /**
   * só os ligados por `import`. Eles são declarados (logo não são globais),
   * mas continuam sendo RAIZ DE API: `assert.equal` tem de virar
   * `api:assert.equal`, e não `api:.equal`, senão o orçamento não distingue
   * `assert.throws` — que exige tratamento de erro — de um `.throws` qualquer.
   */
  imported: Set<string>;
}

/** Coleta PLANA de todo nome declarado no arquivo (ver limite no cabeçalho). */
function collectDeclaredNames(source: ts.SourceFile): DeclaredNames {
  const names = new Set<string>();
  const imported = new Set<string>();

  const addBinding = (name: ts.BindingName): void => {
    if (ts.isIdentifier(name)) {
      names.add(name.text);
      return;
    }
    for (const el of name.elements) {
      if (ts.isBindingElement(el)) addBinding(el.name);
    }
  };

  const walk = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node)) addBinding(node.name);
    else if (ts.isParameter(node)) addBinding(node.name);
    else if (ts.isFunctionDeclaration(node) && node.name) names.add(node.name.text);
    else if (ts.isClassDeclaration(node) && node.name) names.add(node.name.text);
    else if (ts.isFunctionExpression(node) && node.name) names.add(node.name.text);
    else if (ts.isImportSpecifier(node)) {
      names.add(node.name.text);
      imported.add(node.name.text);
    } else if (ts.isImportClause(node) && node.name) {
      names.add(node.name.text);
      imported.add(node.name.text);
    } else if (ts.isNamespaceImport(node)) {
      names.add(node.name.text);
      imported.add(node.name.text);
    } else if (ts.isCatchClause(node) && node.variableDeclaration) {
      addBinding(node.variableDeclaration.name);
    }
    ts.forEachChild(node, walk);
  };

  ts.forEachChild(source, walk);
  return { all: names, imported };
}

/** true quando o identificador está em posição de VALOR (e não de nome/rótulo). */
function isValueReference(node: ts.Identifier): boolean {
  const parent = node.parent;
  if (!parent) return false;
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) return false;
  if (ts.isPropertyAssignment(parent) && parent.name === node) return false;
  if (ts.isBindingElement(parent) && parent.propertyName === node) return false;
  if (ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent)) return false;
  if (ts.isParameter(parent) && parent.name === node) return false;
  if (ts.isVariableDeclaration(parent) && parent.name === node) return false;
  if (ts.isFunctionDeclaration(parent) && parent.name === node) return false;
  if (ts.isClassDeclaration(parent) && parent.name === node) return false;
  if (ts.isMethodDeclaration(parent) && parent.name === node) return false;
  if (ts.isLabeledStatement(parent) && parent.label === node) return false;
  return true;
}

/**
 * Diagnósticos de sintaxe. `parseDiagnostics` não está na superfície pública do
 * TypeScript; o acesso é feito por cast explícito e isolado AQUI, para que a
 * dependência de um detalhe interno fique num lugar só e visível.
 */
function syntaxDiagnostics(source: ts.SourceFile): ts.Diagnostic[] {
  const holder = source as ts.SourceFile & { parseDiagnostics?: ts.Diagnostic[] };
  return holder.parseDiagnostics ?? [];
}

export interface ExtractOptions {
  /** Nome usado nas mensagens (não abre arquivo — o conteúdo vem em `code`). */
  fileName?: string;
  /** `js` (default) ou `ts`. O extrator é o mesmo; muda só o ScriptKind. */
  dialect?: 'js' | 'ts';
}

/**
 * Extrai o conjunto de construções exigidas por um trecho de código.
 *
 * PURO: mesma entrada, mesma saída. Sem IO, sem rede, sem estado.
 */
export function extractAtoms(code: string, options: ExtractOptions = {}): ExtractResult {
  const fileName = options.fileName ?? 'trecho.mjs';
  const scriptKind = options.dialect === 'ts' ? ts.ScriptKind.TS : ts.ScriptKind.JS;

  const source = ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true, scriptKind);

  const diagnostics = syntaxDiagnostics(source);
  if (diagnostics.length > 0) {
    const first = diagnostics[0];
    const pos = source.getLineAndCharacterOfPosition(first.start ?? 0);
    return {
      ok: false,
      error: {
        code: 'PARSE_ERROR',
        message: ts.flattenDiagnosticMessageText(first.messageText, ' '),
        line: pos.line + 1,
        column: pos.character + 1,
      },
    };
  }

  const declared = collectDeclaredNames(source);
  const firstSeen = new Map<AtomKey, AtomOccurrence>();

  const record = (key: AtomKey, node: ts.Node): void => {
    if (firstSeen.has(key)) return;
    const start = node.getStart(source);
    const pos = source.getLineAndCharacterOfPosition(start);
    const raw = code.slice(start, Math.min(start + SNIPPET_MAX_CHARS, code.length));
    firstSeen.set(key, {
      key,
      line: pos.line + 1,
      column: pos.character + 1,
      snippet: raw.split('\n')[0].trim(),
    });
  };

  const visit = (node: ts.Node): void => {
    // ── eixo `node:` — a estrutura (pontuação fica fora; ver isPunctuationKind)
    if (!isPunctuationKind(node.kind)) {
      record(nodeKey(kindName(node.kind)), node);
    }

    // ── eixo `decl:` — o que separa a aula de `let` da aula de `const` ────
    if (ts.isVariableDeclarationList(node)) {
      record(declKey(declarationKindOf(node)), node);
    }

    // ── eixo `op:` — operadores, por família ──────────────────────────────
    if (ts.isBinaryExpression(node)) {
      const kind = node.operatorToken.kind;
      record(opKey(familyOfBinary(kind), operatorText(kind)), node.operatorToken);
    } else if (ts.isPrefixUnaryExpression(node)) {
      const op = node.operator;
      const isUpdate = op === ts.SyntaxKind.PlusPlusToken || op === ts.SyntaxKind.MinusMinusToken;
      record(opKey(isUpdate ? 'update' : 'unary', operatorText(op)), node);
    } else if (ts.isPostfixUnaryExpression(node)) {
      record(opKey('update', operatorText(node.operator)), node);
    } else if (ts.isTypeOfExpression(node)) {
      record(opKey('unary', 'typeof'), node);
    } else if (ts.isDeleteExpression(node)) {
      record(opKey('unary', 'delete'), node);
    } else if (ts.isVoidExpression(node)) {
      record(opKey('unary', 'void'), node);
    }

    // ── decidibilidade: `obj[expr]` com chave calculada ───────────────────
    if (ts.isElementAccessExpression(node)) {
      const arg = node.argumentExpression;
      const literal = ts.isStringLiteral(arg) || ts.isNumericLiteral(arg);
      if (!literal) record(nodeKey('ComputedNonLiteralAccess'), node);
    }

    // ── eixo `api:` — membros e módulos ───────────────────────────────────
    if (ts.isPropertyAccessExpression(node)) {
      const chain = identifierChain(node);
      // Cadeia cuja raiz é global (`console.log`) ou importada (`assert.equal`)
      // vira caminho completo. Raiz que é variável local vira `.prop`, porque
      // sem tipo não dá para afirmar o receptor — e afirmar o que não se sabe
      // é justamente o que faz um gate mentir.
      const root = chain ? chain.split('.')[0] : '';
      const rootIsApi = chain !== null && (!declared.all.has(root) || declared.imported.has(root));
      if (chain && rootIsApi) {
        record(apiKey(chain), node);
      } else {
        record(apiKey(`.${node.name.getText()}`), node.name);
      }
    }

    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const spec = node.moduleSpecifier.text;
      if (!spec.startsWith('.') && !spec.startsWith('/')) {
        record(apiKey(spec), node.moduleSpecifier);
      }
    }

    // ── eixo `global:` — identificador que não foi declarado no arquivo ───
    if (ts.isIdentifier(node) && isValueReference(node)) {
      const name = node.text;
      if (!declared.all.has(name) && RUNTIME_GLOBALS.has(name)) {
        record(globalKey(name), node);
      }
    }

    // ── eixo `form:` — FORMA de uso (docs §3.1, I9/I11) ────────────────────
    // A bateria vive em form/rules.ts e é COMPILADA UMA VEZ, na carga do módulo:
    // seletor malformado lá dentro é erro de inicialização (A-P06-4), nunca
    // silêncio em verificação — aqui só rodam regras já compiladas. O sujeito da
    // forma é o nó casado (o passo mais à direita do seletor). Mudança ADITIVA:
    // nenhum dos eixos existentes (node/decl/op/global/api) é alterado.
    for (const rule of FORM_RULES) {
      if (selectorMatches(rule.compiled, node)) record(rule.key, node);
    }

    ts.forEachChild(node, visit);
  };

  ts.forEachChild(source, visit);

  const occurrences = [...firstSeen.values()].sort((a, b) =>
    a.key < b.key ? -1 : a.key > b.key ? 1 : 0,
  );

  return { ok: true, keys: occurrences.map((o) => o.key), occurrences };
}

/**
 * Conta declarações de teste (`test('…', …)`) por AST.
 *
 * Existe UMA função para isso na engine, e é esta. O repositório tem hoje TRÊS
 * implementações com DUAS semânticas — uma tira comentários antes de contar,
 * as outras não — e a consequência medida é concreta: um `// test(` comentado
 * faz o validador semântico entrar em retry e devolver erro de JSON inválido
 * para sempre. Contagem por AST não tem esse problema: comentário não é nó.
 */
export function countTestDeclarations(testsCode: string): number {
  const source = ts.createSourceFile('tests.mjs', testsCode, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  let count = 0;
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (ts.isIdentifier(callee) && callee.text === 'test') count += 1;
      else if (
        ts.isPropertyAccessExpression(callee) &&
        ts.isIdentifier(callee.expression) &&
        callee.expression.text === 'test'
      ) {
        // `test.skip(...)` / `test.only(...)` também declaram um teste.
        count += 1;
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(source, visit);
  return count;
}
