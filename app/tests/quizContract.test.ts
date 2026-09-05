/**
 * tests/quizContract.test.ts — o CONTRATO do QUIZ ADAPTATIVO
 * (onda1-contrato-quiz): canais, derivação no preload, shape dos DTOs e o
 * espelho zod do campo aditivo no draft da engine.
 *
 * Este arquivo é a trava do que os outros agentes vão implementar CONTRA:
 *   1. os quatro canais existem, seguem `track:kebab-case` e são de REQUEST
 *      (invoke) — nenhum deles é evento;
 *   2. `createExposedApi` DERIVA `quizAttempt`/`quizExplain`/`quizRemedial`/
 *      `quizHistory` (o preload monta a API a partir dos canais do contrato —
 *      um nome de canal torto viraria um método torto em `window.api.track`);
 *   3. as respostas são FAIL-CLOSED: a união discriminada por `ok` obriga
 *      `code`+`message` no ramo de falha — não existe forma de devolver
 *      explicação/quiz inventado quando a LLM está fora;
 *   4. `AssertionDraftSchema` aceita `optionRationales` ausente (vira `[]`,
 *      INV-05) e EXATAMENTE 4 quando presente — 1..3 é meia-declaração e
 *      REPROVA o draft.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  QUIZ_ERROR_CODES,
  TRACK_CHANNELS,
  type QuizAttemptDto,
  type QuizAttemptReply,
  type QuizExplainReply,
  type QuizExplainRequest,
  type QuizHistoryReply,
  type QuizRemedialReply,
  type QuizRemedialRequest,
  type QuizRemediationDto,
  type QuizSectionMasteryDto,
  type RemedialQuizDto,
  type TrackAssertionDto,
} from '../shared/ipc-contract';
import { createExposedApi, type IpcBridgeLike } from '../electron/preload/api-schema';
import { AssertionDraftSchema } from '../electron/main/engine/schemas/artifacts';

/** Fake do transporte: registra o que foi invocado/subscrito. */
function makeFakeIpc(): IpcBridgeLike & { invoked: string[]; subscribed: string[] } {
  const invoked: string[] = [];
  const subscribed: string[] = [];
  return {
    invoked,
    subscribed,
    invoke: async (channel: string) => {
      invoked.push(channel);
      return { ok: true };
    },
    on: (channel: string) => {
      subscribed.push(channel);
      return () => {};
    },
  };
}

const CANAIS_DO_QUIZ = [
  TRACK_CHANNELS.QUIZ_ATTEMPT,
  TRACK_CHANNELS.QUIZ_EXPLAIN,
  TRACK_CHANNELS.QUIZ_REMEDIAL,
  TRACK_CHANNELS.QUIZ_HISTORY,
] as const;

describe('contrato do quiz — canais', () => {
  it('1. os quatro canais existem com o nome exato do contrato', () => {
    assert.equal(TRACK_CHANNELS.QUIZ_ATTEMPT, 'track:quiz-attempt');
    assert.equal(TRACK_CHANNELS.QUIZ_EXPLAIN, 'track:quiz-explain');
    assert.equal(TRACK_CHANNELS.QUIZ_REMEDIAL, 'track:quiz-remedial');
    assert.equal(TRACK_CHANNELS.QUIZ_HISTORY, 'track:quiz-history');
  });

  it('1b. seguem `track:kebab-case` e não colidem com nenhum canal do grupo', () => {
    const todos = Object.values(TRACK_CHANNELS);
    assert.equal(new Set(todos).size, todos.length, 'nenhum canal duplicado em TRACK_CHANNELS');
    for (const canal of CANAIS_DO_QUIZ) {
      assert.match(canal, /^track:[a-z0-9]+(-[a-z0-9]+)*$/, `canal fora do padrão: ${canal}`);
    }
  });
});

describe('contrato do quiz — derivação no preload', () => {
  it('2. createExposedApi expõe quizAttempt/quizExplain/quizRemedial/quizHistory como INVOKE', async () => {
    const ipc = makeFakeIpc();
    const api = createExposedApi(ipc);
    const track = api.track as unknown as Record<string, unknown>;

    for (const nome of ['quizAttempt', 'quizExplain', 'quizRemedial', 'quizHistory']) {
      assert.equal(typeof track[nome], 'function', `window.api.track.${nome} deveria existir`);
      // REQUEST, nunca evento: não existe o par `on*` para estes canais.
      const evento = `on${nome[0].toUpperCase()}${nome.slice(1)}`;
      assert.equal(track[evento], undefined, `${evento} não deveria existir (o canal é de request)`);
    }

    await api.track.quizAttempt({
      trackSlug: 'python',
      lessonId: 'imprimir-na-tela',
      sectionKey: 'o-que-e-print',
      assertionId: 'print-mostra-na-tela',
      selectedIndex: 1,
      correct: false,
    });
    await api.track.quizExplain({
      trackSlug: 'python',
      lessonId: 'imprimir-na-tela',
      sectionKey: 'o-que-e-print',
      assertion: assertionDto(),
      selectedIndex: 1,
    });
    await api.track.quizRemedial({
      trackSlug: 'python',
      lessonId: 'imprimir-na-tela',
      sectionKey: 'o-que-e-print',
      originAssertionId: 'print-mostra-na-tela',
      generation: 1,
      assertion: assertionDto(),
    });
    await api.track.quizHistory({ trackSlug: 'python', lessonId: 'imprimir-na-tela' });

    for (const canal of CANAIS_DO_QUIZ) {
      assert.ok(ipc.invoked.includes(canal), `${canal} deveria chegar ao transporte por invoke`);
    }
    assert.deepEqual(ipc.subscribed, [], 'nenhum canal do quiz é de evento');
  });
});

function assertionDto(over: Partial<TrackAssertionDto> = {}): TrackAssertionDto {
  return {
    id: 'print-mostra-na-tela',
    statement: 'print mostra na tela o que você passa entre parênteses.',
    question: 'O que aparece com print("oi")?',
    options: ['oi', 'print', 'nada', 'um erro'],
    answerIndex: 0,
    feedback: 'Isso: o texto entre aspas é o que aparece.',
    sectionId: 'o-que-e-print',
    ...over,
  };
}

describe('contrato do quiz — DTOs', () => {
  it('3a. TrackAssertionDto.optionRationales é OPCIONAL e, presente, é string[]', () => {
    const sem = assertionDto();
    assert.equal(sem.optionRationales, undefined);
    const com = assertionDto({ optionRationales: ['a', 'b', 'c', 'd'] });
    com.optionRationales satisfies string[] | undefined;
    assert.equal(com.optionRationales?.length, 4);
  });

  it('3b. RemedialQuizDto tem a forma de uma assertion MAIS a identidade da geração', () => {
    const quiz: RemedialQuizDto = {
      ...assertionDto({ id: 'print-mostra-na-tela-r1' }),
      originAssertionId: 'print-mostra-na-tela',
      generation: 1,
    };
    assert.notEqual(quiz.id, quiz.originAssertionId, 'o quiz gerado NUNCA reusa o id da origem');
    assert.equal(quiz.options.length, 4);
  });

  it('3c. FAIL-CLOSED: o ramo de falha carrega code+message (nunca um veredito inventado)', () => {
    const explicacaoFora: QuizExplainReply = {
      ok: false,
      code: QUIZ_ERROR_CODES.UNAVAILABLE,
      message: 'A explicação está indisponível agora.',
    };
    const quizFora: QuizRemedialReply = {
      ok: false,
      code: QUIZ_ERROR_CODES.INVALID_QUIZ,
      message: 'O quiz gerado não passou no shape do contrato.',
    };
    assert.equal(explicacaoFora.ok, false);
    assert.equal(quizFora.ok, false);
    // O discriminante é o que impede o consumidor de ler `explanation` sem checar.
    if (!explicacaoFora.ok) {
      assert.equal(explicacaoFora.code, 'QUIZ_UNAVAILABLE');
      assert.ok(explicacaoFora.message.length > 0);
    }
    assert.deepEqual(Object.values(QUIZ_ERROR_CODES).sort(), [
      'QUIZ_EMPTY_REPLY',
      'QUIZ_INVALID_QUIZ',
      'QUIZ_NOT_FOUND',
      'QUIZ_PERSIST_FAILED',
      'QUIZ_UNAVAILABLE',
    ]);
  });

  it('3d. os shapes de sucesso batem com o que a repo devolve (attempt/mastery/remediation/history)', () => {
    const attempt: QuizAttemptDto = {
      trackSlug: 'python',
      lessonId: 'imprimir-na-tela',
      sectionKey: 'o-que-e-print',
      assertionId: 'print-mostra-na-tela',
      selectedIndex: 1,
      correct: false,
      attemptNo: 1,
      quizOrigin: 'authored',
      createdAt: '2026-05-01T00:00:00.000Z',
    };
    const mastery: QuizSectionMasteryDto = {
      sectionKey: 'o-que-e-print',
      mastered: false,
      attemptCount: 1,
      correctCount: 0,
      firstCorrectAt: null,
      lastAttemptAt: '2026-05-01T00:00:00.000Z',
    };
    const remediacao: QuizRemediationDto = {
      id: 'rem-1',
      trackSlug: 'python',
      lessonId: 'imprimir-na-tela',
      sectionKey: 'o-que-e-print',
      originAssertionId: 'print-mostra-na-tela',
      generation: 1,
      explanation: 'Você marcou "print": esse é o nome do comando.',
      quiz: null,
      createdAt: '2026-05-01T00:00:00.000Z',
    };
    const attemptOk: QuizAttemptReply = { ok: true, attempt, mastery: [mastery] };
    const historico: QuizHistoryReply = {
      ok: true,
      attempts: [attempt],
      remediations: [remediacao],
      mastery: [mastery],
    };
    assert.equal(attemptOk.ok && attemptOk.attempt.attemptNo, 1);
    assert.equal(historico.ok && historico.remediations[0].quiz, null);

    // Os pedidos aceitam o contexto pedagógico OPCIONAL sem obrigar o chamador.
    const explain: QuizExplainRequest = {
      trackSlug: 'python',
      lessonId: 'imprimir-na-tela',
      sectionKey: 'o-que-e-print',
      assertion: assertionDto(),
      selectedIndex: 1,
      theorySection: null,
    };
    const remedial: QuizRemedialRequest = {
      trackSlug: 'python',
      lessonId: 'imprimir-na-tela',
      sectionKey: 'o-que-e-print',
      originAssertionId: 'print-mostra-na-tela',
      generation: 2,
      assertion: assertionDto(),
      askedQuestions: ['O que aparece com print("oi")?'],
    };
    assert.equal(explain.lessonExcerpt, undefined);
    assert.equal(remedial.askedQuestions?.length, 1);
  });
});

describe('contrato do quiz — espelho zod no draft da engine', () => {
  const base = {
    id: 'print-mostra-na-tela',
    statement: 'print mostra na tela.',
    question: 'O que aparece?',
    options: ['oi', 'print', 'nada', 'erro'],
    answerIndex: 0,
    feedback: 'Isso.',
    sectionId: 'o-que-e-print',
  };

  it('4a. AUSENTE vira `[]` explícito (INV-05: nada .optional() na engine)', () => {
    const r = AssertionDraftSchema.safeParse(base);
    assert.ok(r.success, JSON.stringify(r));
    assert.deepEqual(r.data.optionRationales, []);
  });

  it('4b. EXATAMENTE 4 racionais passam e são preservados', () => {
    const rationais = ['certo', 'errado 1', 'errado 2', 'errado 3'];
    const r = AssertionDraftSchema.safeParse({ ...base, optionRationales: rationais });
    assert.ok(r.success, JSON.stringify(r));
    assert.deepEqual(r.data.optionRationales, rationais);
  });

  it('4c. 1..3 racionais REPROVAM o draft (meia-declaração)', () => {
    for (const parcial of [['um'], ['um', 'dois'], ['um', 'dois', 'tres']]) {
      const r = AssertionDraftSchema.safeParse({ ...base, optionRationales: parcial });
      assert.equal(r.success, false, `${parcial.length} racionais deveriam reprovar`);
    }
  });

  it('4d. racional VAZIO reprova (string em branco não explica nada)', () => {
    const r = AssertionDraftSchema.safeParse({ ...base, optionRationales: ['ok', '', 'ok', 'ok'] });
    assert.equal(r.success, false);
  });
});
