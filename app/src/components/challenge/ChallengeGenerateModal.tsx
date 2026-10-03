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
 * ─── STATE/VIEW (onda de stories do design system) ────────────────────────
 * O componente está partido em DOIS, e a fronteira é o contrato da casa:
 *
 *   - `ChallengeGenerateView` — VIEW PURA: recebe o snapshot do processo
 *     (`ChallengeGenerateState`) e os gestos (`onClose`/`onViewChallenge`)
 *     POR PROPS. Não lê store, não faz IPC, não navega. É o que o Storybook
 *     documenta com argumentos diretos (cada etapa do fluxo é um estado de
 *     props) e o que o `node:test` renderiza por SSR sem Electron;
 *   - `ChallengeGenerateModal` — CONTAINER (o export que o App.tsx monta):
 *     liga o `challengeGenerateStore` via `useSyncExternalStore`, subscreve o
 *     canal de progresso do main e resolve a navegação de conclusão via
 *     `challengeNav`. O seed/reset continua a ser `startChallengeGenerate` /
 *     `resetChallengeGenerate` / `__resetChallengeGenerateForTests`.
 *
 * POR QUE NO SHELL (pedido do dono — ponto C do handoff): o shell monta SÓ a
 * view ativa, e a geração continua no main mesmo se o usuário trocar de aba.
 * Este modal é montado SEMPRE (App.tsx, junto ao OnboardingHost) e lê o
 * challengeGenerateStore (module-level, sobrevive a unmount) via
 * useSyncExternalStore — o processo nunca se perde ao navegar.
 *
 * O LISTENER DE PROGRESSO VIVE NO CONTAINER (não na view): ele é o único
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
 * acontece NO CONTAINER (via challengeNav), nunca via callback da view: cobre
 * os dois fluxos e o caso "navegou durante a geração". O target da navegação é
 * o guardado no store no start (BAIXO-3): 'lesson' (bolha da aula) ou
 * 'proficiency' (painel do teste de proficiência) — nada de hardcode.
 *
 * ESTILO: a casca (overlay escuro com blur, centrado seguro, cartão com
 * scale+fade) é o `ModalScrim` (auditoria §6 — a cópia que vivia aqui era o
 * "irmão gêmeo" da do QuizOverlayHost e é dela que o primitivo nasceu). O
 * CHROME do cartão vai em `cardSx`/`cardClassName`: borda 2px secondary,
 * radius 2, sombra colorida secondary 25-40% e o GLOW de conclusão (uma vez,
 * keyframes 0/45/100% em 1,5s — estilo Nintendo, sem confetti pesado). O
 * resto: título do tema (Typography h6, a pilha de display do design system);
 * etapa ativa com pulso (opacity [1,0.4,1] 1.6s — transitions.pulse, SUSPENSO
 * sob prefers-reduced-motion), concluída com check animado (motion scale +
 * springs.playful), futura apagada.
 *
 * EXIT ANIMADO (revisão BAIXO-1): o `AnimatePresence` com a condicional DENTRO
 * vive no `ModalScrim` — o exit roda quando o store volta a idle (o `open` do
 * primitivo cai), em vez de o componente retornar null e matar a animação.
 *
 * FOCO (ONDA-UX-A11Y + auditoria §7): o laço de Tab/Escape e a entrada/saída
 * de foco são os do design system (`useFocusTrap` sobre `lib/focusTrap`) e
 * vivem DENTRO do `ModalScrim` — este ficheiro só diz QUEM dispensa (`onClose`
 * = reset do store). A cópia que vivia aqui era o "irmão gêmeo" da do
 * QuizOverlayHost e foi o exemplar de onde aquele módulo nasceu.
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

import { keyframes } from '@emotion/react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { springs, scaleIn, transitions } from '../../lib/animationTokens';
import { LAYOUT, Z_INDEX } from '../../lib/designTokens';
import { getApi } from '../../lib/apiBridge';
import { useChallengeNav } from '../../lib/challengeNav';
import {
  applyChallengeGenerateProgress,
  peekChallengeGenerate,
  resetChallengeGenerate,
  subscribeChallengeGenerate,
  type ChallengeGenerateState,
} from '../../lib/challengeGenerateStore';
import { Pressable } from '../ui/Pressable';
import { ModalScrim } from '../ui/ModalScrim';
import type { TrackRegenerateProgressEvent } from '../../../shared/ipc-contract';

/** As 5 etapas do modal (ordem do pedido do dono — contrato com o store). */
const STAGES = [
  { labelKey: 'translation:challengeGen.stageThinking', icon: <AutoAwesomeIcon fontSize="small" /> },
  { labelKey: 'translation:challengeGen.stageTests', icon: <EditNoteIcon fontSize="small" /> },
  { labelKey: 'translation:challengeGen.stageValidating', icon: <SchoolIcon fontSize="small" /> },
  { labelKey: 'translation:challengeGen.stageExecuting', icon: <PlayCircleIcon fontSize="small" /> },
  { labelKey: 'translation:challengeGen.stageInserting', icon: <VerticalAlignTopIcon fontSize="small" /> },
] as const;

/**
 * Entrada sem overshoot para `prefers-reduced-motion: reduce` (mesmo padrão do
 * QuizOverlayHost): o `reducedFadeVariants` do design system
 * (`lib/animationTokens` — §13 da auditoria).
 */

/**
 * VIEW PURA do modal de geração (extração state/view): só props — o snapshot
 * do processo chega pronto (`ChallengeGenerateState`, do store) e os gestos
 * saem como callbacks. Sem IPC, sem store, sem navegação.
 */
export interface ChallengeGenerateViewProps {
  /** Snapshot do processo global de geração (`challengeGenerateStore`). */
  state: ChallengeGenerateState;
  /** Dispensa o modal (Esc, backdrop, "Fechar", X) — não aborta o main. */
  onClose: () => void;
  /** "Ver desafio" (status done) — a navegação é do container, não da view. */
  onViewChallenge: () => void;
}

export function ChallengeGenerateView({
  state,
  onClose,
  onViewChallenge,
}: ChallengeGenerateViewProps): ReactElement {
  const { t } = useTranslation();
  const theme = useTheme();
  const reduceMotion = useReducedMotion();

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

  const running = state.status === 'running';
  const done = state.status === 'done';
  const error = state.status === 'error';

  // CHROME do cartão (o slot `cardSx`/`cardClassName` do `ModalScrim` —
  // auditoria §6): a MOLDURA medida deste modal compõe POR CIMA da superfície
  // base do primitivo (a REGRA DO MODAL do tema — `modalSurfaceStyles`, a
  // MESMA função que o `MuiDialog` chama — + raio `SHAPE.md` + padding). Ficam
  // aqui a borda 2px secondary, o raio `2` (= 24px), o padding `2.5`, a sombra
  // colorida secondary 25-40% e o GLOW de conclusão.
  //
  // O GLOW (estilo Nintendo, sem confetti pesado): no `done` o cartão acende
  // UMA vez — a sombra vai de repouso ao `success.main` a 50% e volta
  // (keyframes 0/45/100% em 1,5s), o mesmo desenho que a keyframe de
  // `boxShadow` do antigo `motion.div` animava (revisão BAIXO-1). Sob
  // `prefers-reduced-motion` a animação fica DESLIGADA: o movimento sai, a
  // informação (título de conclusão + `doneHint`) fica.
  const cardShadow = `0 10px 48px -12px color-mix(in srgb, ${secondaryMain} 35%, transparent)`;
  const doneGlow = `0 0 0 2px color-mix(in srgb, ${successMain} 0%, transparent), 0 0 36px 6px color-mix(in srgb, ${successMain} 50%, transparent)`;
  const doneGlowKeyframes = keyframes`
    0% { box-shadow: ${cardShadow}; }
    45% { box-shadow: ${doneGlow}; }
    100% { box-shadow: ${cardShadow}; }
  `;
  const cardChromeSx = {
    border: '2px solid',
    borderColor: `color-mix(in srgb, ${secondaryMain} 45%, transparent)`,
    borderRadius: 2,
    p: 2.5,
    boxShadow: cardShadow,
    outline: 'none',
    // A classe é a do `cardClassName` (só no done): a animação corre uma vez.
    '&.gen-done-glow': { animation: `${doneGlowKeyframes} 1.5s 1` },
    '@media (prefers-reduced-motion: reduce)': {
      '&.gen-done-glow': { animation: 'none' },
    },
  };

  return (
    <ModalScrim
      open={state.status !== 'idle'}
      ariaLabel={t('translation:challengeGen.title')}
      // MÉDIO-1: Esc e clique no backdrop FECHAM (confirmação implícita — o
      // main NÃO é abortado; ver o cabeçalho). A dispensa é o `onDismiss`.
      onDismiss={onClose}
      maxWidth={LAYOUT.modalCardNarrowPx}
      zIndex={Z_INDEX.modal}
      cardClassName={done ? 'gen-done-glow' : undefined}
      cardSx={cardChromeSx}
    >
      <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Typography variant="h6" component="h2">
          {done ? t('translation:challengeGen.doneTitle') : t('translation:challengeGen.title')}
        </Typography>
        {done ? (
          <IconButton size="small" onClick={onClose} aria-label={t('translation:challengeGen.close')}>
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
          <Pressable>
            <Button size="small" variant="outlined" color="secondary" onClick={onClose}>
              {t('translation:challengeGen.close')}
            </Button>
          </Pressable>
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
          <Pressable>
            <Button variant="contained" color="secondary" onClick={onViewChallenge} startIcon={<PlayCircleIcon />}>
              {t('translation:challengeGen.viewChallenge')}
            </Button>
          </Pressable>
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
          <Button size="small" variant="outlined" color="secondary" onClick={onClose}>
            {t('translation:challengeGen.close')}
          </Button>
        </Stack>
      ) : null}
    </ModalScrim>
  );
}

/**
 * CONTAINER do modal (state/view): o export que o App.tsx monta. Liga o
 * `challengeGenerateStore` (useSyncExternalStore), subscreve o canal de
 * progresso do main e resolve a navegação "Ver desafio" via `challengeNav`.
 * Não desenha nada — a `ChallengeGenerateView` recebe o snapshot por props.
 */
export function ChallengeGenerateModal(): ReactElement {
  const nav = useChallengeNav();
  const state = useSyncExternalStore(subscribeChallengeGenerate, peekChallengeGenerate);

  // ONDA3 (B): o listener de progresso vive no CONTAINER (sempre montado no
  // shell) — os eventos do main atualizam o store global (a correlação por
  // generationId fica no store). StrictMode-safe: o unsubscribe devolvido
  // pelo on* é chamado no cleanup.
  useEffect(() => {
    const api = getApi();
    const off = api.track.onChallengeRegenerateProgress((ev: TrackRegenerateProgressEvent) => {
      applyChallengeGenerateProgress(ev);
    });
    return off;
  }, []);

  // MÉDIO-1: Esc dispensa o modal em qualquer estado (idle → sem efeito).
  // ONDA-UX-A11Y: o Tab fica PRESO no diálogo enquanto o modal está em cena —
  // sem o laço, `aria-modal` mentia e o foco passeava pelo app atrás do scrim.
  // O laço é o do design system (`useFocusTrap` sobre `lib/focusTrap`) e vive
  // DENTRO do `ModalScrim` (auditoria §6/§7): o foco ENTRA no card ao abrir e
  // VOLTA ao elemento que abriu ao fechar (SC 2.4.3 — se o abridor foi
  // desmontado durante a geração, a devolução é um no-op seguro: este modal
  // não tem âncora que sobreviva, ao contrário do quiz). A dispensa entregue
  // ao primitivo é o `onClose` da view (= `resetChallengeGenerate`).

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

  return (
    <ChallengeGenerateView
      state={state}
      onClose={resetChallengeGenerate}
      onViewChallenge={handleViewChallenge}
    />
  );
}
