/**
 * Vistas/LessonView — a AULA em modo chat, a view COMPLETA com API falsa
 * realista (installMockApi) e os ESTADOS REAIS do fluxo.
 *
 * Cada história semeia o que o app semearia em produção:
 *   - ALVO da aula: `saveLastLesson` + `saveLessonChat` (o efeito de montagem
 *     da view restaura exatamente isto — a 3ª precedência da entrada);
 *   - CONTEÚDO: `installMockApi({ track: … })` com os replies de
 *     `storybook/fixtures.lesson.ts` (track.lesson/lessonDone/tutorChat e os
 *     canais de quiz + challengeRegenerate);
 *   - FASE do overlay do quiz: `openQuizOverlay`/`minimizeQuizOverlay` (a
 *     máquina de módulo que a view consome — sem props);
 *   - CANAL de progresso: `emitMockEvent('study', 'onLessonProgress', …)`
 *     — o push main→renderer da geração de aula (fases pesquisa/autorando).
 *
 * Os stores de módulo são re-semeados em cada loader (nada vaza entre
 * histórias) e os decorators partilhados (shellDecorators) montam os contextos
 * do shell + o slot da coluna — o cabeçalho publicado aparece à direita.
 */
import type { Meta, StoryObj } from '@storybook/react';
import type { ReactElement } from 'react';
import { LessonView } from './LessonView';
import GlobalBusyIndicator from '../../components/shell/GlobalBusyIndicator';
import { SessionSeed, shellDecorators } from '../../storybook/decorators';
import {
  emitMockEvent,
  installMockApi,
  type MockApiOverrides,
} from '../../storybook/mockApi';
import {
  lessonChatOngoing,
  lessonChatTheoryDone,
  lessonDoneReply,
  lessonPayload,
  lessonPayloadTheoryDone,
  lessonQuizAttemptReply,
  lessonQuizExplainReply,
  lessonQuizHistoryReply,
  lessonQuizRemedialReply,
  lessonRegenerateReply,
  lessonTutorReplyNext,
  lessonAssertions,
} from '../../storybook/fixtures.lesson';
import {
  minimizeQuizOverlay,
  openQuizOverlay,
  __resetQuizOverlayForTests,
} from '../../lib/quizOverlayState';
import { overlayContextFor } from '../../components/quiz/quizOverlayBridge';
import { visibleQuizFor, type TrackLessonUiState } from '../../lib/trackLessonState';
import { saveLastLesson, __resetLastLessonForTests } from '../../lib/lastLesson';
import { saveLessonChat, __resetLessonChatForTests } from '../../lib/lessonChatCache';

const TRACK_SLUG = 'python-do-zero';
const LESSON_ID = lessonPayload.slug;

/** Os 8 canais `track.*` que a view consome, com replies realistas. */
const trackOks: MockApiOverrides['track'] = {
  lesson: async () => ({ ok: true as const, lesson: lessonPayload }),
  lessonDone: async () => lessonDoneReply,
  tutorChat: async () => lessonTutorReplyNext,
  quizAttempt: async () => lessonQuizAttemptReply,
  quizExplain: async () => lessonQuizExplainReply,
  quizHistory: async () => lessonQuizHistoryReply,
  quizRemedial: async () => lessonQuizRemedialReply,
  challengeRegenerate: async () => lessonRegenerateReply,
};

/** Reseta os stores de módulo da área entre histórias. */
function resetLessonStores(): void {
  __resetLastLessonForTests();
  __resetLessonChatForTests();
  __resetQuizOverlayForTests();
}

/** Semeia o alvo da aula + o chat restaurado (como a montagem faria). */
function seedLesson(chat: TrackLessonUiState): void {
  resetLessonStores();
  saveLastLesson(TRACK_SLUG, LESSON_ID);
  saveLessonChat({ trackSlug: TRACK_SLUG, lessonId: LESSON_ID }, chat);
}

/** Semeia o quiz da seção 1 como EM CENA (sobre-a-tela ou minimizado). */
function seedQuizOverlay(phase: 'sobre-a-tela' | 'minimizado-no-chat'): void {
  const visible = visibleQuizFor(lessonChatOngoing, lessonAssertions[0]);
  openQuizOverlay(overlayContextFor(lessonAssertions[0], visible, 0));
  if (phase === 'minimizado-no-chat') minimizeQuizOverlay(visible.key);
}

const meta = {
  title: 'Vistas/LessonView',
  component: LessonView,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  decorators: shellDecorators({ sidebarSlot: true, canvas: { width: '100%', height: 620 } }),
  args: {
    onNavigate: (key: string) => console.debug('[storybook] onNavigate', key),
  },
} satisfies Meta<typeof LessonView>;

export default meta;
type Story = StoryObj<typeof meta>;

/* ─── 1. Sem aula selecionada — o estado vazio (o CTA leva à trilha) ─────── */

export const SemAulaSelecionada: Story = {
  loaders: [
    async () => {
      resetLessonStores();
      installMockApi({ track: trackOks });
      return {};
    },
  ],
};

/* ─── 2. Gerando aula — progresso push (pesquisa → autorando) ────────────── */

export const GerandoAula: Story = {
  loaders: [
    async () => {
      resetLessonStores();
      installMockApi({
        track: {
          ...trackOks,
          // A aula ainda não resolve: a tela mostra a espera com texto.
          lesson: () => new Promise(() => {}),
          quizHistory: () => new Promise(() => {}),
        },
      });
      // O canal push da geração: o main empurra as fases (o consumidor real é
      // `hooks/useLessonProgress`; aqui os eventos exercitam o canal).
      emitMockEvent('study', 'onLessonProgress', {
        phase: 'pesquisando',
        fraction: 0.35,
      } as never);
      emitMockEvent('study', 'onLessonProgress', {
        phase: 'autorando',
        fraction: 0.7,
      } as never);
      return {};
    },
  ],
  render: (args): ReactElement => (
    <SessionSeed
      patch={{
        subject: lessonPayload.title,
        status: 'running',
        phase: 'autorando',
        fraction: 0.7,
        busy: { reason: 'gerando' },
      }}
    >
      <GlobalBusyIndicator />
      <LessonView {...args} />
    </SessionSeed>
  ),
};

/* ─── 3. Aula em curso — prosa + código + KaTeX, conversa restaurada ────── */

export const AulaEmCurso: Story = {
  loaders: [
    async () => {
      seedLesson(lessonChatOngoing);
      installMockApi({ track: trackOks });
      return {};
    },
  ],
};

/* ─── 4. Quiz — minimizado na conversa e sobre a tela ────────────────────── */

export const QuizMinimizado: Story = {
  loaders: [
    async () => {
      seedLesson(lessonChatOngoing);
      installMockApi({ track: trackOks });
      seedQuizOverlay('minimizado-no-chat');
      return {};
    },
  ],
};

export const QuizSobreATela: Story = {
  loaders: [
    async () => {
      seedLesson(lessonChatOngoing);
      installMockApi({ track: trackOks });
      seedQuizOverlay('sobre-a-tela');
      return {};
    },
  ],
};

/* ─── 5. Desafio disponível / concluído (teoria acabou) ──────────────────── */

export const DesafioDisponível: Story = {
  loaders: [
    async () => {
      seedLesson(lessonChatTheoryDone);
      installMockApi({
        track: {
          ...trackOks,
          lesson: async () => ({ ok: true as const, lesson: lessonPayloadTheoryDone }),
        },
      });
      return {};
    },
  ],
};

export const DesafiosConcluídos: Story = {
  loaders: [
    async () => {
      seedLesson(lessonChatTheoryDone);
      installMockApi({
        track: {
          ...trackOks,
          lesson: async () => ({
            ok: true as const,
            lesson: {
              ...lessonPayloadTheoryDone,
              challenges: lessonPayloadTheoryDone.challenges.map((ch) => ({
                ...ch,
                lastVerdict: 'passed' as const,
                stars: 3,
              })),
            },
          }),
        },
      });
      return {};
    },
  ],
};

/* ─── 6. Erro de carregamento da aula — com "Tentar de novo" ─────────────── */

export const ErroDeGeraçãoComRetry: Story = {
  loaders: [
    async () => {
      seedLesson(lessonChatOngoing);
      installMockApi({
        track: {
          ...trackOks,
          lesson: async () => ({
            ok: false as const,
            error: 'persistência indisponível.',
          }),
        },
      });
      return {};
    },
  ],
};

/* ─── 7. Estado ocupado — o loader global do shell (busy) ────────────────── */

export const OcupadaNoShell: Story = {
  loaders: [
    async () => {
      seedLesson(lessonChatOngoing);
      installMockApi({ track: trackOks });
      return {};
    },
  ],
  render: (args): ReactElement => (
    <SessionSeed
      patch={{
        subject: lessonPayload.title,
        status: 'running',
        phase: 'pesquisando',
        fraction: 0.2,
        busy: { reason: 'digitando' },
      }}
    >
      <GlobalBusyIndicator />
      <LessonView {...args} />
    </SessionSeed>
  ),
};
