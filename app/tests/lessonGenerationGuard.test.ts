/**
 * tests/lessonGenerationGuard.test.ts — guarda de identidade de geração
 * (fix onda5-resposta-digitada-ui). Sem jsdom: contador de módulo puro.
 *
 * O cenário que esta guarda resolve: uma geração antiga (assunto A) que
 * resolve depois de uma nova (assunto B) — na mesma instância OU numa
 * instância nova após a troca de aba — publicava `{subject: A, status:'done'}`
 * no provider de sessão VIVO. O contador é de MÓDULO de propósito: um ref da
 * view zeraria a cada montagem e a geração antiga "acertaria" o token 1 da
 * instância nova (o bug da troca de aba continuaria).
 */
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  __resetGenerationSeqForTests,
  currentGenerationToken,
  invalidateGenerations,
  isStaleToken,
  nextGenerationToken,
} from '../src/lib/lessonGenerationGuard';

beforeEach(() => {
  __resetGenerationSeqForTests();
});

describe('lessonGenerationGuard — identidade de geração', () => {
  it('isStaleToken: token igual não é stale; diferente é', () => {
    assert.equal(isStaleToken(2, 2), false);
    assert.equal(isStaleToken(2, 1), true);
    assert.equal(isStaleToken(0, 0), false, 'sem geração alguma não é stale');
  });

  it('nextGenerationToken é estritamente crescente (token único por geração)', () => {
    const a = nextGenerationToken();
    const b = nextGenerationToken();
    const c = nextGenerationToken();
    assert.ok(b > a);
    assert.ok(c > b);
    assert.equal(isStaleToken(currentGenerationToken(), c), false, 'última geração viva');
    assert.equal(isStaleToken(currentGenerationToken(), a), true, 'geração antiga é stale');
    assert.equal(isStaleToken(currentGenerationToken(), b), true, 'geração antiga é stale');
  });

  it('invalidateGenerations (montagem/remontagem) mata toda geração pendente', () => {
    const a = nextGenerationToken();
    const b = nextGenerationToken();
    invalidateGenerations();
    const cur = currentGenerationToken();
    assert.equal(isStaleToken(cur, a), true, 'instância anterior está morta');
    assert.equal(isStaleToken(cur, b), true, 'instância anterior está morta');
    const c = nextGenerationToken();
    assert.equal(isStaleToken(currentGenerationToken(), c), false, 'geração nova da instância viva');
  });

  it('invalidate em série não muda o contrato de isStaleToken', () => {
    invalidateGenerations();
    const cur1 = currentGenerationToken();
    invalidateGenerations();
    const cur2 = currentGenerationToken();
    assert.ok(cur2 > cur1);
    assert.equal(isStaleToken(cur2, cur1), true);
  });
});
