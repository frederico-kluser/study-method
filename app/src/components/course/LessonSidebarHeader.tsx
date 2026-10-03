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
 *   · o CURSO em curso (sobretítulo caption, tinta secundária) — o nome da
 *     trilha, pedido do dono "o left sidebar deve dizer qual é o curso que
 *     estamos fazendo" (ONDA-CURSO-NO-SIDEBAR; some só se vier vazio);
 *   · o TÍTULO da aula (o único h1), quebrando linha;
 *   · o RESUMO (body2, tinta secundária) — uma ou duas frases de contexto,
 *     não prosa longa (a regra 3 de designTokens.ts reserva prosa longa para
 *     os níveis 0 e 1; a tinta secundária é calibrada AA nos cinco níveis);
 *   · o PROGRESSO da teoria: barra + contador "{{current}} de {{total}} seções"
 *     EMPILHADOS (lado a lado, como no cabeçalho antigo, a 180px a barra
 *     ficaria mais curta que o próprio contador). O contador é CONTAGEM, não
 *     posição ordinal (finding-1 da auditoria 2-aula): "Seção 0 de 3" lia
 *     como uma seção zero fantasma e "3 de 3" prometia conclusão com quiz e
 *     desafio ainda por fazer;
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
 * (`whiteSpace: 'normal'` + `overflowWrap`, para nem um
 * identificador longo sem espaços estourar a coluna) e a coluna cresce em
 * altura. Os chips de pré-requisito também: o rótulo do MuiChip nasce com
 * nowrap + ellipsis e aqui vira o "chip multilinha" (altura auto, rótulo que
 * quebra) — com `textOverflow: 'clip'` e `overflow: 'visible'` explícitos,
 * para não sobrar nem o `text-overflow: ellipsis` computado que a varredura
 * do SC 1.4.12 reprova em QUALQUER elemento do sidebar.
 *
 * ONDA-UX-AUDIT-2-AULA (finding-5): nos RÓTULOS de botão e chip a quebra é
 * `overflow-wrap: break-word`, NÃO `anywhere`. O `anywhere` comprime a
 * largura min-content a ~1 glifo e o flexbox esmagava a caixa
 * ("Challe/nges"); `break-word` só quebra quando a palavra não cabe de
 * todo e o `minWidth: 0` mantém a garantia de não-transbordo que o
 * `anywhere` comprava (o botão continua a poder encolher até o
 * `maxWidth: '100%'` do Badge). `anywhere` continua onde é legítimo:
 * título, resumo, curso e contador (identificadores longos sem espaços).
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
 * era no cabeçalho antigo) e PREENCHIMENTO do badge de pendentes —
 * `primary.fill`, NÃO o vermelho de `error` (finding-6: "N pendentes" é
 * to-do neutro, não falha; e a fileira não pode carregar dois acentos). É a
 * REGRA DE TINTA ÚNICA por nível de ação: uma ação destacada por fileira
 * (Desafios: borda + ícone + badge no acento; Fontes: tudo em tinta neutra
 * com borda `nonText.neutral`, o mesmo desenho do cabeçalho antigo — quem
 * identifica o botão é o rótulo em tinta, a borda só desenha a moldura).
 *
 * ONDA-UX-AUDIT-2-AULA (finding-3): ícones são glifos FUNCIONAIS do MUI,
 * nunca emoji nem metáfora de gamificação. O troféu (`EmojiEvents`) foi o
 * 🏆 da interface e saiu; "Desafios" é `AssignmentOutlined` (checklist) e
 * "Fontes" é `MenuBook`. `AutoStories` fica EXCLUSIVO da persona Tutor
 * (chatSurfaces.tsx) — um glifo, um significado. Política registada em
 * designTokens.ts.
 *
 * ONDA-UX-AUDIT-2-AULA (finding-2): a barra de progresso é o ÚNICO elemento
 * dinâmico do painel e por isso é ela que leva o acento — `primary.fill` no
 * preenchimento, `nonText.neutral` no trilho (antes `color="inherit"`, que a
 * 0% lia como uma régua divisória e não como barra). Geometria de pílula de
 * 6px mantida. [medido] em chrome nível 3 (surface.level3 do sidebar):
 *   · preenchimento × contêiner = 3,58:1 (claro) · 3,31:1 (escuro) — piso de
 *     3:1 do SC 1.4.11 cumprido nos dois esquemas;
 *   · trilho × contêiner = 2,65:1 (claro) · 3,70:1 (escuro) — o claro fica
 *     abaixo de 3:1 POR CAMADA (o NONTEXT_* só alcança 3:1 nos níveis 0/1,
 *     fronteira 3b do contrato), e está correto assim: a barra é
 *     suplementar, o estado está codificado três vezes (barra + contador
 *     textual + aria-label), então o SC 1.4.11 isenta o objeto gráfico;
 *   · preenchimento × trilho = 1,35:1 (claro) · 1,12:1 (escuro) — fronteira
 *     fraca, coberta pela mesma redundância.
 * Cores sempre por `theme.vars.palette.*` (referência `var(--mui-palette-*)`
 * que troca sozinha com o esquema).
 *
 * ─── ACESSIBILIDADE ─────────────────────────────────────────────────────────
 *   · a raiz é `<section aria-labelledby>` apontando para o h1 — NUNCA
 *     `<header>`: o slot mora DENTRO do AppBar, fora do `main`, e ali um
 *     `<header>` vira um SEGUNDO landmark banner e quebra os ~25
 *     `getByRole('banner')` dos e2e (strict mode do Playwright). A section com
 *     nome acessível vira uma região nomeada pelo título da aula;
 *   · UM h1 só (o título), com o texto COMPLETO;
 *   · os nomes acessíveis dos botões são OS MESMOS do cabeçalho antigo — os
 *     e2e acham "Fontes", "Desafios da aula (1 pendente)" (plural CORRETO:
 *     finding-10a, `_one`/`_other` na i18n) e o heading pelo
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
// ONDA-UX-AUDIT-2-AULA (finding-3): glifos funcionais, sem metáfora de
// emoji/gamificação. `AssignmentOutlined` (checklist) para "Desafios",
// `MenuBook` para "Fontes" e `HistoryEdu` como marca de NAVEGAÇÃO dos chips
// de pré-requisito (finding-9: o chip é clicável e precisa de afordância).
// `AutoStories` ficou reservado à persona Tutor (chatSurfaces.tsx).
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import HistoryEduIcon from '@mui/icons-material/HistoryEdu';
import MenuBookIcon from '@mui/icons-material/MenuBook';

/**
 * Alvo de toque mínimo (px) — o piso de 44 que o design system cobra para
 * qualquer controle apontável (mesma receita do LessonView/TrackChallengePanel).
 * Os botões de ação vêm em `size="small"` para não competir com o título na
 * coluna estreita: a CAIXA cresce até o piso, o glifo e o rótulo continuam.
 */
const TOUCH_TARGET_PX = 44;

export interface LessonSidebarHeaderProps {
  /** Título da aula (o h1 da coluna — quebra linha, nunca recorta). */
  title: string;
  /**
   * ONDA-CURSO-NO-SIDEBAR (pedido do dono, verbatim: *"quando estou na aula o
   * left sidebar deve dizer qual é o curso que estamos fazendo"*): o NOME DO
   * CURSO (a trilha) em que a aula está — `lesson.trackTitle`, que o main
   * preenche com o título da trilha. É a linha de SOBRETÍTULO acima do h1: sem
   * ela o sidebar só dizia a AULA, e nada identificava o curso (duas trilhas
   * podiam ter aulas com o mesmo nome). Vazio/ausente → a linha não renderiza
   * (chamadores e fixtures antigos sem o dado não ganham um "Curso:" vazio).
   */
  courseTitle?: string;
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
  /** Seções apresentadas (contador "{{current}} de {{total}} seções" —
   *  CONTAGEM apresentada, não posição ordinal; ver finding-1 no cabeçalho). */
  sectionCurrent: number;
  /** Total de seções da teoria (contador "{{current}} de {{total}} seções"). */
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
  courseTitle,
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
      {/* ─── CURSO + TÍTULO + RESUMO ────────────────────────────────────
          ONDA-CURSO-NO-SIDEBAR: o SOBRETÍTULO do curso vem ANTES do h1 — a
          hierarquia é curso → aula → resumo (do mais geral ao mais específico,
          regra de proximidade: os três são um bloco). O h1 continua sendo a
          variante h6 (18px, display 700 — o piso da escala de título): na
          coluna estreita um h5 quebraria em linhas demais. SEM noWrap/ellipsis/
          overflow em nenhum dos três: QUEBRAM (SC 1.4.12).

          ONDA-UX-AUDIT-2-AULA (finding-7): a linha do curso sobe de
          `caption` para `body2` + peso 600 (tinta secundária mantida) — é a
          âncora de ORIENTAÇÃO do painel (pedido do dono) e estava
          tipograficamente igualada ao resto do meta. O separador virou
          ponto médio ("Curso · {{course}}"): o dois-pontos colidia com os
          dois-pontos do próprio título da trilha ("Curso: C Iniciante: do
          primeiro printf…"). */}
      <Box sx={(theme) => ({ display: 'flex', flexDirection: 'column', gap: theme.spacing(0.5), minWidth: 0 })}>
        {(courseTitle ?? '').trim().length > 0 ? (
          <Typography
            variant="body2"
            sx={(theme) => ({
              minWidth: 0,
              fontWeight: 600,
              color: theme.vars.palette.text.secondary,
              whiteSpace: 'normal',
              overflowWrap: 'anywhere',
            })}
          >
            {tI('lesson.courseLabel', { course: courseTitle })}
          </Typography>
        ) : null}
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
          arquivo). ONDA-UX-AUDIT-2-AULA (finding-2): o preenchimento é
          `primary.fill` e o trilho `nonText.neutral` — a barra é o único
          elemento dinâmico do painel e leva o acento; a 0% o trilho desenhado
          lê como barra, não como régua. Medições e a isenção do SC 1.4.11
          estão no bloco FRONTEIRA DE NÍVEL do cabeçalho do arquivo. O
          contador textual (agora "N de M seções", finding-1) e o aria-label
          carregam a MESMA informação (ONDA13). O aria-label é o MESMO do
          cabeçalho antigo. */}
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
          value={theoryProgress}
          sx={(theme) => ({
            height: 6,
            borderRadius: 3,
            backgroundColor: theme.vars.palette.nonText.neutral,
            '& .MuiLinearProgress-bar': {
              backgroundColor: theme.vars.palette.primary.fill,
            },
          })}
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
          // Badge em `primary.fill` + `onFill` (o par já medido do contrato:
          // 4,70:1 claro · 5,42:1 escuro). ONDA-UX-AUDIT-2-AULA (finding-6):
          // era `color="error"` — vermelho significa FALHA neste design system
          // e "N pendentes" é to-do neutro; com ele a fileira levava dois
          // acentos (azul + vermelho). A regra 3b quer o acento como
          // PREENCHIMENTO da bolha, nunca como tinta de rótulo.
          <Badge badgeContent={pendingChallengeCount} color="primary" sx={{ maxWidth: '100%' }}>
            <Button
              size="small"
              variant="outlined"
              onClick={(e) => onChallengesClick(e.currentTarget)}
              aria-haspopup="true"
              aria-expanded={challengesExpanded}
              // finding-10a: plural correto do pt-BR ("(1 pendente)" vs
              // "(N pendentes)"). A escolha é por CHAVE explícita, não pelo
              // `count` do i18next: as regras CLDR do pt levam 0 para "one"
              // ("0 pendente") e o contrato do app é "0 pendentes" — só o 1
              // exato é singular. `_one`/`_other` existem nos DOIS locales
              // (paridade de chaves); a base fica para fallback e para os
              // testes que interpolam o dicionário.
              aria-label={tI(
                pendingChallengeCount === 1
                  ? 'lesson.challengesButtonAria_one'
                  : 'lesson.challengesButtonAria_other',
                { pending: pendingChallengeCount },
              )}
              startIcon={<AssignmentOutlinedIcon />}
              sx={(theme) => ({
                // Rótulo em TINTA (regra 3b); o acento fica na BORDA e no
                // ÍCONE — a ação de destaque continua reconhecível (a regra
                // da tinta única por nível de ação: só ESTE botão leva acento).
                color: theme.vars.palette.text.primary,
                borderColor: theme.vars.palette.primary.fill,
                '& .MuiButton-startIcon': {
                  color: theme.vars.palette.primary.fill,
                },
                // Quebra, nunca recorta (ver o bloco AÇÕES acima):
                // `break-word` + `minWidth: 0` (finding-5) — nada de
                // ellipsis, nada de quebra a meio da palavra por preguiça.
                whiteSpace: 'normal',
                overflowWrap: 'break-word',
                minWidth: 0,
                // Piso de alvo de toque (TOUCH_TARGET_PX).
                minHeight: TOUCH_TARGET_PX,
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
          startIcon={<MenuBookIcon />}
          sx={(theme) => ({
            color: theme.vars.palette.text.primary,
            borderColor: theme.vars.palette.nonText.neutral,
            // Quebra, nunca recorta: `break-word` + `minWidth: 0` (finding-5).
            whiteSpace: 'normal',
            overflowWrap: 'break-word',
            minWidth: 0,
            // Piso de alvo de toque (TOUCH_TARGET_PX).
            minHeight: TOUCH_TARGET_PX,
          })}
        >
          {t('translation:lesson.sourcesButton')}
        </Button>
      </Box>

      {/* ─── PRÉ-REQUISITOS (só se houver) ───────────────────────────────
          Rótulo em cima, chips embaixo — na coluna estreita o rótulo
          ("Não entendeu? Revisar:") já ocupa quase a largura toda. Chips
          MULTILINHA: altura auto e rótulo que quebra (ver o cabeçalho do
          arquivo — o default do MuiChip é nowrap + ellipsis).

          ONDA-UX-AUDIT-2-AULA (finding-8): `marginTop` extra empurra o
          bloco para 20px do bloco anterior (12px do gap raiz + 8px): os
          pré-requisitos são navegação PARA FORA da aula e não podiam ficar
          à mesma distância das ações da própria aula (lei da proximidade).

          ONDA-UX-AUDIT-2-AULA (finding-9): o chip é CLICÁVEL (navega para a
          aula anterior) e lia como etiqueta estática. Afordância nova: glifo
          de navegação `HistoryEdu` à esquerda + preenchimento no hover. O
          hover usa `surface.level4` (o nível do contrato para "hover forte"),
          NÃO `nonText.neutral` como pedia a auditoria: medido, a tinta do
          rótulo sobre o `nonText.neutral` dá 4,83:1 no claro mas só 2,99:1 no
          escuro (reprovado no piso AA de 4,5:1); sobre `surface.level4` são
          12,01:1 (claro) e 9,50:1 (escuro), pares já medidos em
          designTokens.ts. Regra da casa: AA medido, documentado. */}
      {prerequisites.length > 0 ? (
        <Box
          sx={(theme) => ({
            display: 'flex',
            flexDirection: 'column',
            gap: theme.spacing(0.75),
            minWidth: 0,
            marginTop: theme.spacing(1),
          })}
        >
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
                icon={<HistoryEduIcon />}
                label={pre.title}
                onClick={() => onPrerequisiteClick(pre.slug)}
                sx={(theme) => ({
                  height: 'auto',
                  // W10 (auditoria de UX — Fitts): chip CLICÁVEL com o piso de
                  // alvo de toque da casa (TOUCH_TARGET_PX). `height: 'auto'`
                  // deixa o rótulo quebrar; o `minHeight` garante que mesmo o
                  // chip de uma linha cumpre o piso (min-height vence height).
                  minHeight: TOUCH_TARGET_PX,
                  maxWidth: '100%',
                  // Afordância de navegação no hover (finding-9) — ver o
                  // comentário do bloco para as medições de contraste.
                  '&:hover': {
                    backgroundColor: theme.vars.palette.surface.level4,
                  },
                  '& .MuiChip-label': {
                    whiteSpace: 'normal',
                    // Quebra, nunca recorta: `break-word` (finding-5) — só
                    // quebra quando a palavra não cabe de todo; ellipsis
                    // continua proibido (SC 1.4.12).
                    overflowWrap: 'break-word',
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
