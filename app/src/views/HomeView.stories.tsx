/**
 * HomeView.stories.tsx — `Vistas/HomeView` (STORY-SPEC).
 *
 * Os estados reais do Início, por props (a view é pura — o estado vive em
 * `useHomeView`): boas-vindas com setup incompleto, com trilhas recentes e
 * matérias, sem nada instalado (onboarding) e com RESQUÍCIOS destacados
 * (ONDA9: o resquício some do caminho do aluno, mas nunca em silêncio).
 *
 * Nota de colocação: a view vive em `views/placeholders.tsx` (nome histórico do
 * ficheiro) e a história é nomeada pelo COMPONENTE (`HomeView.stories.tsx`).
 */
import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { fixtureKeysStatus, fixtureSubjectTopics, fixtureTrackEntries } from '../storybook/fixtures';
import { HomeViewView } from './placeholders';
import type { HomeViewViewProps } from './useHomeView';
import {
  settingsKeysStatusEmpty,
  settingsKeysStatusMissingBrave,
} from '../storybook/fixtures.settings';

const trilhas: HomeViewViewProps['tracks'] = fixtureTrackEntries.map((t) => ({
  slug: t.slug,
  title: t.title,
  description: t.description,
  doneCount: t.doneCount,
  lessonCount: t.lessonCount,
}));

const meta = {
  title: 'Vistas/HomeView',
  component: HomeViewView,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: {
    keyStatus: fixtureKeysStatus,
    keyStatusFailed: false,
    refreshKeys: fn(),
    ready: true,
    lastLesson: null,
    // Espelha `translation:home.cta.*` em pt-BR (conteúdo real do produto).
    primaryLabel: 'Escolher uma trilha',
    primaryAction: fn(),
    openTrack: fn(),
    orphanCount: 0,
    navigate: fn(),
    handlePick: fn(),
    visibleTopics: fixtureSubjectTopics,
    hasSubjects: true,
    tracks: trilhas,
    tracksError: null,
    loadTracks: fn(),
  },
} satisfies Meta<typeof HomeViewView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BoasVindas: Story = {
  args: {
    keyStatus: settingsKeysStatusMissingBrave,
    ready: false,
    primaryLabel: 'Configurar chaves',
  },
};

export const ComTrilhasRecentes: Story = {
  args: {
    lastLesson: { trackSlug: 'python-iniciante', lessonId: 'aula-2' },
    primaryLabel: 'Continuar aula',
  },
};

export const SemNadaInstalado: Story = {
  args: {
    keyStatus: settingsKeysStatusEmpty,
    ready: false,
    primaryLabel: 'Configurar chaves',
    tracks: [],
    visibleTopics: [],
    hasSubjects: false,
    lastLesson: null,
  },
};

export const ResquíciosDestacados: Story = {
  args: {
    lastLesson: { trackSlug: 'python-iniciante', lessonId: 'aula-2' },
    primaryLabel: 'Continuar aula',
    orphanCount: 2,
  },
};

/** `keys.getStatus` ainda não respondeu: o cartão de estado é o "só título". */
export const AVerificarAsChaves: Story = {
  args: {
    keyStatus: null,
    keyStatusFailed: false,
    ready: false,
  },
};

/** O canal FALHOU (≠ "não configurado"): estado honesto com retentativa. */
export const EstadoDasChavesInverificável: Story = {
  args: {
    keyStatus: null,
    keyStatusFailed: true,
    ready: false,
  },
};

export const TrilhasComErro: Story = {
  args: {
    tracks: null,
    tracksError: 'Não foi possível listar as trilhas instaladas.',
  },
};
