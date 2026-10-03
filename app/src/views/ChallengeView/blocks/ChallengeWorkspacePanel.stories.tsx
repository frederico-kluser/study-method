/**
 * blocks/ChallengeWorkspacePanel.stories.tsx — `Componentes/Desafio/
 * ChallengeWorkspacePanel` (STORY-SPEC): o editor do desafio (árvore de
 * ficheiros + EditorPane). Fala com a API falsa (`study.*` do preview) para
 * ler/gravar os ficheiros do workspace — como no app.
 */
import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { installMockApi } from '../../../storybook/mockApi';
import { fixtureWorkspaceFiles } from '../../../storybook/fixtures';
import { ChallengeWorkspacePanel } from './ChallengeWorkspacePanel';

const meta = {
  title: 'Componentes/Desafio/ChallengeWorkspacePanel',
  component: ChallengeWorkspacePanel,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: {
    workspaceDir: '/home/aluno/StudyMethod/setups/funcoes-em-python/challenges/0001-funcoes-reutilizaveis',
    files: fixtureWorkspaceFiles,
    editorRef: { current: null },
    onOpenFile: fn(),
    onCreateFile: fn(),
    onDeleteFile: fn(),
    onRefresh: fn(),
    onFilesChanged: fn(),
  },
} satisfies Meta<typeof ChallengeWorkspacePanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ComFicheiros: Story = {
  loaders: [
    async () => {
      installMockApi();
      return {};
    },
  ],
};

export const WorkspaceVazio: Story = {
  args: { files: [] },
  loaders: [
    async () => {
      installMockApi({ study: { listWorkspaceFiles: async () => [] } });
      return {};
    },
  ],
};
