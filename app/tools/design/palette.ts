/**
 * tools/design/palette.ts — laboratório de calibração do design system Apple.
 *
 * FERRAMENTA DE DESENVOLVIMENTO (não vai para o bundle): ela importa as
 * funções NORMATIVAS de `src/lib/designTokens.ts` — as mesmas que os testes
 * consomem — para que todo número que este script imprime seja, por
 * construção, o número que `tests/theme.test.ts` vai reprovar se divergir.
 *
 * Uso:
 *   npx tsx tools/design/palette.ts            # relatório completo
 *   npx tsx tools/design/palette.ts claims     # as linhas [medido] prontas
 */
import {
  contrastRatio,
  relativeLuminance,
  redFlashRatio,
  SURFACE_LIGHT,
  SURFACE_DARK,
  INK_LIGHT,
  INK_DARK,
  ACCENT_LIGHT,
  ACCENT_DARK,
  NONTEXT_LIGHT,
  NONTEXT_DARK,
  DIVIDER_LIGHT,
  DIVIDER_DARK,
  type AccentFamily,
} from '../../src/lib/designTokens';

/* ─── Mates de cor ───────────────────────────────────────────────────────── */

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** L* do CIE (0..100) — a métrica dos degraus de luminância da rampa. */
export function lStar(hex: string): number {
  const y = relativeLuminance(hex);
  return y <= 0.008856 ? 903.3 * y : 116 * Math.cbrt(y) - 16;
}

/** Desvio cromático: max(R,G,B) - min(R,G,B). */
export function chromaSpread(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return Math.max(r, g, b) - Math.min(r, g, b);
}

/** Matiz HSL em graus (0..360). */
export function hue(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

/** Saturação HSL em % (0..100). */
export function saturation(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return 0;
  return (d / (1 - Math.abs(2 * l - 1))) * 100;
}

/** Luminosidade HSL em % (0..100). */
export function lightness(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255) as [number, number, number];
  return ((Math.max(r, g, b) + Math.min(r, g, b)) / 2) * 100;
}

/**
 * Aproxima uma cor-alvo clarecendo/escurecendo SÓ a luminância, preservando
 * matiz e saturação da matiz-alvo pedida. É o movimento que a família do
 * acento faz: a `fill` é a cor de sistema; a `text` é a mesma matiz levada a
 * um L que alcança o piso de contraste.
 */
export function matchContrast(
  targetHue: number,
  targetSat: number,
  against: string,
  floor: number,
  direction: 'darker' | 'lighter',
): string {
  let best = '';
  let bestL = direction === 'darker' ? 100 : 0;
  for (let l = 0; l <= 100; l += 0.25) {
    const hex = hslToHex(targetHue, targetSat, l);
    if (contrastRatio(hex, against) < floor) continue;
    if (direction === 'darker' ? l < bestL : l > bestL) {
      bestL = l;
      best = hex;
    }
  }
  return best;
}

export function hslToHex(h: number, s: number, l: number): string {
  const S = s / 100;
  const L = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = S * Math.min(L, 1 - L);
  const f = (n: number) =>
    L - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return rgbToHex(f(0) * 255, f(8) * 255, f(4) * 255);
}

/* ─── Formatação de afirmação [medido] ───────────────────────────────────── */

/** "16,75" — a grafia portuguesa que o contrato exige. */
function pt(value: number, places = 2): string {
  return value.toFixed(places).replace('.', ',');
}

export function contrastClaim(a: string, b: string): string {
  return `[medido] ${a} x ${b} = ${pt(contrastRatio(resolve(a), resolve(b)))}:1`;
}

export function redFlashClaim(a: string): string {
  return `[medido] red-flash(${a}) = ${pt(redFlashRatio(resolve(a)), 3)}`;
}

const CLAIM_TOKENS: Record<string, unknown> = {
  SURFACE_LIGHT,
  SURFACE_DARK,
  INK_LIGHT,
  INK_DARK,
  ACCENT_LIGHT,
  ACCENT_DARK,
  NONTEXT_LIGHT,
  NONTEXT_DARK,
  DIVIDER_LIGHT,
  DIVIDER_DARK,
};

function resolve(ref: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(ref)) return ref.toLowerCase();
  const parts = ref.split('.');
  let node: unknown = CLAIM_TOKENS[parts[0]!];
  for (const part of parts.slice(1)) {
    node = (node as Record<string, unknown>)[part];
  }
  return node as string;
}

/* ─── Relatório ──────────────────────────────────────────────────────────── */

const FAMILIES: readonly AccentFamily[] = [
  'action',
  'success',
  'info',
  'warn',
  'study',
  'error',
];

function line(label: string, value: string | number): void {
  console.log(`  ${label.padEnd(52)} ${value}`);
}

function report(): void {
  for (const scheme of ['light', 'dark'] as const) {
    const SURF = scheme === 'light' ? SURFACE_LIGHT : SURFACE_DARK;
    const INK = scheme === 'light' ? INK_LIGHT : INK_DARK;
    const ACC = scheme === 'light' ? ACCENT_LIGHT : ACCENT_DARK;
    const NON = scheme === 'light' ? NONTEXT_LIGHT : NONTEXT_DARK;
    const DIV = scheme === 'light' ? DIVIDER_LIGHT : DIVIDER_DARK;

    console.log(`\n════════ ${scheme.toUpperCase()} ════════`);

    console.log('\n-- rampa (L* e passos) --');
    const levels = ['level0', 'level1', 'level2', 'level3', 'level4'] as const;
    for (const [i, lv] of levels.entries()) {
      const hex = SURF[lv];
      const step = i === 0 ? '' : `  passo ${pt(lStar(hex) - lStar(SURF[levels[i - 1]]))}`;
      line(`${lv} ${hex}`, `L*=${pt(lStar(hex))}${step}`);
    }
    line('DIVIDER', `${DIV}  L*=${pt(lStar(DIV))}`);

    console.log('\n-- tinta (pisos: 7:1 nos níveis 0/1 · 4,5:1 nos níveis 2/3/4) --');
    for (const [name, hex] of Object.entries(INK)) {
      for (const lv of levels) {
        const r = contrastRatio(hex, SURF[lv]);
        const floor = lv === 'level0' || lv === 'level1' ? 7 : 4.5;
        const mark = r >= floor ? 'ok ' : 'FAIL';
        line(`${name} sobre ${lv} (${SURF[lv]})`, `${mark} ${pt(r)}:1`);
      }
    }

    console.log('\n-- acentos (texto >= 4,5:1 nos níveis 0/1/2 · onFill >= 4,5:1) --');
    for (const fam of FAMILIES) {
      const pair = ACC[fam];
      const t0 = contrastRatio(pair.text, SURF.level0);
      const t1 = contrastRatio(pair.text, SURF.level1);
      const t2 = contrastRatio(pair.text, SURF.level2);
      const of = contrastRatio(pair.onFill, pair.fill);
      const mark = (v: number) => (v >= 4.5 ? 'ok ' : 'FAIL');
      line(
        `${fam}.text`,
        `n0=${mark(t0)}${pt(t0)} n1=${mark(t1)}${pt(t1)} n2=${mark(t2)}${pt(t2)}`,
      );
      line(
        `${fam}.fill ${pair.fill}`,
        `onFill=${mark(of)}${pt(of)}  h=${pt(hue(pair.fill), 1)}° s=${pt(saturation(pair.fill), 1)}% L=${pt(lightness(pair.fill), 1)}%`,
      );
      line(`${fam}.text h/s`, `h=${pt(hue(pair.text), 1)}° s=${pt(saturation(pair.text), 1)}%`);
      line(`${fam}.red-flash`, `${pt(redFlashRatio(pair.fill), 3)}  chroma=${chromaSpread(pair.fill)}`);
    }

    console.log('\n-- não-texto (>= 3:1 nos níveis 0/1) --');
    for (const [name, hex] of Object.entries(NON)) {
      const n0 = contrastRatio(hex, SURF.level0);
      const n1 = contrastRatio(hex, SURF.level1);
      const n4 = contrastRatio(hex, SURF.level4);
      const mark = (v: number) => (v >= 3 ? 'ok ' : 'FAIL');
      line(`${name} ${hex}`, `n0=${mark(n0)}${pt(n0)} n1=${mark(n1)}${pt(n1)} n4=${pt(n4)}`);
    }
  }
}

function claims(): void {
  console.log('\n/* ─── afirmações [medido] prontas ─── */');
  for (const scheme of ['light', 'dark'] as const) {
    const S = scheme === 'light' ? 'SURFACE_LIGHT' : 'SURFACE_DARK';
    const I = scheme === 'light' ? 'INK_LIGHT' : 'INK_DARK';
    const A = scheme === 'light' ? 'ACCENT_LIGHT' : 'ACCENT_DARK';
    const N = scheme === 'light' ? 'NONTEXT_LIGHT' : 'NONTEXT_DARK';
    const D = scheme === 'light' ? 'DIVIDER_LIGHT' : 'DIVIDER_DARK';
    const SURF = scheme === 'light' ? SURFACE_LIGHT : SURFACE_DARK;
    const INK = scheme === 'light' ? INK_LIGHT : INK_DARK;

    console.log(`\n// ${scheme}`);
    for (const inkKey of ['primary', 'secondary'] as const) {
      for (const lv of ['level0', 'level1', 'level2', 'level3', 'level4'] as const) {
        console.log(` *   ${contrastClaim(`${I}.${inkKey}`, `${S}.${lv}`)}`);
      }
    }
    for (const fam of FAMILIES) {
      console.log(` *   ${contrastClaim(`${A}.${fam}.text`, `${S}.level0`)}`);
      console.log(` *   ${contrastClaim(`${A}.${fam}.text`, `${S}.level1`)}`);
      console.log(` *   ${contrastClaim(`${A}.${fam}.text`, `${S}.level2`)}`);
      console.log(` *   ${contrastClaim(`${A}.${fam}.onFill`, `${A}.${fam}.fill`)}`);
      console.log(` *   ${redFlashClaim(`${A}.${fam}.fill`)}`);
    }
    for (const k of ['neutral', 'action', 'focus'] as const) {
      console.log(` *   ${contrastClaim(`${N}.${k}`, `${S}.level0`)}`);
      console.log(` *   ${contrastClaim(`${N}.${k}`, `${S}.level1`)}`);
    }
    console.log(` *   ${contrastClaim(D, `${S}.level0`)}`);
    console.log(` *   ${contrastClaim(D, `${S}.level1`)}`);
    void SURF;
    void INK;
  }
}

if (process.argv[2] === 'claims') claims();
else report();
