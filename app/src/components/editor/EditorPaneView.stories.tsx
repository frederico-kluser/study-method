/**
 * EditorPaneView.stories.tsx — a VIEW pura do painel do editor
 * (Componentes/Editor).
 *
 * Toda a apresentação do painel SEM o container: estado por props (abas,
 * ativa, erro, ocupado), intenções por callbacks. É esta a fronteira que o
 * Storybook documenta — o container (`EditorPane.stories.tsx`) só liga o
 * reducer e o disco a estes mesmos estados.
 */
import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, within } from 'storybook/test';
import { EditorPaneView } from './EditorPaneView';
import { withFixedCanvas } from '../../storybook/decorators';
import {
  fixtureEditorTabsOverflow,
  fixtureEditorTabsUma,
  fixtureEditorTabsVarias,
} from '../../storybook/fixtures.editor';

const meta = {
  title: 'Componentes/Editor/EditorPaneView',
  component: EditorPaneView,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  decorators: [withFixedCanvas(720, 480)],
  args: {
    tabs: fixtureEditorTabsVarias,
    activePath: fixtureEditorTabsVarias[0].path,
    error: '',
    busyPath: null,
    onSaveActive: fn(),
    onActivate: fn(),
    onClose: fn(),
    onContentChange: fn(),
  },
} satisfies Meta<typeof EditorPaneView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ComFicheiroAberto: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByRole('tab', { name: /main\.py/ })).toBeTruthy();
    expect(canvas.getByRole('textbox')).toBeTruthy();
  },
};

export const Vazio: Story = {
  args: {
    tabs: [],
    activePath: null,
  },
  parameters: {
    docs: {
      description: {
        story: 'Sem abas: o prompt de seleção e o "Salvar" desabilitado.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByText(/Selecione um arquivo/)).toBeTruthy();
  },
};

export const SaveDesabilitado: Story = {
  args: {
    tabs: fixtureEditorTabsUma,
    activePath: null,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Há abas mas nenhuma ATIVA: o editor não renderiza e o "Salvar" ' +
          'fica desabilitado (o estado "desabilitado" do painel).',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const save = canvas.getByRole('button', { name: /Salvar/ });
    expect(save.hasAttribute('disabled')).toBe(true);
  },
};

export const ComAlteracoesNaoSalvas: Story = {
  args: {
    activePath: fixtureEditorTabsVarias[1].path,
  },
  parameters: {
    docs: {
      description: {
        story:
          'A aba ativa tem mudanças não salvas: ponto de marca + o texto ' +
          'para a tecnologia assistiva (a cor nunca é o único sinal).',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByText('Alterações não salvas')).toBeTruthy();
  },
};

export const Ocupado: Story = {
  args: {
    tabs: fixtureEditorTabsUma,
    activePath: null,
    busyPath: 'src/main.py',
  },
  parameters: {
    docs: {
      description: {
        story: 'Leitura em curso: o painel nomeia o ficheiro que está a abrir.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByText(/Abrindo src\/main\.py/)).toBeTruthy();
  },
};

export const ErroDeLeitura: Story = {
  args: {
    tabs: fixtureEditorTabsUma,
    activePath: null,
    error: 'Não consegui abrir "src/main.py": Error: EACCES: permissão negada',
  },
  parameters: {
    docs: {
      description: {
        story:
          'Erro de leitura/escrita: o Alert mostra a mensagem COMPLETA (com ' +
          'o path e a causa) — nada de erro genérico.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByText(/EACCES/)).toBeTruthy();
  },
};

export const MuitasAbas: Story = {
  args: {
    tabs: fixtureEditorTabsOverflow,
    activePath: fixtureEditorTabsOverflow[0].path,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Overflow de abas: a barra rola na horizontal e o editor continua ' +
          'estável — é o estado que a árvore de ficheiros grande produz.',
      },
    },
  },
};
