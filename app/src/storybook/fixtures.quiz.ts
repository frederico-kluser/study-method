/**
 * src/storybook/fixtures.quiz.ts — fixtures PRÓPRIAS do quiz/do modal de
 * desafios para as histórias do Storybook (a área components/quiz +
 * components/challenge).
 *
 * O que já existe em `./fixtures.ts` (partilhado — NÃO editar) é reutilizado:
 * `fixtureTrackAssertions` (as afirmações reais, com opções e racionais),
 * `fixtureQuizAttemptDto`/`fixtureRemedialQuiz` (o ciclo adaptativo). Este
 * módulo só acrescenta o que as histórias da área precisam e o partilhado não
 * tem:
 *
 *   - o CONTEXTO de seed do overlay (`openQuizOverlay`) — as três fases são
 *     montadas com ele;
 *   - o CONTEÚDO publicado (`publishQuizOverlayContent`) — incluindo os
 *     estados de resposta (por responder / certa / errada) que a view desenha;
 *   - a SEQUÊNCIA de eventos de progresso de regeneração
 *     (`track.onChallengeRegenerateProgress`) — uma por etapa real do
 *     `challengeGenerateStore` (generating/validating/executing/inserting +
 *     terminais done/error), para as histórias do `ChallengeGenerateModal`
 *     dispararem via `emitMockEvent`;
 *   - snapshots do `challengeGenerateStore` para as histórias da VIEW pura
 *     (`ChallengeGenerateView`) documentarem cada etapa sem tocar na loja.
 *
 * PURO (dados + builders com callbacks no-op): sem Electron, sem rede. Os
 * callbacks (`onSelect`/`onMinimize`/…) são no-ops — quem liga gestos é a
 * story (`fn()` do `storybook/test`).
 */
import type {
  TrackAssertionDto,
  TrackRegenerateProgressEvent,
} from '../../shared/ipc-contract';
import type { QuizOverlayContent, QuizOverlayStatus } from '../components/quiz/quizOverlayContent';
import type { QuizOverlayContext, QuizOverlayState } from '../lib/quizOverlayState';
import type { ChallengeGenerateState } from '../lib/challengeGenerateStore';
import type { QuizState } from '../lib/trackLessonState';
import { quizKeyFor } from '../lib/trackLessonState';
import { fixtureTrackAssertions } from './fixtures';

/* ─── Peças do quiz ──────────────────────────────────────────────────────── */

/** A afirmação canónica das histórias de quiz (a primeira das partilhadas). */
export const quizAssertion: TrackAssertionDto = fixtureTrackAssertions[0]!;

/** A chave canônica do quiz (`quizKeyFor` — nunca montada à mão). */
export const quizKey: string = quizKeyFor(quizAssertion);

/** O contexto de seed do overlay — o que `openQuizOverlay` recebe. */
export function quizOverlayContextFixture(
  overrides: Partial<QuizOverlayContext> = {},
): QuizOverlayContext {
  return {
    quizKey,
    assertionId: quizAssertion.id,
    generation: 0,
    sectionId: quizAssertion.sectionId ?? null,
    anchorIndex: 0,
    ...overrides,
  };
}

/**
 * O snapshot do `quizOverlayState` — o que a VIEW pura (`QuizOverlayView`)
 * recebe por props para desenhar cada fase sem tocar na loja.
 */
export function quizOverlayStateFixture(
  overrides: Partial<QuizOverlayState> = {},
): QuizOverlayState {
  return {
    phase: 'sobre-a-tela',
    quizKey,
    assertionId: quizAssertion.id,
    generation: 0,
    sectionId: quizAssertion.sectionId ?? null,
    anchorIndex: 0,
    minimizeCount: 0,
    ...overrides,
  };
}

/** Ainda por responder — as 4 opções ativas, nenhuma revelada. */
export const quizStateNaoRespondido: QuizState = {
  answered: false,
  selected: null,
  correct: null,
};

/** Respondida CERTA (a opção correta revelada; as demais travadas). */
export const quizStateCerta: QuizState = {
  answered: true,
  selected: quizAssertion.answerIndex,
  correct: true,
};

/** Respondida ERRADA (veredito diagnóstico — nunca repreensão). */
export const quizStateErrada: QuizState = {
  answered: true,
  selected: 0,
  correct: false,
};

/** Os estados de resposta que as histórias percorrem. */
export const quizEstadosResposta = {
  naoRespondido: quizStateNaoRespondido,
  certa: quizStateCerta,
  errada: quizStateErrada,
} as const;

/** O conteúdo publicado no overlay (`publishQuizOverlayContent`). */
export function quizOverlayContentFixture(
  overrides: Partial<QuizOverlayContent> = {},
): QuizOverlayContent {
  return {
    quizKey,
    assertion: quizAssertion,
    quiz: undefined,
    generation: 0,
    status: 'aguardando' satisfies QuizOverlayStatus,
    notice: null,
    onSelect: () => {},
    onMinimize: () => {},
    onRetry: null,
    onReopen: null,
    ...overrides,
  };
}

/* ─── Peças do modal de geração de desafios ──────────────────────────────── */

/** O contexto de geração que as views usam em `startChallengeGenerate`. */
export const challengeGenerateCtx = {
  trackSlug: 'python-iniciante',
  lessonId: 'a-primeira-linha',
  target: 'lesson',
} as const;

/** Snapshot do processo (para as histórias da VIEW pura — sem tocar na loja). */
export function challengeGenerateStateFixture(
  overrides: Partial<ChallengeGenerateState> = {},
): ChallengeGenerateState {
  return {
    status: 'running',
    stage: 0,
    generationId: 1,
    trackSlug: challengeGenerateCtx.trackSlug,
    lessonId: challengeGenerateCtx.lessonId,
    target: challengeGenerateCtx.target,
    challengeId: null,
    challengeTitle: null,
    errorMessage: null,
    listVersion: 0,
    ...overrides,
  };
}

/** O desafio novo que o 'done' anuncia (o "Ver desafio" navega para ele). */
export const challengeGenerateNovo = {
  slug: 'inventariar-os-modulos',
  title: 'Inventariar os módulos',
} as const;

/**
 * A SEQUÊNCIA real de progresso do main, uma entrada por MARCO do processo
 * (o mapeamento evento→etapa vive em `challengeGenerateStore`). É o que as
 * histórias do container disparam com
 * `emitMockEvent('track', 'onChallengeRegenerateProgress', …)`.
 */
export const challengeRegenerateProgressFlow: readonly TrackRegenerateProgressEvent[] = [
  { stage: 'generating', generationId: 1 },
  { stage: 'validating', generationId: 1 },
  { stage: 'executing', generationId: 1 },
  { stage: 'inserting', generationId: 1 },
  { stage: 'done', generationId: 1, challenge: challengeGenerateNovo },
];

/** O terminal de ERRO (o modal mostra a mensagem e oferece sair/recomeçar). */
export const challengeRegenerateError: TrackRegenerateProgressEvent = {
  stage: 'error',
  generationId: 1,
  error: 'O motor local parou antes de escrever os testes.',
};

/** Mensagem de erro sem detalhe (o fallback genérico entra no lugar). */
export const challengeRegenerateErrorSemMensagem: TrackRegenerateProgressEvent = {
  stage: 'error',
  generationId: 1,
};
