/**
 * tests/codeTheme.test.ts — a paleta de CÓDIGO do redesign "Cartucho" nas duas
 * polaridades. Sem jsdom (dado puro), como `draculaTheme.test.ts`.
 *
 * O que este arquivo existe para IMPEDIR (cada `describe` é um desses):
 *
 *  1. Uma polaridade só. O defeito que o redesign corrige é editor/terminal
 *     Dracula escuro FIXO dentro de um app claro (§7.4). Um teste que passasse
 *     com as duas paletas IGUAIS não valeria nada — por isso a distinção entre
 *     claro e escuro é assertada folha a folha.
 *  2. Cor bonita que reprova. Bloco de código é texto de 14px: sem alívio de
 *     "large scale text", piso CHEIO de 4,5:1 (SC 1.4.3). E o token não é lido
 *     só sobre o well — sobre a LINHA ATUAL e sobre a SELEÇÃO também. As três
 *     superfícies são verificadas, para TODA cor, nos DOIS esquemas.
 *  3. Comentário atenuado demais. É a tentação clássica e é exatamente onde a
 *     acessibilidade cai; ele tem asserção nominal própria.
 *  4. Red flash. Nenhuma cor animável pode ter R/(R+G+B) >= 0,8 (SC 2.3.1,
 *     Nota 3). O teste também prova que sabe DISCRIMINAR: o #b5200a — o
 *     vermelho mais saturado que a varredura ofereceu — é reprovado aqui e não
 *     está na paleta.
 *  5. Contrato quebrado para a onda 2. Os nomes semânticos de `writeLine`
 *     (`default`/`green`/`red`/`yellow`/`accent`/`muted`/`cyan`) são os mesmos
 *     de antes; trocar a fonte das cores não pode trocar a interface.
 *  6. Tabela ANSI que só PARECE completa. 16 hex válidas, todas acima do piso
 *     e nenhuma em red flash, ainda podem ser 15 cores — basta um `bright`
 *     colapsado no seu `normal` — ou um `bright` de outra família. Nada disso
 *     move contraste nem red flash, então nada disso era pego. Aqui a tabela é
 *     assertada DISTINTA duas a duas, e cada `bright` cromático é provado ser
 *     a MESMA MATIZ do seu `normal` levada a 7:1 contra o well: o invariante
 *     que `codeTheme.ts` declara em prosa vira asserção.
 *  7. Cursor "qualquer cor que passe em 3:1". `codeTheme.ts` documenta que o
 *     cursor É o acento `action` — mas o piso não-texto de 3:1, sozinho,
 *     aceitaria a tinta primária no lugar dele. A IDENTIDADE do cursor é
 *     assertada nos dois esquemas.
 *
 * NADA aqui pode passar por vacuidade: a varredura itera a paleta REAL via
 * `codeColorEntries`, e a contagem de entradas é assertada — paleta esvaziada
 * falha em vez de "passar" com zero iterações.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  CODE_LIGHT,
  CODE_DARK,
  CODE_TYPOGRAPHY,
  CODE_SYNTAX_ROLES,
  CODE_STATE_ROLES,
  CODE_ANSI_KEYS,
  TERMINAL_COLOR_NAMES,
  TERMINAL_CODE_COLORS_LIGHT,
  TERMINAL_CODE_COLORS_DARK,
  XTERM_THEME_LIGHT,
  XTERM_THEME_DARK,
  CODEMIRROR_SETTINGS_LIGHT,
  CODEMIRROR_SETTINGS_DARK,
  codePalette,
  terminalColors,
  xtermTheme,
  codeMirrorSettings,
  codeMirrorSyntax,
  codeColorEntries,
  animatableCodeColors,
  hexToRgb,
  truecolorForeground,
  type CodePalette,
  type CodeScheme,
  type CodeChrome,
  type CodeAnsi,
} from '../src/lib/codeTheme';
import {
  SURFACE_LIGHT,
  SURFACE_DARK,
  INK_LIGHT,
  INK_DARK,
  FONT_STACK,
  TYPE,
  ACCENT_LIGHT,
  ACCENT_DARK,
  CONTRAST_FLOOR,
  CELEBRATION,
  contrastRatio,
  redFlashRatio,
  relativeLuminance,
  isRedFlashColor,
} from '../src/lib/designTokens';

const HEX = /^#[0-9a-f]{6}$/;

const SCHEMES: readonly CodeScheme[] = ['light', 'dark'];

/** 9 papéis de sintaxe + 5 de estado + 16 ANSI + 3 do cromo. */
const EXPECTED_COLOR_ENTRIES = 9 + 5 + 16 + 3;

/**
 * Os SEIS pares cromáticos da tabela ANSI. Os outros quatro slots
 * (`black`/`brightBlack`/`white`/`brightWhite`) são a escada de cinzas e seguem
 * outra regra — a "REGRA DOS QUATRO CINZAS" de `codeTheme.ts` —, por isso não
 * entram no invariante de matiz.
 */
const ANSI_CHROMATIC_PAIRS: readonly (readonly [keyof CodeAnsi, keyof CodeAnsi])[] = [
  ['red', 'brightRed'],
  ['green', 'brightGreen'],
  ['yellow', 'brightYellow'],
  ['blue', 'brightBlue'],
  ['magenta', 'brightMagenta'],
  ['cyan', 'brightCyan'],
];

/**
 * O `bright` ANSI é a mesma matiz do `normal` levada a 7:1 contra o well
 * (`codeTheme.ts`, e é isso que a última seção do `docs/ux-redesign/coderamp.ts`
 * roda: `BRIGHT_FLOOR = 7`). A varredura anda o L em passos de 0,005 e PARA no
 * primeiro valor que alcança o piso, então o resultado pousa em cima de 7:1 e
 * não muito além — daí a BANDA, e não só um piso: sem teto, "bright = preto"
 * também passaria por um piso de 7:1, e o invariante declarado não é "escureça
 * o quanto quiser", é "leve ATÉ 7:1". Pior caso entregue: 7,140 (green escuro).
 */
const ANSI_BRIGHT_FLOOR = 7;
const ANSI_BRIGHT_CEILING = 7.25;

/**
 * Tolerância de MATIZ, em graus. Ela existe porque a matiz não sobrevive
 * exatamente ao hex: `coderamp.ts` gera a cor em HSL e arredonda cada canal
 * para 8 bits, e esse arredondamento move a matiz de volta em até ~0,3° por
 * cor (o pior par entregue é `yellow` claro, 0,65° entre normal e bright).
 * 1° dá folga sobre esse arredondamento sem afrouxar nada: as matizes vizinhas
 * desta tabela estão a 26° uma da outra (cyan 196 e blue 222, o par mais
 * próximo), então trocar a família de um `bright` continua sendo pego.
 */
const HUE_TOLERANCE_DEG = 1;

/**
 * Matiz HSL (0–360) de uma hex; `NaN` quando a cor é acromática (matiz
 * indefinida). Existe porque o invariante do `bright` e a identidade do cursor
 * são declarados em MATIZ, e matiz é justamente o que contraste e red flash NÃO
 * enxergam. Reaproveita `hexToRgb` da produção — nenhuma fórmula é
 * reimplementada aqui, e contraste/red flash continuam vindo de `designTokens`.
 */
function hueOf(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const chroma = max - Math.min(rn, gn, bn);
  if (chroma === 0) return Number.NaN;
  let h: number;
  if (max === rn) h = (gn - bn) / chroma;
  else if (max === gn) h = (bn - rn) / chroma + 2;
  else h = (rn - gn) / chroma + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

/** Distância angular entre duas matizes — o círculo fecha em 360°. */
function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/** Todo campo de `CodeChrome` — escrito à mão de propósito (detecta remoção). */
const CHROME_KEYS: readonly (keyof CodeChrome)[] = [
  'surface',
  'ink',
  'selection',
  'selectionInactive',
  'currentLine',
  'cursor',
  'cursorAccent',
  'gutterBackground',
  'gutterForeground',
  'gutterActiveForeground',
  'gutterBorder',
  'border',
];

/* ───────────────────────────────────────────────────────────────────────── */

describe('CODE_LIGHT / CODE_DARK — as duas paletas existem e são completas', () => {
  it('o seletor devolve a paleta do esquema pedido', () => {
    assert.equal(codePalette('light'), CODE_LIGHT);
    assert.equal(codePalette('dark'), CODE_DARK);
    assert.equal(CODE_LIGHT.scheme, 'light');
    assert.equal(CODE_DARK.scheme, 'dark');
  });

  it('as listas de papéis são exatamente o contrato (não podem encolher)', () => {
    assert.deepEqual([...CODE_SYNTAX_ROLES], [
      'comment',
      'keyword',
      'string',
      'number',
      'function',
      'type',
      'variable',
      'operator',
      'constant',
    ]);
    assert.deepEqual([...CODE_STATE_ROLES], ['success', 'error', 'warn', 'info', 'muted']);
    assert.equal(CODE_ANSI_KEYS.length, 16);
  });

  for (const scheme of SCHEMES) {
    const p = codePalette(scheme);

    it(`[${scheme}] tem as 9 cores de sintaxe, em hex válida`, () => {
      for (const role of CODE_SYNTAX_ROLES) {
        assert.match(p.syntax[role], HEX, `syntax.${role} inválida em ${scheme}`);
      }
    });

    it(`[${scheme}] tem as 5 cores de estado do terminal, em hex válida`, () => {
      for (const role of CODE_STATE_ROLES) {
        assert.match(p.state[role], HEX, `state.${role} inválida em ${scheme}`);
      }
    });

    it(`[${scheme}] tem as 16 entradas ANSI, em hex válida`, () => {
      for (const key of CODE_ANSI_KEYS) {
        assert.match(p.ansi[key], HEX, `ansi.${key} inválida em ${scheme}`);
      }
    });

    it(`[${scheme}] tem o cromo completo (seleção, linha atual, cursor, gutter)`, () => {
      for (const key of CHROME_KEYS) {
        assert.match(p.chrome[key], HEX, `chrome.${key} inválida em ${scheme}`);
      }
    });

    it(`[${scheme}] a superfície de código é o NÍVEL 2 da rampa (o well)`, () => {
      const ramp = scheme === 'dark' ? SURFACE_DARK : SURFACE_LIGHT;
      assert.equal(p.chrome.surface, ramp.level2);
      assert.equal(p.chrome.gutterBackground, ramp.level2);
      // a escada que a varredura usou como alvo de contraste
      assert.equal(p.chrome.currentLine, ramp.level3);
      assert.equal(p.chrome.selection, ramp.level4);
    });

    it(`[${scheme}] a tinta padrão é a do esquema`, () => {
      assert.equal(p.chrome.ink, scheme === 'dark' ? INK_DARK.primary : INK_LIGHT.primary);
    });

    it(`[${scheme}] o cursor É o acento \`action\` — não uma hex avulsa que passa em 3:1`, () => {
      // `codeTheme.ts` declara: "Cursor/caret. É o acento `action` — o único
      // ponto vivo da superfície quieta." O piso de 3:1 sozinho aceitaria a
      // tinta primária aqui (ela passa folgado), então a identidade precisa de
      // asserção própria. O `action` desta paleta é o mesmo hex que pinta
      // `keyword`, `state.error` e `ansi.red`.
      assert.equal(p.chrome.cursor, p.syntax.keyword, `cursor ${p.chrome.cursor} deixou de ser o acento action`);
      assert.equal(p.chrome.cursor, p.state.error);
      assert.equal(p.chrome.cursor, p.ansi.red);
      // ...e é a família `action` de `designTokens` DE VERDADE: mesma matiz,
      // só o L foi re-resolvido contra o well (é isso que "derivada dos
      // acentos" significa). Sem esta linha, mover cursor E keyword juntos
      // para outra família passaria.
      const accent = scheme === 'dark' ? ACCENT_DARK : ACCENT_LIGHT;
      const d = hueDistance(hueOf(p.chrome.cursor), hueOf(accent.action.text));
      assert.ok(
        d <= HUE_TOLERANCE_DEG,
        `cursor ${p.chrome.cursor} está a ${d.toFixed(2)}° da família action (${accent.action.text}) em ${scheme}`,
      );
      // um cursor da cor da tinta é um cursor invisível dentro do texto
      assert.notEqual(p.chrome.cursor, p.chrome.ink);
      assert.notEqual(p.chrome.cursor, p.syntax.variable);
    });
  }
});

/* ───────────────────────────────────────────────────────────────────────── */

describe('contraste — piso CHEIO de 4,5:1 (código é texto de 14px, sem alívio)', () => {
  it('a varredura enxerga a paleta inteira (guarda contra passar por vacuidade)', () => {
    assert.equal(codeColorEntries(CODE_LIGHT).length, EXPECTED_COLOR_ENTRIES);
    assert.equal(codeColorEntries(CODE_DARK).length, EXPECTED_COLOR_ENTRIES);
    assert.ok(EXPECTED_COLOR_ENTRIES >= 30);
  });

  for (const scheme of SCHEMES) {
    const p = codePalette(scheme);

    it(`[${scheme}] TODA cor alcança 4,5:1 contra a superfície de código`, () => {
      for (const [label, hex] of codeColorEntries(p)) {
        const r = contrastRatio(hex, p.chrome.surface);
        assert.ok(
          r >= CONTRAST_FLOOR.bodyAA,
          `${scheme} ${label} ${hex} sobre ${p.chrome.surface} = ${r.toFixed(3)}:1 (piso ${CONTRAST_FLOOR.bodyAA})`,
        );
      }
    });

    it(`[${scheme}] TODA cor alcança 4,5:1 sobre a LINHA ATUAL`, () => {
      for (const [label, hex] of codeColorEntries(p)) {
        const r = contrastRatio(hex, p.chrome.currentLine);
        assert.ok(
          r >= CONTRAST_FLOOR.bodyAA,
          `${scheme} ${label} ${hex} sobre linha atual ${p.chrome.currentLine} = ${r.toFixed(3)}:1`,
        );
      }
    });

    it(`[${scheme}] TODA cor alcança 4,5:1 sobre a SELEÇÃO (texto selecionado continua legível)`, () => {
      for (const [label, hex] of codeColorEntries(p)) {
        const r = contrastRatio(hex, p.chrome.selection);
        assert.ok(
          r >= CONTRAST_FLOOR.bodyAA,
          `${scheme} ${label} ${hex} sobre seleção ${p.chrome.selection} = ${r.toFixed(3)}:1`,
        );
      }
    });

    it(`[${scheme}] o COMENTÁRIO não é a exceção atenuada`, () => {
      const r = contrastRatio(p.syntax.comment, p.chrome.surface);
      assert.ok(
        r >= CONTRAST_FLOOR.bodyAA,
        `comentário ${p.syntax.comment} = ${r.toFixed(3)}:1 — atenuar comentário é onde a acessibilidade cai`,
      );
      // ...e ainda assim LÊ como comentário: menos contrastante que a tinta
      // padrão (o `variable`) e com hex própria — um comentário que empata com
      // o código ao redor não é um comentário, é ruído.
      const ink = contrastRatio(p.chrome.ink, p.chrome.surface);
      assert.ok(r < ink, `comentário (${r.toFixed(2)}:1) não pode ser tão forte quanto a tinta (${ink.toFixed(2)}:1)`);
      assert.notEqual(p.syntax.comment, p.syntax.variable);
      assert.notEqual(p.syntax.comment, p.syntax.operator);
      // a faixa inteira de sintaxe pousa perto do piso de propósito: nenhum
      // token pode ficar tão apagado a ponto de sair do intervalo dos demais.
      const ratios = CODE_SYNTAX_ROLES.map((role) => contrastRatio(p.syntax[role], p.chrome.surface));
      assert.ok(Math.min(...ratios) >= CONTRAST_FLOOR.bodyAA, 'algum token de sintaxe está abaixo do piso');
    });

    it(`[${scheme}] o cursor alcança o piso NÃO-TEXTO de 3:1 (SC 1.4.11) com folga`, () => {
      const r = contrastRatio(p.chrome.cursor, p.chrome.surface);
      assert.ok(r >= CONTRAST_FLOOR.nonText, `cursor ${p.chrome.cursor} = ${r.toFixed(3)}:1`);
      // o caractere sob um cursor em bloco também precisa ser lido
      const block = contrastRatio(p.chrome.cursor, p.chrome.cursorAccent);
      assert.ok(block >= CONTRAST_FLOOR.bodyAA, `cursor em bloco = ${block.toFixed(3)}:1`);
    });
  }

  it('a fórmula usada é a normativa de designTokens (não arredonda para cima)', () => {
    // 4,499 NÃO passa em 4,5 — o teste precisa herdar essa propriedade.
    assert.ok(!(4.499 >= CONTRAST_FLOOR.bodyAA));
    assert.equal(CONTRAST_FLOOR.bodyAA, 4.5);
  });
});

/* ───────────────────────────────────────────────────────────────────────── */

describe('red flash — SC 2.3.1 Nota 3, R/(R+G+B) < 0,8', () => {
  it('o teste sabe discriminar: o candidato reprovado #b5200a É red flash', () => {
    // achado da varredura: a família `action` clara com saturação 0,90 entra no
    // gatilho. Ele foi rejeitado — e não pode reaparecer na paleta.
    assert.ok(isRedFlashColor('#b5200a'));
    assert.ok(redFlashRatio('#b5200a') >= CELEBRATION.redFlashRatioThreshold);
    const all = [...codeColorEntries(CODE_LIGHT), ...codeColorEntries(CODE_DARK)].map(([, h]) => h);
    assert.ok(!all.includes('#b5200a'));
    assert.ok(!all.includes('#e60012'), 'o vermelho #E60012 da Nintendo dá 0,927 — proibido');
  });

  for (const scheme of SCHEMES) {
    const p = codePalette(scheme);

    it(`[${scheme}] nenhuma cor ANIMÁVEL dispara o limiar`, () => {
      const animatable = animatableCodeColors(p);
      assert.ok(animatable.length >= 5);
      for (const [label, hex] of animatable) {
        const r = redFlashRatio(hex);
        assert.ok(
          !isRedFlashColor(hex),
          `${scheme} ${label} ${hex} R/(R+G+B) = ${r.toFixed(3)} >= ${CELEBRATION.redFlashRatioThreshold}`,
        );
        assert.ok(r < CELEBRATION.redFlashRatioThreshold);
      }
    });

    it(`[${scheme}] nenhuma cor da paleta INTEIRA dispara o limiar`, () => {
      for (const [label, hex] of codeColorEntries(p)) {
        assert.ok(
          !isRedFlashColor(hex),
          `${scheme} ${label} ${hex} R/(R+G+B) = ${redFlashRatio(hex).toFixed(3)}`,
        );
      }
    });

    it(`[${scheme}] o vermelho de ERRO do terminal tem folga real (não raspa o limiar)`, () => {
      const r = redFlashRatio(p.state.error);
      assert.ok(
        CELEBRATION.redFlashRatioThreshold - r >= 0.05,
        `erro ${p.state.error} R/(R+G+B) = ${r.toFixed(3)} — folga de apenas ${(CELEBRATION.redFlashRatioThreshold - r).toFixed(3)}`,
      );
    });
  }
});

/* ───────────────────────────────────────────────────────────────────────── */

describe('tabela ANSI — 16 cores DISTINTAS e o invariante do `bright`', () => {
  for (const scheme of SCHEMES) {
    const p = codePalette(scheme);

    it(`[${scheme}] as 16 entradas são 16 cores diferentes (tabela colapsada não passa)`, () => {
      // 16 hex válidas não são 16 CORES. Um `bright` colapsado no seu `normal`
      // passa em formato, em contraste e em red flash — e apaga a distinção
      // que o terminal usa para separar ênfase de texto normal.
      const seen = new Map<string, keyof CodeAnsi>();
      for (const key of CODE_ANSI_KEYS) {
        const hex = p.ansi[key];
        const first = seen.get(hex);
        assert.equal(
          first,
          undefined,
          `${scheme}: ansi.${key} repete a hex de ansi.${first} (${hex}) — a tabela tem menos de 16 cores`,
        );
        seen.set(hex, key);
      }
      assert.equal(seen.size, 16);
    });

    it(`[${scheme}] cada bright cromático é a MESMA MATIZ do seu normal`, () => {
      assert.equal(ANSI_CHROMATIC_PAIRS.length, 6);
      for (const [normal, bright] of ANSI_CHROMATIC_PAIRS) {
        const hn = hueOf(p.ansi[normal]);
        const hb = hueOf(p.ansi[bright]);
        assert.ok(
          Number.isFinite(hn) && Number.isFinite(hb),
          `${scheme}: ansi.${normal}/ansi.${bright} virou acromático — perdeu a matiz da família`,
        );
        const d = hueDistance(hn, hb);
        assert.ok(
          d <= HUE_TOLERANCE_DEG,
          `${scheme}: ansi.${bright} (${p.ansi[bright]}, h=${hb.toFixed(2)}) não é a matiz de ansi.${normal} (${p.ansi[normal]}, h=${hn.toFixed(2)}) — ${d.toFixed(2)}° de distância, teto ${HUE_TOLERANCE_DEG}°`,
        );
      }
    });

    it(`[${scheme}] cada bright cromático foi levado A 7:1 contra o well (e o normal não chega lá)`, () => {
      for (const [normal, bright] of ANSI_CHROMATIC_PAIRS) {
        const rb = contrastRatio(p.ansi[bright], p.chrome.surface);
        assert.ok(
          rb >= ANSI_BRIGHT_FLOOR,
          `${scheme}: ansi.${bright} ${p.ansi[bright]} = ${rb.toFixed(3)}:1 contra o well (piso ${ANSI_BRIGHT_FLOOR})`,
        );
        assert.ok(
          rb <= ANSI_BRIGHT_CEILING,
          `${scheme}: ansi.${bright} ${p.ansi[bright]} = ${rb.toFixed(3)}:1 passou MUITO de 7:1 — o invariante é "levado a 7:1", não "escurecido à vontade" (teto ${ANSI_BRIGHT_CEILING})`,
        );
        // e o par não pode empatar em ênfase: `bright` é mais forte que `normal`
        const rn = contrastRatio(p.ansi[normal], p.chrome.surface);
        assert.ok(
          rn < ANSI_BRIGHT_FLOOR,
          `${scheme}: ansi.${normal} ${p.ansi[normal]} = ${rn.toFixed(3)}:1 já está no patamar do bright — o par perdeu a diferença de ênfase`,
        );
        assert.ok(rb > rn, `${scheme}: ansi.${bright} não é mais enfático que ansi.${normal}`);
      }
    });

    it(`[${scheme}] "brilhante" empurra na direção da POLARIDADE, não sempre para o claro`, () => {
      // Em polaridade positiva, "bright" significa MAIS ESCURO (mais ênfase no
      // papel); em negativa, mais claro. Clarear no esquema claro apagaria a
      // saída — é a inversão que `codeTheme.ts` documenta e que só a luminância
      // (não o contraste, que é simétrico) consegue provar.
      for (const [normal, bright] of ANSI_CHROMATIC_PAIRS) {
        const ln = relativeLuminance(p.ansi[normal]);
        const lb = relativeLuminance(p.ansi[bright]);
        if (scheme === 'light') {
          assert.ok(lb < ln, `light: ansi.${bright} devia ser mais ESCURO que ansi.${normal}`);
        } else {
          assert.ok(lb > ln, `dark: ansi.${bright} devia ser mais CLARO que ansi.${normal}`);
        }
      }
    });

    it(`[${scheme}] o normal cromático é o valor do estado/sintaxe (sem hex órfã)`, () => {
      assert.equal(p.ansi.red, p.state.error);
      assert.equal(p.ansi.green, p.state.success);
      assert.equal(p.ansi.yellow, p.state.warn);
      assert.equal(p.ansi.cyan, p.state.info);
      assert.equal(p.ansi.magenta, p.syntax.constant);
      // `blue` é a ÚNICA cromática exclusiva do ANSI: a família `info` (h=196)
      // é ciano e ocupa o slot `cyan`; sem uma matiz própria, `blue` e `cyan`
      // sairiam iguais. Ver `blue (ansi)` em `docs/ux-redesign/coderamp.ts`.
      const roles = new Set([
        ...CODE_SYNTAX_ROLES.map((r) => p.syntax[r]),
        ...CODE_STATE_ROLES.map((r) => p.state[r]),
      ]);
      assert.ok(
        !roles.has(p.ansi.blue),
        `${scheme}: ansi.blue ${p.ansi.blue} reciclou uma cor de sintaxe/estado — ele é matiz PRÓPRIA (h≈222)`,
      );
      assert.ok(hueDistance(hueOf(p.ansi.blue), hueOf(p.ansi.cyan)) > HUE_TOLERANCE_DEG);
    });
  }
});

/* ───────────────────────────────────────────────────────────────────────── */

describe('contrato de nomes do terminal — writeLine/terminalBanner não mudam', () => {
  it('a união de nomes é exatamente a de hoje', () => {
    assert.deepEqual(
      [...TERMINAL_COLOR_NAMES],
      ['default', 'green', 'red', 'yellow', 'accent', 'muted', 'cyan'],
    );
  });

  for (const scheme of SCHEMES) {
    const p = codePalette(scheme);
    const map = terminalColors(scheme);

    it(`[${scheme}] o mapa cobre os nomes EXATAMENTE (nem a menos, nem a mais)`, () => {
      assert.deepEqual(Object.keys(map).sort(), [...TERMINAL_COLOR_NAMES].sort());
    });

    it(`[${scheme}] cada nome aponta para um papel da paleta (sem hex órfã)`, () => {
      assert.equal(map.default, p.chrome.ink);
      assert.equal(map.green, p.state.success);
      assert.equal(map.red, p.state.error);
      assert.equal(map.yellow, p.state.warn);
      assert.equal(map.accent, p.syntax.type);
      assert.equal(map.muted, p.state.muted);
      assert.equal(map.cyan, p.state.info);
    });

    it(`[${scheme}] os 7 nomes são 7 cores DIFERENTES (mapa colapsado não passa)`, () => {
      const values = TERMINAL_COLOR_NAMES.map((n) => map[n]);
      assert.equal(new Set(values).size, TERMINAL_COLOR_NAMES.length);
    });

    it(`[${scheme}] toda cor nomeada é legível sobre a superfície do terminal`, () => {
      for (const name of TERMINAL_COLOR_NAMES) {
        const r = contrastRatio(map[name], p.chrome.surface);
        assert.ok(r >= CONTRAST_FLOOR.bodyAA, `terminal "${name}" ${map[name]} = ${r.toFixed(3)}:1`);
      }
    });
  }

  it('os mapas exportados batem com o seletor', () => {
    assert.equal(terminalColors('light'), TERMINAL_CODE_COLORS_LIGHT);
    assert.equal(terminalColors('dark'), TERMINAL_CODE_COLORS_DARK);
  });
});

/* ───────────────────────────────────────────────────────────────────────── */

describe('as duas polaridades são REALMENTE distintas', () => {
  it('nenhuma cor da paleta clara é igual à sua correspondente escura', () => {
    const light = codeColorEntries(CODE_LIGHT);
    const dark = codeColorEntries(CODE_DARK);
    assert.equal(light.length, dark.length);
    assert.ok(light.length > 0);
    for (let i = 0; i < light.length; i += 1) {
      const [label, l] = light[i]!;
      const [, d] = dark[i]!;
      assert.notEqual(l, d, `${label} é a MESMA cor nos dois esquemas (${l}) — polaridade fake`);
    }
  });

  it('nenhum campo do cromo é igual entre os esquemas', () => {
    for (const key of CHROME_KEYS) {
      assert.notEqual(
        CODE_LIGHT.chrome[key],
        CODE_DARK.chrome[key],
        `chrome.${key} idêntico nos dois esquemas`,
      );
    }
  });

  it('a polaridade é de fato oposta: claro tem tinta escura sobre superfície clara', () => {
    // luminância da superfície > luminância da tinta no claro, e o inverso no escuro
    const lightSurfaceIsLighter =
      contrastRatio(CODE_LIGHT.chrome.surface, '#000000') >
      contrastRatio(CODE_LIGHT.chrome.ink, '#000000');
    const darkSurfaceIsDarker =
      contrastRatio(CODE_DARK.chrome.surface, '#000000') <
      contrastRatio(CODE_DARK.chrome.ink, '#000000');
    assert.ok(lightSurfaceIsLighter, 'a paleta clara não é clara');
    assert.ok(darkSurfaceIsDarker, 'a paleta escura não é escura');
  });

  it('nenhuma das duas é Dracula (é esse o defeito que o redesign corrige)', () => {
    const dracula = [
      '#282a36',
      '#f8f8f2',
      '#f8f8f0',
      '#6272a4',
      '#bd93f9',
      '#8be9fd',
      '#50fa7b',
      '#ffb86c',
      '#ff79c6',
      '#ff5555',
      '#f1fa8c',
    ];
    const all = new Set(
      [
        ...codeColorEntries(CODE_LIGHT).map(([, h]) => h),
        ...codeColorEntries(CODE_DARK).map(([, h]) => h),
        ...CHROME_KEYS.flatMap((k) => [CODE_LIGHT.chrome[k], CODE_DARK.chrome[k]]),
      ],
    );
    for (const hex of dracula) {
      assert.ok(!all.has(hex), `a paleta nova ainda contém a cor Dracula ${hex}`);
    }
  });
});

/* ───────────────────────────────────────────────────────────────────────── */

describe('objeto de tema do xterm (ITheme) — pronto para uso', () => {
  for (const scheme of SCHEMES) {
    const p = codePalette(scheme);
    const t = xtermTheme(scheme);

    it(`[${scheme}] fundo/tinta/cursor vêm do cromo da paleta`, () => {
      assert.equal(t.background, p.chrome.surface);
      assert.equal(t.foreground, p.chrome.ink);
      assert.equal(t.cursor, p.chrome.cursor);
      assert.equal(t.cursorAccent, p.chrome.cursorAccent);
      assert.equal(t.selectionBackground, p.chrome.selection);
      assert.equal(t.selectionInactiveBackground, p.chrome.selectionInactive);
    });

    it(`[${scheme}] carrega as 16 cores ANSI (saída de processo real vem com escapes)`, () => {
      for (const key of CODE_ANSI_KEYS) {
        assert.equal(t[key], p.ansi[key]);
      }
    });

    it(`[${scheme}] NÃO fixa selectionForeground (o texto selecionado mantém a cor)`, () => {
      assert.ok(!('selectionForeground' in t));
    });
  }

  it('os temas exportados batem com o seletor', () => {
    assert.equal(xtermTheme('light'), XTERM_THEME_LIGHT);
    assert.equal(xtermTheme('dark'), XTERM_THEME_DARK);
  });
});

/* ───────────────────────────────────────────────────────────────────────── */

describe('tema do CodeMirror — settings + mapa de sintaxe', () => {
  for (const scheme of SCHEMES) {
    const p = codePalette(scheme);
    const s = codeMirrorSettings(scheme);

    it(`[${scheme}] settings espelham o cromo (shape de CreateThemeOptions.settings)`, () => {
      assert.equal(s.background, p.chrome.surface);
      assert.equal(s.foreground, p.chrome.ink);
      assert.equal(s.caret, p.chrome.cursor);
      assert.equal(s.selection, p.chrome.selection);
      assert.equal(s.selectionMatch, p.chrome.selectionInactive);
      assert.equal(s.lineHighlight, p.chrome.currentLine);
      assert.equal(s.gutterBackground, p.chrome.gutterBackground);
      assert.equal(s.gutterForeground, p.chrome.gutterForeground);
      assert.equal(s.gutterActiveForeground, p.chrome.gutterActiveForeground);
      assert.equal(s.gutterBorder, p.chrome.gutterBorder);
    });

    it(`[${scheme}] tipografia de código vem do CODE_TYPOGRAPHY (15px desde a ONDA 1)`, () => {
      assert.equal(s.fontFamily, FONT_STACK.mono);
      assert.equal(s.fontSize, CODE_TYPOGRAPHY.fontSize);
      assert.equal(s.fontSize, '15px');
    });

    it(`[${scheme}] codeMirrorSyntax devolve os 9 papéis da paleta`, () => {
      assert.equal(codeMirrorSyntax(scheme), p.syntax);
      for (const role of CODE_SYNTAX_ROLES) {
        assert.match(codeMirrorSyntax(scheme)[role], HEX);
      }
    });
  }

  it('os settings exportados batem com o seletor', () => {
    assert.equal(codeMirrorSettings('light'), CODEMIRROR_SETTINGS_LIGHT);
    assert.equal(codeMirrorSettings('dark'), CODEMIRROR_SETTINGS_DARK);
  });
});

/* ───────────────────────────────────────────────────────────────────────── */

describe('hexToRgb / truecolorForeground — SGR real para o xterm', () => {
  it('decodifica a superfície escura em {r,g,b}', () => {
    assert.deepEqual(hexToRgb(CODE_DARK.chrome.surface), { r: 0x23, g: 0x27, b: 0x33 });
  });

  it('rejeita hex malformada', () => {
    assert.throws(() => hexToRgb('#ff55'), /hex inválida/);
    assert.throws(() => hexToRgb('232733'), /hex inválida/);
  });

  it('emite truecolor SGR 38;2;r;g;b (o xterm ignora \\x1b[#hexm)', () => {
    assert.equal(truecolorForeground('#2dbe75'), '\x1b[38;2;45;190;117m');
    assert.equal(
      truecolorForeground(TERMINAL_CODE_COLORS_LIGHT.red),
      `\x1b[38;2;${0xaf};${0x2a};${0x16}m`,
    );
  });

  it('toda cor da paleta atravessa o codificador sem erro', () => {
    for (const p of [CODE_LIGHT, CODE_DARK] as CodePalette[]) {
      for (const [, hex] of codeColorEntries(p)) {
        assert.match(truecolorForeground(hex), /^\x1b\[38;2;\d{1,3};\d{1,3};\d{1,3}m$/);
      }
    }
  });
});
