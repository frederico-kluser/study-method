/**
 * tests/theme.test.ts — contrato do tema MUI v9 do shell (onda 7).
 * Sem jsdom: `createTheme`/`theme` são puros (não exigem DOM). Cobre:
 *  - colorSchemes.dark habilitado (dark-only);
 *  - cssVariables: true (mecanismo v6+/v9, anti-flicker);
 *  - shape.borderRadius === 8;
 *  - tipografia fontSize 14;
 *  - palette.primary.main herdada do tema antigo.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { theme } from '../src/theme';

describe('theme (MUI v9) — dark-only', () => {
  it('habilita o esquema dark via colorSchemes.dark', () => {
    // colorSchemes não está no type público de Theme (v9) — acessamos via cast.
    const schemes = (theme as unknown as { colorSchemes?: { dark?: unknown } }).colorSchemes;
    assert.ok(schemes?.dark != null, 'colorSchemes.dark deve estar habilitado');
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

  it('palette.primary.main é o accent do tema antigo (#4f8cff)', () => {
    assert.equal(theme.palette.primary.main, '#4f8cff');
  });

  it('usa colorSchemes (não palette.mode como toggle) — dark vive em colorSchemes.dark', () => {
    // No padrão v6+/v9, palette.mode permanece 'light' (default) e o dark vive
    // sob colorSchemes.dark.palette.mode — NÃO é o toggle legado.
    const schemes = theme as unknown as {
      colorSchemes?: { dark?: { palette?: { mode?: string } } };
    };
    assert.equal(schemes.colorSchemes?.dark?.palette?.mode, 'dark');
  });
});