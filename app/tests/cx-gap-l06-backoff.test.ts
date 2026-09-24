/**
 * tests/cx-gap-l06-backoff.test.ts — GAP de cobertura do lote L06 sobre
 * `engine/runtime/backoff.ts`: as funções PURAS da política de retry/backoff
 * não tinham cobertura própria (só exercitavam indiretamente, via `callLlm`).
 *
 * Estes testes PINAM o contrato observável atual da tabela de políticas
 * (tentativas por código de erro), do `Retry-After` honrado (com teto), do
 * exponencial com jitter (limites exatos) e das decisões de retry. Sem rede,
 * sem LLM, sem chave: puro.
 *
 * f0Brief/f2Decompose/f4Budget/f3Graph/f7Theory/f6Pilot/f9Verifier: FORA DO
 * ESCOPO deste lote (lote L02) — não cobertos aqui por design.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_BACKOFF_POLICIES,
  backoffDelayMs,
  maxRetriesFor,
  policyFor,
  retryAfterMsFrom,
  retryDecision,
  type RetryPolicy,
} from '../electron/main/engine/runtime/backoff';
import { LLM_ERROR_CODES, type LlmErrorCode } from '../electron/main/services/llmClient';

const POLICY_TESTE: RetryPolicy = { maxRetries: 3, baseDelayMs: 100, maxDelayMs: 10_000 };

// ---------------------------------------------------------------------------
// 1. A tabela DEFAULT — tentativas por código (o contrato de attempts/retried)
// ---------------------------------------------------------------------------

describe('backoff — política DEFAULT por código de erro (tentativas totais)', () => {
  it('RATE_LIMIT = 5 tentativas (4 retentativas); EMPTY_CONTENT = 2; BAD_REQUEST/KEY_INVALID = 1', () => {
    assert.equal(DEFAULT_BACKOFF_POLICIES[LLM_ERROR_CODES.RATE_LIMIT].maxRetries + 1, 5);
    assert.equal(DEFAULT_BACKOFF_POLICIES[LLM_ERROR_CODES.EMPTY_CONTENT].maxRetries + 1, 2);
    assert.equal(DEFAULT_BACKOFF_POLICIES[LLM_ERROR_CODES.BAD_REQUEST].maxRetries + 1, 1);
    assert.equal(DEFAULT_BACKOFF_POLICIES[LLM_ERROR_CODES.KEY_INVALID].maxRetries + 1, 1);
    assert.equal(DEFAULT_BACKOFF_POLICIES[LLM_ERROR_CODES.KEY_MISSING].maxRetries + 1, 1);
  });

  it('condições transitórias SERVER_ERROR/NETWORK toleram 3 retentativas (4 tentativas)', () => {
    assert.equal(DEFAULT_BACKOFF_POLICIES[LLM_ERROR_CODES.SERVER_ERROR].maxRetries, 3);
    assert.equal(DEFAULT_BACKOFF_POLICIES[LLM_ERROR_CODES.NETWORK].maxRetries, 3);
  });

  it('códigos não-retentáveis têm atraso 0 — o backoff nunca é consultado para eles', () => {
    for (const code of [LLM_ERROR_CODES.KEY_MISSING, LLM_ERROR_CODES.KEY_INVALID, LLM_ERROR_CODES.BAD_REQUEST] as const) {
      const p = DEFAULT_BACKOFF_POLICIES[code];
      assert.equal(p.baseDelayMs, 0, `${code}: baseDelayMs 0`);
      assert.equal(p.maxDelayMs, 0, `${code}: maxDelayMs 0`);
    }
  });

  it('maxRetriesFor espelha policyFor para TODOS os códigos da tabela', () => {
    const codes = Object.keys(DEFAULT_BACKOFF_POLICIES) as LlmErrorCode[];
    for (const code of codes) {
      assert.equal(maxRetriesFor(code), policyFor(code).maxRetries, code);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Overrides por código (merge por CAMPO, não por código)
// ---------------------------------------------------------------------------

describe('backoff — policyFor mescla overrides por campo sobre o default', () => {
  it('sem override devolve a política DEFAULT (o MESMO objeto)', () => {
    assert.equal(policyFor(LLM_ERROR_CODES.RATE_LIMIT), DEFAULT_BACKOFF_POLICIES[LLM_ERROR_CODES.RATE_LIMIT]);
  });

  it('override de UM campo preserva os demais do default', () => {
    const p = policyFor(LLM_ERROR_CODES.RATE_LIMIT, {
      policies: { [LLM_ERROR_CODES.RATE_LIMIT]: { maxRetries: 1 } },
    });
    assert.deepEqual(p, { maxRetries: 1, baseDelayMs: 1_000, maxDelayMs: 30_000 });
  });

  it('override de outro código NÃO contamina o código consultado', () => {
    const p = policyFor(LLM_ERROR_CODES.EMPTY_CONTENT, {
      policies: { [LLM_ERROR_CODES.RATE_LIMIT]: { maxRetries: 9 } },
    });
    assert.deepEqual(p, DEFAULT_BACKOFF_POLICIES[LLM_ERROR_CODES.EMPTY_CONTENT]);
  });
});

// ---------------------------------------------------------------------------
// 3. retryAfterMsFrom — leitura DEFENSIVA do header Retry-After
// ---------------------------------------------------------------------------

describe('backoff — retryAfterMsFrom é defensiva: valor inválido vira ausente', () => {
  it('ausência/não-objeto/primitivo devolvem undefined (caminho exponencial)', () => {
    assert.equal(retryAfterMsFrom(undefined), undefined);
    assert.equal(retryAfterMsFrom(null), undefined);
    assert.equal(retryAfterMsFrom('5'), undefined);
    assert.equal(retryAfterMsFrom(5), undefined);
    assert.equal(retryAfterMsFrom({}), undefined);
  });

  it('NaN, Infinity, negativo e não-número são DESCARTADOS (um header mal nunca vira sleep(NaN))', () => {
    assert.equal(retryAfterMsFrom({ retryAfterMs: NaN }), undefined);
    assert.equal(retryAfterMsFrom({ retryAfterMs: Infinity }), undefined);
    assert.equal(retryAfterMsFrom({ retryAfterMs: -1 }), undefined);
    assert.equal(retryAfterMsFrom({ retryAfterMs: '5' }), undefined);
    assert.equal(retryAfterMsFrom({ retryAfterMs: null }), undefined);
  });

  it('zero e positivos (inteiros ou float) passam intocados', () => {
    assert.equal(retryAfterMsFrom({ retryAfterMs: 0 }), 0);
    assert.equal(retryAfterMsFrom({ retryAfterMs: 250 }), 250);
    assert.equal(retryAfterMsFrom({ retryAfterMs: 12.5 }), 12.5);
  });
});

// ---------------------------------------------------------------------------
// 4. backoffDelayMs — exponencial com jitter, teto e Retry-After honrado
// ---------------------------------------------------------------------------

describe('backoff — backoffDelayMs: exponencial determinístico, jitter limitado e Retry-After', () => {
  it('attempt precisa ser inteiro ≥ 1 — RangeError em 0, negativo, fracionário e NaN', () => {
    for (const attempt of [0, -1, 1.5, NaN]) {
      assert.throws(() => backoffDelayMs(attempt, POLICY_TESTE, { jitterRatio: 0 }), RangeError, `attempt ${attempt}`);
    }
  });

  it('sem retryAfterMs: exponencial dobrando por tentativa, com jitterRatio 0 é determinístico', () => {
    assert.equal(backoffDelayMs(1, POLICY_TESTE, { jitterRatio: 0 }), 100);
    assert.equal(backoffDelayMs(2, POLICY_TESTE, { jitterRatio: 0 }), 200);
    assert.equal(backoffDelayMs(3, POLICY_TESTE, { jitterRatio: 0 }), 400);
    assert.equal(backoffDelayMs(4, POLICY_TESTE, { jitterRatio: 0 }), 800);
  });

  it('o teto maxDelayMs corta o exponencial (nunca estoura)', () => {
    const apertada: RetryPolicy = { maxRetries: 10, baseDelayMs: 1_000, maxDelayMs: 2_500 };
    assert.equal(backoffDelayMs(1, apertada, { jitterRatio: 0 }), 1_000);
    assert.equal(backoffDelayMs(2, apertada, { jitterRatio: 0 }), 2_000);
    assert.equal(backoffDelayMs(3, apertada, { jitterRatio: 0 }), 2_500);
    assert.equal(backoffDelayMs(9, apertada, { jitterRatio: 0 }), 2_500);
  });

  it('jitter multiplica por [1−j/2, 1+j/2] — os extremos batem com a fórmula', () => {
    // exponential(1) = 100; j = 0.5 → random 0 ⇒ ×0.75; random 1 ⇒ ×1.25
    assert.equal(backoffDelayMs(1, POLICY_TESTE, { jitterRatio: 0.5, random: () => 0 }), 75);
    assert.equal(backoffDelayMs(1, POLICY_TESTE, { jitterRatio: 0.5, random: () => 1 }), 125);
    assert.equal(backoffDelayMs(1, POLICY_TESTE, { jitterRatio: 0.5, random: () => 0.5 }), 100);
  });

  it('COM retryAfterMs: o atraso é o do SERVIDOR — sem exponencial, sem jitter, limitado pelo teto', () => {
    assert.equal(backoffDelayMs(1, POLICY_TESTE, { jitterRatio: 0.5, random: () => 0 }, 1_234), 1_234);
    assert.equal(backoffDelayMs(4, POLICY_TESTE, { jitterRatio: 0.5, random: () => 0 }, 1_234), 1_234);
    assert.equal(backoffDelayMs(1, POLICY_TESTE, { jitterRatio: 0.5, random: () => 0 }, 999_999), 10_000);
    assert.equal(backoffDelayMs(1, POLICY_TESTE, { jitterRatio: 0.5, random: () => 0 }, 0), 0);
  });

  it('retryAfterMs inválido (NaN/Infinity/negativo) cai no exponencial — nunca sleep(NaN)', () => {
    for (const invalido of [NaN, Infinity, -5]) {
      assert.equal(backoffDelayMs(1, POLICY_TESTE, { jitterRatio: 0 }, invalido), 100, `retryAfterMs ${invalido}`);
    }
  });
});

// ---------------------------------------------------------------------------
// 5. retryDecision — a decisão por código; Retry-After muda o QUANDO, não o SE
// ---------------------------------------------------------------------------

describe('backoff — retryDecision: decisão por código é a mesma com ou sem Retry-After', () => {
  it('BAD_REQUEST/KEY_INVALID/KEY_MISSING NUNCA retentam — mesmo com Retry-After presente', () => {
    for (const code of [LLM_ERROR_CODES.BAD_REQUEST, LLM_ERROR_CODES.KEY_INVALID, LLM_ERROR_CODES.KEY_MISSING] as const) {
      for (const retryAfterMs of [undefined, 500]) {
        const d = retryDecision(code, 1, {}, retryAfterMs);
        assert.equal(d.retry, false, `${code} com retryAfterMs=${retryAfterMs}`);
        assert.equal(d.delayMs, 0);
        assert.equal(d.honoredRetryAfter, false);
        assert.match(d.reason, /nunca retenta/);
      }
    }
  });

  it('RATE_LIMIT retenta nas 4 primeiras falhas e esgota na 5ª tentativa', () => {
    for (const attempt of [1, 2, 3, 4]) {
      const d = retryDecision(LLM_ERROR_CODES.RATE_LIMIT, attempt, { jitterRatio: 0 });
      assert.equal(d.retry, true, `tentativa ${attempt}`);
    }
    const fim = retryDecision(LLM_ERROR_CODES.RATE_LIMIT, 5, { jitterRatio: 0 });
    assert.equal(fim.retry, false);
    assert.equal(fim.delayMs, 0);
    assert.match(fim.reason, /esgotou o teto de 4 retentativas/);
  });

  it('EMPTY_CONTENT retenta EXATAMENTE UMA vez (tentativa 2 já esgota)', () => {
    assert.equal(retryDecision(LLM_ERROR_CODES.EMPTY_CONTENT, 1, { jitterRatio: 0 }).retry, true);
    const fim = retryDecision(LLM_ERROR_CODES.EMPTY_CONTENT, 2, { jitterRatio: 0 });
    assert.equal(fim.retry, false);
    assert.match(fim.reason, /esgotou o teto de 1 retentativas/);
  });

  it('Retry-After honrado: honoredRetryAfter true, atraso do servidor (dentro do teto) e reason cita o header', () => {
    const d = retryDecision(LLM_ERROR_CODES.RATE_LIMIT, 1, {}, 250);
    assert.equal(d.retry, true);
    assert.equal(d.honoredRetryAfter, true);
    assert.equal(d.delayMs, 250);
    assert.match(d.reason, /Retry-After 250ms/);
  });

  it('Retry-After acima do teto é TRUNCADO em maxDelayMs (uma etapa não segura a onda)', () => {
    const d = retryDecision(LLM_ERROR_CODES.RATE_LIMIT, 1, {}, 600_000);
    assert.equal(d.honoredRetryAfter, true);
    assert.equal(d.delayMs, 30_000);
    assert.match(d.reason, /teto 30000ms/);
  });

  it('sem Retry-After (ou inválido) o atraso é exponencial e honoredRetryAfter é false', () => {
    const d = retryDecision(LLM_ERROR_CODES.RATE_LIMIT, 2, { jitterRatio: 0 });
    assert.equal(d.honoredRetryAfter, false);
    assert.equal(d.delayMs, 2_000); // base 1000 · 2^(2−1)
    assert.match(d.reason, new RegExp(`retentativa 2/4 para ${LLM_ERROR_CODES.RATE_LIMIT}`));
  });

  it('override de maxRetries muda o ponto de esgotamento (maxRetries 1 → só a 1ª retenta)', () => {
    const config = { policies: { [LLM_ERROR_CODES.RATE_LIMIT]: { maxRetries: 1 } }, jitterRatio: 0 };
    assert.equal(retryDecision(LLM_ERROR_CODES.RATE_LIMIT, 1, config).retry, true);
    assert.equal(retryDecision(LLM_ERROR_CODES.RATE_LIMIT, 2, config).retry, false);
  });
});
