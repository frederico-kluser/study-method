/**
 * tests/quizRemediationStubs.test.ts — os STUBS E2E do ciclo de remediação
 * (`buildQuizStubHandlers` em electron/main/services/e2eStubs.ts).
 *
 * POR QUE ELES EXISTEM: os quatro canais de quiz (`track:quiz-attempt`,
 * `-explain`, `-remedial`, `-history`) chamam a LLM em produção. Sem fixture
 * determinística no harness, a cobertura e2e do ciclo — errar → explicação →
 * quiz novo → acertar → o desafio abre — é impossível de escrever. Ela era
 * ZERO antes desta onda.
 *
 * O QUE ESTA SUÍTE TRAVA:
 *   1. os quatro canais existem no mapa do harness;
 *   2. attempt → history → mastery funcionam em memória, com `attemptNo`
 *      DERIVADO por seção e `createdAt` determinístico (nada de Date.now());
 *   3. o stub reusa o SERVIÇO REAL com um `chat` fake — então o quiz fixture
 *      passa pela MESMA validação de shape de produção (o teste confere isso
 *      chamando `parseRemedialQuiz` sobre o que o canal devolveu) e a id
 *      remedial nunca é a de origem;
 *   4. a explicação fixture obedece às mesmas proibições do prompt real
 *      (sem elogio, sem percentual de domínio, sem URL, o erro nomeado na
 *      alternativa e não no aluno);
 *   5. `E2E_QUIZ_AI=off` derruba a IA do ciclo e os dois canais respondem
 *      QUIZ_UNAVAILABLE — é assim que o e2e cobre a tela de falha FECHADA;
 *   6. determinismo: a mesma entrada produz o MESMO quiz.
 *
 * Zero rede, zero LLM, zero Electron: os handlers são chamados direto.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  QUIZ_ERROR_CODES,
  TRACK_CHANNELS,
  type QuizAttemptReply,
  type QuizExplainReply,
  type QuizHistoryReply,
  type QuizRemedialReply,
  type QuizRemedialRequest,
  type TrackAssertionDto,
} from '../shared/ipc-contract';
import { buildQuizStubHandlers } from '../electron/main/services/e2eStubs';
import { parseRemedialQuiz } from '../electron/main/services/quizRemediation';

const ASSERTION: TrackAssertionDto = {
  id: 'a-print-mostra',
  statement: 'print() mostra o valor na tela.',
  question: 'O que print("oi") faz?',
  options: ['Escreve oi na tela', 'Guarda oi', 'Apaga a tela', 'Devolve oi sem mostrar'],
  answerIndex: 0,
  feedback: 'print() escreve na saída padrão.',
  sectionId: 'sec-saida',
};

const CHAVE = 'sec-saida::a-print-mostra';

function remedialReq(over: Partial<QuizRemedialRequest> = {}): QuizRemedialRequest {
  return {
    trackSlug: 'nodejs-do-zero',
    lessonId: 'aula-1',
    sectionKey: CHAVE,
    originAssertionId: ASSERTION.id,
    generation: 1,
    assertion: ASSERTION,
    explanation: 'A alternativa escolhida guarda o valor; a seção mostra o contrário.',
    askedQuestions: [ASSERTION.question],
    ...over,
  };
}

let savedQuizAi: string | undefined;

before(() => {
  savedQuizAi = process.env.E2E_QUIZ_AI;
  delete process.env.E2E_QUIZ_AI;
});

after(() => {
  if (savedQuizAi === undefined) delete process.env.E2E_QUIZ_AI;
  else process.env.E2E_QUIZ_AI = savedQuizAi;
});

describe('e2eStubs: os quatro canais do quiz existem', () => {
  it('attempt, explain, remedial e history estão no mapa do harness', () => {
    const map = buildQuizStubHandlers();
    for (const ch of [
      TRACK_CHANNELS.QUIZ_ATTEMPT,
      TRACK_CHANNELS.QUIZ_EXPLAIN,
      TRACK_CHANNELS.QUIZ_REMEDIAL,
      TRACK_CHANNELS.QUIZ_HISTORY,
    ]) {
      assert.ok(map.has(ch), `handler de quiz ausente: ${ch}`);
    }
    assert.equal(map.size, 4, 'o mapa do quiz não pode registrar nada além dos 4 canais');
  });
});

describe('e2eStubs: attempt → history → maestria (em memória, determinístico)', () => {
  it('grava as tentativas, DERIVA o attemptNo por seção e o gate só libera no acerto', async () => {
    const map = buildQuizStubHandlers();
    const attempt = map.get(TRACK_CHANNELS.QUIZ_ATTEMPT)!;
    const history = map.get(TRACK_CHANNELS.QUIZ_HISTORY)!;
    const aula = { trackSlug: 'nodejs-do-zero', lessonId: 'aula-maestria' };

    const errada = (await attempt(undefined, {
      ...aula,
      sectionKey: CHAVE,
      assertionId: ASSERTION.id,
      selectedIndex: 1,
      correct: false,
    })) as QuizAttemptReply;
    assert.equal(errada.ok, true);
    if (!errada.ok) return;
    assert.equal(errada.attempt.attemptNo, 1);
    assert.equal(errada.attempt.quizOrigin, 'authored');
    assert.match(errada.attempt.createdAt, /^2026-01-01T00:00:\d\d\.000Z$/);
    assert.equal(errada.mastery[0].mastered, false, 'errar NÃO domina a seção');

    const certa = (await attempt(undefined, {
      ...aula,
      sectionKey: CHAVE,
      assertionId: `${CHAVE}#g1`,
      selectedIndex: 0,
      correct: true,
      quizOrigin: 'remedial',
    })) as QuizAttemptReply;
    assert.equal(certa.ok, true);
    if (!certa.ok) return;
    assert.equal(certa.attempt.attemptNo, 2, 'o ordinal é derivado (COUNT+1 da seção)');
    assert.equal(certa.mastery[0].mastered, true);
    assert.equal(certa.mastery[0].attemptCount, 2);
    assert.equal(certa.mastery[0].correctCount, 1);

    const hist = (await history(undefined, aula)) as QuizHistoryReply;
    assert.equal(hist.ok, true);
    if (!hist.ok) return;
    assert.equal(hist.attempts.length, 2);
    assert.equal(hist.mastery[0].mastered, true);
    assert.ok(hist.mastery[0].firstCorrectAt);
  });

  it('pedido sem trilha/aula → NOT_FOUND nos dois canais (nada de resposta vazia mentirosa)', async () => {
    const map = buildQuizStubHandlers();
    const semNada = (await map.get(TRACK_CHANNELS.QUIZ_ATTEMPT)!(undefined, {})) as QuizAttemptReply;
    assert.equal(semNada.ok === false && semNada.code, QUIZ_ERROR_CODES.NOT_FOUND);
    const hist = (await map.get(TRACK_CHANNELS.QUIZ_HISTORY)!(undefined, {})) as QuizHistoryReply;
    assert.equal(hist.ok === false && hist.code, QUIZ_ERROR_CODES.NOT_FOUND);
  });
});

describe('e2eStubs: a explicação fixture', () => {
  it('nomeia a alternativa escolhida, pergunta o que ele esperava e não elogia nem cita fonte', async () => {
    const map = buildQuizStubHandlers();
    const out = (await map.get(TRACK_CHANNELS.QUIZ_EXPLAIN)!(undefined, {
      trackSlug: 'nodejs-do-zero',
      lessonId: 'aula-1',
      sectionKey: CHAVE,
      assertion: ASSERTION,
      selectedIndex: 1,
    })) as QuizExplainReply;
    assert.equal(out.ok, true);
    if (!out.ok) return;
    assert.ok(out.explanation.includes('Guarda oi'));
    assert.ok(out.explanation.includes('O que você esperava'));
    assert.doesNotMatch(out.explanation, /parab[ée]ns|muito bem|continue assim/i);
    assert.doesNotMatch(out.explanation, /\d+ ?% de dom[ií]nio|você já domina/i);
    assert.doesNotMatch(out.explanation, /https?:\/\//);
  });

  it('pedido torto continua fail-closed no harness: escolher a CORRETA → NOT_FOUND', async () => {
    const map = buildQuizStubHandlers();
    const out = (await map.get(TRACK_CHANNELS.QUIZ_EXPLAIN)!(undefined, {
      trackSlug: 'nodejs-do-zero',
      lessonId: 'aula-1',
      sectionKey: CHAVE,
      assertion: ASSERTION,
      selectedIndex: ASSERTION.answerIndex,
    })) as QuizExplainReply;
    assert.equal(out.ok === false && out.code, QUIZ_ERROR_CODES.NOT_FOUND);
  });
});

describe('e2eStubs: o quiz remedial fixture', () => {
  it('passa pela MESMA validação de produção e respeita a convenção de id', async () => {
    const map = buildQuizStubHandlers();
    const req = remedialReq();
    const out = (await map.get(TRACK_CHANNELS.QUIZ_REMEDIAL)!(undefined, req)) as QuizRemedialReply;
    assert.equal(out.ok, true);
    if (!out.ok) return;

    assert.equal(out.quiz.id, `${CHAVE}#g1`);
    assert.notEqual(out.quiz.id, req.originAssertionId);
    assert.equal(out.quiz.originAssertionId, ASSERTION.id);
    assert.equal(out.quiz.generation, 1);
    assert.equal(out.quiz.options.length, 4);
    assert.equal(out.quiz.optionRationales?.length, 4);
    assert.ok(out.quiz.answerIndex >= 0 && out.quiz.answerIndex <= 3);

    // A fixture é submetida ao MESMO gate de shape do caminho de produção.
    const revalidado = parseRemedialQuiz(
      {
        statement: out.quiz.statement,
        question: out.quiz.question,
        options: out.quiz.options,
        answerIndex: out.quiz.answerIndex,
        feedback: out.quiz.feedback,
        optionRationales: out.quiz.optionRationales,
      },
      req,
    );
    assert.ok(revalidado, 'o quiz fixture teria de passar na validação de produção');
  });

  it('não repete pergunta já vista e é DETERMINÍSTICO para a mesma entrada', async () => {
    const map = buildQuizStubHandlers();
    const req = remedialReq({ askedQuestions: [ASSERTION.question, 'E outra pergunta?'] });
    const a = (await map.get(TRACK_CHANNELS.QUIZ_REMEDIAL)!(undefined, req)) as QuizRemedialReply;
    const b = (await map.get(TRACK_CHANNELS.QUIZ_REMEDIAL)!(undefined, req)) as QuizRemedialReply;
    assert.equal(a.ok && b.ok, true);
    if (!a.ok || !b.ok) return;
    assert.deepEqual(a.quiz, b.quiz, 'mesma entrada, mesmo quiz — fixture não pode variar');
    for (const vista of req.askedQuestions ?? []) {
      assert.notEqual(a.quiz.question.toLowerCase(), vista.toLowerCase());
    }
  });

  it('a remediação (explicação + quiz) entra no HISTÓRICO da aula', async () => {
    const map = buildQuizStubHandlers();
    const req = remedialReq({ lessonId: 'aula-historico' });
    const gerado = (await map.get(TRACK_CHANNELS.QUIZ_REMEDIAL)!(undefined, req)) as QuizRemedialReply;
    assert.equal(gerado.ok, true);
    const hist = (await map.get(TRACK_CHANNELS.QUIZ_HISTORY)!(undefined, {
      trackSlug: req.trackSlug,
      lessonId: req.lessonId,
    })) as QuizHistoryReply;
    assert.equal(hist.ok, true);
    if (!hist.ok || !gerado.ok) return;
    assert.equal(hist.remediations.length, 1);
    assert.equal(hist.remediations[0].explanation, req.explanation);
    assert.equal(hist.remediations[0].quiz?.id, gerado.quiz.id);
    assert.equal(hist.remediations[0].generation, 1);
  });
});

describe('e2eStubs: E2E_QUIZ_AI=off derruba a IA do ciclo (a tela de falha FECHADA)', () => {
  it('explain e remedial devolvem QUIZ_UNAVAILABLE — nunca conteúdo inventado', async () => {
    process.env.E2E_QUIZ_AI = 'off';
    try {
      const map = buildQuizStubHandlers();
      const exp = (await map.get(TRACK_CHANNELS.QUIZ_EXPLAIN)!(undefined, {
        trackSlug: 'nodejs-do-zero',
        lessonId: 'aula-1',
        sectionKey: CHAVE,
        assertion: ASSERTION,
        selectedIndex: 1,
      })) as QuizExplainReply;
      assert.equal(exp.ok === false && exp.code, QUIZ_ERROR_CODES.UNAVAILABLE);

      const rem = (await map.get(TRACK_CHANNELS.QUIZ_REMEDIAL)!(
        undefined,
        remedialReq(),
      )) as QuizRemedialReply;
      assert.equal(rem.ok === false && rem.code, QUIZ_ERROR_CODES.UNAVAILABLE);
    } finally {
      delete process.env.E2E_QUIZ_AI;
    }
  });
});
