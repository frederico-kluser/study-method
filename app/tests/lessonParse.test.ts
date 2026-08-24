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
});