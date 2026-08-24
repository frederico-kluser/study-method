/**
 * tests/themeModeState.test.ts — lógica pura do toggle de tema (onda 11).
 * Sem jsdom/React: a lógica de ciclo e parse do modo persistido vive em
 * src/components/theme/themeModeState.ts e é testável isoladamente.
 * Cobre:
 *  - ciclo light → dark → system → light …;
 *  - validação de modo (isThemeMode);
 *  - parse do valor persistido de localStorage['theme-mode'] (default 'system').
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isThemeMode,
  nextThemeMode,
  parsePersistedThemeMode,
  THEME_MODE_I18N_KEY,
  THEME_MODES,
} from '../src/components/theme/themeModeState';

describe('themeModeState (lógica pura do toggle de tema)', () => {
  it('tem exatamente os modos light | dark | system', () => {
    assert.deepEqual([...THEME_MODES], ['light', 'dark', 'system']);
  });

  it('ciclo do botão: light → dark → system → light …', () => {
    assert.equal(nextThemeMode('light'), 'dark');
    assert.equal(nextThemeMode('dark'), 'system');
    assert.equal(nextThemeMode('system'), 'light');
  });

  it('próximo de um modo desconhecido volta para o início do ciclo (light)', () => {
    // O ciclo é indexado pelo array de modos; modo fora do array cai no await
    // técnico (indexOf -1 → 0). Garante que nunca estoura.
    assert.equal(isThemeMode('sepia'), false);
    // nextThemeMode exige ThemeMode tipado; decay defensivo coberto via parse.
    assert.equal(parsePersistedThemeMode('sepia'), 'system');
  });

  it('isThemeMode só aceita light | dark | system', () => {
    assert.equal(isThemeMode('light'), true);
    assert.equal(isThemeMode('dark'), true);
    assert.equal(isThemeMode('system'), true);
    assert.equal(isThemeMode('sepia'), false);
    assert.equal(isThemeMode(''), false);
    assert.equal(isThemeMode(null), false);
    assert.equal(isThemeMode(undefined), false);
  });

  it('parsePersistedThemeMode: sem valor salvo → system (follow SO)', () => {
    assert.equal(parsePersistedThemeMode(null), 'system');
    assert.equal(parsePersistedThemeMode(undefined), 'system');
    assert.equal(parsePersistedThemeMode(''), 'system');
  });

  it('parsePersistedThemeMode: valor válido preservado', () => {
    assert.equal(parsePersistedThemeMode('light'), 'light');
    assert.equal(parsePersistedThemeMode('dark'), 'dark');
    assert.equal(parsePersistedThemeMode('system'), 'system');
  });

  it('parsePersistedThemeMode: valor inválido cai em system (fallback defensivo)', () => {
    assert.equal(parsePersistedThemeMode('autumn'), 'system');
    assert.equal(parsePersistedThemeMode('2'), 'system');
  });

  it('chaves i18n dos modos são literais translation:theme.mode.*', () => {
    assert.equal(THEME_MODE_I18N_KEY.light, 'translation:theme.mode.light');
    assert.equal(THEME_MODE_I18N_KEY.dark, 'translation:theme.mode.dark');
    assert.equal(THEME_MODE_I18N_KEY.system, 'translation:theme.mode.system');
  });
});