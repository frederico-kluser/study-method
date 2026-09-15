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
  navPanelId,
  navTabId,
} from '../src/lib/shellNav';

describe('NAV_ITEMS — ordem canônica do rail', () => {
  it('tem exatamente 4 abas na ordem Início→Settings→Aula→Trilha (Desafio SAIU do rail)', () => {
    assert.deepEqual(
      NAV_ITEMS.map((n) => n.key),
      ['home', 'settings', 'lesson', 'roadmap'],
    );
  });

  it('cada aba aponta para a chave i18n nav.* correspondente (namespace translation:)', () => {
    assert.deepEqual(
      NAV_ITEMS.map((n) => n.i18nKey),
      [
        'translation:nav.home',
        'translation:nav.settings',
        'translation:nav.lesson',
        'translation:nav.roadmap',
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

  it('navIndexOf devolve -1 para chave desconhecida E para painel fora do rail', () => {
    // ONDA-SEM-DESAFIO-NO-RAIL: o Desafio continua sendo PAINEL do shell
    // (PanelKey), mas não tem tab — logo não tem índice no rail.
    assert.equal(navIndexOf('challenge'), -1);
    assert.equal(navIndexOf('roadmap'), 3);
    // @ts-expect-error chave inválida de propósito
    assert.equal(navIndexOf('bogus'), -1);
  });
});

/**
 * Onda 2 do redesign: as abas horizontais viraram o RAIL vertical, e o vínculo
 * de a11y passou a ser escrito em dois arquivos diferentes — `id` no tab (rail)
 * e `aria-labelledby` no painel (App.tsx). Estas funções são a fonte única da
 * fórmula justamente para que os dois lados não possam divergir em silêncio.
 */
describe('navTabId / navPanelId — o vínculo tab ↔ tabpanel', () => {
  it('gera ids estáveis e distintos por destino', () => {
    assert.equal(navTabId('home'), 'sm-tab-home');
    assert.equal(navPanelId('home'), 'sm-panel-home');
    // O painel Desafio não tem tab no rail (PanelKey), mas o id do PANEL
    // continua existindo — o main do shell o usa quando ele é o painel ativo.
    assert.equal(navPanelId('challenge'), 'sm-panel-challenge');
  });

  it('nenhum id colide entre destinos nem entre os dois papéis (inclui o painel Desafio)', () => {
    const ids = NAV_ITEMS.flatMap((n) => [navTabId(n.key), navPanelId(n.key)]);
    ids.push(navPanelId('challenge'));
    assert.equal(new Set(ids).size, ids.length, `ids duplicados em ${ids.join(', ')}`);
  });
});
