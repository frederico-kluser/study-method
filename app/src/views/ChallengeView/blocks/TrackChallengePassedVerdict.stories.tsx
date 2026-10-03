/**
 * blocks/TrackChallengePassedVerdict.stories.tsx — `Componentes/Desafio/
 * TrackChallengePassedVerdict` (STORY-SPEC): o veredito de SUCESSO do desafio
 * de trilha + as saídas pós-sucesso (ONDA 4 — next-glow).
 */
import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { TrackChallengePassedVerdict } from './TrackChallengePassedVerdict';

const meta = {
  title: 'Componentes/Desafio/TrackChallengePassedVerdict',
  component: TrackChallengePassedVerdict,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: {
    starsLeft: 2,
    showLessonActions: true,
    regenerating: false,
    generateRunning: false,
    onAdvance: fn(),
    onRegenerate: fn(),
  },
  argTypes: {
    starsLeft: { control: { type: 'range', min: 0, max: 3, step: 1 } },
    showLessonActions: {
      control: 'boolean',
      description: 'ações do desafio de AULA (module/proficiency não as têm)',
    },
  },
} satisfies Meta<typeof TrackChallengePassedVerdict>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AprovadoComAcoesDeAula: Story = {};

export const AprovadoSemAcoes: Story = {
  args: { showLessonActions: false },
  parameters: {
    docs: {
      description: {
        story:
          'Module (autoral) e proficiency não oferecem "próxima aula/gerar novo" — o anúncio ' +
          'das estrelas fica sozinho.',
      },
    },
  },
};

export const RegeneracaoEmCurso: Story = {
  args: { regenerating: true },
  parameters: {
    docs: {
      description: {
        story:
          'Spinner no "Gerar outro desafio" + gates — o processo é GLOBAL (ONDA3): o gate também ' +
          'cobre uma geração disparada noutro sítio (`generateRunning`).',
      },
    },
  },
};

export const GeracaoGlobalEmVoo: Story = {
  args: { generateRunning: true },
};

export const UltimaEstrela: Story = {
  args: { starsLeft: 3 },
};
