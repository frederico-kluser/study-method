/**
 * tools/design/codepalette.ts — gera as duas polaridades da paleta de código.
 *
 * A referência é o Xcode (o editor da Apple): as matizes vêm dos valores que o
 * Xcode publica na preferência "Syntax Coloring", uma por papel de sintaxe. O
 * que este script faz é re-resolver a LUMINOSIDADE de cada uma para que a
 * paleta caiba nas superfícies DESTE app e nos pisos de `tests/codeTheme.test.ts`:
 *
 *   - TODO token alcança 4,5:1 sobre a SELEÇÃO (o fundo mais hostil);
 *   - o `bright` da tabela ANSI é levado a 7:1 contra o well, com teto;
 *   - o `normal` fica abaixo desse teto (o par tem que diferir em ênfase);
 *   - nenhuma cor dispara o limiar de red flash.
 *
 * Uso: npx tsx tools/design/codepalette.ts
 */
import {
  SURFACE_LIGHT,
  SURFACE_DARK,
  INK_LIGHT,
  INK_DARK,
  contrastRatio,
  relativeLuminance,
  redFlashRatio,
} from '../../src/lib/designTokens';

function hexToRgb(hex: string): [number, number, number] {
  const p = hex.replace('#', '');
  return [parseInt(p.slice(0, 2), 16), parseInt(p.slice(2, 4), 16), parseInt(p.slice(4, 6), 16)];
}
function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}
function hue(hex: string): number {
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
function saturation(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  return d === 0 ? 0 : (d / (1 - Math.abs(2 * l - 1))) * 100;
}
function hslToHex(h: number, s: number, l: number): string {
  const S = s / 100;
  const L = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = S * Math.min(L, 1 - L);
  const f = (n: number) => L - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return rgbToHex(f(0) * 255, f(8) * 255, f(4) * 255);
}

/** A cor de uma matiz cuja LUMINÂNCIA RELATIVA entra na banda pedida.
 *  A saturação é a da cor de referência; se a banda for inalcançável nela
 *  (a luminância de um vermelho saturado, por exemplo, não desce o bastante),
 *  a saturação cai um degrau de cada vez, mantendo a MATIZ — é o mesmo
 *  movimento que a calibração dos acentos faz, e ele nunca troca de família. */
function solveY(h: number, s: number, yMin: number, yMax: number, prefer: 'high' | 'low'): string | null {
  // o teto de red flash exige folga real (tests/codeTheme.test.ts)
  for (let sat = Math.round(s); sat >= 5; sat -= 2) {
    for (let l = prefer === 'high' ? 2 : 96; prefer === 'high' ? l <= 96 : l >= 2; l += prefer === 'high' ? 0.25 : -0.25) {
      const c = hslToHex(h, sat, l);
      const y = relativeLuminance(c);
      if (y < yMin || y > yMax) continue;
      if (redFlashRatio(c) > 0.75) continue;
      return c;
    }
  }
  return null;
}

/* ─── Bandas de luminância, derivadas das superfícies ───────────────────────
 * Toda cor de código é lida sobre TRÊS fundos. O mais hostil é a seleção
 * (nível 4): no claro ela é o fundo MAIS ESCURO, no escuro o MAIS CLARO.
 */
function band(scheme: 'light' | 'dark') {
  const surface = scheme === 'light' ? SURFACE_LIGHT.level2 : SURFACE_DARK.level2;
  const selection = scheme === 'light' ? SURFACE_LIGHT.level4 : SURFACE_DARK.level4;
  const ys = relativeLuminance(surface);
  const yl = relativeLuminance(selection);
  // 4,5:1 sobre a seleção
  const textYMax = scheme === 'light' ? (yl + 0.05) / 4.5 - 0.05 : 4.5 * (yl + 0.05) - 0.05;
  // bright em [7 : 7,25] sobre o well
  const brightLo = scheme === 'light' ? (ys + 0.05) / 7.25 - 0.05 : 7 * (ys + 0.05) - 0.05;
  const brightHi = scheme === 'light' ? (ys + 0.05) / 7 - 0.05 : 7.25 * (ys + 0.05) - 0.05;
  return {
    surface,
    selection,
    // normal: passa no piso e fica ABAIXO de 7:1 no well
    // `normal` tem que ficar FORA da banda do bright, na direção mais fraca.
    normalYMin: scheme === 'light' ? brightHi + 0.001 : textYMax,
    normalYMax: scheme === 'light' ? textYMax : brightLo - 0.001,
    brightYMin: brightLo,
    brightYMax: brightHi,
  };
}

/* ─── As matizes: o Xcode, papel por papel ──────────────────────────────────
 * Os valores abaixo são os da preferência "Syntax Coloring" do Xcode. Cada um
 * entra aqui como MATIZ + SATURAÇÃO; a luminância é re-resolvida acima.
 */
const SYNTAX_SOURCE = {
  comment: '#5D6C79',
  keyword: '#9B2393',
  string: '#C41A16',
  number: '#272AD8',
  function: '#326D74',
  type: '#3F6E74',
  constant: '#836C28',
} as const;

const STATE_SOURCE = {
  success: '#34c759',
  error: '#ff453a',
  warn: '#ff9f0a',
  info: '#64d2ff',
} as const;

const ANSI_SOURCE = {
  red: '#ff453a',
  green: '#30d158',
  yellow: '#ff9f0a',
  blue: '#3b6fe0',
  magenta: '#bf5af2',
  cyan: '#64d2ff',
} as const;

function build(scheme: 'light' | 'dark') {
  const b = band(scheme);
  const ink = scheme === 'light' ? INK_LIGHT : INK_DARK;
  const prefer = scheme === 'light' ? 'low' : 'high';
  const out: Record<string, string> = {};

  const solve = (src: string, yMin: number, yMax: number) =>
    solveY(hue(src), saturation(src), yMin, yMax, prefer as 'high' | 'low');

  for (const [role, src] of Object.entries(SYNTAX_SOURCE)) {
    if (role === 'comment') continue;
    out[role] = solve(src, b.normalYMin, b.normalYMax) ?? 'MISSING';
  }
  // comentário: o MESMO cinza-azulado do Xcode, um degrau mais fraco que a
  // tinta primária (é o único token que pode recuar).
  out.comment = solve(SYNTAX_SOURCE.comment, b.normalYMin, b.normalYMax) ?? 'MISSING';

  for (const [role, src] of Object.entries(STATE_SOURCE)) {
    out[`state.${role}`] = solve(src, b.normalYMin, b.normalYMax) ?? 'MISSING';
  }
  out['state.muted'] = out.comment!;

  for (const [role, src] of Object.entries(ANSI_SOURCE)) {
    // O `normal` de cada cromática ANSI é o MESMO valor do estado do terminal:
    // "teste falhou" em vermelho e a saída ANSI em vermelho têm que ser o mesmo
    // vermelho, ou o terminal passa a falar duas línguas.
    const stateAlias: Record<string, string> = {
      red: 'state.error',
      green: 'state.success',
      yellow: 'state.warn',
      cyan: 'state.info',
    };
    const bright = `bright${role[0]!.toUpperCase()}${role.slice(1)}`;
    out[`ansi.${role}`] = stateAlias[role] ? out[stateAlias[role]!]! : (solve(src, b.normalYMin, b.normalYMax) ?? 'MISSING');
    out[`ansi.${bright}`] = solve(src, b.brightYMin, b.brightYMax) ?? 'MISSING';
  }

  // Os quatro cinzas da tabela ANSI. A REGRA DOS QUATRO CINZAS: em polaridade
  // negativa eles vão do mais atenuado (`black`) ao mais forte (`brightWhite`);
  // em positiva a escada é INVERTIDA. Em nenhum dos dois o "branco" é branco nem
  // o "preto" é preto — se fosse, metade da saída desapareceria na própria
  // superfície. A escada inteira vive ABAIXO do teto do `normal` (claro) ou
  // ACIMA do piso (escuro), e por isso ela pode abrir de verdade.
  const grayAt = (y: number) => {
    const g = Math.round(255 * (1.055 * Math.pow(y, 1 / 2.4) - 0.055));
    return rgbToHex(g, g, g + 2);
  };
  const grayLadder = scheme === 'light' ? [0.012, 0.032, 0.062, 0.105] : [0.415, 0.53, 0.68, 0.84];
  const grayNames = ['ansi.black', 'ansi.brightBlack', 'ansi.white', 'ansi.brightWhite'];
  grayNames.forEach((name, i) => {
    out[name] = grayAt(grayLadder[i]!);
  });

  // O cursor é o acento `action` do app, re-resolvido contra o well: mesma
  // matiz, o L que passa no piso de texto sobre a seleção. É o único ponto vivo
  // da superfície quieta do editor.
  const actionSrc = scheme === 'light' ? '#0071e3' : '#0a84ff';
  out['chrome.cursor'] = solveY(
    hue(actionSrc),
    100,
    b.normalYMin,
    b.normalYMax,
    prefer as 'high' | 'low',
  ) ?? 'MISSING';
  out['chrome.gutterForeground'] = out.comment!;
  out['chrome.gutterActiveForeground'] = scheme === 'light' ? '#1d1d1f' : '#f5f5f7';

  return { b, ink, out };
}

function report(scheme: 'light' | 'dark'): void {
  const { b, out } = build(scheme);
  console.log(`\n════════ CODE_${scheme.toUpperCase()} ════════`);
  console.log(
    `normal Y ∈ [${b.normalYMin.toFixed(4)} ; ${b.normalYMax.toFixed(4)})  ` +
      `bright Y ∈ [${b.brightYMin.toFixed(4)} ; ${b.brightYMax.toFixed(4)}]`,
  );
  for (const [k, v] of Object.entries(out)) {
    if (!v || v === 'MISSING') {
      console.log(`  ${k.padEnd(24)} SEM SOLUCAO NA BANDA`);
      continue;
    }
    const vsSurface = contrastRatio(v, b.surface);
    const vsSel = contrastRatio(v, b.selection);
    const ok = vsSurface >= 4.5 && vsSel >= 4.5 && redFlashRatio(v) <= 0.75;
    console.log(
      `  ${k.padEnd(24)} '${v}',  // h=${hue(v).toFixed(1)} s=${saturation(v).toFixed(1)} well=${vsSurface.toFixed(2)} sel=${vsSel.toFixed(2)} rf=${redFlashRatio(v).toFixed(3)}${ok ? '' : '  <-- FAIL'}`,
    );
  }
}

report('light');
report('dark');
