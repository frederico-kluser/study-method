/**
 * AnswerTerminal.stories.tsx — o terminal xterm de saída (Componentes/Terminal).
 *
 * BLOQUEADOR CONHECIDO (RENDER-PLAYBOOK §4): o xterm mede o próprio contentor
 * — sem dimensões o FitAddon calcula 0×0 e o terminal renderiza VAZIO. Por
 * isso todas as histórias levam o canvas fixo de `storybook/decorators.tsx`
 * (`withFixedCanvas`), que é exatamente o papel do contêiner da ChallengeView.
 *
 * O xterm é imperativo: as linhas entram pelo handle (`writeLine`), como no
 * app — a casca `TerminalComLinhas` do `*.stories.helpers.ts` semeia-as.
 * Tema: o `xtermTheme` segue o app (toolbar global Tema).
 */
import type { Meta, StoryObj } from '@storybook/react';
import { expect, within } from 'storybook/test';
import { AnswerTerminal } from './AnswerTerminal';
import { TerminalComLinhas } from './AnswerTerminal.stories.helpers';
import { withFixedCanvas } from '../../storybook/decorators';
import type { TerminalBufferLine } from '../../lib/terminalBuffer';
import {
  fixtureEditorTerminalErro,
  fixtureEditorTerminalExecucao,
  fixtureEditorTerminalSaida,
} from '../../storybook/fixtures.editor';

const meta = {
  title: 'Componentes/Terminal/AnswerTerminal',
  component: AnswerTerminal,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  decorators: [withFixedCanvas(720, 360)],
  args: {
    'aria-label': 'Saída dos testes',
  },
} satisfies Meta<typeof AnswerTerminal>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * `render` de COMPOSIÇÃO (STORY-SPEC §3): o produto não tem prop de linhas —
 * a saída entra pelo handle imperativo — então cada história semeia o handle
 * pela mesma via do app (a casca `TerminalComLinhas`).
 */
function withLines(lines: readonly TerminalBufferLine[]): Story['render'] {
  return (args) => <TerminalComLinhas lines={lines} aria-label={args['aria-label']} />;
}

export const Vazio: Story = {
  render: withLines([]),
  parameters: {
    docs: {
      description: {
        story:
          'Terminal recém-montado: região `role="log"` nomeada, sem linhas. ' +
          'A saída entra pelo handle imperativo (`writeLine`), tal como a ' +
          'ChallengeView faz.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByRole('log').getAttribute('aria-label')).toBe('Saída dos testes');
  },
};

export const ComLinhasDeSaida: Story = {
  render: withLines(fixtureEditorTerminalSaida),
  parameters: {
    docs: {
      description: {
        story:
          'Uma rodada de testes PASSOU: linhas na cor semântica de cada uma ' +
          '(accent/default/muted/green — a paleta real vem de `lib/codeTheme`).',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByText('PASSOU')).toBeTruthy();
    expect(canvas.getByText('3 de 3 testes')).toBeTruthy();
  },
};

export const EstadoDeExecucao: Story = {
  render: withLines(fixtureEditorTerminalExecucao),
  parameters: {
    docs: {
      description: {
        story: 'Execução em curso: a saída ainda não tem veredicto.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByText('A executar a fase determinística…')).toBeTruthy();
  },
};

export const ComErro: Story = {
  render: withLines(fixtureEditorTerminalErro),
  parameters: {
    docs: {
      description: {
        story:
          'Fase determinística com falha: o veredicto e o erro pintam-se em ' +
          'vermelho da paleta (nome semântico `red` — nunca hex na história).',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByText('NÃO PASSOU')).toBeTruthy();
  },
};
