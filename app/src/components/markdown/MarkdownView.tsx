/**
 * src/components/markdown/MarkdownView.tsx — a renderização de markdown do app,
 * em UM lugar só.
 *
 * ─── OS DEFEITOS QUE ESTE MÓDULO FECHA ────────────────────────────────────
 *  1. `MarkdownComponents()` era chamado INLINE no JSX (`ChatBubble.tsx:346`,
 *     `TrackChallengePanel.tsx:622`, `ChallengeView.tsx:979`): objeto NOVO a
 *     cada render. Durante a digitação (~28 quadros/s) o react-markdown via um
 *     mapa de componentes diferente todo quadro e REMONTAVA a subárvore — o
 *     `<pre>` perdia o `scrollLeft` do aluno a cada caractere. Aqui os
 *     componentes são CONSTANTE DE MÓDULO: identidade estável, reconciliação
 *     em vez de remontagem.
 *  2. O mesmo `MarkdownComponents()` estava DUPLICADO byte a byte em três
 *     arquivos — e o `className` da cerca (```` ```python ````) era DESCARTADO
 *     nos três, o que apagava a linguagem antes mesmo de existir highlight.
 *  3. O chat não passava plugin nenhum: num app cujo pitch inclui "a matemática
 *     que aparece na programação", `$x^2$` saía literal na aula, enquanto o
 *     enunciado do desafio (ChallengeView) já renderizava KaTeX. Agora os dois
 *     leem os MESMOS plugins de `src/lib/lessonMarkdown.ts`, em constantes de
 *     módulo (arrays com identidade estável — array novo por render tem o mesmo
 *     efeito de remontagem do item 1).
 *
 * ─── GFM: DEPENDÊNCIA PENDENTE, DECLARADA ─────────────────────────────────
 * Tabela, task list, autolink e strikethrough do GitHub Flavored Markdown
 * exigem `remark-gfm`, que **não está instalado nem é dependência transitiva**
 * (`ls app/node_modules | grep gfm` não retorna nada). A onda proíbe instalar
 * dependência, então o GFM fica FORA e a limitação é declarada aqui em vez de
 * silenciada (CONTRIBUTING.md, "Limitação escondida"). Quando entrar, o único
 * ponto de mudança é `REMARK_PLUGINS` abaixo.
 *   deps pendentes: remark-gfm@^4.0.0
 *
 * ─── TIPOGRAFIA ───────────────────────────────────────────────────────────
 * `text-align: left` explícito: a F88 do WCAG é falha DOCUMENTADA por
 * justificar texto e **não tem escape por mecanismo** (§4.2). O `.katex-display`
 * rola no próprio contêiner, nunca no body — também §4.2.
 */
import ReactMarkdown, { type Components } from 'react-markdown';
import { Box } from '@mui/material';
import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import type { PluggableList } from 'unified';

import {
  escapeLoneDollarSigns,
  katexRehypePlugins,
  katexRemarkPlugins,
} from '../../lib/lessonMarkdown';
import { CODE_TYPOGRAPHY } from '../../lib/codeTheme';
import { SHAPE } from '../../lib/designTokens';
import { normalizeFenceLang } from '../../lib/typewriterSegments';
import { CodeBlock } from './CodeBlock';

/** Plugins com identidade ESTÁVEL — ver defeito 3 no cabeçalho. */
const REMARK_PLUGINS: PluggableList = katexRemarkPlugins();
const REHYPE_PLUGINS: PluggableList = katexRehypePlugins();

/** Junta o texto de uma árvore de children do react-markdown. */
function flattenText(node: ReactNode): string {
  if (node === null || node === undefined || node === false || node === true) return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(flattenText).join('');
  if (isValidElement(node)) {
    return flattenText((node.props as { children?: ReactNode }).children);
  }
  return '';
}

/**
 * Extrai conteúdo e linguagem do `<code>` que o react-markdown coloca dentro do
 * `<pre>`. É AQUI que o `className` da cerca deixa de ser descartado: o
 * react-markdown emite `class="language-python"`, e é dele que sai a distinção
 * entrada × saída do `CodeBlock`.
 */
function fenceOf(children: ReactNode): { code: string; lang: string } {
  const element = Children.toArray(children).find(isValidElement);
  if (element === undefined) return { code: flattenText(children), lang: '' };
  const props = element.props as { className?: string; children?: ReactNode };
  const matched = /language-([\w+#-]+)/.exec(props.className ?? '');
  return {
    // O react-markdown entrega o conteúdo do bloco com a quebra final da cerca.
    code: flattenText(props.children).replace(/\n$/, ''),
    lang: normalizeFenceLang(matched?.[1] ?? ''),
  };
}

/**
 * Mapa de componentes — CONSTANTE DE MÓDULO (ver defeito 1 no cabeçalho).
 * Nunca recrie este objeto dentro de um render.
 */
export const MARKDOWN_COMPONENTS: Components = {
  pre: ({ children }) => {
    const { code, lang } = fenceOf(children);
    return <CodeBlock code={code} lang={lang} />;
  },
  // Só código INLINE chega aqui: o `pre` acima não renderiza os `children`
  // dele, então o `<code>` de dentro de um bloco nunca é montado.
  code: ({ children }) => (
    <Box
      component="code"
      sx={(theme) => ({
        fontFamily: CODE_TYPOGRAPHY.fontFamily,
        fontSize: CODE_TYPOGRAPHY.fontSize,
        backgroundColor: theme.vars.palette.surface.level2,
        borderRadius: `${SHAPE.sm}px`,
        px: 0.5,
        // Sem padding vertical: um chip alto dentro da linha aumentaria a
        // entrelinha da prosa e a coluna de leitura "abriria" onde há código.
        py: 0,
      })}
    >
      {children}
    </Box>
  ),
  // Link externo abre FORA do app (o renderer é uma janela do Electron, não um
  // browser: sem isto a fonte da aula sequestraria a própria aula). O
  // `rel="noreferrer noopener"` vinha do `MarkdownComponents` da ChallengeView e
  // é preservado letra por letra.
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer noopener">
      {children}
    </a>
  ),
};

export interface MarkdownViewProps {
  /** Markdown CRU (o escape de `$` de moeda é aplicado aqui dentro). */
  markdown: string;
}

/** O `<ReactMarkdown>` do app: plugins, componentes e tipografia num lugar só. */
export function MarkdownView({ markdown }: MarkdownViewProps): ReactElement {
  return (
    <Box
      sx={{
        // F88: justificar texto é falha documentada e não tem escape por
        // mecanismo — o alinhamento é `left`, sempre.
        textAlign: 'left',
        '& p:first-of-type': { mt: 0 },
        '& p:last-of-type': { mb: 0 },
        // §4.2: a fórmula larga rola no PRÓPRIO contêiner, nunca no body.
        '& .katex-display': { overflowX: 'auto', overflowY: 'hidden', maxWidth: '100%' },
        '& ul, & ol': { pl: 3, my: 1 },
        '& :where(h1, h2, h3, h4, h5, h6)': { mt: 1, mb: 0.5 },
        maxWidth: '100%',
      }}
    >
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        rehypePlugins={REHYPE_PLUGINS}
        components={MARKDOWN_COMPONENTS}
      >
        {escapeLoneDollarSigns(markdown)}
      </ReactMarkdown>
    </Box>
  );
}
