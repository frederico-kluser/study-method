/**
 * tests/theme.test.ts — contrato do tema MUI v9 do shell (onda 7 → 11 → 20B).
 * Sem jsdom: `createTheme`/`theme` são puros (não exigem DOM). Cobre:
 *  - colorSchemes light e dark habilitados (claro+escuro, onda 11);
 *  - colorSchemeSelector === 'class' (toggle manual habilitado);
 *  - cssVariables: true (mecanismo v6+/v9, anti-flicker);
 *  - shape.borderRadius === 8; typografia fontSize 14;
 *  - ONDA 20B: scheme dark = paleta Dracula canônica (valores EXATOS vindos de
 *    src/lib/draculaTheme.ts: bg #282a36, text.primary #f8f8f2, primary #bd93f9,
 *    tertiary #8be9fd) + contraste WCAG 2.2 ≥ 4.5:1 MEDIDO no teste (função de
 *    contraste local): text.secondary sobre bg e paper, primary.contrastText
 *    sobre primary, tertiary sobre bg;
 *  - primary do scheme LIGHT = #1565c0 (azul legível, INTACTO na onda 20B).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { theme } from '../src/theme';

/* ─── Contraste WCAG 2.x (função local — mesma fórmula do skill MUI Regra 5) ── */

function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  assert.ok(m, `hex inválida: ${hex}`);
  const n = Number.parseInt(m[1]!, 16);
  const [r, g, b] = [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Razão de contraste WCAG entre duas cores hex (#rrggbb). */
function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Paleta do scheme dark tipada para leitura de cores (cast de teste). */
function darkColors(): {
  background: { default: string; paper: string };
  text: { primary: string; secondary: string };
  primary: { main: string; contrastText: string };
  tertiary: { main: string };
  divider: string;
} {
  const p = (theme as unknown as {
    colorSchemes?: {
      dark?: {
        palette?: {
          background?: { default?: string; paper?: string };
          text?: { primary?: string; secondary?: string };
          primary?: { main?: string; contrastText?: string };
          tertiary?: { main?: string };
          divider?: string;
        };
      };
    };
  }).colorSchemes?.dark?.palette;
  assert.ok(p, 'palette dark deve existir');
  const c = {
    background: {
      default: p?.background?.default ?? '',
      paper: p?.background?.paper ?? '',
    },
    text: { primary: p?.text?.primary ?? '', secondary: p?.text?.secondary ?? '' },
    primary: { main: p?.primary?.main ?? '', contrastText: p?.primary?.contrastText ?? '' },
    tertiary: { main: p?.tertiary?.main ?? '' },
    divider: p?.divider ?? '',
  };
  for (const v of [
    c.background.default,
    c.background.paper,
    c.text.primary,
    c.text.secondary,
    c.primary.main,
    c.primary.contrastText,
    c.tertiary.main,
    c.divider,
  ]) {
    assert.match(v, /^#[0-9a-f]{6}$/i, `cor dark ausente/inválida: "${v}"`);
  }
  return c;
}

describe('theme (MUI v9) — claro+escuro com toggle', () => {
  it('habilita os DOIS esquemas via colorSchemes.light e colorSchemes.dark', () => {
    const schemes = (theme as unknown as {
      colorSchemes?: { light?: unknown; dark?: unknown };
    }).colorSchemes;
    assert.ok(schemes?.light != null, 'colorSchemes.light deve estar habilitado');
    assert.ok(schemes?.dark != null, 'colorSchemes.dark deve estar habilitado');
  });

  it('usa colorSchemeSelector class (permite toggle manual — media ignora setMode)', () => {
    const selector = (
      theme as unknown as { colorSchemeSelector?: unknown }
    ).colorSchemeSelector;
    assert.equal(selector, 'class');
  });

  it('gera CSS theme variables (vars presente — mecanismo v6+/v9)', () => {
    assert.ok(
      (theme as unknown as { vars?: unknown }).vars != null,
      'theme.vars deve existir (cssVariables: true)',
    );
  });

  it('shape.borderRadius é 8', () => {
    assert.equal(theme.shape.borderRadius, 8);
  });

  it('typography.fontSize é 14', () => {
    assert.equal(theme.typography.fontSize, 14);
  });

  // ─── ONDA 20B — DARK DRACULA (valores exatos, medidos) ─────────────────────

  it('dark: background.default é o fundo Dracula #282a36 e paper a elevação #2f3142', () => {
    const c = darkColors();
    assert.equal(c.background.default, '#282a36');
    assert.equal(c.background.paper, '#2f3142');
  });

  it('dark: text.primary é o foreground Dracula #f8f8f2 e text.secondary é #aeb6c2 (comment #6272a4 falha AA)', () => {
    const c = darkColors();
    assert.equal(c.text.primary, '#f8f8f2');
    assert.equal(c.text.secondary, '#aeb6c2');
    // Prova da decisão: o comment canônico NÃO passa o AA sobre o bg dark.
    assert.ok(
      contrastRatio('#6272a4', '#282a36') < 4.5,
      'Dracula comment #6272a4 falha 4.5:1 (por isso o secondary é outro)',
    );
  });

  it('dark: divider é o currentLine Dracula #44475a', () => {
    assert.equal(darkColors().divider, '#44475a');
  });

  it('dark: primary.main é o roxo Dracula #bd93f9 com contrastText escuro #1e1f29', () => {
    const c = darkColors();
    assert.equal(c.primary.main, '#bd93f9');
    assert.equal(c.primary.contrastText, '#1e1f29');
  });

  it('dark: tertiary.main é o ciano Dracula #8be9fd', () => {
    assert.equal(darkColors().tertiary.main, '#8be9fd');
  });

  it('dark: contraste WCAG AA (≥4.5:1) medido para texto (Regra 5)', () => {
    const c = darkColors();
    const checks: Array<[string, string, string]> = [
      ['text.primary sobre background.default', c.text.primary, c.background.default],
      ['text.primary sobre background.paper', c.text.primary, c.background.paper],
      ['text.secondary sobre background.default', c.text.secondary, c.background.default],
      ['text.secondary sobre background.paper', c.text.secondary, c.background.paper],
      ['primary.contrastText sobre primary.main', c.primary.contrastText, c.primary.main],
      ['tertiary.main sobre background.default', c.tertiary.main, c.background.default],
      ['primary.main sobre background.default (texto/interação)', c.primary.main, c.background.default],
    ];
    for (const [label, fg, bg] of checks) {
      const ratio = contrastRatio(fg, bg);
      assert.ok(
        ratio >= 4.5,
        `${label}: ${fg} sobre ${bg} = ${ratio.toFixed(2)}:1 (exigido ≥4.5:1)`,
      );
    }
  });

  it('dark: paper é elevação LEVE (contraste entre superfícies < 1.5:1)', () => {
    const c = darkColors();
    const layer = contrastRatio(c.background.paper, c.background.default);
    assert.ok(layer < 1.5, `paper ${c.background.paper} vs bg ${c.background.default} = ${layer.toFixed(2)}:1 (deve ser elevação sutil)`);
  });

  // ─── LIGHT INTACTO (onda 20B) ─────────────────────────────────────────────

  it('primary do scheme LIGHT é um azul legível #1565c0 (contraste AA em claro)', () => {
    const schemes = theme as unknown as {
      colorSchemes?: { light?: { palette?: { primary?: { main?: string } } } };
    };
    assert.equal(schemes.colorSchemes?.light?.palette?.primary?.main, '#1565c0');
  });

  it('light: background/text seguem o default do MUI (não foram tocados na onda 20B)', () => {
    const schemes = theme as unknown as {
      colorSchemes?: {
        light?: { palette?: { background?: { default?: string }; text?: { primary?: string } } };
      };
    };
    const p = schemes.colorSchemes?.light?.palette;
    assert.equal(p?.background?.default, '#fff', 'light mantém o fundo default do MUI');
    assert.equal(
      p?.text?.primary,
      'rgba(0, 0, 0, 0.87)',
      'light mantém o text.primary default do MUI',
    );
  });

  // ─── Mecânica (onda 11/fix17c) ────────────────────────────────────────────

  it('usa colorSchemes (não palette.mode como toggle) — light vive em colorSchemes.light, dark em colorSchemes.dark', () => {
    const schemes = theme as unknown as {
      colorSchemes?: {
        light?: { palette?: { mode?: string } };
        dark?: { palette?: { mode?: string } };
      };
    };
    assert.equal(schemes.colorSchemes?.light?.palette?.mode, 'light');
    assert.equal(schemes.colorSchemes?.dark?.palette?.mode, 'dark');
  });

  it('tertiary existe em AMBOS os schemes (chave de acento portátil)', () => {
    const dark = (theme as unknown as {
      colorSchemes?: { dark?: { palette?: { tertiary?: { main?: string } } } };
    }).colorSchemes?.dark?.palette?.tertiary?.main;
    const light = (theme as unknown as {
      colorSchemes?: { light?: { palette?: { tertiary?: { main?: string } } } };
    }).colorSchemes?.light?.palette?.tertiary?.main;
    assert.equal(typeof dark, 'string');
    assert.ok(dark!.length > 0, 'dark deve ter tertiary.main');
    assert.equal(typeof light, 'string');
    assert.ok(light!.length > 0, 'light deve ter tertiary.main');
  });
});
