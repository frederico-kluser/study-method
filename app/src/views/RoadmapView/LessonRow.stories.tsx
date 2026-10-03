/**
 * LessonRow.stories.tsx — `Componentes/Roadmap/LessonRow` (STORY-SPEC).
 *
 * O tile de aula nos seus estados reais: concluída (glow de sucesso),
 * em andamento (quadro de acento), disponível, travada (W16: focável com
 * `aria-disabled`), recém-destravada (selo ONDA11) e conteúdo longo (quebra,
 * nunca recorta — SC 1.4.12).
 */
import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import type { TrackLessonEntry } from '../../../shared/ipc-contract';
import { fixtureTrackModules, fixtureT } from '../../storybook/fixtures.settings';
import { LessonRow } from './LessonRow';

const aula = (over: Partial<TrackLessonEntry>): TrackLessonEntry => ({
  ...fixtureTrackModules[0].lessons[0],
  ...over,
});

const meta = {
  title: 'Componentes/Roadmap/LessonRow',
  component: LessonRow,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  args: {
    lesson: aula({ locked: false, done: false, current: true }),
    justUnlocked: false,
    onOpen: fn(),
    tI: fixtureT,
  },
} satisfies Meta<typeof LessonRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const EmAndamento: Story = {};

export const Concluida: Story = {
  args: { lesson: aula({ locked: false, done: true, current: false }) },
};

export const Disponivel: Story = {
  args: { lesson: aula({ locked: false, done: false, current: false }) },
};

export const Travada: Story = {
  args: { lesson: aula({ locked: true, done: false, current: false }) },
};

export const DestravadaAgora: Story = {
  args: {
    lesson: aula({ locked: false, done: false, current: true }),
    justUnlocked: true,
  },
};

export const ConteudoLongo: Story = {
  args: {
    lesson: aula({
      locked: false,
      done: false,
      current: false,
      title:
        'Estruturas de dados compostas — listas, dicionários, conjuntos e tuplas na prática com exemplos comentados',
      summary:
        'Um resumo deliberadamente comprido para exercitar a quebra de texto em limites de palavra, sem truncar nem sobrepor o chip de dificuldade (regra da casa: quebra, nunca recorta).',
      difficulty: 5,
    }),
  },
};
