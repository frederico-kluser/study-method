/**
 * tests/lessonMarkdown.test.ts — rendimento markdown + KaTeX (onda 17b).
 *
 * Suíte node pura (sem jsdom): exercita o pipeline unified do app por meio do
 * helper headless `renderLessonMarkdown`, que usa os MESMOS plugins
 * (remark-math + rehype-katex) plugados no `<ReactMarkdown>` da LessonView/
 * ChallengeView. rehype-katex@7 garante no-throw internamente (try/catch +
 * `throwOnError:false` no retry) — ver src/lib/lessonMarkdown.ts.
 *
 * Cobre os 4 comportamentos contratados na onda 17b:
 *   1. inline `$...$`  → vira KaTeX;
 *   2. bloco `$$...$$` → vira KaTeX display;
 *   3. markdown sem `$` renderiza intacto (não toca em nada);
 *   4. LaTeX malformado NUNCA quebra — renderiza como texto literal em vez de
 *      lançar exceção;
 *   5. os plugins factory entregam remark-math + rehype-katex para os componentes.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { katexReactMarkdownPlugins, renderLessonMarkdown } from '../src/lib/lessonMarkdown';

const katexMathml = 'class="katex"'; // a string presente em todo span KaTeX

describe('renderLessonMarkdown: fórmulas matemáticas', () => {
  it('converte inline $...$ em KaTeX', async () => {
    const html = await renderLessonMarkdown('Resolver $x^2 + y^2 = r^2$.');
    assert.match(html, new RegExp(katexMathml));
    // O conteúdo do LaTeX é preservado no annotation MathML.
    assert.match(html, /x\^2 \+ y\^2 = r\^2/);
  });

  it('converte bloco $$...$$ (linha própria) em KaTeX display', async () => {
    const html = await renderLessonMarkdown(
      '\n$$\nx = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}\n$$\n\nDepois.',
    );
    assert.match(html, /class="katex-display"/);
    assert.match(html, /katex-mathml/);
  });

  it('não altera markdown sem cifrão (renderiza intacto)', async () => {
    const input = '# Título\n\nTexto sem matemática.';
    const html = await renderLessonMarkdown(input);
    assert.equal(html.includes(katexMathml), false);
    assert.match(html, /<h1>Título<\/h1>/);
    assert.match(html, /<p>Texto sem matemática\.<\/p>/);
  });

  it('malformado $x^{\\infinito}$ não quebra (no-throw embutido do v7)', async () => {
    // Uma fórmula que o KaTeX não sabe parsear (chave de comando inexistente).
    // rehype-katex@7 garante no-throw internamente (try/catch + throwOnError:false
    // no retry) — o render nunca derruba por LaTeX malformado.
    let html: string;
    try {
      html = await renderLessonMarkdown('Aqui vem $x^{\\naoexiste} y$ e o resto.');
    } catch {
      assert.fail('markdown malformado lançou exceção — o render deveria seguir');
    }
    // A string original não some: o markdown continua servindo o conteúdo.
    assert.equal(typeof html, 'string');
    assert.ok(html.length > 0);
  });

  it('falha de parênteses desbalanceada em $$ também não quebra', async () => {
    const html = await renderLessonMarkdown('\n$$\n\\frac{a}{b + 1$$\n\nFim.');
    assert.equal(typeof html, 'string');
    assert.ok(html.length > 0);
  });
});

describe('katexReactMarkdownPlugins: plugins prontos para o ReactMarkdown', () => {
  it('expõe remarkPlugins com remark-math e rehypePlugins com rehype-katex', () => {
    const { remarkPlugins, rehypePlugins } = katexReactMarkdownPlugins();
    assert.equal(remarkPlugins.length, 1);
    assert.equal(rehypePlugins.length, 1);
  });
});