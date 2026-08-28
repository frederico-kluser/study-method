/**
 * src/components/challenge/ChallengeGenerateModal.tsx — MODAL GLOBAL de etapas
 * do "Gerar novo desafio" (ONDA 3 — generate-flow).
 *
 * Substitui o busy mudo das views por um processo VISÍVEL com 5 etapas
 * (estilo Nintendo/leet-code-rpg, herdado das ondas 1-2):
 *
 *   ① Pensando no desafio (draft LLM)
 *   ② Escrevendo os testes
 *   ③ Conferindo a coerência com o que você aprendeu (rótulo honesto —
 *      revisão BAIXO-2: o regenerador PODE pular a validação semântica quando
 *      o validador está indisponível; a etapa não afirma validação que pode
 *      não ocorrer)
 *   ④ Verificando a execução
 *   ⑤ Adicionando ao topo dos desafios
 *
 * POR QUE NO SHELL (pedido do dono — ponto C do handoff): o shell monta SÓ a
 * view ativa, e a geração continua no main mesmo se o usuário trocar de aba.
 * Este modal é montado SEMPRE (App.tsx, junto ao OnboardingHost) e lê o
 * challengeGenerateStore (module-level, sobrevive a unmount) via
 * useSyncExternalStore — o processo nunca se perde ao navegar.
 *
 * O LISTENER DE PROGRESSO VIVE AQUI (não na view): o modal é o único
 * componente garantidamente montado durante todo o processo. Ele assina o
 * canal push track:challenge-regenerate-progress e aplica os eventos no store
 * (applyChallengeGenerateProgress — o store é a única fonte de verdade).
 * Os eventos terminais ('done'/'error') garantem o desfecho mesmo quando a
 * view que disparou já desmontou. A CORRELAÇÃO por generationId (revisão
 * ALTO-2) vive no store: um terminal ATRASADO de um processo anterior é
 * descartado — o modal nunca mostra o done errado.
 *
 * SAÍDAS (revisão MÉDIO-1): "Cancelar" no estado running, Esc, clique no
 * backdrop e X/Fechar nos estados finais — todos marcam o store idle
 * (resetChallengeGenerate). DECISÃO documentada: cancelar NÃO aborta o main
 * (o processo LLM/insert continua e o desafio PODE ser persistido depois);
 * só desliga o modal — os terminais atrasados são descartados pelo
 * generationId.
 *
 * CONCLUSÃO (status 'done'): glow na cor secondary/sucesso (estilo Nintendo,
 * sem confetti pesado) + botão "Ver desafio" — a NAVEGAÇÃO DE CONCLUSÃO
 * acontece AQUI (via challengeNav), nunca via callback da view: cobre os dois
 * fluxos e o caso "navegou durante a geração". O target da navegação é o
 * guardado no store no start (BAIXO-3): 'lesson' (bolha da aula) ou
 * 'proficiency' (painel do teste de proficiência) — nada de hardcode.
 *
 * ESTILO: overlay escuro com blur, card com scale+fade (scaleIn +
 * springs.window), borda 2px, radius 16, sombra colorida secondary 25-40%,
 * título Chakra Petch (Typography h6 do tema); etapa ativa com pulso
 * (opacity [1,0.4,1] 1.6s — transitions.pulse), concluída com check animado
 * (motion scale + springs.playful), futura apagada.
 *
 * EXIT ANIMADO (revisão BAIXO-1): o AnimatePresence vive NO PRÓPRIO
 * componente — o retorno é SEMPRE <AnimatePresence> com a condicional
 * DENTRO (o exit roda quando o store volta a idle, em vez de o componente
 * retornar null e matar a animação).
 */
import { useCallback, useEffect, useSyncExternalStore, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CloseIcon from '@mui/icons-material/Close';
import EditNoteIcon from '@mui/icons-material/EditNote';
import ErrorIcon from '@mui/icons-material/Error';
import PlayCircleIcon from '@mui/icons-material/PlayCircle';
import SchoolIcon from '@mui/icons-material/School';
import VerticalAlignTopIcon from '@mui/icons-material/VerticalAlignTop';

import { AnimatePresence, motion } from 'motion/react';
import { springs, scaleIn, transitions, windowVariants } from '../../lib/animationTokens';
import { getApi } from '../../lib/apiBridge';
import { useChallengeNav } from '../../lib/challengeNav';
import {
  applyChallengeGenerateProgress,
  peekChallengeGenerate,
  resetChallengeGenerate,
  subscribeChallengeGenerate,
} from '../../lib/challengeGenerateStore';
import type { TrackRegenerateProgressEvent } from '../../../shared/ipc-contract';

/** As 5 etapas do modal (ordem do pedido do dono — contrato com o store). */
const STAGES = [
  { labelKey: 'translation:challengeGen.stageThinking', icon: <AutoAwesomeIcon fontSize="small" /> },
  { labelKey: 'translation:challengeGen.stageTests', icon: <EditNoteIcon fontSize="small" /> },
  { labelKey: 'translation:challengeGen.stageValidating', icon: <SchoolIcon fontSize="small" /> },
  { labelKey: 'translation:challengeGen.stageExecuting', icon: <PlayCircleIcon fontSize="small" /> },
  { labelKey: 'translation:challengeGen.stageInserting', icon: <VerticalAlignTopIcon fontSize="small" /> },
] as const;

export function ChallengeGenerateModal(): ReactElement {
  const { t } = useTranslation();
  const theme = useTheme();
  const nav = useChallengeNav();
  const state = useSyncExternalStore(subscribeChallengeGenerate, peekChallengeGenerate);

  const secondaryMain = theme.vars.palette.secondary.main;
  const successMain = theme.vars.palette.success.main;
  const surfacePaper = theme.vars.palette.background.paper;

  // ONDA3 (B): o listener de progresso vive no MODAL (sempre montado no shell)
  // — os eventos do main atualizam o store global (a correlação por
  // generationId fica no store). StrictMode-safe: o unsubscribe devolvido
  // pelo on* é chamado no cleanup.
  useEffect(() => {
    const api = getApi();
    const off = api.track.onChallengeRegenerateProgress((ev: TrackRegenerateProgressEvent) => {
      applyChallengeGenerateProgress(ev);
    });
    return off;
  }, []);

  // MÉDIO-1: Esc fecha o modal em qualquer estado (idle → no-op). Lê o store
  // por PEEK (sem stale closure) — o listener vive no componente sempre
  // montado, mas o estado pode ter mudado desde o último render.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && peekChallengeGenerate().status !== 'idle') {
        resetChallengeGenerate();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  /** "Ver desafio" (status done): navega para o desafio NOVO com o TARGET real
   *  guardado no start (BAIXO-3) e fecha o modal. A navegação de conclusão
   *  vive aqui (não nas views) — cobre os dois fluxos e o caso "navegou
   *  durante a geração". */
  const handleViewChallenge = useCallback((): void => {
    const s = peekChallengeGenerate();
    if (!s.trackSlug || !s.lessonId || !s.challengeId || !s.target) {
      resetChallengeGenerate();
      return;
    }
    nav.selectTrackChallenge({
      trackSlug: s.trackSlug,
      target: s.target,
      ...(s.target === 'lesson' ? { lessonId: s.lessonId } : {}),
      challengeId: s.challengeId,
      title: s.challengeTitle ?? s.challengeId,
    });
    nav.navigateToChallenge();
    resetChallengeGenerate();
  }, [nav]);

  const running = state.status === 'running';
  const done = state.status === 'done';
  const error = state.status === 'error';

  return (
    <AnimatePresence>
      {state.status !== 'idle' ? (
        // Overlay MOTION (filho direto do AnimatePresence — é ele quem anima
        // o exit, revisão BAIXO-1): fade do backdrop.
        <motion.div
          key="gen-overlay"
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
            // Backdrop escuro com blur (estilo do leet-code-rpg).
            background: 'rgba(8, 10, 20, 0.66)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
          }}
          // MÉDIO-1: clique no backdrop fecha (confirmação implícita — o main
          // NÃO é abortado; o card abaixo faz stopPropagation).
          onClick={resetChallengeGenerate}
        >
          <motion.div
            variants={windowVariants}
            initial="initial"
            exit="exit"
            style={{ width: '100%', maxWidth: 440 }}
            // FIX de tipagem motion 13 (ver animationTokens.ts): transição no
            // prop, nunca dentro do alvo. `animate` é SEMPRE um objeto (nunca
            // misturar com o nome da variante — prop duplicado): entra com o
            // mesmo alvo de windowVariants e, no done, anima o GLOW por
            // keyframes (uma vez, sem repetição — estilo Nintendo, sem
            // confetti pesado).
            animate={
              done
                ? {
                    opacity: 1,
                    y: 0,
                    scale: 1,
                    boxShadow: [
                      `0 10px 48px -12px color-mix(in srgb, ${secondaryMain} 35%, transparent)`,
                      `0 0 0 2px color-mix(in srgb, ${successMain} 0%, transparent), 0 0 36px 6px color-mix(in srgb, ${successMain} 50%, transparent)`,
                      `0 10px 48px -12px color-mix(in srgb, ${secondaryMain} 35%, transparent)`,
                    ],
                  }
                : { opacity: 1, y: 0, scale: 1 }
            }
            transition={done ? { duration: 1.5, times: [0, 0.45, 1] } : springs.window}
            onClick={(e) => e.stopPropagation()}
          >
            <Box
              sx={{
                bgcolor: surfacePaper,
                border: '2px solid',
                borderColor: `color-mix(in srgb, ${secondaryMain} 45%, transparent)`,
                borderRadius: 2,
                p: 2.5,
                boxShadow: `0 10px 48px -12px color-mix(in srgb, ${secondaryMain} 35%, transparent)`,
              }}
              role="dialog"
              aria-modal="true"
              aria-label={t('translation:challengeGen.title')}
            >
              <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Typography variant="h6" component="h2">
                  {done ? t('translation:challengeGen.doneTitle') : t('translation:challengeGen.title')}
                </Typography>
                {done ? (
                  <IconButton size="small" onClick={resetChallengeGenerate} aria-label={t('translation:challengeGen.close')}>
                    <CloseIcon fontSize="small" />
                  </IconButton>
                ) : null}
              </Stack>

              {/* Etapas: ativa pulsa, concluída ganha check animado, futura apagada. */}
              <Stack spacing={1.25} sx={{ mt: 2 }}>
                {STAGES.map((st, i) => {
                  const isActive = running && state.stage === i;
                  const isDoneStage = done || state.stage > i;
                  const isFuture = !isDoneStage && !isActive;
                  return (
                    <Stack
                      key={st.labelKey}
                      direction="row"
                      spacing={1.25}
                      sx={{ alignItems: 'center', opacity: isFuture ? 0.45 : 1 }}
                    >
                      {/* Ícone da etapa (36px, borda 2px — traço game). */}
                      <Box
                        sx={{
                          width: 36,
                          height: 36,
                          flexShrink: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: 1.5,
                          border: '2px solid',
                          borderColor: isActive
                            ? secondaryMain
                            : isDoneStage
                              ? `color-mix(in srgb, ${successMain} 55%, transparent)`
                              : 'divider',
                          color: isActive ? secondaryMain : isDoneStage ? successMain : 'text.disabled',
                          bgcolor: isActive
                            ? `color-mix(in srgb, ${secondaryMain} 12%, transparent)`
                            : 'transparent',
                        }}
                      >
                        <AnimatePresence mode="wait" initial={false}>
                          {isDoneStage ? (
                            <motion.div
                              key="check"
                              variants={scaleIn}
                              initial="hidden"
                              animate="visible"
                              exit="hidden"
                              transition={springs.playful}
                              style={{ display: 'flex' }}
                            >
                              <CheckCircleIcon fontSize="small" />
                            </motion.div>
                          ) : (
                            <motion.div
                              key="icon"
                              initial={false}
                              animate={isActive ? { opacity: [1, 0.4, 1] } : { opacity: 1 }}
                              transition={isActive ? transitions.pulse : springs.snappy}
                              style={{ display: 'flex' }}
                            >
                              {st.icon}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </Box>
                      <Typography variant="body2" sx={{ fontWeight: isActive ? 600 : 400 }}>
                        {t(st.labelKey)}
                      </Typography>
                    </Stack>
                  );
                })}
              </Stack>

              {/* Running: botão CANCELAR (MÉDIO-1) — não aborta o main, só
                  desliga o modal (documentado no cabeçalho). */}
              {running ? (
                <Stack direction="row" sx={{ mt: 2.5, justifyContent: 'center' }}>
                  <motion.span whileTap={{ scale: 0.98 }} transition={springs.snappy} style={{ display: 'inline-block' }}>
                    <Button size="small" variant="outlined" color="secondary" onClick={resetChallengeGenerate}>
                      {t('translation:challengeGen.cancel')}
                    </Button>
                  </motion.span>
                </Stack>
              ) : null}

              {/* Estado final: done → destaque + "Ver desafio"; error → mensagem. */}
              {done ? (
                <Stack spacing={1.5} sx={{ mt: 2.5, alignItems: 'center' }}>
                  <motion.span
                    variants={scaleIn}
                    initial="hidden"
                    animate="visible"
                    transition={springs.playful}
                    style={{ display: 'inline-block' }}
                  >
                    <Typography variant="body2" sx={{ color: 'success.main', fontWeight: 600 }}>
                      {t('translation:challengeGen.doneHint')}
                    </Typography>
                  </motion.span>
                  <motion.span whileTap={{ scale: 0.98 }} transition={springs.snappy} style={{ display: 'inline-block' }}>
                    <Button variant="contained" color="secondary" onClick={handleViewChallenge} startIcon={<PlayCircleIcon />}>
                      {t('translation:challengeGen.viewChallenge')}
                    </Button>
                  </motion.span>
                </Stack>
              ) : null}

              {error ? (
                <Stack direction="row" spacing={1} sx={{ mt: 2.5, alignItems: 'center' }}>
                  <ErrorIcon fontSize="small" sx={{ color: 'error.main', flexShrink: 0 }} />
                  <Typography variant="body2" color="error.main" sx={{ flexGrow: 1 }}>
                    {state.errorMessage || t('translation:challengeGen.errorGeneric')}
                  </Typography>
                  <Button size="small" variant="outlined" color="secondary" onClick={resetChallengeGenerate}>
                    {t('translation:challengeGen.close')}
                  </Button>
                </Stack>
              ) : null}
            </Box>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
