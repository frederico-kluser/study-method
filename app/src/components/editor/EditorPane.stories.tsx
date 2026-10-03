/**
 * EditorPane.stories.tsx — o CONTAINER do painel do editor
 * (Componentes/Editor).
 *
 * É o componente que a ChallengeView monta: amarra o reducer puro de abas ao
 * IPC de workspace. O disco daqui é falso — `installMockApi` (o preview já
 * instala o global; estas histórias sobrescrevem só o `study.readWorkspaceFile`
 * quando precisam de um erro de leitura). Os ESTADOS puros do painel (vazio,
 * erro, ocupado, desabilitado) vivem na história da view
 * (`EditorPaneView.stories.tsx`), que não precisa de API nenhuma.
 */
import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, within } from 'storybook/test';
import { EditorPane } from './EditorPane';
import { EditorPaneDemo } from './EditorPane.stories.helpers';
import { installMockApi } from '../../storybook/mockApi';
import { fixtureWorkspaceFiles } from '../../storybook/fixtures';
import { FIXTURE_EDITOR_WORKSPACE_DIR } from '../../storybook/fixtures.editor';
import { withFixedCanvas } from '../../storybook/decorators';

const meta = {
  title: 'Componentes/Editor/EditorPane',
  component: EditorPane,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  decorators: [withFixedCanvas(720, 480)],
  args: {
    workspaceDir: FIXTURE_EDITOR_WORKSPACE_DIR,
    files: fixtureWorkspaceFiles,
    onFilesChanged: fn(),
  },
} satisfies Meta<typeof EditorPane>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Vazio: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'Nenhuma aba aberta: o prompt convida a selecionar um ficheiro e o ' +
          '"Salvar" fica DESABILITADO.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByText(/Selecione um arquivo/)).toBeTruthy();
  },
};

export const ComFicheiroAberto: Story = {
  render: (args) => <EditorPaneDemo {...args} openOnMount="solution.py" />,
  parameters: {
    docs: {
      description: {
        story:
          'Um ficheiro aberto pelo handle (`openFile`) — o conteúdo vem do ' +
          '`study.readWorkspaceFile` do mock: aba ativa, editor e "Salvar" ' +
          'habilitado.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByRole('tab', { name: /solution\.py/ })).toBeTruthy();
    expect(canvas.getByRole('textbox')).toBeTruthy();
  },
};

export const ErroDeLeitura: Story = {
  render: (args) => <EditorPaneDemo {...args} openOnMount="solution.py" />,
  beforeEach: () => {
    // Só o método de leitura falha; o resto do mock continua realista.
    installMockApi({
      study: {
        readWorkspaceFile: async () => {
          throw new Error('EACCES: permissão negada');
        },
      },
    });
  },
  parameters: {
    docs: {
      description: {
        story:
          'A leitura do disco falha: o painel mostra o erro (com o path) e ' +
          'NÃO regista aba — o trabalho do utilizador nunca some em silêncio.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByText(/EACCES/)).toBeTruthy();
  },
};
