/**
 * src/components/quiz/QuizOverlayHost.tsx — o quiz SOBRE A TELA.
 *
 * O pedido do dono, literal: *"o layout do quiz deve ser sobre a tela e
 * respondendo ele minimiza para ficar no chat"* — e, junto, a regra que dá
 * sentido ao overlay: *"só vamos para o desafio depois que o aluno provar que
 * entendeu"*. Este componente é a metade "sobre a tela"; a metade "no chat" é
 * o `QuizChatCard`, ancorado na bolha da seção.
 *
 * ─── POR QUE MONTADO NO SHELL, E NÃO NA VIEW ──────────────────────────────
 * Molde: `ChallengeGenerateModal` + `challengeGenerateStore` (App.tsx). O shell
 * monta SÓ a view ativa (`const View = VIEWS[active]`), então trocar de aba
 * DESMONTA a LessonView e zera qualquer `useState` dela. Um `Dialog`/`Popover`
 * do MUI não serve por dois motivos independentes: o estado morre com o
 * componente que o renderiza, e o conteúdo desmonta ao fechar — "minimizar"
 * viraria "perder a resposta". Aqui a FASE vive no módulo
 * (`src/lib/quizOverlayState.ts`, lido por `useSyncExternalStore`) e o
 * CONTEÚDO chega por `quizOverlayContent` (publicado pela LessonView).
 *
 * ─── O `AnimatePresence` COM A CONDICIONAL DENTRO ─────────────────────────
 * O retorno é SEMPRE `<AnimatePresence>`, com o `if` DENTRO — se o componente
 * retornasse `null` quando fechado, o `exit` nunca rodaria (o mesmo conserto
 * documentado no irmão, revisão BAIXO-1). É por isso que minimizar tem
 * animação de saída em vez de sumiço seco.
 *
 * ─── AS SAÍDAS (e por que NENHUMA delas FECHA) ────────────────────────────
 * Esc, clique no backdrop e o botão do cabeçalho fazem a MESMA coisa:
 * MINIMIZAR. `closeQuizOverlay` é, por contrato do store, "a afirmação foi
 * DOMINADA (o único fim do ciclo)" — deixar o Esc fechar seria deixar o aluno
 * dispensar o gate com uma tecla. Minimizado, o quiz continua na conversa, a
 * um clique de voltar, e o gate do "Próximo"/"Concluir aula" continua de pé.
 *
 * ─── ESTILO (nada inventado) ──────────────────────────────────────────────
 * Backdrop, blur, zIndex, borda 2px por `color-mix`, raio e sombra colorida
 * são os MESMOS valores do `ChallengeGenerateModal` — este overlay é o irmão
 * dele, não um widget com paleta própria. `alpha()` do MUI continua PROIBIDO
 * (lança com CSS var — MUI #9); toda composição de cor é `color-mix`.
 *
 * ─── a11y (§8.1, NORMATIVO) ───────────────────────────────────────────────
 *  - `role="dialog"` + `aria-modal="true"` + `aria-label` i18n;
 *  - o card recebe FOCO ao abrir (`tabIndex={-1}` + `focus()`), então o
 *    teclado entra no diálogo em vez de continuar no input do chat;
 *  - `prefers-reduced-motion: reduce` desliga o overshoot: a entrada vira
 *    fade puro (sem `y`, sem `scale`) — o movimento sai, a informação NUNCA
 *    (o texto de estado é `role="status"` no card, não uma animação).
 */
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@mui/material/styles';
import { Box, Button, IconButton, Stack, Typography } from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import ReplayIcon from '@mui/icons-material/Replay';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

import { springs, windowVariants } from '../../lib/animationTokens';
import {
  peekQuizOverlay,
  subscribeQuizOverlay,
} from '../../lib/quizOverlayState';
import { LessonQuizCard } from '../../views/LessonView/LessonQuiz';
import {
  peekQuizOverlayContent,
  subscribeQuizOverlayContent,
} from './quizOverlayContent';

/** Entrada sem overshoot para `prefers-reduced-motion: reduce` (§8.1). */
const REDUCED_VARIANTS = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

export function QuizOverlayHost(): ReactElement {
  const { t } = useTranslation();
  // Cast de interpolação da casa (ver LessonView) — `t` tipado por chave
  // literal não aceita `options` sem ele.
  const tI = useMemo(
    () => t as unknown as (key: string, options?: Record<string, string | number>) => string,
    [t],
  );
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  // O TERCEIRO argumento é o snapshot de servidor. Ele é o MESMO `peek` porque
  // os dois estados são variáveis de MÓDULO: não existe "estado do servidor"
  // diferente do do cliente. E ele não é zelo teórico — sem ele o React recusa
  // renderizar este componente fora do navegador ("Missing getServerSnapshot"),
  // e é justamente `react-dom/server` que permite, num repositório SEM jsdom,
  // PROVAR o que chega à tela (tests/quizOverlayRender.test.ts: o diálogo
  // aparece, as quatro alternativas nascem iguais e a resposta não vaza).
  const overlay = useSyncExternalStore(subscribeQuizOverlay, peekQuizOverlay, peekQuizOverlay);
  const content = useSyncExternalStore(
    subscribeQuizOverlayContent,
    peekQuizOverlayContent,
    peekQuizOverlayContent,
  );
  const cardRef = useRef<HTMLDivElement | null>(null);

  const secondaryMain = theme.vars.palette.secondary.main;
  const surfacePaper = theme.vars.palette.background.paper;

  // O overlay só desenha quando a FASE pede a tela E o conteúdo publicado é o
  // MESMO quiz. Conteúdo de outra chave (a view acabou de trocar de aula) ou
  // ausente (a LessonView desmontou numa troca de aba) não vira card órfão.
  const showing =
    overlay.phase === 'sobre-a-tela' &&
    content !== null &&
    content.quizKey === overlay.quizKey;

  /** Minimizar — a ÚNICA saída (ver o cabeçalho). Lê o conteúdo por PEEK para
   *  não carregar closure velha no listener de teclado. */
  const minimize = useCallback((): void => {
    peekQuizOverlayContent()?.onMinimize();
  }, []);

  // Esc minimiza. O listener só existe ENQUANTO o overlay está na tela — sem
  // ele nenhum handler global fica pendurado no resto da sessão (e o Esc do
  // ChallengeGenerateModal continua sendo dele).
  useEffect(() => {
    if (!showing) return;
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') minimize();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showing, minimize]);

  // O foco entra no diálogo ao abrir (§8.1) — sem isso o teclado continuaria
  // no input do chat, atrás do backdrop.
  useEffect(() => {
    if (!showing) return;
    cardRef.current?.focus();
  }, [showing, content?.assertion.id]);

  const variants = reduceMotion ? REDUCED_VARIANTS : windowVariants;

  return (
    <AnimatePresence>
      {showing && content !== null ? (
        <motion.div
          key="quiz-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={springs.snappy}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1300,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            // Backdrop escuro com blur — os MESMOS valores do irmão
            // ChallengeGenerateModal.
            background: 'rgba(8, 10, 20, 0.66)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
          }}
          // Clique no backdrop MINIMIZA (o card abaixo faz stopPropagation).
          onClick={minimize}
        >
          <motion.div
            variants={variants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={reduceMotion ? springs.snappy : springs.window}
            style={{ width: '100%', maxWidth: 680 }}
            onClick={(e) => e.stopPropagation()}
          >
            <Box
              ref={cardRef}
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-label={t('translation:lesson.quizOverlayAria')}
              sx={{
                bgcolor: surfacePaper,
                border: '2px solid',
                borderColor: `color-mix(in srgb, ${secondaryMain} 45%, transparent)`,
                borderRadius: 2,
                p: 2.5,
                boxShadow: `0 10px 48px -12px color-mix(in srgb, ${secondaryMain} 35%, transparent)`,
                outline: 'none',
              }}
            >
              <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Box>
                  <Typography variant="h6" component="h2">
                    {t('translation:lesson.quizOverlayTitle')}
                  </Typography>
                  {content.generation > 0 ? (
                    <Typography variant="caption" color="text.secondary">
                      {tI('lesson.quizAttemptLabel', { n: content.generation + 1 })}
                    </Typography>
                  ) : null}
                </Box>
                <IconButton
                  size="small"
                  onClick={minimize}
                  aria-label={t('translation:lesson.quizOverlayMinimize')}
                >
                  <KeyboardArrowDownIcon fontSize="small" />
                </IconButton>
              </Stack>

              {/* O CARD é o mesmo da conversa (LessonQuizCard): a decisão
                  visual de cada alternativa continua vindo da função PURA
                  `optionVisualState` — o overlay não reimplementa nada e a
                  resposta segue sem vazar antes do clique. */}
              <LessonQuizCard
                assertion={content.assertion}
                quiz={content.quiz}
                onSelect={content.onSelect}
              />

              {content.notice ? (
                <Stack direction="row" spacing={1} sx={{ mt: 1.5, alignItems: 'flex-start', flexWrap: 'wrap', rowGap: 1 }}>
                  <InfoOutlinedIcon fontSize="small" sx={{ color: 'info.main', flexShrink: 0, mt: 0.25 }} />
                  <Typography role="status" variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>
                    {content.notice}
                  </Typography>
                  {content.onRetry ? (
                    <Button size="small" variant="text" color="secondary" onClick={content.onRetry} startIcon={<ReplayIcon />}>
                      {t('translation:lesson.quizChatRetry')}
                    </Button>
                  ) : null}
                  {/* ONDA4-SAÍDA-DO-CICLO: a saída que NÃO depende da IA —
                      responder de novo a MESMA pergunta. O card compacto da
                      conversa oferece a mesma coisa (QuizChatCard); as duas
                      metades do quiz não podem divergir no que oferecem. */}
                  {content.onReopen ? (
                    <Button
                      size="small"
                      variant="outlined"
                      color="secondary"
                      onClick={content.onReopen}
                      startIcon={<RestartAltIcon />}
                    >
                      {t('translation:lesson.quizChatReopen')}
                    </Button>
                  ) : null}
                </Stack>
              ) : null}

              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
                {t('translation:lesson.quizOverlayHint')}
              </Typography>
            </Box>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
