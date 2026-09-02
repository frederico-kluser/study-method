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
 *   2. `[atm=null]` / `[atm!=null]` — o atributo EXISTE no nó e está nulo
 *      (ausente de valor: `undefined`/`null`). Um atributo que NÃO existe no
 *      nó — typo, ex. `[elseStatemnt=null]` — NÃO casa em nenhum dos dois
 *      operadores (ver A-P06-2 abaixo).
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
 * A TABELA CANÔNICA de nomes de SyntaxKind NÃO vive mais aqui (onda 5, dedup):
 * ela era uma CÓPIA da de `extract.ts:183`, justificada pelo ciclo de import
 * (extract → rules → selector → extract). O ciclo continua real; a cópia
 * deixou de ser necessária quando a tabela mudou para o módulo FOLHA
 * `engine/kindNames.ts`, que importa só `typescript` e não fecha ciclo nenhum.
 * Uma tabela, um lugar: `extract.ts` a reexporta como `kindName`, este módulo
 * consome `kindNameOf`.
 *
 * ── O GATE DE DIALETO (onda 7, `docs/18-trilha-typescript.md`) ────────────────
 *
 * `docs/18` §"As formas novas que a bateria precisa registrar" acrescenta
 * CATORZE formas de TypeScript à bateria. TRÊS delas casam JavaScript puro
 * (`Parameter[dotDotDotToken!=null]` é `f(...xs)`;
 * `IfStatement[expression=BinaryExpression]` é `if (a === 1)`;
 * `IfStatement[expression=TypeOfExpression]` é `if (typeof x)`) — avaliá-las
 * num arquivo `.mjs` emitiria chaves `form:` que uma trilha de JavaScript não
 * declara e MOVERIA o placar dela. Por isso um `CompiledSelector`
 * carrega os DIALETOS em que pode ser avaliado (`js`, `ts` — o mesmo eixo de
 * `ExtractOptions.dialect`, que é o que escolhe o `ScriptKind` do parse), e
 * `selectorMatches` recusa o casamento fora deles.
 *
 * O gate mora AQUI, e não no laço de `extract.ts`, por duas razões: (a) o laço
 * é `for (const rule of FORM_RULES) if (selectorMatches(...))` — uma única
 * porta, impossível de contornar por engano; (b) o dialeto é propriedade do
 * SELETOR, não do chamador, e uma regra que se auto-restringe não depende de
 * ninguém lembrar de filtrar. O dialeto do nó sai do `ScriptKind` da
 * `SourceFile` que o contém, e a chave emitida NÃO muda: o canônico continua
 * sendo só os passos, então `form:Parameter[type!=null]` é a mesma chave que
 * `docs/18` e a `TYPESCRIPT_TYPE_HARNESS_SEED` escrevem.
 *
 * Referência: `docs/16-engine-de-trilha.md` §3.1, I9/I11 e §5.3;
 * `docs/18-trilha-typescript.md` §"As formas novas que a bateria precisa registrar".
 */

import * as ts from 'typescript';
import { CANONICAL_KIND_NAME, kindNameOf } from '../kindNames';

export { kindNameOf };

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

/**
 * O DIALETO de fonte em que uma forma pode ser avaliada — exatamente os
 * valores de `ExtractOptions.dialect`, que é o que decide o `ScriptKind` do
 * `createSourceFile` no adaptador (`lang/javascript.ts:524`).
 *
 * `js` é o dialeto das trilhas de JavaScript; `ts` é o da trilha de `docs/18`.
 * A distinção é
 * PEDAGÓGICA antes de ser técnica: `f(...xs)` é axioma de JavaScript e forma
 * ENSINADA em TypeScript (aula `rest-tipado`), e a mesma construção não pode
 * gastar orçamento nas duas.
 */
export type FormDialect = 'js' | 'ts';

/** Os dialetos conhecidos — o default de toda forma que não se restringe. */
export const ALL_FORM_DIALECTS: readonly FormDialect[] = ['js', 'ts'] as const;

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
  /**
   * Os dialetos em que este seletor pode casar. NÃO entra no `canonical` (e
   * portanto NÃO entra na chave `form:`): a mesma forma tem a mesma chave
   * onde quer que ela seja avaliada — o que o dialeto decide é ONDE ela é
   * avaliada, não como ela se chama.
   */
  dialects: readonly FormDialect[];
}

/**
 * Alias do vocabulário ESTree → propriedade real do AST do TypeScript.
 * Somente os nomes que o documento normativo (§3.1) usa neste eixo.
 */
const ESTREE_ALIASES: Readonly<Record<string, string>> = {
  alternate: 'elseStatement', // IfStatement — o exemplo do documento.
  consequent: 'thenStatement', // IfStatement — o par de alternate.
};

/** Conjunto de nomes canônicos válidos — valida TipoDeNó e Valor na CARGA. */
const VALID_KIND_NAMES: ReadonlySet<string> = (() => {
  const set = new Set<string>();
  for (const name of CANONICAL_KIND_NAME.values()) set.add(name);
  return set;
})();

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

/** Valida a lista de dialetos NA CARGA — lista vazia ou nome desconhecido é erro. */
function normalizeDialects(source: string, dialects: readonly FormDialect[]): readonly FormDialect[] {
  if (!Array.isArray(dialects) || dialects.length === 0) {
    throw new FormSelectorError(
      `a forma "${source}" declarou uma lista VAZIA de dialetos — uma regra que não vale em lugar nenhum é ruído, não restrição`,
    );
  }
  const seen: FormDialect[] = [];
  for (const d of dialects) {
    if (d !== 'js' && d !== 'ts') {
      throw new FormSelectorError(
        `a forma "${source}" declarou o dialeto "${String(d)}", que não existe — só "js" e "ts" (os valores de ExtractOptions.dialect)`,
      );
    }
    if (!seen.includes(d)) seen.push(d);
  }
  return seen;
}

/**
 * Parseia a string de seletor e a COMPILA em passos casáveis contra o AST.
 *
 * LANÇA `FormSelectorError` (código `FORM_SELECTOR_INVALID`) para qualquer
 * desvio de sintaxe — inclusive nome de nó ou valor que não existem no
 * TypeScript, ou dialeto declarado que não existe. Um erro aqui é da CARGA da
 * regra; nunca pode virar silêncio.
 *
 * `dialects` default = os DOIS (`js` e `ts`): uma forma que não se restringe
 * vale em toda fonte — é o que preserva, byte a byte, o comportamento das
 * cinco formas de JavaScript da onda 1 (que valem também num arquivo `.ts`,
 * porque a trilha de TypeScript PRESSUPÕE o axioma de JavaScript).
 */
export function parseSelector(
  source: string,
  dialects: readonly FormDialect[] = ALL_FORM_DIALECTS,
): CompiledSelector {
  if (typeof source !== 'string' || source.trim().length === 0) {
    throw new FormSelectorError('seletor vazio — uma forma de uso precisa nomear um tipo de nó (ex.: IfStatement[alternate=null])');
  }
  const dialetos = normalizeDialects(source, dialects);

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
    dialects: dialetos,
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
    const record = node as unknown as Record<string, unknown>;
    // A-P06-2: o filtro só casa quando a propriedade EXISTE no nó. Antes,
    // `raw === undefined` (propriedade AUSENTE) era tratado como valor null e
    // um atributo com nome errado (`[elseStatemnt=null]`) casava TODO nó do
    // tipo em silêncio — falsificando o orçamento com uma forma que ninguém
    // escreveu. `in` é seguro no AST do TypeScript: a nodeFactory atribui TODAS
    // as propriedades como próprias, inclusive as opcionais (`elseStatement`
    // existe com valor `undefined` em `if` sem else; `initializer` idem em
    // parâmetro sem default) — logo o `in` só falha para nome que não existe.
    // O `!=` segue o mesmo princípio: não casa se a propriedade não existe.
    if (!(f.resolvedName in record)) return false;
    const raw = record[f.resolvedName];
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

/** A `SourceFile` que contém o nó — sobe pelos pais (o extrator usa `setParentNodes`). */
function sourceFileOf(node: ts.Node): ts.SourceFile | undefined {
  let cur: ts.Node | undefined = node;
  while (cur && cur.kind !== ts.SyntaxKind.SourceFile) cur = cur.parent;
  return cur as ts.SourceFile | undefined;
}

/**
 * O dialeto do nó, lido do `ScriptKind` da `SourceFile` que o contém.
 *
 * `scriptKind` não está na superfície pública do TypeScript (o mesmo caso de
 * `parseDiagnostics`, cujo cast já mora em `lang/javascript.ts:527`) — mas é
 * SEMPRE preenchido por `createSourceFile`, seja pelo argumento explícito do
 * adaptador (`options.dialect === 'ts' ? ScriptKind.TS : ScriptKind.JS`), seja
 * pela inferência a partir do nome do arquivo quando o argumento é omitido.
 *
 * REDE DE SEGURANÇA: sem `ScriptKind` reconhecível o dialeto é `js` — o mesmo
 * default de `ExtractOptions.dialect`. Errar para o lado do JavaScript deixa
 * uma forma de TypeScript de fora (nada acontece); errar para o lado do
 * TypeScript emitiria chave nova em trilha de JavaScript e moveria o placar.
 */
export function dialectOfNode(node: ts.Node): FormDialect {
  const sf = sourceFileOf(node);
  if (!sf) return 'js';
  const kind = (sf as unknown as { scriptKind?: ts.ScriptKind }).scriptKind;
  if (kind === ts.ScriptKind.TS || kind === ts.ScriptKind.TSX) return 'ts';
  return 'js';
}

/**
 * Casa o seletor contra um nó: o SUJEITO da forma é o nó passado, e cada passo
 * à esquerda na cadeia `A > B > C` casa o PAI do passo seguinte (`C`, `B`, `A`).
 *
 * Depois de casar a ESTRUTURA, casa o DIALETO: uma forma restrita a `ts` não
 * casa num nó de arquivo JavaScript, ainda que a estrutura seja idêntica
 * (`f(...xs)` existe nas duas linguagens; `form:Parameter[dotDotDotToken!=null]`
 * é conteúdo de aula só na trilha de TypeScript). A ordem importa: o cheque de
 * dialeto sobe a cadeia de pais até a `SourceFile` e só é pago quando a forma
 * REALMENTE casou — e nem isso, quando o seletor vale nos dois dialetos, que é
 * o caso das cinco formas de JavaScript da onda 1.
 */
export function selectorMatches(selector: CompiledSelector, node: ts.Node): boolean {
  let cur: ts.Node | undefined = node;
  for (let i = selector.steps.length - 1; i >= 0; i -= 1) {
    if (!stepMatches(cur, selector.steps[i])) return false;
    cur = cur.parent;
  }
  if (selector.dialects.length >= ALL_FORM_DIALECTS.length) return true; // vale nos dois: nada a checar
  return selector.dialects.includes(dialectOfNode(node));
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