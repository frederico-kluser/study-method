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
 * ─── O QUE VEM DO ADAPTADOR DE LINGUAGEM (onda 5) ─────────────────────────
 *
 * Três responsabilidades deste arquivo passaram a ser PEDIDAS ao adaptador
 * (`engine/lang/registry.ts`, os 15 membros do §6 de
 * `docs/research/08-multilingua-trava-deterministica.md`) em vez de
 * implementadas aqui:
 *
 *   - a ÁRVORE            → `adapter.parse(code, {fileName, dialect})`
 *                           (era `ts.createSourceFile` + `syntaxDiagnostics`);
 *   - a RESOLUÇÃO DE ESCOPO → `adapter.resolveScopes(parsed)`
 *                           (era `collectDeclaredNames`, apagada);
 *   - os GLOBAIS DE RUNTIME → `adapter.globals()`
 *                           (era a lista literal de `RUNTIME_GLOBALS`).
 *
 * O QUE **NÃO** VEIO, e por quê: a CAMINHADA (`visit`) continua sobre o
 * `ts.Node` nativo. Ela ainda depende de `ts.isPropertyAccessExpression`,
 * `ts.isElementAccessExpression`, do eixo `form:` (que casa seletores contra o
 * AST do TypeScript) e das posições absolutas de cada nó — nada disso existe
 * no `LangNode` normalizado do registro. Por isso este módulo é JAVASCRIPT-ONLY
 * e o diz alto: `coletarOcorrencias` REPROVA (erro estruturado
 * `EngineLinguagemError`) qualquer `options.language` que não seja o adaptador
 * default, em vez de auditar Python com o parser de JavaScript e aprovar
 * qualquer coisa. Porta um extrator novo quem porta a caminhada inteira.
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
import { kindName } from './kindNames';
import {
  DEFAULT_ADAPTER_ID,
  getAdapter,
  type LanguageAdapter,
  type LanguageId,
} from './lang/registry';

// A tabela canônica de nomes de SyntaxKind mudou de casa para o módulo folha
// `engine/kindNames.ts` (ela era COPIADA em `form/selector.ts`; ver o cabeçalho
// de lá). A API pública deste módulo não muda: quem fazia
// `import { kindName } from '../extract'` continua fazendo.
export { kindName };

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
  /**
   * posição absoluta (offset 0-based) do INÍCIO da ocorrência no código —
   * ADITIVO (rodada 12): é o que a bateria A13–A16 usa para classificar a
   * ocorrência dentro/fora dos spans mecânicos S13 e para a contagem por
   * linha do A14b.
   */
  start: number;
  /** posição absoluta do fim (exclusivo) — ADITIVO. */
  end: number;
}

export interface ExtractOk {
  ok: true;
  /** chaves únicas, em ordem estável (ordem alfabética). */
  keys: AtomKey[];
  /** PRIMEIRA ocorrência de cada chave — é o que a violação cita. */
  occurrences: AtomOccurrence[];
}

export interface ExtractAllOk {
  ok: true;
  /**
   * TODAS as ocorrências, na ordem de visita do AST (≈ ordem do código) —
   * o `extractAtoms` deduplica para a primeira por chave; esta variante
   * expõe cada ocorrência individual. ADITIVA (rodada 12).
   */
  occurrences: AtomOccurrence[];
  /** chaves únicas, em ordem alfabética — igual ao `extractAtoms`. */
  keys: AtomKey[];
}

export interface ExtractError {
  ok: false;
  error: { code: 'PARSE_ERROR'; message: string; line: number; column: number };
}

export type ExtractResult = ExtractOk | ExtractError;
export type ExtractAllResult = ExtractAllOk | ExtractError;

/**
 * Globais do runtime — o eixo `global:` do vocabulário.
 *
 * FONTE: `adapter.globals()` (`engine/lang/javascript.ts`, membro 4 dos 15 do
 * §6). A lista literal que vivia AQUI foi apagada na onda 5: ela era a cópia
 * de origem do `jsGlobals()` do adaptador, e duas cópias da mesma expressão
 * são duas oportunidades de divergir. O adaptador continua LENDO DA MÁQUINA e
 * nunca digitando à mão — uma lista escrita à mão erra nos dois sentidos:
 * esquecer um nome faz o gate deixar passar, e inventar um nome (19,7% dos
 * pacotes citados por LLM não existem) faz o gate reprovar código correto.
 * `globalThis` é a fonte que não mente.
 *
 * O símbolo continua exportado com o mesmo nome porque
 * `engine/quality/minimal.ts:391` e `tests/engineVocab.test.ts:48` o importam.
 * É o conjunto do adaptador DEFAULT; quem tem uma linguagem na mão deve pedir
 * `getAdapter(id).globals()` ao registro.
 */
export const RUNTIME_GLOBALS: ReadonlySet<string> = getAdapter(DEFAULT_ADAPTER_ID).globals();

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

/**
 * true quando o identificador está em posição de VALOR (e não de nome/rótulo).
 *
 * POR QUE ELA É EXPORTADA (onda 5): esta é a ÚNICA peça de resolução de escopo
 * que sobrou neste arquivo, e ela sobrou por um motivo de contrato, não por
 * esquecimento. `ScopeResolution` (`engine/lang/registry.ts:281`) devolve
 * CONJUNTOS DE NOMES (`declared`/`imported`/`free`/`globals`) — e o extrator
 * precisa de POSIÇÃO: ele emite uma `AtomOccurrence` por OCORRÊNCIA de
 * `global:<nome>`, com linha, coluna e offsets. Saber que `Error` é global no
 * arquivo não diz QUAL dos três `Error` do texto é a referência de valor.
 *
 * A cópia gêmea desta função é a closure `ehReferenciaDeValor`, privada dentro
 * de `jsResolveScopes` (`engine/lang/javascript.ts:542`). Ela some no momento
 * em que a interface expuser a posição das ocorrências livres (ver o handoff
 * desta onda: `ScopeResolution.freeOccurrences`, ou um membro
 * `isValueReference(node)` no adaptador) — e esta função exportada é o alvo da
 * delegação. Enquanto isso, esta é a que o extrator usa.
 */
export function isValueReference(node: ts.Identifier): boolean {
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

// ---------------------------------------------------------------------------
// A guarda de linguagem (fail-closed) — o extrator é JAVASCRIPT-ONLY
// ---------------------------------------------------------------------------

/** Código do erro estruturado de linguagem sem extrator determinístico. */
export const LINGUAGEM_SEM_EXTRATOR = 'LINGUAGEM_SEM_EXTRATOR' as const;

/**
 * Erro ESTRUTURADO de "esta peça da engine só existe para JavaScript".
 *
 * Existe porque a alternativa é pior de um jeito específico: sem a guarda, um
 * `challenge.language: 'python'` seria parseado pelo compilador TypeScript, e
 * um gate que analisa Python com o parser de JavaScript não reprova nada — ele
 * APROVA em silêncio. A mesma decisão do registro (`getAdapter` LANÇA em vez de
 * cair no default, `engine/lang/registry.ts:39-45`): um resultado errado e
 * silencioso é o modo de falha que esta engine existe para eliminar.
 */
export class EngineLinguagemError extends Error {
  readonly code: typeof LINGUAGEM_SEM_EXTRATOR = LINGUAGEM_SEM_EXTRATOR;
  constructor(
    readonly detalhes: { modulo: string; pedido: string; suportado: LanguageId; motivo: string },
  ) {
    super(
      `${detalhes.modulo}: sem implementação para a linguagem ${JSON.stringify(detalhes.pedido)} ` +
        `(só ${detalhes.suportado}) — ${detalhes.motivo}`,
    );
    this.name = 'EngineLinguagemError';
  }
}

/**
 * Resolve o adaptador e REPROVA o que este módulo não sabe fazer.
 *
 * `getAdapter` já é fail-closed para id desconhecido; esta guarda cobre o caso
 * seguinte — id CONHECIDO (Python registrado, por exemplo) cuja implementação
 * aqui não existe. As duas falhas são estruturadas e dizem o que falta.
 */
export function exigirAdaptadorJavascript(
  modulo: string,
  motivo: string,
  language: string = DEFAULT_ADAPTER_ID,
): LanguageAdapter {
  const adapter = getAdapter(language);
  if (adapter.id !== DEFAULT_ADAPTER_ID) {
    throw new EngineLinguagemError({
      modulo,
      pedido: language,
      suportado: DEFAULT_ADAPTER_ID,
      motivo,
    });
  }
  return adapter;
}

export interface ExtractOptions {
  /** Nome usado nas mensagens (não abre arquivo — o conteúdo vem em `code`). */
  fileName?: string;
  /** `js` (default) ou `ts`. O extrator é o mesmo; muda só o ScriptKind. */
  dialect?: 'js' | 'ts';
  /**
   * ADITIVO (onda 5): qual ADAPTADOR parseia e resolve escopo. Default: o
   * adaptador default (`javascript`). Qualquer outro id LANÇA
   * `EngineLinguagemError` — ver a guarda acima e o cabeçalho deste arquivo.
   */
  language?: LanguageId;
}

/**
 * Caminhada comum do extrator: EXPOE TODA ocorrência de cada construção, na
 * ordem de visita do AST. O `extractAtoms` deduplica a partir daqui; o
 * `extractAllOccurrences` devolve a caminhada crua — é o que A13c (spans
 * mecânicos S13) e A14b (combo de novas por linha) exigem, e a POSIÇÃO
 * ABSOLUTA de cada ocorrência é o que permite decidir dentro/fora de um span
 * sem conversão de linha:coluna.
 *
 * PURO: mesma entrada, mesma saída. Sem IO, sem rede, sem estado.
 */
function coletarOcorrencias(code: string, options: ExtractOptions): ExtractAllResult {
  const adapter = exigirAdaptadorJavascript(
    'engine/extract.ts',
    'a caminhada do extrator (eixos api:/form:/node: e as posições absolutas) é escrita contra o AST do TypeScript; portar o extrator é portar a caminhada inteira, não trocar o parser',
    options.language ?? DEFAULT_ADAPTER_ID,
  );

  // (1) A ÁRVORE vem do adaptador — mesmo `createSourceFile` (com
  // `setParentNodes`, que `isValueReference` exige), mesmo `ScriptTarget`,
  // mesmo `ScriptKind` por dialeto e MESMO erro estruturado com linha/coluna
  // 1-based do primeiro diagnóstico de sintaxe. O cast interno de
  // `parseDiagnostics` mora lá agora (`lang/javascript.ts:398`), num lugar só.
  const parsed = adapter.parse(code, {
    fileName: options.fileName ?? 'trecho.mjs',
    dialect: options.dialect,
  });
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const source = parsed.native as ts.SourceFile;

  // (5) A RESOLUÇÃO DE ESCOPO vem do adaptador. `scopes.declared` é o antigo
  // `collectDeclaredNames(...).all`, `scopes.imported` o `.imported`, e
  // `scopes.globals` é exatamente `¬declared ∧ RUNTIME_GLOBALS` — o cruzamento
  // que ficava inline no eixo `global:` logo abaixo.
  const scopes = adapter.resolveScopes(parsed);
  const todas: AtomOccurrence[] = [];

  const record = (key: AtomKey, node: ts.Node): void => {
    const start = node.getStart(source);
    const end = node.getEnd();
    const pos = source.getLineAndCharacterOfPosition(start);
    const raw = code.slice(start, Math.min(start + SNIPPET_MAX_CHARS, code.length));
    todas.push({
      key,
      line: pos.line + 1,
      column: pos.character + 1,
      snippet: raw.split('\n')[0].trim(),
      start,
      end,
    });
  };

  const visit = (node: ts.Node): void => {
    // ── eixo `node:` — a estrutura (pontuação fica fora; ver isPunctuationKind)
    if (!isPunctuationKind(node.kind)) {
      record(nodeKey(kindName(node.kind)), node);
    }

    if (ts.isVariableDeclarationList(node)) {
      record(declKey(declarationKindOf(node)), node);
    }

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

    if (ts.isElementAccessExpression(node)) {
      const arg = node.argumentExpression;
      const literal = ts.isStringLiteral(arg) || ts.isNumericLiteral(arg);
      if (!literal) record(nodeKey('ComputedNonLiteralAccess'), node);
    }

    if (ts.isPropertyAccessExpression(node)) {
      const chain = identifierChain(node);
      const root = chain ? chain.split('.')[0] : '';
      const rootIsApi = chain !== null && (!scopes.declared.has(root) || scopes.imported.has(root));
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

    // Eixo `global:`. `scopes.globals` já É `free ∩ adapter.globals()`, ou
    // seja `¬declarado ∧ global-de-runtime` — a mesma conjunção de antes, agora
    // calculada pelo adaptador. `isValueReference` continua aqui porque a
    // decisão é POR OCORRÊNCIA e `ScopeResolution` só carrega nomes (ver o
    // comentário da função).
    if (ts.isIdentifier(node) && isValueReference(node) && scopes.globals.has(node.text)) {
      record(globalKey(node.text), node);
    }

    for (const rule of FORM_RULES) {
      if (selectorMatches(rule.compiled, node)) record(rule.key, node);
    }

    ts.forEachChild(node, visit);
  };

  ts.forEachChild(source, visit);

  return { ok: true, occurrences: todas, keys: [...new Set(todas.map((o) => o.key))].sort() };
}

/**
 * Extrai TODAS as ocorrências de cada construção, com posição absoluta.
 *
 * ADITIVA (rodada 12): a bateria A13–A16 (`engine/quality/progressao.ts`)
 * precisa classificar CADA ocorrência dentro/fora dos spans mecânicos S13
 * (testes) e por linha (A14b) — o `extractAtoms`, que deduplica para a
 * primeira ocorrência por chave, não entrega isso. A API canônica não muda.
 *
 * PURO: mesma entrada, mesma saída. Sem IO, sem rede, sem estado.
 */
export function extractAllOccurrences(code: string, options: ExtractOptions = {}): ExtractAllResult {
  return coletarOcorrencias(code, options);
}

/**
 * Extrai o conjunto de construções exigidas por um trecho de código.
 *
 * PURO: mesma entrada, mesma saída. Sem IO, sem rede, sem estado.
 */
export function extractAtoms(code: string, options: ExtractOptions = {}): ExtractResult {
  const todas = coletarOcorrencias(code, options);
  if (!todas.ok) return todas;

  // deduplicação para a PRIMEIRA ocorrência por chave — o contrato histórico
  // do extrator ("a violação cita a primeira ocorrência"), preservado byte a
  // byte: a caminhada é a MESMA, só a projeção muda.
  const firstSeen = new Map<AtomKey, AtomOccurrence>();
  for (const occ of todas.occurrences) {
    if (!firstSeen.has(occ.key)) firstSeen.set(occ.key, occ);
  }

  const occurrences = [...firstSeen.values()].sort((a, b) =>
    a.key < b.key ? -1 : a.key > b.key ? 1 : 0,
  );

  return { ok: true, keys: occurrences.map((o) => o.key), occurrences };
}

/**
 * Conta declarações de teste (`test('…', …)`) por AST — o lado DECLARADO da
 * dupla-igualdade (`declarado == executado == expectedTestCount`).
 *
 * Existe UMA função para isso na engine, e é esta. O repositório tem hoje TRÊS
 * implementações com DUAS semânticas — uma tira comentários antes de contar,
 * as outras não — e a consequência medida é concreta: um `// test(` comentado
 * faz o validador semântico entrar em retry e devolver erro de JSON inválido
 * para sempre. Contagem por AST não tem esse problema: comentário não é nó.
 *
 * MULTILÍNGUA (onda 5): o membro do §6 é `adapter.countDeclared` — e para
 * JavaScript ele DELEGA para esta função (`jsCountDeclared`,
 * `engine/lang/javascript.ts:583`). Por isso o despacho aqui é POR EXCLUSÃO:
 * `language` diferente do default vai ao adaptador daquela linguagem; o corpo
 * abaixo é a implementação de JavaScript, e chamar o adaptador para ela seria
 * recursão infinita, não indireção. Uma implementação, um lugar — o que muda é
 * quem pergunta.
 */
export function countTestDeclarations(
  testsCode: string,
  language: LanguageId = DEFAULT_ADAPTER_ID,
): number {
  if (language !== DEFAULT_ADAPTER_ID) return getAdapter(language).countDeclared(testsCode);
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
