/**
 * Componentes/Aula/LessonComposer — a barra de entrada da aula
 * (mic + campo pílula + enviar + avanço). Export story-friendly de
 * `LessonView.tsx` (montável sozinho; a view usa ESTE componente).
 */
import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { LessonComposer, type LessonComposerProps } from './LessonView';

const meta = {
  title: 'Componentes/Aula/LessonComposer',
  component: LessonComposer,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: {
    draft: '',
    onDraftChange: () => {},
    onSend: () => console.debug('[storybook] onSend'),
    onMicToggle: () => console.debug('[storybook] onMicToggle'),
    micTranscribing: false,
    disabled: false,
    showAdvance: true,
    advanceLocked: false,
    advanceDisabled: false,
    onAdvance: () => console.debug('[storybook] onAdvance'),
    advanceTooltip: '',
  },
  argTypes: {
    micTranscribing: { control: 'boolean' },
    disabled: { control: 'boolean' },
    showAdvance: { control: 'boolean' },
    advanceLocked: { control: 'boolean' },
    advanceDisabled: { control: 'boolean' },
  },
} satisfies Meta<typeof LessonComposer>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Composer CONTROLADO: o rascunho vive na história (a view é dona do estado). */
function Controlado(props: LessonComposerProps): ReactElement {
  const [draft, setDraft] = useState(props.draft);
  return <LessonComposer {...props} draft={draft} onDraftChange={setDraft} />;
}

export const Padrão: Story = {
  render: (args) => <Controlado {...args} />,
};

export const ComRascunho: Story = {
  render: (args) => <Controlado {...args} draft="e se eu escrever duas linhas?" />,
};

export const GravandoVoz: Story = {
  args: { micTranscribing: true },
  render: (args) => <Controlado {...args} />,
};

export const TurnoOcupado: Story = {
  args: { disabled: true },
  render: (args) => <Controlado {...args} />,
};

export const AvançoTravadoPeloQuiz: Story = {
  args: {
    advanceLocked: true,
    advanceTooltip: 'Responda o quiz desta seção para avançar',
  },
  render: (args) => <Controlado {...args} />,
};

export const AvançoRevelaDigitação: Story = {
  // Passo 'revelar': o botão se chama "Mostrar tudo" (W3 — um botão, um significado).
  args: {
    advanceLabel: 'Mostrar tudo',
    advanceTooltip: 'Mostra o restante da seção em cerca de um segundo',
  },
  render: (args) => <Controlado {...args} />,
};

export const SemAvanço: Story = {
  // Passo 'nao-comecou': o avanço não existe antes de a aula começar.
  args: { showAdvance: false },
  render: (args) => <Controlado {...args} />,
};
