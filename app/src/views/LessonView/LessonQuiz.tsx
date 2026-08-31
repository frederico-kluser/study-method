/**
 * src/views/LessonView/LessonQuiz.tsx — card do QUIZ de múltipla escolha por
 * afirmação da aula (ONDA 4 — quiz-durante-aula, REPLAN A1).
 *
 * Um card por assertion (máx. 3 por aula), renderizado APÓS a bolha da seção
 * de teoria que a demonstra (a LessonView ancora pelo sectionId via
 * `quizzesByMessageIndex` de trackLessonState). Comportamento:
 *
 *   - NÃO respondido: 4 opções clicáveis (Button MUI, outline, texto à
 *     esquerda); ao selecionar → feedback IMEDIATO — correto: verde + mensagem
 *     de sucesso (lesson.quizCorrect); errado: vermelho + o `feedback` da
 *     assertion explicando o porquê (lesson.quizWrong/lesson.quizFeedback);
 *   - respondido: o card FICA (preenchido — o gating é visual e a resposta é
 *     idempotente/travada): a opção correta em verde com CheckCircle, a errada
 *     escolhida em vermelho com Cancel, as demais desabilitadas; o feedback
 *     permanece abaixo (revisão durante a aula);
 *   - o quiz é REFORÇO — NUNCA bloqueia o "Próximo" da aula.
 *
 * a11y: os botões têm aria-label i18n (chave lesson.quizOptionAria — "Opção 2
 * de 4: …") e o feedback usa role="status" (SC 4.1.3 — o veredito nunca
 * depende só da cor; contraste pelos pares calibrados do tema: success.main /
 * error.main sobre background.paper).
 */
import { Box, Button, Stack, Typography } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import { useTranslation } from 'react-i18next';
import { useMemo, type ReactElement } from 'react';
import { motion } from 'motion/react';
import { fadeInUp, springs } from '../../lib/animationTokens';
import type { TrackAssertionDto } from '../../../shared/ipc-contract';
import type { QuizState } from '../../lib/trackLessonState';

export interface LessonQuizCardProps {
  /** A afirmação da aula com o quiz (statement/question/options/answerIndex/feedback). */
  assertion: TrackAssertionDto;
  /** Estado da resposta (undefined = ainda não respondido). */
  quiz: QuizState | undefined;
  /** Submit da resposta (a LessonView injeta o sectionId — `submitQuizAnswer`
   *  é idempotente: a primeira resposta vence). */
  onSelect: (answerIndex: number) => void;
}

export function LessonQuizCard({ assertion, quiz, onSelect }: LessonQuizCardProps): ReactElement {
  const { t } = useTranslation();
  const tI = useMemo(
    () => t as unknown as (key: string, options?: Record<string, string | number>) => string,
    [t],
  );
  const answered = quiz?.answered === true;
  const correct = quiz?.correct === true;

  return (
    <motion.div
      variants={fadeInUp}
      initial="hidden"
      animate="visible"
      transition={springs.gentle}
      style={{ maxWidth: 640, width: '100%' }}
    >
      <Box
        sx={{
          border: '1px solid',
          borderColor: answered ? (correct ? 'success.main' : 'error.main') : 'divider',
          borderRadius: 2,
          bgcolor: 'background.paper',
          p: 1.5,
          mt: 1,
        }}
      >
        <Stack spacing={1}>
          <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: 1 }}>
            {t('translation:lesson.quizTitle')}
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {assertion.statement}
          </Typography>
          <Typography variant="body2">{assertion.question}</Typography>
          <Stack spacing={1}>
            {assertion.options.map((option, i) => {
              const isCorrectOption = i === assertion.answerIndex;
              const isWrongPick = answered && !correct && i === quiz?.selected;
              return (
                <Button
                  key={i}
                  fullWidth
                  variant={answered ? (isCorrectOption ? 'contained' : 'outlined') : 'outlined'}
                  color={isCorrectOption ? 'success' : isWrongPick ? 'error' : 'inherit'}
                  disabled={answered}
                  onClick={() => onSelect(i)}
                  aria-label={tI('lesson.quizOptionAria', {
                    n: i + 1,
                    total: assertion.options.length,
                    option,
                  })}
                  startIcon={isCorrectOption ? <CheckCircleIcon /> : isWrongPick ? <CancelIcon /> : undefined}
                  sx={{ justifyContent: 'flex-start', textAlign: 'left', textTransform: 'none' }}
                >
                  {option}
                </Button>
              );
            })}
          </Stack>
          {answered ? (
            <Box
              role="status"
              sx={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 1,
                color: correct ? 'success.main' : 'error.main',
                mt: 0.5,
              }}
            >
              {correct ? <CheckCircleIcon fontSize="small" sx={{ mt: 0.25 }} /> : <CancelIcon fontSize="small" sx={{ mt: 0.25 }} />}
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {correct ? t('translation:lesson.quizCorrect') : t('translation:lesson.quizWrong')}
                </Typography>
                {!correct && assertion.feedback ? (
                  <Typography variant="body2" color="text.secondary">
                    {t('translation:lesson.quizFeedback')} {assertion.feedback}
                  </Typography>
                ) : null}
              </Box>
            </Box>
          ) : null}
        </Stack>
      </Box>
    </motion.div>
  );
}
