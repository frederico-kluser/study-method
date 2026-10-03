/**
 * src/lib/a11yStyles.ts — o estilo "só para leitores de tela", UMA VEZ.
 *
 * ─── O BUG QUE ESTE ARQUIVO APOSENTA (auditoria de layout §5) ──────────────
 * Havia CINCO implementações de sr-only na base, em quatro grafias — e QUATRO
 * delas estavam erradas:
 *
 *   width: 1, height: 1, m: -1   (EditorTabs, SplitDivider, RoadmapView, …)
 *
 * Aplicado via `sx`, `width: 1`/`height: 1` passam pelo `sizingTransform` do
 * `@mui/system` (`value <= 1 && value !== 0` → `${value * 100}%`), ou seja a
 * caixa "invisível" nascia 100% × 100% do contentor; e `m: -1` virava
 * `theme.spacing(-1)` = -8px, não -1px. O comentário do `GamesView` documenta
 * exatamente este bug (a régua F104 acusou texto-sobre-texto) — mas o fix só
 * tinha sido aplicado numa das cinco cópias.
 *
 * A regra de escrita é: medidas de sr-only são SEMPRE string de px (`'1px'`,
 * `'-1px'`), nunca número — número em `sx` é unidade do tema, e este estilo
 * precisa de px absolutos. `pointerEvents: 'none'` está incluído de propósito:
 * a caixa é fantasma e não pode roubar cliques do que está por baixo.
 *
 * PURO: sem React, sem DOM (`src/lib` é compilado pelo tsconfig.node.json, lib
 * ES2022 sem DOM). A prova de que o estilo EMITIDO resulta mesmo em sr-only —
 * `renderToStaticMarkup` + extração das regras do emotion — vive em
 * `tests/a11yStyles.test.ts`.
 */

/**
 * O sr-only canónico. Uso: `sx={SR_ONLY_SX}` num `<Box component="span">`
 * (ou equivalente) que carregue texto para `aria-describedby`/leitor de tela.
 */
export const SR_ONLY_SX = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
  pointerEvents: 'none',
} as const;
