/**
 * src/lib/layoutSx.ts — os `sx` de layout que estavam copiados pela base,
 * uma vez só (auditoria de layout §1, §3, §4, §8, §10).
 *
 * SÃO OBJETOS DE ESTILO, nunca JSX: este módulo existe para que uma VIEW
 * componha o seu `sx` sem importar componente nenhum (e para que duas stories
 * nunca copiem o mesmo bloco). PURO: sem React, sem DOM, sem MUI — `src/lib`
 * é compilado pelo tsconfig.node.json (lib ES2022 sem DOM) e é daqui que os
 * testes `node:test` leem (`tests/layoutSx.test.ts`).
 *
 * Regra de escrita herdada de `a11yStyles.ts`: medidas absolutas em px são
 * STRING (`'12px'`), unidades do tema são NÚMERO (`px: 3` = 24px via
 * `theme.spacing`). Número num campo de px absoluto passaria pelo transform do
 * `sx` — ver o bug do sr-only, documentado em `lib/a11yStyles.ts`.
 *
 * Cada export diz, no comentário, QUANTAS cópias aposenta e de onde vêm os
 * valores — nenhum número aqui é novo; todos são extraídos dos usos reais.
 */
import { TARGET } from './designTokens';

/* ─── Alvo de toque (§1) ─────────────────────────────────────────────────── */

/**
 * `minHeight` do piso de toque — o composto `minHeight: TOUCH_TARGET_PX` que
 * estava copiado 17 vezes. É o default de todo botão/controle apontável.
 */
export const touchTargetSx = {
  minHeight: TARGET.minTouchTargetPx,
} as const;

/**
 * Caixa quadrada do piso de toque (`width`+`height`) — 7 cópias: botões de
 * ícone, "×" de fechar, divisórias pequenas.
 */
export const touchTargetBoxSx = {
  width: TARGET.minTouchTargetPx,
  height: TARGET.minTouchTargetPx,
} as const;

/**
 * Botão de ação em linha (o `sx` do botão dentro da casca `Pressable`) —
 * 5 cópias do bloco `whiteSpace: 'nowrap', minHeight, px: 3` + as variantes
 * `minHeight: 44` soltas. Rótulo nunca trunca; quebra quando é multilinha por
 * opção do chamador (aí usar `wrappingActionSx`).
 */
export const actionButtonSx = {
  whiteSpace: 'nowrap',
  minHeight: TARGET.minTouchTargetPx,
  px: 3,
} as const;

/**
 * Ação cujo rótulo PODE quebrar linha (longo/multilinha) — 6 cópias do
 * composto `minHeight, whiteSpace: 'normal', overflowWrap: 'break-word'`.
 * `break-word` e não `anywhere`: quebra em limites de palavra e só parte uma
 * quando não cabe de todo (política da casa: quebra, nunca recorta).
 */
export const wrappingActionSx = {
  minHeight: TARGET.minTouchTargetPx,
  whiteSpace: 'normal',
  overflowWrap: 'break-word',
} as const;

/**
 * Ação com quebra AGRESSIVA (`anywhere`) — 4 cópias do composto
 * `minHeight: 44, whiteSpace: 'normal', overflowWrap: 'anywhere'`: rótulos que
 * são identificadores/paths sem espaço, onde partir a meio do token é melhor
 * do que estourar o contentor.
 */
export const wrappingActionAnywhereSx = {
  minHeight: TARGET.minTouchTargetPx,
  whiteSpace: 'normal',
  overflowWrap: 'anywhere',
} as const;

/* ─── Alerta com detalhe (§3) ────────────────────────────────────────────── */

/** Frase principal do `Alert` (span `body2`) — o `display: 'block'` do par. */
export const alertMessageSx = {
  display: 'block',
} as const;

/**
 * Legenda de detalhe do `Alert` (span `caption`) — 4 cópias idênticas de
 * `display: 'block', opacity: 0.85` (SetupView, LocalAiPanel ×2, ProgressPanel).
 */
export const alertDetailSx = {
  display: 'block',
  opacity: 0.85,
} as const;

/* ─── Coluna centrada e secções (§4, §8) ─────────────────────────────────── */

/**
 * O molde "coluna centrada" `p: 2, maxWidth: N, mx: 'auto'` — 13 blocos com o
 * literal escrito à mão (12 deles em `640`). `topPad` cobre as variantes com
 * respiro extra no topo (`pt: 4` do bloco de erro, `pt: 6` do estado vazio).
 * A largura vem SEMPRE de `LAYOUT.*` (designTokens.ts).
 */
export function centeredColumnSx(maxWidth: number, topPad?: number): {
  p: number;
  maxWidth: number;
  mx: string;
  pt?: number;
} {
  return topPad === undefined
    ? { p: 2, maxWidth, mx: 'auto' }
    : { p: 2, maxWidth, mx: 'auto', pt: topPad };
}

/**
 * Descrição de secção/painel (`body2` secundária) — 5 cópias idênticas de
 * `color: 'text.secondary', mb: 1.5` (SettingsView ×3, ProgressPanel,
 * OrphanTracksPanel).
 */
export const sectionDescriptionSx = {
  color: 'text.secondary',
  mb: 1.5,
} as const;

/* ─── Cartão de lista (§10) ──────────────────────────────────────────────── */

/**
 * Padding canónico do `CardContent` de lista — 3 cópias idênticas de
 * `p: 1.5, '&:last-child': { pb: 1.5 }` (placeholders, RoadmapView,
 * OrphanTracksPanel). O `&:last-child` anula o respiro extra que o MUI põe no
 * último filho para conteúdo de diálogo — num cartão de lista ele é ruído.
 */
export const infoCardPaddingSx = {
  p: 1.5,
  '&:last-child': { pb: 1.5 },
} as const;

/**
 * Título de cartão de lista (`subtitle1` semibold) — o `fontWeight: 600` que
 * estava copiado 16 vezes em 13 ficheiros. Junto do wrap por limite de palavra
 * (quebra, nunca recorta).
 */
export const infoCardTitleSx = {
  fontWeight: 600,
  overflowWrap: 'break-word',
} as const;
