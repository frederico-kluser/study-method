/**
 * tests/ipcActionGuards.test.ts — guards de AÇÃO do renderer (fix W1/W3 da
 * onda 4, sem jsdom; módulo puro em src/lib).
 *
 * W1: ACTION_TIMEOUTS — cada timeout de canal de AÇÃO deve ser SEMPRE maior
 * que o teto LEGÍTIMO da mesma ação no main (o main aborta a LLM/exec antes),
 * para nunca cortar resposta legítima; o timeout só desbloqueia o canal MUDO.
 * Estes testes TRAVAM a escolha documentada em lib/ipcTimeout.ts contra os
 * tetos reais do main:
 *   - answer: main aborta a LLM em 45s (tutorChat.ts `timeoutMs: 45_000`);
 *   - challengeSubmit: main roda o código com exec 30s (challengeExec.ts);
 *   - challengeRegenerate: main faz até 2 tentativas de LLM de 60s cada
 *     (challengeRegenerator.ts, MAX_REGEN_ATTEMPTS=2) = ~120s legítimos.
 *
 * W3: resolveChannelError — invariante falsy-proof do estado de erro da UI
 * (`string | null`; só `null` = sem erro; '' é erro VÁLIDO — um `ok:false`
 * com error vazio NUNCA pode virar "sem erro" e cair num loader eterno).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ACTION_TIMEOUTS, resolveChannelError } from '../src/lib/ipcTimeout';

describe('ACTION_TIMEOUTS (W1 — teto por ação do renderer)', () => {
  it('cada ação tem timeout definido e > 0', () => {
    for (const [action, ms] of Object.entries(ACTION_TIMEOUTS)) {
      assert.equal(typeof ms, 'number', `${action} deve ser número`);
      assert.ok(ms > 0, `${action} deve ter timeout positivo`);
    }
  });

  it('answer: 70s — MAIOR que o abort de 45s da LLM no main (nunca corta resposta legítima)', () => {
    // tutorChat.ts chama a LLM com timeoutMs: 45_000 — a resposta legítima
    // pode levar até ~45s + jitter; 70s dá folga e ainda desbloqueia canal mudo.
    assert.ok(ACTION_TIMEOUTS.answer > 45_000, 'answer deve ser > 45s do abort do main');
    assert.equal(ACTION_TIMEOUTS.answer, 70_000);
  });

  it('challengeSubmit: 45s — MAIOR que o exec de 30s do código no main', () => {
    // challengeExec.ts roda o código do aluno com timeoutMs 30s (+ spawn/load).
    assert.ok(ACTION_TIMEOUTS.challengeSubmit > 30_000);
    assert.equal(ACTION_TIMEOUTS.challengeSubmit, 45_000);
  });

  it('challengeRegenerate: 150s — MAIOR que o teto legítimo de 2x60s de LLM no main', () => {
    // challengeRegenerator.ts: MAX_REGEN_ATTEMPTS=2, cada chamada timeoutMs 60s.
    assert.ok(ACTION_TIMEOUTS.challengeRegenerate > 2 * 60_000);
    assert.equal(ACTION_TIMEOUTS.challengeRegenerate, 150_000);
  });

  it('ações determinísticas/locais usam 10s (IPC_TIMEOUT_MS)', () => {
    // 'next' não chama LLM (markdown da seção já está na trilha); lessonDone e
    // keysSet são persistência local; keysValidate cobre o abort de ~8s do
    // apiKeyValidator com folga.
    assert.equal(ACTION_TIMEOUTS.next, 10_000);
    assert.equal(ACTION_TIMEOUTS.lessonDone, 10_000);
    assert.equal(ACTION_TIMEOUTS.keysSet, 10_000);
    assert.equal(ACTION_TIMEOUTS.keysValidate, 10_000);
  });
});

describe('resolveChannelError (W3 — padrão falsy-proof)', () => {
  it('ok:true → null (sem erro)', () => {
    assert.equal(resolveChannelError({ ok: true }, 'fallback'), null);
    assert.equal(resolveChannelError({ ok: true, error: 'ignorado' }, 'fallback'), null);
  });

  it('ok:false com erro vazio (\'\') → \'\' (NUNCA null — o render cai no ramo de erro)', () => {
    // W3: um `if (loadError)` falsy-check trataria '' como "sem erro" e o
    // render cairia no loader eterno SEM timeout pendente. O estado é
    // `string | null`; '' !== null garante o ramo de erro.
    const err = resolveChannelError({ ok: false, error: '' }, 'fallback');
    assert.equal(err, '');
    assert.notEqual(err, null);
  });

  it('ok:false com mensagem → a mensagem do canal', () => {
    assert.equal(
      resolveChannelError({ ok: false, error: 'repo indisponível' }, 'fallback'),
      'repo indisponível',
    );
  });

  it('ok:false sem error (undefined/null) → fallback', () => {
    assert.equal(resolveChannelError({ ok: false }, 'fallback'), 'fallback');
    assert.equal(resolveChannelError({ ok: false, error: undefined }, 'fallback'), 'fallback');
    assert.equal(resolveChannelError({ ok: false, error: null }, 'fallback'), 'fallback');
  });
});
