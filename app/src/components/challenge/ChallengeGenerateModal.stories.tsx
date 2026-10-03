/**
 * src/components/challenge/ChallengeGenerateModal.stories.tsx —
 * Componentes/Desafio/ChallengeGenerateModal.
 *
 * O CONTAINER real — o mesmo que o App.tsx monta no shell. Ao contrário da
 * `ChallengeGenerateView` (props diretas), este não tem props: o processo vive
 * no `challengeGenerateStore` (module-level, sobrevive a trocas de aba) e os
 * marcos chegam pelo canal push `track:challenge-regenerate-progress`. Estas
 * histórias documentam o fluxo COMPLETO com as duas entradas oficiais:
 *
 *   - SEMENTE: `startChallengeGenerate(ctx)` — o que as views fazem ao disparar
 *     o IPC (o `beforeEach` do meta repõe a loja para a primeira pintura sair
 *     limpa; o `play` semeia DEPOIS dos efeitos de montagem);
 *   - PROGRESSO: `emitMockEvent('track', 'onChallengeRegenerateProgress', …)`
 *     (o mockApi do Storybook despacha para o listener que o container
 *     subscreve em `useEffect` — exatamente o caminho do main);
 *   - TERMINAIS: `done` (sticky — o primeiro vence) e `error` (mensagem real
 *     ou o fallback genérico). A recuperação é "Fechar" + uma geração NOVA
 *     (correlacionada por `generationId` — ALTO-2).
 */
import type { Meta, StoryObj } from '@storybook/react';
import { expect, userEvent, within } from 'storybook/test';

import { ChallengeGenerateModal } from './ChallengeGenerateModal';
import { shellDecorators } from '../../storybook/decorators';
import { emitMockEvent } from '../../storybook/mockApi';
import {
  resetChallengeGenerate,
  startChallengeGenerate,
} from '../../lib/challengeGenerateStore';
import {
  challengeGenerateCtx,
  challengeRegenerateError,
  challengeRegenerateProgressFlow,
} from '../../storybook/fixtures.quiz';

const meta = {
  title: 'Componentes/Desafio/ChallengeGenerateModal',
  component: ChallengeGenerateModal,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'O processo global de "Gerar novo desafio", montado PERMANENTEMENTE no shell (a geração continua no main mesmo se o utilizador trocar de aba). Este modal subscreve o canal de progresso e é ele que garante o desfecho — mesmo quando a view que disparou já desmontou.',
      },
    },
  },
  decorators: shellDecorators({ canvas: false }),
  beforeEach: () => {
    // Primeira pintura limpa: a loja é de MÓDULO e sobrevive entre histórias.
    resetChallengeGenerate();
  },
} satisfies Meta<typeof ChallengeGenerateModal>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A pausa que deixa a etapa ser vista antes da seguinte. */
const PASSO_MS = 700;

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export const Fechado: Story = {
  name: 'Fechado (sem processo)',
  parameters: {
    docs: {
      description: { story: 'Sem geração em voo o modal não existe — o store está `idle`.' },
    },
  },
};

export const Gerando: Story = {
  name: 'Em curso — Pensando no desafio',
  play: () => {
    startChallengeGenerate(challengeGenerateCtx);
  },
  parameters: {
    docs: {
      description: {
        story:
          '`startChallengeGenerate` dispara o processo: etapa ① ativa (a pulsar), o botão "Fechar" presente. Fechar NÃO aborta o main — o desafio pode ser persistido depois; os terminais atrasados são descartados pelo `generationId`.',
      },
    },
  },
};

export const ProgressoViaEventos: Story = {
  name: 'Progresso via emitMockEvent (os 4 marcos + done)',
  play: async () => {
    const generationId = startChallengeGenerate(challengeGenerateCtx) ?? undefined;
    // Os marcos REAIS do main, um a um: generating → validating → executing →
    // inserting → done. O mapeamento evento→etapa vive no
    // `challengeGenerateStore` (a etapa ② conclui por salto junto da ①).
    for (const evento of challengeRegenerateProgressFlow) {
      emitMockEvent('track', 'onChallengeRegenerateProgress', { ...evento, generationId });
      await esperar(PASSO_MS);
    }
  },
  parameters: {
    docs: {
      description: {
        story:
          'O caminho de progresso do main (`track:challenge-regenerate-progress`) aplicado ao store pelo listener do container — a prova de que o modal desenha o processo inteiro sem a view que o disparou.',
      },
    },
  },
};

export const Concluido: Story = {
  name: 'Concluído (done sticky + Ver desafio)',
  play: () => {
    const generationId = startChallengeGenerate(challengeGenerateCtx) ?? undefined;
    const done = challengeRegenerateProgressFlow.find((ev) => ev.stage === 'done');
    emitMockEvent('track', 'onChallengeRegenerateProgress', { ...done!, generationId });
  },
  parameters: {
    docs: {
      description: {
        story:
          'O terminal `done`: glow de conclusão + "Ver desafio" (a navegação acontece NO MODAL, via `challengeNav`, com o target guardado no start). Terminais são STICKY — um done atrasado de outro processo não entra aqui (correlação por `generationId`).',
      },
    },
  },
};

export const Erro: Story = {
  name: 'Erro (mensagem real)',
  play: () => {
    const generationId = startChallengeGenerate(challengeGenerateCtx) ?? undefined;
    emitMockEvent('track', 'onChallengeRegenerateProgress', { ...challengeRegenerateError, generationId });
  },
  parameters: {
    docs: {
      description: {
        story:
          'O terminal `error` com a mensagem do processo. A saída é "Fechar" e o recomeço é uma geração nova — ver a story "Erro e nova tentativa" da view para o ciclo completo.',
      },
    },
  },
};

export const InteraçõesFechar: Story = {
  name: 'Interação: "Fechar" dispensa sem abortar',
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    startChallengeGenerate(challengeGenerateCtx);

    const dialogo = tela.getByRole('dialog');
    await expect(dialogo).toBeVisible();

    await userEvent.click(tela.getByRole('button', { name: 'Fechar' }));
    await expect(tela.queryByRole('dialog')).toBeNull();
  },
  parameters: {
    docs: {
      description: {
        story:
          'O gesto de dispensa marca o store `idle` (o modal sai com animação de saída) e o processo do main CONTINUA — o rótulo é "Fechar", não "Cancelar", justamente porque parar não estava ao alcance do botão.',
      },
    },
  },
};
