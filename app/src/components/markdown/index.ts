/**
 * src/components/markdown/index.ts — a porta única da renderização de markdown.
 *
 * Consumidores: `ChatBubble` (chat da aula), `TrackChallengePanel` e
 * `ChallengeView` (enunciado do desafio). Antes desta onda os três tinham a
 * MESMA função `MarkdownComponents()` copiada byte a byte, e nenhum deles
 * usava a fonte de código do projeto nem a paleta de sintaxe.
 */
export { MarkdownView, MARKDOWN_COMPONENTS } from './MarkdownView';
export type { MarkdownViewProps } from './MarkdownView';
export { CodeBlock } from './CodeBlock';
export type { CodeBlockProps } from './CodeBlock';
export { highlightCodeLines, hasHighlightGrammar } from './codeHighlight';
export type { CodeToken } from './codeHighlight';
