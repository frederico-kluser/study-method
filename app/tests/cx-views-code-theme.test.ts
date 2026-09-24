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
 * contraste/red-flash; ESTE arquivo fixa MAPEAMENTOS e FORMATOS, para que a
 * refatoração não troque a interface de passagem sem que a suíte reprove.
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

  it('codeColorEntries acha TUDO: syntax(9) + state(5) + ansi(16) + 3 de chrome = 33 pares', () => {
    const entradas = codeColorEntries(CODE_LIGHT);
    assert.equal(entradas.length, 9 + 5 + 16 + 3);
    assert.deepEqual(entradas[0], ['syntax.comment', CODE_LIGHT.syntax.comment]);
    assert.deepEqual(entradas[entradas.length - 1], [
      'chrome.gutterActiveForeground',
      CODE_LIGHT.chrome.gutterActiveForeground,
    ]);
  });

  it('animatableCodeColors lista os 7 nomes animáveis, na ordem do contrato', () => {
    assert.deepEqual(
      animatableCodeColors(CODE_DARK).map(([rotulo]) => rotulo),
      ['state.error', 'state.success', 'state.warn', 'state.info', 'chrome.cursor', 'ansi.red', 'ansi.brightRed'],
    );
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
    assert.equal(codeTypography().fontFamily, FONT_STACK.mono);
    assert.equal(codeTypography(), CODE_TYPOGRAPHY, 'o accessor devolve a constante única (sem polaridade)');
  });
});

describe('terminalColors — os nomes semânticos do writeLine', () => {
  it('os sete nomes mapeiam para os papéis certos em cada esquema', () => {
    assert.deepEqual({ ...TERMINAL_CODE_COLORS_LIGHT }, {
      default: CODE_LIGHT.chrome.ink,
      green: CODE_LIGHT.state.success,
      red: CODE_LIGHT.state.error,
      yellow: CODE_LIGHT.state.warn,
      accent: CODE_LIGHT.syntax.type,
      muted: CODE_LIGHT.state.muted,
      cyan: CODE_LIGHT.state.info,
    });
    assert.deepEqual({ ...TERMINAL_CODE_COLORS_DARK }, {
      default: CODE_DARK.chrome.ink,
      green: CODE_DARK.state.success,
      red: CODE_DARK.state.error,
      yellow: CODE_DARK.state.warn,
      accent: CODE_DARK.syntax.type,
      muted: CODE_DARK.state.muted,
      cyan: CODE_DARK.state.info,
    });
  });

  it('o seletor devolve o mapa do esquema (default binário = claro)', () => {
    assert.equal(terminalColors('dark'), TERMINAL_CODE_COLORS_DARK);
    assert.equal(terminalColors('light'), TERMINAL_CODE_COLORS_LIGHT);
    assert.equal(terminalColors('x' as never), TERMINAL_CODE_COLORS_LIGHT);
  });
});

describe('xtermTheme — o tema que vai em new Terminal({ theme })', () => {
  it('o chrome é mapeado campo a campo (well, tinta, cursor, seleções)', () => {
    const esperadoDe = (p: typeof CODE_LIGHT): Record<string, string> => ({
      background: p.chrome.surface,
      foreground: p.chrome.ink,
      cursor: p.chrome.cursor,
      cursorAccent: p.chrome.cursorAccent,
      selectionBackground: p.chrome.selection,
      selectionInactiveBackground: p.chrome.selectionInactive,
    });
    for (const p of [CODE_LIGHT, CODE_DARK]) {
      const t = xtermTheme(p.scheme);
      assert.deepEqual(
        Object.fromEntries(Object.keys(esperadoDe(p)).map((k) => [k, (t as unknown as Record<string, string>)[k]])),
        esperadoDe(p),
        `chrome do esquema ${p.scheme}`,
      );
    }
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
  it('os 12 campos de settings saem do chrome + tipografia compartilhada', () => {
    const s = codeMirrorSettings('dark');
    assert.deepEqual({ ...s }, {
      background: CODE_DARK.chrome.surface,
      foreground: CODE_DARK.chrome.ink,
      caret: CODE_DARK.chrome.cursor,
      selection: CODE_DARK.chrome.selection,
      selectionMatch: CODE_DARK.chrome.selectionInactive,
      lineHighlight: CODE_DARK.chrome.currentLine,
      gutterBackground: CODE_DARK.chrome.gutterBackground,
      gutterForeground: CODE_DARK.chrome.gutterForeground,
      gutterActiveForeground: CODE_DARK.chrome.gutterActiveForeground,
      gutterBorder: CODE_DARK.chrome.gutterBorder,
      fontFamily: CODE_TYPOGRAPHY.fontFamily,
      fontSize: CODE_TYPOGRAPHY.fontSize,
    });
    assert.equal(codeMirrorSettings('light').background, CODE_LIGHT.chrome.surface);
  });

  it('o mapa de sintaxe é a própria fatia `syntax` da paleta (papel → hex)', () => {
    assert.deepEqual({ ...codeMirrorSyntax('dark') }, { ...CODE_DARK.syntax });
    assert.deepEqual({ ...codeMirrorSyntax('light') }, { ...CODE_LIGHT.syntax });
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
