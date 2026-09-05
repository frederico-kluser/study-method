/**
 * tests/quizOverlayCycle.test.ts — o CICLO COMPLETO do quiz, do jeito que a
 * tela o percorre: sobe SOBRE A TELA, o aluno responde, MINIMIZA para a
 * conversa, a explicação entra no histórico, o quiz novo é injetado, o card
 * volta a subir, e só o ACERTO fecha.
 *
 * O QUE ESTA SUÍTE PROVA (e por que ela não é redundante com as duas máquinas)
 * ──────────────────────────────────────────────────────────────────────────
 * `trackLessonState` e `quizOverlayState` já têm testes próprios, cada um do
 * seu lado. O que ninguém cobria é a COSTURA — a sequência exata que a
 * LessonView executa, com as duas máquinas juntas e com os dois helpers de
 * fronteira (`overlayContextFor`/`overlayStatusFor`/`quizCycleTag`) no meio.
 * É onde moram os defeitos de integração desta onda:
 *
 *   1. responder MINIMIZA (o pedido literal do dono) e o passo seguinte do
 *      ciclo NÃO ressuscita o card sozinho;
 *   2. a bolha da explicação (kind 'quiz-explanation') entra no histórico SEM
 *      deslocar a âncora dos quizzes seguintes — se ela contasse como
 *      apresentação de seção, o quiz da seção 2 passaria a ser desenhado na
 *      bolha errada e o gate olharia para o lugar errado;
 *   3. o quiz REMEDIADOR sobe SOBRE A TELA com a identidade certa (a chave
 *      continua a da afirmação AUTORAL, a `sectionId` continua a da autoral —
 *      a remediadora vem da IA e não tem âncora de seção);
 *   4. a DEGRADAÇÃO documentada: sem explicação (canal fora do ar), o ciclo
 *      SEGUE — `injectRemediationQuiz` aceita o estágio 'explicando' — e o
 *      aluno não fica preso;
 *   5. o acerto FECHA o overlay e ABRE o gate ("Próximo" e "Concluir aula");
 *   6. o invariante sagrado do card continua de pé na geração remediadora: a
 *      resposta não vaza antes do clique.
 *
 * A aula é a REAL do repositório (`a-primeira-linha`, 3 afirmações em 2
 * seções) — o mesmo cenário do precedente `tests/lessonQuizKeyCoherence`.
 * Tudo aqui é `node:test` puro: nenhuma das duas máquinas toca React.
 */
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  applyTutorReply,
  createTrackLessonState,
  injectRemediationQuiz,
  isNextSectionBlockedByQuiz,
  isQuizMastered,
  lessonFinishBlock,
  optionVisualState,
  pendingQuizzes,
  quizKeyFor,
  quizzesByMessageIndex,
  registerQuizExplanation,
  submitQuizAnswer,
  visibleQuizFor,
  type TrackLessonUiState,
} from '../src/lib/trackLessonState';
import {
  __resetQuizOverlayForTests,
  applyQuizOverlayStep,
  isQuizOverlayOpenFor,
  minimizeQuizOverlay,
  peekQuizOverlay,
  quizOverlayIntent,
  reopenQuizOverlay,
} from '../src/lib/quizOverlayState';
import {
  overlayContextFor,
  overlayStatusFor,
  quizCycleTag,
} from '../src/components/quiz/quizOverlayBridge';
import {
  __resetQuizOverlayContentForTests,
  peekQuizOverlayContent,
  publishQuizOverlayContent,
  subscribeQuizOverlayContent,
  type QuizOverlayContent,
} from '../src/components/quiz/quizOverlayContent';
import type { TrackAssertionDto, TrackVerdict, TutorReply } from '../shared/ipc-contract';

const HERE = dirname(fileURLToPath(import.meta.url));

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
const CHALLENGES_PASSED: readonly { lastVerdict: TrackVerdict | null }[] = [{ lastVerdict: 'passed' }];

/** O tutor apresenta TODA a teoria (uma bolha por seção, como o 'next'). */
function presentAllSections(): TrackLessonUiState {
  let s = createTrackLessonState();
  for (const section of LESSON.theory) {
    const reply: TutorReply = { ok: true, message: section.markdown, sectionId: section.id, done: false };
    s = applyTutorReply(s, reply, 1_000);
  }
  return s;
}

/** As assertions que a view renderiza, na ordem das bolhas, com a âncora. */
function renderableQuizzes(state: TrackLessonUiState): { original: TrackAssertionDto; anchorIndex: number }[] {
  const byIndex = quizzesByMessageIndex(state, LESSON.assertions);
  return [...byIndex.keys()]
    .sort((a, b) => a - b)
    .flatMap((idx) => (byIndex.get(idx) ?? []).map((original) => ({ original, anchorIndex: idx })));
}

/** O quiz remediador que a IA devolveria (shape de `TrackAssertionDto`). */
function remedialFor(original: TrackAssertionDto): TrackAssertionDto {
  return {
    // A id é REESCRITA por `injectRemediationQuiz` — o que a IA manda aqui é
    // deliberadamente diferente, para provar que ela não escolhe a identidade.
    id: 'id-que-a-ia-inventou',
    statement: original.statement,
    question: `De outro jeito: ${original.question}`,
    options: ['alfa', 'beta', 'gama', 'delta'],
    answerIndex: 2,
    feedback: 'o mesmo trecho, dito de outro jeito',
  };
}

/** Índice do PRIMEIRO índice errado (nunca o certo) — o erro do aluno. */
function wrongIndexFor(assertion: TrackAssertionDto): number {
  return assertion.answerIndex === 0 ? 1 : 0;
}

beforeEach(() => {
  __resetQuizOverlayForTests();
  __resetQuizOverlayContentForTests();
});

describe('o quiz SOBE sobre a tela quando a seção é apresentada', () => {
  it('o passo de partida é aguardar-resposta e a intenção é sobre-a-tela', () => {
    const state = presentAllSections();
    const [first] = renderableQuizzes(state);
    const visible = visibleQuizFor(state, first.original);
    assert.equal(visible.step.kind, 'aguardar-resposta');
    assert.equal(quizOverlayIntent(visible.step), 'sobre-a-tela');
  });

  it('applyQuizOverlayStep abre o overlay com a identidade da afirmação AUTORAL', () => {
    const state = presentAllSections();
    const [first] = renderableQuizzes(state);
    const visible = visibleQuizFor(state, first.original);
    const ctx = overlayContextFor(first.original, visible, first.anchorIndex);
    applyQuizOverlayStep(ctx, visible.step);

    const snapshot = peekQuizOverlay();
    assert.equal(snapshot.phase, 'sobre-a-tela');
    assert.equal(snapshot.quizKey, quizKeyFor(first.original));
    assert.equal(snapshot.assertionId, first.original.id);
    assert.equal(snapshot.generation, 0);
    assert.equal(snapshot.sectionId, first.original.sectionId);
    assert.equal(snapshot.anchorIndex, first.anchorIndex);
    assert.equal(isQuizOverlayOpenFor(quizKeyFor(first.original)), true);
  });

  it('uma assertion SEM sectionId vira sectionId null (o contrato do store), nunca undefined', () => {
    const semSecao: TrackAssertionDto = { ...LESSON.assertions[0], sectionId: undefined };
    const state = presentAllSections();
    const visible = visibleQuizFor(state, semSecao);
    const ctx = overlayContextFor(semSecao, visible, 0);
    assert.equal(ctx.sectionId, null);
  });
});

describe('responder MINIMIZA para a conversa (o pedido literal do dono)', () => {
  it('errar minimiza o card e o ciclo pede a explicação', () => {
    let state = presentAllSections();
    const [first] = renderableQuizzes(state);
    let visible = visibleQuizFor(state, first.original);
    applyQuizOverlayStep(overlayContextFor(first.original, visible, first.anchorIndex), visible.step);

    const errado = wrongIndexFor(visible.assertion);
    state = submitQuizAnswer(state, visible.key, errado, visible.assertion.answerIndex, 2_000);
    minimizeQuizOverlay(visible.key);

    assert.equal(peekQuizOverlay().phase, 'minimizado-no-chat');
    visible = visibleQuizFor(state, first.original);
    assert.deepEqual(visible.step, { kind: 'explicar-erro', generation: 0, selected: errado });
    // E a fase que o passo PEDE é a mesma em que o card já está: aplicar o
    // passo não ressuscita o card que o aluno acabou de ver descer.
    applyQuizOverlayStep(overlayContextFor(first.original, visible, first.anchorIndex), visible.step);
    assert.equal(peekQuizOverlay().phase, 'minimizado-no-chat');
  });

  it('acertar leva o ciclo a dominado e a intenção do passo é FECHAR', () => {
    let state = presentAllSections();
    const [first] = renderableQuizzes(state);
    let visible = visibleQuizFor(state, first.original);
    applyQuizOverlayStep(overlayContextFor(first.original, visible, first.anchorIndex), visible.step);

    state = submitQuizAnswer(
      state,
      visible.key,
      visible.assertion.answerIndex,
      visible.assertion.answerIndex,
      2_000,
    );
    minimizeQuizOverlay(visible.key);
    visible = visibleQuizFor(state, first.original);
    assert.equal(visible.step.kind, 'dominado');
    assert.equal(quizOverlayIntent(visible.step), 'fechado');

    applyQuizOverlayStep(overlayContextFor(first.original, visible, first.anchorIndex), visible.step);
    assert.equal(peekQuizOverlay().phase, 'fechado');
    assert.equal(isQuizOverlayOpenFor(visible.key), false);
  });

  it('minimizado, o card volta SOBRE A TELA por reopen (o botão da conversa)', () => {
    const state = presentAllSections();
    const [first] = renderableQuizzes(state);
    const visible = visibleQuizFor(state, first.original);
    applyQuizOverlayStep(overlayContextFor(first.original, visible, first.anchorIndex), visible.step);
    minimizeQuizOverlay(visible.key);
    reopenQuizOverlay(visible.key);
    assert.equal(peekQuizOverlay().phase, 'sobre-a-tela');
  });
});

describe('o ciclo de remediação: explicação na conversa, quiz novo sobre a tela', () => {
  it('a volta completa erro → explicação → quiz novo → acerto → fechado', () => {
    let state = presentAllSections();
    const [first] = renderableQuizzes(state);
    const key = quizKeyFor(first.original);
    let visible = visibleQuizFor(state, first.original);

    // 1. sobe sobre a tela
    applyQuizOverlayStep(overlayContextFor(first.original, visible, first.anchorIndex), visible.step);
    assert.equal(peekQuizOverlay().phase, 'sobre-a-tela');

    // 2. o aluno erra → minimiza
    const errado = wrongIndexFor(visible.assertion);
    state = submitQuizAnswer(state, key, errado, visible.assertion.answerIndex, 2_000);
    minimizeQuizOverlay(key);
    visible = visibleQuizFor(state, first.original);
    assert.equal(overlayStatusFor(visible.step, false), 'explicando');

    // 3. a explicação vira BOLHA da conversa
    const historyBefore = state.history.length;
    state = registerQuizExplanation(
      state,
      key,
      {
        question: visible.assertion.question,
        chosenOption: visible.assertion.options[errado],
        explanation: 'a alternativa marcada descreve outra coisa',
      },
      { title: 'Onde essa alternativa se separa', chosen: 'Alternativa marcada' },
      3_000,
    );
    assert.equal(state.history.length, historyBefore + 1);
    const bolha = state.history[state.history.length - 1];
    assert.equal(bolha.kind, 'quiz-explanation');
    assert.match(bolha.content, /Alternativa marcada/);

    visible = visibleQuizFor(state, first.original);
    assert.equal(visible.step.kind, 'gerar-novo-quiz');
    assert.equal(overlayStatusFor(visible.step, false), 'gerando');
    // o card segue MINIMIZADO enquanto o ciclo corre na conversa
    applyQuizOverlayStep(overlayContextFor(first.original, visible, first.anchorIndex), visible.step);
    assert.equal(peekQuizOverlay().phase, 'minimizado-no-chat');

    // 4. o quiz remediador entra e SOBE de volta
    state = injectRemediationQuiz(state, key, remedialFor(first.original));
    visible = visibleQuizFor(state, first.original);
    assert.equal(visible.generation, 1);
    assert.equal(visible.step.kind, 'aguardar-resposta');
    assert.equal(visible.assertion.id, `${key}#g1`, 'a id é DERIVADA, não a que a IA inventou');
    assert.equal(visible.key, key, 'a chave continua a da afirmação AUTORAL');

    const ctx = overlayContextFor(first.original, visible, first.anchorIndex);
    assert.equal(ctx.sectionId, first.original.sectionId, 'a seção vem da autoral, não da remediadora');
    applyQuizOverlayStep(ctx, visible.step);
    assert.equal(peekQuizOverlay().phase, 'sobre-a-tela');
    assert.equal(peekQuizOverlay().generation, 1);

    // 5. o aluno acerta o remediador → dominado → fechado
    state = submitQuizAnswer(state, key, visible.assertion.answerIndex, visible.assertion.answerIndex, 4_000);
    minimizeQuizOverlay(key);
    visible = visibleQuizFor(state, first.original);
    assert.equal(visible.step.kind, 'dominado');
    applyQuizOverlayStep(overlayContextFor(first.original, visible, first.anchorIndex), visible.step);
    assert.equal(peekQuizOverlay().phase, 'fechado');
    assert.equal(isQuizMastered(state, key), true);
  });

  it('a bolha da explicação NÃO desloca a âncora dos quizzes seguintes', () => {
    let state = presentAllSections();
    const antes = renderableQuizzes(state).map((q) => ({ id: q.original.id, anchorIndex: q.anchorIndex }));
    const [first] = renderableQuizzes(state);
    const key = quizKeyFor(first.original);
    const visible = visibleQuizFor(state, first.original);
    const errado = wrongIndexFor(visible.assertion);
    state = submitQuizAnswer(state, key, errado, visible.assertion.answerIndex, 2_000);
    state = registerQuizExplanation(
      state,
      key,
      { question: visible.assertion.question, chosenOption: visible.assertion.options[errado], explanation: 'x' },
      {},
      3_000,
    );
    const depois = renderableQuizzes(state).map((q) => ({ id: q.original.id, anchorIndex: q.anchorIndex }));
    assert.deepEqual(depois, antes, 'a explicação entrou na conversa sem mover nenhuma âncora');
  });

  it('a resposta do quiz REMEDIADOR não vaza antes do clique', () => {
    let state = presentAllSections();
    const [first] = renderableQuizzes(state);
    const key = quizKeyFor(first.original);
    const v0 = visibleQuizFor(state, first.original);
    const errado = wrongIndexFor(v0.assertion);
    state = submitQuizAnswer(state, key, errado, v0.assertion.answerIndex, 2_000);
    state = registerQuizExplanation(
      state,
      key,
      { question: v0.assertion.question, chosenOption: v0.assertion.options[errado], explanation: 'x' },
      {},
      3_000,
    );
    state = injectRemediationQuiz(state, key, remedialFor(first.original));
    const v1 = visibleQuizFor(state, first.original);
    for (let i = 0; i < v1.assertion.options.length; i++) {
      const visual = optionVisualState(i, v1.assertion, v1.quiz);
      assert.equal(visual.color, 'inherit', `opção ${i} não pode nascer colorida`);
      assert.equal(visual.icon, null, `opção ${i} não pode nascer com ícone`);
      assert.equal(visual.disabled, false, `opção ${i} tem de ser clicável`);
    }
  });
});

describe('DEGRADAÇÃO fail-closed: sem explicação, o aluno NÃO trava', () => {
  it('injectRemediationQuiz aceita o estágio explicando (o canal da explicação caiu)', () => {
    let state = presentAllSections();
    const [first] = renderableQuizzes(state);
    const key = quizKeyFor(first.original);
    const visible = visibleQuizFor(state, first.original);
    state = submitQuizAnswer(state, key, wrongIndexFor(visible.assertion), visible.assertion.answerIndex, 2_000);

    // NENHUM registerQuizExplanation: `track.quizExplain` devolveu {ok:false}.
    assert.equal(visibleQuizFor(state, first.original).step.kind, 'explicar-erro');
    state = injectRemediationQuiz(state, key, remedialFor(first.original));

    const depois = visibleQuizFor(state, first.original);
    assert.equal(depois.generation, 1, 'a geração avançou mesmo sem explicação');
    assert.equal(depois.step.kind, 'aguardar-resposta', 'o aluno pode responder de novo');
    assert.equal(depois.quiz?.explanation ?? null, null, 'nada de explicação inventada');
  });

  it('overlayStatusFor separa o ciclo (explicando/gerando) da queda do canal', () => {
    const explicar = { kind: 'explicar-erro', generation: 0, selected: 1 } as const;
    const gerar = { kind: 'gerar-novo-quiz', generation: 0 } as const;
    const esperar = { kind: 'aguardar-resposta', generation: 0 } as const;
    const dominado = { kind: 'dominado', generation: 1 } as const;
    assert.equal(overlayStatusFor(explicar, false), 'explicando');
    assert.equal(overlayStatusFor(gerar, false), 'gerando');
    assert.equal(overlayStatusFor(explicar, true), 'indisponivel');
    assert.equal(overlayStatusFor(gerar, true), 'indisponivel');
    // Uma queda ANTIGA não pode contaminar um card que já voltou a esperar
    // resposta, nem um já dominado.
    assert.equal(overlayStatusFor(esperar, true), 'aguardando');
    assert.equal(overlayStatusFor(dominado, true), 'dominado');
  });
});

describe('a etiqueta da volta do ciclo (quizCycleTag)', () => {
  it('muda a cada geração — é o que aposenta o aviso de canal sozinho', () => {
    assert.equal(quizCycleTag('secao::afirmacao', 0), 'secao::afirmacao#0');
    assert.notEqual(quizCycleTag('k', 0), quizCycleTag('k', 1));
    assert.notEqual(quizCycleTag('a', 0), quizCycleTag('b', 0));
  });
});

describe('o gate só abre com MAESTRIA (o pedido do dono)', () => {
  it('errar mantém "Próximo" e "Concluir aula" travados; acertar libera', () => {
    let state = presentAllSections();
    const cards = renderableQuizzes(state);
    // Erra TODOS: nada libera.
    for (const c of cards) {
      const v = visibleQuizFor(state, c.original);
      state = submitQuizAnswer(state, v.key, wrongIndexFor(v.assertion), v.assertion.answerIndex, 2_000);
    }
    assert.equal(isNextSectionBlockedByQuiz(state, LESSON.assertions), true);
    assert.equal(
      lessonFinishBlock(CHALLENGES_PASSED, pendingQuizzes(state, LESSON.assertions).length),
      'quiz',
    );

    // Agora o ciclo entrega o remediador de cada um e o aluno acerta.
    for (const c of cards) {
      const key = quizKeyFor(c.original);
      state = registerQuizExplanation(
        state,
        key,
        { question: 'q', chosenOption: 'o', explanation: 'e' },
        {},
        3_000,
      );
      state = injectRemediationQuiz(state, key, remedialFor(c.original));
      const v = visibleQuizFor(state, c.original);
      state = submitQuizAnswer(state, key, v.assertion.answerIndex, v.assertion.answerIndex, 4_000);
    }
    assert.deepEqual(pendingQuizzes(state, LESSON.assertions), []);
    assert.equal(isNextSectionBlockedByQuiz(state, LESSON.assertions), false);
    assert.equal(lessonFinishBlock(CHALLENGES_PASSED, 0), null);
  });
});

describe('o registro de CONTEÚDO do overlay (a ponte view → shell)', () => {
  const base: QuizOverlayContent = {
    quizKey: 'secao::afirmacao',
    assertion: LESSON.assertions[0],
    quiz: undefined,
    generation: 0,
    status: 'aguardando',
    notice: null,
    onSelect: () => {},
    onMinimize: () => {},
    onRetry: null,
  };

  it('parte vazio e publica', () => {
    assert.equal(peekQuizOverlayContent(), null);
    assert.equal(publishQuizOverlayContent(base), true);
    assert.equal(peekQuizOverlayContent(), base);
  });

  it('SNAPSHOT ESTÁVEL: republicar o mesmo desenho não troca a referência nem notifica', () => {
    publishQuizOverlayContent(base);
    let notified = 0;
    const off = subscribeQuizOverlayContent(() => {
      notified += 1;
    });
    const gemeo: QuizOverlayContent = { ...base };
    assert.equal(publishQuizOverlayContent(gemeo), false, 'nada mudou → no-op');
    assert.equal(peekQuizOverlayContent(), base, 'a referência ANTIGA é preservada');
    assert.equal(notified, 0, 'nenhum listener acordado à toa');

    assert.equal(publishQuizOverlayContent({ ...base, status: 'gerando' }), true);
    assert.equal(notified, 1);
    off();
    publishQuizOverlayContent(null);
    assert.equal(notified, 1, 'o unsubscribe funciona');
    assert.equal(peekQuizOverlayContent(), null);
  });
});
