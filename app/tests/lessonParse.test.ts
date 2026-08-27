/**
 * tests/lessonParse.test.ts — parser do retorno de study.generateLesson (unknown).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseLessonResult } from '../src/lib/lessonParse';

const lessonPayload = {
  title: 'Filas em C',
  subject: 'filas em C',
  markdown: '# Filas\n\nconteúdo',
  findings: [
    { query: 'filas c', title: 'Queue (data structure)', url: 'https://ex/queue', description: 'd' },
  ],
  challenges: [
    {
      challengeId: 'c1',
      title: 'Implemente uma fila',
      language: 'c',
      concept: 'queue',
      difficulty: 2,
      status: 'ready',
      verdict: 'approved',
      workspaceDir: '/w',
      statementPath: '/w/ST.md',
    },
  ],
  createdAt: '2026-08-23T12:00:00.000Z',
};

describe('parseLessonResult', () => {
  it('aceita um StudyLesson direto', () => {
    const r = parseLessonResult(lessonPayload);
    assert.equal(r.ok, true);
    assert.equal(r.lesson?.title, 'Filas em C');
    assert.equal(r.rejected.length, 0);
    assert.equal(r.lesson?.findings.length, 1);
    assert.equal(r.lesson?.challenges.length, 1);
  });

  it('aceita { lesson, rejected }', () => {
    const payload = {
      lesson: { ...lessonPayload, markdown: '# outra' },
      rejected: [{ title: 'Desafio difícil demais', verdict: 'rejected' }],
    };
    const r = parseLessonResult(payload);
    assert.equal(r.ok, true);
    assert.equal(r.rejected.length, 1);
    assert.equal(r.rejected[0].title, 'Desafio difícil demais');
    assert.equal(r.rejected[0].reason, 'rejected');
  });

  it('markdown ausente -> ok false', () => {
    const r = parseLessonResult({ title: 'x', markdown: '' });
    assert.equal(r.ok, false);
    assert.equal(r.lesson, null);
  });

  it('string de erro vira mensagem pt-BR', () => {
    const r = parseLessonResult('backend timezone error');
    assert.equal(r.ok, false);
    assert.match(r.error ?? '', /backend timezone error/);
  });

  it('payload irreconhecível vira erro genérico', () => {
    const r = parseLessonResult(42);
    assert.equal(r.ok, false);
    assert.match(r.error ?? '', /inesperada/);
  });

  // ─── ONDA5: campos novos (opcionais — shapes antigos intactos) ──────────────

  it('ONDA5: StudyLesson direto carrega exercise (math), lessonId e subjectId', () => {
    const payload = {
      ...lessonPayload,
      exercise: {
        kind: 'math',
        family: 'arithmetic',
        seed: 42,
        prompt: 'Quanto é 7 × 6?',
        expectedNormalized: '42',
      },
      lessonId: 'lesson-abc',
      subjectId: 'subject-xyz',
    };
    const r = parseLessonResult(payload);
    assert.equal(r.ok, true);
    assert.equal(r.lesson?.exercise?.kind, 'math');
    assert.equal(r.lesson?.exercise?.family, 'arithmetic');
    assert.equal(r.lesson?.exercise?.seed, 42);
    assert.equal(r.lesson?.exercise?.prompt, 'Quanto é 7 × 6?');
    assert.equal(r.lesson?.exercise?.expectedNormalized, '42');
    assert.equal(r.lesson?.lessonId, 'lesson-abc');
    assert.equal(r.lesson?.subjectId, 'subject-xyz');
  });

  it('ONDA5: exercise não-math é IGNORADO (undefined — shape antigo intacto)', () => {
    const payload = { ...lessonPayload, exercise: { kind: 'essay', family: 'x' } };
    const r = parseLessonResult(payload);
    assert.equal(r.lesson?.exercise, undefined);
  });

  it('ONDA5: exercise com seed não-numérico vira 0 (defensivo)', () => {
    const payload = {
      ...lessonPayload,
      exercise: { kind: 'math', family: 'fractions', seed: 'nope', prompt: 'p', expectedNormalized: '1/2' },
    };
    const r = parseLessonResult(payload);
    assert.equal(r.lesson?.exercise?.seed, 0);
  });

  it('ONDA5: {lesson, rejected} carrega lessonId/subjectId do TOPO (fallback do próprio lesson)', () => {
    const payload = {
      lesson: { ...lessonPayload, lessonId: 'lesson-inner' },
      rejected: [],
      lessonId: 'lesson-top',
      subjectId: 'subject-top',
    };
    const r = parseLessonResult(payload);
    assert.equal(r.ok, true);
    assert.equal(r.lessonId, 'lesson-top', 'topo vence');
    assert.equal(r.subjectId, 'subject-top');
  });

  it('ONDA5: sem ids no topo, o ParsedLesson usa os do próprio StudyLesson', () => {
    const payload = {
      lesson: { ...lessonPayload, lessonId: 'lesson-inner', subjectId: 'subject-inner' },
      rejected: [],
    };
    const r = parseLessonResult(payload);
    assert.equal(r.lessonId, 'lesson-inner');
    assert.equal(r.subjectId, 'subject-inner');
  });

  it('ONDA5: sem ids em lugar nenhum → undefined (retrocompat total)', () => {
    const r = parseLessonResult(lessonPayload);
    assert.equal(r.lessonId, undefined);
    assert.equal(r.subjectId, undefined);
    assert.equal(r.lesson?.lessonId, undefined);
  });

  it('ONDA5: normalizeChallenge carrega slug e subjectId (opcionais)', () => {
    const payload = {
      ...lessonPayload,
      challenges: [
        {
          ...lessonPayload.challenges[0],
          slug: 'fatorial-recursivo',
          subjectId: 'subject-xyz',
        },
      ],
    };
    const r = parseLessonResult(payload);
    assert.equal(r.lesson?.challenges[0].slug, 'fatorial-recursivo');
    assert.equal(r.lesson?.challenges[0].subjectId, 'subject-xyz');
  });

  it('ONDA5: challenge sem slug/subjectId → undefined (shape antigo intacto)', () => {
    const r = parseLessonResult(lessonPayload);
    assert.equal(r.lesson?.challenges[0].slug, undefined);
    assert.equal(r.lesson?.challenges[0].subjectId, undefined);
  });
});