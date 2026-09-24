/**
 * tests/cx-views-track-lesson-state.test.ts — GOLDEN MASTER da máquina de
 * estado da aula (`src/lib/trackLessonState.ts`) para as ondas de refatoração.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * O QUE ESTE ARQUIVO É
 * ══════════════════════════════════════════════════════════════════════════
 * Caracterização PURA: fixa o comportamento OBSERVÁVEL de hoje (entradas →
 * saídas de funções exportadas) para que a refatoração de `app/src` prove que
 * "continua funcionando". Nada aqui lê estrutura interna: se a refatoração
 * trocar a implementação e mantiver as saídas, estes testes continuam verdes;
 * se mudar UMA saída observável, eles reprovam.
 *
 * Cobertura (13 blocos): estado inicial e chat · streaming (typewriter) ·
 * bolhas iMessage (hora/dia/tps) · gates de conclusão · relatório e bolha de
 * erro do desafio · seed/retry do erro · ciclo de maestria do quiz (submit →
 * explicação → remediação → reabertura) · invariante anti-vazamento das
 * opções · agrupamento/ancoragem de quizzes · gates "Próximo"/"Concluir" ·
 * hidratação do banco (precedência sessão × banco, linhas corrompidas).
 *
 * Reprodução: `cd app && npm test -- tests/cx-views-track-lesson-state.test.ts`
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  applyTutorReply,
  assertionsBySection,
  attemptForGeneration,
  buildErrorReport,
  canReopenStalledQuiz,
  chatBubbleTps,
  chatDaySeparator,
  chatHistory,
  clearChallengeError,
  createTrackLessonState,
  fenceFor,
  FALLBACK_QUIZ_SECTION,
  formatChatTime,
  formatErrorBubble,
  formatQuizExplanationBubble,
  hydrateQuizFromHistory,
  injectRemediationQuiz,
  isLessonFinishBlocked,
  isNextSectionBlockedByQuiz,
  isQuizAnswered,
  isQuizMastered,
  isTheoryPresentationBubble,
  lessonFinishBlock,
  nextQuizStep,
  optionVisualState,
  optionVisualStateForGeneration,
  pendingQuizzes,
  pendingQuizzesForCurrentSection,
  presentedCount,
  pushUserMessage,
  quizAttempts,
  quizCycleFor,
  quizCycleOf,
  quizExplanation,
  quizForSection,
  quizGeneration,
  quizKeyFor,
  quizzesByMessageIndex,
  quizStepOf,
  QUIZ_KEY_SEPARATOR,
  registerQuizExplanation,
  remediationAssertionId,
  remediationQuizFor,
  reopenStalledQuiz,
  resetQuiz,
  sectionPresentationIndexes,
  seedChallengeError,
  submitQuizAnswer,
  tutorNextAction,
  typewriterCut,
  typewriterDelayPerChar,
  typewriterIsDone,
  TYPEWRITER_TPS,
  visibleQuizFor,
  type TrackLessonUiState,
  type TutorChatMessage,
} from '../src/lib/trackLessonState';
import type {
  QuizAttemptDto,
  QuizRemediationDto,
  RemedialQuizDto,
  TrackAssertionDto,
  TrackChallengeErrorReport,
  TrackSubmitResult,
  TutorReply,
} from '../shared/ipc-contract';

/* ─── Fábricas de dados de teste ──────────────────────────────────────────── */

function assertion(over: Partial<TrackAssertionDto> = {}): TrackAssertionDto {
  return {
    id: 'print-mostra',
    statement: 'print mostra na tela',
    question: 'O que print faz?',
    options: ['op0', 'op1', 'op2', 'op3'],
    answerIndex: 1,
    feedback: 'feedback',
    ...over,
  };
}

function reply(over: Partial<TutorReply> = {}): TutorReply {
  return {
    ok: true,
    message: 'mensagem do tutor',
    sectionId: null,
    done: false,
    ...over,
  };
}

function submitResult(over: Partial<TrackSubmitResult> = {}): TrackSubmitResult {
  return {
    ok: false,
    passed: false,
    testsRun: 3,
    expectedTests: 3,
    output: 'saída do runner',
    checks: [
      { name: 'dobro de 2 é 4', passed: true },
      { name: 'dobro de 0 é 0', passed: false },
    ],
    passedCount: 1,
    totalCount: 2,
    ...over,
  };
}

function errorReport(over: Partial<TrackChallengeErrorReport> = {}): TrackChallengeErrorReport {
  return {
    trackSlug: 'python',
    lessonId: 'a-primeira-linha',
    challengeId: 'dobro',
    challengeTitle: 'O dobro do número',
    files: [{ path: 'solution.mjs', code: 'console.log(1)' }],
    output: 'esperado 4, saiu 1',
    checks: [{ name: 'dobro de 2 é 4', passed: false }],
    passedCount: 0,
    totalCount: 1,
    ...over,
  };
}

function attemptRow(over: Partial<QuizAttemptDto> = {}): QuizAttemptDto {
  return {
    trackSlug: 'python',
    lessonId: 'a-primeira-linha',
    sectionKey: 'as-tres-partes::print-mostra',
    assertionId: 'print-mostra',
    selectedIndex: 0,
    correct: false,
    attemptNo: 1,
    quizOrigin: 'authored',
    createdAt: '2026-07-15T12:00:00.000Z',
    ...over,
  } as QuizAttemptDto;
}

function remediationRow(over: Partial<QuizRemediationDto> = {}): QuizRemediationDto {
  return {
    id: 'rem-1',
    trackSlug: 'python',
    lessonId: 'a-primeira-linha',
    sectionKey: 'as-tres-partes::print-mostra',
    originAssertionId: 'print-mostra',
    generation: 1,
    explanation: 'explicação lida',
    quiz: quizRemedial({ id: 'gerado-qualquer' }),
    createdAt: '2026-07-15T12:01:00.000Z',
    ...over,
  } as QuizRemediationDto;
}

/** O quiz GERADO pela IA persiste com a identidade de origem (RemedialQuizDto). */
function quizRemedial(over: Partial<RemedialQuizDto> = {}): RemedialQuizDto {
  return {
    ...assertion(),
    originAssertionId: 'print-mostra',
    generation: 1,
    ...over,
  };
}

/** Mensagem 'assistant' crua (o formato que o histórico guarda). */
function bubble(over: Partial<TutorChatMessage> = {}): TutorChatMessage {
  return { role: 'assistant', content: 'texto', ts: 0, kind: 'message', ...over };
}

/** Estado só com histórico (atalho para os testes de ancoragem/bolhas). */
function stateWith(history: TutorChatMessage[], presented: string[] = []): TrackLessonUiState {
  return { ...createTrackLessonState(), history, presentedSections: presented };
}

/* ══════════════════════════════════════════════════════════════════════════
 * 1. ESTADO INICIAL E O CHAT BÁSICO
 * ══════════════════════════════════════════════════════════════════════════ */

describe('estado inicial da aula', () => {
  it('nasce vazio: sem seções, sem chat, teoria não feita, sem erro e sem quiz', () => {
    assert.deepEqual(createTrackLessonState(), {
      presentedSections: [],
      history: [],
      theoryDone: false,
      lastError: null,
      challengeError: null,
      quizBySection: {},
    });
  });
});

describe('applyTutorReply — o kind da resposta e a memória do chat', () => {
  it("'reply' só quando o tutor respondeu à pergunta do aluno (última é user, sem sectionId)", () => {
    const s0 = pushUserMessage(createTrackLessonState(), 'e o print?', 10);
    const s1 = applyTutorReply(s0, reply({ message: 'print mostra' }), 20);
    assert.equal(s1.history[s1.history.length - 1]?.kind, 'reply');
    assert.equal(s1.history[s1.history.length - 1]?.ts, 20);
  });

  it("seção 'next' NUNCA vira 'reply', mesmo com a última mensagem sendo do aluno", () => {
    const s0 = pushUserMessage(createTrackLessonState(), 'pergunta qualquer', 10);
    const s1 = applyTutorReply(s0, reply({ message: 'seção 1', sectionId: 's1' }), 20);
    assert.equal(s1.history[s1.history.length - 1]?.kind, 'message');
    assert.deepEqual(s1.presentedSections, ['s1']);
  });

  it('resposta que não segue mensagem do aluno também é "message"', () => {
    const s1 = applyTutorReply(createTrackLessonState(), reply({ message: 'oi' }), 5);
    assert.equal(s1.history[0]?.kind, 'message');
    assert.equal(s1.history[0]?.role, 'assistant');
  });

  it('mensagem em branco (ou só espaços) NÃO entra no histórico, mas o sectionId entra', () => {
    const s1 = applyTutorReply(createTrackLessonState(), reply({ message: '   ', sectionId: 's1' }), 5);
    assert.equal(s1.history.length, 0);
    assert.deepEqual(s1.presentedSections, ['s1']);
  });

  it('sectionId repetido não duplica a seção; done=true marca theoryDone e nunca desmarca', () => {
    let s = applyTutorReply(createTrackLessonState(), reply({ message: 'a', sectionId: 's1' }));
    s = applyTutorReply(s, reply({ message: 'b', sectionId: 's1' }));
    assert.deepEqual(s.presentedSections, ['s1']);
    s = applyTutorReply(s, reply({ message: 'c', done: true }));
    assert.equal(s.theoryDone, true);
    s = applyTutorReply(s, reply({ message: 'd', done: false }));
    assert.equal(s.theoryDone, true, 'theoryDone é monotônico');
  });

  it('lastError: ok zera; !ok sem error cai em "erro desconhecido"; !ok com error mostra a mensagem', () => {
    const comErro = applyTutorReply(
      createTrackLessonState(),
      reply({ ok: false, error: { code: 'E1', message: 'canal caiu' } }),
    );
    assert.equal(comErro.lastError, 'canal caiu');
    const semError = applyTutorReply(comTrata(), reply({ ok: false }));
    assert.equal(semError.lastError, 'erro desconhecido');
    const ok = applyTutorReply(semError, reply({ ok: true }));
    assert.equal(ok.lastError, null);
  });

  it('a resposta PRESERVA challengeError e quizBySection (montagem explícita, sem perder nada)', () => {
    const base = createTrackLessonState();
    const comQuiz = submitQuizAnswer(base, 'k', 0, 0);
    const s = applyTutorReply({ ...comQuiz, challengeError: errorReport() }, reply({ message: 'ok' }));
    assert.deepEqual(s.challengeError, errorReport());
    assert.equal(s.quizBySection, comQuiz.quizBySection, 'o mapa de quiz sobrevive aos turnos');
  });
});

/** Estado com uma resposta já registrada — usado só pelo teste de lastError. */
function comTrata(): TrackLessonUiState {
  return applyTutorReply(createTrackLessonState(), reply({ ok: false, error: { code: 'E', message: 'x' } }));
}

describe('pushUserMessage / chatHistory', () => {
  it('o texto é aparado, o ts é o injetado e lastError zera', () => {
    const s = pushUserMessage(comTrata(), '  e agora?  ', 99);
    assert.deepEqual(s.history[s.history.length - 1], { role: 'user', content: 'e agora?', ts: 99 });
    assert.equal(s.lastError, null);
  });

  it('texto vazio é NO-OP por referência (nenhuma mensagem nova)', () => {
    const s0 = createTrackLessonState();
    assert.equal(pushUserMessage(s0, '   '), s0);
  });

  it('chatHistory STRIPA ts/kind/errorFor/errorBeforeLesson — o main vê só role/content', () => {
    const s = stateWith([
      bubble({ kind: 'review', errorFor: 'dobro', errorBeforeLesson: true, content: 'review', ts: 7 }),
      { role: 'user', content: 'acho que errei o tipo', ts: 8 },
    ]);
    assert.deepEqual(chatHistory(s), [
      { role: 'assistant', content: 'review' },
      { role: 'user', content: 'acho que errei o tipo' },
    ]);
  });

  it('tutorNextAction: "next" enquanto a teoria não termina; "answer" depois de done', () => {
    assert.equal(tutorNextAction(createTrackLessonState()), 'next');
    assert.equal(tutorNextAction({ ...createTrackLessonState(), theoryDone: true }), 'answer');
  });

  it('presentedCount conta as seções apresentadas', () => {
    const s = stateWith([], ['s1', 's2', 's3']);
    assert.equal(presentedCount(s), 3);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * 2. STREAMING (o efeito "digitação")
 * ══════════════════════════════════════════════════════════════════════════ */

describe('typewriter — corte, atraso e fim (puro e determinístico)', () => {
  it('typewriterCut: 0ms → 0; tempo grande → text.length; nunca sai de [0, length]', () => {
    const texto = 'x'.repeat(300);
    assert.equal(typewriterCut(texto, 0), 0);
    assert.equal(typewriterCut(texto, 10 ** 9), 300);
    assert.equal(typewriterCut(texto, -50), 0, 'tempo negativo clampa em 0');
  });

  it('a conta é floor(elapsed × tps × 4 / 1000) e o tps é configurável', () => {
    // 1000ms × 100 tps × 4 / 1000 = 400 chars (o default "free").
    assert.equal(typewriterCut('y'.repeat(1000), 1000), 400);
    // teoria: 7 tps → 28 chars/s.
    assert.equal(typewriterCut('y'.repeat(1000), 1000, TYPEWRITER_TPS.theory), 28);
  });

  it('é monotônico em elapsedMs', () => {
    const texto = 'z'.repeat(500);
    let anterior = -1;
    for (const ms of [0, 10, 250, 750, 1234, 5000]) {
      const cut = typewriterCut(texto, ms);
      assert.ok(cut >= anterior, `cut(${ms}) = ${cut} veio depois de ${anterior}`);
      anterior = cut;
    }
  });

  it('typewriterDelayPerChar ≈ 1000/(tps×4): 2.5ms no free e ~35.7ms na teoria', () => {
    assert.equal(typewriterDelayPerChar(), 2.5);
    assert.ok(Math.abs(typewriterDelayPerChar(TYPEWRITER_TPS.theory) - 1000 / 28) < 1e-9);
  });

  it('typewriterIsDone é verdadeiro exatamente a partir do corte completo', () => {
    const texto = 'abcde';
    assert.equal(typewriterIsDone(texto, 0), false);
    assert.equal(typewriterIsDone(texto, typewriterDelayPerChar() * texto.length), true);
  });

  it('TYPEWRITER_TPS: free 100, theory 7, review 10 (as velocidades nomeadas)', () => {
    assert.deepEqual({ ...TYPEWRITER_TPS }, { free: 100, theory: 7, review: 10 });
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * 3. BOLHAS iMessage (o que é teoria, a velocidade, a hora e o separador)
 * ══════════════════════════════════════════════════════════════════════════ */

describe('isTheoryPresentationBubble / chatBubbleTps', () => {
  const historico: TutorChatMessage[] = [
    bubble({ kind: 'message', content: 'seção 1', ts: 1 }), // 0 — teoria
    { role: 'user', content: 'duvida', ts: 2 }, // 1
    bubble({ kind: 'reply', content: 'resposta', ts: 3 }), // 2
    bubble({ kind: 'review', content: 'review', ts: 4 }), // 3
    bubble({ kind: 'message', content: 'pergunta semeada', ts: 5 }), // 4 — NÃO é teoria
    bubble({ kind: 'quiz-explanation', content: 'explicação', ts: 6 }), // 5
  ];

  it('só a bolha assistant "message" que NÃO segue uma "review" é apresentação de teoria', () => {
    assert.equal(isTheoryPresentationBubble(historico, 0), true);
    assert.equal(isTheoryPresentationBubble(historico, 1), false, 'user não é teoria');
    assert.equal(isTheoryPresentationBubble(historico, 2), false, 'reply não é teoria');
    assert.equal(isTheoryPresentationBubble(historico, 4), false, 'pergunta semeada após review não é teoria');
    assert.equal(isTheoryPresentationBubble(historico, 5), false, 'quiz-explanation não é teoria');
  });

  it('índices fora do range e o começo do histórico (sem anterior) são tratados', () => {
    assert.equal(isTheoryPresentationBubble(historico, -1), false);
    assert.equal(isTheoryPresentationBubble(historico, 99), false);
    const soUma = [bubble({ kind: 'message' })];
    assert.equal(isTheoryPresentationBubble(soUma, 0), true, 'primeira bolha, sem review antes');
  });

  it('velocidades: review→10, quiz-explanation→7, teoria→7, reply/user→100 (free)', () => {
    assert.equal(chatBubbleTps(historico, 0), TYPEWRITER_TPS.theory);
    assert.equal(chatBubbleTps(historico, 1), TYPEWRITER_TPS.free);
    assert.equal(chatBubbleTps(historico, 2), TYPEWRITER_TPS.free);
    assert.equal(chatBubbleTps(historico, 3), TYPEWRITER_TPS.review);
    assert.equal(chatBubbleTps(historico, 4), TYPEWRITER_TPS.free, 'pergunta semeada digita livre');
    assert.equal(chatBubbleTps(historico, 5), TYPEWRITER_TPS.theory);
    assert.equal(chatBubbleTps(historico, 99), TYPEWRITER_TPS.free, 'índice fora do range cai no free');
  });
});

describe('formatChatTime / chatDaySeparator (iMessage)', () => {
  const AGORA = Date.UTC(2026, 6, 15, 15, 30, 0); // 15/07/2026
  const ONTEM = Date.UTC(2026, 6, 14, 9, 5, 0);
  const ANTES = Date.UTC(2026, 5, 30, 23, 59, 0);

  it('hora HH:MM em relógio 24h nos DOIS idiomas', () => {
    assert.equal(formatChatTime(AGORA, 'pt-BR').match(/^\d{2}:\d{2}$/)?.length, 1);
    assert.equal(formatChatTime(AGORA, 'pt-BR'), formatChatTime(AGORA, 'en'), 'mesmo formato nas duas línguas');
  });

  it('sem mensagem anterior NÃO há separador; mesmo dia também não', () => {
    assert.equal(chatDaySeparator(AGORA, undefined, 'pt-BR', AGORA), null);
    assert.equal(chatDaySeparator(AGORA, AGORA - 60_000, 'pt-BR', AGORA), null);
  });

  it('o dia muda para hoje → "today"; para ontem → "yesterday"', () => {
    assert.deepEqual(chatDaySeparator(AGORA, ONTEM, 'pt-BR', AGORA), { kind: 'today' });
    assert.deepEqual(chatDaySeparator(ONTEM, ANTES, 'pt-BR', AGORA), { kind: 'yesterday' });
  });

  it('dia mais antigo → data COMPLETA no locale, sempre com o ano', () => {
    const sep = chatDaySeparator(ANTES, Date.UTC(2026, 0, 1), 'pt-BR', AGORA);
    assert.equal(sep?.kind, 'date');
    const label = sep?.kind === 'date' ? sep.label : '';
    assert.match(label, /2026/, 'o ano nunca some (uma aula retomada pode atravessar anos)');
  });

  it('a separação de dia é local (mudar só a hora do relógio não cria separador)', () => {
    const tarde = Date.UTC(2026, 6, 15, 23, 0, 0);
    const deManha = Date.UTC(2026, 6, 15, 8, 0, 0);
    assert.equal(chatDaySeparator(tarde, deManha, 'pt-BR', AGORA), null);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * 4. GATES DE CONCLUSÃO DA AULA
 * ══════════════════════════════════════════════════════════════════════════ */

describe('lessonFinishBlock / isLessonFinishBlocked', () => {
  const passed = { lastVerdict: 'passed' as const };
  const failed = { lastVerdict: 'failed' as const };
  const nuncaTentado = { lastVerdict: null };

  it("'quiz' vem ANTES de 'challenges' (o desbloqueio mais barato é o card na tela)", () => {
    assert.equal(lessonFinishBlock([failed], 1), 'quiz');
  });

  it("desafio pendente (null/failed/timeout/abandoned) bloqueia; todos 'passed' libera", () => {
    assert.equal(lessonFinishBlock([nuncaTentado]), 'challenges');
    assert.equal(lessonFinishBlock([failed]), 'challenges');
    assert.equal(lessonFinishBlock([{ lastVerdict: 'timeout' }]), 'challenges');
    assert.equal(lessonFinishBlock([{ lastVerdict: 'abandoned' }]), 'challenges');
    assert.equal(lessonFinishBlock([passed]), null);
    assert.equal(lessonFinishBlock([passed, failed]), 'challenges', 'basta UM pendente');
  });

  it('sem desafios e sem quiz pendente → liberado (default pendingQuizCount = 0)', () => {
    assert.equal(lessonFinishBlock([]), null);
    assert.equal(lessonFinishBlock([], 0), null);
    assert.equal(isLessonFinishBlocked([]), false);
    assert.equal(isLessonFinishBlocked([failed]), true);
    assert.equal(isLessonFinishBlocked([passed], 2), true);
    assert.equal(isLessonFinishBlocked([passed], 0), false);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * 5. RELATÓRIO E BOLHA DE ERRO DO DESAFIO
 * ══════════════════════════════════════════════════════════════════════════ */

describe('buildErrorReport', () => {
  it('copia TODOS os arquivos e checks, com contagens e saída — sem a solução', () => {
    const report = buildErrorReport({
      trackSlug: 'python',
      lessonId: 'l1',
      challengeId: 'c1',
      challengeTitle: 'Título',
      files: [
        { path: 'a.mjs', code: 'code A' },
        { path: 'b.mjs', code: 'code B' },
      ],
      result: submitResult({ checks: [{ name: 'x', passed: true }], passedCount: 1, totalCount: 1 }),
    });
    assert.deepEqual(report.files, [
      { path: 'a.mjs', code: 'code A' },
      { path: 'b.mjs', code: 'code B' },
    ]);
    assert.deepEqual(report.checks, [{ name: 'x', passed: true }]);
    assert.equal(report.passedCount, 1);
    assert.equal(report.totalCount, 1);
    assert.equal(report.output, 'saída do runner');
    assert.equal('testsCode' in report, false);
    assert.equal('solutionCode' in report, false);
  });

  it('attemptedBeforeLesson só aparece quando é TRUE (no fluxo normal o campo nasce ausente)', () => {
    const args = {
      trackSlug: 'p',
      lessonId: 'l',
      challengeId: 'c',
      challengeTitle: 't',
      files: [],
      result: submitResult(),
    };
    assert.equal('attemptedBeforeLesson' in buildErrorReport(args), false);
    assert.equal('attemptedBeforeLesson' in buildErrorReport({ ...args, attemptedBeforeLesson: false }), false);
    assert.equal(buildErrorReport({ ...args, attemptedBeforeLesson: true }).attemptedBeforeLesson, true);
  });
});

describe('fenceFor — fence dinâmico contra backticks de autoria não controlada', () => {
  it('sem backticks o fence é o mínimo (3); run de N força N+1', () => {
    assert.equal(fenceFor('sem crase nenhuma'), '```');
    assert.equal(fenceFor(''), '```');
    assert.equal(fenceFor('tem ``` no meio'), '````');
    assert.equal(fenceFor('`````'), '`'.repeat(6));
  });
});

describe('formatErrorBubble — markdown determinístico do review', () => {
  it('ordem fixa: título, desafio, razão parcial, código submetido, checklist, saída', () => {
    const md = formatErrorBubble(errorReport());
    const pos = [
      md.indexOf('## Seu código falhou nos testes'),
      md.indexOf('**O dobro do número**'),
      md.indexOf('**0 de 1 testes passaram**'),
      md.indexOf('Código submetido'),
      md.indexOf('**solution.mjs**'),
      md.indexOf('Resultado por teste'),
      md.indexOf('- ✖ dobro de 2 é 4'),
      md.indexOf('Saída:'),
      md.indexOf('esperado 4, saiu 1'),
    ];
    for (let i = 1; i < pos.length; i++) {
      assert.ok(pos[i] > pos[i - 1] && pos[i - 1] >= 0, `seção ${i} fora de ordem: ${JSON.stringify(pos)}`);
    }
  });

  it('labels injetados sobrescrevem os defaults (i18n da view)', () => {
    const md = formatErrorBubble(errorReport(), {
      title: 'TÍTULO',
      partialCount: '{{passed}}/{{total}}',
      filesTitle: 'ARQUIVOS',
    });
    assert.ok(md.includes('## TÍTULO'));
    assert.ok(md.includes('**0/1**'));
    assert.ok(md.includes('ARQUIVOS'));
  });

  it('checklist vazio tem frase própria; sem arquivos a seção de código não aparece', () => {
    const md = formatErrorBubble(errorReport({ checks: [], files: [] }));
    assert.ok(md.includes('- _(nenhum check rodou — a execução nem chegou aos testes)_'));
    assert.equal(md.includes('Código submetido'), false);
  });

  it('o fence do código do aluno e da saída cresce junto com os backticks do conteúdo', () => {
    const md = formatErrorBubble(
      errorReport({
        files: [{ path: 'a.mjs', code: '```\nconsole.log("```")\n```' }],
        output: 'eco de ```` no runner',
      }),
    );
    assert.ok(md.includes('````\n```\nconsole.log'), 'fence de 4+ envolve código com run de 3');
    assert.ok(md.includes('`````text'), 'fence da saída acompanha o run de 4 do output');
  });
});

describe('seedChallengeError / clearChallengeError — a discussão do erro no chat', () => {
  it('semeia o PAR (review + pergunta) com ts injetado e grava o challengeError', () => {
    const s = seedChallengeError(createTrackLessonState(), errorReport(), 'o que você acha que errou?', {}, 500);
    assert.equal(s.history.length, 2);
    assert.deepEqual(
      s.history.map((m) => [m.kind, m.ts]),
      [['review', 500], ['message', 500]],
    );
    assert.equal(s.history[0].errorFor, 'dobro');
    assert.deepEqual(s.challengeError, errorReport());
  });

  it('NO-OP por referência quando a discussão ATIVA já é do MESMO desafio (guard anti-remount)', () => {
    const s1 = seedChallengeError(createTrackLessonState(), errorReport(), 'pergunta?', {}, 1);
    const s2 = seedChallengeError(s1, errorReport(), 'pergunta?', {}, 2);
    assert.equal(s2, s1);
  });

  it('RETRY do mesmo desafio após clearChallengeError RE-SEMEIA: par antigo sai, par novo no FIM', () => {
    let s = seedChallengeError(createTrackLessonState(), errorReport(), 'pergunta?', {}, 1);
    s = clearChallengeError(s);
    s = stateWith([...s.history, bubble({ content: 'seção nova', ts: 2 })], ['s-nova']);
    const retry = seedChallengeError(s, errorReport({ output: '2ª falha' }), 'pergunta?', {}, 3);
    // histórico: [seção nova, review novo, pergunta nova] — o par antigo sumiu,
    // a seção nova ficou, e o par novo está no FIM.
    assert.equal(retry.history.length, 3);
    assert.equal(retry.history[0].content, 'seção nova');
    assert.equal(retry.history[1].kind, 'review');
    assert.ok(retry.history[1].content.includes('2ª falha'));
    assert.equal(retry.history[2].kind, 'message');
    assert.equal(retry.challengeError?.output, '2ª falha');
  });

  it('desafio DIFERENTE REPÕE as bolhas no MESMO ponto em que as antigas estavam', () => {
    let s = stateWith([bubble({ content: 'intro', ts: 0 })], []);
    s = seedChallengeError(s, errorReport({ challengeId: 'antigo' }), 'pergunta antiga?', {}, 1);
    s = pushUserMessage(s, 'respondi', 2);
    const trocado = seedChallengeError(
      s,
      errorReport({ challengeId: 'novo', output: 'outro erro' }),
      'pergunta nova?',
      {},
      3,
    );
    // [intro, review novo, pergunta nova, respondi] — reposição, não duplicação.
    assert.deepEqual(
      trocado.history.map((m) => m.content),
      ['intro', trocado.history[1].content, 'pergunta nova?', 'respondi'],
    );
    assert.equal(trocado.history[1].errorFor, 'novo');
    assert.equal(trocado.history.filter((m) => m.kind === 'review').length, 1);
  });

  it('errorBeforeLesson vira flag da bolha SÓ quando true (a decisão do botão sobrevive ao next)', () => {
    const s = seedChallengeError(
      createTrackLessonState(),
      errorReport({ attemptedBeforeLesson: true }),
      'pergunta?',
      {},
      1,
    );
    assert.equal(s.history[0].errorBeforeLesson, true);
    const normal = seedChallengeError(createTrackLessonState(), errorReport(), 'pergunta?', {}, 1);
    assert.equal('errorBeforeLesson' in normal.history[0], false);
  });

  it('clearChallengeError zera o contexto MANTENDO o histórico; sem erro é no-op por referência', () => {
    const s1 = seedChallengeError(createTrackLessonState(), errorReport(), 'pergunta?', {}, 1);
    const s2 = clearChallengeError(s1);
    assert.equal(s2.challengeError, null);
    assert.equal(s2.history.length, 2, 'as bolhas continuam na conversa');
    assert.equal(clearChallengeError(s2), s2);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * 6. CICLO DE MAESTRIA DO QUIZ
 * ══════════════════════════════════════════════════════════════════════════ */

describe('quizKeyFor / remediationAssertionId — a chave é única e REVERSÍVEL', () => {
  it('com sectionId a chave é `sectionId::assertionId`; sem sectionId, só a id', () => {
    assert.equal(quizKeyFor({ id: 'a1', sectionId: 's1' }), `s1${QUIZ_KEY_SEPARATOR}a1`);
    assert.equal(quizKeyFor({ id: 'a1' }), 'a1');
  });

  it('duas assertions da MESMA seção não colidem (o bug antigo da chave única)', () => {
    const k1 = quizKeyFor({ id: 'a1', sectionId: 's1' });
    const k2 = quizKeyFor({ id: 'a2', sectionId: 's1' });
    assert.notEqual(k1, k2);
  });

  it('a id do remediador é `<chave>#g<N>` e volta à chave original pelo quizKeyFor', () => {
    const chave = quizKeyFor({ id: 'a1', sectionId: 's1' });
    const idRemediadora = remediationAssertionId(chave, 3);
    assert.equal(idRemediadora, `${chave}#g3`);
    assert.equal(quizKeyFor({ id: idRemediadora, sectionId: 'qualquer' }), chave);
  });
});

describe('quizCycleOf — a normalização do ciclo (inclusive o formato LEGADO)', () => {
  it('undefined → ciclo zerado (aguardando-resposta, geração 0, sem maestria)', () => {
    const c = quizCycleOf(undefined);
    assert.equal(c.stage, 'aguardando-resposta');
    assert.equal(c.generation, 0);
    assert.deepEqual(c.attempts, []);
    assert.equal(c.mastered, false);
    assert.equal(c.answeredThisGeneration, false);
  });

  it('LEGADO respondido-certo → "dominado" (o acerto antigo vale como maestria)', () => {
    const c = quizCycleOf({ answered: true, selected: 2, correct: true });
    assert.equal(c.stage, 'dominado');
    assert.equal(c.mastered, true);
    assert.deepEqual(c.attempts, [{ generation: 0, selected: 2, correct: true, ts: 0 }]);
  });

  it('LEGADO respondido-errado → "explicando" (o ciclo reabre sob a regra nova)', () => {
    const c = quizCycleOf({ answered: true, selected: 1, correct: false });
    assert.equal(c.stage, 'explicando');
    assert.equal(c.mastered, false);
    assert.equal(c.answeredThisGeneration, true);
  });

  it('LEGADO sem resposta → "aguardando-resposta" e sem tentativas sintetizadas', () => {
    const c = quizCycleOf({ answered: false, selected: null, correct: null });
    assert.equal(c.stage, 'aguardando-resposta');
    assert.deepEqual(c.attempts, []);
  });

  it('stage explícito vence a inferência do legado', () => {
    const c = quizCycleOf({ answered: true, selected: 0, correct: false, stage: 'novo-quiz-pendente' });
    assert.equal(c.stage, 'novo-quiz-pendente');
  });

  it('quizCycleFor lê a chave certa do estado (chave desconhecida → ciclo zerado)', () => {
    let s = createTrackLessonState();
    s = submitQuizAnswer(s, 'k1', 0, 0);
    assert.equal(quizCycleFor(s, 'k1').mastered, true);
    assert.equal(quizCycleFor(s, 'outra').stage, 'aguardando-resposta');
  });
});

describe('submitQuizAnswer — acerto FECHA a chave; erro abre o ciclo; duplo clique é no-op', () => {
  it('acerto → "dominado", tentativa registrada com o ts injetado', () => {
    const s = submitQuizAnswer(createTrackLessonState(), 'k', 1, 1, 777);
    const q = s.quizBySection['k'];
    assert.equal(q.stage, 'dominado');
    assert.deepEqual(q.attempts, [{ generation: 0, selected: 1, correct: true, ts: 777 }]);
    assert.equal(isQuizMastered(s, 'k'), true);
    assert.equal(isQuizAnswered(s, 'k'), true);
  });

  it('erro → "explicando" (NÃO libera o gate), tentativa errada guardada', () => {
    const s = submitQuizAnswer(createTrackLessonState(), 'k', 0, 1, 5);
    assert.equal(s.quizBySection['k'].stage, 'explicando');
    assert.equal(isQuizMastered(s, 'k'), false);
    assert.deepEqual(s.quizBySection['k'].attempts, [{ generation: 0, selected: 0, correct: false, ts: 5 }]);
  });

  it('segunda submissão na MESMA geração é no-op por referência (dois cliques = uma tentativa)', () => {
    const s1 = submitQuizAnswer(createTrackLessonState(), 'k', 0, 1);
    const s2 = submitQuizAnswer(s1, 'k', 1, 1);
    assert.equal(s2, s1);
  });

  it('chave DOMINADA é imutável: submissão posterior não muda nada', () => {
    const s1 = submitQuizAnswer(createTrackLessonState(), 'k', 1, 1);
    assert.equal(submitQuizAnswer(s1, 'k', 0, 1), s1);
    assert.equal(s1.quizBySection['k'].attempts?.length, 1);
  });
});

describe('seletores do ciclo', () => {
  it('quizForSection devolve o estado ou undefined; quizExplanation/remediationQuizFor leem o ciclo', () => {
    const s = submitQuizAnswer(createTrackLessonState(), 'k', 0, 1);
    assert.deepEqual(quizForSection(s, 'k'), s.quizBySection['k']);
    assert.equal(quizForSection(s, 'nada'), undefined);
    assert.equal(quizExplanation(s, 'k'), null);
    assert.equal(remediationQuizFor(s, 'k'), null);
    assert.equal(quizGeneration(s, 'k'), 0);
    assert.equal(quizAttempts(s, 'k').length, 1);
  });

  it('attemptForGeneration acha a tentativa da geração certa (undefined quando não respondeu aquela)', () => {
    const quiz = {
      answered: false,
      selected: null,
      correct: null,
      generation: 2,
      attempts: [
        { generation: 0, selected: 0, correct: false, ts: 1 },
        { generation: 1, selected: 1, correct: false, ts: 2 },
      ],
    };
    assert.deepEqual(attemptForGeneration(quiz, 1), { generation: 1, selected: 1, correct: false, ts: 2 });
    assert.equal(attemptForGeneration(quiz, 2), undefined);
    assert.equal(attemptForGeneration(undefined, 0), undefined);
  });
});

describe('formatQuizExplanationBubble — o markdown diagnóstico', () => {
  it('ordem: título, pergunta, alternativa marcada, explicação (sem punição nem ritual)', () => {
    const md = formatQuizExplanationBubble({
      question: 'O que print faz?',
      chosenOption: 'op0',
      explanation: 'A seção mostra que print escreve na saída.',
    });
    assert.ok(md.startsWith('## Onde essa alternativa se separa do que a seção mostra'));
    assert.ok(md.indexOf('**O que print faz?**') < md.indexOf('Alternativa marcada: op0'));
    assert.ok(md.indexOf('Alternativa marcada: op0') < md.indexOf('A seção mostra'));
  });

  it('trecho de código citado entra em code block com linguagem e fence dinâmico', () => {
    const md = formatQuizExplanationBubble(
      { question: 'q', chosenOption: 'o', explanation: 'e', codeExcerpt: ' ```\nprint(1)', codeLanguage: 'python' },
      { title: 'T', chosen: 'C' },
    );
    assert.ok(md.includes('````python\n```\nprint(1)\n````'), 'o excerpt é aparado e o fence cresce para 4');
  });

  it('sem trecho (ou trecho em branco) não há code block', () => {
    const md = formatQuizExplanationBubble({ question: 'q', chosenOption: 'o', explanation: 'e' });
    assert.equal(md.includes('```'), false);
    const branco = formatQuizExplanationBubble({ question: 'q', chosenOption: 'o', explanation: 'e', codeExcerpt: '  \n ' });
    assert.equal(branco.includes('```'), false);
  });
});

describe('registerQuizExplanation — a explicação vira BOLHA e avança o ciclo', () => {
  function estadoEmExplicando(): TrackLessonUiState {
    return submitQuizAnswer(createTrackLessonState(), 'k', 0, 1, 1);
  }

  it('em "explicando": bolha kind "quiz-explanation" no histórico + stage "novo-quiz-pendente"', () => {
    const s = registerQuizExplanation(
      estadoEmExplicando(),
      'k',
      { question: 'Q', chosenOption: 'op0', explanation: 'porque sim' },
      {},
      42,
    );
    const ultima = s.history[s.history.length - 1];
    assert.equal(ultima.kind, 'quiz-explanation');
    assert.equal(ultima.role, 'assistant');
    assert.equal(ultima.ts, 42);
    assert.equal(s.quizBySection['k'].stage, 'novo-quiz-pendente');
    assert.equal(s.quizBySection['k'].explanation, ultima.content);
    assert.equal(nextQuizStep(s, 'k').kind, 'gerar-novo-quiz');
  });

  it('NO-OP por referência fora de "explicando" (dominado, sem resposta, explicação já registrada)', () => {
    const emExplicando = estadoEmExplicando();
    const input = { question: 'Q', chosenOption: 'op0', explanation: 'e' };
    const dominado = submitQuizAnswer(createTrackLessonState(), 'k', 1, 1);
    assert.equal(registerQuizExplanation(dominado, 'k', input), dominado);
    const semResposta = createTrackLessonState();
    assert.equal(registerQuizExplanation(semResposta, 'k', input), semResposta);
    const jaRegistrada = registerQuizExplanation(emExplicando, 'k', input);
    assert.equal(registerQuizExplanation(jaRegistrada, 'k', input), jaRegistrada);
    assert.equal(registerQuizExplanation(emExplicando, 'chave-inexistente', input), emExplicando);
  });
});

describe('injectRemediationQuiz — geração N+1 com a identidade reescrita', () => {
  function emNovoQuizPendente(): TrackLessonUiState {
    let s = submitQuizAnswer(createTrackLessonState(), 'k', 0, 1, 1);
    s = registerQuizExplanation(s, 'k', { question: 'Q', chosenOption: 'op0', explanation: 'e' });
    return s;
  }

  it('geração +1, card zerado, id `<chave>#g<N+1>`, tentativas e explicação PRESERVADAS', () => {
    const antes = emNovoQuizPendente();
    const s = injectRemediationQuiz(antes, 'k', assertion({ id: 'id-da-llm', question: 'Q2' }));
    const q = s.quizBySection['k'];
    assert.equal(q.generation, 1);
    assert.equal(q.answered, false);
    assert.equal(q.stage, 'aguardando-resposta');
    assert.equal(q.remediation?.id, 'k#g1', 'a LLM não escolhe a identidade do estado');
    assert.equal(q.remediation?.question, 'Q2');
    assert.equal(q.attempts?.length, 1, 'o rastro do erro não é apagado');
    assert.equal(q.explanation, antes.quizBySection['k'].explanation);
  });

  it('aceita também o caminho de degradação a partir de "explicando" (IA falhou no meio)', () => {
    const emExplicando = submitQuizAnswer(createTrackLessonState(), 'k', 0, 1);
    const s = injectRemediationQuiz(emExplicando, 'k', assertion());
    assert.equal(s.quizBySection['k'].generation, 1);
    assert.equal(s.quizBySection['k'].stage, 'aguardando-resposta');
  });

  it('NO-OP em "aguardando-resposta" e "dominado"', () => {
    const aguardando = createTrackLessonState();
    assert.equal(injectRemediationQuiz(aguardando, 'k', assertion()), aguardando);
    const dominado = submitQuizAnswer(createTrackLessonState(), 'k', 1, 1);
    assert.equal(injectRemediationQuiz(dominado, 'k', assertion()), dominado);
  });
});

describe('canReopenStalledQuiz / reopenStalledQuiz — a saída do ciclo travado', () => {
  function travadoEm(stage: 'explicando' | 'novo-quiz-pendente'): TrackLessonUiState {
    let s = submitQuizAnswer(createTrackLessonState(), 'k', 0, 1);
    if (stage === 'novo-quiz-pendente') {
      s = registerQuizExplanation(s, 'k', { question: 'Q', chosenOption: 'op0', explanation: 'e' });
    }
    return s;
  }

  it('só com o canal CAÍDO e o ciclo em "explicando" ou "novo-quiz-pendente"', () => {
    assert.equal(canReopenStalledQuiz(travadoEm('explicando').quizBySection['k'], true), true);
    assert.equal(canReopenStalledQuiz(travadoEm('novo-quiz-pendente').quizBySection['k'], true), true);
    assert.equal(canReopenStalledQuiz(travadoEm('explicando').quizBySection['k'], false), false, 'canal de pé não reabre');
    assert.equal(canReopenStalledQuiz(undefined, true), false, 'sem resposta não há o que reabrir');
    const dominado = submitQuizAnswer(createTrackLessonState(), 'k', 1, 1).quizBySection['k'];
    assert.equal(canReopenStalledQuiz(dominado, true), false, 'dominado nunca reabre');
  });

  it('a reabertura NÃO dispensa o gate: o estado resultante é "aguardando-resposta", nunca "dominado"', () => {
    const s = reopenStalledQuiz(travadoEm('explicando'), 'k', assertion(), true);
    assert.equal(s.quizBySection['k'].stage, 'aguardando-resposta');
    assert.equal(isQuizMastered(s, 'k'), false);
    assert.equal(s.quizBySection['k'].generation, 1);
    assert.equal(s.quizBySection['k'].attempts?.length, 1, 'a contagem de recorrência continua honesta');
    assert.equal(s.quizBySection['k'].remediation?.id, 'k#g1');
  });

  it('sem channelFailed a transição é no-op por referência (não vira botão de pular quiz)', () => {
    const travado = travadoEm('explicando');
    assert.equal(reopenStalledQuiz(travado, 'k', assertion(), false), travado);
  });
});

describe('optionVisualState / optionVisualStateForGeneration — a resposta NÃO vaza', () => {
  /** Um `answerIndex` que EXPLODE se for lido — a prova do invariante sagrado. */
  function answerIndexQueExplora(): { answerIndex: number } {
    const o: { answerIndex?: number } = {};
    Object.defineProperty(o, 'answerIndex', {
      get() {
        throw new Error('BUG de vazamento: answerIndex foi lido antes de responder');
      },
      enumerable: true,
    });
    return o as { answerIndex: number };
  }

  it('NÃO RESPONDIDO: todas as opções nascem iguais e NEUTRAS — answerIndex nem é lido', () => {
    const neutro = { color: 'inherit', variant: 'outlined', icon: null, disabled: false };
    for (const i of [0, 1, 2, 3]) {
      assert.deepEqual(optionVisualState(i, answerIndexQueExplora(), undefined), neutro);
      const quizNaoRespondido = { answered: false, selected: null, correct: null };
      assert.deepEqual(optionVisualState(i, answerIndexQueExplora(), quizNaoRespondido), neutro);
    }
  });

  it('RESPONDIDO: a certa fica verde/contained; o pick errado, vermelho; o resto, neutro — tudo travado', () => {
    const assertion2 = { answerIndex: 1 };
    const quiz = { answered: true, selected: 0, correct: false };
    assert.deepEqual(optionVisualState(1, assertion2, quiz), {
      color: 'success',
      variant: 'contained',
      icon: 'correct',
      disabled: true,
    });
    assert.deepEqual(optionVisualState(0, assertion2, quiz), {
      color: 'error',
      variant: 'outlined',
      icon: 'wrong',
      disabled: true,
    });
    assert.deepEqual(optionVisualState(2, assertion2, quiz), {
      color: 'inherit',
      variant: 'outlined',
      icon: null,
      disabled: true,
    });
  });

  it('acerto: a certa verde e NENHUMA vermelha (não há pick errado)', () => {
    const quiz = { answered: true, selected: 1, correct: true };
    const certa = optionVisualState(1, { answerIndex: 1 }, quiz);
    assert.equal(certa.color, 'success');
    assert.equal(optionVisualState(0, { answerIndex: 1 }, quiz).color, 'inherit');
  });

  it('POR GERAÇÃO: sem tentativa naquela geração → neutro (answerIndex não lido); a geração antiga mantém o próprio feedback', () => {
    const quiz = {
      answered: false,
      selected: null,
      correct: null,
      generation: 1,
      attempts: [{ generation: 0, selected: 0, correct: false, ts: 1 }],
    };
    // geração corrente (1) ainda sem resposta: nada revela a resposta.
    for (const i of [0, 1]) {
      assert.deepEqual(optionVisualStateForGeneration(i, answerIndexQueExplora(), quiz, 1), {
        color: 'inherit',
        variant: 'outlined',
        icon: null,
        disabled: false,
      });
    }
    // geração 0 (antiga): o erro do aluno continua visível junto da resposta certa.
    assert.equal(optionVisualStateForGeneration(0, { answerIndex: 1 }, quiz, 0).icon, 'wrong');
    assert.equal(optionVisualStateForGeneration(1, { answerIndex: 1 }, quiz, 0).icon, 'correct');
    assert.equal(optionVisualStateForGeneration(0, { answerIndex: 1 }, quiz, 0).disabled, true);
  });
});

describe('resetQuiz — o escape hatch apaga a chave INTEIRA', () => {
  it('remove o ciclo todo (tentativas, explicação, remediador) e é no-op sem resposta', () => {
    let s = submitQuizAnswer(createTrackLessonState(), 'k', 0, 1);
    assert.ok(s.quizBySection['k']);
    s = resetQuiz(s, 'k');
    assert.equal('k' in s.quizBySection, false);
    const vazio = createTrackLessonState();
    assert.equal(resetQuiz(vazio, 'k'), vazio);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * 7. AGRUPAMENTO, ÂNCORAGEM E GATES "PRÓXIMO"/"CONCLUIR"
 * ══════════════════════════════════════════════════════════════════════════ */

describe('assertionsBySection / sectionPresentationIndexes / quizzesByMessageIndex', () => {
  it('assertionsBySection agrupa por seção e joga as sem sectionId em FALLBACK_QUIZ_SECTION', () => {
    const out = assertionsBySection([
      assertion({ id: 'a1', sectionId: 's1' }),
      assertion({ id: 'a2', sectionId: 's1' }),
      assertion({ id: 'a3' }),
    ]);
    assert.deepEqual(Object.keys(out).sort(), [FALLBACK_QUIZ_SECTION, 's1'].sort());
    assert.deepEqual(out['s1'].map((a) => a.id), ['a1', 'a2']);
    assert.deepEqual(out[FALLBACK_QUIZ_SECTION].map((a) => a.id), ['a3']);
  });

  it('a âncora é a bolha que APRESENTOU a seção (a pergunta semeada pós-review não conta)', () => {
    const s = stateWith(
      [
        bubble({ content: 'seção 1', ts: 1 }), // 0
        bubble({ kind: 'review', content: 'rev', ts: 2 }), // 1
        bubble({ content: 'pergunta semeada', ts: 3 }), // 2 — não é apresentação
        bubble({ content: 'seção 2', ts: 4 }), // 3
      ],
      ['s1', 's2'],
    );
    const map = sectionPresentationIndexes(s);
    assert.equal(map.get('s1'), 0);
    assert.equal(map.get('s2'), 3);
  });

  it('seção SEM bolha (next com mensagem vazia) ancora no FIM do histórico; histórico vazio → -1', () => {
    const s = stateWith([bubble({ content: 'seção 1', ts: 1 })], ['s1', 's2', 's3']);
    const map = sectionPresentationIndexes(s);
    assert.equal(map.get('s1'), 0);
    assert.equal(map.get('s2'), 0, 'histórico de 1 bolha → índice length-1 = 0');
    assert.equal(map.get('s3'), 0);
    const vazia = stateWith([], ['sX']);
    assert.equal(sectionPresentationIndexes(vazia).get('sX'), -1);
  });

  it('quizzesByMessageIndex ancora cada quiz na bolha da sua seção; fallback vai para a ÚLTIMA seção', () => {
    const s = stateWith(
      [
        bubble({ content: 'seção 1', ts: 1 }), // 0
        bubble({ content: 'seção 2', ts: 2 }), // 1
      ],
      ['s1', 's2'],
    );
    const out = quizzesByMessageIndex(s, [
      assertion({ id: 'a1', sectionId: 's1' }),
      assertion({ id: 'a2', sectionId: 's2' }),
      assertion({ id: 'a3' }), // fallback → bolha da última seção apresentada
    ]);
    assert.deepEqual(out.get(0)?.map((a) => a.id), ['a1']);
    assert.deepEqual(out.get(1)?.map((a) => a.id), ['a2', 'a3']);
    assert.equal(out.size, 2);
  });

  it('sem seção apresentada ainda, nem o quiz aparece (nada no mapa)', () => {
    const out = quizzesByMessageIndex(createTrackLessonState(), [assertion()]);
    assert.equal(out.size, 0);
  });
});

describe('pendingQuizzes / pendingQuizzesForCurrentSection / isNextSectionBlockedByQuiz', () => {
  function comDuasSecoes(): TrackLessonUiState {
    return stateWith(
      [bubble({ content: 'seção 1', ts: 1 }), bubble({ content: 'seção 2', ts: 2 })],
      ['s1', 's2'],
    );
  }
  const a1 = assertion({ id: 'a1', sectionId: 's1' });
  const a2 = assertion({ id: 'a2', sectionId: 's2' });

  it('pendente = visível E sem ACERTO (errado continua pendente; acertado sai)', () => {
    let s = comDuasSecoes();
    assert.deepEqual(pendingQuizzes(s, [a1, a2]).map((a) => a.id), ['a1', 'a2']);
    s = submitQuizAnswer(s, quizKeyFor(a1), 0, 1); // ERRO no a1
    assert.deepEqual(pendingQuizzes(s, [a1, a2]).map((a) => a.id), ['a1', 'a2'], 'erro não libera');
    s = submitQuizAnswer(s, quizKeyFor(a1), 1, 1); // não adianta: mesma geração é no-op
    s = submitQuizAnswer(s, quizKeyFor(a2), 2, 2); // ACERTO no a2
    assert.deepEqual(pendingQuizzes(s, [a1, a2]).map((a) => a.id), ['a1']);
  });

  it('a ordem é determinística: pela ordem das bolhas do histórico', () => {
    const s = comDuasSecoes();
    assert.deepEqual(pendingQuizzes(s, [a2, a1]).map((a) => a.id), ['a1', 'a2'], 'a ordem da lista não manda');
  });

  it('o gate do "Próximo" olha SÓ a seção atual (a última apresentada)', () => {
    let s = comDuasSecoes();
    assert.deepEqual(pendingQuizzesForCurrentSection(s, [a1, a2]).map((a) => a.id), ['a2']);
    assert.equal(isNextSectionBlockedByQuiz(s, [a1, a2]), true);
    s = submitQuizAnswer(s, quizKeyKey(a2), 2, 2);
    assert.equal(isNextSectionBlockedByQuiz(s, [a1, a2]), false, 'a seção atual liberou (a1 é de trás)');
    assert.deepEqual(pendingQuizzesForCurrentSection(s, [a1, a2]), []);
  });

  it('sem seção apresentada o gate do "Próximo" está aberto (lista vazia)', () => {
    const s = createTrackLessonState();
    assert.deepEqual(pendingQuizzesForCurrentSection(s, [a1]), []);
    assert.equal(isNextSectionBlockedByQuiz(s, [a1]), false);
  });
});

/** Chave canônica da assertion — o mesmo quizKeyFor, curto para os gates. */
function quizKeyKey(a: Pick<TrackAssertionDto, 'id' | 'sectionId'>): string {
  return quizKeyFor(a);
}

describe('visibleQuizFor — o ÚNICO ponto de entrada da view', () => {
  it('sem remediador devolve a assertion AUTORAL e a chave dela', () => {
    const autoral = assertion({ id: 'a1', sectionId: 's1' });
    const v = visibleQuizFor(createTrackLessonState(), autoral);
    assert.equal(v.key, `s1${QUIZ_KEY_SEPARATOR}a1`);
    assert.equal(v.assertion, autoral);
    assert.equal(v.generation, 0);
    assert.deepEqual(v.step, { kind: 'aguardar-resposta', generation: 0 });
  });

  it('com remediador devolve a assertion da geração corrente — mas a MESMA chave', () => {
    const autoral = assertion({ id: 'a1', sectionId: 's1' });
    let s = submitQuizAnswer(createTrackLessonState(), visibleQuizFor(createTrackLessonState(), autoral).key, 0, 1);
    s = registerQuizExplanation(s, visibleQuizFor(s, autoral).key, {
      question: 'Q',
      chosenOption: 'op0',
      explanation: 'e',
    });
    s = injectRemediationQuiz(s, visibleQuizFor(s, autoral).key, assertion({ id: 'llm', question: 'nova' }));
    const v = visibleQuizFor(s, autoral);
    assert.equal(v.key, `s1${QUIZ_KEY_SEPARATOR}a1`, 'responder o remediador fecha a chave ANTIGA');
    assert.equal(v.assertion.question, 'nova');
    assert.equal(v.generation, 1);
    assert.deepEqual(v.step, { kind: 'aguardar-resposta', generation: 1 });
  });

  it('quizStepOf/nextQuizStep traduzem cada stage para a instrução do passo seguinte', () => {
    assert.deepEqual(quizStepOf(undefined), { kind: 'aguardar-resposta', generation: 0 });
    const errado = submitQuizAnswer(createTrackLessonState(), 'k', 0, 1, 9);
    assert.deepEqual(nextQuizStep(errado, 'k'), { kind: 'explicar-erro', generation: 0, selected: 0 });
    const comExplicacao = registerQuizExplanation(errado, 'k', {
      question: 'Q',
      chosenOption: 'op0',
      explanation: 'e',
    });
    assert.deepEqual(nextQuizStep(comExplicacao, 'k'), { kind: 'gerar-novo-quiz', generation: 0 });
    const certo = submitQuizAnswer(createTrackLessonState(), 'k', 3, 3);
    assert.deepEqual(nextQuizStep(certo, 'k'), { kind: 'dominado', generation: 0 });
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * 8. HIDRATAÇÃO DO BANCO (track:quiz-history)
 * ══════════════════════════════════════════════════════════════════════════ */

describe('hydrateQuizFromHistory — o ciclo sobrevive ao fechamento do app', () => {
  const KEY = 'as-tres-partes::print-mostra';

  it('ACERTO no banco → "dominado", na geração em que o acerto aconteceu', () => {
    const s = hydrateQuizFromHistory(createTrackLessonState(), [
      attemptRow({ assertionId: 'print-mostra', selectedIndex: 1, correct: true }),
    ], []);
    assert.equal(s.quizBySection[KEY].stage, 'dominado');
    assert.equal(s.quizBySection[KEY].generation, 0);
    assert.equal(isQuizMastered(s, KEY), true);
  });

  it('sem acerto + remediação da geração seguinte COM quiz → volta zerado na geração nova', () => {
    const s = hydrateQuizFromHistory(createTrackLessonState(), [
      attemptRow({ selectedIndex: 0, correct: false }),
    ], [
      remediationRow({ generation: 1, quiz: quizRemedial({ id: 'qualquer' }) }),
    ]);
    const q = s.quizBySection[KEY];
    assert.equal(q.stage, 'aguardando-resposta');
    assert.equal(q.generation, 1);
    assert.equal(q.answered, false);
    assert.equal(q.remediation?.id, `${KEY}#g1`, 'a id volta à forma canônica do estado');
  });

  it('remediação com quiz CORROMPIDO (null) → "novo-quiz-pendente" (a explicação já foi lida)', () => {
    const s = hydrateQuizFromHistory(createTrackLessonState(), [
      attemptRow({ selectedIndex: 0, correct: false }),
    ], [
      remediationRow({ generation: 1, quiz: null }),
    ]);
    assert.equal(s.quizBySection[KEY].stage, 'novo-quiz-pendente');
  });

  it('erro SEM remediação nenhuma → o ciclo REABRE em "explicando"', () => {
    const s = hydrateQuizFromHistory(createTrackLessonState(), [
      attemptRow({ selectedIndex: 0, correct: false }),
    ], []);
    assert.equal(s.quizBySection[KEY].stage, 'explicando');
    assert.equal(isQuizMastered(s, KEY), false);
  });

  it('a geração da tentativa vem da id (sufixo #gN); sem sufixo é a geração 0', () => {
    const s = hydrateQuizFromHistory(createTrackLessonState(), [
      attemptRow({ assertionId: 'print-mostra', selectedIndex: 0, correct: false }),
      attemptRow({ assertionId: `${KEY}#g2`, selectedIndex: 2, correct: false, attemptNo: 2 }),
    ], []);
    assert.deepEqual(quizAttempts(s, KEY).map((a) => a.generation), [0, 2]);
  });

  it('o timestamp vem do createdAt do banco; data ilegível vira 0', () => {
    const bom = Date.parse('2026-07-15T12:00:00.000Z');
    const s = hydrateQuizFromHistory(createTrackLessonState(), [
      attemptRow({ createdAt: '2026-07-15T12:00:00.000Z', correct: true }),
      attemptRow({ createdAt: 'data inválida', correct: true, sectionKey: 'outra::a' }),
    ], []);
    assert.equal(quizAttempts(s, KEY)[0]?.ts, bom);
    assert.equal(quizAttempts(s, 'outra::a')[0]?.ts, 0);
  });

  it('PRECEDÊNCIA: a SESSÃO vence o banco chave a chave (o banco só preenche o que falta)', () => {
    const daSessao = submitQuizAnswer(createTrackLessonState(), KEY, 3, 3, 1);
    const s = hydrateQuizFromHistory(daSessao, [
      attemptRow({ selectedIndex: 0, correct: false }),
    ], []);
    assert.equal(s.quizBySection[KEY], daSessao.quizBySection[KEY], 'a resposta da sessão não é sobrescrita');
    assert.equal(isQuizMastered(s, KEY), true);
  });

  it('linhas CORROMPIDAS são descartadas sem derrubar o resto (null, sem chave, selectedIndex negativo)', () => {
    const lixo = [
      null,
      'string não é linha',
      attemptRow({ sectionKey: '' }),
      attemptRow({ assertionId: '' }),
      attemptRow({ sectionKey: 'valida::a', assertionId: 'a', selectedIndex: -1 }),
      attemptRow({ sectionKey: 'valida::a', assertionId: 'a', selectedIndex: 0, correct: true }),
    ] as unknown as QuizAttemptDto[];
    const s = hydrateQuizFromHistory(createTrackLessonState(), lixo, []);
    assert.deepEqual(Object.keys(s.quizBySection), ['valida::a']);
  });

  it('remediação ÓRFÃ (sem tentativa correspondente) é IGNORADA — a chave nasce das tentativas', () => {
    const s = hydrateQuizFromHistory(createTrackLessonState(), [], [
      remediationRow({ sectionKey: 'orfao::a' }),
    ]);
    assert.deepEqual(s.quizBySection, {});
    const base = createTrackLessonState();
    assert.equal(hydrateQuizFromHistory(base, [], []), base, 'sem nada a acrescentar → MESMO estado');
  });

  it('remediação com generation inválida (0, negativa, não inteira) não entra no índice', () => {
    const s = hydrateQuizFromHistory(createTrackLessonState(), [
      attemptRow({ selectedIndex: 0, correct: false }),
    ], [
      remediationRow({ generation: 0, quiz: quizRemedial() }),
      remediationRow({ generation: -1, quiz: quizRemedial() }),
      remediationRow({ generation: 1.5, quiz: quizRemedial() }),
    ]);
    assert.equal(s.quizBySection[KEY].stage, 'explicando', 'sem remediação válida → ciclo em "explicando"');
  });

  it('a linha MAIS NOVA de uma mesma (chave, geração) vence', () => {
    const s = hydrateQuizFromHistory(createTrackLessonState(), [
      attemptRow({ selectedIndex: 0, correct: false }),
    ], [
      remediationRow({ generation: 1, quiz: quizRemedial({ question: 'antiga' }), explanation: '' }),
      remediationRow({ generation: 1, quiz: quizRemedial({ question: 'nova' }), explanation: 'lida' }),
    ]);
    assert.equal(s.quizBySection[KEY].remediation?.question, 'nova');
    assert.equal(s.quizBySection[KEY].explanation, 'lida');
  });

  it('a hidratação NÃO devolve as bolhas de explicação ao histórico (a conversa é de sessão)', () => {
    const s = hydrateQuizFromHistory(createTrackLessonState(), [
      attemptRow({ selectedIndex: 0, correct: false }),
    ], [
      remediationRow({ generation: 1, quiz: null, explanation: 'explicação antiga' }),
    ]);
    assert.deepEqual(s.history, []);
    assert.equal(s.quizBySection[KEY].explanation, 'explicação antiga', 'o texto vive no ciclo, não no chat');
  });
});
