/**
 * docs/ux-redesign/coderamp.ts — varredura que PRODUZIU os hex de
 * `app/src/lib/codeTheme.ts` (paleta de código "Cartucho", duas polaridades).
 *
 * Mesmo método do `ramp2.py` (que gerou os acentos da UI), mas com dois
 * endurecimentos, porque bloco de código é texto de 14px preso ao piso cheio:
 *
 *  1. O alvo do piso NÃO é a superfície de código (nível 2) e sim a faixa de
 *     SELEÇÃO (nível 4) — a superfície mais hostil sobre a qual o token ainda
 *     precisa ser lido. Passar no nível 4 implica folga no nível 2 e no 3.
 *  2. A fórmula de contraste é importada de `src/lib/designTokens.ts` (a
 *     normativa do produto), não reimplementada aqui.
 *
 * Rode de `app/`:  npx tsx ../docs/ux-redesign/coderamp.ts
 */
import {
  SURFACE_LIGHT,
  SURFACE_DARK,
  INK_LIGHT,
  INK_DARK,
  contrastRatio,
  redFlashRatio,
} from '../../app/src/lib/designTokens';

function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

/**
 * desc=true  -> varre L de claro p/ escuro e devolve o PRIMEIRO que passa
 *               (o mais claro/vívido possível) — usado no esquema CLARO.
 * desc=false -> do escuro p/ claro (o mais escuro possível) — esquema ESCURO.
 */
function scan(h: number, s: number, bg: string, floor: number, desc: boolean): string | null {
  const range = desc
    ? Array.from({ length: 199 }, (_, i) => 995 - i * 5)
    : Array.from({ length: 199 }, (_, i) => 5 + i * 5);
  for (const i of range) {
    const c = hslToHex(h, s, i / 1000);
    if (contrastRatio(c, bg) >= floor) return c;
  }
  return null;
}

interface Fam { h: number; sLight: number; sDark: number; role: string }

/* Famílias: as cinco de `ramp2.py` (mesmos h/s — a paleta de código é DERIVADA
 * dos acentos da UI, não um sistema paralelo) + duas novas exclusivas do código.
 */
const FAMS: Fam[] = [
  { role: 'keyword  (action)', h: 8, sLight: 0.78, sDark: 0.8 },
  { role: 'string   (success)', h: 150, sLight: 0.62, sDark: 0.62 },
  { role: 'function (info)', h: 196, sLight: 0.85, sDark: 0.8 },
  { role: 'number   (warn)', h: 38, sLight: 0.92, sDark: 0.9 },
  { role: 'type     (study)', h: 272, sLight: 0.62, sDark: 0.72 },
  // novas: constante em magenta de console; comentário em cinza-ardósia frio
  // (frio DE PROPÓSITO, para não colidir com a tinta secundária quente do
  // esquema claro, que é quem pinta o operador).
  { role: 'constant (rose)', h: 330, sLight: 0.7, sDark: 0.72 },
  { role: 'comment  (slate)', h: 215, sLight: 0.14, sDark: 0.16 },
  // exclusiva do ANSI: o azul do terminal. A família `info` (h=196) é ciano e
  // ocupa o slot `cyan`; sem esta, `blue` e `cyan` sairiam iguais.
  { role: 'blue     (ansi)', h: 222, sLight: 0.62, sDark: 0.62 },
];

const L2 = SURFACE_LIGHT.level2, L3 = SURFACE_LIGHT.level3, L4 = SURFACE_LIGHT.level4;
const D2 = SURFACE_DARK.level2, D3 = SURFACE_DARK.level3, D4 = SURFACE_DARK.level4;

const FLOOR = 4.5;

function row(label: string, hex: string, s2: string, s3: string, s4: string): void {
  const r2 = contrastRatio(hex, s2);
  const r3 = contrastRatio(hex, s3);
  const r4 = contrastRatio(hex, s4);
  const ok = r2 >= FLOOR && r3 >= FLOOR && r4 >= FLOOR ? 'PASS' : 'FAIL';
  console.log(
    `  ${ok} ${label.padEnd(18)} ${hex}  well ${r2.toFixed(2)}:1  linha ${r3.toFixed(2)}:1  seleção ${r4.toFixed(2)}:1  R/(R+G+B) ${redFlashRatio(hex).toFixed(3)}`,
  );
}

console.log(`SUPERFÍCIE DE CÓDIGO = nível 2 · linha atual = nível 3 · seleção = nível 4`);
console.log(`piso ${FLOOR}:1 exigido contra as TRÊS (o alvo da varredura é o nível 4)\n`);

console.log(`CLARO — well ${L2} · linha ${L3} · seleção ${L4}`);
for (const f of FAMS) {
  const hex = scan(f.h, f.sLight, L4, FLOOR, true);
  if (!hex) { console.log(`  FAIL ${f.role}: nenhum L passa`); continue; }
  row(f.role, hex, L2, L3, L4);
}
row('variable (ink)', INK_LIGHT.primary, L2, L3, L4);
row('operator (ink2)', INK_LIGHT.secondary, L2, L3, L4);

console.log(`\nESCURO — well ${D2} · linha ${D3} · seleção ${D4}`);
for (const f of FAMS) {
  const hex = scan(f.h, f.sDark, D4, FLOOR, false);
  if (!hex) { console.log(`  FAIL ${f.role}: nenhum L passa`); continue; }
  row(f.role, hex, D2, D3, D4);
}
row('variable (ink)', INK_DARK.primary, D2, D3, D4);
row('operator (ink2)', INK_DARK.secondary, D2, D3, D4);

/* ─── ADVERTÊNCIA MEDIDA: saturação é limitada pelo RED FLASH, não pelo gosto ─
 * Varrendo a família `action` (h=8) no esquema CLARO com saturações crescentes:
 *   s=0.78 -> #af2a16  R/(R+G+B)=0.732   ok
 *   s=0.90 -> #b5200a  R/(R+G+B)=0.812   É RED FLASH (SC 2.3.1) — proibido
 *   s=1.00 -> #b71800  R/(R+G+B)=0.884   É RED FLASH — proibido
 * Por isso as saturações aqui são EXATAMENTE as do `ramp2.py`: elas já são o
 * teto seguro. Só a luminosidade foi re-resolvida para a superfície de código.
 */

/* ─── ANSI "bright": mesma matiz levada a 7:1 contra o WELL ────────────────
 * Em polaridade positiva "brilhante" significa MAIS ESCURO (mais ênfase),
 * não mais claro — senão a saída some no papel.
 */
const BRIGHT_FLOOR = 7;
console.log(`\nANSI bright — mesma matiz a ${BRIGHT_FLOOR}:1 contra o well`);
console.log('CLARO');
for (const f of FAMS) {
  const hex = scan(f.h, f.sLight, L2, BRIGHT_FLOOR, true);
  if (!hex) { console.log(`  FAIL ${f.role}`); continue; }
  row(f.role, hex, L2, L3, L4);
}
console.log('ESCURO');
for (const f of FAMS) {
  const hex = scan(f.h, f.sDark, D2, BRIGHT_FLOOR, false);
  if (!hex) { console.log(`  FAIL ${f.role}`); continue; }
  row(f.role, hex, D2, D3, D4);
}
