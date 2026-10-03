/**
 * src/views/RoadmapView/LessonRow.tsx — bloco do TILE DE AULA da trilha
 * (estado done/current/pending/locked + selo "Destravada agora" + glow).
 *
 * Bloco puro (só props) — documentado em `Componentes/Roadmap/LessonRow`.
 * Contratos preservados: W16 (tile travado continua FOCÁVEL com
 * `aria-disabled`, nunca `disabled`), estado por extenso em span escondido via
 * `aria-describedby` (SC 2.5.3 label-in-name: o nome acessível é o conteúdo
 * visível), ícones diferem por FORMA (SC 1.4.1), moldura 2px do tile, glow de
 * sucesso com `prefers-reduced-motion` (SC 2.3.3) e selo INFORMATIVO nunca
 * dependente da animação (ONDA11-CADEADO).
 */
import { useId, useMemo, type ReactElement } from 'react';
import { useTheme } from '@mui/material/styles';
import { motion } from 'motion/react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import LockIcon from '@mui/icons-material/Lock';
import PlayCircleIcon from '@mui/icons-material/PlayCircle';
import PlayCircleOutlinedIcon from '@mui/icons-material/PlayCircleOutlined';
import { springs, transitions } from '../../lib/animationTokens';
import { prefersReducedMotion } from '../../lib/confetti';
import type { TrackLessonEntry } from '../../../shared/ipc-contract';

/**
 * Span visualmente escondido que carrega o ESTADO da aula por extenso para o
 * `aria-describedby` do tile (mesma receita do `HIDDEN_HINT_SX` do SplitDivider).
 * Fica FORA do botão de propósito: o nome acessível do tile é só o conteúdo
 * visível (título, resumo, dificuldade — SC 2.5.3 label-in-name) e o estado
 * chega como DESCRIÇÃO, sem duplicar texto na leitura.
 */
const HIDDEN_STATE_SX = {
  position: 'absolute',
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
} as const;

/**
 * Estado visual de uma aula (ícone + cor) e a chave i18n do estado por extenso.
 *
 * O `labelKey` deixou de ser letra morta: ele alimenta o span escondido que o
 * `aria-describedby` do tile aponta (ver LessonRow) — sem ele o leitor de tela
 * não sabia NADA do estado (o ícone é aria-hidden). E os íCONES diferem por
 * FORMA, não só por cor: "Em andamento" (play_circle CHEIO) vs "Disponível"
 * (play_circle VAZADO) era o par que se distinguia apenas pela tinta —
 * SC 1.4.1 proíbe cor como único meio visual de transmitir a informação.
 */
function lessonStateMeta(state: { locked: boolean; done: boolean; current: boolean }): {
  icon: ReactElement;
  labelKey: string;
} {
  if (state.done) return { icon: <CheckCircleIcon fontSize="small" color="success" />, labelKey: 'roadmap.done' };
  if (state.current) return { icon: <PlayCircleIcon fontSize="small" color="primary" />, labelKey: 'roadmap.current' };
  if (state.locked) return { icon: <LockIcon fontSize="small" color="disabled" />, labelKey: 'roadmap.locked' };
  return { icon: <PlayCircleOutlinedIcon fontSize="small" color="disabled" />, labelKey: 'roadmap.pending' };
}

/** Uma aula da trilha (clique abre o chat da aula). */
export function LessonRow({
  lesson,
  onOpen,
  justUnlocked,
  tI,
}: {
  lesson: TrackLessonEntry;
  onOpen: (lesson: TrackLessonEntry) => void;
  /** ONDA11-CADEADO: esta aula ABRIU desde a última visita a esta trilha. */
  justUnlocked: boolean;
  tI: (key: string, options?: Record<string, string | number>) => string;
}): ReactElement {
  const theme = useTheme();
  const meta = lessonStateMeta(lesson);
  // ONDA (a11y — estado da aula): o tile NÃO substitui mais o nome acessível
  // por um aria-label ("Aula concluída: …") — aquilo engolia o resumo e a
  // dificuldade visíveis (SC 2.5.3 label-in-name). O nome passa a ser o
  // CONTEÚDO VISÍVEL do botão e o estado viaja como descrição
  // (`aria-describedby` → span escondido), incluído na leitura do tile.
  const stateId = useId();
  // ONDA 4 (next-glow): cor do glow = success do tema (= ACCENT_*.success.fill
  // do designTokens — o mapping do theme.ts faz success.main === pair.fill; o
  // CheckCircleIcon de done já usa success.main). Família success NUNCA
  // dispara red flash (R/(R+G+B) ≈ 0,125 — teto 0,8 do contrato).
  const glowColor = theme.vars.palette.success.main;
  // prefers-reduced-motion: reduce → SEM animação, só a borda estática de
  // sucesso (mesma leitura do confetti.ts — SC 2.3.3).
  const reduced = prefersReducedMotion();
  // Keyframes do pulso: MESMA estrutura de sombras nos dois extremos (o motion
  // interpola sombra a sombra). Memoizados — referência nova a cada render
  // reiniciaria o loop. Animação de EFEITO (boxShadow): easing effects via
  // transitions.pulse, nunca o easing spatial (SPATIAL_FORBIDDEN_PROPERTIES).
  const glowKeyframes = useMemo(
    () => [
      `0 0 0 1px ${glowColor}40, 0 0 8px 1px ${glowColor}4D`,
      `0 0 0 1px ${glowColor}, 0 0 14px 3px ${glowColor}99`,
      `0 0 0 1px ${glowColor}40, 0 0 8px 1px ${glowColor}4D`,
    ],
    [glowColor],
  );
  // Entrada com a mola playful (escala — spatial) + loop do pulso (boxShadow —
  // effects): cada propriedade com a transição certa, no mesmo objeto.
  const glowTransition = useMemo(
    () => ({ scale: springs.playful, boxShadow: transitions.pulse }),
    [],
  );

  const tile = (
    <>
      <Box
        component="button"
        onClick={() => onOpen(lesson)}
        // W16 (onda-ux): lições TRANCADAS continuam FOCÁVEIS com
        // `aria-disabled` (em vez de `disabled`) — o leitor de tela consegue
        // chegar ao tile e ouvir o estado ("Travada: …", via aria-describedby);
        // o clique continua guardado em `openLesson` (não abre) e o cursor
        // continua "not-allowed". `disabled` tirava o tile da navegação
        // inteira: a restrição existia, mas ninguém a podia ouvir.
        aria-disabled={lesson.locked ? true : undefined}
        aria-describedby={stateId}
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 1,
          width: '100%',
          textAlign: 'left',
          // ONDA 1 (game-foundations): tile da trilha — borda de jogo 2px.
          // Transparente em repouso (o hover continua só o fundo), mas o tile da
          // AULA ATUAL vira um quadro de acento (borda = preenchimento, não
          // texto — regra 3b do contrato).
          border: '2px solid transparent',
          background: 'none',
          cursor: lesson.locked ? 'not-allowed' : 'pointer',
          p: 0.75,
          borderRadius: 1,
          opacity: lesson.locked ? 0.55 : 1,
          '&:hover:not([aria-disabled="true"])': { bgcolor: 'action.hover' },
          ...(lesson.current
            ? { borderColor: 'primary.main' }
            : {}),
          // ONDA 4 (next-glow): reduce → glow ESTÁTICO (borda de sucesso, sem
          // animação) — o pulso fica só para quem não pediu menos movimento.
          ...(lesson.done && reduced ? { borderColor: glowColor } : {}),
          // ONDA11-CADEADO: a aula que ACABOU de abrir ganha o quadro de
          // sucesso ESTÁTICO (cor, nunca animação — quem pediu menos movimento
          // vê exatamente o mesmo quadro). É moldura, não texto: a informação
          // continua no selo escrito ao lado, nunca só na cor.
          ...(justUnlocked ? { borderColor: glowColor } : {}),
          color: 'inherit',
        }}
      >
        <Box sx={{ mt: 0.25 }}>{meta.icon}</Box>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="body2" sx={{ fontWeight: lesson.current ? 700 : 500 }}>
            {lesson.title}
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {lesson.summary}
          </Typography>
        </Box>
        {/* ONDA11-CADEADO — A INFORMAÇÃO, que NUNCA depende da animação.
            O selo é TEXTO dentro do próprio botão: quem desligou o movimento o
            lê igual, e o leitor de tela o inclui no nome acessível do tile ("…
            Destravou agora"). Ele é INFORMATIVO, não comemorativo (§8.2 do
            ux-redesign: feedback informativo d=+0,43; elogio ritualizado
            d=-0,40) — diz que aquilo abriu, e para. Cor: `success` do tema (a
            mesma família do glow de conclusão), nunca hex cru. */}
        {justUnlocked ? (
          <Chip
            size="small"
            color="success"
            variant="outlined"
            label={tI('roadmap.justUnlockedBadge')}
            sx={{ ml: 1, flexShrink: 0 }}
          />
        ) : null}
        {/* `flexShrink: 0`: com título longo o chip de dificuldade era o único
            que encolhia (e truncava o rótulo) — os chips são moldura fixa. */}
        <Chip
          size="small"
          variant="outlined"
          label={tI('roadmap.difficulty', { n: lesson.difficulty })}
          sx={{ ml: 1, flexShrink: 0 }}
        />
      </Box>
      {/* O ESTADO por extenso ("Em andamento" / "Disponível" / …) — visível só
          para o leitor de tela (span escondido), ligado ao tile por
          `aria-describedby`. Sem ele o estado era só ícone+cor. */}
      <Box component="span" id={stateId} sx={HIDDEN_STATE_SX}>
        {tI(meta.labelKey)}
      </Box>
    </>
  );

  // ONDA11-CADEADO — O EFEITO do destravamento: a aula que abriu ENTRA na
  // lista (escala + deslocamento), em vez de já estar lá como se sempre
  // tivesse estado. É movimento SPATIAL puro (transform/geometria), o único
  // nível que pode ultrapassar; nada de cor nem de opacidade animadas (o bug
  // do texto que cintila). Com `prefers-reduced-motion: reduce` a mola nem é
  // montada — o caminho é o tile estático, sem overshoot (SC 2.3.3) —, e a
  // informação chega inteira mesmo assim: o selo escrito, a moldura de
  // sucesso e o anúncio em role="status" da view.
  if (justUnlocked && !reduced) {
    return (
      <motion.div
        initial={{ scale: 0.94, x: -12 }}
        animate={{ scale: 1, x: 0 }}
        transition={springs.playful}
        style={{ borderRadius: theme.shape.borderRadius }}
      >
        {tile}
      </motion.div>
    );
  }

  // Aula concluída + movimento permitido → GLOW pulsante de sucesso em volta
  // do tile (boxShadow com a cor de sucesso; NUNCA vermelho — regra de red
  // flash do designTokens). Com reduce (ou aula não concluída) o tile é o
  // próprio botão, sem wrapper de animação.
  if (!lesson.done || reduced) return tile;

  return (
    <motion.div
      initial={{ scale: 0.97 }}
      animate={{ scale: 1, boxShadow: glowKeyframes }}
      transition={glowTransition}
      style={{ borderRadius: theme.shape.borderRadius }}
    >
      {tile}
    </motion.div>
  );
}
