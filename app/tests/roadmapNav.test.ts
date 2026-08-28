/**
 * tests/roadmapNav.test.ts — store de navegação da TRILHA (onda1-nav-ui).
 *
 * Sem jsdom: set/peek/reset são funções puras sobre a variável de módulo.
 * Contratos que mordem:
 *   1. set grava a trilha aberta — peek devolve a MESMA string;
 *   2. set(null) volta para "na lista" (peek → null);
 *   3. set com vazio/espaços normaliza para null (nunca grava lixo);
 *   4. trim no set (slugs vêm limpos da UI, mas o contrato não assume);
 *   5. o último a escrever vence (histórico da sessão);
 *   6. __reset esvazia TUDO (beforeEach da suíte).
 */
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  __resetRoadmapNavForTests,
  peekLastTrackSlug,
  setLastTrackSlug,
} from '../src/lib/roadmapNav';

beforeEach(() => {
  __resetRoadmapNavForTests();
});

describe('roadmapNav (onda1-nav-ui)', () => {
  it('set grava e peek devolve a trilha aberta', () => {
    assert.equal(peekLastTrackSlug(), null, 'começa vazio');
    setLastTrackSlug('nodejs-do-zero');
    assert.equal(peekLastTrackSlug(), 'nodejs-do-zero');
  });

  it('set(null) volta para "na lista" (botão VOLTAR / seletor)', () => {
    setLastTrackSlug('nodejs-do-zero');
    setLastTrackSlug(null);
    assert.equal(peekLastTrackSlug(), null);
  });

  it('set com vazio/espaços normaliza para null (nunca grava lixo)', () => {
    setLastTrackSlug('   ');
    assert.equal(peekLastTrackSlug(), null);
    setLastTrackSlug('');
    assert.equal(peekLastTrackSlug(), null);
  });

  it('set faz trim (slugs vêm limpos, mas o contrato não assume)', () => {
    setLastTrackSlug('  nodejs-do-zero  ');
    assert.equal(peekLastTrackSlug(), 'nodejs-do-zero');
  });

  it('o último a escrever vence (histórico de navegação da sessão)', () => {
    setLastTrackSlug('trilha-a');
    setLastTrackSlug('trilha-b');
    setLastTrackSlug(null);
    setLastTrackSlug('trilha-c');
    assert.equal(peekLastTrackSlug(), 'trilha-c');
  });

  it('__reset esvazia TUDO (beforeEach da suíte)', () => {
    setLastTrackSlug('nodejs-do-zero');
    __resetRoadmapNavForTests();
    assert.equal(peekLastTrackSlug(), null);
  });
});
