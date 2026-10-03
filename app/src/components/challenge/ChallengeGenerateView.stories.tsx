/**
 * src/components/challenge/ChallengeGenerateView.stories.tsx —
 * Componentes/Desafio/ChallengeGenerateView.
 *
 * A VIEW PURA do "Gerar novo desafio" (extração state/view): o snapshot do
 * processo (`ChallengeGenerateState`, do `challengeGenerateStore`) chega por
 * props e os gestos saem como callbacks. Estas histórias documentam as 5
 * etapas do fluxo REAL (o mapeamento evento→etapa vive no store) sem tocar na
 * loja nem no Electron. Para o container real (loja + eventos de progresso do
 * main + navegação), ver `ChallengeGenerateModal.stories.tsx`.
 */
import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';

import {
  ChallengeGenerateView,
  type ChallengeGenerateViewProps,
} from './ChallengeGenerateModal';
import {
  challengeGenerateNovo,
  challengeGenerateStateFixture,
} from '../../storybook/fixtures.quiz';

const meta = {
  title: 'Componentes/Desafio/ChallengeGenerateView',
  component: ChallengeGenerateView,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'O processo global de geração de desafios, visível: 5 etapas (a etapa ② "Escrevendo os testes" conclui por salto — o draft da LLM já contém os testes), etapa ativa a pulsar, concluídas com check, futuras apagadas. `onClose` NÃO aborta o main (o desafio pode ser persistido depois); `onViewChallenge` é a navegação de conclusão.',
      },
    },
  },
  args: {
    state: challengeGenerateStateFixture(),
    onClose: fn(),
    onViewChallenge: fn(),
  },
  argTypes: {
    state: { control: false, description: 'snapshot do `challengeGenerateStore`' },
    onClose: { control: false, description: 'dispensa o modal (Esc, backdrop, "Fechar", X)' },
    onViewChallenge: { control: false, description: '"Ver desafio" — a navegação é do container' },
  },
} satisfies Meta<typeof ChallengeGenerateView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Fechado: Story = {
  args: {
    state: challengeGenerateStateFixture({ status: 'idle', stage: -1, generationId: null }),
  },
  parameters: {
    docs: { description: { story: 'Sem processo em voo, nada é desenhado.' } },
  },
};

export const Etapa1Pensando: Story = {
  name: 'Etapa 1 — Pensando no desafio',
  args: { state: challengeGenerateStateFixture({ stage: 0 }) },
  parameters: {
    docs: {
      description: {
        story:
          'O marco `generating` do main (draft LLM) — pulsa durante TODO o draft. As etapas anteriores não existem: este é o primeiro.',
      },
    },
  },
};

export const Etapa2EscrevendoTestes: Story = {
  name: 'Etapa 2 — Escrevendo os testes',
  args: { state: challengeGenerateStateFixture({ stage: 1 }) },
  parameters: {
    docs: {
      description: {
        story:
          'Sem evento próprio: o draft da LLM já contém os testes, então a etapa ① conclui junto dela (regra: etapas < etapa ativa estão concluídas).',
      },
    },
  },
};

export const Etapa3Conferindo: Story = {
  name: 'Etapa 3 — Conferindo a coerência',
  args: { state: challengeGenerateStateFixture({ stage: 2 }) },
  parameters: {
    docs: {
      description: {
        story:
          'O marco `validating` — rótulo honesto (revisão BAIXO-2): o regenerador PODE pular a validação semântica quando o validador está indisponível, e a etapa não afirma validação que pode não ocorrer.',
      },
    },
  },
};

export const Etapa4VerificandoExecucao: Story = {
  name: 'Etapa 4 — Verificando a execução',
  args: { state: challengeGenerateStateFixture({ stage: 3 }) },
  parameters: {
    docs: {
      description: {
        story:
          'O marco `executing` — a execução de verdade (o gate é igualdade `tests_run == expected_test_count`; exit code sozinho mente).',
      },
    },
  },
};

export const Etapa5Adicionando: Story = {
  name: 'Etapa 5 — Adicionando ao topo dos desafios',
  args: { state: challengeGenerateStateFixture({ stage: 4 }) },
  parameters: {
    docs: {
      description: {
        story:
          'O marco `inserting` — o desafio novo entra no TOPO da lista (o `listVersion` do store sobe no done e a view re-busca).',
      },
    },
  },
};

export const Concluido: Story = {
  args: {
    state: challengeGenerateStateFixture({
      status: 'done',
      stage: 4,
      challengeId: challengeGenerateNovo.slug,
      challengeTitle: challengeGenerateNovo.title,
    }),
  },
  parameters: {
    docs: {
      description: {
        story:
          'Estado terminal STICKY (o primeiro done vence): glow de conclusão + "Ver desafio". O glow é o chrome do cartão do `ModalScrim` (`cardClassName` "gen-done-glow" + a keyframe em `cardSx`: sombra de repouso → `success.main` a 50% → repouso, 1,5s, UMA vez; desligado sob `prefers-reduced-motion`). A navegação usa o TARGET guardado no start (`lesson` — a bolha da aula — ou `proficiency`), nunca um hardcode.',
      },
    },
  },
};

export const Erro: Story = {
  args: {
    state: challengeGenerateStateFixture({
      status: 'error',
      stage: 1,
      errorMessage: 'O motor local parou antes de escrever os testes.',
    }),
  },
  parameters: {
    docs: {
      description: {
        story:
          'Erro com mensagem real do processo. A redação é informativa (o ícone usa `error.accentText`; a mensagem fica em TINTA — texto `error.main` media 2,74:1 no escuro) e a saída é "Fechar": fechar NÃO aborta o main, e o desafio pode ainda ser persistido depois.',
      },
    },
  },
};

export const ErroSemMensagem: Story = {
  args: {
    state: challengeGenerateStateFixture({ status: 'error', stage: 0, errorMessage: null }),
  },
  parameters: {
    docs: {
      description: {
        story: 'Sem mensagem, o fallback genérico cobre — nunca uma caixa de erro vazia.',
      },
    },
  },
};

export const ErroERetentativa: Story = {
  name: 'Erro e nova tentativa (o recomeço)',
  args: {
    state: challengeGenerateStateFixture({
      status: 'error',
      stage: 2,
      errorMessage: 'O motor local parou antes de escrever os testes.',
    }),
  },
  play: async ({ canvasElement, args }) => {
    const tela = within(canvasElement);
    await expect(tela.getByText('O motor local parou antes de escrever os testes.')).toBeVisible();
    // O caminho de recuperação do produto: "Fechar" (o store volta a idle) e a
    // view dona do IPC dispara uma geração NOVA — um processo diferente, com
    // generationId próprio (os terminais atrasados do anterior são descartados).
    await userEvent.click(tela.getByRole('button', { name: 'Fechar' }));
    await expect(args.onClose).toHaveBeenCalled();
  },
  parameters: {
    docs: {
      description: {
        story:
          'O ciclo de retentativa: o erro tem saída honesta ("Fechar" — ele não promete parar o processo) e o recomeço é uma geração nova, correlacionada por `generationId` (ALTO-2): um terminal atrasado da tentativa anterior não sequestra a nova.',
      },
    },
  },
};
