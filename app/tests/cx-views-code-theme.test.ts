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
 *    chega à tela que importa): SURFACE_LIGHT.level2 = '#f3eee5',
 *    level3 = '#e9e2d6', level4 = '#ddd5c6', INK_LIGHT.primary = '#191713',
 *    INK_LIGHT.secondary = '#544e45', DIVIDER_LIGHT = '#ddd5c6'; e no escuro
 *    SURFACE_DARK.level2 = '#272727', level3 = '#313131', level4 = '#3b3b3b',
 *    INK_DARK.primary = '#f0f0f0', INK_DARK.secondary = '#adadad',
 *    DIVIDER_DARK = '#4d4d4d'.
 * ══════════════════════════════════════════════════════════════════════════ */

/** Pilha monoespaçada literal — a que editor e terminal precisam compartilhar. */
const MONO_ESPERADA =
  "'JetBrains Mono Variable', 'JetBrains Mono', 'SFMono-Regular', Menlo, Consolas, monospace";

const CLARA_ESPERADA = {
  chrome: {
    surface: '#f3eee5',
    ink: '#191713',
    selection: '#ddd5c6',
    selectionInactive: '#e9e2d6',
    currentLine: '#e9e2d6',
    cursor: '#af2a16',
    cursorAccent: '#f3eee5',
    gutterBackground: '#f3eee5',
    gutterForeground: '#525d6d',
    gutterActiveForeground: '#191713',
    gutterBorder: '#ddd5c6',
    border: '#ddd5c6',
  },
  syntax: {
    comment: '#525d6d',
    keyword: '#af2a16',
    string: '#196941',
    number: '#7f5305',
    function: '#0b6484',
    type: '#812fc8',
    variable: '#191713',
    operator: '#544e45',
    constant: '#ad1f66',
  },
  state: {
    success: '#196941',
    error: '#af2a16',
    warn: '#7f5305',
    info: '#0b6484',
    muted: '#525d6d',
  },
  ansi: {
    black: '#191713',
    brightBlack: '#46505d',
    white: '#525d6d',
    brightWhite: '#544e45',
    red: '#af2a16',
    brightRed: '#962413',
    green: '#196941',
    brightGreen: '#155b38',
    yellow: '#7f5305',
    brightYellow: '#6e4705',
    blue: '#2c57bc',
    brightBlue: '#254a9f',
    magenta: '#ad1f66',
    brightMagenta: '#961a58',
    cyan: '#0b6484',
    brightCyan: '#095571',
  },
} as const;

const ESCURA_ESPERADA = {
  chrome: {
    surface: '#272727',
    ink: '#f0f0f0',
    selection: '#3b3b3b',
    selectionInactive: '#313131',
    currentLine: '#313131',
    cursor: '#f08a7a',
    cursorAccent: '#272727',
    gutterBackground: '#272727',
    gutterForeground: '#9ca7b7',
    gutterActiveForeground: '#f0f0f0',
    gutterBorder: '#4d4d4d',
    border: '#4d4d4d',
  },
  syntax: {
    comment: '#9ca7b7',
    keyword: '#f08a7a',
    string: '#2dbe75',
    number: '#e4950c',
    function: '#23b2e7',
    type: '#c494ee',
    variable: '#f0f0f0',
    operator: '#adadad',
    constant: '#eb86b9',
  },
  state: {
    success: '#2dbe75',
    error: '#f08a7a',
    warn: '#e4950c',
    info: '#23b2e7',
    muted: '#9ca7b7',
  },
  ansi: {
    black: '#9ca7b7',
    brightBlack: '#a9b3c1',
    white: '#adadad',
    brightWhite: '#f0f0f0',
    red: '#f08a7a',
    brightRed: '#f39c8f',
    green: '#2dbe75',
    brightGreen: '#30cc7e',
    yellow: '#e4950c',
    brightYellow: '#f3a114',
    blue: '#8ba6e4',
    brightBlue: '#9cb3e8',
    magenta: '#eb86b9',
    brightMagenta: '#ee98c3',
    cyan: '#23b2e7',
    brightCyan: '#47bfeb',
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
      ['syntax.comment', '#525d6d'],
      ['syntax.keyword', '#af2a16'],
      ['syntax.string', '#196941'],
      ['syntax.number', '#7f5305'],
      ['syntax.function', '#0b6484'],
      ['syntax.type', '#812fc8'],
      ['syntax.variable', '#191713'],
      ['syntax.operator', '#544e45'],
      ['syntax.constant', '#ad1f66'],
      ['state.success', '#196941'],
      ['state.error', '#af2a16'],
      ['state.warn', '#7f5305'],
      ['state.info', '#0b6484'],
      ['state.muted', '#525d6d'],
      ['ansi.black', '#191713'],
      ['ansi.red', '#af2a16'],
      ['ansi.green', '#196941'],
      ['ansi.yellow', '#7f5305'],
      ['ansi.blue', '#2c57bc'],
      ['ansi.magenta', '#ad1f66'],
      ['ansi.cyan', '#0b6484'],
      ['ansi.white', '#525d6d'],
      ['ansi.brightBlack', '#46505d'],
      ['ansi.brightRed', '#962413'],
      ['ansi.brightGreen', '#155b38'],
      ['ansi.brightYellow', '#6e4705'],
      ['ansi.brightBlue', '#254a9f'],
      ['ansi.brightMagenta', '#961a58'],
      ['ansi.brightCyan', '#095571'],
      ['ansi.brightWhite', '#544e45'],
      ['chrome.cursor', '#af2a16'],
      ['chrome.gutterForeground', '#525d6d'],
      ['chrome.gutterActiveForeground', '#191713'],
    ];
    const esperadoEscuro: readonly (readonly [string, string])[] = [
      ['syntax.comment', '#9ca7b7'],
      ['syntax.keyword', '#f08a7a'],
      ['syntax.string', '#2dbe75'],
      ['syntax.number', '#e4950c'],
      ['syntax.function', '#23b2e7'],
      ['syntax.type', '#c494ee'],
      ['syntax.variable', '#f0f0f0'],
      ['syntax.operator', '#adadad'],
      ['syntax.constant', '#eb86b9'],
      ['state.success', '#2dbe75'],
      ['state.error', '#f08a7a'],
      ['state.warn', '#e4950c'],
      ['state.info', '#23b2e7'],
      ['state.muted', '#9ca7b7'],
      ['ansi.black', '#9ca7b7'],
      ['ansi.red', '#f08a7a'],
      ['ansi.green', '#2dbe75'],
      ['ansi.yellow', '#e4950c'],
      ['ansi.blue', '#8ba6e4'],
      ['ansi.magenta', '#eb86b9'],
      ['ansi.cyan', '#23b2e7'],
      ['ansi.white', '#adadad'],
      ['ansi.brightBlack', '#a9b3c1'],
      ['ansi.brightRed', '#f39c8f'],
      ['ansi.brightGreen', '#30cc7e'],
      ['ansi.brightYellow', '#f3a114'],
      ['ansi.brightBlue', '#9cb3e8'],
      ['ansi.brightMagenta', '#ee98c3'],
      ['ansi.brightCyan', '#47bfeb'],
      ['ansi.brightWhite', '#f0f0f0'],
      ['chrome.cursor', '#f08a7a'],
      ['chrome.gutterForeground', '#9ca7b7'],
      ['chrome.gutterActiveForeground', '#f0f0f0'],
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
      ['state.error', '#af2a16'],
      ['state.success', '#196941'],
      ['state.warn', '#7f5305'],
      ['state.info', '#0b6484'],
      ['chrome.cursor', '#af2a16'],
      ['ansi.red', '#af2a16'],
      ['ansi.brightRed', '#962413'],
    ]);
    assert.deepEqual([...animatableCodeColors(CODE_DARK)], [
      ['state.error', '#f08a7a'],
      ['state.success', '#2dbe75'],
      ['state.warn', '#e4950c'],
      ['state.info', '#23b2e7'],
      ['chrome.cursor', '#f08a7a'],
      ['ansi.red', '#f08a7a'],
      ['ansi.brightRed', '#f39c8f'],
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
      default: '#191713',
      green: '#196941',
      red: '#af2a16',
      yellow: '#7f5305',
      accent: '#812fc8',
      muted: '#525d6d',
      cyan: '#0b6484',
    });
    assert.deepEqual({ ...TERMINAL_CODE_COLORS_DARK }, {
      default: '#f0f0f0',
      green: '#2dbe75',
      red: '#f08a7a',
      yellow: '#e4950c',
      accent: '#c494ee',
      muted: '#9ca7b7',
      cyan: '#23b2e7',
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
      background: '#f3eee5',
      foreground: '#191713',
      cursor: '#af2a16',
      cursorAccent: '#f3eee5',
      selectionBackground: '#ddd5c6',
      selectionInactiveBackground: '#e9e2d6',
      black: '#191713',
      red: '#af2a16',
      green: '#196941',
      yellow: '#7f5305',
      blue: '#2c57bc',
      magenta: '#ad1f66',
      cyan: '#0b6484',
      white: '#525d6d',
      brightBlack: '#46505d',
      brightRed: '#962413',
      brightGreen: '#155b38',
      brightYellow: '#6e4705',
      brightBlue: '#254a9f',
      brightMagenta: '#961a58',
      brightCyan: '#095571',
      brightWhite: '#544e45',
    });
  });

  it('o tema ESCURO sai campo a campo, com hex LITERAIS (chrome 6 + tabela ANSI 16)', () => {
    assert.deepEqual({ ...xtermTheme('dark') }, {
      background: '#272727',
      foreground: '#f0f0f0',
      cursor: '#f08a7a',
      cursorAccent: '#272727',
      selectionBackground: '#3b3b3b',
      selectionInactiveBackground: '#313131',
      black: '#9ca7b7',
      red: '#f08a7a',
      green: '#2dbe75',
      yellow: '#e4950c',
      blue: '#8ba6e4',
      magenta: '#eb86b9',
      cyan: '#23b2e7',
      white: '#adadad',
      brightBlack: '#a9b3c1',
      brightRed: '#f39c8f',
      brightGreen: '#30cc7e',
      brightYellow: '#f3a114',
      brightBlue: '#9cb3e8',
      brightMagenta: '#ee98c3',
      brightCyan: '#47bfeb',
      brightWhite: '#f0f0f0',
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
      background: '#f3eee5',
      foreground: '#191713',
      caret: '#af2a16',
      selection: '#ddd5c6',
      selectionMatch: '#e9e2d6',
      lineHighlight: '#e9e2d6',
      gutterBackground: '#f3eee5',
      gutterForeground: '#525d6d',
      gutterActiveForeground: '#191713',
      gutterBorder: '#ddd5c6',
      fontFamily: MONO_ESPERADA,
      fontSize: '15px',
    });
  });

  it('os 12 campos de settings ESCUROS saem campo a campo, com hex LITERAIS', () => {
    assert.deepEqual({ ...codeMirrorSettings('dark') }, {
      background: '#272727',
      foreground: '#f0f0f0',
      caret: '#f08a7a',
      selection: '#3b3b3b',
      selectionMatch: '#313131',
      lineHighlight: '#313131',
      gutterBackground: '#272727',
      gutterForeground: '#9ca7b7',
      gutterActiveForeground: '#f0f0f0',
      gutterBorder: '#4d4d4d',
      fontFamily: MONO_ESPERADA,
      fontSize: '15px',
    });
  });

  it('o mapa de sintaxe (papel → hex) é fixado nos NOVE literais de cada esquema', () => {
    assert.deepEqual({ ...codeMirrorSyntax('light') }, {
      comment: '#525d6d',
      keyword: '#af2a16',
      string: '#196941',
      number: '#7f5305',
      function: '#0b6484',
      type: '#812fc8',
      variable: '#191713',
      operator: '#544e45',
      constant: '#ad1f66',
    });
    assert.deepEqual({ ...codeMirrorSyntax('dark') }, {
      comment: '#9ca7b7',
      keyword: '#f08a7a',
      string: '#2dbe75',
      number: '#e4950c',
      function: '#23b2e7',
      type: '#c494ee',
      variable: '#f0f0f0',
      operator: '#adadad',
      constant: '#eb86b9',
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
