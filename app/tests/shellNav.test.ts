/**
 * tests/shellNav.test.ts — mapa puro de navegação do shell (onda 7 MUI).
 * Sem jsdom: o mapa NAV_ITEMS é lógica pura em src/lib/shellNav.ts. Cobre a
 * ordem canônica das abas, a associação aba→chave i18n nav.*, e a contiguidade
 * dos índices (usada pelo Tabs value).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  NAV_ITEMS,
  navIndexOf,
  navIsContiguous,
  navItemAt,
} from '../src/lib/shellNav';

describe('NAV_ITEMS — ordem canônica do shell', () => {
  it('tem exatamente 4 abas na ordem Início→Settings→Aula→Desafio', () => {
    assert.deepEqual(
      NAV_ITEMS.map((n) => n.key),
      ['home', 'settings', 'lesson', 'challenge'],
    );
  });

  it('cada aba aponta para a chave i18n nav.* correspondente (namespace translation:)', () => {
    assert.deepEqual(
      NAV_ITEMS.map((n) => n.i18nKey),
      [
        'translation:nav.home',
        'translation:nav.settings',
        'translation:nav.lesson',
        'translation:nav.challenge',
      ],
    );
  });

  it('o mapa é contíguo e indexável (Tabs value seguro)', () => {
    assert.equal(navIsContiguous(), true);
    for (let i = 0; i < NAV_ITEMS.length; i++) {
      const item = navItemAt(i);
      assert.ok(item, `NAV_ITEMS[${i}] deve existir`);
      assert.equal(navIndexOf(item!.key), i);
    }
  });

  it('navIndexOf devolve -1 para chave desconhecida', () => {
    assert.equal(navIndexOf('challenge'), 3);
    // @ts-expect-error chave inválida de propósito
    assert.equal(navIndexOf('bogus'), -1);
  });
});