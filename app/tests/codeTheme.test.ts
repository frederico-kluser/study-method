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
} from '../src/lib/codeTheme';
import {
  SURFACE_LIGHT,
  SURFACE_DARK,
  INK_LIGHT,
  INK_DARK,
  FONT_STACK,
  TYPE,
  CONTRAST_FLOOR,
  CELEBRATION,
  contrastRatio,
  redFlashRatio,
  isRedFlashColor,
} from '../src/lib/designTokens';

const HEX = /^#[0-9a-f]{6}$/;

const SCHEMES: readonly CodeScheme[] = ['light', 'dark'];

/** 9 papéis de sintaxe + 5 de estado + 16 ANSI + 3 do cromo. */
const EXPECTED_COLOR_ENTRIES = 9 + 5 + 16 + 3;

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

    it(`[${scheme}] tipografia de código vem dos tokens congelados`, () => {
      assert.equal(s.fontFamily, FONT_STACK.mono);
      assert.equal(s.fontSize, `${TYPE.codeSize}px`);
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
