/**
 * app/electron/main/engine/form/selector.ts — o SELETOR MÍNIMO de FORMA de uso.
 *
 * O eixo `form:` existe porque o orçamento não é uma lista de construções
 * permitidas, é uma lista de PARES (construção, restrição de forma de uso):
 * liberar `FunctionDeclaration` não libera função como valor de variável, e
 * liberar `if` não libera `if` sem `else` (`docs/16-engine-de-trilha.md` §3.1).
 * A chave do eixo é `form:<seletor>` — e o seletor é UMA STRING PEQUENA E
 * DOCUMENTADA, parseada por este módulo, NUNCA um `esquery` (ele é para ESTree
 * e não existe no repositório — zero dependências novas; ver §5.3).
 *
 * ── SINTAXE MÍNIMA (e única) ──────────────────────────────────────────────────
 *
 *   Seletor  ::= Passo ( '>' Passo )*
 *   Passo    ::= TipoDeNó ( '[' Atributo ']' )*
 *   Atributo ::= Nome ( '=' | '!=' ) Valor
 *   Valor    ::= 'null' | TipoDeNó
 *
 * Exemplos, incluindo o do documento normativo:
 *
 *   IfStatement[alternate=null]          if SEM else (o exemplo de §3.1)
 *   IfStatement[alternate!=null]         if COM else
 *   ArrowFunction[body!=Block]           arrow com corpo de EXPRESSÃO
 *   Parameter[initializer!=null]         parâmetro com valor default
 *   VariableDeclaration > FunctionExpression   função como valor de variável
 *   ObjectLiteralExpression > MethodDeclaration  método em objeto literal
 *
 * Semântica, na ordem em que a didática precisa:
 *
 *   1. `TipoDeNó`  — casa o tipo do nó pelo NOME CANÔNICO do SyntaxKind
 *      (`extract.ts` — mesma tabela anti-marcador-de-faixa). Ex.: `IfStatement`.
 *   2. `[atm=null]` / `[atm!=null]` — o atributo está nulo/ausente ou não.
 *   3. `[atm=TipoDeNó]` / `[atm!=TipoDeNó]` — o atributo é um nó daquele tipo.
 *      `ArrowFunction[body=Block]` separa arrow de bloco de arrow de expressão.
 *   4. `A > B` — RELAÇÃO PAI-FILHO DIRETA: `B` tem `A` como pai. O sujeito da
 *      forma é o passo MAIS À DIREITA (`FunctionExpression`, `MethodDeclaration`).
 *
 * Compatibilidade com o vocabulário ESTree do documento: `alternate` e
 * `consequent` são ALIASES para as propriedades reais do AST do TypeScript
 * (`elseStatement`, `thenStatement`) — o exemplo normativo
 * `IfStatement[alternate=null]` casa EXATAMENTE como escrito, sem rebatizar.
 *
 * ── CHAVE CANÔNICA ────────────────────────────────────────────────────────────
 *
 * A chave emitida é `'form:' + seletor COMPACTADO` — todo espaço removido
 * (`VariableDeclaration > FunctionExpression` vira `form:VariableDeclaration>
 * FunctionExpression`). O motivo é contratual: a chave precisa casar com o
 * `ATOM_KEY_RE` de `atomKeys.ts`, que proíbe espaço (`/^(node|…|form):[^\s]+$/`).
 * Escrever a forma com ou sem espaços produz a MESMA chave.
 *
 * ── ERRO É NA CARGA, NUNCA EM VERIFICAÇÃO (A-P06-4) ───────────────────────────
 *
 * `parseSelector` LANÇA `FormSelectorError` (código `FORM_SELECTOR_INVALID`)
 * para seletor malformado. As regras da bateria (`form/rules.ts`) são
 * compiladas UMA vez na carga do módulo — um seletor quebrado nelas derruba a
 * engine na inicialização. No tempo de verificação não existe "não entendi o
 * seletor, sigo sem emitir nada": `extractAtoms` só roda regras já compiladas.
 * `parseFormKey` estende o mesmo erro à validação de chaves `form:` declaradas
 * no orçamento pelas ondas seguintes.
 *
 * Este módulo é AUTOCONTIDO (importa só `typescript`): guarda a própria tabela
 * canônica de nomes de SyntaxKind, a mesma de `extract.ts`, para não criar
 * ciclo de import (extract → rules → selector → extract) — tabela derivada do
 * MESMO enum, logo não consegue divergir da de `extract.ts`.
 *
 * Referência: `docs/16-engine-de-trilha.md` §3.1, I9/I11 e §5.3.
 */

import * as ts from 'typescript';

/** Código do erro estruturado de seletor malformado (A-P06-4). */
export const FORM_SELECTOR_INVALID = 'FORM_SELECTOR_INVALID' as const;

/** Erro ESTRUTURADO de seletor malformado — lançado na CARGA, nunca em verificação. */
export class FormSelectorError extends Error {
  readonly code: typeof FORM_SELECTOR_INVALID = FORM_SELECTOR_INVALID;
  constructor(message: string) {
    super(message);
    this.name = 'FormSelectorError';
  }
}

/** Operador de comparação de atributo: `=` ou `!=`. */
export type AttributeOp = 'eq' | 'ne';

/** Um filtro de atributo: `[nome=valor]` ou `[nome!=valor]`. */
export interface AttributeFilter {
  /** nome ESCRITO no seletor (`alternate`) — é o que aparece na chave. */
  sourceName: string;
  /** nome real da propriedade no nó TS (após rebatizar alias ESTree). */
  resolvedName: string;
  op: AttributeOp;
  /** `'null'` ou um nome canônico de SyntaxKind (`'Block'`). */
  value: 'null' | string;
}

/** Um passo do seletor: tipo de nó + filtros de atributo. */
export interface SelectorStep {
  nodeType: string;
  filters: AttributeFilter[];
}

/** Seletor compilado: passos na ORDEM ESCRITA (o último é o sujeito da forma). */
export interface CompiledSelector {
  steps: SelectorStep[];
  /** a versão compacta `Tipo>A>Tipo…` — corpo da chave `form:`. */
  canonical: string;
  /** o seletor exatamente como foi escrito (para mensagem/diagnóstico). */
  source: string;
}

/**
 * Alias do vocabulário ESTree → propriedade real do AST do TypeScript.
 * Somente os nomes que o documento normativo (§3.1) usa neste eixo.
 */
const ESTREE_ALIASES: Readonly<Record<string, string>> = {
  alternate: 'elseStatement', // IfStatement — o exemplo do documento.
  consequent: 'thenStatement', // IfStatement — o par de alternate.
};

/** Nome canônico de um SyntaxKind — a MESMA tabela de `extract.ts`, local aqui. */
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

/** Conjunto de nomes canônicos válidos — valida TipoDeNó e Valor na CARGA. */
const VALID_KIND_NAMES: ReadonlySet<string> = (() => {
  const set = new Set<string>();
  for (const name of CANONICAL_KIND_NAME.values()) set.add(name);
  return set;
})();

/** Nome canônico do tipo de um nó (`IfStatement`, `Block`, …). */
export function kindNameOf(node: ts.Node): string {
  return CANONICAL_KIND_NAME.get(node.kind) ?? String(node.kind);
}

/** identifica `A-z_$` inicial seguido de `A-z0-9_$` — tipos, atributos e valores. */
const IDENT_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function isIdentifierToken(text: string): boolean {
  return IDENT_RE.test(text);
}

/**
 * Quebra o seletor em tokens, ignorando TODO espaço em branco (CTRL-Space,
 * tab, quebra) — a chave canônica é compacta, mas a escrita é livre.
 */
function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (ch === '>' || ch === '[' || ch === ']' || ch === '=') {
      tokens.push(ch);
      i += 1;
      continue;
    }
    if (ch === '!') {
      if (input[i + 1] !== '=') {
        throw new FormSelectorError(`seletor malformado em "${input}" (posição ${i + 1}): "!" só é válido em "!="`);
      }
      tokens.push('!=');
      i += 2;
      continue;
    }
    const m = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(input.slice(i));
    if (m) {
      tokens.push(m[0]);
      i += m[0].length;
      continue;
    }
    throw new FormSelectorError(
      `seletor malformado em "${input}" (posição ${i + 1}): caractere "${ch}" não pertence à sintaxe do eixo form:`,
    );
  }
  return tokens;
}

function expectToken(tokens: string[], index: number, expected: string, context: string): string {
  const got = tokens[index];
  if (got === undefined) {
    throw new FormSelectorError(`seletor malformado: esperava "${expected}" ${context}, mas o seletor terminou`);
  }
  if (got !== expected) {
    throw new FormSelectorError(`seletor malformado: esperava "${expected}" ${context}, encontrou "${got}"`);
  }
  return got;
}

function expectIdentifier(tokens: string[], index: number, context: string): string {
  const got = tokens[index];
  if (got === undefined || !isIdentifierToken(got)) {
    throw new FormSelectorError(`seletor malformado: esperava um identificador ${context}${got === undefined ? ', mas o seletor terminou' : `, encontrou "${got}"`}`);
  }
  return got;
}

function parseFilter(tokens: string[], index: number): { filter: AttributeFilter; next: number } {
  // Atributo: Nome ( '=' | '!=' ) Valor
  const name = expectIdentifier(tokens, index, '(nome do atributo)');
  let i = index + 1;
  const opToken = tokens[i];
  if (opToken === undefined || (opToken !== '=' && opToken !== '!=')) {
    throw new FormSelectorError(
      `seletor malformado: após "[${name}" esperava "=" ou "!="${opToken === undefined ? ', mas o seletor terminou' : `, encontrou "${opToken}"`}`,
    );
  }
  i += 1;
  const value = expectIdentifier(tokens, i, '(valor: null ou um tipo de nó)');
  i += 1;
  if (value !== 'null' && !VALID_KIND_NAMES.has(value)) {
    throw new FormSelectorError(
      `seletor malformado: "[${name}${opToken}${value}]" — valor só pode ser "null" ou um nome de nó do TypeScript ("${value}" não existe)`,
    );
  }
  return {
    filter: {
      sourceName: name,
      resolvedName: ESTREE_ALIASES[name] ?? name,
      op: opToken === '=' ? 'eq' : 'ne',
      value,
    },
    next: i,
  };
}

/**
 * Parseia a string de seletor e a COMPILA em passos casáveis contra o AST.
 *
 * LANÇA `FormSelectorError` (código `FORM_SELECTOR_INVALID`) para qualquer
 * desvio de sintaxe — inclusive nome de nó ou valor que não existem no
 * TypeScript. Um erro aqui é da CARGA da regra; nunca pode virar silêncio.
 */
export function parseSelector(source: string): CompiledSelector {
  if (typeof source !== 'string' || source.trim().length === 0) {
    throw new FormSelectorError('seletor vazio — uma forma de uso precisa nomear um tipo de nó (ex.: IfStatement[alternate=null])');
  }

  const tokens = tokenize(source);
  const steps: SelectorStep[] = [];
  let i = 0;

  while (i < tokens.length) {
    const nodeType = expectIdentifier(tokens, i, '(tipo de nó, ex.: IfStatement)');
    i += 1;
    if (!VALID_KIND_NAMES.has(nodeType)) {
      throw new FormSelectorError(
        `seletor malformado: "${nodeType}" não é um nome de nó do AST do TypeScript (veja os nomes canônicos emitidos pelo eixo node:)`,
      );
    }

    const filters: AttributeFilter[] = [];
    while (tokens[i] === '[') {
      i += 1; // consome '['
      const { filter, next } = parseFilter(tokens, i);
      filters.push(filter);
      expectToken(tokens, next, ']', '(fechamento do filtro de atributo)');
      i = next + 1;
    }

    steps.push({ nodeType, filters });

    if (i < tokens.length) {
      expectToken(tokens, i, '>', '(entre passos do seletor)');
      i += 1;
      if (i >= tokens.length) {
        throw new FormSelectorError(`seletor malformado: termina em ">" — falta o passo do nó filho (ex.: VariableDeclaration > FunctionExpression)`);
      }
    }
  }

  return {
    steps,
    canonical: canonicalOf(steps),
    source,
  };
}

/** Versão compacta (sem espaços) de passos parseados — o corpo da chave `form:`. */
function canonicalOf(steps: SelectorStep[]): string {
  return steps
    .map((step) => {
      const filters = step.filters
        .map((f) => `[${f.sourceName}${f.op === 'eq' ? '=' : '!='}${f.value}]`)
        .join('');
      return `${step.nodeType}${filters}`;
    })
    .join('>');
}

/** Casamento de um passo contra um nó (o sujeito ou um ancestral). */
function stepMatches(node: ts.Node | undefined, step: SelectorStep): boolean {
  if (!node) return false;
  if (kindNameOf(node) !== step.nodeType) return false;
  for (const f of step.filters) {
    const raw = (node as unknown as Record<string, unknown>)[f.resolvedName];
    const isNull = raw === undefined || raw === null;
    if (f.value === 'null') {
      if (f.op === 'eq' && !isNull) return false;
      if (f.op === 'ne' && isNull) return false;
    } else {
      const isTsNode = typeof raw === 'object' && raw !== null && typeof (raw as ts.Node).kind === 'number';
      const sameKind = isTsNode && kindNameOf(raw as ts.Node) === f.value;
      if (f.op === 'eq' && !sameKind) return false;
      if (f.op === 'ne' && sameKind) return false;
    }
  }
  return true;
}

/**
 * Casa o seletor contra um nó: o SUJEITO da forma é o nó passado, e cada passo
 * à esquerda na cadeia `A > B > C` casa o PAI do passo seguinte (`C`, `B`, `A`).
 */
export function selectorMatches(selector: CompiledSelector, node: ts.Node): boolean {
  let cur: ts.Node | undefined = node;
  for (let i = selector.steps.length - 1; i >= 0; i -= 1) {
    if (!stepMatches(cur, selector.steps[i])) return false;
    cur = cur.parent;
  }
  return true;
}

/**
 * A chave de átomo do eixo `form:` para um seletor: `'form:' + canônico`.
 *
 * O canônico é SEMPRE compacto (sem espaços), o que garante o casamento com o
 * `ATOM_KEY_RE` de `atomKeys.ts` por construção. Escrever o seletor com ou sem
 * espaços não muda a chave — duas grafias da mesma forma emitem a mesma chave.
 */
export function formKey(selectorOrCompiled: string | CompiledSelector): string {
  const compiled = typeof selectorOrCompiled === 'string' ? parseSelector(selectorOrCompiled) : selectorOrCompiled;
  return `form:${compiled.canonical}`;
}

/**
 * Valida uma chave `form:` declarada no orçamento (ondas 2-4): o corpo depois
 * de `form:` tem de ser um seletor PARSEÁVEL. Malformado → `FormSelectorError`
 * NA CARGA do orçamento, nunca em tempo de verificação (A-P06-4).
 */
export function parseFormKey(key: string): CompiledSelector {
  if (typeof key !== 'string' || !key.startsWith('form:')) {
    throw new FormSelectorError(`"${String(key)}" não é uma chave do eixo form: — esperava "form:<seletor>"`);
  }
  return parseSelector(key.slice('form:'.length));
}