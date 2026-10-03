/**
 * EditorTabs.stories.tsx — a barra de abas do editor (Componentes/Editor).
 *
 * A barra é CONTROLADA (recebe abas + callbacks, sem estado próprio): as
 * histórias mostram o vocabulário inteiro — 1 aba, várias, overflow com
 * scroll, ativa, ícone por linguagem, "não salvo" para AT, fecho focável — e
 * as interações são verificadas com `play` (`storybook/test`).
 *
 * Tema: nenhuma cor fixa aqui — a toolbar global (Claro/Escuro) repinta tudo.
 */
import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { EditorTabs } from './EditorTabs';
import type { EditorTab } from '../../lib/editorTabs';
import {
  fixtureEditorTabsUma,
  fixtureEditorTabsVarias,
  fixtureEditorTabsOverflow,
} from '../../storybook/fixtures.editor';

const meta = {
  title: 'Componentes/Editor/EditorTabs',
  component: EditorTabs,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: {
    tabs: fixtureEditorTabsVarias,
    activePath: fixtureEditorTabsVarias[0].path,
    onActivate: fn(),
    onClose: fn(),
  },
  argTypes: {
    activePath: {
      control: 'select',
      description: 'Path da aba ativa (null = nenhuma).',
      options: ['(nenhuma)', ...fixtureEditorTabsVarias.map((t) => t.path)],
      mapping: { '(nenhuma)': null, ...Object.fromEntries(fixtureEditorTabsVarias.map((t) => [t.path, t.path])) },
    },
  },
} satisfies Meta<typeof EditorTabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Padrão: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // A barra é uma tablist válida; a aba ativa é aria-selected.
    const tablist = canvas.getByRole('tablist');
    expect(tablist).toBeTruthy();
    const active = canvas.getByRole('tab', { name: /main\.py/ });
    expect(active.getAttribute('aria-selected')).toBe('true');
  },
};

export const UmaAba: Story = {
  args: {
    tabs: fixtureEditorTabsUma,
    activePath: fixtureEditorTabsUma[0].path,
  },
};

export const Overflow: Story = {
  args: {
    tabs: fixtureEditorTabsOverflow,
    activePath: fixtureEditorTabsOverflow[0].path,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Abas a mais do que a largura: a barra ganha scroll horizontal ' +
          '(`overflowX: auto`) e cada aba mantém o nome inteiro (quebra, nunca trunca).',
      },
    },
  },
};

export const AbaAtiva: Story = {
  args: {
    tabs: fixtureEditorTabsVarias,
    activePath: fixtureEditorTabsVarias[1].path,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByRole('tab', { name: /fib\.rs/ }).getAttribute('aria-selected')).toBe('true');
  },
};

export const ComAlteracoesNaoSalvas: Story = {
  args: {
    tabs: fixtureEditorTabsVarias,
    activePath: fixtureEditorTabsVarias[1].path,
  },
  parameters: {
    docs: {
      description: {
        story:
          'A aba suja mostra a marca visual (ponto) e anuncia "Alterações não ' +
          'salvas" em TEXTO à tecnologia assistiva — a cor nunca é o único sinal.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByText('Alterações não salvas')).toBeTruthy();
  },
};

export const IconePorLinguagem: Story = {
  args: {
    tabs: fixtureEditorTabsOverflow,
    activePath: fixtureEditorTabsOverflow[0].path,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Cada aba leva o ícone da FAMÍLIA do ficheiro (código, dados, ' +
          'documento, texto — decisão pura de `lib/editorLanguage.ts`). O ' +
          'ícone é decorativo (`aria-hidden`): o nome acessível da aba é o ' +
          'nome do ficheiro.',
      },
    },
  },
};

export const FecharAba: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'O fecho é um botão DENTRO da aba: focável, nomeado "Fechar {{name}}" ' +
          'e com o clique isolado (`stopPropagation`) — fechar nunca ativa a aba.',
      },
    },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Fechar main.py' }));
    expect(args.onClose).toHaveBeenCalledWith('src/main.py');
    expect(args.onActivate).not.toHaveBeenCalled();
  },
};

export const SemAbas: Story = {
  args: {
    tabs: [] as EditorTab[],
    activePath: null,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Sem abas a barra retorna `null` — quem mostra o estado vazio é o ' +
          'EditorPane (o prompt "Selecione um arquivo…").',
      },
    },
  },
};
