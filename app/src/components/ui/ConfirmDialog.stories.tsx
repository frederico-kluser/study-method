/**
 * src/components/ui/ConfirmDialog.stories.tsx — Componentes/UI/ConfirmDialog.
 *
 * O diálogo de confirmação (auditoria de layout §9): `Dialog + Title +
 * Content + Actions` — as 4 cópias (ProgressPanel, OrphanTracksPanel,
 * LocalAiPanel, FileExplorer) aposentadas. As histórias cobrem o destrutivo
 * default (foco inicial no CANCELAR — W18), o ocupado (trava tudo), o foco no
 * confirmar (o padrão antigo do FileExplorer), sem descrição e conteúdo longo.
 */
import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';

import { ConfirmDialog } from './ConfirmDialog';

const meta = {
  title: 'Componentes/UI/ConfirmDialog',
  component: ConfirmDialog,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  args: {
    open: true,
    title: 'Limpar o progresso?',
    description:
      'Isto apaga o progresso, a proficiência e as sessões guardadas neste computador. Não dá para desfazer.',
    busy: false,
    initialFocus: 'cancel',
    confirmColor: 'error',
    onCancel: fn(),
    onConfirm: fn(),
  },
  argTypes: {
    open: { control: 'boolean' },
    title: { control: 'text' },
    description: { control: 'text', description: 'corpo com dividers — opcional' },
    confirmLabel: { control: 'text', description: 'default: translation:common.confirm' },
    cancelLabel: { control: 'text', description: 'default: translation:common.cancel' },
    confirmColor: { control: 'select', options: ['error', 'primary', 'secondary', 'success', 'info', 'warning'] },
    busy: { control: 'boolean', description: 'trava fechar/cancelar/confirmar (ConfirmDialog.state)' },
    initialFocus: { control: 'select', options: ['cancel', 'confirm'] },
  },
} satisfies Meta<typeof ConfirmDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Padrão: Story = {};

export const Ocupado: Story = {
  args: {
    busy: true,
    title: 'Apagar o ficheiro?',
    description: 'A apagar "main.c" do workspace do desafio.',
    confirmLabel: 'Apagar',
  },
  parameters: {
    docs: {
      description: {
        story:
          'Com trabalho em curso, ESC/backdrop/cancelar/confirmar ficam TODOS bloqueados (`confirmDialogActionsState`) — nenhuma confirmação dupla.',
      },
    },
  },
};

export const FocoNoConfirmar: Story = {
  args: {
    initialFocus: 'confirm',
    title: 'Apagar o ficheiro?',
    description: 'A apagar "main.c" do workspace do desafio.',
    confirmLabel: 'Apagar',
    confirmColor: 'error',
  },
  parameters: {
    docs: {
      description: {
        story:
          'O padrão antigo do FileExplorer. Por omissão o foco é do CANCELAR (W18): num diálogo destrutivo o Enter nunca apaga por acidente.',
      },
    },
  },
};

export const SemDescrição: Story = {
  args: {
    title: 'Apagar "main.c"?',
    description: undefined,
    confirmLabel: 'Apagar',
  },
};

export const ConteúdoLongo: Story = {
  args: {
    title: 'Eliminar todas as trilhas e o progresso associado?',
    description:
      'Isto elimina as trilhas descarregadas, o histórico de sessões, o mapa de proficiência por conceito e todos os workspaces de desafio materializados neste computador. As chaves de API não são afetadas. Não dá para desfazer.',
    confirmLabel: 'Eliminar tudo',
  },
};
