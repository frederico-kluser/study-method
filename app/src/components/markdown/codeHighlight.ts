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
 * Nenhuma dependência nova. `@lezer/highlight`, `@codemirror/lang-python`,
 * `@codemirror/lang-javascript`, `@codemirror/lang-json` e
 * `@codemirror/lang-markdown` já são dependências DECLARADAS em package.json —
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
import {
  javascriptLanguage,
  jsxLanguage,
  tsxLanguage,
  typescriptLanguage,
} from '@codemirror/lang-javascript';
import { jsonLanguage } from '@codemirror/lang-json';
import type { Parser } from '@lezer/common';

import type { CodeSyntaxRole } from '../../lib/codeTheme';

/**
 * Teto de tamanho para o parse. Não é token de design — é válvula de
 * engenharia: a bolha de ERRO embute o código do aluno E a saída do runner
 * (`formatErrorBubble`), conteúdo de tamanho não controlado. Acima disso o
 * bloco vai sem cor em vez de travar o frame. 100 000 chars é ~30× o maior
 * bloco que esta base produz hoje (a saída do runner de um desafio).
 */
const MAX_HIGHLIGHT_CHARS = 100_000;

/** Um pedaço contíguo de código com (ou sem) papel de sintaxe. */
export interface CodeToken {
  readonly text: string;
  /** Papel de `codeTheme.CodeSyntaxRole`, ou null quando não há cor. */
  readonly role: CodeSyntaxRole | null;
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
};

/** true quando existe gramática instalada para a tag de cerca. */
export function hasHighlightGrammar(lang: string): boolean {
  return Object.prototype.hasOwnProperty.call(PARSERS, lang);
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
