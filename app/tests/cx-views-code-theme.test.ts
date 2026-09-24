/**
 * tests/cx-views-code-theme.test.ts — GOLDEN MASTER da paleta de CÓDIGO
 * (`src/lib/codeTheme.ts`) para as ondas de refatoração.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * O QUE ESTE ARQUIVO É
 * ══════════════════════════════════════════════════════════════════════════
 * Caracterização dos DERIVADOS observáveis da paleta — os pontos de entrada
 * que editor (CodeMirror) e terminal (xterm) consomem — mais as utilidades
 * ANSI (`hexToRgb`/`truecolorForeground`) e a introspecção
 * (`codeColorEntries`/`animatableCodeColors`). tests/codeTheme.test.ts mede
 * contraste/red-flash; ESTE arquivo fixa MAPEAMENTOS, VALORES e FORMATOS,
 * para que a refatoração não troque a interface de passagem nem um hex sem
 * que a suíte reprove.
 *
 * ─── O PINS SÃO LITERAIS (GOLDEN MASTER), E ISSO É O PONTO ────────────────
 * NENHUM valor esperado deste arquivo é lido de `src/`: cada hex aparece
 * escrito à mão, nos blocos `CLARA_ESPERADA`/`ESCURA_ESPERADA` e nos
 * mapeamentos chrome→xterm/codemirror campo a campo. A versão anterior
 * esperava `CODE_LIGHT.syntax.comment` de volta do próprio `CODE_LIGHT` — era
 * auto-referente: trocar `string: '#196941'` por qualquer hex em
 * src/lib/codeTheme.ts mantinha tudo verde, porque o "esperado" mudava junto.
 * Com o pin literal, a MESMA troca reprova (é a prova de mutação do handoff).
 *
 * Escopo: `src/lib/codeTheme.ts` APENAS (confetti/editorTabs ficam de fora).
 *
 * Reprodução: `cd app && npm test -- tests/cx-views-code-theme.test.ts`
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  animatableCodeColors,
  CODE_ANSI_KEYS,
  CODE_DARK,
  CODE_LIGHT,
  CODE_SYNTAX_ROLES,
  CODE_STATE_ROLES,
  CODE_TYPOGRAPHY,
  codeColorEntries,
  codeMirrorSettings,
  codeMirrorSyntax,
  codePalette,
  codeTypography,
  hexToRgb,
  TERMINAL_CODE_COLORS_DARK,
  TERMINAL_CODE_COLORS_LIGHT,
  TERMINAL_COLOR_NAMES,
  terminalColors,
  truecolorForeground,
  xtermTheme,
} from '../src/lib/codeTheme';
import { FONT_STACK } from '../src/lib/designTokens';

/* ─── Os papéis, por extenso (a lista LITERAL que a completude exige) ─────── */

const SYNTAX_ESPERADOS = [
  'comment', 'keyword', 'string', 'number', 'function',
  'type', 'variable', 'operator', 'constant',
];
const STATE_ESPERADOS = ['success', 'error', 'warn', 'info', 'muted'];
const ANSI_ESPERADOS = [
  'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
  'brightBlack', 'brightRed', 'brightGreen', 'brightYellow',
  'brightBlue', 'brightMagenta', 'brightCyan', 'brightWhite',
];
const NOMES_TERMINAL_ESPERADOS = ['default', 'green', 'red', 'yellow', 'accent', 'muted', 'cyan'];

/* ══════════════════════════════════════════════════════════════════════════
 * 0. O GOLDEN MASTER — todos os pares campo→hex das DUAS polaridades,
 *    ESCRITOS À MÃO. Nenhum destes valores vem de src/.
 *
 *    As derivadas de designTokens.ts aparecem aqui RESOLVIDAS (é o valor que
 *    chega à tela que importa): SURFACE_LIGHT.level2 = '#ececf2',
 *    level3 = '#e0e0e8', level4 = '#d9d9e3', INK_LIGHT.primary = '#1d1d1f',
 *    INK_LIGHT.secondary = '#525255', DIVIDER_LIGHT = '#c6c6c8'; e no escuro
 *    SURFACE_DARK.level2 = '#2c2c2e', level3 = '#363638', level4 = '#404042',
 *    INK_DARK.primary = '#f5f5f7', INK_DARK.secondary = '#b8b8bd',
 *    DIVIDER_DARK = '#565659'.
 * ══════════════════════════════════════════════════════════════════════════ */

/** Pilha monoespaçada literal — a que editor e terminal precisam compartilhar. */
const MONO_ESPERADA =
  "'SF Mono', ui-monospace, 'JetBrains Mono Variable', 'JetBrains Mono', Menlo, Consolas, monospace";

const CLARA_ESPERADA = {
  chrome: {
    surface: '#ececf2',
    ink: '#1d1d1f',
    selection: '#d9d9e3',
    selectionInactive: '#e0e0e8',
    currentLine: '#e0e0e8',
    cursor: '#005dbb',
    cursorAccent: '#ececf2',
    gutterBackground: '#ececf2',
    gutterForeground: '#54616d',
    gutterActiveForeground: '#1d1d1f',
    gutterBorder: '#c6c6c8',
    border: '#c6c6c8',
  },
  syntax: {
    comment: '#54616d',
    keyword: '#a4259c',
    string: '#b9221e',
    number: '#484add',
    function: '#2f676e',
    type: '#3a666c',
    variable: '#1d1d1f',
    operator: '#525255',
    constant: '#715d23',
  },
  state: {
    success: '#1c6e31',
    error: '#b8241c',
    warn: '#885300',
    info: '#006690',
    muted: '#54616d',
  },
  ansi: {
    black: '#1d1d1f',
    brightBlack: '#323234',
    white: '#464648',
    brightWhite: '#5b5b5d',
    red: '#b8241c',
    brightRed: '#981e17',
    green: '#1c6e31',
    brightGreen: '#145a25',
    yellow: '#885300',
    brightYellow: '#704400',
    blue: '#2057ce',
    brightBlue: '#1a47a9',
    magenta: '#9411d7',
    brightMagenta: '#7b0eb2',
    cyan: '#006690',
    brightCyan: '#005477',
  },
} as const;

const ESCURA_ESPERADA = {
  chrome: {
    surface: '#2c2c2e',
    ink: '#f5f5f7',
    selection: '#404042',
    selectionInactive: '#363638',
    currentLine: '#363638',
    cursor: '#61b0ff',
    cursorAccent: '#2c2c2e',
    gutterBackground: '#2c2c2e',
    gutterForeground: '#a1adb7',
    gutterActiveForeground: '#f5f5f7',
    gutterBorder: '#565659',
    border: '#565659',
  },
  syntax: {
    comment: '#a1adb7',
    keyword: '#e58cdf',
    string: '#f2908d',
    number: '#a3a5ee',
    function: '#6bb7c0',
    type: '#7fb4ba',
    variable: '#f5f5f7',
    operator: '#b8b8bd',
    constant: '#c8a84b',
  },
  state: {
    success: '#32c457',
    error: '#ff8982',
    warn: '#f59500',
    info: '#03b6ff',
    muted: '#a1adb7',
  },
  ansi: {
    black: '#acacae',
    brightBlack: '#c0c0c2',
    white: '#d7d7d9',
    brightWhite: '#ececee',
    red: '#ff8982',
    brightRed: '#ff9f99',
    green: '#32c457',
    brightGreen: '#35d35c',
    yellow: '#f59500',
    brightYellow: '#ffa416',
    blue: '#8cabed',
    brightBlue: '#9eb8f0',
    magenta: '#d491f6',
    brightMagenta: '#dba3f8',
    cyan: '#03b6ff',
    brightCyan: '#36c5ff',
  },
} as const;

describe('GOLDEN MASTER — as duas paletas campo a campo, hex por hex (literais)', () => {
  it('CODE_LIGHT é EXATAMENTE os 42 pares esperados (chrome 12 · syntax 9 · state 5 · ansi 16)', () => {
    assert.equal(CODE_LIGHT.scheme, 'light');
    assert.deepEqual({ ...CODE_LIGHT.chrome }, CLARA_ESPERADA.chrome, 'chrome claro');
    assert.deepEqual({ ...CODE_LIGHT.syntax }, CLARA_ESPERADA.syntax, 'syntax claro');
    assert.deepEqual({ ...CODE_LIGHT.state }, CLARA_ESPERADA.state, 'state claro');
    assert.deepEqual({ ...CODE_LIGHT.ansi }, CLARA_ESPERADA.ansi, 'ansi claro');
  });

  it('CODE_DARK é EXATAMENTE os 42 pares esperados (chrome 12 · syntax 9 · state 5 · ansi 16)', () => {
    assert.equal(CODE_DARK.scheme, 'dark');
    assert.deepEqual({ ...CODE_DARK.chrome }, ESCURA_ESPERADA.chrome, 'chrome escuro');
    assert.deepEqual({ ...CODE_DARK.syntax }, ESCURA_ESPERADA.syntax, 'syntax escuro');
    assert.deepEqual({ ...CODE_DARK.state }, ESCURA_ESPERADA.state, 'state escuro');
    assert.deepEqual({ ...CODE_DARK.ansi }, ESCURA_ESPERADA.ansi, 'ansi escuro');
  });

  it('nenhum hex do golden master se repete entre as polaridades no mesmo campo', () => {
    for (const papel of SYNTAX_ESPERADOS) {
      const l = CLARA_ESPERADA.syntax[papel as keyof typeof CLARA_ESPERADA.syntax];
      const d = ESCURA_ESPERADA.syntax[papel as keyof typeof ESCURA_ESPERADA.syntax];
      assert.notEqual(l, d, `syntax.${papel} igual nas duas polaridades`);
    }
    for (const papel of STATE_ESPERADOS) {
      const l = CLARA_ESPERADA.state[papel as keyof typeof CLARA_ESPERADA.state];
      const d = ESCURA_ESPERADA.state[papel as keyof typeof ESCURA_ESPERADA.state];
      assert.notEqual(l, d, `state.${papel} igual nas duas polaridades`);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * 1. VOLUMETRIA — as tabelas têm EXATAMENTE os papéis do contrato
 * ══════════════════════════════════════════════════════════════════════════ */

describe('as listas de papéis (a fonte da completude)', () => {
  it('9 papéis de sintaxe, 5 de estado, 16 ANSI, 7 nomes de writeLine — nas ordens do contrato', () => {
    assert.deepEqual([...CODE_SYNTAX_ROLES], SYNTAX_ESPERADOS);
    assert.deepEqual([...CODE_STATE_ROLES], STATE_ESPERADOS);
    assert.deepEqual([...CODE_ANSI_KEYS], ANSI_ESPERADOS);
    assert.deepEqual([...TERMINAL_COLOR_NAMES], NOMES_TERMINAL_ESPERADOS);
  });

  it('todas as folhas das duas paletas são hex #rrggbb válidas', () => {
    for (const p of [CODE_LIGHT, CODE_DARK]) {
      for (const [rotulo, hex] of codeColorEntries(p)) {
        assert.match(hex, /^#[0-9a-f]{6}$/i, `${p.scheme}.${rotulo} = "${hex}"`);
      }
    }
  });

  it('codeColorEntries acha TUDO: syntax(9) + state(5) + ansi(16) + 3 de chrome = 33 pares LITERAIS', () => {
    const esperadoClaro: readonly (readonly [string, string])[] = [
      ['syntax.comment', '#54616d'],
      ['syntax.keyword', '#a4259c'],
      ['syntax.string', '#b9221e'],
      ['syntax.number', '#484add'],
      ['syntax.function', '#2f676e'],
      ['syntax.type', '#3a666c'],
      ['syntax.variable', '#1d1d1f'],
      ['syntax.operator', '#525255'],
      ['syntax.constant', '#715d23'],
      ['state.success', '#1c6e31'],
      ['state.error', '#b8241c'],
      ['state.warn', '#885300'],
      ['state.info', '#006690'],
      ['state.muted', '#54616d'],
      ['ansi.black', '#1d1d1f'],
      ['ansi.red', '#b8241c'],
      ['ansi.green', '#1c6e31'],
      ['ansi.yellow', '#885300'],
      ['ansi.blue', '#2057ce'],
      ['ansi.magenta', '#9411d7'],
      ['ansi.cyan', '#006690'],
      ['ansi.white', '#464648'],
      ['ansi.brightBlack', '#323234'],
      ['ansi.brightRed', '#981e17'],
      ['ansi.brightGreen', '#145a25'],
      ['ansi.brightYellow', '#704400'],
      ['ansi.brightBlue', '#1a47a9'],
      ['ansi.brightMagenta', '#7b0eb2'],
      ['ansi.brightCyan', '#005477'],
      ['ansi.brightWhite', '#5b5b5d'],
      ['chrome.cursor', '#005dbb'],
      ['chrome.gutterForeground', '#54616d'],
      ['chrome.gutterActiveForeground', '#1d1d1f'],
    ];
    const esperadoEscuro: readonly (readonly [string, string])[] = [
      ['syntax.comment', '#a1adb7'],
      ['syntax.keyword', '#e58cdf'],
      ['syntax.string', '#f2908d'],
      ['syntax.number', '#a3a5ee'],
      ['syntax.function', '#6bb7c0'],
      ['syntax.type', '#7fb4ba'],
      ['syntax.variable', '#f5f5f7'],
      ['syntax.operator', '#b8b8bd'],
      ['syntax.constant', '#c8a84b'],
      ['state.success', '#32c457'],
      ['state.error', '#ff8982'],
      ['state.warn', '#f59500'],
      ['state.info', '#03b6ff'],
      ['state.muted', '#a1adb7'],
      ['ansi.black', '#acacae'],
      ['ansi.red', '#ff8982'],
      ['ansi.green', '#32c457'],
      ['ansi.yellow', '#f59500'],
      ['ansi.blue', '#8cabed'],
      ['ansi.magenta', '#d491f6'],
      ['ansi.cyan', '#03b6ff'],
      ['ansi.white', '#d7d7d9'],
      ['ansi.brightBlack', '#c0c0c2'],
      ['ansi.brightRed', '#ff9f99'],
      ['ansi.brightGreen', '#35d35c'],
      ['ansi.brightYellow', '#ffa416'],
      ['ansi.brightBlue', '#9eb8f0'],
      ['ansi.brightMagenta', '#dba3f8'],
      ['ansi.brightCyan', '#36c5ff'],
      ['ansi.brightWhite', '#ececee'],
      ['chrome.cursor', '#61b0ff'],
      ['chrome.gutterForeground', '#a1adb7'],
      ['chrome.gutterActiveForeground', '#f5f5f7'],
    ];
    assert.deepEqual([...codeColorEntries(CODE_LIGHT)], [...esperadoClaro]);
    assert.deepEqual([...codeColorEntries(CODE_DARK)], [...esperadoEscuro]);
  });

  it('animatableCodeColors lista os 7 nomes animáveis, com os hex LITERAIS, na ordem do contrato', () => {
    assert.deepEqual(
      animatableCodeColors(CODE_DARK).map(([rotulo]) => rotulo),
      ['state.error', 'state.success', 'state.warn', 'state.info', 'chrome.cursor', 'ansi.red', 'ansi.brightRed'],
    );
    assert.deepEqual([...animatableCodeColors(CODE_LIGHT)], [
      ['state.error', '#b8241c'],
      ['state.success', '#1c6e31'],
      ['state.warn', '#885300'],
      ['state.info', '#006690'],
      ['chrome.cursor', '#005dbb'],
      ['ansi.red', '#b8241c'],
      ['ansi.brightRed', '#981e17'],
    ]);
    assert.deepEqual([...animatableCodeColors(CODE_DARK)], [
      ['state.error', '#ff8982'],
      ['state.success', '#32c457'],
      ['state.warn', '#f59500'],
      ['state.info', '#03b6ff'],
      ['chrome.cursor', '#61b0ff'],
      ['ansi.red', '#ff8982'],
      ['ansi.brightRed', '#ff9f99'],
    ]);
    for (const [rotulo, hex] of animatableCodeColors(CODE_LIGHT)) {
      assert.match(hex, /^#[0-9a-f]{6}$/i, `animável ${rotulo}`);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * 2. OS PONTOS DE ENTRADA — o que editor e terminal leem
 * ══════════════════════════════════════════════════════════════════════════ */

describe('codePalette — o seletor por esquema', () => {
  it("'dark' devolve a escura; 'light' e QUALQUER OUTRA coisa devolvem a clara", () => {
    assert.equal(codePalette('dark'), CODE_DARK);
    assert.equal(codePalette('light'), CODE_LIGHT);
    // Caracterização do default atual: o seletor é binário (`=== 'dark'`).
    assert.equal(codePalette('DARK' as never), CODE_LIGHT);
    assert.equal(codePalette(undefined as never), CODE_LIGHT);
  });

  it('as duas polaridades são de fato DIFERENTES (nada de uma paleta só)', () => {
    assert.notEqual(CODE_LIGHT.scheme, CODE_DARK.scheme);
    for (const role of SYNTAX_ESPERADOS) {
      const l = CODE_LIGHT.syntax[role as keyof typeof CODE_LIGHT.syntax];
      const d = CODE_DARK.syntax[role as keyof typeof CODE_DARK.syntax];
      assert.notEqual(l, d, `syntax.${role} igual nas duas polaridades`);
    }
  });
});

describe('codeTypography — UMA tipografia para editor E terminal', () => {
  it('as DUAS FORMAS do mesmo número: px numérico (xterm) e string com unidade (CodeMirror)', () => {
    const t = codeTypography();
    assert.equal(t.fontSizePx, 15);
    assert.equal(t.fontSize, '15px');
    assert.equal(t.fontSize, `${t.fontSizePx}px`, 'as duas formas nunca divergem');
  });

  it('a pilha é a MESMA de FONT_STACK.mono (só a variável empacotada resolve de verdade)', () => {
    assert.equal(codeTypography().fontFamily, MONO_ESPERADA, 'a pilha literal do golden master');
    assert.equal(codeTypography().fontFamily, FONT_STACK.mono, 'o contrato: MESMA de FONT_STACK.mono');
    assert.equal(codeTypography(), CODE_TYPOGRAPHY, 'o accessor devolve a constante única (sem polaridade)');
  });
});

describe('terminalColors — os nomes semânticos do writeLine', () => {
  it('os sete nomes mapeiam para os hex LITERAIS certos em cada esquema', () => {
    assert.deepEqual({ ...TERMINAL_CODE_COLORS_LIGHT }, {
      default: '#1d1d1f',
      green: '#1c6e31',
      red: '#b8241c',
      yellow: '#885300',
      accent: '#3a666c',
      muted: '#54616d',
      cyan: '#006690',
    });
    assert.deepEqual({ ...TERMINAL_CODE_COLORS_DARK }, {
      default: '#f5f5f7',
      green: '#32c457',
      red: '#ff8982',
      yellow: '#f59500',
      accent: '#7fb4ba',
      muted: '#a1adb7',
      cyan: '#03b6ff',
    });
  });

  it('o seletor devolve o mapa do esquema (default binário = claro)', () => {
    assert.equal(terminalColors('dark'), TERMINAL_CODE_COLORS_DARK);
    assert.equal(terminalColors('light'), TERMINAL_CODE_COLORS_LIGHT);
    assert.equal(terminalColors('x' as never), TERMINAL_CODE_COLORS_LIGHT);
  });
});

describe('xtermTheme — o tema que vai em new Terminal({ theme })', () => {
  it('o tema CLARO sai campo a campo, com hex LITERAIS (chrome 6 + tabela ANSI 16)', () => {
    assert.deepEqual({ ...xtermTheme('light') }, {
      background: '#ececf2',
      foreground: '#1d1d1f',
      cursor: '#005dbb',
      cursorAccent: '#ececf2',
      selectionBackground: '#d9d9e3',
      selectionInactiveBackground: '#e0e0e8',
      black: '#1d1d1f',
      red: '#b8241c',
      green: '#1c6e31',
      yellow: '#885300',
      blue: '#2057ce',
      magenta: '#9411d7',
      cyan: '#006690',
      white: '#464648',
      brightBlack: '#323234',
      brightRed: '#981e17',
      brightGreen: '#145a25',
      brightYellow: '#704400',
      brightBlue: '#1a47a9',
      brightMagenta: '#7b0eb2',
      brightCyan: '#005477',
      brightWhite: '#5b5b5d',
    });
  });

  it('o tema ESCURO sai campo a campo, com hex LITERAIS (chrome 6 + tabela ANSI 16)', () => {
    assert.deepEqual({ ...xtermTheme('dark') }, {
      background: '#2c2c2e',
      foreground: '#f5f5f7',
      cursor: '#61b0ff',
      cursorAccent: '#2c2c2e',
      selectionBackground: '#404042',
      selectionInactiveBackground: '#363638',
      black: '#acacae',
      red: '#ff8982',
      green: '#32c457',
      yellow: '#f59500',
      blue: '#8cabed',
      magenta: '#d491f6',
      cyan: '#03b6ff',
      white: '#d7d7d9',
      brightBlack: '#c0c0c2',
      brightRed: '#ff9f99',
      brightGreen: '#35d35c',
      brightYellow: '#ffa416',
      brightBlue: '#9eb8f0',
      brightMagenta: '#dba3f8',
      brightCyan: '#36c5ff',
      brightWhite: '#ececee',
    });
  });

  it('a tabela ANSI vai junto, com as 16 chaves — e SEM selectionForeground', () => {
    for (const scheme of ['light', 'dark'] as const) {
      const t = xtermTheme(scheme) as unknown as Record<string, string>;
      for (const key of ANSI_ESPERADOS) {
        assert.equal(typeof t[key], 'string', `ansi.${key} ausente no esquema ${scheme}`);
      }
      // Fixá-lo apagaria a cor de sintaxe do texto selecionado — fica ausente
      // DE PROPÓSITO e esta asserção é o que impede um "conserto" silencioso.
      assert.equal('selectionForeground' in t, false);
    }
  });
});

describe('codeMirrorSettings / codeMirrorSyntax — o contrato do editor', () => {
  it('os 12 campos de settings CLAROS saem campo a campo, com hex LITERAIS', () => {
    assert.deepEqual({ ...codeMirrorSettings('light') }, {
      background: '#ececf2',
      foreground: '#1d1d1f',
      caret: '#005dbb',
      selection: '#d9d9e3',
      selectionMatch: '#e0e0e8',
      lineHighlight: '#e0e0e8',
      gutterBackground: '#ececf2',
      gutterForeground: '#54616d',
      gutterActiveForeground: '#1d1d1f',
      gutterBorder: '#c6c6c8',
      fontFamily: MONO_ESPERADA,
      fontSize: '15px',
    });
  });

  it('os 12 campos de settings ESCUROS saem campo a campo, com hex LITERAIS', () => {
    assert.deepEqual({ ...codeMirrorSettings('dark') }, {
      background: '#2c2c2e',
      foreground: '#f5f5f7',
      caret: '#61b0ff',
      selection: '#404042',
      selectionMatch: '#363638',
      lineHighlight: '#363638',
      gutterBackground: '#2c2c2e',
      gutterForeground: '#a1adb7',
      gutterActiveForeground: '#f5f5f7',
      gutterBorder: '#565659',
      fontFamily: MONO_ESPERADA,
      fontSize: '15px',
    });
  });

  it('o mapa de sintaxe (papel → hex) é fixado nos NOVE literais de cada esquema', () => {
    assert.deepEqual({ ...codeMirrorSyntax('light') }, {
      comment: '#54616d',
      keyword: '#a4259c',
      string: '#b9221e',
      number: '#484add',
      function: '#2f676e',
      type: '#3a666c',
      variable: '#1d1d1f',
      operator: '#525255',
      constant: '#715d23',
    });
    assert.deepEqual({ ...codeMirrorSyntax('dark') }, {
      comment: '#a1adb7',
      keyword: '#e58cdf',
      string: '#f2908d',
      number: '#a3a5ee',
      function: '#6bb7c0',
      type: '#7fb4ba',
      variable: '#f5f5f7',
      operator: '#b8b8bd',
      constant: '#c8a84b',
    });
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * 3. UTILIDADES ANSI (o terminal depende delas)
 * ══════════════════════════════════════════════════════════════════════════ */

describe('hexToRgb / truecolorForeground', () => {
  it('converte #rrggbb nos três canais (com ou sem #, qualquer caixa, com espaços)', () => {
    assert.deepEqual(hexToRgb('#ffffff'), { r: 255, g: 255, b: 255 });
    assert.deepEqual(hexToRgb('#000000'), { r: 0, g: 0, b: 0 });
    assert.deepEqual(hexToRgb('  #Af2A16 '), { r: 175, g: 42, b: 22 });
  });

  it('entrada fora do formato #rrggbb LANÇA (o xterm não entende hex curta nem rgb())', () => {
    for (const ruim of ['', '#fff', 'ffffff', '#12345g', 'rgb(0,0,0)', '#1234567']) {
      assert.throws(() => hexToRgb(ruim), /hex inválida/, `entrada "${ruim}" deveria lançar`);
    }
  });

  it('truecolorForeground emite SGR 38;2;r;g;b — a sequência que o xterm entende', () => {
    assert.equal(truecolorForeground('#af2a16'), '\x1b[38;2;175;42;22m');
    assert.equal(truecolorForeground('#000000'), '\x1b[38;2;0;0;0m');
  });

  it('truecolorForeground propaga o erro de hex inválida (não emite ANSI lixo)', () => {
    assert.throws(() => truecolorForeground('#nope'), /hex inválida/);
  });
});
