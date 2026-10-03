/**
 * src/components/ui/ActionButton.stories.tsx — Componentes/UI/ActionButton.
 *
 * O botão de ação do design system (casca `Pressable` + `Button` com o piso de
 * alvo de toque por omissão — auditoria de layout §2). As histórias cobrem as
 * variantes do `Button` (contained/outlined/text), os estados desabilitado e
 * CARREGANDO (desligado + `aria-busy` + spinner + anúncio sr-only), o foco
 * visível do tema e o conteúdo longo (que exige o `sx` de quebra —
 * `wrappingActionSx`, porque o default é `nowrap`).
 */
import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import SendRounded from '@mui/icons-material/SendRounded';
import ReplayRounded from '@mui/icons-material/ReplayRounded';

import { ActionButton } from './ActionButton';
import { wrappingActionSx } from '../../lib/layoutSx';

const meta = {
  title: 'Componentes/UI/ActionButton',
  component: ActionButton,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  args: {
    children: 'Tentar de novo',
    variant: 'contained',
    loading: false,
    disabled: false,
    hover: false,
    onClick: fn(),
  },
  argTypes: {
    variant: { control: 'select', options: ['contained', 'outlined', 'text'] },
    loading: { control: 'boolean', description: 'ocupado: desliga, anuncia e mostra spinner' },
    disabled: { control: 'boolean' },
    hover: { control: 'boolean', description: 'lift espacial no hover' },
    children: { control: 'text' },
  },
} satisfies Meta<typeof ActionButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Padrão: Story = {};

export const ComÍcone: Story = {
  args: { children: 'Enviar resposta', startIcon: <SendRounded /> },
};

export const Desabilitado: Story = {
  args: { disabled: true, children: 'Avançar' },
};

export const Carregando: Story = {
  args: { loading: true, startIcon: <ReplayRounded />, children: 'Tentar de novo' },
  parameters: {
    docs: {
      description: {
        story:
          'Ocupado: `disabled` + `aria-busy` + spinner no `startIcon` (o `size={16}` das cópias da casa) + rótulo sr-only "A processar…" (`translation:ui.actionButton.busy`). O rótulo visível NUNCA some.',
      },
    },
  },
};

export const ConteúdoLongo: Story = {
  args: {
    children: 'Gerar novo desafio a partir dos teus erros do quiz e validar com os testes',
    sx: wrappingActionSx,
    variant: 'outlined',
  },
  parameters: {
    docs: {
      description: {
        story:
          'O default é `whiteSpace: \'nowrap\'` (`actionButtonSx`); rótulos longos pedem `sx={wrappingActionSx}` — quebram em limites de palavra, nunca recortam.',
      },
    },
  },
};

export const FocoVisível: Story = {
  args: { children: 'Responder' },
  parameters: {
    docs: {
      description: {
        story:
          'O anel de foco é o do tema (`*:focus-visible` — traço + halo de tinta, SC 1.4.11); nenhum primitivo o reimplementa.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const botao = within(canvasElement).getByRole('button');
    await userEvent.tab();
    expect(document.activeElement === botao).toBe(true);
  },
};

export const Variantes: Story = {
  parameters: {
    docs: {
      description: {
        story: 'As variantes do `Button` com o MESMO piso de toque e a mesma casca de press.',
      },
    },
  },
  render: () => (
    <>
      <ActionButton variant="contained" startIcon={<SendRounded />}>
        Enviar resposta
      </ActionButton>
      <ActionButton variant="outlined">Tentar de novo</ActionButton>
      <ActionButton variant="text">Agora não</ActionButton>
      <ActionButton variant="outlined" color="error">
        Limpar progresso
      </ActionButton>
    </>
  ),
};
