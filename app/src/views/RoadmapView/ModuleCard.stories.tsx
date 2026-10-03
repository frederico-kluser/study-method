/**
 * ModuleCard.stories.tsx — `Componentes/Roadmap/ModuleCard` (STORY-SPEC).
 *
 * O módulo colapsável da trilha: fechado/aberto, com e sem desafio do módulo
 * (rodada 9 — checklist funcional `AssignmentOutlined`, com o veredito do
 * aluno) e sem aulas.
 */
import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import type { TrackModuleEntry } from '../../../shared/ipc-contract';
import { fixtureTrackModules, fixtureT } from '../../storybook/fixtures.settings';
import { ModuleCard } from './ModuleCard';

const meta = {
  title: 'Componentes/Roadmap/ModuleCard',
  component: ModuleCard,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  args: {
    mod: fixtureTrackModules[0],
    defaultOpen: false,
    justUnlocked: new Set<string>(),
    onOpenLesson: fn(),
    onOpenModuleChallenge: fn(),
    tI: fixtureT,
  },
} satisfies Meta<typeof ModuleCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Padrao: Story = {};

export const Aberto: Story = {
  args: { defaultOpen: true },
};

export const ComDesafioTentado: Story = {
  args: {
    mod: fixtureTrackModules[0],
    defaultOpen: true,
  },
};

export const ComDesafioConcluido: Story = {
  args: {
    mod: { ...fixtureTrackModules[0], challengeLastVerdict: 'passed' } satisfies TrackModuleEntry,
    defaultOpen: true,
  },
};

export const ComAulaDestravada: Story = {
  args: {
    defaultOpen: true,
    justUnlocked: new Set([fixtureTrackModules[0].lessons[fixtureTrackModules[0].lessons.length - 1].slug]),
  },
};

export const SemAulas: Story = {
  args: {
    mod: { ...fixtureTrackModules[0], lessons: [] },
    defaultOpen: true,
  },
};

export const ConteudoLongo: Story = {
  args: {
    defaultOpen: true,
    mod: {
      ...fixtureTrackModules[0],
      title: 'Fundamentos de programação — variáveis, tipos, condicionais, laços e funções',
      challenge: {
        slug: 'desafio-modulo-fundamentos',
        title: 'Desafio do módulo: refatorar o projeto inteiro do zero com testes',
      },
    },
  },
};
