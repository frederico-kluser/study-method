/**
 * src/components/chat/SegmentedMarkdown.tsx — a ponte entre o RELÓGIO do
 * typewriter e a RENDERIZAÇÃO segmentada.
 *
 * ─── O DEFEITO (reclamação do dono: "a maneira como está escrevendo o código") ─
 * Antes: `<ReactMarkdown>{text.slice(0, cut)}</ReactMarkdown>`. Um único
 * componente fatiava markdown CRU por caractere e o parser rodava sobre o
 * FRAGMENTO a cada 35,7 ms. MEDIDO NA TELA — os dois pipelines renderizados com
 * `react-dom/server` nos 565 cortes da seção mais longa da aula 1
 * (`as-tres-partes-da-linha`, 564 chars): **41 dos 565 cortes (7,3%) exibiam
 * sintaxe crua; com este componente, ZERO** — crase solta, `**` antes de o
 * negrito estalar, a cerca por dois quadros antes de virar caixa e o backtick de
 * FECHAMENTO surgindo DENTRO do bloco de código. A cada estalo a fonte mudava
 * (proporcional → mono), a largura mudava, e a bolha inteira redimensionava.
 *   (O "206 de 565 (36,5%)" que este cabeçalho publicava até a revisão contava
 *   o markdown-FONTE retido, não a tela: a regra da cerca marcava os 169 cortes
 *   posteriores à 1ª cerca mesmo com o `<pre><code>` já formado. Ver
 *   tests/typewriterSegments.test.ts.)
 *
 * ─── O QUE MUDA ───────────────────────────────────────────────────────────
 * O corte continua vindo de `typewriterCut` (o relógio NÃO mudou, e por isso o
 * golden master de velocidade de leitura continua verde). O que mudou é o que
 * se faz com ele:
 *   - `splitTypewriterSegments` parte o markdown em PROSA e BLOCOS uma única
 *     vez, memoizado pelo texto;
 *   - `revealTypewriterSegments` mapeia o corte para o estado visível: prosa
 *     cortada em fronteira SEGURA (nunca meio construto) e blocos revelados
 *     LINHA A LINHA, já formatados e coloridos;
 *   - a caixa do bloco nasce com a altura final, então encher o bloco não
 *     reflowa nada do que já está na tela.
 *
 * ─── POR QUE `key` POR ÍNDICE ─────────────────────────────────────────────
 * Os segmentos só crescem no FIM (o corte é monotônico) e a lista deriva de um
 * texto imutável: o índice é uma chave estável de verdade aqui. Trocar por uma
 * chave derivada do conteúdo remontaria o `<pre>` — o defeito de scroll que
 * esta onda veio consertar.
 */
import { useMemo, type ReactElement } from 'react';

import {
  revealTypewriterSegments,
  splitTypewriterSegments,
} from '../../lib/typewriterSegments';
import { CodeBlock, MarkdownView } from '../markdown';

export interface SegmentedMarkdownProps {
  /** Markdown COMPLETO da mensagem (o histórico guarda sempre o texto inteiro). */
  markdown: string;
  /** Índice do corte vindo de `typewriterCut` — `markdown.length` = tudo visível. */
  cut: number;
}

export function SegmentedMarkdown({ markdown, cut }: SegmentedMarkdownProps): ReactElement {
  const segments = useMemo(() => splitTypewriterSegments(markdown), [markdown]);
  const revealed = revealTypewriterSegments(segments, cut);
  return (
    <>
      {revealed.map((segment, i) =>
        segment.kind === 'prose' ? (
          <MarkdownView key={i} markdown={segment.text} />
        ) : (
          <CodeBlock
            key={i}
            code={segment.code}
            lang={segment.lang}
            visibleLines={segment.visibleLines}
          />
        ),
      )}
    </>
  );
}
