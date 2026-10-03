/**
 * RoadmapView.stories.tsx — `Vistas/RoadmapView` (STORY-SPEC).
 *
 * Estados REAIS da trilha, argumentos por props (a view é pura — o estado vive
 * em `useRoadmapView`): lista de trilhas, sem trilhas instaladas (ONDA9: vazio
 * legítimo, não erro), detalhe com aulas concluídas/em progresso/bloqueadas,
 * aulas recém-destravadas (ONDA11), carregando e erro com retry. Os dados vêm
 * dos fixtures partilhados (`fixtureTrackEntries`/`fixtureTrackDetail`).
 */
import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import {
  fixtureTrackDetail,
  fixtureTrackEntries,
} from '../../storybook/fixtures';
import { RoadmapViewView, type RoadmapViewViewProps } from './RoadmapView';

const trilhas: RoadmapViewViewProps['tracks'] = fixtureTrackEntries.map((t) => ({
  slug: t.slug,
  title: t.title,
  doneCount: t.doneCount,
  lessonCount: t.lessonCount,
}));

const handlers = {
  openLesson: fn(),
  openTrack: fn(),
  goBackToList: fn(),
  openProficiency: fn(),
  openModuleChallenge: fn(),
  loadTrack: fn(),
  loadTracks: fn(),
};

const meta = {
  title: 'Vistas/RoadmapView',
  component: RoadmapViewView,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: {
    track: null,
    loading: false,
    loadError: null,
    selected: null,
    tracks: trilhas,
    noTracks: false,
    justUnlocked: new Set<string>(),
    unlockedTitles: [],
    ...handlers,
  },
} satisfies Meta<typeof RoadmapViewView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ListaDeTrilhas: Story = {};

export const SemTrilhasInstaladas: Story = {
  args: {
    tracks: [],
    noTracks: true,
  },
};

export const Carregando: Story = {
  args: {
    tracks: null,
    loading: true,
  },
};

/** Falha da LISTA de trilhas: só a retentativa (não há detalhe para "voltar"). */
export const ErroComRetry: Story = {
  args: {
    tracks: null,
    loading: false,
    loadError: 'Não foi possível listar as trilhas instaladas.',
    selected: null,
  },
};

/** Falha do DETALHE: retentativa + "Voltar" (o roadmapNav ainda aponta para ela). */
export const ErroNoDetalheComVoltar: Story = {
  args: {
    tracks: null,
    loading: false,
    loadError: 'Não foi possível carregar a trilha.',
    selected: 'python-iniciante',
  },
};

export const DetalheComProgresso: Story = {
  args: {
    selected: 'python-iniciante',
    track: fixtureTrackDetail,
  },
};

export const DetalheComAulasDestravadas: Story = {
  args: {
    selected: 'python-iniciante',
    track: fixtureTrackDetail,
    justUnlocked: new Set(['aula-2']),
    unlockedTitles: ['Variáveis e tipos'],
  },
};

export const DetalheComTituloLongo: Story = {
  args: {
    selected: 'python-iniciante',
    track: {
      ...fixtureTrackDetail,
      title:
        'Python do Zero para quem nunca programou — variáveis, tipos, condicionais, estruturas de dados, funções e um projeto final guiado passo a passo',
      description:
        'Uma trilha comprida para exercitar a quebra de texto: sem truncar, sem reticências, em limites de palavra — a política da casa é "quebra, nunca recorta" (SC 1.4.12).',
    },
  },
};
