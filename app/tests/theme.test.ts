/**
 * tests/theme.test.ts — contrato do tema MUI v9 do shell (onda 7 → onda 11).
 * Sem jsdom: `createTheme`/`theme` são puros (não exigem DOM). Cobre:
 *  - colorSchemes light e dark habilitados (claro+escuro, onda 11);
 *  - colorSchemeSelector === 'class' (toggle manual habilitado);
 *  - cssVariables: true (mecanismo v6+/v9, anti-flicker);
 *  - shape.borderRadius === 8;
 *  - typografia fontSize 14;
 *  - primary do scheme dark = #4f8cff e do scheme light = #1565c0 (legível).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { theme } from '../src/theme';

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

  it('primary do scheme DARK é o accent antigo #4f8cff', () => {
    const schemes = theme as unknown as {
      colorSchemes?: { dark?: { palette?: { primary?: { main?: string } } } };
    };
    assert.equal(schemes.colorSchemes?.dark?.palette?.primary?.main, '#4f8cff');
  });

  it('primary do scheme LIGHT é um azul legível #1565c0 (contraste AA em claro)', () => {
    const schemes = theme as unknown as {
      colorSchemes?: { light?: { palette?: { primary?: { main?: string } } } };
    };
    assert.equal(schemes.colorSchemes?.light?.palette?.primary?.main, '#1565c0');
  });

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

  // fix17c ACHADO-4: a paleta dark REFINADA (onda 17A — elevação por camadas)
  // deve ser assertado, não só o primary. Valores contratados em theme.ts.
  it('dark declara a paleta de superfícies refinada (default/paper/text/divider)', () => {
    const palette = (
      theme as unknown as {
        colorSchemes?: {
          dark?: {
            palette?: {
              background?: { default?: string; paper?: string };
              text?: { secondary?: string };
              divider?: string;
            };
          };
        };
      }
    ).colorSchemes?.dark?.palette;
    assert.ok(palette, 'palette dark deve existir');
    assert.equal(palette?.background?.default, '#0f1115');
    assert.equal(palette?.background?.paper, '#171c23');
    assert.equal(palette?.text?.secondary, '#aeb6c2');
    assert.equal(palette?.divider, '#2b313c');
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