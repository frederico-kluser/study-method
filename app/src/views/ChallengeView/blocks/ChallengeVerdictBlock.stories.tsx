/**
 * blocks/ChallengeVerdictBlock.stories.tsx — `Componentes/Desafio/
 * ChallengeVerdictBlock` (STORY-SPEC): o veredito do avaliador (S1) — Alert
 * com severity por desfecho e o corpo em MarkdownView (KaTeX, código, listas).
 */
import type { Meta, StoryObj } from '@storybook/react';
import { ChallengeVerdictBlock } from './ChallengeVerdictBlock';

const veredito =
  '## Veredito: aprovado\n\n' +
  'A função `dobro(n)` devolve o dobro de $n$ preservando o sinal.\n\n' +
  '```python\ndef dobro(n):\n    return n * 2\n```\n\n' +
  '- entrada, processamento e retorno corretos;\n' +
  '- sem estado escondido entre chamadas.\n';

const meta = {
  title: 'Componentes/Desafio/ChallengeVerdictBlock',
  component: ChallengeVerdictBlock,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: {
    severity: 'success',
    markdown: veredito,
  },
  argTypes: {
    severity: {
      control: 'radio',
      options: ['success', 'warning', 'error'],
      description:
        'sucesso quando passou; warning quando PARCIAL (alguns casos passaram); error quando ' +
        'NADA passou (`verdictSeverity` em challengeUi.ts)',
    },
  },
} satisfies Meta<typeof ChallengeVerdictBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Aprovado: Story = {};

export const Parcial: Story = {
  args: {
    severity: 'warning',
    markdown:
      '## Veredito: quase\n\n' +
      'O caso positivo está certo, mas `dobro(-3)` devolveu `6`: o sinal não é preservado.\n',
  },
};

export const NadaPassou: Story = {
  args: {
    severity: 'error',
    markdown: '## Veredito: reprovado\n\nNenhum caso passou — o `SyntaxError` na linha 2 bloqueou tudo.\n',
  },
};

export const ConteúdoMatemático: Story = {
  args: {
    markdown:
      '## Veredito: aprovado\n\n' +
      'A conversão aplica $c = \\frac{5}{9}(f - 32)$ e devolve `float` — mesmo quando o ' +
      'resultado é redondo ($f = 32 \\Rightarrow c = 0.0$).\n',
  },
  parameters: {
    docs: {
      description: { story: 'Fórmulas KaTeX no veredito (o CSS do KaTeX vem do preview).' },
    },
  },
};
