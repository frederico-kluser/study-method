/**
 * src/components/quiz/QuizOverlayHost.stories.tsx — Componentes/Quiz/QuizOverlayHost.
 *
 * O CONTAINER real do quiz sobre a tela — o mesmo que o App.tsx monta no
 * shell. Ao contrário da `QuizOverlayView` (props diretas), este não tem
 * props: a fase vive na LOJA DE MÓDULO (`src/lib/quizOverlayState.ts`, lida
 * por `useSyncExternalStore`) e o conteúdo é publicado pela view da aula
 * (`quizOverlayContent`). Estas histórias documentam o ciclo COMPLETO, com o
 * seed oficial do produto:
 *
 *   - SEMENTE: `openQuizOverlay(ctx)` + `publishQuizOverlayContent(content)` —
 *     o mesmo caminho do clique no botão "Responder" da conversa (ONDA11: o
 *     modal nunca sobe sozinho);
 *   - RESET entre histórias: `withResettableStores` (decorators partilhados)
 *     repõe a loja a cada montagem — o estado de uma história não vaza para a
 *     seguinte;
 *   - as saídas (Esc, backdrop, "Minimizar") MINIMIZAM: fechar o ciclo é
 *     decisão da maestria, nunca de uma tecla.
 */
import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';

import { QuizOverlayHost } from './QuizOverlayHost';
import { shellDecorators } from '../../storybook/decorators';
import {
  minimizeQuizOverlay,
  openQuizOverlay,
} from '../../lib/quizOverlayState';
import { publishQuizOverlayContent } from './quizOverlayContent';
import {
  quizKey,
  quizOverlayContentFixture,
  quizOverlayContextFixture,
  quizStateErrada,
} from '../../storybook/fixtures.quiz';

const meta = {
  title: 'Componentes/Quiz/QuizOverlayHost',
  component: QuizOverlayHost,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'O host montado PERMANENTEMENTE no shell (o estado sobrevive a trocas de aba). Cada história semeia a loja com `openQuizOverlay` — é o que o botão da conversa faz — e o decorator partilhado repõe a loja entre histórias.',
      },
    },
  },
  decorators: shellDecorators({ canvas: false }),
} satisfies Meta<typeof QuizOverlayHost>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Fechado: Story = {
  name: 'Fechado (nada em cena)',
  play: () => {
    // A loja já chega reposta pelo `withResettableStores`; publicar conteúdo
    // vazio fecha também o lado do conteúdo (a view da aula desmontou).
    publishQuizOverlayContent(null);
  },
};

export const SobreATela: Story = {
  name: 'Sobre a tela (o gesto abriu)',
  play: () => {
    publishQuizOverlayContent(quizOverlayContentFixture());
    openQuizOverlay(quizOverlayContextFixture());
  },
  parameters: {
    docs: {
      description: {
        story:
          'A fase do meio: `openQuizOverlay` leva o quiz para cima da tela (o ÚNICO caminho — nenhum passo do ciclo sobe o modal sozinho desde a ONDA11). O card recebe foco, o Tab fica preso e o Esc minimiza.',
      },
    },
  },
};

export const MinimizadoNoChat: Story = {
  name: 'Minimizado no chat (respondido)',
  play: () => {
    publishQuizOverlayContent(quizOverlayContentFixture({ quiz: quizStateErrada }));
    openQuizOverlay(quizOverlayContextFixture());
    minimizeQuizOverlay(quizKey);
  },
  parameters: {
    docs: {
      description: {
        story:
          'A terceira fase: ao responder, o card desce para a bolha da conversa (o `QuizChatCard` fica lá, a um clique de voltar). O overlay sai da tela com animação de saída — o `AnimatePresence` envolve a condicional, nunca um `return null`.',
      },
    },
  },
};

export const CicloTravadoSobreATela: Story = {
  name: 'Sobre a tela, ciclo travado (duas saídas)',
  play: () => {
    publishQuizOverlayContent(
      quizOverlayContentFixture({
        status: 'indisponivel',
        notice: 'O ciclo parou aqui. Você pode pedir de novo.',
        onRetry: fn(),
        onReopen: fn(),
      }),
    );
    openQuizOverlay(quizOverlayContextFixture());
  },
  parameters: {
    docs: {
      description: {
        story:
          'Fail-closed do canal com as DUAS saídas dentro do modal (as mesmas do card da conversa — as duas metades do quiz não podem divergir no que oferecem).',
      },
    },
  },
};

export const InteraçõesMinimizar: Story = {
  name: 'Interação: o botão minimiza (nunca fecha)',
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    publishQuizOverlayContent(quizOverlayContentFixture());
    openQuizOverlay(quizOverlayContextFixture());

    const dialogo = tela.getByRole('dialog');
    await expect(dialogo).toBeVisible();

    await userEvent.click(tela.getByRole('button', { name: 'Minimizar para a conversa' }));
    // O overlay SAI da tela — mas o ciclo não fecha: "fechar" é maestria.
    await expect(tela.queryByRole('dialog')).toBeNull();
  },
};
