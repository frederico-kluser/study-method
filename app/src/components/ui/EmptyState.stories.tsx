/**
 * src/components/ui/EmptyState.stories.tsx — Componentes/UI/EmptyState.
 *
 * O estado vazio centralizado (auditoria de layout §4): ícone + título +
 * descrição + CTA — o formato do bloco da LessonView ("nenhuma aula de trilha
 * selecionada"). As histórias cobrem o completo, o mínimo (só título), sem
 * ícone e o conteúdo longo (a descrição tem medida tectada e quebra).
 */
import type { Meta, StoryObj } from '@storybook/react';
import AutoStoriesRounded from '@mui/icons-material/AutoStoriesRounded';
import ExploreRounded from '@mui/icons-material/ExploreRounded';
import { fn } from 'storybook/test';

import { EmptyState } from './EmptyState';
import { ActionButton } from './ActionButton';

const meta = {
  title: 'Componentes/UI/EmptyState',
  component: EmptyState,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  args: {
    icon: AutoStoriesRounded,
    title: 'Nenhuma aula em curso',
    description: 'Escolha uma trilha no mapa para começar: a teoria aparece aqui, aula a aula.',
    action: (
      <ActionButton variant="contained" onClick={fn()}>
        Escolher uma trilha
      </ActionButton>
    ),
  },
  argTypes: {
    icon: { control: false, description: 'componente de ícone MUI (cor/tamanho vêm do primitivo)' },
    title: { control: 'text' },
    description: { control: 'text' },
    action: { control: false, description: 'o CTA — já traduzido pelo chamador' },
    width: { control: 'number', description: 'LAYOUT.* (default: readingColumnPx)' },
    topPad: { control: 'number', description: 'respiro de topo (default: 6)' },
  },
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Vazio: Story = {};

export const SemÍcone: Story = {
  args: { icon: undefined, action: undefined },
};

export const Mínimo: Story = {
  args: {
    icon: undefined,
    title: 'Sem resultados',
    description: undefined,
    action: undefined,
  },
};

export const ComOutroÍcone: Story = {
  args: {
    icon: ExploreRounded,
    title: 'Nenhum mundo desbloqueado',
    description: 'Conclui as aulas da trilha para abrir os próximos mundos.',
  },
};

export const ConteúdoLongo: Story = {
  args: {
    title: 'Nenhuma aula selecionada na trilha "Fundamentos de C: ponteiros e memória"',
    description:
      'Escolhe uma aula no mapa da trilha para continuar de onde paraste. O progresso fica guardado neste computador e cada aula tem teoria em seções, quiz e um desafio validado por teste.',
  },
};
