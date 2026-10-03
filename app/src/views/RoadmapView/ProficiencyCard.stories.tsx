/**
 * ProficiencyCard.stories.tsx — `Componentes/Roadmap/ProficiencyCard`
 * (STORY-SPEC): o teste de proficiência da trilha por fazer e já feito.
 */
import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { ProficiencyCard } from './ProficiencyCard';

const meta = {
  title: 'Componentes/Roadmap/ProficiencyCard',
  component: ProficiencyCard,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  args: {
    proficient: false,
    onOpen: fn(),
  },
} satisfies Meta<typeof ProficiencyCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PorFazer: Story = {};

export const JaProficiente: Story = {
  args: { proficient: true },
};
