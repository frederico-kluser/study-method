/**
 * blocks/TrackChallengeLoading.stories.tsx — `Componentes/Desafio/
 * TrackChallengeLoading` (STORY-SPEC): o carregamento da spec do desafio de
 * trilha (spinner com nome acessível — ONDA-UX-FEEDBACK).
 */
import type { Meta, StoryObj } from '@storybook/react';
import { TrackChallengeLoading } from './TrackChallengeLoading';

const meta = {
  title: 'Componentes/Desafio/TrackChallengeLoading',
  component: TrackChallengeLoading,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof TrackChallengeLoading>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ACarregar: Story = {};
