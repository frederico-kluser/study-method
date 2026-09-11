/**
 * src/components/course/CollapsibleLessonHeader.tsx — o CABEÇALHO da aula vira
 * COLAPSÁVEL (ONDA2-layout).
 *
 * ─── O PEDIDO ───────────────────────────────────────────────────────────────
 * O dono quer MAIS espaço vertical durante a aula: a leitura acontece no chat,
 * e o bloco fixo do cabeçalho (título + resumo + ações + progresso +
 * pré-requisitos) comia ~150px que deveriam ser área de trabalho. A solução é
 * o cabeçalho COLAPSÁVEL, colapsado POR PADRÃO ao abrir/trocar de aula, com
 * animação (motion) no recolher/expandir e o input SEMPRE ancorado no fim da
 * coluna (nada de scroll do main — o espaço libertado vira altura do chat,
 * que é quem tem scroll interno).
 *
 * ─── O QUE VIVE ONDE (decisão de produto, registrada) ───────────────────────
 * A barra COMPACTA (sempre visível, uma linha):
 *   · o botão de TOGGLE (chevron que gira 180° — animação motion, spring)
 *   · o TÍTULO da aula em UMA linha com ellipsis (h1 — o título NUNCA some:
 *     o contexto do que se estuda permanece legível colapsado);
 *   · o botão "Desafios" (Badge de pendentes) e o botão "Fontes".
 *   → Decisão: as AÇÕES ficam FORA do colapsável. Elas são usadas DURANTE a
 *     aula (o popover de Desafios pode estar aberto quando o usuário recolhe;
 *     o anchor vive na barra fixa), custam uma linha só e os specs e2e
 *     (tests/e2e/e2e-lesson.spec.ts) clicam nelas com o cabeçalho no estado
 *     padrão (colapsado). Escondê-las quebraria o fluxo estudar→desafio.
 * O corpo COLAPSÁVEL (animado, colapsado por padrão):
 *   · o título COMPLETO (h5) + o resumo (body2) — a informação de contexto
 *     que o dono citou ("título, o parágrafo") e que mais pesa no layout.
 *   → Quando EXPANDIDO, o título da barra sai de cena (mesmo texto, mesmo h1
 *     — um único h1 no DOM em qualquer estado; ver "acessibilidade").
 * FORA do colapsável, sempre visíveis e compactos (permissão explícita do
 * handoff: "o progresso e pré-requisitos podem ficar FORA se fizer sentido"):
 *   · a barra de progresso da teoria + contador "Seção N de M" — é estado da
 *     aula (o aluno precisa ver onde está SEM interação);
 *   · os chips de pré-requisitos — uma linha pequena, usados quando a aula
 *     não entra ("não entendeu? revisar"), e o popover de Desafios precisa
 *     deles fora do fluxo de scroll.
 *
 * ─── A ANIMAÇÃO (motion, seguindo o contrato de animationTokens) ────────────
 *   · chevron do toggle: `animate={{ rotate }}` com `springs.snappy` — o
 *     spring de micro-feedback da casa (mesmo do press do chat);
 *   · corpo: AnimatePresence + `height: 0 ↔ 'auto'` com `overflow: hidden` e
 *     `springs.window` — o spring DOCUMENTADO para "entrada controlada, sem
 *     rebound agressivo" (é justamente o que um acordeão precisa; uma mola
 *     com bounce alto faria o conteúdo saltar no fim do recolher). Opacity
 *     acompanha para o texto não "pular" numa borda dura de clip;
 *   · o título da barra entra/sai com fade curto (springs.snappy) para o
 *     swap barra↔corpo não "teleportar" os botões.
 *   · prefers-reduced-motion: `useReducedMotion()` — sob redução o estado
 *     troca INSTANTÂNEO (transition { duration: 0 }, sem height/rotate
 *     animados; ver ChatBubble/QuizOverlayHost, padrão da casa). O conteúdo
 *     NUNCA some do acessível: só deixa de ANIMAR.
 *
 * ─── ACESSIBILIDADE ─────────────────────────────────────────────────────────
 *   · o toggle tem `aria-expanded` + `aria-label` i18n (pt-BR/en) + Tooltip;
 *   · conteúdo colapsado é DESMONTADO (AnimatePresence) — fora do DOM, fora
 *     do foco e do leitor de tela, sem inert/aria-hidden residual;
 *   · o título da aula é UM h1 em qualquer estado (swaps pelo mesmo texto);
 *   · alvo de toque do toggle: 44px (TOUCH_TARGET_PX, piso da casa).
 *
 * Testado em tests/lessonCollapsibleHeader.test.ts (SSR de estado/estrutura
 * nos dois estados + guards de fonte da LessonView).
 */
import { useMemo, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import Badge from '@mui/material/Badge';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import AutoStoriesIcon from '@mui/icons-material/AutoStories';

import { springs } from '../../lib/animationTokens';

/** Alvo de toque mínimo (px) — o piso de 44 do design system (mesmo
 *  TOUCH_TARGET_PX da LessonView). O IconButton small nasce com 34. */
const TOUCH_TARGET_PX = 44;

/** A rotação do chevron em cada estado (graus). Colapsado → aponta para
 *  BAIXO (expande); expandido → gira 180° (recolhe). */
const CHEVRON_ROTATE = { collapsed: 0, expanded: 180 } as const;

export interface CollapsibleLessonHeaderProps {
  /** Título da aula (h1 — na barra colapsada, em uma linha com ellipsis). */
  title: string;
  /** Resumo da aula (body2 — só visível com o corpo expandido). */
  summary: string;
  /**
   * Estado inicial. `false` = colapsado — o comportamento da aula (a view
   * repassa a responsabilidade de "voltar a colapsado ao trocar de aula"
   * remontando o componente com `key` da aula; ver LessonView).
   */
  defaultOpen?: boolean;
  /** lesson.challenges.length — botão "Desafios" só existe com desafios. */
  challengeCount: number;
  /** Pendentes (lastVerdict !== 'passed') — o Badge e o aria-label. */
  pendingChallengeCount: number;
  /** O popover de Desafios está aberto POR ESTE botão (a view computa — o
   *  mesmo `challengesOpen && challengesFrom === 'cabecalho'` de antes; o
   *  popover em si continua na view). */
  challengesExpanded: boolean;
  /** Abre o popover de Desafios ancorado no botão (a view guarda o anchor). */
  onChallengesClick: (anchor: HTMLButtonElement) => void;
  /** Abre o diálogo de Fontes (a view guarda o estado). */
  onSourcesClick: () => void;
  /** 0–100 — preenchimento da barra de progresso (sempre visível). */
  theoryProgress: number;
  /** Seções apresentadas (contador "Seção N de M", sempre visível). */
  sectionCurrent: number;
  /** Total de seções da teoria (contador "Seção N de M"). */
  sectionTotal: number;
  /** Aulas anteriores da trilha — chips sempre visíveis (uma linha). */
  prerequisites: ReadonlyArray<{ slug: string; title: string }>;
  /** Navega para a aula anterior (chip de pré-requisito). */
  onPrerequisiteClick: (slug: string) => void;
}

/** A transição do toggle, em LÓGICA PURA — o único pedaço "comportamental"
 *  do componente que dá para testar sem jsdom (o resto do clique é e2e).
 *  Colapsado → expandido; expandido → colapsado. */
export function nextLessonHeaderOpen(open: boolean): boolean {
  return !open;
}

/**
 * O cabeçalho da aula: barra compacta fixa (toggle + título + ações),
 * corpo colapsável animado (título completo + resumo), e fora do colapsável
 * o progresso da teoria e os chips de pré-requisitos. A view da aula usa o
 * componente como ÚNICA fonte do bloco de cabeçalho — não existe cópia.
 */
export function CollapsibleLessonHeader({
  title,
  summary,
  defaultOpen = false,
  challengeCount,
  pendingChallengeCount,
  challengesExpanded,
  onChallengesClick,
  onSourcesClick,
  theoryProgress,
  sectionCurrent,
  sectionTotal,
  prerequisites,
  onPrerequisiteClick,
}: CollapsibleLessonHeaderProps): ReactElement {
  const { t } = useTranslation();
  const tI = useMemo(
    () => t as unknown as (key: string, options?: Record<string, string | number>) => string,
    [t],
  );
  const reduceMotion = useReducedMotion();
  // Estado INTERNO do colapsável. "Voltar a colapsado ao trocar de aula" é
  // responsabilidade da view: ela remonta este componente com `key` da aula
  // (o useState reinicia no remount). O `defaultOpen` fica como ferramenta
  // de teste/estado inicial explícito.
  const [open, setOpen] = useState(defaultOpen);

  const toggleLabel = open
    ? t('translation:lesson.headerToggleCollapse')
    : t('translation:lesson.headerToggleExpand');
  // Sob redução de movimento o estado troca INSTANTÂNEO (SC 2.3.3): nada de
  // spring no rotate nem no corpo — o conteúdo continua 100% presente.
  const instant = reduceMotion ? { duration: 0 as const } : undefined;

  return (
    <Box component="header" sx={{ minWidth: 0 }}>
      {/* ─── BARRA COMPACTA (sempre visível) ─────────────────────────────── */}
      <Stack direction="row" useFlexGap spacing={1} sx={{ alignItems: 'center', minWidth: 0 }}>
        <Tooltip title={toggleLabel}>
          <IconButton
            onClick={() => setOpen(nextLessonHeaderOpen)}
            aria-expanded={open}
            aria-label={toggleLabel}
            size="small"
            sx={{ width: TOUCH_TARGET_PX, height: TOUCH_TARGET_PX, flexShrink: 0 }}
          >
            {/* Chevron que gira 180° conforme o estado: colapsado aponta para
                baixo (expande); expandido aponta para cima (recolhe). */}
            <motion.span
              animate={{ rotate: open ? CHEVRON_ROTATE.expanded : CHEVRON_ROTATE.collapsed }}
              transition={instant ?? springs.snappy}
              style={{ display: 'inline-flex' }}
            >
              <ExpandMoreIcon fontSize="small" />
            </motion.span>
          </IconButton>
        </Tooltip>

        {/* O TÍTULO na barra — só quando COLAPSADO (o corpo expandido traz o
            MESMO texto como h1; nunca há dois h1 nem título duplicado na
            tela). Uma linha, ellipsis, flexGrow — o título permanece LEGÍVEL
            (e com o nome acessível COMPLETO — o ellipsis é visual) durante a
            aula inteira. */}
        <AnimatePresence initial={false}>
          {!open ? (
            <motion.div
              key="bar-title"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={instant ?? springs.snappy}
              style={{ flexGrow: 1, minWidth: 0 }}
            >
              <Typography component="h1" variant="h6" noWrap sx={{ minWidth: 0 }}>
                {title}
              </Typography>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* Ações SEMPRE à mão (decisão registrada no cabeçalho do arquivo):
            fora do colapsável, para o fluxo estudar→desafio→fontes nunca
            depender de expandir o cabeçalho (nem o popover de Desafios de
            perder o anchor, nem os specs e2e de quebrarem). */}
        <Stack direction="row" useFlexGap spacing={1} sx={{ alignItems: 'center', flexShrink: 0 }}>
          {challengeCount > 0 ? (
            <Badge badgeContent={pendingChallengeCount} color="error">
              <Button
                size="small"
                variant="outlined"
                onClick={(e) => onChallengesClick(e.currentTarget)}
                aria-haspopup="true"
                aria-expanded={challengesExpanded}
                aria-label={tI('lesson.challengesButtonAria', { pending: pendingChallengeCount })}
                startIcon={<EmojiEventsIcon />}
              >
                {t('translation:lesson.challengesButton')}
              </Button>
            </Badge>
          ) : null}
          <Button
            size="small"
            variant="outlined"
            onClick={onSourcesClick}
            startIcon={<AutoStoriesIcon />}
            sx={{ color: 'text.primary', borderColor: 'nonText.neutral' }}
          >
            {t('translation:lesson.sourcesButton')}
          </Button>
        </Stack>
      </Stack>

      {/* ─── CORPO COLAPSÁVEL (título completo + resumo) ───────────────────
          Desmonta ao recolher (AnimatePresence): fora do DOM = fora do foco
          e do leitor de tela. A altura anima 0 ↔ auto com `overflow: hidden`
          — o spring é springs.window, o "entrada controlada, sem rebound
          agressivo" do contrato (uma mola com bounce faria o texto saltar
          ao fechar). O `pt` mora DENTRO do wrapper animado: margem no
          elemento animado criaria um buraco quando height = 0. */}
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="header-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={instant ?? springs.window}
            style={{ overflow: 'hidden' }}
          >
            <Box sx={{ pt: 1 }}>
              <Typography variant="h5" component="h1">
                {title}
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {summary}
              </Typography>
            </Box>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* ─── FORA do colapsável: progresso da teoria + contador ───────────
          Informação de ESTADO da aula, sempre visível e compacta (mesmo
          desenho de antes: `color="inherit"` — a barra não disputa o acento;
          o contador textual carrega a mesma informação, ONDA13). */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1, color: 'text.secondary' }}>
        <LinearProgress
          variant="determinate"
          color="inherit"
          value={theoryProgress}
          sx={{ flexGrow: 1, height: 6, borderRadius: 3 }}
          aria-label={tI('lesson.theoryProgress', { percent: theoryProgress })}
        />
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          {tI('lesson.theoryCount', { current: sectionCurrent, total: sectionTotal })}
        </Typography>
      </Box>

      {/* ─── FORA do colapsável: pré-requisitos (uma linha, sempre visível) */}
      {prerequisites.length > 0 ? (
        <Stack direction="row" useFlexGap spacing={1} sx={{ mt: 1, flexWrap: 'wrap' }}>
          <Typography variant="caption" sx={{ color: 'text.secondary', alignSelf: 'center' }}>
            {t('translation:lesson.prerequisitesLabel')}
          </Typography>
          {prerequisites.map((pre) => (
            <Chip
              key={pre.slug}
              size="small"
              variant="outlined"
              label={pre.title}
              onClick={() => onPrerequisiteClick(pre.slug)}
              onDelete={undefined}
            />
          ))}
        </Stack>
      ) : null}
    </Box>
  );
}
