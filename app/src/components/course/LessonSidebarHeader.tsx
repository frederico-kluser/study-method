/**
 * src/components/course/LessonSidebarHeader.tsx — o CABEÇALHO DA AULA,
 * redesenhado para a COLUNA do sidebar do shell (onda1-sidebar-slot).
 *
 * ─── O PEDIDO ───────────────────────────────────────────────────────────────
 * Sobre o sidebar estilo VSCode (SessionFrame), o dono, verbatim: *"a
 * informação dele nunca muda"*. O objetivo era levar para essa coluna o
 * conteúdo do cabeçalho de CADA AULA — que vivia dentro do `main`, no
 * CollapsibleLessonHeader. Este componente é esse conteúdo, redesenhado para
 * a coluna VERTICAL e ESTREITA: piso de 180px (o `minPanePx` de
 * SHELL_SPLIT_CONSTRAINTS), típica de 240px. A LessonView o publica no slot
 * do sidebar via `<ShellSidebarPortal>` (src/components/shell/ShellSidebarSlot);
 * a view continua DONA do estado — aqui só há apresentação e callbacks.
 *
 * ─── DE CIMA PARA BAIXO ─────────────────────────────────────────────────────
 *   · o TÍTULO da aula (o único h1), quebrando linha;
 *   · o RESUMO (body2, tinta secundária) — uma ou duas frases de contexto,
 *     não prosa longa (a regra 3 de designTokens.ts reserva prosa longa para
 *     os níveis 0 e 1; a tinta secundária é calibrada AA nos cinco níveis);
 *   · o PROGRESSO da teoria: barra + "Seção N de M" EMPILHADOS (lado a lado,
 *     como no cabeçalho antigo, a 180px a barra ficaria mais curta que o
 *     próprio contador);
 *   · as AÇÕES "Desafios" (badge de pendentes) e "Fontes", em linha que
 *     QUEBRA: lado a lado quando a coluna comporta, uma embaixo da outra
 *     quando não;
 *   · os PRÉ-REQUISITOS: rótulo em cima, chips embaixo, quebrando.
 *
 * ─── POR QUE NÃO HÁ TOGGLE DE COLAPSO (decisão registrada) ─────────────────
 * O colapso do CollapsibleLessonHeader existia para poupar ALTURA da coluna
 * do CHAT: o bloco fixo do cabeçalho comia ~150px da área de trabalho da aula.
 * No sidebar essa disputa acabou — o conteúdo mora em OUTRA coluna, que tem
 * altura própria e ROLA no eixo de bloco (`overflowY: 'auto'` do
 * SessionFrame). Um toggle aqui só esconderia informação sem devolver espaço
 * a ninguém. Por isso: tudo sempre montado, sem estado interno, sem
 * AnimatePresence e sem `defaultOpen` (a única prop do contrato antigo que
 * ficou para trás).
 *
 * ─── "QUEBRA, NUNCA RECORTA" (SC 1.4.12 — a política do sidebar) ──────────
 * A mesma regra do cabeçalho do SessionFrame: o título da barra colapsada
 * antiga usava `noWrap` — `overflow: hidden` + `text-overflow: ellipsis` +
 * `white-space: nowrap`, a causa nº 1 que a F104 nomeia. Na coluna estreita
 * isso recortaria quase todo título. Aqui título, resumo, contador e rótulos
 * — inclusive os dos botões "Desafios" e "Fontes" — QUEBRAM
 * (`whiteSpace: 'normal'` + `overflowWrap: 'anywhere'`, para nem um
 * identificador longo sem espaços estourar a coluna) e a coluna cresce em
 * altura. Os chips de pré-requisito também: o rótulo do MuiChip nasce com
 * nowrap + ellipsis e aqui vira o "chip multilinha" (altura auto, rótulo que
 * quebra) — com `textOverflow: 'clip'` e `overflow: 'visible'` explícitos,
 * para não sobrar nem o `text-overflow: ellipsis` computado que a varredura
 * do SC 1.4.12 reprova em QUALQUER elemento do sidebar.
 *
 * QUEM PROVA ISSO NO NAVEGADOR: tests/e2e/e2e-sidebar-aula-spacing.spec.ts —
 * abre uma aula de verdade, leva a divisória ao PISO de 180px, injeta os
 * quatro overrides do SC 1.4.12 e varre este `<section>` e o banner inteiro
 * (a metodologia do e2e-spacing, em tests/e2e/spacingScan.ts), nos dois
 * idiomas e também na altura mínima da janela (onde o sidebar rola). O
 * tests/e2e/e2e-spacing.spec.ts NÃO cobre este componente: ele roda na Home,
 * com o slot vazio.
 *
 * ─── FRONTEIRA DE NÍVEL (regra 3b de designTokens.ts) ──────────────────────
 * O sidebar é chrome NÍVEL 3: o texto é TINTA (`text.primary` /
 * `text.secondary`) — inclusive o RÓTULO dos botões. A variante `outlined` do
 * tema pinta o rótulo com `accentText`, que o contrato calibrou só para os
 * níveis 0, 1 e 2; aqui ele é reapontado para `text.primary`. O acento sobra
 * onde a regra deixa: BORDA e ÍCONE do "Desafios" (a ação de destaque, como
 * era no cabeçalho antigo) e PREENCHIMENTO do badge de pendentes. "Fontes"
 * segue neutro (borda `nonText.neutral`, o mesmo desenho do cabeçalho antigo —
 * quem identifica o botão é o rótulo em tinta, a borda só desenha a moldura).
 * A barra de progresso é `color="inherit"`: toma a tinta secundária do
 * contêiner e não disputa acento. Cores sempre por `theme.vars.palette.*`
 * (referência `var(--mui-palette-*)` que troca sozinha com o esquema).
 *
 * ─── ACESSIBILIDADE ─────────────────────────────────────────────────────────
 *   · a raiz é `<section aria-labelledby>` apontando para o h1 — NUNCA
 *     `<header>`: o slot mora DENTRO do AppBar, fora do `main`, e ali um
 *     `<header>` vira um SEGUNDO landmark banner e quebra os ~25
 *     `getByRole('banner')` dos e2e (strict mode do Playwright). A section com
 *     nome acessível vira uma região nomeada pelo título da aula;
 *   · UM h1 só (o título), com o texto COMPLETO;
 *   · os nomes acessíveis dos botões são OS MESMOS do cabeçalho antigo — os
 *     e2e acham "Fontes", "Desafios da aula (1 pendentes)" e o heading pelo
 *     título da aula;
 *   · "Desafios" declara `aria-haspopup` + `aria-expanded` refletindo o
 *     popover que a VIEW controla: o botão só avisa o clique entregando o
 *     próprio elemento (`onChallengesClick(e.currentTarget)`) para a view
 *     ancorar o popover nele — a âncora continua válida dentro do portal (o
 *     Popover posiciona pelo `getBoundingClientRect` do elemento, onde quer
 *     que ele esteja).
 *
 * Testado em tests/lessonSidebarHeader.test.ts (SSR da estrutura, CSS emitido
 * do título e i18n nos dois idiomas) e, no app rodando, no piso de largura sob
 * os overrides do SC 1.4.12, em tests/e2e/e2e-sidebar-aula-spacing.spec.ts.
 */
import { useId, useMemo, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import Badge from '@mui/material/Badge';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import LinearProgress from '@mui/material/LinearProgress';
import Typography from '@mui/material/Typography';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import AutoStoriesIcon from '@mui/icons-material/AutoStories';

export interface LessonSidebarHeaderProps {
  /** Título da aula (o h1 da coluna — quebra linha, nunca recorta). */
  title: string;
  /** Resumo da aula (body2, tinta secundária — sempre visível). */
  summary: string;
  /** lesson.challenges.length — botão "Desafios" só existe com desafios. */
  challengeCount: number;
  /** Pendentes (lastVerdict !== 'passed') — o Badge e o aria-label. */
  pendingChallengeCount: number;
  /** O popover de Desafios está aberto POR ESTE botão (a view computa; o
   *  popover em si continua na view). */
  challengesExpanded: boolean;
  /** Abre o popover de Desafios ancorado no botão (a view guarda o anchor). */
  onChallengesClick: (anchor: HTMLButtonElement) => void;
  /** Abre o diálogo de Fontes (a view guarda o estado). */
  onSourcesClick: () => void;
  /** 0–100 — preenchimento da barra de progresso da teoria. */
  theoryProgress: number;
  /** Seções apresentadas (contador "Seção N de M"). */
  sectionCurrent: number;
  /** Total de seções da teoria (contador "Seção N de M"). */
  sectionTotal: number;
  /** Aulas anteriores da trilha — chips clicáveis (só aparecem se houver). */
  prerequisites: ReadonlyArray<{ slug: string; title: string }>;
  /** Navega para a aula anterior (chip de pré-requisito). */
  onPrerequisiteClick: (slug: string) => void;
}

/**
 * O cabeçalho da aula na coluna do sidebar: título + resumo, progresso da
 * teoria, ações (Desafios/Fontes) e pré-requisitos — tudo sempre visível,
 * tudo quebrando linha. Contrato de props = o do CollapsibleLessonHeader menos
 * `defaultOpen` (não há colapso; ver o cabeçalho do arquivo).
 */
export function LessonSidebarHeader({
  title,
  summary,
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
}: LessonSidebarHeaderProps): ReactElement {
  const { t } = useTranslation();
  const tI = useMemo(
    () => t as unknown as (key: string, options?: Record<string, string | number>) => string,
    [t],
  );
  // Id do h1 para o `aria-labelledby` da section: `useId` é estável entre
  // servidor e cliente e único por instância (nada de id fixo que colidiria
  // se duas instâncias coexistissem durante uma troca de aula).
  const titleId = useId();

  return (
    <Box
      component="section"
      aria-labelledby={titleId}
      sx={(theme) => ({
        display: 'flex',
        flexDirection: 'column',
        gap: theme.spacing(1.5),
        minWidth: 0,
      })}
    >
      {/* ─── TÍTULO + RESUMO ─────────────────────────────────────────────
          O h1 é a variante h6 (18px, display 700 — o piso da escala de
          título): na coluna estreita um h5 quebraria em linhas demais. SEM
          noWrap/ellipsis/overflow: o título QUEBRA (SC 1.4.12). */}
      <Box sx={(theme) => ({ display: 'flex', flexDirection: 'column', gap: theme.spacing(0.5), minWidth: 0 })}>
        <Typography
          id={titleId}
          component="h1"
          variant="h6"
          sx={(theme) => ({
            minWidth: 0,
            color: theme.vars.palette.text.primary,
            whiteSpace: 'normal',
            overflowWrap: 'anywhere',
          })}
        >
          {title}
        </Typography>
        <Typography
          variant="body2"
          sx={(theme) => ({
            minWidth: 0,
            color: theme.vars.palette.text.secondary,
            whiteSpace: 'normal',
            overflowWrap: 'anywhere',
          })}
        >
          {summary}
        </Typography>
      </Box>

      {/* ─── PROGRESSO DA TEORIA ─────────────────────────────────────────
          Barra em cima, contador embaixo (empilhados — ver o cabeçalho do
          arquivo). `color="inherit"`: a barra toma a tinta secundária do
          contêiner, não disputa o acento; o contador textual carrega a mesma
          informação (ONDA13). O aria-label é o MESMO do cabeçalho antigo. */}
      <Box
        sx={(theme) => ({
          display: 'flex',
          flexDirection: 'column',
          gap: theme.spacing(0.5),
          minWidth: 0,
          color: theme.vars.palette.text.secondary,
        })}
      >
        <LinearProgress
          variant="determinate"
          color="inherit"
          value={theoryProgress}
          sx={{ height: 6, borderRadius: 3 }}
          aria-label={tI('lesson.theoryProgress', { percent: theoryProgress })}
        />
        <Typography
          variant="caption"
          sx={(theme) => ({
            color: theme.vars.palette.text.secondary,
            whiteSpace: 'normal',
            overflowWrap: 'anywhere',
          })}
        >
          {tI('lesson.theoryCount', { current: sectionCurrent, total: sectionTotal })}
        </Typography>
      </Box>

      {/* ─── AÇÕES ───────────────────────────────────────────────────────
          Linha que QUEBRA (flexWrap): a 240px os dois botões já não cabem
          lado a lado e empilham; numa coluna mais larga voltam a dividir a
          linha. Largura natural (sem esticar): a bolha do Badge fica colada
          ao rótulo "Desafios". O vão horizontal (1.5) é maior que a
          meia-bolha que o Badge projeta para fora do botão com um algarismo
          — a bolha não invade o "Fontes" ao lado.
          E cada botão CABE na coluna: nunca mais largo que ela, com o rótulo
          que QUEBRA (a mesma regra do título). Medido no
          tests/e2e/e2e-sidebar-aula-spacing.spec.ts, no piso de 180px sob os
          overrides do SC 1.4.12: em inglês o "Challenges" media 162,6px
          contra 155px de coluna — a raiz do MuiBadge nasce `flex-shrink: 0`,
          então o botão não encolhia, e a bolha do badge passava da borda do
          sidebar (`overflowX: 'hidden'`), recortada. `maxWidth: '100%'` no
          Badge o prende à linha; o rótulo quebra dentro dele, e a meia-bolha
          (10px) cai no padding de 12px da coluna. */}
      <Box
        sx={(theme) => ({
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          columnGap: theme.spacing(1.5),
          rowGap: theme.spacing(1),
          minWidth: 0,
        })}
      >
        {challengeCount > 0 ? (
          <Badge badgeContent={pendingChallengeCount} color="error" sx={{ maxWidth: '100%' }}>
            <Button
              size="small"
              variant="outlined"
              onClick={(e) => onChallengesClick(e.currentTarget)}
              aria-haspopup="true"
              aria-expanded={challengesExpanded}
              aria-label={tI('lesson.challengesButtonAria', { pending: pendingChallengeCount })}
              startIcon={<EmojiEventsIcon />}
              sx={(theme) => ({
                // Rótulo em TINTA (regra 3b); o acento fica na BORDA e no
                // ÍCONE — a ação de destaque continua reconhecível.
                color: theme.vars.palette.text.primary,
                borderColor: theme.vars.palette.primary.fill,
                '& .MuiButton-startIcon': {
                  color: theme.vars.palette.primary.fill,
                },
                // Quebra, nunca recorta (ver o bloco AÇÕES acima).
                whiteSpace: 'normal',
                overflowWrap: 'anywhere',
              })}
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
          sx={(theme) => ({
            color: theme.vars.palette.text.primary,
            borderColor: theme.vars.palette.nonText.neutral,
            whiteSpace: 'normal',
            overflowWrap: 'anywhere',
          })}
        >
          {t('translation:lesson.sourcesButton')}
        </Button>
      </Box>

      {/* ─── PRÉ-REQUISITOS (só se houver) ───────────────────────────────
          Rótulo em cima, chips embaixo — na coluna estreita o rótulo
          ("Não entendeu? Revisar:") já ocupa quase a largura toda. Chips
          MULTILINHA: altura auto e rótulo que quebra (ver o cabeçalho do
          arquivo — o default do MuiChip é nowrap + ellipsis). */}
      {prerequisites.length > 0 ? (
        <Box sx={(theme) => ({ display: 'flex', flexDirection: 'column', gap: theme.spacing(0.75), minWidth: 0 })}>
          <Typography
            variant="caption"
            sx={(theme) => ({
              color: theme.vars.palette.text.secondary,
              whiteSpace: 'normal',
              overflowWrap: 'anywhere',
            })}
          >
            {t('translation:lesson.prerequisitesLabel')}
          </Typography>
          <Box sx={(theme) => ({ display: 'flex', flexWrap: 'wrap', gap: theme.spacing(1), minWidth: 0 })}>
            {prerequisites.map((pre) => (
              <Chip
                key={pre.slug}
                size="small"
                variant="outlined"
                label={pre.title}
                onClick={() => onPrerequisiteClick(pre.slug)}
                sx={(theme) => ({
                  height: 'auto',
                  maxWidth: '100%',
                  '& .MuiChip-label': {
                    whiteSpace: 'normal',
                    overflowWrap: 'anywhere',
                    overflow: 'visible',
                    textOverflow: 'clip',
                    paddingBlock: theme.spacing(0.25),
                  },
                })}
              />
            ))}
          </Box>
        </Box>
      ) : null}
    </Box>
  );
}
