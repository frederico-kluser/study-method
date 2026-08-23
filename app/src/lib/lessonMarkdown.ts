/**
 * src/lib/lessonMarkdown.ts — preparação/rendering de markdown com KaTeX (onda 17b).
 *
 * A aula (e o enunciado do desafio) já é markdown via `react-markdown@9` — via
 * CERTA para fórmulas matemáticas é plugar `remark-math@6` (parse de `$...$`
 * inline e `$$...$$` em bloco) + `rehype-katex@7` (render KaTeX) no
 * `<ReactMarkdown>` existente. Ambos são compatíveis com react-markdown@9
 * (remark-math 6 ↔ remark 15 / unified 11; rehype-katex 7 ↔ rehype 13 / unified 11).
 *
 * Este módulo centraliza a configuração KaTeX para que:
 *   - LessonView e ChallengeView usem os MESMOS plugins/options (singleton da onda);
 *   - a suíte (node pura, sem jsdom) teste a função headless `renderLessonMarkdown`
 *     que passa o markdown pelo MESMO pipeline unified do app (remark-math →
 *     rehype-katex), provando que `$x^2$`, bloco `$$`, markdown sem `$` intacto e
 *     LaTeX malformado (que NÃO quebra) se comportam como esperado.
 *
 * Segurança: rehype-katex@7 GARANTE que LaTeX malformado nunca derruba o render
 * — ele roda o KaTeX com `throwOnError: true` dentro de um try/catch interno e,
 * ao falhar, re-renderiza com `throwOnError: false, strict: 'ignore'`; se mesmo
 * assim falhar, emite um `<span class="katex-error">` com o texto literal em vez
 * de lançar (veja lib/index.js). Por isso a opção `throwOnError` nem é exposta
 * no tipo `Options` do v7 (Omit<KatexOptions, 'throwOnError'>) — não a passamos.
 * E markdown sem `$` renderiza intacto (o remark-math só interpreta
 * delimitadores `$`/`$$` explícitos).
 */
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkMath from 'remark-math';
import remarkRehype from 'remark-rehype';
import rehypeKatex from 'rehype-katex';
import rehypeStringify from 'rehype-stringify';
import type { PluggableList } from 'unified';

/** Plugins remark (parse) para o `<ReactMarkdown>` — `$...$` e `$$...$$`. */
export function katexRemarkPlugins(): PluggableList {
  return [remarkMath];
}

/** Plugins rehype (render KaTeX) para o `<ReactMarkdown>` — sem opções: o v7
 *  já trata malformado sem derrubar o render (ver doc de segurança acima). */
export function katexRehypePlugins(): PluggableList {
  return [rehypeKatex];
}

/** Factory com o pacote completo para o `<ReactMarkdown>` (remark + rehype). */
export function katexReactMarkdownPlugins(): {
  remarkPlugins: PluggableList;
  rehypePlugins: PluggableList;
} {
  return { remarkPlugins: katexRemarkPlugins(), rehypePlugins: katexRehypePlugins() };
}

/**
 * Renderiza markdown → HTML (headless, sem DOM) com o MESMO pipeline unified que
 * o react-markdown usa no app + KaTeX. Usado pela suíte de testes para provar o
 * comportamento de fórmulas; também serve de barramento único da configuração.
 */
export async function renderLessonMarkdown(markdown: string): Promise<string> {
  const file = await unified()
    .use(remarkParse)
    .use(remarkMath)
    .use(remarkRehype)
    .use(rehypeKatex)
    .use(rehypeStringify)
    .process(markdown);
  return String(file);
}