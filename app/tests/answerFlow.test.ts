/**
 * tests/answerFlow.test.ts — lógica pura do fluxo de resposta (onda 3) +
 * vereditos digitados (onda 5: math por execução, interpretação com LLM) +
 * decisão de mark terminal de desafio (nunca-repetir).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  canAdvance,
  canAdvanceAfterVerdict,
  interpretationVerdictI18nKey,
  nextAfterAnswer,
  newLessonActionLabel,
  presentMathCheckResult,
  resolveChallengeSlug,
  shouldMarkAttempt,
  type MarkAttemptEvent,
} from '../src/lib/answerFlow';

describe('canAdvance (onda 3 — input)', () => {
  it('texto não-vazio avança; vazio/brancos não', () => {
    assert.equal(canAdvance('oi'), true);
    assert.equal(canAdvance('  oi  '), true);
    assert.equal(canAdvance(''), false);
    assert.equal(canAdvance('   '), false);
  });
});

describe('nextAfterAnswer (onda 3 — encadeamento)', () => {
  it('vazio nunca avança', () => {
    assert.equal(nextAfterAnswer({ lessons: [], answerText: '  ' }).advance, false);
  });

  it('texto com aulas → avança e escolhe a próxima', () => {
    const out = nextAfterAnswer({
      lessons: [
        { id: 'a', title: 'A', difficulty: 1, completedAt: null },
        { id: 'b', title: 'B', difficulty: 2, completedAt: null },
      ],
      answerText: 'entendi',
    });
    assert.equal(out.advance, true);
    assert.equal(out.nextLessonId, 'a', 'menor dificuldade primeiro');
  });
});

describe('newLessonActionLabel (onda 3 — rótulo do primário)', () => {
  it('com aula pendente → continuar; sem → gerar nova', () => {
    assert.equal(newLessonActionLabel(true), 'lesson.continue');
    assert.equal(newLessonActionLabel(false), 'lesson.newLesson');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * ONDA 5 — vereditos digitados
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('canAdvanceAfterVerdict (onda 5 — REGRA EXATA de avanço)', () => {
  it('correct avança; partial/incorrect NÃO avançam automaticamente', () => {
    assert.equal(canAdvanceAfterVerdict('correct'), true);
    assert.equal(canAdvanceAfterVerdict('partial'), false);
    assert.equal(canAdvanceAfterVerdict('incorrect'), false);
  });

  it('sem veredito (null) nunca avança — o veredito é pré-requisito', () => {
    assert.equal(canAdvanceAfterVerdict(null), false);
  });
});

describe('interpretationVerdictI18nKey (onda 5 — rótulos do veredito)', () => {
  it('mapeia os 3 vereditos + fallback de serviço', () => {
    assert.equal(interpretationVerdictI18nKey('correct'), 'lesson.answer.correct');
    assert.equal(interpretationVerdictI18nKey('partial'), 'lesson.answer.partial');
    assert.equal(interpretationVerdictI18nKey('incorrect'), 'lesson.answer.incorrect');
  });
});

describe('presentMathCheckResult (onda 5 — verificação por execução)', () => {
  it('correct:true → kind correct (sem esperado)', () => {
    const p = presentMathCheckResult({ correct: true, expectedNormalized: '42' });
    assert.equal(p.kind, 'correct');
    assert.equal(p.messageKey, 'lesson.math.correct');
    assert.equal(p.expectedNormalized, undefined, 'não revela nada no acerto');
  });

  it("correct:false + reason 'wrong' → revela o ESPERADO (só após errar)", () => {
    const p = presentMathCheckResult({
      correct: false,
      expectedNormalized: '5/6',
      reason: 'wrong',
    });
    assert.equal(p.kind, 'wrong');
    assert.equal(p.messageKey, 'lesson.math.wrong');
    assert.equal(p.expectedNormalized, '5/6');
  });

  it("correct:false + reason 'malformed' → mensagem de formato SEM esperado", () => {
    const p = presentMathCheckResult({ correct: false, expectedNormalized: '7', reason: 'malformed' });
    assert.equal(p.kind, 'malformed');
    assert.equal(p.messageKey, 'lesson.math.malformed');
    assert.equal(p.expectedNormalized, undefined, 'entrada ilegível não merece a solução');
  });

  it('correct:false sem reason → wrong defensivo (conta como resposta errada)', () => {
    const p = presentMathCheckResult({ correct: false, expectedNormalized: '7' });
    assert.equal(p.kind, 'wrong');
  });

  it('wrong sem expectedNormalized → mensagem sem interpolação vazia (defensivo)', () => {
    const p = presentMathCheckResult({ correct: false, expectedNormalized: null, reason: 'wrong' });
    assert.equal(p.kind, 'wrong');
    assert.equal(p.expectedNormalized, undefined);
  });

  it('null (invoke falhou) → erro de serviço, sem veredito inventado', () => {
    const p = presentMathCheckResult(null);
    assert.equal(p.kind, 'error');
    assert.equal(p.messageKey, 'lesson.math.error');
    assert.equal(p.expectedNormalized, undefined);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * ONDA 5 — mark terminal de desafio (nunca-repetir)
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('shouldMarkAttempt (onda 5 — REGRA EXATA do mark terminal)', () => {
  const ev = (event: MarkAttemptEvent['event']): MarkAttemptEvent => ({
    event,
    alreadyMarked: false,
    concluded: false,
    timedOut: false,
  });

  it('tests-passed → passed (desafio CONCLUÍDO)', () => {
    assert.equal(shouldMarkAttempt({ ...ev('tests-passed'), concluded: true }), 'passed');
  });

  it('tests-passed sem concluded → null (evento não deveria existir; defensivo)', () => {
    assert.equal(shouldMarkAttempt(ev('tests-passed')), null);
  });

  it('timed-out sem passar → timeout', () => {
    assert.equal(shouldMarkAttempt(ev('timed-out')), 'timeout');
  });

  it('timed-out com timedOut:true (o evento É o 1º estouro) → timeout mesmo assim', () => {
    assert.equal(shouldMarkAttempt({ ...ev('timed-out'), timedOut: true }), 'timeout');
  });

  it('timed-out DEPOIS de concluir → null (o relógio congelou; 1º terminal vence)', () => {
    assert.equal(shouldMarkAttempt({ ...ev('timed-out'), concluded: true }), null);
  });

  it('switched sem concluir/estourar → abandoned', () => {
    assert.equal(shouldMarkAttempt(ev('switched')), 'abandoned');
  });

  it('switched DEPOIS de concluir ou estourar → null (já teve terminal)', () => {
    assert.equal(shouldMarkAttempt({ ...ev('switched'), concluded: true }), null);
    assert.equal(shouldMarkAttempt({ ...ev('switched'), timedOut: true }), null);
  });

  it('alreadyMarked → null SEMPRE (idempotente: 1ª tentativa terminal vence)', () => {
    for (const event of ['tests-passed', 'timed-out', 'switched'] as const) {
      assert.equal(
        shouldMarkAttempt({ ...ev(event), alreadyMarked: true, concluded: true }),
        null,
        event,
      );
    }
  });

  it('NUNCA devolve "failed" (o primeiro teste falho não é terminal)', () => {
    for (const event of ['tests-passed', 'timed-out', 'switched'] as const) {
      assert.notEqual(shouldMarkAttempt(ev(event)), 'failed');
    }
  });
});

describe('resolveChallengeSlug (onda 5 — challengeId do mark)', () => {
  it('ChallengeInfo.slug presente → ele mesmo', () => {
    assert.equal(
      resolveChallengeSlug({ slug: 'fatorial-recursivo', workspaceDir: '/w/0007-fatorial-recursivo', challengeId: 'c1' }),
      'fatorial-recursivo',
    );
  });

  it('sem slug → basename do workspaceDir SEM o prefixo NNNN (contrato do main)', () => {
    assert.equal(
      resolveChallengeSlug({ workspaceDir: '/x/challenges/0007-fatorial-recursivo', challengeId: 'c1' }),
      'fatorial-recursivo',
    );
  });

  it('sem prefixo NNNN no basename → basename puro', () => {
    assert.equal(
      resolveChallengeSlug({ workspaceDir: '/x/desafio-simples', challengeId: 'c1' }),
      'desafio-simples',
    );
  });

  it('sem slug e sem workspaceDir → challengeId (último recurso)', () => {
    assert.equal(resolveChallengeSlug({ challengeId: 'c1' }), 'c1');
  });

  it('slug em branco → deriva (trim defende)', () => {
    assert.equal(
      resolveChallengeSlug({ slug: '   ', workspaceDir: '/w/0003-busca-binaria', challengeId: 'c1' }),
      'busca-binaria',
    );
  });
});
