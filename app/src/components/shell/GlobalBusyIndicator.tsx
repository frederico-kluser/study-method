/**
 * src/components/shell/GlobalBusyIndicator.tsx — o LOADER GLOBAL de ocupação
 * (pedido do dono, verbatim: *"quero um loader global fácil de ver e
 * entender"*).
 *
 * ─── O PROBLEMA QUE ESTE COMPONENTE MATA ───────────────────────────────────
 * Todos os indicadores de ocupação da base viviam DENTRO do fluxo do chat
 * (bolha "digitando…", card do quiz com status). Nenhum deles é visível
 * QUANDO MAIS IMPORTA: o overlay do quiz cobre o chat inteiro, e rolar para
 * cima esconde a linha de ação. Foi assim que o dono viveu o congelamento da
 * aula (fila FIFO do LLM local + timeout de 70s matando o ciclo) sem UM
 * sinal em qualquer lugar da tela. Este componente é a resposta GLOBAL:
 * uma pílula fixa, no canto inferior direito, SEMPRE acima de overlay e
 * scroll, com um giro + TEXTO curto dizendo O QUE está acontecendo.
 *
 * ─── DE ONDE VEM O ESTADO ──────────────────────────────────────────────────
 * Da LessonView, pelo MESMO caminho do quadro de sessão (preendente da casa):
 * a LessonView SABE tudo (busy, pendingAction, streamingIds, activeQuizStatus)
 * e publica no contexto de sessão acima das views (src/lib/sessionState.ts,
 * canal `busy` — derivação pura em `lessonBusyReasonFor`). O shell monta só a
 * view ativa, então o canal PRECISA morar acima da view — e o indicador é
 * montado no App (junto ao QuizOverlayHost), sobrevivendo à troca de abas.
 * O canal é transiente por desenho: a desmontagem da view publica `null`
 * (cleanup) e o indicador some — não há ocupação fantasma.
 *
 * ─── A11Y (SC 4.1.3 + risco 3 do revisor) ──────────────────────────────────
 * `role="status"` + `aria-live="polite"` dizem a mudança SEM receber foco. O
 * texto é SEMPRE presente quando há ocupação — `prefers-reduced-motion`
 * suprime só o GIRO do ponteiro (movimento), nunca a informação: mesmo
 * critério do veredito do quiz (LessonQuizCard). Quando NADA está em voo o
 * componente não renderiza NADA (null): sem pílula órfã, sem região vazia
 * anunciando nada — e a região reNASCE com a próxima ocupação, que é o
 * anúncio desejado. Zero spinner eterno (FQ10).
 *
 * ─── NÃO INTERCEPTA O CONTEÚDO ─────────────────────────────────────────────
 * A pílula é pequena e fica no canto; ela não é focável (não é interativa —
 * é um anúncio) e nada dela estica por cima do trabalho: `maxWidth` limita a
 * caixa e o texto QUEBRA em vez de truncar (SC 1.4.12, mesma regra da
 * SessionFrame).
 *
 * Fix do revisor adversarial: `pointerEvents: 'none'` GARANTE a não-
 * intercepção — o canto inferior direito é onde mora o botão ENVIAR do
 * composer (habilitado durante o streaming, exatamente quando 'digitando'
 * acende a pílula). Sem isto, a caixa da pílula comia os cliques do botão.
 * Nada dentro dela é interativo (não há link nem botão — é um anúncio), então
 * o role="status" não perde nada ao não receber ponteiro.
 *
 * ─── EMPILHAMENTO (FQ10) ───────────────────────────────────────────────────
 * O overlay do quiz e o modal de geração usam zIndex 1300 (QuizOverlayHost/
 * ChallengeGenerateModal). A pílula usa 1400: acima de QUALQUER overlay — é
 * justamente sobre o overlay que ela precisa ser legível (o dono respondeu um
 * quiz enquanto a aula parecia travada).
 */
import type { ReactElement } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';

import { SHAPE } from '../../lib/designTokens';
import { sessionBusyLabelKey, useSessionState } from '../../lib/sessionState';
import { effectsTransition } from '../../theme';

export default function GlobalBusyIndicator(): ReactElement | null {
  const { t } = useTranslation();
  const { busy } = useSessionState();
  // Sem ocupação publicada: NEM a pílula nem a região existem (ver A11Y).
  const labelKey = busy === null ? null : sessionBusyLabelKey(busy.reason);
  if (labelKey === null) return null;

  return (
    <Box
      role="status"
      aria-live="polite"
      // Âncora estável para e2e/inspeção — a razão canônica, não o texto.
      data-busy-reason={busy.reason}
      sx={(theme) => ({
        // Fix do revisor: a pílula é UM ANÚNCIO, nunca um alvo de ponteiro —
        // sem isto ela interceptava cliques no botão enviar do composer
        // (borda direita, habilitado durante o streaming).
        pointerEvents: 'none',
        position: 'fixed',
        right: theme.spacing(2),
        bottom: theme.spacing(2),
        // ACIMA do overlay do quiz e do modal de geração (1300) — FQ10: o
        // indicador é global, visível em qualquer overlay.
        zIndex: 1400,
        display: 'flex',
        alignItems: 'center',
        gap: theme.spacing(1),
        // O texto quebra, nunca trunca (SC 1.4.12 — sem nowrap/ellipsis).
        maxWidth: 320,
        minWidth: 0,
        paddingInline: theme.spacing(1.5),
        paddingBlock: theme.spacing(0.75),
        // Superfície de JANELA (a pílula flutua sobre qualquer coisa): o mesmo
        // par de contraste das janelas da casa (modalSurfaceStyles —
        // text.primary sobre background.paper, medido como nos vizinhos).
        backgroundColor: theme.vars.palette.background.paper,
        color: theme.vars.palette.text.primary,
        border: `1px solid ${theme.vars.palette.divider}`,
        borderRadius: `${SHAPE.md}px`,
        whiteSpace: 'normal',
        overflowWrap: 'anywhere',
        transition: effectsTransition(theme, ['background-color', 'color'], 'normal'),
        '@media (prefers-reduced-motion: reduce)': {
          transition: 'none',
        },
      })}
    >
      {/* O giro é SÓ o ponteiro visual (ícone, aria-hidden): a INFORMAÇÃO é o
          texto do role="status", presente com e sem movimento (risco 3). */}
      <Box
        component="span"
        aria-hidden="true"
        sx={(theme) => ({
          width: 14,
          height: 14,
          flexShrink: 0,
          borderRadius: '50%',
          border: `2px solid ${theme.vars.palette.divider}`,
          borderTopColor: theme.vars.palette.primary.fill,
          animation: 'gbi-spin 1s linear infinite',
          '@keyframes gbi-spin': {
            to: { transform: 'rotate(360deg)' },
          },
          '@media (prefers-reduced-motion: reduce)': {
            // Movimento suprimido; o texto do status permanece — mesmo
            // critério do veredito do quiz (riscos 1 e 3).
            animation: 'none',
          },
        })}
      />
      <Typography
        component="span"
        variant="body2"
        sx={{ whiteSpace: 'normal', overflowWrap: 'anywhere' }}
      >
        {t(`translation:${labelKey}`)}
      </Typography>
    </Box>
  );
}
