/**
 * src/components/quiz/QuizChatCard.tsx — o quiz MINIMIZADO, dentro da conversa.
 *
 * O pedido do dono, literal: *"o layout do quiz deve ser sobre a tela e
 * respondendo ele minimiza para ficar no chat"*. Este é o "ficar no chat": o
 * card compacto que ocupa o lugar do quiz no fluxo da conversa, ancorado na
 * MESMA bolha que apresentou a seção (`quizzesByMessageIndex`), e que reabre o
 * overlay num clique.
 *
 * POR QUE ELE EXISTE MESMO QUANDO O QUIZ ESTÁ SOBRE A TELA. O card ocupa o
 * lugar nos DOIS estados ('sobre-a-tela' e 'minimizado-no-chat'). Se ele só
 * aparecesse ao minimizar, a conversa GANHARIA um bloco de altura no momento
 * exato em que o overlay sai — o texto abaixo pularia, e o auto-scroll da
 * LessonView (que só puxa quando o usuário está no fim) leria isso como
 * conteúdo novo. Com o lugar reservado desde a abertura, minimizar é uma troca
 * de conteúdo dentro de uma caixa que já estava lá.
 *
 * ─── A REDAÇÃO (docs/ux-redesign.md §8 item 3 e §8.2) ─────────────────────
 * Errar aqui é DIAGNÓSTICO, nunca repreensão: "sem punição. Nada de vermelho
 * piscando, nada de som triste. O painel troca para estado de diagnóstico…
 * redação informativa". Por isso o estado de erro NÃO pinta o card de
 * `error.main`: ele descreve o que está acontecendo ("escrevendo onde essa
 * alternativa se separa do que a seção mostra") e o que vem a seguir. E não
 * existe "Parabéns!" no acerto (§8.2, d = −0,40): o card diz o que ficou
 * demonstrado, que é o feedback informacional específico (d = +0,43).
 *
 * ─── DE ONDE VEM CADA VALOR (nada inventado) ──────────────────────────────
 * A casca é `bubbleShellStyle(theme, 'reply', false)` — a MESMA função que
 * desenha o balão do tutor (borda 2px no acento `study`, raio `SHAPE.lg` com
 * cauda `SHAPE.sm`, sombra colorida por `color-mix`). O card minimizado é
 * literalmente um objeto do chat, não um widget novo com paleta própria.
 * `alpha()` do MUI continua PROIBIDO (lança com CSS var — MUI #9).
 *
 * a11y (§8.1, normativo): a linha de estado é `role="status"` (o veredito e o
 * andamento chegam ao leitor de tela sem depender de cor nem de movimento) e o
 * botão de reabrir é um `Button` de verdade, com rótulo próprio.
 */
import { useTranslation } from 'react-i18next';
import { useTheme } from '@mui/material/styles';
import { Button, Stack, Typography } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import QuizIcon from '@mui/icons-material/Quiz';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import ReplayIcon from '@mui/icons-material/Replay';
import { motion } from 'motion/react';
import { useMemo, type ReactElement } from 'react';

import { springs } from '../../lib/animationTokens';
import { bubbleShellStyle } from '../chat/chatSurfaces';
import type { QuizOverlayStatus } from './quizOverlayContent';

export interface QuizChatCardProps {
  /** ponto do ciclo, no vocabulário da tela (`overlayStatusFor`). */
  status: QuizOverlayStatus;
  /** true quando o card está AGORA sobre a tela (o overlay o está desenhando). */
  onScreen: boolean;
  /** a pergunta da geração corrente — a identidade visível do card. */
  question: string;
  /** geração corrente (0 = o quiz autoral da trilha). */
  generation: number;
  /** aviso informativo do canal (fail-closed), já traduzido. null = nada a dizer. */
  notice: string | null;
  /** reabrir sobre a tela. */
  onOpen: () => void;
  /** repetir o pedido que falhou; null quando não há nada a repetir. */
  onRetry: (() => void) | null;
}

export function QuizChatCard({
  status,
  onScreen,
  question,
  generation,
  notice,
  onOpen,
  onRetry,
}: QuizChatCardProps): ReactElement {
  const { t } = useTranslation();
  // Cast de interpolação da casa (`t` tipado por chave literal não aceita
  // `options` sem ele) — mesmo padrão da LessonView e do LessonQuizCard.
  const tI = useMemo(
    () => t as unknown as (key: string, options?: Record<string, string | number>) => string,
    [t],
  );
  const theme = useTheme();
  const shell = bubbleShellStyle(theme, 'reply', false);

  // A linha de estado: o que está acontecendo com ESTE quiz, agora.
  const statusText = onScreen
    ? t('translation:lesson.quizChatOnScreen')
    : status === 'explicando'
      ? t('translation:lesson.quizChatExplaining')
      : status === 'gerando'
        ? t('translation:lesson.quizChatGenerating')
        : status === 'indisponivel'
          ? t('translation:lesson.quizChatUnavailable')
          : status === 'dominado'
            ? t('translation:lesson.quizChatMastered')
            : t('translation:lesson.quizChatWaiting');

  // O ciclo em ANDAMENTO (explicando/gerando) não tem botão: não há nada que o
  // clique do aluno adiante, e um botão morto é pior que nenhum botão. Um quiz
  // DOMINADO também não aparece aqui — a LessonView troca o card compacto pelo
  // card cheio (com o veredito) assim que a afirmação fecha.
  const canOpen = !onScreen && status === 'aguardando';

  return (
    <motion.div
      style={{ ...shell, marginTop: 8, width: '100%', maxWidth: 640 }}
      // Elevação sutil só quando o card É clicável — efeito causado por estado
      // REAL (guarda-corpo #1). `y` é nível `spatial`; cor nunca entra no
      // overshoot (§5).
      whileHover={canOpen ? { y: -2 } : undefined}
      transition={springs.snappy}
    >
      <Stack spacing={0.75}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          {status === 'dominado' ? (
            <CheckCircleIcon fontSize="small" sx={{ color: 'success.main', flexShrink: 0 }} />
          ) : (
            <QuizIcon fontSize="small" sx={{ color: 'secondary.main', flexShrink: 0 }} />
          )}
          <Typography variant="overline" sx={{ letterSpacing: 1, flexGrow: 1 }}>
            {t('translation:lesson.quizTitle')}
          </Typography>
          {generation > 0 ? (
            <Typography variant="caption" color="text.secondary">
              {tI('lesson.quizAttemptLabel', { n: generation + 1 })}
            </Typography>
          ) : null}
        </Stack>

        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {question}
        </Typography>

        {/* SC 4.1.3: o andamento e o veredito chegam por texto, nunca só por
            cor ou por movimento. */}
        <Typography role="status" variant="caption" color="text.secondary">
          {statusText}
        </Typography>

        {notice ? (
          <Stack direction="row" spacing={0.75} sx={{ alignItems: 'flex-start' }}>
            <InfoOutlinedIcon fontSize="small" sx={{ color: 'info.main', flexShrink: 0, mt: 0.125 }} />
            <Typography role="status" variant="caption" color="text.secondary">
              {notice}
            </Typography>
          </Stack>
        ) : null}

        {canOpen || onRetry ? (
          <Stack direction="row" spacing={1} sx={{ pt: 0.25 }}>
            {canOpen ? (
              <motion.span whileTap={{ scale: 0.98 }} transition={springs.snappy} style={{ display: 'inline-block' }}>
                <Button
                  size="small"
                  variant="outlined"
                  color="secondary"
                  onClick={onOpen}
                  startIcon={<OpenInFullIcon />}
                >
                  {t('translation:lesson.quizChatAnswer')}
                </Button>
              </motion.span>
            ) : null}
            {onRetry ? (
              <motion.span whileTap={{ scale: 0.98 }} transition={springs.snappy} style={{ display: 'inline-block' }}>
                <Button size="small" variant="text" color="secondary" onClick={onRetry} startIcon={<ReplayIcon />}>
                  {t('translation:lesson.quizChatRetry')}
                </Button>
              </motion.span>
            ) : null}
          </Stack>
        ) : null}
      </Stack>
    </motion.div>
  );
}
