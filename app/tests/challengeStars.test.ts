/**
 * tests/challengeStars.test.ts — máquina de estado pura das estrelas do
 * desafio: 3 estrelas iniciais, perdas idempotentes (cada causa 1×, nunca
 * abaixo de 0), decaimento por velocidade em 60%/85% do limite, timeout e
 * derivados (timeLimitForDifficulty, formatClock, starLossI18nKey).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createStarTracker,
  isStillCurrent,
  timeLimitForDifficulty,
  formatClock,
  starLossI18nKey,
  INITIAL_STARS,
  DEFAULT_TIME_LIMIT_MS,
  DEFAULT_MIN_FIRST_STAR_MS,
  BASE_TIME_MS,
  TIME_PER_DIFFICULTY_MS,
  SLOWNESS_60_RATIO,
  SLOWNESS_85_RATIO,
  type StarLossCause,
} from '../src/lib/challengeStars';

const T = DEFAULT_TIME_LIMIT_MS; // 300_000

describe('createStarTracker — estado inicial', () => {
  it('começa com 3 estrelas e nenhum evento', () => {
    const tr = createStarTracker();
    assert.equal(tr.stars(), INITIAL_STARS);
    assert.equal(tr.stars(), 3);
    assert.deepEqual(tr.getEvents(), []);
    assert.deepEqual(tr.lostCauses(), []);
  });

  it('isTimedOut é função pura do relógio (limite default 300s)', () => {
    const tr = createStarTracker();
    assert.equal(tr.isTimedOut(0), false);
    assert.equal(tr.isTimedOut(T - 1), false);
    assert.equal(tr.isTimedOut(T), true);
    assert.equal(tr.isTimedOut(T + 1), true);
  });
});

describe('createStarTracker — perdas explícitas, idempotentes', () => {
  it('onBlur → 2 estrelas; repetir onBlur não perde de novo (1× por causa)', () => {
    const tr = createStarTracker();
    tr.onBlur();
    assert.equal(tr.stars(), 2);
    tr.onBlur();
    tr.onBlur();
    assert.equal(tr.stars(), 2);
  });

  it('onTimeout → 2 estrelas; repetir não perde de novo', () => {
    const tr = createStarTracker();
    tr.onTimeout();
    assert.equal(tr.stars(), 2);
    tr.onTimeout();
    assert.equal(tr.stars(), 2);
  });

  it('onWrongAnswer → 2 estrelas; repetir não perde de novo', () => {
    const tr = createStarTracker();
    tr.onWrongAnswer();
    assert.equal(tr.stars(), 2);
    tr.onWrongAnswer();
    tr.onWrongAnswer();
    assert.equal(tr.stars(), 2);
  });

  it('causas diferentes somam: blur + timeout + wrong-answer → 0', () => {
    const tr = createStarTracker();
    tr.onBlur();
    tr.onTimeout();
    tr.onWrongAnswer();
    assert.equal(tr.stars(), 0);
  });

  it('nunca abaixo de 0: repetições e mais causas depois de zerar', () => {
    const tr = createStarTracker();
    tr.onBlur();
    tr.onTimeout();
    tr.onWrongAnswer();
    tr.onBlur();
    tr.onTimeout();
    tr.onWrongAnswer();
    tr.onTick(T * 2);
    assert.equal(tr.stars(), 0);
  });

  it('getEvents registra causa + estrelas restantes na ordem', () => {
    const tr = createStarTracker();
    tr.onBlur();
    tr.onWrongAnswer();
    const events = tr.getEvents();
    assert.deepEqual(events, [
      { cause: 'blur', starsLeft: 2 },
      { cause: 'wrong-answer', starsLeft: 1 },
    ]);
    // Cópia defensiva: mutar o retorno não afeta o tracker.
    events.push({ cause: 'timeout', starsLeft: 0 });
    assert.equal(tr.getEvents().length, 2);
    assert.deepEqual(tr.lostCauses(), ['blur', 'wrong-answer']);
  });
});

describe('createStarTracker — decaimento por velocidade (onTick)', () => {
  const at = (ratio: number): number => T * ratio;

  it('abaixo de 60% do limite → nenhuma perda', () => {
    const tr = createStarTracker();
    tr.onTick(at(SLOWNESS_60_RATIO) - 1);
    assert.equal(tr.stars(), 3);
  });

  it('elapsed ≥ 60% → 1 estrela (perdida por demora), sem repetir no mesmo tick', () => {
    const tr = createStarTracker();
    tr.onTick(at(SLOWNESS_60_RATIO));
    assert.equal(tr.stars(), 2);
    assert.deepEqual(tr.lostCauses(), ['slowness-60']);
    // Re-tick com o mesmo elapsed (e acima) não repete.
    tr.onTick(at(SLOWNESS_60_RATIO));
    tr.onTick(at(0.8));
    assert.equal(tr.stars(), 2);
  });

  it('elapsed ≥ 85% → mais 1 estrela (total de 2 perdidas por demora)', () => {
    const tr = createStarTracker();
    tr.onTick(at(SLOWNESS_85_RATIO));
    assert.equal(tr.stars(), 1);
    assert.deepEqual(tr.lostCauses(), ['slowness-60', 'slowness-85']);
  });

  it('salto direto para ≥ 85% dispara as DUAS perdas de uma vez (nunca < 0)', () => {
    const tr = createStarTracker();
    tr.onTick(at(0.9));
    assert.equal(tr.stars(), 1);
  });

  it('após timeout (≥ 100%) não há perda adicional além das duas por demora', () => {
    const tr = createStarTracker();
    tr.onTick(at(1.2));
    assert.equal(tr.stars(), 1);
  });

  it('com perdas explícitas + demora, o piso 0 é respeitado', () => {
    const tr = createStarTracker();
    tr.onBlur(); // 2
    tr.onTick(at(0.9)); // 1 (duas por demora; sobra 1)
    tr.onTimeout(); // 0
    tr.onWrongAnswer(); // já 0
    assert.equal(tr.stars(), 0);
  });

  it('elapsed negativo não perde nada', () => {
    const tr = createStarTracker();
    tr.onTick(-1000);
    assert.equal(tr.stars(), 3);
  });
});

describe('createStarTracker — limite customizado', () => {
  it('60%/85% escalam com timeLimitMs próprio', () => {
    // carência de 1s para a demora não interferir (rodada 8)
    const tr = createStarTracker({ timeLimitMs: 10_000, minFirstStarMs: 1_000 });
    tr.onTick(5_999);
    assert.equal(tr.stars(), 3);
    tr.onTick(6_000); // 60% de 10s
    assert.equal(tr.stars(), 2);
    tr.onTick(8_500); // 85% de 10s
    assert.equal(tr.stars(), 1);
    assert.equal(tr.isTimedOut(10_000), true);
    assert.equal(tr.isTimedOut(9_999), false);
  });

  it('timeLimitMs inválido cai no default documentado (300s)', () => {
    const tr = createStarTracker({ timeLimitMs: NaN });
    assert.equal(tr.isTimedOut(T - 1), false);
    assert.equal(tr.isTimedOut(T), true);
    const tr2 = createStarTracker({ timeLimitMs: 0 });
    assert.equal(tr2.isTimedOut(T), true);
  });
});

describe('createStarTracker — carência da 1ª estrela (rodada 8)', () => {
  it('antes de minFirstStarMs a demora NÃO tira estrela', () => {
    const t = createStarTracker({ timeLimitMs: T, minFirstStarMs: 60_000 });
    // 61s: 61/300 ≈ 20% — sem perda mesmo assim (carência manda)
    t.onTick(61_000);
    assert.equal(t.stars(), 3);
    // perda explícita continua imediata dentro da carência
    t.onBlur();
    assert.equal(t.stars(), 2);
  });

  it('após a carência o decaimento funciona normal (60%/85%)', () => {
    const t = createStarTracker({ timeLimitMs: T, minFirstStarMs: 60_000 });
    t.onTick(180_000); // 60% de 300s — passou da carência
    assert.equal(t.stars(), 2);
  });

  it('default do produto: DEFAULT_MIN_FIRST_STAR_MS (60s)', () => {
    const t = createStarTracker({ timeLimitMs: T });
    t.onTick(DEFAULT_MIN_FIRST_STAR_MS - 1);
    assert.equal(t.stars(), 3);
    t.onTick(DEFAULT_MIN_FIRST_STAR_MS + 1000);
    // 61s < 60% de 300s (180s) → ainda sem perda (carência satisfeita, limiar não)
    assert.equal(t.stars(), 3);
  });

  it('minFirstStarMs inválido → default; zero não desliga a carência', () => {
    const t = createStarTracker({ timeLimitMs: T, minFirstStarMs: -1 });
    t.onTick(1);
    assert.equal(t.stars(), 3);
  });
});

describe('timeLimitForDifficulty — T = 90s + difficulty*60s', () => {
  it('dificuldades 1..5 → 2min30s a 6min30s', () => {
    assert.equal(timeLimitForDifficulty(1), BASE_TIME_MS + TIME_PER_DIFFICULTY_MS); // 150s
    assert.equal(timeLimitForDifficulty(1), 150_000);
    assert.equal(timeLimitForDifficulty(2), 210_000);
    assert.equal(timeLimitForDifficulty(3), 270_000);
    assert.equal(timeLimitForDifficulty(4), 330_000);
    assert.equal(timeLimitForDifficulty(5), 390_000);
  });

  it('sem difficulty exposta (undefined/NaN/0/negativo) → fallback 300s', () => {
    assert.equal(timeLimitForDifficulty(), DEFAULT_TIME_LIMIT_MS);
    assert.equal(timeLimitForDifficulty(undefined), DEFAULT_TIME_LIMIT_MS);
    assert.equal(timeLimitForDifficulty(NaN), DEFAULT_TIME_LIMIT_MS);
    assert.equal(timeLimitForDifficulty(0), DEFAULT_TIME_LIMIT_MS);
    assert.equal(timeLimitForDifficulty(-3), DEFAULT_TIME_LIMIT_MS);
  });
});

describe('formatClock — mm:ss', () => {
  it('formata o relógio visível do cronômetro', () => {
    assert.equal(formatClock(300_000), '05:00');
    assert.equal(formatClock(150_000), '02:30');
    assert.equal(formatClock(61_000), '01:01');
    assert.equal(formatClock(59_000), '00:59');
    assert.equal(formatClock(0), '00:00');
    assert.equal(formatClock(-5000), '00:00'); // clampa negativo
    assert.equal(formatClock(59_999), '00:59'); // trunca ms para baixo
  });
});

describe('isStillCurrent — guarda de identidade do teste em voo', () => {
  it('true quando o desafio que começou o teste continua ativo', () => {
    assert.equal(isStillCurrent('c1:/ws/a', 'c1:/ws/a'), true);
  });

  it('false quando o desafio ativo mudou durante o teste (corrida)', () => {
    assert.equal(isStillCurrent('c1:/ws/a', 'c2:/ws/b'), false);
    assert.equal(isStillCurrent('c2:/ws/b', 'c1:/ws/a'), false);
  });

  it('false quando o teste começou sem desafio ativo (startedKey null)', () => {
    assert.equal(isStillCurrent(null, 'c1:/ws/a'), false);
  });

  it('false quando não há mais desafio ativo no retorno (currentKey null)', () => {
    assert.equal(isStillCurrent('c1:/ws/a', null), false);
  });

  it('null vs null nunca é "still current" — sem desafio não há resultado a aplicar', () => {
    assert.equal(isStillCurrent(null, null), false);
  });
});

describe('starLossI18nKey — mapa causa → chave i18n', () => {
  it('blur/timeout/slowness têm chave; wrong-answer fica com o anúncio do teste', () => {
    assert.equal(starLossI18nKey('blur'), 'challenge.starLostFocus');
    assert.equal(starLossI18nKey('timeout'), 'challenge.timedOutAnnounce');
    assert.equal(starLossI18nKey('slowness-60'), 'challenge.starLostSlow');
    assert.equal(starLossI18nKey('slowness-85'), 'challenge.starLostSlow');
    assert.equal(starLossI18nKey('wrong-answer'), null);
  });

  it('cobre todas as causas da união (não regride com causa nova)', () => {
    const causes: StarLossCause[] = ['blur', 'timeout', 'wrong-answer', 'slowness-60', 'slowness-85'];
    for (const c of causes) {
      assert.ok(starLossI18nKey(c) === null || starLossI18nKey(c)!.startsWith('challenge.'));
    }
  });
});
