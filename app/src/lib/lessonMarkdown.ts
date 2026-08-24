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

/**
 * fix17c ACHADO-2 — `$` de MOEDA vs delimitador de LaTeX.
 * remark-math devora `$` solitários pareados: IA gerando copy com cifrão
 * ("Este plano custa $5 e $10") vira matemática corrupta porque o remark-math
 * casa o par `$5 e $10` como inline-math. Defense = escapar o `$` quando ele
 * é claramente MOEDA, ANTES do parse (markdown literal `\$` — o remark-math só
 * reage a `$` não escapado), sem nunca tocar delimitadores LaTeX válidos.
 *
 * REGRA (por linha, da simplificação aceita na onda 17c):
 *   1. `$$` (bloco / math com `$$`): `$` imediatamente seguido de `$` → delimitador
 *      LaTeX → NÃO toca (o par inteiro é preservado).
 *   2. `$` imediatamente seguido (após brancos opcionais) de DÍGITO → MOEDA
 *      (ex. `$5`, `$ 5`, `$1.000,00`, `$10,50`) → escapa para `\$`.
 *   3. `$` seguido de conteúdo NÃO-numérico e com um fechador `$` na MESMA linha
 *      (ex. `$x^2$`, `$P(t)=e^{-x}$`) → LaTeX inline válido → NÃO toca (preserva).
 *   4. `$` solitário/sem par → deixado intacto.
 *
 * FALSO-POSITIVO assumido (documentado): `$5^2$` (math que COMEÇA com dígito)
 * é tratado como moeda e escapado. É raro em LaTeX (número puro no início do
 * math costuma usar `5^2` ou `\\text{...}`), e a prioridade é NÃO corromper a
 * copy com cifrão gerada por IA. Monitorei a regra "par de $ … $ com conteúdo
 * numérico entre = moeda" contra os casos reportados sem quebrar LaTeX comum.
 */
export function escapeLoneDollarSigns(markdown: string): string {
  return markdown.split('\n').map(escapeDollarSignsInLine).join('\n');
}

function escapeDollarSignsInLine(line: string): string {
  let out = '';
  let i = 0;
  const n = line.length;
  // Normalização de novos tipos de separador de milhar reconhece só digito:
  // a checagem "segue digito" já cobre `$1.000,00`/`$10,50` (o `$` está antes
  // do primeiro dígito).
  while (i < n) {
    const ch = line[i];
    if (ch !== '$') {
      out += ch;
      i += 1;
      continue;
    }
    // Caso 1: `$$` (bloco) — preserva o par.
    if (i + 1 < n && line[i + 1] === '$') {
      out += '$$';
      i += 2;
      continue;
    }
    // Lookahead: pula brancos opcionais depois do `$` (ex. "R$ 10").
    let j = i + 1;
    while (j < n && /\s/.test(line[j])) j += 1;
    // Caso 2: `$` seguido de dígito → moeda.
    if (j < n && /[0-9]/.test(line[j])) {
      out += '\\$';
      i += 1;
      continue;
    }
    // Caso 3: laço LaTeX inline — fecha no próximo `$` da mesma linha.
    const close = line.indexOf('$', i + 1);
    if (close !== -1) {
      out += line.slice(i, close + 1);
      i = close + 1;
      continue;
    }
    // Caso 4: `$` solitário sem par — deixa intacto.
    out += '$';
    i += 1;
  }
  return out;
}

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
    .process(escapeLoneDollarSigns(markdown));
  return String(file);
}