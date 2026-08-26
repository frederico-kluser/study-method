/**
 * tests/ui/answerFlow.test.ts — canAdvance / nextAfterAnswer / newLessonActionLabel
 * (lógica pura do fluxo de resposta encadeada da aula). Sem jsdom.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  canAdvance,
  nextAfterAnswer,
  newLessonActionLabel,
} from '../../src/lib/answerFlow';
import type { LessonCandidate } from '../../electron/main/domain/lessonEngine';

describe('canAdvance', () => {
  it("rejeita string vazia (não avança)", () => {
    assert.equal(canAdvance(''), false);
  });

  it('rejeita somente espaços/whitespace', () => {
    assert.equal(canAdvance('   '), false);
    assert.equal(canAdvance('\n\t '), false);
  });

  it('aceita texto com conteúdo (após trim)', () => {
    assert.equal(canAdvance('Entendi a inversão de árvore'), true);
    assert.equal(canAdvance('  resposta  '), true);
  });
});

describe('nextAfterAnswer', () => {
  const lessons: LessonCandidate[] = [
    { id: 'l1', title: 'Árvore binária', difficulty: 2, completedAt: null },
    { id: 'l2', title: 'Árvore balanceada', difficulty: 3, completedAt: '2026-01-01' },
  ];

  it('resposta vazia NUNCA avança (mesmo com aulas pendentes)', () => {
    const r = nextAfterAnswer({ lessons, answerText: '   ' });
    assert.equal(r.advance, false);
    assert.equal(r.nextLessonId, undefined);
  });

  it('com resposta e aula incompleta → avança para a próxima (menor dificuldade)', () => {
    const r = nextAfterAnswer({ lessons, answerText: 'entendi' });
    assert.equal(r.advance, true);
    assert.equal(r.nextLessonId, 'l1');
    assert.ok(typeof r.reason === 'string' && r.reason.length > 0);
  });

  it('sem resposta não avança mesmo quando há próxima', () => {
    const r = nextAfterAnswer({ lessons, answerText: '' });
    assert.equal(r.advance, false);
    assert.equal(r.nextLessonId, undefined);
  });

  it('com resposta mas SEM próxima aula → advance true sem nextLessonId (sugere nova)', () => {
    const r = nextAfterAnswer({ lessons: [], answerText: 'ok' });
    assert.equal(r.advance, true);
    assert.equal(r.nextLessonId, undefined);
  });

  it('com resposta e TODAS completas → avança para a de maior dificuldade', () => {
    const allDone: LessonCandidate[] = [
      { id: 'a1', title: 'Base', difficulty: 1, completedAt: '2026-01-01' },
      { id: 'a2', title: 'Avançado', difficulty: 4, completedAt: '2026-01-02' },
    ];
    const r = nextAfterAnswer({ lessons: allDone, answerText: 'entendi' });
    assert.equal(r.advance, true);
    assert.equal(r.nextLessonId, 'a2');
  });
});

describe('newLessonActionLabel', () => {
  it('hasLessons=true → key de CONTINUAR (próxima aula pendente)', () => {
    assert.equal(newLessonActionLabel(true), 'lesson.continue');
  });

  it('hasLessons=false → key de GERAR NOVA aula', () => {
    assert.equal(newLessonActionLabel(false), 'lesson.newLesson');
  });
});
