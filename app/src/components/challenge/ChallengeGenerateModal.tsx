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
 * SAÍDAS (revisão MÉDIO-1 → ONDA-UX): "Fechar" no estado running, Esc, clique
 * no backdrop e X/Fechar nos estados finais — todos marcam o store idle
 * (resetChallengeGenerate). DECISÃO documentada: fechar NÃO aborta o main
 * (o processo LLM/insert continua e o desafio PODE ser persistido depois);
 * só desliga o modal — os terminais atrasados são descartados pelo
 * generationId. O botão dizia "Cancelar", o que PROMETIA poupar tempo/custo e
 * era mentira — agora diz "Fechar" (`challengeGen.close`), a palavra verdadeira.
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
 * título do tema (Typography h6, a pilha de display do design system);
 * etapa ativa com pulso (opacity [1,0.4,1] 1.6s — transitions.pulse, SUSPENSO
 * sob prefers-reduced-motion), concluída com check animado (motion scale +
 * springs.playful), futura apagada.
 *
 * EXIT ANIMADO (revisão BAIXO-1): o AnimatePresence vive NO PRÓPRIO
 * componente — o retorno é SEMPRE <AnimatePresence> com a condicional
 * DENTRO (o exit roda quando o store volta a idle, em vez de o componente
 * retornar null e matar a animação).
 */
import { useCallback, useEffect, useRef, useSyncExternalStore, type ReactElement } from 'react';
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

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { springs, scaleIn, transitions, windowVariants } from '../../lib/animationTokens';
import { modalSurfaceStyles } from '../../theme';
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

/** Entrada sem overshoot para `prefers-reduced-motion: reduce` (mesmo padrão do QuizOverlayHost). */
const REDUCED_VARIANTS = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

/** Tudo que pode receber Tab dentro do diálogo (a lista canônica do laço — cópia do QuizOverlayHost). */
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function ChallengeGenerateModal(): ReactElement {
  const { t } = useTranslation();
  const theme = useTheme();
  const nav = useChallengeNav();
  const state = useSyncExternalStore(subscribeChallengeGenerate, peekChallengeGenerate);

  const secondaryMain = theme.vars.palette.secondary.main;
  const successMain = theme.vars.palette.success.main;
  // ONDA-UX-CONTRASTE: o acento tem DOIS papéis — `main` é PREENCHIMENTO e
  // `accentText` é o valor de TEXTO/ícone legível nos dois esquemas (ver o
  // contrato em src/theme.ts e a medição do QuizOverlayHost: `main` reprova o
  // piso de 3:1 em cima do cartão deste modal no escuro). Ícones, bordas de
  // estado e textos usam `accentText`; o glow/sombra continua em `main`
  // (decoração, sem piso de contraste).
  const secondaryAccent = theme.vars.palette.secondary.accentText;
  const successAccent = theme.vars.palette.success.accentText;
  const errorAccent = theme.vars.palette.error.accentText;

  // ONDA-UX-A11Y: `aria-modal` promete que o fundo fica inacessível — e sem
  // focus trap o Tab passeava pelo app atrás do scrim (SC 2.4.3). O laço é o
  // MESMO do QuizOverlayHost (FOCUSABLE + wrap), e o foco ENTRA no card ao
  // abrir (o teclado não fica no botão atrás do backdrop) e VOLTA ao fechar.
  const cardRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const reduceMotion = useReducedMotion();

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
  // ONDA-UX-A11Y: o Tab fica PRESO no diálogo enquanto o modal está em cena —
  // sem o laço, `aria-modal` mentia e o foco passeava pelo app atrás do scrim.
  const open = state.status !== 'idle';
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        resetChallengeGenerate();
        return;
      }
      if (e.key !== 'Tab') return;
      const card = cardRef.current;
      if (card === null) return;
      const alvos = [...card.querySelectorAll<HTMLElement>(FOCUSABLE)];
      // Sem nada focável dentro, o Tab não pode sair do diálogo mesmo assim:
      // o próprio card (tabIndex -1) recebe o foco de volta.
      if (alvos.length === 0) {
        e.preventDefault();
        card.focus();
        return;
      }
      const primeiro = alvos[0];
      const ultimo = alvos[alvos.length - 1];
      const atual = document.activeElement;
      if (e.shiftKey && (atual === primeiro || atual === card)) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && atual === ultimo) {
        e.preventDefault();
        primeiro.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  // O foco entra no card ao abrir (o teclado não fica no controlo atrás do
  // backdrop) e volta ao elemento que abriu o modal ao fechar (SC 2.4.3).
  // Se o abridor foi desmontado enquanto o modal estava em cena (a navegação
  // pode acontecer durante a geração), a devolução é um no-op seguro.
  useEffect(() => {
    if (open) {
      openerRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      cardRef.current?.focus();
      return;
    }
    const opener = openerRef.current;
    openerRef.current = null;
    if (opener !== null && opener.isConnected) opener.focus();
  }, [open]);

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
            // ONDA-UX-SCROLL: centrado SEGURO — a lista de etapas ALTA (ou um
            // erro longo) transbordava o overlay fixed sem rolagem e ficava
            // inalcançável. `alignItems: 'flex-start'` + `margin: 'auto'` no
            // filho: com espaço livre as margens auto centram; com card mais
            // alto que a janela elas resolvem para 0, o card encosta ao topo e
            // o wrapper rola até ao fim (mesma receita do QuizOverlayHost).
            alignItems: 'flex-start',
            justifyContent: 'center',
            overflowY: 'auto',
            padding: 16,
            // Backdrop escuro com blur. ONDA 12: era `rgba(8, 10, 20, 0.66)`,
            // cor CRUA (proibida pelo contrato de designTokens.ts) e AZULADA —
            // B 20 contra R 8 — o que tingia de azul a tela inteira de um app
            // cuja rampa é cinza neutro desde a onda 11. Este modal era a
            // FONTE da cópia: o overlay do quiz herdou dele o mesmo literal.
            // Agora os dois leem o MESMO token (`palette.scrim`, preto puro a
            // 55%), que é também o que o `MuiBackdrop` do tema aplica — um
            // valor, um lugar, os quatro scrims da base idênticos.
            background: theme.vars.palette.scrim,
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
          }}
          // MÉDIO-1: clique no backdrop fecha (confirmação implícita — o main
          // NÃO é abortado; o card abaixo faz stopPropagation).
          onClick={resetChallengeGenerate}
        >
          <motion.div
            variants={reduceMotion ? REDUCED_VARIANTS : windowVariants}
            initial="initial"
            exit="exit"
            style={{ width: '100%', maxWidth: 440, margin: 'auto' }}
            // FIX de tipagem motion 13 (ver animationTokens.ts): transição no
            // prop, nunca dentro do alvo. `animate` é SEMPRE um objeto (nunca
            // misturar com o nome da variante — prop duplicado): entra com o
            // mesmo alvo de windowVariants e, no done, anima o GLOW por
            // keyframes (uma vez, sem repetição — estilo Nintendo, sem
            // confetti pesado).
            animate={
              done && !reduceMotion
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
            transition={
              done
                ? reduceMotion
                  ? springs.snappy
                  : { duration: 1.5, times: [0, 0.45, 1] }
                : springs.window
            }
            onClick={(e) => e.stopPropagation()}
          >
            <Box
              ref={cardRef}
              tabIndex={-1}
              // ONDA-UX-SUPERFÍCIE: o cartão desenhava `background.paper` à mão
              // — a regra da casa é "quem precisa da superfície de modal CHAMA
              // `modalSurfaceStyles`" (theme.ts), a MESMA função que o
              // QuizOverlayHost e o `MuiDialog` usam. Sem ela, no escuro o
              // cartão ficava no nível 1 em vez do topo da rampa (nível 4),
              // divergindo de todos os outros modais.
              sx={(tema) => ({
                ...modalSurfaceStyles(tema),
                border: '2px solid',
                borderColor: `color-mix(in srgb, ${secondaryMain} 45%, transparent)`,
                borderRadius: 2,
                p: 2.5,
                boxShadow: `0 10px 48px -12px color-mix(in srgb, ${secondaryMain} 35%, transparent)`,
                outline: 'none',
              })}
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
                            ? secondaryAccent
                            : isDoneStage
                              ? `color-mix(in srgb, ${successAccent} 55%, transparent)`
                              : 'divider',
                          color: isActive ? secondaryAccent : isDoneStage ? successAccent : 'text.disabled',
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
                              // ONDA-UX (SC 2.3.3): o overshoot do check cede a
                              // um fade simples sob prefers-reduced-motion.
                              transition={reduceMotion ? springs.snappy : springs.playful}
                              style={{ display: 'flex' }}
                            >
                              <CheckCircleIcon fontSize="small" />
                            </motion.div>
                          ) : (
                            <motion.div
                              key="icon"
                              initial={false}
                              // ONDA-UX (SC 2.3.3): o pulso infinito da etapa
                              // ativa fica ESTÁTICO sob prefers-reduced-motion.
                              animate={isActive && !reduceMotion ? { opacity: [1, 0.4, 1] } : { opacity: 1 }}
                              transition={isActive && !reduceMotion ? transitions.pulse : springs.snappy}
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

              {/* Running: botão FECHAR (MÉDIO-1 → ONDA-UX) — não aborta o
                  main, só desliga o modal (documentado no cabeçalho). O rótulo
                  era "Cancelar" e PROMETIA que a geração parava: mentira. */}
              {running ? (
                <Stack direction="row" sx={{ mt: 2.5, justifyContent: 'center' }}>
                  <motion.span whileTap={{ scale: 0.98 }} transition={springs.snappy} style={{ display: 'inline-block' }}>
                    <Button size="small" variant="outlined" color="secondary" onClick={resetChallengeGenerate}>
                      {t('translation:challengeGen.close')}
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
                    transition={reduceMotion ? springs.snappy : springs.playful}
                    style={{ display: 'inline-block' }}
                  >
                    {/* ONDA-UX-CONTRASTE: era `color: 'success.main'` — o
                        PREENCHIMENTO da família como texto, 2,74:1 no escuro
                        sobre o cartão (nível 4). Regra 3b neste nível: texto
                        em TINTA (o veredito já vive no doneTitle/glow); o
                        acento fica nos ícones, em `accentText`. */}
                    <Typography variant="body2" sx={{ color: 'text.primary', fontWeight: 600 }}>
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
                  {/* ONDA-UX-CONTRASTE: o ícone usa `error.accentText` (o valor
                      de TEXTO da família — o `main` reprova o piso de 3:1 do
                      SC 1.4.11 sobre o cartão no escuro) e a mensagem fica em
                      TINTA (texto `error.main` era 2,74:1 no escuro). */}
                  <ErrorIcon fontSize="small" sx={{ color: errorAccent, flexShrink: 0 }} />
                  <Typography variant="body2" sx={{ color: 'text.primary', flexGrow: 1 }}>
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
