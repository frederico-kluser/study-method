/**
 * tests/quizOneAtATime.test.ts — ONDA-UMA-PERGUNTA-POR-VEZ (pedido do dono).
 *
 * A RECLAMAÇÃO, AO PÉ DA LETRA: *"a pergunta de responder não veio, somente
 * quando cliquei em continuar e vieram as duas juntas"*. O que a tela fazia:
 * TODA a fila de quizzes ancorados numa bolha nascia junto — numa seção com
 * duas assertions (47 das 330 aulas da base; a aula real `a-primeira-linha` é
 * exatamente esse caso) os DOIS cards apareciam juntos sob a mesma bolha, e a
 * seção anterior, sem quiz, ficava sem pergunta nenhuma.
 *
 * A REGRA NOVA, pedido do dono literal: *"uma pergunta por vez … responder uma
 * libera a próxima; nunca duas cards juntas"*:
 *   - `nextPendingQuiz` (trackLessonState) é o HEAD da fila de não dominadas,
 *     na ordem determinística de `pendingQuizzes` — e a ÚNICA pergunta em cena;
 *   - dominar a atual LIBERA a próxima (a fila anda); ERRAR não libera (o ciclo
 *     de remediação mantém a chave corrente como head até o acerto);
 *   - os GATES não mudam: `pendingQuizzes`/`pendingQuizzesForCurrentSection`/
 *     `lessonFinishBlock` continuam contendo TODAS as pendentes — a fila
 *     CONTA, a tela mostra UMA. "Próximo"/"Concluir aula" seguem travados até
 *     a última;
 *   - o card da pergunta em cena continua só nascendo quando a bolha âncora
 *     termina de ser escrita (um quiz nunca interrompe a leitura).
 *
 * O QUE ESTA SUÍTE TRAVA:
 *   1. com a seção sem quiz apresentada, NÃO há pergunta em cena (nada é
 *      inventado para tampar o buraco do dado);
 *   2. com as duas assertions da mesma seção ancoradas, a pergunta em cena é
 *      UMA SÓ — a primeira da ordem determinística — e a segunda fica na fila
 *      (visível ao gate, invisível à tela);
 *   3. dominar a atual libera a próxima; dominar as duas esvazia a cena;
 *   4. ERRAR não libera a próxima (o head não anda sem acerto);
 *   5. com a aula inteira apresentada, a fila anda na ordem das bolhas e o
 *      fim é null;
 *   6. os gates seguem contendo todas as pendentes (a mudança é só visual);
 *   7. GUARDA DE FONTE: a LessonView renderiza o card pendente SÓ do head
 *      (mesma técnica de tests/lessonQuizKeyCoherence.test.ts — o repo não usa
 *      jsdom e a view é um componente React grande demais para SSR).
 *
 * Reprodução: `cd app && npm test -- tests/quizOneAtATime.test.ts`
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  applyTutorReply,
  createTrackLessonState,
  isNextSectionBlockedByQuiz,
  lessonFinishBlock,
  nextPendingQuiz,
  pendingQuizzes,
  quizKeyFor,
  submitQuizAnswer,
  type TrackLessonUiState,
} from '../src/lib/trackLessonState';
import type { TrackAssertionDto, TrackVerdict, TutorReply } from '../shared/ipc-contract';

const HERE = dirname(fileURLToPath(import.meta.url));

/** A aula REAL do repositório — o caso da reclamação: a 1ª seção sem quiz e a
 *  2ª com DUAS assertions (elas nasciam juntas na tela). */
const LESSON_PATH = resolve(
  HERE,
  '../resources/tracks/python-iniciante/modules/a-tela/lessons/a-primeira-linha/lesson.json',
);

interface RealLesson {
  theory: { id: string; title: string; markdown: string }[];
  assertions: TrackAssertionDto[];
}

const LESSON = JSON.parse(readFileSync(LESSON_PATH, 'utf8')) as RealLesson;

/** Desafios já concluídos — isola a dimensão QUIZ dos gates de fim de aula. */
const CHALLENGES_PASSED: readonly { lastVerdict: TrackVerdict | null }[] = [
  { lastVerdict: 'passed' },
];

/** O tutor apresenta as seções pedidas (uma bolha por seção, como o 'next'). */
function presentSections(...sectionIds: string[]): TrackLessonUiState {
  let s = createTrackLessonState();
  for (const id of sectionIds) {
    const section = LESSON.theory.find((t) => t.id === id);
    assert.ok(section !== undefined, `seção fixture ${id} existe`);
    const reply: TutorReply = {
      ok: true,
      message: section.markdown,
      sectionId: section.id,
      done: false,
    };
    s = applyTutorReply(s, reply, 1_000);
  }
  return s;
}

/** As ids das seções da aula real, em ordem. */
const SECTION_IDS = LESSON.theory.map((t) => t.id);

/** As assertions da seção `sectionId`, na ordem autoral. */
function assertionsOf(sectionId: string): TrackAssertionDto[] {
  return LESSON.assertions.filter((a) => a.sectionId === sectionId);
}

/** Domina a pergunta em cena (acerto na alternativa certa). */
function master(s: TrackLessonUiState): TrackLessonUiState {
  const head = nextPendingQuiz(s, LESSON.assertions);
  assert.ok(head !== null, 'há pergunta em cena para dominar');
  return submitQuizAnswer(s, quizKeyFor(head), head.answerIndex, head.answerIndex, 2_000);
}

describe('ONDA-UMA-PERGUNTA-POR-VEZ — a pergunta em cena é o head da fila', () => {
  it('seção sem quiz apresentada ⇒ NENHUMA pergunta em cena (nada é inventado)', () => {
    const s = presentSections(SECTION_IDS[0]);
    assert.equal(assertionsOf(SECTION_IDS[0]).length, 0, 'a 1ª seção da aula real não tem quiz');
    assert.equal(nextPendingQuiz(s, LESSON.assertions), null);
    assert.equal(pendingQuizzes(s, LESSON.assertions).length, 0);
  });

  it('duas assertions na MESMA seção ⇒ UMA pergunta em cena; a segunda fica na fila', () => {
    const s = presentSections(SECTION_IDS[0], SECTION_IDS[1]);
    const [first, second] = assertionsOf(SECTION_IDS[1]);
    assert.ok(first !== undefined && second !== undefined, 'a 2ª seção da aula real tem DUAS assertions');
    // a fila INTEIRA conta para o gate…
    assert.deepEqual(
      pendingQuizzes(s, LESSON.assertions).map((a) => a.id),
      [first.id, second.id],
    );
    // …mas a tela mostra UMA: o head, e nunca a segunda junto.
    assert.equal(nextPendingQuiz(s, LESSON.assertions)?.id, first.id);
  });

  it('dominar a pergunta em cena LIBERA a próxima (uma por vez)', () => {
    let s = presentSections(SECTION_IDS[0], SECTION_IDS[1]);
    const [first, second] = assertionsOf(SECTION_IDS[1]);
    assert.equal(nextPendingQuiz(s, LESSON.assertions)?.id, first.id);
    s = master(s);
    assert.equal(nextPendingQuiz(s, LESSON.assertions)?.id, second.id, 'a segunda entra em cena só agora');
    s = master(s);
    assert.equal(
      nextPendingQuiz(s, LESSON.assertions),
      null,
      'com as duas dominadas a cena esvazia (a 3ª seção ainda não foi apresentada)',
    );
  });

  it('ERRAR não libera a próxima — o head não anda sem acerto', () => {
    const s0 = presentSections(SECTION_IDS[0], SECTION_IDS[1]);
    const [first, second] = assertionsOf(SECTION_IDS[1]);
    const wrong = (first.answerIndex + 1) % first.options.length;
    const s1 = submitQuizAnswer(s0, quizKeyFor(first), wrong, first.answerIndex, 2_000);
    assert.equal(nextPendingQuiz(s1, LESSON.assertions)?.id, first.id, 'o erro abre remediação, não a fila');
    assert.equal(second.sectionId, first.sectionId, 'as duas dividem a seção (o caso da reclamação)');
    assert.equal(pendingQuizzes(s1, LESSON.assertions).length, 2, 'o gate segue vendo as duas');
  });

  it('com a aula inteira apresentada a fila anda na ordem das bolhas e termina null', () => {
    let s = presentSections(...SECTION_IDS);
    const order = LESSON.assertions.map((a) => a.id);
    assert.deepEqual(pendingQuizzes(s, LESSON.assertions).map((a) => a.id), order, 'ordem determinística');
    for (const expected of order) {
      assert.equal(nextPendingQuiz(s, LESSON.assertions)?.id, expected, `head = ${expected}`);
      s = master(s);
    }
    assert.equal(nextPendingQuiz(s, LESSON.assertions), null);
  });

  it('os GATES continuam contendo todas as pendentes — a mudança é só visual', () => {
    let s = presentSections(...SECTION_IDS);
    s = master(s); // domina a 1ª da fila
    // restam 2 pendentes (a fila anda, o gate não afrouxa):
    assert.equal(pendingQuizzes(s, LESSON.assertions).length, LESSON.assertions.length - 1);
    assert.equal(isNextSectionBlockedByQuiz(s, LESSON.assertions), true, '"Próximo" segue travado');
    assert.equal(
      lessonFinishBlock(CHALLENGES_PASSED, pendingQuizzes(s, LESSON.assertions).length),
      'quiz',
      '"Concluir aula" segue travado',
    );
  });
});

describe('ONDA-UMA-PERGUNTA-POR-VEZ — guarda de FONTE: a view renderiza só o head', () => {
  const file = resolve(HERE, '../src/views/LessonView/LessonView.tsx');
  const src = readFileSync(file, 'utf8');
  /** Fonte sem comentários (só o código que realmente roda) — mesma técnica
   *  de tests/lessonQuizKeyCoherence.test.ts. */
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('a view decide a pergunta em cena pela função PURA nextPendingQuiz', () => {
    assert.match(
      src,
      /import\s*\{[\s\S]*?\bnextPendingQuiz\b[\s\S]*?\}\s*from\s*'\.\.\/\.\.\/lib\/trackLessonState'/,
      'nextPendingQuiz precisa vir de trackLessonState',
    );
    assert.ok(code.includes('nextPendingQuiz(chat,'), 'a view deve chamar nextPendingQuiz com o estado do chat');
  });

  it('o card pendente só renderiza para a pergunta em cena (o head)', () => {
    assert.ok(
      code.includes("questionInScene?.visible.key !== visible.key"),
      'a view precisa pular o render de qualquer pendente que NÃO seja a pergunta em cena',
    );
  });

  it('a pergunta em cena não interrompe a leitura da seção que a demonstra', () => {
    assert.ok(
      code.includes('!streamingIds.has(questionInScene.anchorIndex)'),
      'o card só nasce quando a bolha âncora terminou de ser escrita',
    );
  });
});
