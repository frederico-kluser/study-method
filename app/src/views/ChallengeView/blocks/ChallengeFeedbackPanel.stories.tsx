/**
 * blocks/ChallengeFeedbackPanel.stories.tsx — `Componentes/Desafio/
 * ChallengeFeedbackPanel` (STORY-SPEC): o painel de saída + feedback completo
 * (terminal, erro de infra com retry, stream do pi, veredito e erros da fase
 * pi). O xterm entra como slot — aqui com o `AnswerTerminal` REAL e canvas
 * fixo (`shellDecorators`), como no app.
 */
import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { shellDecorators } from '../../../storybook/decorators';
import { AnswerTerminal } from '../../../components/terminal/AnswerTerminal';
import { ChallengeFeedbackPanel } from './ChallengeFeedbackPanel';
import type { StreamingBlock } from '../challengeUi';

const blocos: StreamingBlock[] = [
  { kind: 'thinking', text: 'O teste falha porque o sinal não é preservado…' },
  { kind: 'text', text: 'O problema está em `dobro`: falta confirmar o caso negativo.' },
  { kind: 'tool', text: '⚙ edit' },
];

const meta = {
  title: 'Componentes/Desafio/ChallengeFeedbackPanel',
  component: ChallengeFeedbackPanel,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  decorators: shellDecorators({ canvas: { width: 960, height: 560 } }),
  args: {
    terminal: <AnswerTerminal aria-label="Saída dos testes" />,
    testRunning: false,
    testError: null,
    onRetryTests: fn(),
    providerLabel: null,
    piRunning: false,
    piAborted: false,
    requestingFeedback: false,
    showThinking: false,
    onToggleThinking: fn(),
    blocks: [],
    verdict: null,
    piError: null,
    onRetryPi: fn(),
  },
} satisfies Meta<typeof ChallengeFeedbackPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TerminalVazio: Story = {};

export const AExecutar: Story = {
  args: { testRunning: true },
};

export const ErroDeInfraComRetry: Story = {
  args: {
    testError: 'Não consegui rodar os testes (falha de infraestrutura). Tente de novo.',
  },
  parameters: {
    docs: {
      description: {
        story: 'C3: o erro de INFRA da fase determinística é visível e NÃO avança para o pi.',
      },
    },
  },
};

export const StreamComVeredito: Story = {
  args: {
    providerLabel: 'avaliador remoto',
    showThinking: true,
    blocks: blocos,
    verdict: {
      severity: 'warning',
      markdown: '## Veredito: quase\n\nO caso `dobro(-3)` devolveu `6` — o sinal perdeu-se.\n',
    },
  },
};

export const APedirAvaliacao: Story = {
  args: {
    piRunning: true,
    requestingFeedback: true,
    providerLabel: 'avaliador remoto',
  },
  parameters: {
    docs: {
      description: {
        story:
          'S2: o interstício entre os testes e a avaliação — pedido em voo, sem conteúdo ainda.',
      },
    },
  },
};

export const AvaliadorAbortado: Story = {
  args: { piAborted: true, providerLabel: 'avaliador remoto', blocks: blocos.slice(1) },
};

export const ErroDoAvaliadorComRetry: Story = {
  args: {
    piError: {
      text: 'Falha ao chamar o pi: Error: HTTP 502 — upstream indisponível',
      kind: 'other',
    },
  },
};

export const ErroDeChaveSemRetry: Story = {
  args: {
    piError: {
      text: 'Falha ao chamar o pi: chave OpenRouter ausente ou inválida. Abra as Configurações para cadastrar a chave.',
      kind: 'key',
    },
  },
  parameters: {
    docs: {
      description: {
        story:
          'W10: o erro de CHAVE não ganha retry (resolve-se nas Configurações) e só ele mostra ' +
          'a dica da chave. É o `RetryAlert` com `action={false}` — a variante SEM retentativa ' +
          'do primitivo (auditoria §3): mensagem + detalhe, sem botão.',
      },
    },
  },
};
