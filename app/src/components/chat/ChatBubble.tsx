/**
 * src/components/chat/ChatBubble.tsx — a bolha de mensagem do chat da aula.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ONDA "chat e código" — as DUAS reclamações do dono
 * ════════════════════════════════════════════════════════════════════════════
 * "o layout do chat está ruim" (quer algo mais Nintendo, como as instruções de
 * material) e "a maneira como está escrevendo o código também [está ruim]".
 * A autoridade de design é `docs/ux-redesign.md`; o contrato congelado de
 * valores é `src/lib/designTokens.ts`. Nenhum hex, duração ou raio foi
 * inventado aqui.
 *
 * ─── 1. O LAYOUT ──────────────────────────────────────────────────────────
 * O chat era o ÚNICO lugar do app ainda no visual "web genérico": Paper, Card,
 * Chip e Button já tinham ganhado borda de 2px e sombra colorida por color-mix
 * (src/theme.ts) e a bolha ficou de fora. O que entrou:
 *
 *   a) BORDA 2px + SOMBRA COLORIDA no acento do próprio tom, com as fórmulas
 *      que já existem no tema (contained 40%, Paper selected 25%) — ver
 *      `chatSurfaces.ts`.
 *   b) RAIO por `SHAPE` (20 nos cantos redondos, 8 na cauda). Antes era o
 *      literal '16px 16px 4px 16px', fora do contrato.
 *   c) UMA aparência por AUTOR. O tutor falava por dois balões radicalmente
 *      diferentes (papel branco em `message`, ROXO CHAPADO em `reply`), o que
 *      fazia a cor significar "que turno é este" em vez de "quem falou". Agora
 *      todo balão do tutor usa a mesma superfície de leitura (nível 1) e o roxo
 *      da `reply` migra de PREENCHIMENTO para ACENTO (borda + sombra + avatar)
 *      — que é onde a §1 do redesign coloca a personalidade: "superfície
 *      quieta, resposta viva… a personalidade vive em acento, estado e
 *      movimento". A identidade da resposta continua roxa; ela só parou de
 *      gritar por cima do texto.
 *   d) AGRUPAMENTO de mensagens consecutivas (`chatBubbleStyle.groupsWithPrevious`):
 *      o arquivo dizia seguir o padrão iMessage e repetia avatar + nome + hora
 *      em cinco bolhas seguidas do tutor. Agora o cabeçalho só reaparece quando
 *      diria algo novo — e a regra não inventa limiar de tempo nenhum (ver o
 *      cabeçalho daquele módulo).
 *   e) MEDIDA da coluna: teto de 80ch (SC 1.4.8, `TYPE.measureMaxCh`) somado ao
 *      78% de sempre, para a linha de leitura não esticar em janela fullhd.
 *
 * ─── 2. A ESCRITA DO CÓDIGO ───────────────────────────────────────────────
 * A bolha NÃO fatia mais markdown cru. `TypewriterText` continua dono do
 * relógio (o mesmo `typewriterCut`, o mesmo `TYPEWRITER_TPS.theory` = 7 tps =
 * 28 chars/s — o golden master de velocidade de leitura segue verde, sem
 * renegociação), e `SegmentedMarkdown` mapeia o corte sobre SEGMENTOS: prosa
 * com corte em fronteira segura, blocos de código já formatados e coloridos,
 * revelados linha a linha, com a caixa reservada na altura final.
 *   MEDIDO NA TELA — os dois pipelines renderizados de verdade com
 *   `react-dom/server` nos 565 cortes da seção mais longa da aula 1: o ANTIGO
 *   exibia sintaxe crua em 41 deles (7,3%); o NOVO, em ZERO
 *   (tests/typewriterSegments.test.ts, bloco "a TELA renderizada").
 *
 * ─── O QUE FOI PRESERVADO ─────────────────────────────────────────────────
 *  - `instant` na bolha de ERRO de execução (a 10 tps o erro levaria ~55 s);
 *  - o gating do "Gerar novo desafio" é só o turno em voo (`regenerateDisabled`);
 *  - hora HH:MM dentro da bolha, com a opacidade 1 nas bolhas preenchidas
 *    (medido: com 0,8 o composto caía a 3,38–3,69:1, abaixo do SC 1.4.3);
 *  - entrada da bolha (fadeInUp) continua no wrapper da LessonView;
 *  - hover sutil só na bolha INTERATIVA (a review tem botão) e glow breve na
 *    review de APROVAÇÃO — os dois causados por estado real (guarda-corpo #1).
 *
 * ─── A ÚNICA MUDANÇA DE INTERFACE ─────────────────────────────────────────
 * O prop OPCIONAL `previous` (a mensagem anterior do histórico). Sem ele, nada
 * agrupa e o comportamento é o de hoje — a chamada atual da LessonView continua
 * compilando e funcionando sem tocar em nada.
 */
import { useTranslation } from 'react-i18next';
import { useTheme } from '@mui/material/styles';
import { Box, Button, Typography } from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { motion, type Transition } from 'motion/react';
import type { ReactElement } from 'react';

import { formatChatTime, type TutorChatMessage } from '../../lib/trackLessonState';
import { chatBubbleTone, groupsWithPrevious, isUserTone } from '../../lib/chatBubbleStyle';
import { TYPE } from '../../lib/designTokens';
import { springs } from '../../lib/animationTokens';
import { TypewriterText } from './TypewriterText';
import { SegmentedMarkdown } from './SegmentedMarkdown';
import {
  CHAT_AVATAR_SIZE,
  ChatAvatar,
  bubbleRestShadow,
  bubbleShellStyle,
} from './chatSurfaces';

/** Transição do glow de aprovação (uma passada, sem repetição). */
const GLOW_TRANSITION: Transition = { duration: 1.4, times: [0, 0.45, 1], ease: 'easeInOut' };

export interface ChatBubbleProps {
  message: TutorChatMessage;
  /**
   * true quando a mensagem ENTROU nesta sessão (não veio do cache/seed
   * antigo) — o texto é DIGITADO no mount; false → completo instantâneo.
   */
  isNew: boolean;
  /** tokens por segundo do typewriter desta bolha (ver `chatBubbleTps`). */
  tps?: number;
  /** ONDA10: "pular a digitação" (clique no painel, tecla, "Mostrar tudo"). */
  skip?: boolean;
  /**
   * ADITIVO nesta onda: a mensagem ANTERIOR do histórico. Presente → bolhas
   * consecutivas do mesmo autor/tom/minuto se AGRUPAM (sem avatar, nome nem
   * hora repetidos). Ausente → nada agrupa (o comportamento anterior).
   */
  previous?: TutorChatMessage;
  /** ONDA2 (error-flow): "Gerar novo desafio" DENTRO da bolha de review. */
  onRegenerate?: () => void;
  regenerateDisabled?: boolean;
  onStreamStart?: () => void;
  onStreamDone?: () => void;
  onStreamTick?: () => void;
}

export function ChatBubble({
  message,
  isNew,
  tps,
  skip,
  previous,
  onRegenerate,
  regenerateDisabled,
  onStreamStart,
  onStreamDone,
  onStreamTick,
}: ChatBubbleProps): ReactElement {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const lang = i18n.language ?? 'pt-BR';
  const tone = chatBubbleTone(message);
  const isUser = isUserTone(tone);
  const isReview = tone === 'error' || tone === 'approved';
  // Bolha de ERRO = review COM `errorFor` (o seed do `formatErrorBubble`):
  // NUNCA passa pelo typewriter. Review de APROVAÇÃO continua digitando.
  const isErrorReview = tone === 'error';
  const isApprovedReview = tone === 'approved';
  const grouped = groupsWithPrevious(message, previous, lang);
  const authorName = isUser
    ? t('translation:lesson.youName')
    : t('translation:lesson.tutorName');
  const time = formatChatTime(message.ts, lang);

  const shell = bubbleShellStyle(theme, tone, grouped);
  const restShadow = bubbleRestShadow(theme, tone);
  const successFill = theme.vars.palette.success.fill;

  return (
    <Box
      sx={{
        display: 'flex',
        gap: 0.75,
        alignItems: 'flex-end',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
        // Continuação do mesmo autor: metade do respiro do `gap: 1` da lista —
        // o grupo se lê como UM bloco, não como cinco avisos.
        ...(grouped ? { mt: -0.5 } : null),
      }}
    >
      {/* Avatar do TUTOR. Numa continuação ele vira ESPAÇO da mesma largura:
          sem isso o balão agrupado escorregaria para a margem e a coluna do
          grupo se desalinharia. */}
      {!isUser ? (
        grouped ? (
          <Box aria-hidden sx={{ width: CHAT_AVATAR_SIZE, flexShrink: 0 }} />
        ) : (
          <ChatAvatar isUser={false} label={authorName} />
        )
      ) : null}
      <Box
        sx={{
          // §4.2: a medida da coluna de leitura tem teto RÍGIDO de 80ch
          // (SC 1.4.8). O 78% de sempre continua mandando em janela normal;
          // o `ch` só entra em janela larga, onde a linha esticaria demais.
          maxWidth: `min(78%, ${TYPE.measureMaxCh}ch)`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: isUser ? 'flex-end' : 'flex-start',
        }}
      >
        {grouped ? null : (
          <Typography variant="caption" color="textSecondary" sx={{ px: 0.5 }}>
            {authorName}
          </Typography>
        )}
        <motion.div
          style={shell}
          // Hover SUTIL só na bolha INTERATIVA (a review tem o botão "Gerar
          // novo desafio"): elevação com spring snappy. `transform` é o nível
          // `spatial` — a cor nunca participa do overshoot (§5).
          whileHover={isReview ? { y: -2 } : undefined}
          // Glow breve na review de APROVAÇÃO — causado por estado REAL
          // (guarda-corpo #1), uma passada, sem repetição e sem confetti. Os
          // keyframes começam e terminam na sombra de REPOUSO do tom, para o
          // balão não perder a sombra colorida no fim da animação.
          animate={
            isApprovedReview
              ? {
                  boxShadow: [
                    restShadow,
                    `0 0 16px 2px color-mix(in srgb, ${successFill} 45%, transparent)`,
                    restShadow,
                  ],
                }
              : undefined
          }
          // FIX de tipagem motion 13: a transição vai pelo PROP, nunca dentro
          // do alvo.
          transition={isApprovedReview ? GLOW_TRANSITION : springs.snappy}
        >
          {isUser ? (
            // A mensagem do ALUNO não é markdown — é o que ele digitou, e
            // renderizá-la como markdown transformaria um `*` dele em itálico.
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
              {message.content}
            </Typography>
          ) : (
            <>
              <TypewriterText
                text={message.content}
                active={isNew}
                tps={tps}
                instant={isErrorReview}
                skip={skip}
                onStart={onStreamStart}
                onDone={onStreamDone}
                onTick={onStreamTick}
              >
                {(_partial, cut) => (
                  <SegmentedMarkdown markdown={message.content} cut={cut} />
                )}
              </TypewriterText>
              {isErrorReview ? (
                <motion.span
                  whileTap={{ scale: 0.98 }}
                  transition={springs.snappy}
                  style={{ display: 'inline-block' }}
                >
                  <Button
                    size="small"
                    variant="outlined"
                    color="secondary"
                    onClick={onRegenerate}
                    disabled={regenerateDisabled}
                    startIcon={<AutoAwesomeIcon />}
                    sx={{ mt: 1 }}
                  >
                    {t('translation:challenge.regenerateButton')}
                  </Button>
                </motion.span>
              ) : null}
            </>
          )}
          {/* Hora DENTRO da bolha: o `ts` é o da CRIAÇÃO (o cache preserva a
              hora original). Some na continuação — ela diria o MESMO HH:MM da
              bolha de cima, e é exatamente por isso que o grupo existe.
              Contraste (SC 1.4.3, caption 14px): nas bolhas PREENCHIDAS a hora
              usa a cor de contraste do par a opacidade 1 — com 0,8 o composto
              media 3,38–3,69:1. Nas de superfície, 0,8 mede 8,69:1+. */}
          {grouped ? null : (
            <Typography
              variant="caption"
              sx={{
                display: 'block',
                textAlign: 'right',
                mt: 0.25,
                opacity: isUser ? 1 : 0.8,
              }}
            >
              {time}
            </Typography>
          )}
        </motion.div>
      </Box>
      {isUser ? (
        grouped ? (
          <Box aria-hidden sx={{ width: CHAT_AVATAR_SIZE, flexShrink: 0 }} />
        ) : (
          <ChatAvatar isUser label={authorName} />
        )
      ) : null}
    </Box>
  );
}
