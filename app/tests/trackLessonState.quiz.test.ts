/**
 * tests/trackLessonState.quiz.test.ts — ONDA 4 (quiz): estado PURO do quiz de
 * múltipla escolha por afirmação da aula + a ancoragem do card na bolha da
 * seção (REPLAN A1).
 *
 * Contratos que mordem:
 *   1. submitQuizAnswer: correto/errado gravam answered/selected/correct;
 *      IDEMPOTENTE — a primeira resposta vence (no-op depois).
 *   2. quizForSection / isQuizAnswered: undefined/false antes, estado depois.
 *   3. resetQuiz: limpa a entrada; no-op sem resposta gravada.
 *   4. Campos ADITIVOS: applyTutorReply (que monta o objeto explicitamente,
 *      SEM spread) e pushUserMessage PRESERVAM quizBySection — o quiz
 *      respondido sobrevive aos turnos 'next'/'answer'.
 *   5. assertionsBySection: agrupa por sectionId (uma seção pode demonstrar
 *      >1 assertion); assertion SEM sectionId cai em FALLBACK_QUIZ_SECTION.
 *   6. sectionPresentationIndexes: mapeia sectionId → índice da bolha que a
 *      apresentou; a pergunta semeada do erro (message adjacente a 'review')
 *      NÃO conta como apresentação; 'next' com mensagem vazia (seção sem
 *      bolha) ancora no fim do histórico (fallback determinístico).
 *   7. quizzesByMessageIndex: assertion com sectionId → índice da bolha
 *      certa; SEM sectionId → índice da ÚLTIMA seção apresentada; múltiplas
 *      assertions na MESMA seção → mesmo índice; sem seção apresentada → nada.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  FALLBACK_QUIZ_SECTION,
  applyTutorReply,
  assertionsBySection,
  createTrackLessonState,
  isQuizAnswered,
  pushUserMessage,
  quizForSection,
  quizzesByMessageIndex,
  resetQuiz,
  sectionPresentationIndexes,
  seedChallengeError,
  submitQuizAnswer,
} from '../src/lib/trackLessonState';
import type {
  TrackAssertionDto,
  TrackChallengeErrorReport,
  TutorReply,
} from '../shared/ipc-contract';

function reply(over: Partial<TutorReply> = {}): TutorReply {
  return {
    ok: true,
    message: 'Seção apresentada.',
    sectionId: 's1',
    sectionTitle: 'Seção 1',
    done: false,
    ...over,
  };
}

function assertion(over: Partial<TrackAssertionDto> = {}): TrackAssertionDto {
  return {
    id: 'a1',
    statement: 'Afirmação da aula.',
    question: 'Qual alternativa?',
    options: ['A', 'B', 'C', 'D'],
    answerIndex: 0,
    feedback: 'Porque a teoria mostra isso.',
    ...over,
  };
}

function errorReport(challengeId = 'ch1'): TrackChallengeErrorReport {
  return {
    trackSlug: 'trilha-minima',
    lessonId: 'l1',
    challengeId,
    challengeTitle: 'Desafio 1',
    files: [{ path: 'solution.mjs', code: 'export default 1;' }],
    output: '1 test failing',
    checks: [{ name: 'check', passed: false }],
    passedCount: 0,
    totalCount: 1,
  };
}

describe('trackLessonState — onda4 quiz (submit/idempotência/reset/leitura)', () => {
  it('submit correto grava answered/selected/correct e não muta o estado anterior', () => {
    const s0 = createTrackLessonState();
    const s1 = submitQuizAnswer(s0, 's1', 2, 2);
    assert.equal(s1.quizBySection['s1'].answered, true);
    assert.equal(s1.quizBySection['s1'].selected, 2);
    assert.equal(s1.quizBySection['s1'].correct, true);
    // imutável por contrato: o estado original não recebe a resposta.
    assert.equal(s0.quizBySection['s1'], undefined);
  });

  it('submit errado grava correct=false (o feedback da assertion explica)', () => {
    const s1 = submitQuizAnswer(createTrackLessonState(), 's1', 1, 2);
    assert.equal(s1.quizBySection['s1'].answered, true);
    assert.equal(s1.quizBySection['s1'].selected, 1);
    assert.equal(s1.quizBySection['s1'].correct, false);
  });

  it('submit é IDEMPOTENTE — a primeira resposta vence', () => {
    const s1 = submitQuizAnswer(createTrackLessonState(), 's1', 2, 2);
    const s2 = submitQuizAnswer(s1, 's1', 0, 2);
    assert.deepEqual(s2.quizBySection['s1'], s1.quizBySection['s1']);
    assert.equal(s2.quizBySection['s1'].selected, 2, '2ª tentativa não sobrescreve');
  });

  it('quizForSection/isQuizAnswered: undefined/false antes; estado depois', () => {
    const s0 = createTrackLessonState();
    assert.equal(quizForSection(s0, 's1'), undefined);
    assert.equal(isQuizAnswered(s0, 's1'), false);
    const s1 = submitQuizAnswer(s0, 's1', 0, 0);
    assert.equal(isQuizAnswered(s1, 's1'), true);
    assert.equal(quizForSection(s1, 's1')?.correct, true);
    assert.equal(isQuizAnswered(s1, 'outra-secao'), false, 'seção não respondida segue false');
  });

  it('resetQuiz limpa a entrada; no-op sem resposta gravada', () => {
    const s1 = submitQuizAnswer(createTrackLessonState(), 's1', 1, 2);
    const s2 = resetQuiz(s1, 's1');
    assert.equal(s2.quizBySection['s1'], undefined);
    assert.equal(isQuizAnswered(s2, 's1'), false);
    const s3 = resetQuiz(createTrackLessonState(), 's1');
    assert.equal(s3.quizBySection['s1'], undefined, 'no-op seguro');
  });

  it('applyTutorReply PRESERVA quizBySection (objeto montado explicitamente, sem spread)', () => {
    let st = createTrackLessonState();
    st = submitQuizAnswer(st, 's1', 2, 2);
    // 'next' (nova seção) e depois 'answer' (pergunta do aluno) — o quiz
    // respondido tem que sobreviver aos DOIS turnos.
    const next = applyTutorReply(st, reply({ sectionId: 's2', done: false }));
    assert.equal(isQuizAnswered(next, 's1'), true, 'sobrevive ao next');
    const ans = applyTutorReply(st, reply({ sectionId: null, message: 'resposta', done: true }));
    assert.equal(isQuizAnswered(ans, 's1'), true, 'sobrevive ao answer');
    // pushUserMessage usa spread — também preserva.
    const asked = pushUserMessage(st, 'e se eu errar?');
    assert.equal(isQuizAnswered(asked, 's1'), true);
  });
});

describe('trackLessonState — onda4 quiz (agrupamento e ancoragem na bolha)', () => {
  it('assertionsBySection agrupa por sectionId; sem sectionId → FALLBACK_QUIZ_SECTION', () => {
    const a1 = assertion({ id: 'a1', sectionId: 's1' });
    const a2 = assertion({ id: 'a2', sectionId: 's1' });
    const a3 = assertion({ id: 'a3', sectionId: 's2' });
    const a4 = assertion({ id: 'a4' }); // sem sectionId (trilha antiga, defensivo)
    const by = assertionsBySection([a1, a2, a3, a4]);
    assert.equal(by['s1']?.length, 2, 'duas assertions na MESMA seção');
    assert.equal(by['s1']?.[0].id, 'a1');
    assert.equal(by['s1']?.[1].id, 'a2');
    assert.equal(by['s2']?.length, 1);
    assert.equal(by[FALLBACK_QUIZ_SECTION]?.length, 1, 'sem sectionId cai na chave sintética');
    assert.equal(by[FALLBACK_QUIZ_SECTION]?.[0].id, 'a4');
  });

  it('sectionPresentationIndexes mapeia seção → bolha que a apresentou', () => {
    let st = createTrackLessonState();
    st = applyTutorReply(st, reply({ sectionId: 's1' }));
    st = applyTutorReply(st, reply({ sectionId: 's2' }));
    st = applyTutorReply(st, reply({ sectionId: 's3', done: true }));
    const idx = sectionPresentationIndexes(st);
    assert.equal(idx.get('s1'), 0);
    assert.equal(idx.get('s2'), 1);
    assert.equal(idx.get('s3'), 2);
  });

  it('a pergunta semeada do erro (message adjacente a review) NÃO conta como apresentação', () => {
    let st = createTrackLessonState();
    st = applyTutorReply(st, reply({ sectionId: 's1' }));
    st = seedChallengeError(st, errorReport(), 'o que você acha que errou?');
    st = applyTutorReply(st, reply({ sectionId: 's2', done: true }));
    // histórico: [bolha s1, review, pergunta(message), bolha s2]
    assert.equal(st.history.length, 4);
    const idx = sectionPresentationIndexes(st);
    assert.equal(idx.get('s1'), 0, 's1 na 1ª bolha');
    assert.equal(idx.get('s2'), 3, 's2 na 4ª bolha — a pergunta do erro pulou');
  });

  it('next com mensagem vazia (seção SEM bolha) ancora no fim do histórico (fallback)', () => {
    let st = createTrackLessonState();
    st = applyTutorReply(st, reply({ sectionId: 's1' }));
    st = applyTutorReply(st, reply({ sectionId: 's2', message: '' }));
    assert.equal(st.history.length, 1, 's2 não gerou bolha');
    assert.deepEqual(st.presentedSections, ['s1', 's2']);
    const idx = sectionPresentationIndexes(st);
    assert.equal(idx.get('s1'), 0);
    assert.equal(idx.get('s2'), 0, 'fallback determinístico: fim do histórico');
  });

  it('quizzesByMessageIndex: assertion na bolha certa; fallback na ÚLTIMA seção; múltiplas na mesma', () => {
    const a1 = assertion({ id: 'a1', sectionId: 's1' });
    const a2 = assertion({ id: 'a2', sectionId: 's1' });
    const a3 = assertion({ id: 'a3', sectionId: 's2' });
    const a4 = assertion({ id: 'a4' }); // sem sectionId → após a última seção (s2)
    let st = createTrackLessonState();
    st = applyTutorReply(st, reply({ sectionId: 's1' }));
    st = applyTutorReply(st, reply({ sectionId: 's2', done: true }));
    const q = quizzesByMessageIndex(st, [a1, a2, a3, a4]);
    assert.deepEqual(
      (q.get(0) ?? []).map((a) => a.id),
      ['a1', 'a2'],
      'as duas assertions da seção 1 ancoram na bolha 0 (s1)',
    );
    assert.deepEqual(
      (q.get(1) ?? []).map((a) => a.id),
      ['a3', 'a4'],
      'a3 na bolha 1 (s2) e a fallback a4 na MESMA âncora (última seção)',
    );
  });

  it('quizzesByMessageIndex: sem seção apresentada → nenhum quiz no mapa', () => {
    const a1 = assertion({ id: 'a1', sectionId: 's1' });
    const a4 = assertion({ id: 'a4' });
    const q = quizzesByMessageIndex(createTrackLessonState(), [a1, a4]);
    assert.equal(q.size, 0);
  });
});
