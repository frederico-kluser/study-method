/**
 * src/components/ui/InfoCard.stories.tsx — Componentes/UI/InfoCard.
 *
 * O cartão de lista (auditoria de layout §10): `Card variant="outlined"` +
 * `CardContent` com o padding canónico — as ~9 cópias (placeholders,
 * RoadmapView, OrphanTracksPanel, cartões de estado do setup) aposentadas.
 * As histórias cobrem o informativo, com ícone, com ações, o ACIONÁVEL
 * (`CardActionArea` — o padrão do SubjectCard), o selecionado e o conteúdo
 * longo (quebra, nunca recorta).
 */
import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import TrackChangesRounded from '@mui/icons-material/TrackChangesRounded';
import Chip from '@mui/material/Chip';

import { InfoCard } from './InfoCard';
import { ActionButton } from './ActionButton';

const meta = {
  title: 'Componentes/UI/InfoCard',
  component: InfoCard,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: {
    title: 'Fundamentos de Python',
    subtitle: '12 aulas · 4 concluídas',
    selectable: false,
    selected: false,
  },
  argTypes: {
    title: { control: 'text' },
    subtitle: { control: 'text', description: 'legenda secundária' },
    actions: { control: false, description: 'slot de ações/chips à direita' },
    icon: { control: false, description: 'ícone/distintivo à esquerda' },
    selectable: { control: 'boolean', description: 'CardActionArea — botão real (Tab/Enter)' },
    selected: { control: 'boolean', description: 'toggle selecionado (aria-pressed honesto)' },
    onClick: { action: 'click' },
  },
} satisfies Meta<typeof InfoCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Padrão: Story = {};

export const ComÍcone: Story = {
  args: { icon: <TrackChangesRounded color="primary" /> },
};

export const ComAções: Story = {
  args: {
    actions: (
      <Chip size="small" variant="outlined" label="3 de 12" />
    ),
    selectable: true,
    onClick: fn(),
  },
};

export const Acionável: Story = {
  args: {
    selectable: true,
    onClick: fn(),
    title: 'Inverter uma árvore binária',
    subtitle: 'C · dificuldade 2',
  },
  parameters: {
    docs: {
      description: {
        story:
          'Selecionável usa `CardActionArea`: o cartão vira botão real (Tab + Enter/Espaço), nunca uma div com onClick.',
      },
    },
  },
};

export const Selecionado: Story = {
  args: {
    selectable: true,
    selected: true,
    onClick: fn(),
    title: 'Merge sort',
    subtitle: 'Python · em curso',
    actions: <ActionButton size="small" variant="text">Continuar</ActionButton>,
  },
};

export const ConteúdoLongo: Story = {
  args: {
    title: 'Fundamentos de C: ponteiros, alocação dinâmica e aritmética de endereços',
    subtitle:
      '12 aulas · 4 concluídas · a última sessão terminou no meio do quiz da aula 5 (arrays e decay de ponteiros).',
    selectable: true,
    onClick: fn(),
    icon: <TrackChangesRounded color="primary" />,
    actions: <Chip size="small" variant="outlined" label="4 de 12" />,
  },
  parameters: {
    docs: {
      description: {
        story: 'Título e subtítulo quebram em limites de palavra (`overflowWrap`) — nunca recortam.',
      },
    },
  },
};
