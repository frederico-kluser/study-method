/**
 * Componentes/Aula/LessonTypingRow — a linha "tutor digitando…" com a saída
 * acessível "Mostrar tudo". Bloco puro de `views/LessonView/blocks/LessonTypingRow`.
 */
import type { Meta, StoryObj } from '@storybook/react';
import { LessonTypingRow } from './LessonTypingRow';

const meta = {
  title: 'Componentes/Aula/LessonTypingRow',
  component: LessonTypingRow,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: {
    show: true,
    showSkipButton: true,
    onSkip: () => console.debug('[storybook] onSkip'),
  },
  argTypes: {
    show: { control: 'boolean' },
    showSkipButton: { control: 'boolean' },
  },
} satisfies Meta<typeof LessonTypingRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DigitandoComBotão: Story = {};

export const SóODigitando: Story = {
  args: { showSkipButton: false },
};

/** O passo 'revelar' esconde o botão — o composer já é o "Mostrar tudo". */
export const RevelarSemBotão: Story = {
  args: { showSkipButton: false },
};

export const Oculta: Story = {
  args: { show: false },
};
