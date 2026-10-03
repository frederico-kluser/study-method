/**
 * FileExplorer.stories.tsx — a árvore de arquivos do workspace
 * (Componentes/Editor).
 *
 * Controlada: recebe a lista PLANA de `WorkspaceFile` + callbacks; a
 * expansão/seleção/diálogos são o estado puro de `lib/fileExplorerState.ts`.
 * O canvas fixo reproduz a coluna estreita que o app dá ao explorador
 * (ChallengeView: 200–240px) — sem dimensões o `height: 100%` resolve para o
 * conteúdo e o scroll some.
 */
import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { FileExplorer } from './FileExplorer';
import type { WorkspaceFile } from '../../../shared/ipc-contract';
import { withFixedCanvas } from '../../storybook/decorators';
import { fixtureEditorWorkspaceFiles } from '../../storybook/fixtures.editor';

const meta = {
  title: 'Componentes/Editor/FileExplorer',
  component: FileExplorer,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  decorators: [withFixedCanvas(320, 480)],
  args: {
    files: fixtureEditorWorkspaceFiles,
    activePath: null,
    onOpenFile: fn(),
    onCreateFile: fn(),
    onRefresh: fn(),
    onDeleteFile: fn(),
  },
} satisfies Meta<typeof FileExplorer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PastasExpandidas: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'Estado inicial: TODAS as pastas abertas (o workspace do desafio é ' +
          'pequeno; ver a árvore inteira evita um clique extra).',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // A árvore mostra os ficheiros dentro de src/ e src/deep/.
    expect(canvas.getByText('main.py')).toBeTruthy();
    expect(canvas.getByText('solver.c')).toBeTruthy();
  },
};

export const PastasRecolhidas: Story = {
  parameters: {
    docs: {
      description: {
        story: 'Clicar numa pasta recolhe-a; o clique seguinte volta a abrir.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText('src'));
    expect(canvas.queryByText('main.py')).toBeNull();
    await userEvent.click(canvas.getByText('src'));
    expect(canvas.getByText('main.py')).toBeTruthy();
  },
};

export const FicheiroSelecionado: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'Selecionar um ficheiro destaca-o na árvore, abre a aba (callback ' +
          '`onOpenFile`) e LIBERTA o botão excluir — sem seleção ele fica ' +
          'desabilitado.',
      },
    },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const deleteButton = canvas.getByRole('button', { name: 'Excluir arquivo' });
    expect(deleteButton.hasAttribute('disabled')).toBe(true);
    await userEvent.click(canvas.getByText('main.py'));
    expect(args.onOpenFile).toHaveBeenCalledWith('src/main.py');
    expect(deleteButton.hasAttribute('disabled')).toBe(false);
  },
};

export const ArvoreVazia: Story = {
  args: {
    files: [] as WorkspaceFile[],
  },
  parameters: {
    docs: {
      description: { story: 'Workspace sem ficheiros — o prompt convida a criar o primeiro.' },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByText('Workspace vazio. Crie um arquivo.')).toBeTruthy();
  },
};

export const NomesLongos: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'Nomes sem espaço que não cabem na coluna: quebram em qualquer ' +
          'ponto (`overflowWrap: anywhere`) — a política da casa é quebrar, ' +
          'nunca truncar (SC 1.4.12).',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByText(/experimento_com_nome_extremamente_longo/)).toBeTruthy();
  },
};

export const NovoFicheiro: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'O formulário de novo ficheiro: nome vazio não submete (botão ' +
          '"Criar" desabilitado); Enter ou "Criar" chamam `onCreateFile`.',
      },
    },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Novo arquivo' }));
    const input = canvas.getByPlaceholderText('novo.txt (caminho relativo)');
    await userEvent.type(input, 'src/notas.py');
    await userEvent.click(canvas.getByRole('button', { name: 'Criar' }));
    expect(args.onCreateFile).toHaveBeenCalledWith('src/notas.py');
  },
};

export const DialogoDeExclusao: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'C2 — excluir é SEMPRE a dois passos: o botão excluir abre o ' +
          'diálogo de confirmação (com o NOME do ficheiro) e só o "Excluir" ' +
          'do diálogo chama `onDeleteFile`. Um clique nunca apaga.',
      },
    },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText('fib.rs'));
    await userEvent.click(canvas.getByRole('button', { name: 'Excluir arquivo' }));
    // O diálogo é portal — procura-se no documento, e o botão destrutivo tem o
    // MESMO nome do botão da toolbar, por isso a busca é dentro do diálogo.
    const dialog = within(document.body).getByRole('dialog');
    expect(within(dialog).getByText('Apagar fib.rs?')).toBeTruthy();
    expect(args.onDeleteFile).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Excluir arquivo' }));
    expect(args.onDeleteFile).toHaveBeenCalledWith('fib.rs');
  },
};
