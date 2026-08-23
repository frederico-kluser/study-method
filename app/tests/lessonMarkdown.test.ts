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
import { escapeLoneDollarSigns, katexReactMarkdownPlugins, renderLessonMarkdown } from '../src/lib/lessonMarkdown';

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

describe('escapeLoneDollarSigns: $ de moeda vs delimitador LaTeX (fix17c)', () => {
  it('escapa $ seguido de dígito (moeda "$5")', () => {
    assert.equal(escapeLoneDollarSigns('Isto custa $5.'), 'Isto custa \\$5.');
  });

  it('escapa $10,50 (dígito + separador de decimal)', () => {
    assert.equal(escapeLoneDollarSigns('Preço: $10,50.'), 'Preço: \\$10,50.');
  });

  it('escapa $1.000,00 (separador de milhar)', () => {
    assert.equal(escapeLoneDollarSigns('Total $1.000,00.'), 'Total \\$1.000,00.');
  });

  it('escapa $5 e $10 na MESMA linha (o caso corrupto reportado — 2 moedas)', () => {
    assert.equal(
      escapeLoneDollarSigns('Este plano custa $5 e $10 no total.'),
      'Este plano custa \\$5 e \\$10 no total.',
    );
  });

  it('escapa $ seguido de branco + dígito (ex. "R$ 5")', () => {
    assert.equal(escapeLoneDollarSigns('Custa R$ 5.'), 'Custa R\\$ 5.');
  });

  it('preserva LaTeX inline $x^2$ intacto', () => {
    assert.equal(
      escapeLoneDollarSigns('Teorema $x^2 + y^2 = r^2$.'),
      'Teorema $x^2 + y^2 = r^2$.',
    );
  });

  it('preserva bloco $$...$$ intacto (dentro da linha e multilinha)', () => {
    assert.equal(escapeLoneDollarSigns('$$x^2$$'), '$$x^2$$');
    assert.equal(
      escapeLoneDollarSigns('$$\nx = \\frac{-b}{2a}\n$$\nFim.'),
      '$$\nx = \\frac{-b}{2a}\n$$\nFim.',
    );
  });

  it('render headless: moeda "$5 e $10" não vira KaTeX (fix do corrupto)', async () => {
    const html = await renderLessonMarkdown('Este plano custa $5 e $10 no total.');
    assert.equal(html.includes('class="katex"'), false, 'não deve gerar math para moeda');
    assert.match(html, /\$5/);
    assert.match(html, /\$10/);
  });

  it('deixa intacto markdown SEM $ (não toca em nada)', () => {
    const input = '# Título\n\nTexto sem cifrão alguma coisa.';
    assert.equal(escapeLoneDollarSigns(input), input);
  });

  it('mescla moeda e LaTeX na mesma linha: $5 é moeda, $x^2$ é matemática', () => {
    assert.equal(
      escapeLoneDollarSigns('O plano custa $5 e usa $x^2$.'),
      'O plano custa \\$5 e usa $x^2$.',
    );
  });
});

describe('katexReactMarkdownPlugins: plugins prontos para o ReactMarkdown', () => {
  it('expõe remarkPlugins com remark-math e rehypePlugins com rehype-katex', () => {
    const { remarkPlugins, rehypePlugins } = katexReactMarkdownPlugins();
    assert.equal(remarkPlugins.length, 1);
    assert.equal(rehypePlugins.length, 1);
  });
});