/**
 * OrphanRow.stories.tsx — `Componentes/Definições/OrphanRow` (STORY-SPEC):
 * a linha de resquício (slug + inventário do que seria removido) em InfoCard.
 */
import type { Meta, StoryObj } from '@storybook/react';
import type { TrackOrphanEntry } from '../../../shared/ipc-contract';
import { fixtureT, settingsOrphansList } from '../../storybook/fixtures.settings';
import { OrphanRow } from './OrphanRow';

const resquicio = (over: Partial<TrackOrphanEntry>): TrackOrphanEntry => ({
  ...settingsOrphansList[0],
  ...over,
});

const meta = {
  title: 'Componentes/Definições/OrphanRow',
  component: OrphanRow,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  args: {
    orphan: resquicio({}),
    tI: fixtureT,
  },
} satisfies Meta<typeof OrphanRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Padrao: Story = {};

export const SoComProgressoDeTrilha: Story = {
  args: {
    orphan: resquicio({
      subjectName: null,
      domain: null,
      attemptCount: 0,
      lessonsDoneCount: 0,
      hasProficiency: false,
      generatedChallengeCount: 0,
    }),
  },
};

export const ComProficiencia: Story = {
  args: {
    orphan: resquicio({ hasProficiency: true, attemptCount: 12, lessonsDoneCount: 8, generatedChallengeCount: 3 }),
  },
};

export const ConteudoLongo: Story = {
  args: {
    orphan: resquicio({
      subjectName:
        'Matemática para programação — álgebra linear, probabilidade e estatística aplicadas',
      slug: 'matematica-para-programacao-algebra-linear-probabilidade-estatistica',
    }),
  },
};
