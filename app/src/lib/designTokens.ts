/**
 * src/lib/designTokens.ts — CONTRATO CONGELADO do redesign "Cartucho".
 *
 * Este módulo é a ÚNICA fonte de verdade dos valores do design system. Ele não
 * importa nada do MUI e não cria tema: é só dado, para que o tema (src/theme.ts),
 * a paleta de código (src/lib/codeTheme.ts), o CSS de bootstrap (src/index.css)
 * e os testes de contraste leiam EXATAMENTE os mesmos números.
 *
 * A origem de cada valor está em `docs/ux-redesign.md`, e os scripts em
 * `docs/ux-redesign/` reproduzem os cálculos:
 *   - contraste WCAG 2.x: (L1 + 0.05) / (L2 + 0.05), sem arredondar para cima;
 *   - motion: portado das molas do M3 Expressive (massa unitária, ω0 = √k).
 *
 * REGRAS QUE ESTE ARQUIVO EXISTE PARA IMPOR:
 *   1. Ninguém inventa hex. Se um valor não está aqui, ele não entra no produto.
 *   2. `spatial` só anima transform/geometria; `effects` só cor/opacidade.
 *      Aplicar `spatial` a `color`/`background-color`/`opacity` é bug.
 *   3. Prosa longa e código só nas superfícies de nível 0 e 1 — do nível 3 em
 *      diante o texto secundário deixa de alcançar 7:1 (AAA).
 *   4. Nenhuma cor que participe de animação pode ter R/(R+G+B) >= 0.8 — esse é
 *      o limiar de "red flash" do WCAG 2.2 SC 2.3.1 (o vermelho #E60012 da
 *      Nintendo dá 0,927 e por isso NÃO é usado).
 */

/* ─── Superfícies: rampa tonal por esquema (elevação por cor, não por sombra) ─
 * Hex EXPLÍCITO por esquema de propósito: a geração de superfícies tonais via
 * color-mix() derivado das variáveis do MUI v9 foi verificada e REFUTADA, então
 * não há matemática de cor em runtime nesta base.
 * Nível 0 = fundo do app · 1 = cartão/superfície de leitura · 2 = painel
 * afundado/well de código · 3 = chrome elevado (rail, dock, menu) · 4 = estado
 * selecionado/hover forte.
 */
export const SURFACE_LIGHT = {
  level0: '#faf7f2',
  level1: '#ffffff',
  level2: '#f3eee5',
  level3: '#e9e2d6',
  level4: '#ddd5c6',
} as const;

export const SURFACE_DARK = {
  level0: '#12141a',
  level1: '#1b1e26',
  level2: '#232733',
  level3: '#2c313f',
  level4: '#363c4c',
} as const;

/** Superfície de leitura permitida (níveis onde a tinta alcança 7:1 — AAA). */
export const READING_SURFACE_LEVELS = [0, 1] as const;

/* ─── Tinta ────────────────────────────────────────────────────────────────
 * light #191713 sobre nível 0 = 16,75:1 · sobre nível 1 = 17,90:1
 * light #544e45 sobre nível 0 =  7,70:1 · sobre nível 1 =  8,23:1
 * dark  #eceef4 sobre nível 0 = 15,87:1 · sobre nível 1 = 14,36:1
 * dark  #a7adbd sobre nível 0 =  8,20:1 · sobre nível 1 =  7,42:1
 */
export const INK_LIGHT = {
  primary: '#191713',
  secondary: '#544e45',
} as const;

export const INK_DARK = {
  primary: '#eceef4',
  secondary: '#a7adbd',
} as const;

/* ─── Acentos ──────────────────────────────────────────────────────────────
 * Cada família tem DOIS valores por esquema, porque acento-como-texto e
 * acento-como-preenchimento são requisitos diferentes. Usar o `fill` como cor
 * de link é o erro clássico que reprova AA.
 *   `text` = >= 4,5:1 contra a superfície de nível 0 do esquema
 *   `fill` = fundo de botão cujo `onFill` alcança >= 4,5:1
 */
export interface AccentPair {
  /** Acento legível como TEXTO sobre a superfície de nível 0. */
  readonly text: string;
  /** Acento como PREENCHIMENTO de botão/chip. */
  readonly fill: string;
  /** Tinta que vai EM CIMA do `fill`. */
  readonly onFill: string;
}

export type AccentFamily = 'action' | 'success' | 'info' | 'warn' | 'study';

/** light: `fill` + texto branco. action 4,53 · success 4,57 · info 4,60 · warn 4,52 · study 4,54 */
export const ACCENT_LIGHT: Readonly<Record<AccentFamily, AccentPair>> = {
  action: { text: '#d5331a', fill: '#de351b', onFill: '#ffffff' },
  success: { text: '#1e804f', fill: '#1f8653', onFill: '#ffffff' },
  info: { text: '#0d79a0', fill: '#0e7ea7', onFill: '#ffffff' },
  warn: { text: '#9d6607', fill: '#a46a07', onFill: '#ffffff' },
  study: { text: '#964dd5', fill: '#9a54d7', onFill: '#ffffff' },
} as const;

/** dark: preenchimento VIVO com tinta quase-preta — branco sobre #e73f25 cairia a 4,09:1. */
export const ACCENT_DARK: Readonly<Record<AccentFamily, AccentPair>> = {
  action: { text: '#e73f25', fill: '#e73f25', onFill: '#12141a' },
  success: { text: '#218f58', fill: '#218f58', onFill: '#12141a' },
  info: { text: '#1489b3', fill: '#1489b3', onFill: '#12141a' },
  warn: { text: '#ae7209', fill: '#ae7209', onFill: '#12141a' },
  study: { text: '#a45be4', fill: '#a45be4', onFill: '#12141a' },
} as const;

/* ─── Camada não-texto (>= 3:1) — borda de campo, ícone informativo, anel de foco
 * Divisor puramente decorativo NÃO usa esta camada (é isento por "Incidental");
 * borda de formulário e anel de foco USAM.
 */
export const NONTEXT_LIGHT = {
  neutral: '#978e7f',
  action: '#ea6551',
  focus: '#109acb',
} as const;

export const NONTEXT_DARK = {
  neutral: '#726856',
  action: '#c52f18',
  focus: '#0c7196',
} as const;

/** Divisores decorativos (abaixo de 3:1 de propósito — nunca o único meio de identificar algo). */
export const DIVIDER_LIGHT = '#ddd5c6';
export const DIVIDER_DARK = '#2c313f';

/* ─── Movimento: dois níveis, separados por PROPRIEDADE ────────────────────
 * spatial: transform/geometria. PODE ultrapassar (overshoot ~9,5%).
 *   derivado de playful ζ=0,6 · k=1400/700/300 → 105/148/227 ms
 * effects: cor e opacidade. NUNCA ultrapassa (criticamente amortecido ζ=1,0).
 *   derivado de k=3800/1600/800 → acomoda em 95/146/207 ms
 */
export const MOTION = {
  spatial: {
    easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    fast: 105,
    normal: 150,
    slow: 230,
  },
  effects: {
    easing: 'cubic-bezier(0.2, 0, 0, 1)',
    fast: 100,
    normal: 160,
    slow: 240,
  },
} as const;

/** Propriedades CSS que o nível `spatial` PODE animar. Qualquer outra é bug. */
export const SPATIAL_ALLOWED_PROPERTIES = [
  'transform',
  'translate',
  'rotate',
  'scale',
  'width',
  'height',
  'inset',
  'top',
  'left',
  'right',
  'bottom',
  'flex-basis',
] as const;

/** Propriedades que NUNCA podem receber easing `spatial` (é assim que texto cintila). */
export const SPATIAL_FORBIDDEN_PROPERTIES = [
  'color',
  'background-color',
  'background',
  'opacity',
  'border-color',
  'fill',
  'stroke',
] as const;

/* ─── Forma ────────────────────────────────────────────────────────────────
 * Arredondamento generoso (registro lúdico), sem gradiente em superfície.
 */
export const SHAPE = {
  sm: 8,
  md: 14,
  lg: 20,
  pill: 999,
  /** valor de `theme.shape.borderRadius` */
  base: 14,
} as const;

/* ─── Tipografia ───────────────────────────────────────────────────────────
 * Fontes empacotadas via @fontsource (arquivos LOCAIS — CSP e offline).
 * O corpo a 16px fica preso ao piso cheio de 4,5:1: o alívio de "large scale
 * text" só começa em 24px regular ou 18,67px bold.
 */
export const FONT_STACK = {
  display: "'Nunito Variable', 'Nunito', system-ui, -apple-system, 'Segoe UI', sans-serif",
  body: "'Inter Variable', 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  mono: "'JetBrains Mono Variable', 'JetBrains Mono', 'SFMono-Regular', Menlo, Consolas, monospace",
} as const;

export const TYPE = {
  /** corpo do app e da prosa */
  bodySize: 16,
  /** entrelinha da prosa — dentro do intervalo de teste do C21 (1.5 a 2) */
  proseLineHeight: 1.6,
  /** espaço entre parágrafos: 1,5 x a caixa de linha de 1,5 */
  proseParagraphGap: '2.25em',
  /** medida-alvo da coluna de leitura */
  measureCh: 72,
  /** teto rígido da medida (SC 1.4.8) */
  measureMaxCh: 80,
  /** blocos de código */
  codeSize: 14,
  codeLineHeight: 1.5,
  /** limiar a partir do qual vale o alívio de 3:1 (bold) — use 18.67, não 18.5 */
  largeTextBoldPx: 18.67,
  /** limiar de large text regular */
  largeTextRegularPx: 24,
} as const;

/* ─── Contrato da camada de celebração (SC 2.3.1 / 2.2.2 / 2.3.3 / 4.1.3) ── */
export const CELEBRATION = {
  /** abaixo de 5 s o SC 2.2.2 não exige controle de pausa */
  maxDurationMs: 4000,
  /** teto de transições opostas por segundo, por partícula */
  maxOpposingTransitionsPerSecond: 3,
  /** orçamento de área de flash: 25% do campo de 10 graus (341 x 256 px) */
  maxFlashAreaPx2: 21824,
  /** limiar de "red flash": R/(R+G+B) */
  redFlashRatioThreshold: 0.8,
} as const;

/** R/(R+G+B) de uma cor hex — o teste de red flash do SC 2.3.1, Nota 3. */
export function redFlashRatio(hex: string): number {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const sum = r + g + b;
  return sum === 0 ? 0 : r / sum;
}

/** True quando a cor dispara o limiar de red flash e portanto NÃO pode piscar. */
export function isRedFlashColor(hex: string): boolean {
  return redFlashRatio(hex) >= CELEBRATION.redFlashRatioThreshold;
}

/* ─── Contraste WCAG 2.x — a mesma fórmula normativa usada nos testes ─────── */
function channel(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Luminância relativa de uma cor hex. */
export function relativeLuminance(hex: string): number {
  const h = hex.replace('#', '');
  const r = channel(parseInt(h.slice(0, 2), 16));
  const g = channel(parseInt(h.slice(2, 4), 16));
  const b = channel(parseInt(h.slice(4, 6), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Razão de contraste (L1 + 0.05) / (L2 + 0.05), como define o glossário do
 * WCAG 2.2. O Understanding de 1.4.3 é explícito que o valor NÃO arredonda para
 * cima: 4.499:1 não passa em 4.5:1 — então compare sempre com `>=` cru.
 */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/** Pisos normativos usados pelos testes de contraste. */
export const CONTRAST_FLOOR = {
  /** corpo de texto, SC 1.4.3 (AA) */
  bodyAA: 4.5,
  /** corpo de texto, SC 1.4.6 (AAA) — alvo das superfícies de leitura */
  bodyAAA: 7,
  /** large scale text, SC 1.4.3 (AA) */
  largeAA: 3,
  /** componentes de UI e objetos gráficos, SC 1.4.11 (AA) */
  nonText: 3,
} as const;
