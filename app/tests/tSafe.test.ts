/**
 * tests/tSafe.test.ts — tSafe (seam do i18n): tradução SEGURA com fallback.
 *
 * Sem `src/i18n` nesta árvore (o i18n-core ainda não mergeou), tSafe deve:
 *  - devolver o fallback pt-BR quando NÃO existe instância i18next global;
 *  - devolver a tradução quando a instância global existe e a chave resolve;
 *  - devolver o fallback quando a instância devolve a própria chave (i18next
 *    devolve o key cru p/ chave ausente) ou quando t() falha.
 */
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { tSafe } from '../src/lib/tSafe';

function setI18n(instance: unknown): void {
  (globalThis as unknown as { __I18N_INSTANCE?: unknown }).__I18N_INSTANCE = instance;
}

afterEach(() => {
  setI18n(undefined);
});

describe('tSafe (seam do i18n, sem src/i18n nesta árvore)', () => {
  it('sem instância global → devolve o fallback pt-BR', () => {
    assert.equal(tSafe('gate.checking', 'Verificando chaves…'), 'Verificando chaves…');
  });

  it('com instância global que resolve a chave → devolve a tradução', () => {
    setI18n({
      t: (key: string) => (key === 'gate.ready' ? 'Pronto' : key),
    });
    assert.equal(tSafe('gate.ready', 'fallback'), 'Pronto');
  });

  it('chave ausente (i18next devolve o key cru) → fallback', () => {
    setI18n({ t: (key: string) => key });
    assert.equal(tSafe('gate.missing', 'Chaves faltando'), 'Chaves faltando');
  });

  it('t() devolve vazio/undefined → fallback', () => {
    setI18n({ t: () => '' });
    assert.equal(tSafe('key.a', 'fb'), 'fb');
  });

  it('instância sem t (objeto cru) → fallback, sem lançar', () => {
    setI18n({});
    assert.equal(tSafe('key.b', 'fb-2'), 'fb-2');
  });

  it('t() LANÇA → fallback, sem propagar exceção', () => {
    setI18n({ t: () => {
      throw new Error('boom');
    } });
    assert.equal(tSafe('key.c', 'fb-3'), 'fb-3');
  });
});