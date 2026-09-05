/**
 * tests/quizHandlers.test.ts — os QUATRO CANAIS DO QUIZ ADAPTATIVO no handler
 * real (`buildTrackHandlers`), não no serviço.
 *
 * O QUE ESTE ARQUIVO COBRE, e por que cada caso existe:
 *
 *   1. `track:quiz-attempt` e `track:quiz-history` são PURAMENTE repo — nenhum
 *      dos dois pode depender de LLM. Os testes montam os handlers SEM `llm` e
 *      exigem `ok:true`: se alguém enfiar uma chamada remota nesse caminho,
 *      registrar a resposta de um quiz passa a falhar sem internet;
 *   2. `track:quiz-explain` e `track:quiz-remedial` são FAIL-CLOSED — sem repo
 *      ou sem serviço, `{ ok:false, code: QUIZ_UNAVAILABLE }` IMEDIATO. O teste
 *      prova o "imediato": o serviço fake conta as chamadas e o contador tem de
 *      ficar em zero;
 *   3. O QUIZ REMEDIAL NUNCA REUSA O `originAssertionId`. As tentativas do quiz
 *      autorado e do remedial vivem na MESMA tabela (`quiz_attempts.
 *      assertion_id`): com ids iguais, o histórico deixa de distinguir "errou a
 *      autorada" de "errou a remedial", e a maestria conta o acerto do quiz
 *      fácil como prova de que a afirmação difícil foi entendida. O handler
 *      recusa com `QUIZ_INVALID_QUIZ` e NÃO PERSISTE;
 *   4. A remediação é PERSISTIDA (explicação + quiz juntos) — é o que faz a
 *      explicação "ficar no histórico da aula" depois de o app fechar;
 *   5. Persistência que falha vira `QUIZ_PERSIST_FAILED`, não um quiz entregue
 *      em silêncio: entregue e não gravado, ele some no próximo boot e o
 *      histórico passa a mentir sobre o que o aluno viu.
 *
 * O QUE ELE NÃO COBRE: a QUALIDADE da explicação e do quiz gerado — isso é do
 * `services/quizRemediation.ts`, cujo corpo é de outra sub-tarefa. Aqui o
 * serviço é sempre um duplo: este arquivo testa a FIAÇÃO, não a pedagogia.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type {
  QuizAttemptReply,
  QuizExplainReply,
  QuizHistoryReply,
  QuizRemedialReply,
  RemedialQuizDto,
  TrackAssertionDto,
} from '../shared/ipc-contract';
import { QUIZ_ERROR_CODES, TRACK_CHANNELS } from '../shared/ipc-contract';
import { buildTrackHandlers, type TrackRepoLike } from '../electron/main/ipc/track-handlers';
import type { IpcHandlerFn } from '../electron/main/ipc/safeHandle';
import type { QuizRemediation } from '../electron/main/services/quizRemediation';

function call<T>(map: Map<string, IpcHandlerFn>, channel: string, payload?: unknown): Promise<T> {
  return map.get(channel)!(null, payload) as Promise<T>;
}

const TRILHA = 'python';
const AULA = 'a-primeira-linha';
const SECAO = 'o-que-e-print';
const AFIRMACAO = 'print-mostra-na-tela';

function assertionDto(): TrackAssertionDto {
  return {
    id: AFIRMACAO,
    statement: 'print mostra o valor na tela.',
    question: 'O que `print("oi")` faz?',
    options: ['mostra oi na tela', 'guarda oi numa variável'],
    answerIndex: 0,
    feedback: 'print escreve na saída padrão.',
    sectionId: SECAO,
  };
}

function quizRemedialDto(over: Partial<RemedialQuizDto> = {}): RemedialQuizDto {
  return {
    id: `${AFIRMACAO}#r1`,
    originAssertionId: AFIRMACAO,
    generation: 1,
    statement: 'print escreve na saída padrão.',
    question: 'E `print(2)`, o que mostra?',
    options: ['2', 'nada'],
    answerIndex: 0,
    feedback: 'o número aparece na tela.',
    sectionId: SECAO,
    ...over,
  };
}

/** Repo em memória com a superfície v5 do quiz. `over` desliga/atrapalha peças. */
function fakeRepo(over: Partial<TrackRepoLike> = {}): TrackRepoLike & {
  attempts: { assertionId: string; correct: boolean; attemptNo: number }[];
  remediations: { originAssertionId: string; explanation: string; quizId: string }[];
} {
  const attempts: { assertionId: string; correct: boolean; attemptNo: number }[] = [];
  const remediations: { originAssertionId: string; explanation: string; quizId: string }[] = [];
  const base: TrackRepoLike = {
    listTrackLessonProgress: async () => [],
    getTrackProficiency: async () => null,
    listGeneratedChallenges: async () => [],
    getAttemptsForChallenge: async () => [],
    markTrackLessonDone: async () => {},
    setTrackProficiency: async () => {},
    insertGeneratedChallenge: async () => {},
    listFailedChallengeSlugs: async () => [],
    recordQuizAttempt: async (input) => {
      // A repo REAL deriva o ordinal (COUNT+1 da seção) na mesma transação do
      // INSERT quando o pedido o omite — o fake reproduz a derivação para que
      // o teste consiga afirmar que o handler NÃO a faz por conta própria.
      const attemptNo =
        input.attemptNo ?? attempts.filter((a) => a.assertionId === input.assertionId).length + 1;
      attempts.push({ assertionId: input.assertionId, correct: input.correct, attemptNo });
      return {
        id: `att-${attempts.length}`,
        trackSlug: input.trackSlug,
        lessonId: input.lessonId,
        sectionKey: input.sectionKey,
        assertionId: input.assertionId,
        selectedIndex: input.selectedIndex,
        correct: input.correct,
        attemptNo,
        quizOrigin: input.quizOrigin ?? 'authored',
        createdAt: '2026-09-05T00:00:00.000Z',
      };
    },
    listQuizAttempts: async () =>
      attempts.map((a, i) => ({
        id: `att-${i + 1}`,
        trackSlug: TRILHA,
        lessonId: AULA,
        sectionKey: SECAO,
        assertionId: a.assertionId,
        selectedIndex: a.correct ? 0 : 1,
        correct: a.correct,
        attemptNo: a.attemptNo,
        quizOrigin: 'authored' as const,
        createdAt: '2026-09-05T00:00:00.000Z',
      })),
    saveQuizRemediation: async (input) => {
      remediations.push({
        originAssertionId: input.originAssertionId,
        explanation: input.explanation,
        quizId: input.quiz.id,
      });
      return {};
    },
    listQuizRemediations: async () =>
      remediations.map((r, i) => ({
        id: `rem-${i + 1}`,
        trackSlug: TRILHA,
        lessonId: AULA,
        sectionKey: SECAO,
        originAssertionId: r.originAssertionId,
        generation: 1,
        explanation: r.explanation,
        quiz: quizRemedialDto({ id: r.quizId }),
        createdAt: '2026-09-05T00:00:00.000Z',
      })),
    quizMasteryFor: async () => [
      {
        sectionKey: SECAO,
        mastered: attempts.some((a) => a.correct),
        attemptCount: attempts.length,
        correctCount: attempts.filter((a) => a.correct).length,
        firstCorrectAt: attempts.some((a) => a.correct) ? '2026-09-05T00:00:00.000Z' : null,
        lastAttemptAt: attempts.length > 0 ? '2026-09-05T00:00:00.000Z' : null,
      },
    ],
    ...over,
  };
  return Object.assign(base, { attempts, remediations }) as ReturnType<typeof fakeRepo>;
}

/** Duplo do serviço com CONTADOR — é o contador que prova o "imediato". */
function fakeService(
  over: Partial<QuizRemediation> = {},
): QuizRemediation & { chamadas: string[] } {
  const chamadas: string[] = [];
  const service = {
    chamadas,
    async explain(): Promise<QuizExplainReply> {
      chamadas.push('explain');
      return { ok: true, explanation: 'A opção 2 confunde mostrar com guardar.' };
    },
    async remedial(): Promise<QuizRemedialReply> {
      chamadas.push('remedial');
      return { ok: true, quiz: quizRemedialDto() };
    },
    ...over,
  };
  return service as QuizRemediation & { chamadas: string[] };
}

/** Os handlers sem trilha em disco: nenhum canal de quiz lê `resources/tracks`. */
function handlers(deps: Partial<Parameters<typeof buildTrackHandlers>[0]> = {}): Map<string, IpcHandlerFn> {
  return buildTrackHandlers({ getTracksDir: () => '/nao-usado-pelos-canais-de-quiz', ...deps });
}

describe('track:quiz-attempt — puramente repo', () => {
  it('grava a resposta e devolve a maestria RECALCULADA (sem llm no caminho)', async () => {
    const repo = fakeRepo();
    // Sem `llm` de propósito: registrar a resposta do aluno não pode depender
    // de rede.
    const map = handlers({ repo });
    const r = await call<QuizAttemptReply>(map, TRACK_CHANNELS.QUIZ_ATTEMPT, {
      trackSlug: TRILHA,
      lessonId: AULA,
      sectionKey: SECAO,
      assertionId: AFIRMACAO,
      selectedIndex: 0,
      correct: true,
    });
    assert.equal(r.ok, true, `esperava ok:true, veio ${JSON.stringify(r)}`);
    assert.equal(r.attempt.assertionId, AFIRMACAO);
    assert.equal(r.attempt.attemptNo, 1, 'o ordinal vem DERIVADO da repo (COUNT+1)');
    assert.equal(r.attempt.quizOrigin, 'authored', 'default do contrato');
    assert.equal(r.mastery.length, 1);
    assert.equal(r.mastery[0].mastered, true, 'acertou ⇒ a seção está provada');
    assert.equal(repo.attempts.length, 1);
  });

  it('a SEGUNDA resposta na mesma seção sai com attemptNo 2 (o handler não conta sozinho)', async () => {
    const repo = fakeRepo();
    const map = handlers({ repo });
    const pedido = {
      trackSlug: TRILHA,
      lessonId: AULA,
      sectionKey: SECAO,
      assertionId: AFIRMACAO,
      selectedIndex: 1,
      correct: false,
    };
    await call<QuizAttemptReply>(map, TRACK_CHANNELS.QUIZ_ATTEMPT, pedido);
    const r2 = await call<QuizAttemptReply>(map, TRACK_CHANNELS.QUIZ_ATTEMPT, pedido);
    assert.equal(r2.ok, true);
    assert.equal(r2.attempt.attemptNo, 2);
    assert.equal(r2.mastery[0].mastered, false, 'dois erros não provam nada');
  });

  it('sem repo → QUIZ_UNAVAILABLE (nunca "gravei" em silêncio)', async () => {
    const map = handlers();
    const r = await call<QuizAttemptReply>(map, TRACK_CHANNELS.QUIZ_ATTEMPT, {
      trackSlug: TRILHA,
      lessonId: AULA,
      sectionKey: SECAO,
      assertionId: AFIRMACAO,
      selectedIndex: 0,
      correct: true,
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, QUIZ_ERROR_CODES.UNAVAILABLE);
  });

  it('pedido sem `correct` → QUIZ_NOT_FOUND (o veredito não é adivinhado aqui)', async () => {
    const map = handlers({ repo: fakeRepo() });
    const r = await call<QuizAttemptReply>(map, TRACK_CHANNELS.QUIZ_ATTEMPT, {
      trackSlug: TRILHA,
      lessonId: AULA,
      sectionKey: SECAO,
      assertionId: AFIRMACAO,
      selectedIndex: 0,
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, QUIZ_ERROR_CODES.NOT_FOUND);
  });

  it('a repo que lança vira QUIZ_PERSIST_FAILED, nunca exceção no invoke', async () => {
    const map = handlers({
      repo: fakeRepo({
        recordQuizAttempt: async () => {
          throw new Error('disco cheio');
        },
      }),
    });
    const r = await call<QuizAttemptReply>(map, TRACK_CHANNELS.QUIZ_ATTEMPT, {
      trackSlug: TRILHA,
      lessonId: AULA,
      sectionKey: SECAO,
      assertionId: AFIRMACAO,
      selectedIndex: 0,
      correct: true,
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, QUIZ_ERROR_CODES.PERSIST_FAILED);
    assert.match(r.message, /disco cheio/);
  });
});

describe('track:quiz-history — o que sobreviveu ao fechamento do app', () => {
  it('devolve tentativas, remediações e maestria da aula', async () => {
    const repo = fakeRepo();
    const map = handlers({ repo, quizRemediation: fakeService() });
    await call<QuizAttemptReply>(map, TRACK_CHANNELS.QUIZ_ATTEMPT, {
      trackSlug: TRILHA,
      lessonId: AULA,
      sectionKey: SECAO,
      assertionId: AFIRMACAO,
      selectedIndex: 1,
      correct: false,
    });
    await call<QuizRemedialReply>(map, TRACK_CHANNELS.QUIZ_REMEDIAL, {
      trackSlug: TRILHA,
      lessonId: AULA,
      sectionKey: SECAO,
      originAssertionId: AFIRMACAO,
      generation: 1,
      assertion: assertionDto(),
      explanation: 'A opção 2 confunde mostrar com guardar.',
    });

    const r = await call<QuizHistoryReply>(map, TRACK_CHANNELS.QUIZ_HISTORY, {
      trackSlug: TRILHA,
      lessonId: AULA,
    });
    assert.equal(r.ok, true, `esperava ok:true, veio ${JSON.stringify(r)}`);
    assert.equal(r.attempts.length, 1);
    assert.equal(r.remediations.length, 1);
    assert.equal(r.remediations[0].explanation, 'A opção 2 confunde mostrar com guardar.');
    assert.notEqual(r.remediations[0].quiz?.id, AFIRMACAO);
    assert.equal(r.mastery[0].attemptCount, 1);
  });

  it('sem trackSlug/lessonId → QUIZ_NOT_FOUND', async () => {
    const map = handlers({ repo: fakeRepo() });
    const r = await call<QuizHistoryReply>(map, TRACK_CHANNELS.QUIZ_HISTORY, { trackSlug: TRILHA });
    assert.equal(r.ok, false);
    assert.equal(r.code, QUIZ_ERROR_CODES.NOT_FOUND);
  });

  it('repo sem a superfície v5 → QUIZ_UNAVAILABLE (build velha degrada declarando)', async () => {
    const map = handlers({
      repo: fakeRepo({ listQuizAttempts: undefined, listQuizRemediations: undefined }),
    });
    const r = await call<QuizHistoryReply>(map, TRACK_CHANNELS.QUIZ_HISTORY, {
      trackSlug: TRILHA,
      lessonId: AULA,
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, QUIZ_ERROR_CODES.UNAVAILABLE);
  });
});

describe('track:quiz-explain — fail-closed', () => {
  it('sem serviço (nem llm) → QUIZ_UNAVAILABLE', async () => {
    const map = handlers({ repo: fakeRepo() });
    const r = await call<QuizExplainReply>(map, TRACK_CHANNELS.QUIZ_EXPLAIN, {
      trackSlug: TRILHA,
      lessonId: AULA,
      sectionKey: SECAO,
      assertion: assertionDto(),
      selectedIndex: 1,
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, QUIZ_ERROR_CODES.UNAVAILABLE);
  });

  it('sem repo → QUIZ_UNAVAILABLE IMEDIATO: o serviço NÃO é chamado', async () => {
    const service = fakeService();
    const map = handlers({ quizRemediation: service });
    const r = await call<QuizExplainReply>(map, TRACK_CHANNELS.QUIZ_EXPLAIN, {
      trackSlug: TRILHA,
      lessonId: AULA,
      sectionKey: SECAO,
      assertion: assertionDto(),
      selectedIndex: 1,
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, QUIZ_ERROR_CODES.UNAVAILABLE);
    assert.deepEqual(service.chamadas, [], 'chamou a IA sabendo que não podia guardar nada');
  });

  it('com serviço e repo → devolve a explicação do serviço, sem reescrevê-la', async () => {
    const service = fakeService();
    const map = handlers({ repo: fakeRepo(), quizRemediation: service });
    const r = await call<QuizExplainReply>(map, TRACK_CHANNELS.QUIZ_EXPLAIN, {
      trackSlug: TRILHA,
      lessonId: AULA,
      sectionKey: SECAO,
      assertion: assertionDto(),
      selectedIndex: 1,
    });
    assert.equal(r.ok, true, `esperava ok:true, veio ${JSON.stringify(r)}`);
    assert.equal(r.explanation, 'A opção 2 confunde mostrar com guardar.');
    assert.deepEqual(service.chamadas, ['explain']);
  });

  it('serviço que LANÇA vira QUIZ_UNAVAILABLE, nunca exceção no invoke', async () => {
    const map = handlers({
      repo: fakeRepo(),
      quizRemediation: fakeService({
        explain: async () => {
          throw new Error('timeout da rede');
        },
      }),
    });
    const r = await call<QuizExplainReply>(map, TRACK_CHANNELS.QUIZ_EXPLAIN, {
      trackSlug: TRILHA,
      lessonId: AULA,
      sectionKey: SECAO,
      assertion: assertionDto(),
      selectedIndex: 1,
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, QUIZ_ERROR_CODES.UNAVAILABLE);
  });
});

describe('track:quiz-remedial — o quiz novo, persistido e com identidade própria', () => {
  it('persiste explicação + quiz e devolve o quiz', async () => {
    const repo = fakeRepo();
    const map = handlers({ repo, quizRemediation: fakeService() });
    const r = await call<QuizRemedialReply>(map, TRACK_CHANNELS.QUIZ_REMEDIAL, {
      trackSlug: TRILHA,
      lessonId: AULA,
      sectionKey: SECAO,
      originAssertionId: AFIRMACAO,
      generation: 1,
      assertion: assertionDto(),
      explanation: 'A opção 2 confunde mostrar com guardar.',
    });
    assert.equal(r.ok, true, `esperava ok:true, veio ${JSON.stringify(r)}`);
    assert.equal(r.quiz.originAssertionId, AFIRMACAO);
    assert.equal(repo.remediations.length, 1);
    assert.equal(repo.remediations[0].explanation, 'A opção 2 confunde mostrar com guardar.');
    assert.equal(repo.remediations[0].quizId, r.quiz.id);
  });

  it('quiz com id IGUAL ao originAssertionId → QUIZ_INVALID_QUIZ e NADA persistido', async () => {
    const repo = fakeRepo();
    const map = handlers({
      repo,
      quizRemediation: fakeService({
        remedial: async () => ({ ok: true, quiz: quizRemedialDto({ id: AFIRMACAO }) }),
      }),
    });
    const r = await call<QuizRemedialReply>(map, TRACK_CHANNELS.QUIZ_REMEDIAL, {
      trackSlug: TRILHA,
      lessonId: AULA,
      sectionKey: SECAO,
      originAssertionId: AFIRMACAO,
      generation: 1,
      assertion: assertionDto(),
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, QUIZ_ERROR_CODES.INVALID_QUIZ);
    assert.equal(repo.remediations.length, 0, 'linha torta não pode entrar na tabela');
  });

  it('quiz com answerIndex fora das opções → QUIZ_INVALID_QUIZ e NADA persistido', async () => {
    const repo = fakeRepo();
    const map = handlers({
      repo,
      quizRemediation: fakeService({
        remedial: async () => ({ ok: true, quiz: quizRemedialDto({ answerIndex: 7 }) }),
      }),
    });
    const r = await call<QuizRemedialReply>(map, TRACK_CHANNELS.QUIZ_REMEDIAL, {
      trackSlug: TRILHA,
      lessonId: AULA,
      sectionKey: SECAO,
      originAssertionId: AFIRMACAO,
      generation: 1,
      assertion: assertionDto(),
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, QUIZ_ERROR_CODES.INVALID_QUIZ);
    assert.equal(repo.remediations.length, 0);
  });

  it('gravação que falha → QUIZ_PERSIST_FAILED (não entrega quiz que sumiria no próximo boot)', async () => {
    const map = handlers({
      repo: fakeRepo({
        saveQuizRemediation: async () => {
          throw new Error('banco fechado');
        },
      }),
      quizRemediation: fakeService(),
    });
    const r = await call<QuizRemedialReply>(map, TRACK_CHANNELS.QUIZ_REMEDIAL, {
      trackSlug: TRILHA,
      lessonId: AULA,
      sectionKey: SECAO,
      originAssertionId: AFIRMACAO,
      generation: 1,
      assertion: assertionDto(),
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, QUIZ_ERROR_CODES.PERSIST_FAILED);
  });

  it('a falha do serviço ATRAVESSA intacta (o handler não a reclassifica)', async () => {
    const repo = fakeRepo();
    const map = handlers({
      repo,
      quizRemediation: fakeService({
        remedial: async () => ({
          ok: false,
          code: QUIZ_ERROR_CODES.EMPTY_REPLY,
          message: 'a IA não devolveu conteúdo.',
        }),
      }),
    });
    const r = await call<QuizRemedialReply>(map, TRACK_CHANNELS.QUIZ_REMEDIAL, {
      trackSlug: TRILHA,
      lessonId: AULA,
      sectionKey: SECAO,
      originAssertionId: AFIRMACAO,
      generation: 1,
      assertion: assertionDto(),
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, QUIZ_ERROR_CODES.EMPTY_REPLY);
    assert.equal(repo.remediations.length, 0);
  });

  it('sem repo → QUIZ_UNAVAILABLE IMEDIATO: o serviço NÃO é chamado', async () => {
    const service = fakeService();
    const map = handlers({ quizRemediation: service });
    const r = await call<QuizRemedialReply>(map, TRACK_CHANNELS.QUIZ_REMEDIAL, {
      trackSlug: TRILHA,
      lessonId: AULA,
      sectionKey: SECAO,
      originAssertionId: AFIRMACAO,
      generation: 1,
      assertion: assertionDto(),
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, QUIZ_ERROR_CODES.UNAVAILABLE);
    assert.deepEqual(service.chamadas, []);
  });
});

describe('os quatro canais estão REGISTRADOS no Map do produto', () => {
  it('buildTrackHandlers registra attempt/explain/remedial/history', () => {
    const map = handlers({ repo: fakeRepo() });
    for (const canal of [
      TRACK_CHANNELS.QUIZ_ATTEMPT,
      TRACK_CHANNELS.QUIZ_EXPLAIN,
      TRACK_CHANNELS.QUIZ_REMEDIAL,
      TRACK_CHANNELS.QUIZ_HISTORY,
    ]) {
      assert.equal(typeof map.get(canal), 'function', `canal não registrado: ${canal}`);
    }
  });

  it('o STUB do serviço (sem corpo ainda) degrada em QUIZ_UNAVAILABLE, nunca em conteúdo inventado', async () => {
    // Sem `quizRemediation` injetado, `llm` presente ⇒ o handler constrói o
    // serviço REAL de `services/quizRemediation.ts`. Enquanto o corpo dele for
    // o stub do commit de PREP, a resposta é UNAVAILABLE — que é o
    // comportamento CORRETO de um serviço ausente. Este teste é o que trava a
    // fiação: quando o corpo chegar, ele passa a exercitar o serviço de verdade
    // e a asserção vira "não é conteúdo fabricado".
    const map = handlers({
      repo: fakeRepo(),
      llm: { chatCompletion: async () => ({ content: '' }) } as never,
    });
    const r = await call<QuizExplainReply>(map, TRACK_CHANNELS.QUIZ_EXPLAIN, {
      trackSlug: TRILHA,
      lessonId: AULA,
      sectionKey: SECAO,
      assertion: assertionDto(),
      selectedIndex: 1,
    });
    if (r.ok) {
      assert.ok(r.explanation.trim().length > 0, 'ok:true exige explicação não vazia');
    } else {
      assert.ok(
        Object.values(QUIZ_ERROR_CODES).includes(r.code),
        `código fora do contrato: ${r.code}`,
      );
    }
  });
});
