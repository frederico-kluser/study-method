/**
 * src/components/shell/NavigationRail.tsx — o rail de navegação à ESQUERDA.
 *
 * ─── POR QUE RAIL, E NÃO ABAS ──────────────────────────────────────────────
 * O `NavigationSuiteScaffold` do Material 3 * documenta o mapeamento: *"Navigation
 * bar if the width or height is compact… Navigation rail for everything else"*.
 * Com os breakpoints oficiais (compact < 600dp), uma janela Electron de desktop
 * é sempre "everything else" → rail. E a doc do componente prescreve *"three to
 * no more than seven app destinations"* — temos quatro (docs/ux-redesign.md
 * §7.2). ONDA-SEM-DESAFIO-NO-RAIL: o Desafio saiu do rail (pedido do dono —
 * "temos que tirar o botão de desafio do left bar"); o painel continua
 * acessível por Lesson/Roadmap via challengeNav, mas não tem tab aqui.
 *
 * ─── DECISÃO DE PROJETO: O RAIL É UM `<Tabs orientation="vertical">` ───────
 * Isto NÃO é economia de esforço — é o papel ARIA correto. Este app troca de
 * tela por `useState`, sem router: o conteúdo já vive num `role="tabpanel"`, e
 * um seletor de painel é exatamente o que `role="tablist"`/`role="tab"`
 * descreve. Uma `<List>` de botões seria acessibilidade PIOR (perderia o
 * vínculo `aria-controls`/`aria-labelledby` e a navegação por setas que o MUI
 * já implementa para `orientation="vertical"`, incluindo `aria-orientation`).
 * Efeito colateral bem-vindo: as 13 specs e2e que usam `getByRole('tab')`
 * continuam válidas sem uma linha de edição.
 *
 * ─── SUPERFÍCIE E FRONTEIRA DE NÍVEL ───────────────────────────────────────
 * O rail é CHROME: nível 3 da rampa tonal (`surface.level3`), com o item
 * selecionado no nível 4. A regra 3b de `designTokens.ts` vale aqui e não é
 * negociável: nos níveis 3 e 4 o texto é TINTA (`text.primary`/`text.secondary`)
 * — acento só entra como PREENCHIMENTO (o indicador), nunca como cor de rótulo.
 *
 * ─── MOVIMENTO (spec §5) ───────────────────────────────────────────────────
 * O indicador troca de item por `spatialTransition(['top','height'])` — é
 * geometria, então PODE ultrapassar: é o *pop* da troca de aba. O fundo e a cor
 * do item usam `effectsTransition`, que nunca ultrapassa. Misturar os dois é
 * exatamente o bug que faz rótulo cintilar.
 */
import type { ReactElement } from 'react';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Tooltip from '@mui/material/Tooltip';
import HomeRoundedIcon from '@mui/icons-material/HomeRounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import MenuBookRoundedIcon from '@mui/icons-material/MenuBookRounded';
import RouteRoundedIcon from '@mui/icons-material/RouteRounded';
import { useTranslation } from 'react-i18next';

import { SHAPE } from '../../lib/designTokens';
import { NAV_ITEMS, navIndexOf, navPanelId, navTabId, type NavKey, type PanelKey } from '../../lib/shellNav';
import { effectsTransition, FOCUS_RING, focusRingStyles, spatialTransition } from '../../theme';

/**
 * Largura do rail — ONDA-UX-RAIL-ICON (fixe da auditoria UX, achados 1-3).
 *
 * O rail é SÓ-ÍCONE (M3 *narrow* = 80px): os nomes dos destinos vivem no
 * `aria-label` de cada tab e no `<Tooltip placement="right">` (hover E foco de
 * teclado — o MUI mostra os dois por default), e a largura NUNCA depende do
 * rótulo. A versão anterior media a caixa contra o texto e PERDIA: 104px −
 * 2×6 de marginInline − 2×4 de paddingInline = 84px de caixa contra os
 * ≈88-92px de "Configurações" (13 glifos em caption 14px) — o rótulo partia-se
 * a meio da palavra ("Configuraç/ões") com `overflow-wrap: anywhere`. Com
 * ícone só, o comprimento do rótulo deixa de ser input de layout (cabe
 * qualquer idioma ou rótulo futuro tipo "Ajuda e tutorial") e o orçamento
 * horizontal do composer ganha folga: a pior coluna sobe de
 * (900 − 104 − 6) × 0.5 − 64 = 331 (folga de 8px) para
 * (900 − 80 − 6) × 0.5 − 64 = 343 (folga de 20px — ver
 * tests/composerMinWidth.test.ts, que tranca a conta).
 */
const RAIL_WIDTH = 80;

/** Altura mínima do alvo — generosa de propósito (ícone centrado, sem rótulo). */
const RAIL_ITEM_MIN_HEIGHT = 76;

/**
 * Folga entre o item e as bordas do scroller — **nos DOIS eixos**. NÃO é
 * estética: no modo `scrollableY` o `.MuiTabs-scroller` do MUI é
 * `overflow-y: auto` + `overflow-x: hidden` (Tabs.js:146-149), e AMBOS recortam.
 * `hidden` corta o que passa no eixo inline; `auto` corta no eixo de bloco tudo
 * que não está dentro da área rolável — o que atinge o PRIMEIRO e o ÚLTIMO item,
 * justamente onde o anel de foco não tem vizinho para lhe ceder espaço.
 *
 * `focusRingStyles` se estende `offset + width` além da caixa do item, e é DAÍ
 * que esta constante sai (+1px de respiro) em vez de ser um número solto: mexer
 * no anel em `src/theme.ts` move a folga junto, e a mesma folga vale no eixo de
 * bloco e no inline — a versão anterior usava metade dela no bloco (3px contra
 * os 5px do anel) e cortava ~2px do anel no topo e na base do rail.
 */
const RAIL_ITEM_GUTTER = FOCUS_RING.offset + FOCUS_RING.width + 1;

/** Espessura do indicador de seleção (preenchimento de acento — papel de 3:1). */
const INDICATOR_WIDTH = 4;

/**
 * Ícone por destino. Fica AQUI, e não em `src/lib/shellNav.ts`, porque
 * `shellNav` é módulo puro compilado pelo `tsconfig.node.json` (sem JSX e sem
 * DOM). O `Record` completo é a trava: um `NavKey` novo não compila sem ícone.
 * O painel Desafio (PanelKey) NÃO está aqui de propósito: sem tab no rail,
 * não há ícone a renderizar.
 *
 * Família ÚNICA `*Rounded` (chrome do shell — mesmo critério do seletor de
 * tema). ONDA-UX-RAIL-ICON (achado 6 da auditoria): Settings leva
 * `SettingsRoundedIcon` (engrenagem — a convenção quase universal de
 * definições), não `TuneRoundedIcon` (sliders lê-se "ajustes/filtro"): num
 * rail só-ícone o utilizador procura a engrenagem primeiro.
 */
const NAV_ICON: Record<NavKey, ReactElement> = {
  home: <HomeRoundedIcon />,
  settings: <SettingsRoundedIcon />,
  lesson: <MenuBookRoundedIcon />,
  roadmap: <RouteRoundedIcon />,
};

export interface NavigationRailProps {
  /**
   * Painel ativo. É um PanelKey (não NavKey) porque o painel Desafio — sem
   * tab no rail — também ativa o shell: com ele ativo, `navIndexOf` devolve -1
   * e NENHUMA tab fica selecionada (estado visual correto para um painel
   * "fantasma" alcançado por navegação programática).
   */
  active: PanelKey;
  /** Troca de destino (o shell guarda o estado). Só destinos do rail. */
  onChange: (key: NavKey) => void;
}

/** Rail de navegação vertical do shell. */
export default function NavigationRail({ active, onChange }: NavigationRailProps): ReactElement {
  const { t } = useTranslation();
  const activeIndex = navIndexOf(active);
  const panelId = navPanelId(active);

  return (
    <Tabs
      orientation="vertical"
      variant="scrollable"
      scrollButtons="auto"
      value={activeIndex}
      onChange={(_e, next: number | false) => {
        const item = typeof next === 'number' ? NAV_ITEMS[next] : undefined;
        if (item) onChange(item.key);
      }}
      // PRESERVADO da versão em abas horizontais: o tutorial ilumina este alvo
      // (onboardingTargets.ts / quickStartSteps.ts). O rail assume o papel.
      data-onboarding-target="nav-tabs"
      aria-label={t('translation:shell.rail.aria')}
      sx={(theme) => ({
        flexShrink: 0,
        width: RAIL_WIDTH,
        minWidth: RAIL_WIDTH,
        paddingBlock: theme.spacing(1),
        backgroundColor: theme.vars.palette.surface.level3,
        borderRight: `1px solid ${theme.vars.palette.divider}`,

        // O indicador é PREENCHIMENTO de acento sobre chrome — papel cujo piso
        // é 3:1, não 4,5:1 (por isso pode ser `fill`, e por isso o rótulo ao
        // lado continua sendo tinta).
        '& .MuiTabs-indicator': {
          left: 0,
          right: 'auto',
          width: INDICATOR_WIDTH,
          borderStartEndRadius: INDICATOR_WIDTH,
          borderEndEndRadius: INDICATOR_WIDTH,
          backgroundColor: theme.vars.palette.primary.fill,
          // GEOMETRIA → nível spatial (pode ultrapassar): é o *pop* da troca.
          transition: spatialTransition(theme, ['top', 'height'], 'fast'),
        },

        '& .MuiTab-root': {
          minHeight: RAIL_ITEM_MIN_HEIGHT,
          minWidth: 0,
          marginInline: `${RAIL_ITEM_GUTTER}px`,
          marginBlock: `${RAIL_ITEM_GUTTER}px`,
          paddingInline: theme.spacing(0.5),
          paddingBlock: theme.spacing(1),
          borderRadius: `${SHAPE.md}px`,
          // Fronteira de nível: no chrome o ícone do item é TINTA, nunca acento.
          color: theme.vars.palette.text.secondary,
          fontSize: theme.typography.caption.fontSize,
          lineHeight: 1.25,
          // ONDA-UX-RAIL-ICON: sem rótulo não há política de quebra — a antiga
          // `whiteSpace: 'normal'` + `overflowWrap: 'anywhere'` saiu JUNTO com o
          // rótulo (era ela que partia "Configuraç/ões" ao meio; o nome vive em
          // `aria-label` + Tooltip). Nada resta para quebrar nem para recortar
          // neste chrome (SC 1.4.12: quebra, nunca recorta — sem texto, sem
          // risco). O `overflow: hidden` do MuiTab (Tab.js, para conter o
          // ripple no raio) continua ali e fica.
          transition: [
            effectsTransition(theme, ['background-color', 'color'], 'fast'),
            spatialTransition(theme, ['transform'], 'fast'),
          ].join(', '),

          '&:hover': {
            backgroundColor: theme.vars.palette.action.hover,
          },
          '&.Mui-selected': {
            color: theme.vars.palette.text.primary,
            backgroundColor: theme.vars.palette.surface.level4,
          },
          // Resposta ao toque: geometria, não cor (spec §8.1).
          '&:active': {
            transform: 'scale(0.97)',
          },
          // Anel de foco GRANDE e igual ao do resto do app — duas cores, para
          // valer também sobre os níveis 3/4 onde `nonText.focus` sozinho não
          // alcança 3:1 (ver o cabeçalho de FOCUS_RING em src/theme.ts).
          '&.Mui-focusVisible': focusRingStyles(theme),
          '&:focus-visible': focusRingStyles(theme),
        },

        '& .MuiTab-icon': {
          // ONDA-UX-RAIL-ICON: sem rótulo por baixo do ícone, o margin-bottom
          // do wrapper cai para 0 (o MUI só aplica os 6px do iconPosition="top"
          // com label) — o glifo de 24px fica opticamente centrado no item de
          // 76px de altura.
          marginBottom: 0,
        },

        // SC 2.3.3: sem movimento, o rail continua inteiramente funcional —
        // o indicador salta para o lugar e o item não afunda.
        '@media (prefers-reduced-motion: reduce)': {
          '& .MuiTabs-indicator': { transition: 'none' },
          '& .MuiTab-root:active': { transform: 'none' },
        },
      })}
    >
      {NAV_ITEMS.map((item, i) => (
        // Nome do destino: Tooltip para a VISTA (hover e foco de teclado) e
        // `aria-label` para o NOME ACESSÍVEL — este último nunca depende do
        // Tooltip (que pode não abrir): as specs e2e continuam a resolver as
        // tabs por `getByRole('tab', { name })`. ONDA-UX-RAIL-ICON (achado 4).
        <Tooltip key={item.key} title={t(item.i18nKey)} placement="right">
          <Tab
            id={navTabId(item.key)}
            // O vínculo aponta para o painel VIVO (só a view ativa é montada).
            aria-controls={item.key === active ? panelId : undefined}
            aria-label={t(item.i18nKey)}
            icon={NAV_ICON[item.key]}
            iconPosition="top"
            value={i}
          />
        </Tooltip>
      ))}
    </Tabs>
  );
}
