/**
 * Componentes/Aula/LessonEmptyState — o estado vazio da aula (nenhuma aula
 * selecionada). Bloco puro de `views/LessonView/blocks/LessonEmptyState`.
 */
import type { Meta, StoryObj } from '@storybook/react';
import { LessonEmptyState } from './LessonEmptyState';

const meta = {
  title: 'Componentes/Aula/LessonEmptyState',
  component: LessonEmptyState,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: { onGoToRoadmap: () => console.debug('[storybook] onGoToRoadmap') },
} satisfies Meta<typeof LessonEmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Padrão: Story = {};
