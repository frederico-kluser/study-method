/**
 * blocks/ChallengeStreamBlocks.stories.tsx — `Componentes/Desafio/
 * ChallengeStreamBlocks` (STORY-SPEC): os blocos do stream do pi
 * (pensamento/texto/ferramenta/erro) na caixa monoespaçada.
 */
import type { Meta, StoryObj } from '@storybook/react';
import { ChallengeStreamBlocks } from './ChallengeStreamBlocks';
import type { StreamingBlock } from '../challengeUi';

const blocos: StreamingBlock[] = [
  { kind: 'thinking', text: 'O teste falha porque o sinal não é preservado…' },
  { kind: 'text', text: 'O problema está em `dobro`: ' },
  { kind: 'text', text: 'o `return n * 2` está certo, falta confirmar o caso negativo.' },
  { kind: 'tool', text: '⚙ edit' },
  { kind: 'tool', text: '✓ edit concluído' },
  { kind: 'error', text: 'rate limit: 429 — repete em 20s' },
];

const meta = {
  title: 'Componentes/Desafio/ChallengeStreamBlocks',
  component: ChallengeStreamBlocks,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: {
    blocks: blocos,
    showThinking: false,
  },
  argTypes: {
    showThinking: { control: 'boolean', description: 'disclosure aberto revela os blocos de pensamento' },
  },
} satisfies Meta<typeof ChallengeStreamBlocks>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PensamentoOculto: Story = {};

export const PensamentoRevelado: Story = {
  args: { showThinking: true },
};

export const SoTextoEFerramentas: Story = {
  args: {
    blocks: blocos.filter((b) => b.kind !== 'thinking' && b.kind !== 'error'),
  },
};

export const ComErroDeStream: Story = {
  args: { blocks: blocos.filter((b) => b.kind !== 'thinking') },
  parameters: {
    docs: {
      description: {
        story:
          'O bloco de erro usa `error.accentText` (o valor de TEXTO da família, ≥ 4,5:1 sobre o ' +
          'nível 2 da rampa — ONDA-UX-CONTRASTE).',
      },
    },
  },
};

export const Vazio: Story = {
  args: { blocks: [] },
  parameters: {
    docs: {
      description: { story: 'Sem blocos de stream a caixa não renderiza (devolve null).' },
    },
  },
};
