/**
 * tests/lessonQuizKeyCoherence.test.ts — ONDA1-MAESTRIA, DEFEITO DE
 * INTEGRAÇÃO: a VIEW escrevia o quiz numa chave e o GATE lia de outra.
 *
 * O QUE ACONTECEU. A onda consertou um bug real de colisão em `quizKeyFor`:
 * a chave do estado do quiz deixou de ser a `sectionId` (com a `id` como
 * fallback) e passou a ser `sectionId::assertionId` — duas assertions da
 * MESMA seção colidiam, e responder uma marcava as duas. Só que a
 * `LessonView` continuou calculando a chave INLINE, pela fórmula ANTIGA,
 * nos dois lados:
 *
 *     const quizKey = assertion.sectionId ?? assertion.id;   // leitura (card)
 *     handleQuizSelect(quizKey, ...)  →  submitQuizAnswer(s, quizKey, ...)
 *
 * enquanto `pendingQuizzes` / `pendingQuizzesForCurrentSection` /
 * `isNextSectionBlockedByQuiz` — que a MESMA view já consumia — derivavam a
 * chave internamente por `quizKeyFor`. Escrita e leitura em chaves
 * diferentes: o aluno respondia CERTO, `quizBySection` ganhava a chave
 * 'as-tres-partes-da-linha', o gate procurava
 * 'as-tres-partes-da-linha::print-mostra-na-tela', não achava nada dominado e
 * o "Próximo"/"Concluir aula" travava PARA SEMPRE. Como 100% das assertions
 * reais do repositório têm `sectionId`, o efeito era universal — pior que o
 * bug original, que custava 1 quiz pulado.
 *
 * O QUE ESTA SUÍTE TRAVA:
 *   1. o BUG, executável, na aula REAL `a-primeira-linha` (3 assertions, 2
 *      seções com quiz): respondendo tudo CERTO pela fórmula antiga, os 3
 *      quizzes continuam pendentes e o gate segue fechado;
 *   2. o CONSERTO, no mesmo cenário: respondendo pela fonte canônica
 *      (`visibleQuizFor` → `quizKeyFor`), `pendingQuizzes` esvazia,
 *      `isNextSectionBlockedByQuiz` vira false e `lessonFinishBlock` deixa de
 *      dizer 'quiz';
 *   3. as chaves ESCRITAS são exatamente as que `quizKeyFor` produz;
 *   4. duas assertions da MESMA seção continuam INDEPENDENTES (a colisão que
 *      originou a mudança de chave não pode voltar por nenhum dos lados);
 *   5. GUARDA DE FONTE: `LessonView.tsx` não pode voltar a computar chave de
 *      quiz inline — nem pela fórmula antiga (`sectionId ??`), nem montando
 *      `'::'` na mão — e precisa importar e usar `visibleQuizFor`.
 *
 * POR QUE A GUARDA É TEXTUAL. `LessonView` é um componente React e o repo não
 * usa jsdom — não há como montá-lo num teste de `node:test` para observar a
 * chave que ele escreve. É a MESMA razão (e a mesma técnica) do precedente
 * `tests/lessonQuizVisual.test.ts` ("guarda de FONTE: o JSX do card não vê
 * answerIndex"): lê-se o arquivo como TEXTO, removem-se os comentários, e
 * reprova-se o código que roda. Os itens 1–4 provam a REGRA na máquina pura;
 * o item 5 prova que a view está ligada nela.
 *
 * ANTES DO CONSERTO esta suíte não passa — MEDIDO contra a versão anterior do
 * arquivo (`git show HEAD:.../LessonView.tsx`): a guarda de fonte encontra
 * `assertion.sectionId ?? assertion.id` e `quizForSection(` no código da view,
 * e não encontra nem o import nem a chamada de `visibleQuizFor`. Os itens 1–4
 * rodam sobre a máquina pura (que já estava correta) e documentam, de forma
 * executável, que as duas chaves são MESMO diferentes: o item 1 percorre
 * literalmente o caminho que a view seguia e termina com o gate fechado.
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
  pendingQuizzes,
  quizKeyFor,
  quizzesByMessageIndex,
  submitQuizAnswer,
  visibleQuizFor,
  type TrackLessonUiState,
} from '../src/lib/trackLessonState';
import type { TrackAssertionDto, TrackVerdict, TutorReply } from '../shared/ipc-contract';

const HERE = dirname(fileURLToPath(import.meta.url));

/** A aula REAL do repositório: 3 assertions, 2 delas na MESMA seção. */
const LESSON_PATH = resolve(
  HERE,
  '../resources/tracks/python/modules/a-tela/lessons/a-primeira-linha/lesson.json',
);

interface RealLesson {
  theory: { id: string; title: string; markdown: string }[];
  assertions: TrackAssertionDto[];
}

const LESSON = JSON.parse(readFileSync(LESSON_PATH, 'utf8')) as RealLesson;

/** Desafios já concluídos — isola a dimensão QUIZ do gate de "Concluir aula". */
const CHALLENGES_PASSED: readonly { lastVerdict: TrackVerdict | null }[] = [
  { lastVerdict: 'passed' },
];

/** O tutor apresenta TODA a teoria da aula (uma bolha por seção, como o 'next'). */
function presentAllSections(): TrackLessonUiState {
  let s = createTrackLessonState();
  for (const section of LESSON.theory) {
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

/** As assertions que a view REALMENTE renderiza, na ordem das bolhas. */
function visibleAssertions(state: TrackLessonUiState): TrackAssertionDto[] {
  const byIndex = quizzesByMessageIndex(state, LESSON.assertions);
  return [...byIndex.keys()]
    .sort((a, b) => a - b)
    .flatMap((idx) => byIndex.get(idx) ?? []);
}

describe('ONDA1-MAESTRIA — a chave do quiz da view bate com a da máquina (aula REAL)', () => {
  it('a aula REAL é o cenário do defeito: 3 assertions, TODAS com sectionId, 2 na mesma seção', () => {
    assert.equal(LESSON.assertions.length, 3);
    assert.ok(
      LESSON.assertions.every((a) => a.sectionId !== undefined),
      'toda assertion real tem sectionId — a fórmula antiga jamais caía no fallback da id',
    );
    const bySection = new Set(LESSON.assertions.map((a) => a.sectionId));
    assert.equal(bySection.size, 2, 'duas seções demonstram as três afirmações');
  });

  it('BUG, executável: a fórmula ANTIGA (chave inline) responde tudo CERTO e o gate NÃO abre', () => {
    let s = presentAllSections();
    const shown = visibleAssertions(s);
    assert.deepEqual(
      shown.map((a) => a.id),
      ['print-mostra-na-tela', 'aspas-marcam-o-texto', 'linha-na-margem'],
    );
    for (const a of shown) {
      // A chave que a view computava inline, byte a byte.
      const quizKeyUsedByView = a.sectionId ?? a.id;
      s = submitQuizAnswer(s, quizKeyUsedByView, a.answerIndex, a.answerIndex, 2_000);
    }
    // Escreveu em 2 chaves de SEÇÃO; o gate procura 3 chaves de ASSERTION.
    assert.deepEqual(Object.keys(s.quizBySection).sort(), [
      'a-linha-comeca-na-margem',
      'as-tres-partes-da-linha',
    ]);
    assert.deepEqual(
      pendingQuizzes(s, LESSON.assertions).map((a) => a.id),
      ['print-mostra-na-tela', 'aspas-marcam-o-texto', 'linha-na-margem'],
      'respondidas CERTO e ainda pendentes — a leitura do gate usa outra chave',
    );
    assert.equal(isNextSectionBlockedByQuiz(s, LESSON.assertions), true, '"Próximo" travado');
    assert.equal(
      lessonFinishBlock(CHALLENGES_PASSED, pendingQuizzes(s, LESSON.assertions).length),
      'quiz',
      '"Concluir aula" travado por quiz que o aluno JÁ acertou',
    );
  });

  it('CONSERTO: respondendo pela fonte canônica (visibleQuizFor), o gate abre', () => {
    let s = presentAllSections();
    for (const a of visibleAssertions(s)) {
      // Exatamente o que a view faz agora: chave, assertion corrente e
      // resposta certa saem do MESMO objeto.
      const visible = visibleQuizFor(s, a);
      s = submitQuizAnswer(
        s,
        visible.key,
        visible.assertion.answerIndex,
        visible.assertion.answerIndex,
        2_000,
      );
    }
    assert.deepEqual(pendingQuizzes(s, LESSON.assertions), [], 'nenhum quiz pendente');
    assert.equal(isNextSectionBlockedByQuiz(s, LESSON.assertions), false, '"Próximo" liberado');
    const block = lessonFinishBlock(
      CHALLENGES_PASSED,
      pendingQuizzes(s, LESSON.assertions).length,
    );
    assert.notEqual(block, 'quiz', 'o motivo do bloqueio NUNCA mais é o quiz');
    assert.equal(block, null, 'com os desafios passados, "Concluir aula" está liberado');
  });

  it('as chaves ESCRITAS são exatamente as de quizKeyFor', () => {
    let s = presentAllSections();
    for (const a of visibleAssertions(s)) {
      const visible = visibleQuizFor(s, a);
      s = submitQuizAnswer(s, visible.key, a.answerIndex, a.answerIndex, 2_000);
    }
    assert.deepEqual(
      Object.keys(s.quizBySection).sort(),
      LESSON.assertions.map((a) => quizKeyFor(a)).sort(),
    );
  });

  it('duas assertions da MESMA seção seguem INDEPENDENTES (a colisão não volta)', () => {
    let s = presentAllSections();
    const [first, second] = visibleAssertions(s);
    assert.equal(first.sectionId, second.sectionId, 'as duas primeiras dividem a seção');
    const visible = visibleQuizFor(s, first);
    s = submitQuizAnswer(s, visible.key, first.answerIndex, first.answerIndex, 2_000);
    assert.deepEqual(
      pendingQuizzes(s, LESSON.assertions).map((a) => a.id),
      [second.id, 'linha-na-margem'],
      'responder a 1ª não pode liberar a 2ª da mesma seção',
    );
  });
});

describe('ONDA1-MAESTRIA — guarda de FONTE: a LessonView não computa chave de quiz', () => {
  const file = resolve(HERE, '../src/views/LessonView/LessonView.tsx');
  const src = readFileSync(file, 'utf8');
  /** Fonte sem comentários (só o código que realmente roda) — mesma técnica
   *  de tests/lessonQuizVisual.test.ts. */
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('a fórmula ANTIGA da chave não existe no código da view', () => {
    assert.ok(
      !/sectionId\s*(\?\?|\|\|)/.test(code),
      'a view voltou a derivar a chave do quiz de sectionId — a chave é de quizKeyFor',
    );
  });

  it('a view não monta a chave composta na mão', () => {
    assert.ok(!code.includes('::'), "a view não pode concatenar '::' — quem forma a chave é quizKeyFor");
    assert.ok(
      !code.includes('QUIZ_KEY_SEPARATOR'),
      'nem com o separador exportado: a chave inteira vem pronta de visibleQuizFor/quizKeyFor',
    );
  });

  it('a view não lê o estado do quiz por chave própria (quizForSection some daqui)', () => {
    assert.ok(
      !code.includes('quizForSection('),
      'ler por quizForSection exige uma chave calculada na view — use visibleQuizFor(chat, assertion)',
    );
  });

  it('a view importa e USA visibleQuizFor (o ponto de entrada declarado)', () => {
    assert.match(
      src,
      /import\s*\{[\s\S]*?\bvisibleQuizFor\b[\s\S]*?\}\s*from\s*'\.\.\/\.\.\/lib\/trackLessonState'/,
      'visibleQuizFor precisa vir de trackLessonState',
    );
    assert.ok(code.includes('visibleQuizFor(chat,'), 'a view deve chamar visibleQuizFor com o estado do chat');
  });

  it('o card RENDERIZA e SUBMETE a partir do mesmo objeto de visibleQuizFor', () => {
    for (const prop of ['assertion={visible.assertion}', 'quiz={visible.quiz}']) {
      assert.ok(code.includes(prop), `o LessonQuizCard deve receber ${prop}`);
    }
    assert.ok(
      code.includes('visible.key'),
      'o submit precisa usar a chave canônica (visible.key), não uma chave local',
    );
    assert.ok(
      code.includes('visible.assertion.answerIndex'),
      'o índice correto submetido é o da GERAÇÃO corrente (a remediadora, quando existe)',
    );
  });
});
