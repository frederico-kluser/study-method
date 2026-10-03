/**
 * src/components/ui/Pressable.stories.tsx — Componentes/UI/Pressable.
 *
 * A CASCA de press-feedback (`motion.span` com `whileTap`/`whileHover`) que
 * aposentou as 15 cópias do bloco animado (auditoria de layout §2). As
 * histórias mostram o gesto (press com escala 0,98 — `MOTION.pressScale`), a
 * variante com hover (lift de 2px), o modo de MOVIMENTO REDUZIDO (a casca fica
 * estática) e o contrato do `tabIndex={-1}`: a casca NUNCA é parada de Tab —
 * quem recebe foco é o controle filho.
 */
import type { Meta, StoryObj } from '@storybook/react';
import { expect, userEvent, within } from 'storybook/test';

import { Pressable } from './Pressable';
import { ActionButton } from './ActionButton';

const meta = {
  title: 'Componentes/UI/Pressable',
  component: Pressable,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  args: {
    hover: false,
    reducedMotion: false,
    children: <ActionButton variant="contained">Continuar</ActionButton>,
  },
  argTypes: {
    hover: { control: 'boolean', description: 'lift espacial no hover (variante QuizChatCard)' },
    reducedMotion: { control: 'boolean', description: 'desliga o gesto (prefers-reduced-motion)' },
    children: { control: false, description: 'o controle que recebe foco e clique' },
  },
} satisfies Meta<typeof Pressable>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Padrão: Story = {};

export const ComHover: Story = {
  args: { hover: true },
};

export const MovimentoReduzido: Story = {
  args: { reducedMotion: true },
  parameters: {
    docs: {
      description: {
        story:
          'Com `prefers-reduced-motion` (ou o arg) a casca não anima: sem escala de press, sem lift. O clique funciona na mesma.',
      },
    },
  },
};

export const ConteúdoLongo: Story = {
  args: {
    children: (
      <ActionButton variant="outlined">
        Gerar novo desafio a partir dos teus erros do quiz e validar com os testes
      </ActionButton>
    ),
  },
};

export const FocoNoControle: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'O Tab atinge o BOTÃO, nunca a casca: o `motion.span` tem `tabIndex={-1}` (o fix do `tabIndex=0` que o framer-motion injeta).',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const botao = canvas.getByRole('button');
    await userEvent.tab();
    expect(document.activeElement === botao).toBe(true);
  },
};
