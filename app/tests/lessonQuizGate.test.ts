/**
 * tests/lessonQuizGate.test.ts — ONDA10, DEFEITO 2: o quiz PODIA SER IGNORADO.
 *
 * O QUE O CÓDIGO ANTIGO FAZIA: `isLessonFinishBlocked` só olhava o veredito
 * dos DESAFIOS —
 *
 *     return challenges.length > 0 && challenges.some((c) => c.lastVerdict !== 'passed');
 *
 * — e a LessonView renderizava o card do quiz como REFORÇO ("NUNCA bloqueia o
 * Próximo"). Com todos os desafios passados e NENHUM quiz respondido, o botão
 * "Concluir aula" ficava LIBERADO: dava para terminar a aula sem responder
 * nada. O dono: "quero que o usuario tenha que responder".
 *
 * O QUE ESTA SUÍTE TRAVA:
 *   1. quiz visível sem resposta BLOQUEIA o "Concluir aula" mesmo com todos os
 *      desafios passados — este é o teste que REPROVA o código antigo por
 *      ASSERÇÃO (a função antiga ignora o 2º argumento e devolve `false`);
 *   2. o motivo do bloqueio é EXPLÍCITO (`lessonFinishBlock` → 'quiz' |
 *      'challenges' | null) — a UI tem o que DIZER, nunca um botão mudo;
 *   3. ERRAR NÃO TRAVA: responder errado libera exatamente como acertar (o
 *      gate lê `answered`, jamais `correct`), e `submitQuizAnswer` continua
 *      idempotente — a primeira resposta vence;
 *   4. o "Próximo" trava só pela seção ATUAL
 *      (`pendingQuizzesForCurrentSection` / `isNextSectionBlockedByQuiz`);
 *   5. quiz que o aluno AINDA NÃO PODE VER (seção não apresentada) não
 *      bloqueia nada;
 *   6. assertion SEM sectionId entra no gate pela chave `id` (`quizKeyFor`);
 *   7. compatibilidade: `isLessonFinishBlocked(challenges)` sem o 2º argumento
 *      mantém o comportamento da ONDA2 byte a byte.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyTutorReply,
  createTrackLessonState,
  isLessonFinishBlocked,
  isNextSectionBlockedByQuiz,
  lessonFinishBlock,
  pendingQuizzes,
  pendingQuizzesForCurrentSection,
  quizKeyFor,
  submitQuizAnswer,
  type TrackLessonUiState,
} from '../src/lib/trackLessonState';
import type { TrackAssertionDto, TrackVerdict, TutorReply } from '../shared/ipc-contract';

function assertion(over: Partial<TrackAssertionDto> = {}): TrackAssertionDto {
  return {
    id: 'a1',
    statement: 'Afirmação da aula.',
    question: 'Pergunta?',
    options: ['a', 'b', 'c', 'd'],
    answerIndex: 1,
    feedback: 'porque sim',
    sectionId: 's1',
    ...over,
  };
}

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

function ch(lastVerdict: TrackVerdict | null): { lastVerdict: TrackVerdict | null } {
  return { lastVerdict };
}

/** Estado com as seções `ids` já apresentadas (uma bolha por seção). */
function presented(...ids: string[]): TrackLessonUiState {
  let s = createTrackLessonState();
  ids.forEach((id, i) => {
    s = applyTutorReply(s, reply({ sectionId: id, message: `Seção ${id}.` }), 1000 + i);
  });
  return s;
}

describe('ONDA10 defeito 2 — o quiz vira OBRIGATÓRIO para CONCLUIR a aula', () => {
  it('PROVA MÍNIMA (só API antiga): quiz pendente bloqueia mesmo com tudo passed', () => {
    // Este caso usa SOMENTE `isLessonFinishBlocked` — a assinatura que já
    // existia. Contra o código ANTIGO ele reprova por ASSERÇÃO (e não por
    // export faltando): a versão antiga ignorava qualquer coisa além dos
    // desafios e devolvia `false` aqui, liberando o "Concluir aula" com o
    // quiz intocado. É exatamente o defeito que o dono descreveu.
    assert.equal(
      isLessonFinishBlocked([ch('passed')], 1),
      true,
      'um quiz sem resposta basta para bloquear a conclusão',
    );
    assert.equal(isLessonFinishBlocked([], 2), true, 'idem sem nenhum desafio na aula');
  });

  it('desafios TODOS passados + quiz sem resposta → CONCLUIR bloqueado', () => {
    const s = presented('s1');
    const as = [assertion()];
    const pend = pendingQuizzes(s, as);
    assert.equal(pend.length, 1, 'o quiz da seção apresentada está pendente');
    // ↓ é ESTA linha que o código antigo reprova: ele ignorava os quizzes e
    //   devolvia false, liberando a conclusão sem nenhuma resposta.
    assert.equal(
      isLessonFinishBlocked([ch('passed')], pend.length),
      true,
      'com quiz sem resposta a aula NÃO pode ser concluída',
    );
    assert.equal(lessonFinishBlock([ch('passed')], pend.length), 'quiz');
  });

  it('sem desafio nenhum, o quiz sozinho já bloqueia a conclusão', () => {
    const s = presented('s1');
    const pend = pendingQuizzes(s, [assertion()]);
    assert.equal(isLessonFinishBlocked([], pend.length), true);
    assert.equal(lessonFinishBlock([], pend.length), 'quiz');
  });

  it('respondido (mesmo ERRADO) → o gate do quiz sai do caminho', () => {
    const s0 = presented('s1');
    const a = assertion({ answerIndex: 1 });
    // resposta ERRADA (escolheu 3, a certa é 1)
    const s1 = submitQuizAnswer(s0, quizKeyFor(a), 3, a.answerIndex);
    assert.equal(s1.quizBySection.s1.correct, false, 'errou mesmo');
    assert.equal(pendingQuizzes(s1, [a]).length, 0, 'errar CONTA como responder');
    assert.equal(isLessonFinishBlocked([ch('passed')], pendingQuizzes(s1, [a]).length), false);
    assert.equal(lessonFinishBlock([ch('passed')], pendingQuizzes(s1, [a]).length), null);
  });

  it('o gate lê `answered` e NUNCA `correct`: certo e errado liberam igual', () => {
    const a = assertion({ answerIndex: 1 });
    const base = presented('s1');
    const errado = submitQuizAnswer(base, quizKeyFor(a), 0, a.answerIndex);
    const certo = submitQuizAnswer(base, quizKeyFor(a), 1, a.answerIndex);
    assert.equal(pendingQuizzes(errado, [a]).length, 0, 'errado libera');
    assert.equal(pendingQuizzes(certo, [a]).length, 0, 'certo libera');
    assert.equal(
      lessonFinishBlock([], pendingQuizzes(errado, [a]).length),
      lessonFinishBlock([], pendingQuizzes(certo, [a]).length),
      'errar e acertar produzem o MESMO destravamento',
    );
  });

  it('idempotência preservada: a PRIMEIRA resposta vence (errar não vira armadilha de retentativa)', () => {
    const a = assertion({ answerIndex: 1 });
    const s1 = submitQuizAnswer(presented('s1'), quizKeyFor(a), 3, a.answerIndex);
    const s2 = submitQuizAnswer(s1, quizKeyFor(a), 1, a.answerIndex);
    assert.equal(s2, s1, 'no-op: mesma referência');
    assert.equal(s2.quizBySection.s1.selected, 3, 'a primeira escolha permanece');
    assert.equal(pendingQuizzes(s2, [a]).length, 0, 'e continua destravado');
  });

  it('motivo do bloqueio: quiz tem precedência sobre desafios; sem nada pendente → null', () => {
    const s = presented('s1');
    const a = assertion();
    // quiz pendente E desafio pendente → 'quiz' (desbloqueio mais barato)
    assert.equal(lessonFinishBlock([ch(null)], pendingQuizzes(s, [a]).length), 'quiz');
    // quiz respondido, desafio pendente → 'challenges'
    const respondido = submitQuizAnswer(s, quizKeyFor(a), 0, a.answerIndex);
    assert.equal(lessonFinishBlock([ch('failed')], pendingQuizzes(respondido, [a]).length), 'challenges');
    // tudo em ordem → null
    assert.equal(lessonFinishBlock([ch('passed')], pendingQuizzes(respondido, [a]).length), null);
  });

  it('quiz de seção NÃO apresentada não bloqueia (o aluno nem pode vê-lo)', () => {
    const s = presented('s1');
    const futura = assertion({ id: 'a2', sectionId: 's2' });
    assert.deepEqual(pendingQuizzes(s, [futura]), [], 'quiz sem âncora visível fica fora do gate');
    assert.equal(isLessonFinishBlocked([ch('passed')], pendingQuizzes(s, [futura]).length), false);
  });

  it('aula SEM assertions: nada de quiz, nada de bloqueio novo', () => {
    const s = presented('s1', 's2');
    assert.deepEqual(pendingQuizzes(s, []), []);
    assert.equal(isLessonFinishBlocked([ch('passed')], 0), false);
    assert.equal(isNextSectionBlockedByQuiz(s, []), false);
  });

  it('assertion SEM sectionId entra no gate pela chave `id`', () => {
    const s = presented('s1');
    const semSecao = assertion({ id: 'solta', sectionId: undefined });
    assert.equal(quizKeyFor(semSecao), 'solta');
    assert.equal(pendingQuizzes(s, [semSecao]).length, 1, 'ancorada na última seção → conta');
    const resp = submitQuizAnswer(s, quizKeyFor(semSecao), 0, semSecao.answerIndex);
    assert.equal(pendingQuizzes(resp, [semSecao]).length, 0);
  });

  it('duas assertions na MESMA seção compartilham a chave: uma resposta cobre as duas', () => {
    const s = presented('s1');
    const a1 = assertion({ id: 'a1' });
    const a2 = assertion({ id: 'a2', sectionId: 's1' });
    // as duas compartilham a chave 's1' → uma resposta cobre as duas (mesma
    // seção = mesmo estado de quiz, contrato da ONDA4 preservado).
    assert.equal(pendingQuizzes(s, [a1, a2]).length, 2, 'nenhuma respondida → duas pendentes');
    const resp = submitQuizAnswer(s, 's1', 0, a1.answerIndex);
    assert.equal(pendingQuizzes(resp, [a1, a2]).length, 0);
  });

  it('ordem determinística: pendências saem na ordem das bolhas do histórico', () => {
    const s = presented('s1', 's2');
    const a1 = assertion({ id: 'a1', sectionId: 's1' });
    const a2 = assertion({ id: 'a2', sectionId: 's2' });
    assert.deepEqual(
      pendingQuizzes(s, [a2, a1]).map((a) => a.id),
      ['a1', 'a2'],
      'ordem do histórico, não a ordem do array de assertions',
    );
  });
});

describe('ONDA10 defeito 2 — o "Próximo" trava pela seção ATUAL', () => {
  it('seção atual com quiz sem resposta → avanço bloqueado', () => {
    const s = presented('s1');
    const a = assertion();
    assert.equal(pendingQuizzesForCurrentSection(s, [a]).length, 1);
    assert.equal(isNextSectionBlockedByQuiz(s, [a]), true);
  });

  it('respondido (errado) → o avanço libera na hora', () => {
    const a = assertion({ answerIndex: 1 });
    const s = submitQuizAnswer(presented('s1'), quizKeyFor(a), 2, a.answerIndex);
    assert.equal(isNextSectionBlockedByQuiz(s, [a]), false, 'errar libera o avanço');
  });

  it('quiz PENDENTE de seção ANTERIOR não trava o "Próximo" (só a conclusão)', () => {
    const s = presented('s1', 's2');
    const antiga = assertion({ id: 'a1', sectionId: 's1' });
    assert.equal(
      isNextSectionBlockedByQuiz(s, [antiga]),
      false,
      'a trava do avanço é da seção ATUAL',
    );
    assert.equal(
      pendingQuizzes(s, [antiga]).length,
      1,
      'mas a conclusão continua bloqueada por ela',
    );
  });

  it('seção atual SEM quiz → avanço livre', () => {
    const s = presented('s1', 's2');
    const soNaPrimeira = assertion({ id: 'a1', sectionId: 's1' });
    const respondida = submitQuizAnswer(s, 's1', 0, soNaPrimeira.answerIndex);
    assert.equal(isNextSectionBlockedByQuiz(respondida, [soNaPrimeira]), false);
  });

  it('nenhuma seção apresentada ainda → nada a responder, nada a travar', () => {
    const vazio = createTrackLessonState();
    assert.deepEqual(pendingQuizzesForCurrentSection(vazio, [assertion()]), []);
    assert.equal(isNextSectionBlockedByQuiz(vazio, [assertion()]), false);
  });
});

describe('ONDA10 defeito 2 — compatibilidade com o gate da ONDA2', () => {
  it('isLessonFinishBlocked(challenges) sem quiz mantém a regra antiga', () => {
    assert.equal(isLessonFinishBlocked([]), false, 'sem desafios → liberado');
    assert.equal(isLessonFinishBlocked([ch('passed'), ch('passed')]), false, 'todos passed → liberado');
    assert.equal(isLessonFinishBlocked([ch('passed'), ch(null)]), true, 'nunca tentado → bloqueia');
    assert.equal(isLessonFinishBlocked([ch('failed')]), true, 'falhou → bloqueia');
    assert.equal(isLessonFinishBlocked([ch('timeout')]), true, 'timeout → bloqueia');
    assert.equal(isLessonFinishBlocked([ch('abandoned')]), true, 'abandonado → bloqueia');
  });

  it('pendingQuizCount 0 é o default — nenhum chamador antigo muda de comportamento', () => {
    assert.equal(lessonFinishBlock([ch('passed')]), null);
    assert.equal(lessonFinishBlock([ch(null)]), 'challenges');
  });
});
