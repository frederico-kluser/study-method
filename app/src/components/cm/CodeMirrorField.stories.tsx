/**
 * CodeMirrorField.stories.tsx — o editor de código (Componentes/CodeMirror).
 *
 * O editor mede o PRÓPRIO contentor: o canvas fixo do decorator dá-lhe
 * largura/altura reais (sem dimensões o CodeMirror renderiza colapsado —
 * RENDER-PLAYBOOK §4). A polaridade segue o hook de tema `useCodeScheme`, ou
 * seja a toolbar global "Tema" (Claro/Escuro) repinta o `codeTheme` real do
 * app; a prop `scheme` fixa-a quando o dono quer.
 */
import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, isMockFunction, userEvent, within } from 'storybook/test';
import { CodeMirrorField } from './CodeMirrorField';
import { withFixedCanvas } from '../../storybook/decorators';
import {
  fixtureEditorCodeC,
  fixtureEditorCodePython,
  fixtureEditorCodeRust,
} from '../../storybook/fixtures.editor';

/** O browser onde as histórias correm é macOS? (decide a tecla do `Mod-s`). */
function isMacBrowser(): boolean {
  return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
}

const meta = {
  title: 'Componentes/CodeMirror/CodeMirrorField',
  component: CodeMirrorField,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  decorators: [withFixedCanvas(720, 360)],
  args: {
    value: fixtureEditorCodePython,
    onChange: fn(),
    filename: 'main.py',
    ariaLabel: 'Editor de código — src/main.py',
    readOnly: false,
  },
  argTypes: {
    scheme: {
      control: { type: 'select' },
      options: ['auto (tema do app)', 'light', 'dark'],
      mapping: { 'auto (tema do app)': undefined, light: 'light', dark: 'dark' },
      description:
        'Polaridade FORÇADA do tema de código. "auto" segue o tema do app ' +
        '(toolbar global Tema) — é o comportamento do produto.',
    },
    minHeight: {
      control: 'text',
      description: "Piso de altura (ex.: '220px') quando o pai não tem altura definida.",
    },
  },
} satisfies Meta<typeof CodeMirrorField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Padrao: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'Código Python com o tema de código REAL do app (`lib/codeTheme.ts`). ' +
          'Troque a toolbar "Tema" para Claro/Escuro: o editor repinta — sem ' +
          'cor fixa em lado nenhum.',
      },
    },
  },
};

export const LinguagemC: Story = {
  args: {
    value: fixtureEditorCodeC,
    filename: 'solver.c',
    ariaLabel: 'Editor de código — src/deep/solver.c',
  },
  parameters: {
    docs: {
      description: {
        story: 'Realce C via gramática Lezer dedicada (`@codemirror/lang-cpp`).',
      },
    },
  },
};

export const LinguagemRust: Story = {
  args: {
    value: fixtureEditorCodeRust,
    filename: 'fib.rs',
    ariaLabel: 'Editor de código — fib.rs',
  },
};

export const SomenteLeitura: Story = {
  args: {
    readOnly: true,
    value: fixtureEditorCodePython,
  },
  parameters: {
    docs: {
      description: { story: '`readOnly` — o conteúdo mostra-se, não se edita.' },
    },
  },
};

export const ComFoco: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'Foco real no conteúdo do editor (o anel de foco é o do tema — ' +
          '`*:focus-visible` do CssBaseline).',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const content = canvas.getByRole('textbox');
    await userEvent.click(content);
    expect(content).toBe(document.activeElement);
  },
};

export const ComSalvar: Story = {
  args: {
    onSave: fn(),
  },
  parameters: {
    docs: {
      description: {
        story:
          'Ctrl/Cmd+S dentro do editor dispara `onSave` (keymap de alta ' +
          'precedência que também engole o diálogo de guardar do browser).',
      },
    },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const content = canvas.getByRole('textbox');
    await userEvent.click(content);
    // `Mod-s` resolve por plataforma do browser: Ctrl no Linux/Windows, ⌘ no
    // macOS. Dispara a do SO atual e só tenta a outra se nada chegou — nunca
    // as duas (a não-interceptada abriria o diálogo de guardar do browser).
    if (isMacBrowser()) {
      await userEvent.keyboard('{Meta>}s{/Meta}');
    } else {
      await userEvent.keyboard('{Control>}s{/Control}');
    }
    if (isMockFunction(args.onSave) && args.onSave.mock.calls.length === 0) {
      await userEvent.keyboard('{Meta>}s{/Meta}');
      await userEvent.keyboard('{Control>}s{/Control}');
    }
    expect(args.onSave).toHaveBeenCalled();
  },
};

export const TemaClaro: Story = {
  args: {
    scheme: 'light',
  },
  parameters: {
    docs: {
      description: {
        story: 'Polaridade FORÇADA clara (prop `scheme`) — fora do toolbar global.',
      },
    },
  },
};

export const TemaEscuro: Story = {
  args: {
    scheme: 'dark',
  },
  parameters: {
    docs: {
      description: {
        story: 'Polaridade FORÇADA escura (prop `scheme`) — fora do toolbar global.',
      },
    },
  },
};
