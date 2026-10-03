/**
 * src/storybook/fixtures.lesson.ts — fixtures da AULA (LessonView) para as
 * histórias `Vistas/LessonView` e `Componentes/Aula/*`.
 *
 * Dados REALISTAS (pt-BR, uma aula do curso "Python do zero") com os tipos
 * REAIS do contrato (`shared/ipc-contract`) e do chat (`lib/trackLessonState`).
 * Regras:
 *   - só DADOS — zero render, zero lógica de produto;
 *   - os replies prontos (`lessonTutorReply*`, `lessonQuiz*Reply`,
 *     `lessonDoneReply`, `lessonRegenerateReply`) são a forma exata que os
 *     overrides de `installMockApi({ track: … })` devolvem, para as stories
 *     não repetirem envelopes;
 *   - `lessonChatOngoing` é um `TrackLessonUiState` pronto a semear o cache de
 *     sessão (`saveLessonChat`) — é assim que `Vistas/LessonView` mostra a
 *     aula EM CURSO sem tocar em IPC.
 */
import type {
  QuizExplainReply,
  QuizHistoryReply,
  QuizRemedialReply,
  QuizAttemptReply,
  TrackAssertionDto,
  TrackChallengeSpec,
  TrackChallengeSummaryDto,
  TrackLessonDoneResult,
  TrackLessonPayload,
  TrackRegenerateResult,
  TrackSourceLinkDto,
  TrackTheorySectionDto,
  TutorReply,
} from '../../shared/ipc-contract';
import type { QuizState, TrackLessonUiState, TutorChatMessage } from '../lib/trackLessonState';

/** As secções de teoria — prosa + código + fórmula KaTeX inline. */
export const lessonTheorySections: TrackTheorySectionDto[] = [
  {
    id: 'uma-linha-e-so',
    title: 'Uma linha, e só',
    markdown:
      'Programar é escrever ordens que o computador segue, uma por linha, de cima para baixo.\n\n' +
      'A ordem mais simples de todas é o `print`: ela escreve na tela o que você mandar.\n\n' +
      '```python\nprint("bom dia")\n```\n\n' +
      'Rodou, apareceu. A conta $1 + 2$ também sai na tela se você pedir.',
    code: { language: 'python', code: 'print("bom dia")', explanation: 'A linha que escreve na tela.' },
  },
  {
    id: 'as-tres-partes',
    title: 'As três partes da linha',
    markdown:
      'Toda linha de comando tem três partes: quem age (`print`), o que age (as aspas com o texto) e o fim da linha.\n\n' +
      '```python\nprint("bom dia")\nprint("boa tarde")\n```\n\n' +
      'Duas linhas, duas ordens, duas respostas na tela — na ordem escrita.',
  },
];

/** Os quizzes da aula — ancorados por secção (`sectionId`). */
export const lessonAssertions: TrackAssertionDto[] = [
  {
    id: 'print-mostra-na-tela',
    statement: 'print mostra na tela o que estiver entre as aspas.',
    question: 'O que aparece na tela quando se roda print("bom dia")?',
    options: ['bom dia', 'print', 'nada', 'uma linha em branco'],
    answerIndex: 0,
    feedback: 'O que está entre as aspas é o que aparece.',
    sectionId: 'uma-linha-e-so',
    optionRationales: [
      'Certíssimo: o print escreve exatamente o que está entre as aspas.',
      'print é o nome do comando, não o que ele escreve.',
      'Aparece sim — o print existe para isso.',
      'Só ficaria em branco se as aspas estivessem vazias.',
    ],
  },
  {
    id: 'uma-linha-por-ordem',
    statement: 'O computador segue as linhas de cima para baixo.',
    question: 'Duas linhas print: qual é a ordem na tela?',
    options: ['da escrita, de cima para baixo', 'da direita para a esquerda', 'aleatória', 'só a última'],
    answerIndex: 0,
    feedback: 'O computador lê o programa de cima para baixo.',
    sectionId: 'as-tres-partes',
  },
];

/** As fontes da aula (o diálogo "Fontes" e o visualizador de embed). */
export const lessonSources: TrackSourceLinkDto[] = [
  {
    title: 'Documentação do Python — A tour of the language',
    url: 'https://docs.python.org/3/tutorial/index.html',
    description: 'A página oficial do tutorial do Python — a referência que o curso segue.',
  },
  {
    title: 'Wikipédia — Linguagem de programação',
    url: 'https://pt.wikipedia.org/wiki/Linguagem_de_programação',
    description: 'O que é uma linguagem de programação, em linguagem simples.',
  },
];

/** Os desafios da aula — um nunca tentado, um já passado. */
export const lessonChallenges: TrackChallengeSummaryDto[] = [
  {
    slug: 'mostre-seu-nome',
    title: 'Mostre o seu nome',
    concept: 'imprimir',
    difficulty: 1,
    lastVerdict: null,
    stars: 0,
    failedCount: 0,
    generated: false,
  },
  {
    slug: 'duas-linhas',
    title: 'Duas linhas, dois prints',
    concept: 'imprimir',
    difficulty: 1,
    lastVerdict: 'passed',
    stars: 3,
    failedCount: 1,
    generated: false,
  },
];

export const lessonChallengeUntried: TrackChallengeSummaryDto = lessonChallenges[0];
export const lessonChallengePassed: TrackChallengeSummaryDto = lessonChallenges[1];

/** A aula completa (track:lesson) — realista, com tudo o que a view desenha. */
export const lessonPayload: TrackLessonPayload = {
  slug: 'a-primeira-linha',
  moduleSlug: 'a-tela',
  trackTitle: 'Python do zero',
  title: 'A primeira linha',
  summary: 'Você escreve uma linha, manda rodar, e ela aparece na tela.',
  difficulty: 1,
  concepts: ['imprimir'],
  prerequisites: [
    { slug: 'o-que-e-um-computador', title: 'O que é um computador' },
    { slug: 'abrir-o-terminal', title: 'Abrir o terminal' },
  ],
  theory: lessonTheorySections,
  assertions: lessonAssertions,
  sources: lessonSources,
  challenges: lessonChallenges,
  locked: false,
  done: false,
  nextLesson: { slug: 'as-tres-partes', title: 'As três partes da linha' },
};

/** A mesma aula, com a teoria CONCLUÍDA e desafio pendente (passo 'desafio'). */
export const lessonPayloadTheoryDone: TrackLessonPayload = {
  ...lessonPayload,
  challenges: [
    { ...lessonChallengeUntried, lastVerdict: 'failed', failedCount: 1 },
    lessonChallengePassed,
  ],
};

/* ─── Mensagens do chat (TutorChatMessage) ────────────────────────────────── */

export const lessonMessageTheory: TutorChatMessage = {
  role: 'assistant',
  kind: 'message',
  content:
    'Programar é escrever ordens que o computador segue, uma por linha, de cima para baixo.\n\n' +
    'A ordem mais simples é o `print`:\n\n```python\nprint("bom dia")\n```\n\n' +
    'A conta $1 + 2$ também sai na tela se você pedir.',
  ts: 1_770_000_000_000,
};

export const lessonMessageUser: TutorChatMessage = {
  role: 'user',
  kind: 'message',
  content: 'E se eu escrever duas linhas? Elas aparecem as duas?',
  ts: 1_770_000_060_000,
};

export const lessonMessageReply: TutorChatMessage = {
  role: 'assistant',
  kind: 'reply',
  content: 'Aparecem as duas, na ordem que você escreveu — de cima para baixo.',
  ts: 1_770_000_070_000,
};

export const lessonMessageReviewError: TutorChatMessage = {
  role: 'assistant',
  kind: 'review',
  content:
    '**O que passou**\n\n- [x] O teste roda\n- [ ] O teste passa\n\n**Saída**\n\n```\nAssertionError: esperava "bom dia"\n```\n\n' +
    'Veja o que aconteceu e tente de novo.',
  ts: 1_770_000_300_000,
  errorFor: 'mostre-seu-nome',
  errorBeforeLesson: true,
};

export const lessonMessageQuizExplanation: TutorChatMessage = {
  role: 'assistant',
  kind: 'quiz-explanation',
  content: '**O que você escolheu:** nada\n\n**O que acontece:** o print escreve o que estiver entre as aspas.',
  ts: 1_770_000_400_000,
};

/* ─── Estados de quiz (QuizState) ─────────────────────────────────────────── */

export const lessonQuizStateUnanswered: QuizState = {
  answered: false,
  selected: null,
  correct: null,
};

export const lessonQuizStateCorrect: QuizState = {
  answered: true,
  selected: 0,
  correct: true,
  stage: 'dominado',
  generation: 0,
};

export const lessonQuizStateWrong: QuizState = {
  answered: true,
  selected: 1,
  correct: false,
  stage: 'explicando',
  generation: 0,
  explanation: 'O print escreve o que está entre as aspas — não o nome do comando.',
};

/** Chat EM CURSO pronto a semear o cache (`saveLessonChat`): seção 1 vista. */
export const lessonChatOngoing: TrackLessonUiState = {
  presentedSections: ['uma-linha-e-so'],
  history: [lessonMessageTheory, lessonMessageUser, lessonMessageReply],
  theoryDone: false,
  lastError: null,
  challengeError: null,
  quizBySection: {},
};

/** Chat com a teoria CONCLUÍDA e os quizzes dominados (passo 'desafio'). */
export const lessonChatTheoryDone: TrackLessonUiState = {
  presentedSections: ['uma-linha-e-so', 'as-tres-partes'],
  history: [lessonMessageTheory, lessonMessageQuizExplanation],
  theoryDone: true,
  lastError: null,
  challengeError: null,
  quizBySection: {
    'uma-linha-e-so::print-mostra-na-tela': lessonQuizStateCorrect,
    'as-tres-partes::uma-linha-por-ordem': lessonQuizStateCorrect,
  },
};

/* ─── Replies prontos para os overrides de `installMockApi` ───────────────── */

export const lessonTutorReplyNext: TutorReply = {
  ok: true,
  message: lessonMessageTheory.content,
  sectionId: 'uma-linha-e-so',
  sectionTitle: 'Uma linha, e só',
  done: false,
};

export const lessonTutorReplyAnswer: TutorReply = {
  ok: true,
  message: 'Aparecem as duas, na ordem que você escreveu — de cima para baixo.',
  sectionId: null,
  done: false,
};

export const lessonDoneReply: TrackLessonDoneResult = { ok: true };

export const lessonQuizAttemptReply: QuizAttemptReply = {
  ok: true,
  attempt: {
    trackSlug: 'python-do-zero',
    lessonId: 'a-primeira-linha',
    sectionKey: 'uma-linha-e-so::print-mostra-na-tela',
    assertionId: 'print-mostra-na-tela',
    selectedIndex: 0,
    correct: true,
    attemptNo: 1,
    quizOrigin: 'authored',
    createdAt: '2026-10-03T10:00:00.000Z',
  },
  mastery: [],
};

export const lessonQuizExplainReply: QuizExplainReply = {
  ok: true,
  explanation: 'O print escreve o que está entre as aspas — o nome do comando não vai para a tela.',
};

export const lessonQuizRemedialReply: QuizRemedialReply = {
  ok: true,
  quiz: {
    id: 'remedial-1-print',
    statement: 'print escreve o que estiver entre as aspas.',
    question: 'O que print("boa noite") escreve?',
    options: ['boa noite', 'print', 'nada', 'erro'],
    answerIndex: 0,
    feedback: 'É sempre o que está entre as aspas.',
    sectionId: 'uma-linha-e-so',
    originAssertionId: 'print-mostra-na-tela',
    generation: 1,
  },
};

export const lessonQuizHistoryReply: QuizHistoryReply = {
  ok: true,
  attempts: [],
  remediations: [],
  mastery: [],
};

export const lessonRegenerateReply: TrackRegenerateResult = {
  ok: true,
  challenge: {
    slug: 'diga-ola',
    title: 'Diga olá',
    concept: 'imprimir',
    difficulty: 1,
    statement: 'Escreva um programa que diga olá na tela.',
    starterCode: 'print("olá")\n',
    expectedTestCount: 1,
    minFirstStarMs: 30_000,
    timeLimitMs: 600_000,
    source: 'generated',
    lastVerdict: null,
    stars: 0,
    failedCount: 0,
  } satisfies TrackChallengeSpec,
  failedContext: [],
};
