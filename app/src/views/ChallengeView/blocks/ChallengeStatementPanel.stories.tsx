/**
 * blocks/ChallengeStatementPanel.stories.tsx — `Componentes/Desafio/
 * ChallengeStatementPanel` (STORY-SPEC): o enunciado do desafio (markdown +
 * KaTeX) com o cabeçalho de título/linguagem e o erro de carga (W11).
 */
import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { ChallengeStatementPanel } from './ChallengeStatementPanel';

const enunciado =
  '# Funções reutilizáveis\n\n' +
  'Implemente `dobro(n)` devolvendo o dobro de `n`, preservando o sinal.\n\n' +
  'A fórmula é $d = 2n$.\n\n' +
  '```python\ndef dobro(n):\n    return n * 2\n```\n\n' +
  '- `dobro(0)` deve devolver `0`;\n' +
  '- `dobro(-3)` deve devolver `-6`.\n';

const meta = {
  title: 'Componentes/Desafio/ChallengeStatementPanel',
  component: ChallengeStatementPanel,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: {
    title: 'Desafio: funções reutilizáveis',
    language: 'python',
    statement: enunciado,
    statementError: null,
    onRetry: fn(),
  },
} satisfies Meta<typeof ChallengeStatementPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ComEnunciado: Story = {};

export const ACarregar: Story = {
  args: { statement: '' },
};

export const EnunciadoIndisponivel: Story = {
  args: {
    statement: '',
    statementError: {
      text: 'O enunciado não está disponível neste momento.',
      severity: 'warning',
    },
  },
  parameters: {
    docs: {
      description: {
        story:
          'W11: o enunciado indisponível é WARNING (o desafio continua utilizável) — nunca um ' +
          'texto morto; "Tentar de novo" re-carrega o workspace.',
      },
    },
  },
};

export const FalhaDeWorkspace: Story = {
  args: {
    statement: '',
    statementError: {
      text: 'Não consegui carregar o workspace: Error: ipc: canal mudo',
      severity: 'error',
    },
  },
};

export const ConteúdoLongo: Story = {
  args: {
    statement:
      enunciado +
      '\n## Porquê funções\n\n' +
      'Uma função é um bloco de código com nome que você reutiliza sempre que precisar — ' +
      'como uma receita: ingredientes (parâmetros), modo de fazer (corpo) e prato pronto ' +
      '(retorno). '.repeat(12),
  },
  parameters: {
    docs: {
      description: { story: 'Teste de overflow: o texto longo quebra, nunca recorta.' },
    },
  },
};
