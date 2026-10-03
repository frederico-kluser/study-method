/**
 * Componentes/Aula/LessonActionRow — a linha de ação da aula (anúncio
 * role="status" + CTAs de fim de aula). Export story-friendly de
 * `LessonView.tsx`; o passo vem da função pura `lessonActionStep`.
 */
import type { Meta, StoryObj } from '@storybook/react';
import { LessonActionRow, type LessonActionRowProps } from './LessonView';

const meta = {
  title: 'Componentes/Aula/LessonActionRow',
  component: LessonActionRow,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: {
    step: 'proximo',
    busy: false,
    generateRunning: false,
    quizCardOnScreen: false,
    pendingQuizCount: 0,
    pendingChallengeCount: 0,
    onFinish: () => console.debug('[storybook] onFinish'),
    onChallenge: () => console.debug('[storybook] onChallenge'),
    onNextLesson: () => console.debug('[storybook] onNextLesson'),
    onRegenerate: () => console.debug('[storybook] onRegenerate'),
  },
  argTypes: {
    step: {
      control: 'select',
      options: [
        'nao-comecou',
        'revelar',
        'quiz-secao',
        'proximo',
        'quiz-aula',
        'desafio',
        'concluir',
        'proxima-aula',
      ],
    },
    busy: { control: 'boolean' },
    pendingQuizCount: { control: 'number' },
    pendingChallengeCount: { control: 'number' },
  },
} satisfies Meta<typeof LessonActionRow>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Todos os passos da união `LessonActionStep`, lado a lado (o vocabulário). */
export const TodosOsPassos: Story = {
  render: (args) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {(
        [
          'nao-comecou',
          'revelar',
          'quiz-secao',
          'proximo',
          'quiz-aula',
          'desafio',
          'concluir',
          'proxima-aula',
        ] as LessonActionRowProps['step'][]
      ).map((step) => (
        <div key={step} style={{ borderBottom: '1px solid', paddingBottom: 8 }}>
          <LessonActionRow {...args} step={step} pendingQuizCount={step === 'quiz-aula' ? 2 : 0} pendingChallengeCount={step === 'desafio' ? 1 : 0} />
        </div>
      ))}
    </div>
  ),
};

/** Aula nem começou: a linha renderiza NADA (o convite está na conversa). */
export const AulaNaoComeçou: Story = { args: { step: 'nao-comecou' } };

/** Seção em digitação: a frase explica que o clique revela. */
export const Revelando: Story = { args: { step: 'revelar' } };

/** Quiz da seção sem acerto: "Avançar" travado (a frase diz o motivo). */
export const QuizDaSeção: Story = {
  args: { step: 'quiz-secao', quizCardOnScreen: true },
};

export const TeoriaEmCurso: Story = { args: { step: 'proximo' } };

/** Fim de aula com quiz por responder: "Concluir aula" travado. */
export const QuizDaAula: Story = {
  args: { step: 'quiz-aula', pendingQuizCount: 2 },
};

/** Teoria acabou: o DESAFIO é o CTA primário. */
export const DesafioPendente: Story = {
  args: { step: 'desafio', pendingChallengeCount: 1 },
};

export const Concluir: Story = { args: { step: 'concluir' } };

export const AulaConcluída: Story = { args: { step: 'proxima-aula' } };

export const Ocupado: Story = { args: { step: 'concluir', busy: true } };

export const GerandoDesafio: Story = {
  args: { step: 'proxima-aula', generateRunning: true },
};
