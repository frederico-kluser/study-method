/**
 * src/components/markdown/codeHighlight.ts — highlight de sintaxe SEM montar
 * um editor, com as peças que JÁ estão instaladas.
 *
 * ─── O DEFEITO ────────────────────────────────────────────────────────────
 * `src/lib/codeTheme.ts` tem 9 papéis de sintaxe em duas polaridades, com o
 * contraste medido contra a SELEÇÃO (o fundo mais hostil), e o chat não usava
 * NADA disso: todo bloco de código da aula saía cinza chapado.
 *
 * ─── "WITHERED TECHNOLOGY" (docs/ux-redesign.md §1) ───────────────────────
 * Uma dependência nova, declarada: `@codemirror/lang-rust` ENTROU como
 * dependência nova na onda 2.2 (onda2-editor-rust — o realce dedicado rust/rs),
 * e este módulo passou a consumi-la também. As demais (`@lezer/highlight`,
 * `@codemirror/lang-python`, `@codemirror/lang-javascript`,
 * `@codemirror/lang-json` e `@codemirror/lang-markdown`) já eram
 * dependências DECLARADAS em package.json antes —
 * o editor CodeMirror as usa para colorir o buffer. Aqui a MESMA gramática é
 * usada de um jeito novo: o `parser` da linguagem roda direto sobre uma string
 * e `highlightTree` devolve as faixas coloridas. Sem `EditorView`, sem estado,
 * sem DOM — o componente só pinta `<span>`.
 *   shiki / prism / react-syntax-highlighter estão PROIBIDOS nesta base.
 *
 * ─── POR QUE CLASSE, E NÃO COR ────────────────────────────────────────────
 * Este módulo NÃO decide cor. Ele devolve o PAPEL (`CodeSyntaxRole`) de cada
 * pedaço, e quem pinta é o CSS do `CodeBlock`, com `theme.applyStyles('dark')`
 * por último. Motivo normativo (docs/ux-redesign.md §6.2): sob `cssVariables`
 * um ternário `palette.mode === 'dark' ? A : B` resolve UMA vez e trava no
 * galho errado — bug permanente. Devolver papel em vez de hex torna o ternário
 * impossível de existir.
 *
 * ─── DEGRADAÇÃO DECLARADA (CONTRIBUTING.md, "Limitação escondida") ────────
 * Linguagem sem gramática instalada, ou um parse que lança, caem no caminho
 * SEM cor — o código continua legível, com a tinta primária. O bloco nunca
 * some e o erro nunca sobe para o React.
 */
import { highlightTree, tagHighlighter, tags, type Highlighter } from '@lezer/highlight';
import { pythonLanguage } from '@codemirror/lang-python';
import { rustLanguage } from '@codemirror/lang-rust';
import { cppLanguage } from '@codemirror/lang-cpp';
import {
  javascriptLanguage,
  jsxLanguage,
  tsxLanguage,
  typescriptLanguage,
} from '@codemirror/lang-javascript';
import { jsonLanguage } from '@codemirror/lang-json';
import type { Parser } from '@lezer/common';

import type { CodePaintRole, CodeSyntaxRole } from '../../lib/codeTheme';

/**
 * Teto de tamanho para o parse. Não é token de design — é válvula de
 * engenharia: a bolha de ERRO embute o código do aluno E a saída do runner
 * (`formatErrorBubble`), conteúdo de tamanho não controlado. Acima disso o
 * bloco vai sem cor em vez de travar o frame. 100 000 chars é ~30× o maior
 * bloco que esta base produz hoje (a saída do runner de um desafio).
 */
const MAX_HIGHLIGHT_CHARS = 100_000;

/** Um pedaço contíguo de código com (ou sem) papel pintável. */
export interface CodeToken {
  readonly text: string;
  /**
   * Papel de `codeTheme.CodePaintRole` (sintaxe para ENTRADA, estado para
   * SAÍDA), ou null quando não há cor.
   */
  readonly role: CodePaintRole | null;
}

/**
 * Ponte papel → tag do `@lezer/highlight`. É a MESMA ponte que
 * `CodeMirrorField.buildCodeMirrorTheme` faz para o editor — repetida aqui
 * porque `codeTheme.ts` não importa CodeMirror de propósito (ele é só dado) e
 * porque as duas pontes têm consumidores diferentes: lá `TagStyle[]` com cor,
 * aqui `Highlighter` com nome de papel.
 *
 * As decisões de agrupamento são as do editor, letra por letra:
 *   - `variable` é a tinta PRIMÁRIA e `operator` a SECUNDÁRIA — o token mais
 *     frequente e a pontuação densa ficam NEUTROS; código não é arco-íris;
 *   - `constant` (rosa, matiz 330) é magenta de verdade, separado de `type`
 *     (roxo `study`, matiz 272), senão bool/null e typeName colapsam.
 */
const SYNTAX_HIGHLIGHTER: Highlighter = tagHighlighter([
  { tag: [tags.comment, tags.lineComment, tags.blockComment, tags.docComment], class: 'comment' },
  {
    tag: [
      tags.keyword,
      tags.moduleKeyword,
      tags.controlKeyword,
      tags.operatorKeyword,
      tags.definitionKeyword,
      tags.modifier,
      tags.self,
    ],
    class: 'keyword',
  },
  {
    tag: [tags.string, tags.special(tags.string), tags.docString, tags.character, tags.regexp],
    class: 'string',
  },
  { tag: [tags.number, tags.integer, tags.float], class: 'number' },
  {
    tag: [tags.function(tags.variableName), tags.function(tags.propertyName), tags.macroName],
    class: 'function',
  },
  { tag: [tags.typeName, tags.className, tags.namespace, tags.tagName], class: 'type' },
  {
    tag: [
      tags.bool,
      tags.null,
      tags.atom,
      tags.literal,
      tags.constant(tags.variableName),
      tags.standard(tags.variableName),
    ],
    class: 'constant',
  },
  { tag: [tags.variableName, tags.propertyName, tags.attributeName], class: 'variable' },
  {
    tag: [
      tags.operator,
      tags.derefOperator,
      tags.arithmeticOperator,
      tags.logicOperator,
      tags.compareOperator,
      tags.definitionOperator,
      tags.punctuation,
      tags.separator,
      tags.bracket,
      tags.paren,
      tags.brace,
      tags.squareBracket,
      tags.angleBracket,
    ],
    class: 'operator',
  },
]);

/**
 * Tag de cerca → gramática. Os apelidos vieram dos emissores REAIS desta base
 * (`lesson.json` traz `code.language`; `formatErrorBubble` usa a linguagem do
 * desafio) mais os apelidos que qualquer LLM escreve sem pensar (`py`, `js`).
 */
const PARSERS: Readonly<Record<string, Parser>> = {
  python: pythonLanguage.parser,
  py: pythonLanguage.parser,
  python3: pythonLanguage.parser,
  rust: rustLanguage.parser,
  rs: rustLanguage.parser,
  javascript: javascriptLanguage.parser,
  js: javascriptLanguage.parser,
  mjs: javascriptLanguage.parser,
  cjs: javascriptLanguage.parser,
  node: javascriptLanguage.parser,
  typescript: typescriptLanguage.parser,
  ts: typescriptLanguage.parser,
  jsx: jsxLanguage.parser,
  tsx: tsxLanguage.parser,
  json: jsonLanguage.parser,
  // ONDA-CODIGO-EDITOR: C/C++ (a trilha `c-iniciante` produz blocos `c`/`cpp`
  // e SEM estes aliases o bloco saía cinza — o defeito capturado pelo dono).
  // O pacote `@codemirror/lang-cpp` é a MESMA gramática do editor (uma
  // dependência nova, declarada — critério "withered technology" da §1) e o
  // parser dele cobre a linguagem C; daí um parser para os dois nomes.
  c: cppLanguage.parser,
  h: cppLanguage.parser,
  cpp: cppLanguage.parser,
  'c++': cppLanguage.parser,
  cc: cppLanguage.parser,
  cxx: cppLanguage.parser,
  hpp: cppLanguage.parser,
  hxx: cppLanguage.parser,
};

/** true quando existe gramática instalada para a tag de cerca. */
export function hasHighlightGrammar(lang: string): boolean {
  return Object.prototype.hasOwnProperty.call(PARSERS, lang);
}

/**
 * ONDA-CODIGO-EDITOR: nome de EXIBIÇÃO da linguagem (o chip do cabeçalho do
 * bloco). A tag crua da cerca é apelido de markdown (`c`, `py`, `mjs`) e não
 * comunica nada a quem está a aprender — o dono chamou ao bloco "confuso".
 * Devolve o nome canónico (o mesmo que o editor mostra no seletor de
 * linguagem) ou null para tag desconhecida/vazia (aí o chip mostra a tag crua,
 * que é melhor que inventar nome).
 */
const DISPLAY_NAMES: Readonly<Record<string, string>> = {
  python: 'Python',
  py: 'Python',
  python3: 'Python',
  javascript: 'JavaScript',
  js: 'JavaScript',
  mjs: 'JavaScript',
  cjs: 'JavaScript',
  node: 'JavaScript',
  typescript: 'TypeScript',
  ts: 'TypeScript',
  jsx: 'JavaScript (JSX)',
  tsx: 'TypeScript (TSX)',
  json: 'JSON',
  rust: 'Rust',
  rs: 'Rust',
  c: 'C',
  h: 'C',
  cpp: 'C++',
  'c++': 'C++',
  cc: 'C++',
  cxx: 'C++',
  hpp: 'C++',
  hxx: 'C++',
};

export function codeLabelFor(lang: string): string | null {
  return DISPLAY_NAMES[lang] ?? null;
}

/**
 * Código → tokens POR LINHA, na ordem. Uma linha vazia vira uma lista vazia.
 * A revelação progressiva do typewriter é por LINHA justamente para nunca
 * cortar um token no meio (meio `print` colorido é pior que nada).
 */
export function highlightCodeLines(
  code: string,
  lang: string,
): readonly (readonly CodeToken[])[] {
  return splitTokenLines(flatTokens(code, lang));
}

function flatTokens(code: string, lang: string): readonly CodeToken[] {
  const parser = PARSERS[lang];
  if (parser === undefined || code.length > MAX_HIGHLIGHT_CHARS) {
    return [{ text: code, role: null }];
  }
  try {
    const tree = parser.parse(code);
    const out: CodeToken[] = [];
    let pos = 0;
    highlightTree(tree, SYNTAX_HIGHLIGHTER, (from, to, classes) => {
      if (from > pos) out.push({ text: code.slice(pos, from), role: null });
      out.push({ text: code.slice(from, to), role: roleOf(classes) });
      pos = to;
    });
    if (pos < code.length) out.push({ text: code.slice(pos), role: null });
    return out;
  } catch {
    // Degradação declarada: gramática que lança → bloco sem cor, nunca sem bloco.
    return [{ text: code, role: null }];
  }
}

const ROLES = new Set<string>([
  'comment',
  'keyword',
  'string',
  'number',
  'function',
  'type',
  'variable',
  'operator',
  'constant',
]);

/** `tagHighlighter` devolve as classes separadas por espaço; a 1ª conhecida vence. */
function roleOf(classes: string): CodeSyntaxRole | null {
  for (const candidate of classes.split(' ')) {
    if (ROLES.has(candidate)) return candidate as CodeSyntaxRole;
  }
  return null;
}

function splitTokenLines(tokens: readonly CodeToken[]): readonly (readonly CodeToken[])[] {
  const lines: CodeToken[][] = [[]];
  for (const token of tokens) {
    const parts = token.text.split('\n');
    for (let i = 0; i < parts.length; i += 1) {
      if (i > 0) lines.push([]);
      const piece = parts[i] ?? '';
      if (piece.length > 0) lines[lines.length - 1]?.push({ text: piece, role: token.role });
    }
  }
  return lines;
}

/* ─── ONDA-CODIGO-EDITOR: o highlight da SAÍDA ─────────────────────────────
 * Pedido do dono, verbatim: *"quero que melhore os items de saida ou
 * demonstração de código… com highlight para ate o output, e ficar facil de
 * entender as coisas"*.
 *
 * A saída do computador NÃO é código-fonte — pintá-la com papéis de SINTAXE
 * seria informação falsa (foi a decisão documentada da "segunda caixa" do
 * CodeBlock, que se mantém). O que a torna legível é o ESTADO: o que passou,
 * o que falhou, o que é aviso — mais o valor citado (string) e a contagem
 * (number). Papéis emitidos (todos de `codeTheme`, contraste medido contra o
 * well):
 *
 *   success  ✓ ✔ ✅ · pass/passed/ok/sucesso/aprovado
 *   error    ✗ ✖ × ❌ · fail/failed/error/erro/timeout/exception/assert/reprovado
 *   warn     ⚠ · warn/warning/aviso/deprecated
 *   string   aspas simples/duplas/backticks (o valor que o programa imprimiu)
 *   number   inteiros/decimais isolados (contagens, códigos de saída)
 *   muted    durações (123ms, 1.2s) e relógios [12:33:44] — contexto, não resultado
 *
 * Ordem da alternância = PRIORIDADE (símbolo/status vence string, que vence
 * muted, que vence number). DECISÃO REGISTRADA: prefixos de diff (`+`/`-`)
 * ficam FORA de propósito — em saída de matemática são sinais, e o vermelho/
 * verde de "o que passou" já é o sinal que o aluno procura. Uma passagem só,
 * tokens contíguos, texto NUNCA alterado (reconstrução = entrada; testado).
 */
const OUTPUT_TOKEN_RE =
  /(?<symbol>[✓✔✅]|✗|✖|×|❌|⚠)|(?<word>\b(?:pass(?:ed|ing)?|ok|sucesso|aprovado|fail(?:ed|ure)?|erro(?:r)?|timeout|exception|traceback|assert|reprovado|warn(?:ing)?|aviso|deprecated)\b)|(?<string>"[^"\n]*"|'[^'\n]*'|`[^`\n]*`)|(?<muted>\[?\d{1,2}:\d{2}(?::\d{2})?\]?|\b\d+(?:[.,]\d+)?\s?(?:ms|s)\b)|(?<number>\b\d+(?:[.,]\d+)?\b)/gi;

const OUTPUT_SUCCESS_WORDS = new Set(['pass', 'passed', 'passing', 'ok', 'sucesso', 'aprovado', '✓', '✔', '✅']);
const OUTPUT_ERROR_WORDS = new Set(['fail', 'failed', 'failure', 'error', 'erro', 'timeout', 'exception', 'traceback', 'assert', 'reprovado', '✗', '✖', '×', '❌']);
const OUTPUT_WARN_WORDS = new Set(['warn', 'warning', 'aviso', 'deprecated', '⚠']);

/** Papel de um token de saída — a palavra/símbolo decide, nunca a posição. */
function outputRoleOf(match: RegExpExecArray): CodePaintRole | null {
  const g = match.groups ?? {};
  if (g.symbol !== undefined || g.word !== undefined) {
    const key = (g.symbol ?? g.word ?? '').toLowerCase();
    if (OUTPUT_SUCCESS_WORDS.has(key)) return 'success';
    if (OUTPUT_ERROR_WORDS.has(key)) return 'error';
    if (OUTPUT_WARN_WORDS.has(key)) return 'warn';
    // Inalcançável com a regex atual (só casa palavras dos 3 conjuntos), mas a
    // função é TOTAL: palavra desconhecida = sem cor, nunca papel inventado.
    return null;
  }
  if (g.string !== undefined) return 'string';
  if (g.muted !== undefined) return 'muted';
  return 'number';
}

/**
 * Saída do computador → tokens POR LINHA, na ordem (mesmo contrato de
 * `highlightCodeLines`, incluindo a regra da linha vazia). É o caminho que o
 * CodeBlock usa para as cercas `text`/`output`/sem tag.
 */
export function highlightOutputLines(code: string): readonly (readonly CodeToken[])[] {
  if (code.length > MAX_HIGHLIGHT_CHARS) return splitTokenLines([{ text: code, role: null }]);
  const out: CodeToken[] = [];
  let pos = 0;
  for (const m of code.matchAll(OUTPUT_TOKEN_RE)) {
    const from = m.index ?? 0;
    if (from > pos) out.push({ text: code.slice(pos, from), role: null });
    out.push({ text: m[0], role: outputRoleOf(m) });
    pos = from + m[0].length;
  }
  if (pos < code.length) out.push({ text: code.slice(pos), role: null });
  return splitTokenLines(out);
}
