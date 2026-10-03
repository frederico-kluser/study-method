/**
 * Componentes/Aula/LessonSourceViewer — o visualizador de fonte (embed no
 * tabpanel inteiro, com link de reserva e "Fechar"). Export story-friendly de
 * `LessonView.tsx` (stateful leve: foco no "Fechar" ao montar).
 */
import type { Meta, StoryObj } from '@storybook/react';
import { LessonSourceViewer } from './LessonView';
import { lessonSources } from '../../storybook/fixtures.lesson';

const meta = {
  title: 'Componentes/Aula/LessonSourceViewer',
  component: LessonSourceViewer,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  args: {
    source: {
      title: lessonSources[0].title,
      url: lessonSources[0].url,
      description: lessonSources[0].description,
    },
    onClose: () => console.debug('[storybook] onClose'),
    openExternalHref: lessonSources[0].url,
  },
} satisfies Meta<typeof LessonSourceViewer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Padrão: Story = {};

export const TítuloLongo: Story = {
  args: {
    source: {
      title:
        'Documentação oficial do Python — o tutorial passo a passo que começa no "hello world" e vai até a programação orientada a objetos',
      url: lessonSources[0].url,
      description: lessonSources[0].description,
    },
    openExternalHref: lessonSources[0].url,
  },
};

export const FonteCurta: Story = {
  args: {
    source: { title: 'Wikipédia', url: lessonSources[1].url },
    openExternalHref: lessonSources[1].url,
  },
};
