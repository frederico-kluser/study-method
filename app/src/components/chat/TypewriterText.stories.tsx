/**
 * src/components/chat/TypewriterText.tsx — Componentes/Chat/TypewriterText.
 *
 * O RELÓGIO da digitação (o dono do tempo; `SegmentedMarkdown` é o dono do
 * desenho). A render-prop `children(partial, cut)` recebe o trecho já digitado
 * E o índice do corte — aqui preenchida exatamente como o app usa
 * (`ChatBubble` → `SegmentedMarkdown` sobre o MESMO texto), sem simulacro.
 *
 * ESTADOS cobertos: digitação (mensagem nova), instantâneo (bolha de erro —
 * ONDA2-CHAT-NINTENDO), restaurada (cache/seed — nunca digita) e o PULO do
 * aluno (`skip` — ONDA-SKIP-1S: varredura de ~1 s, nunca estoura na cara).
 * As interações verificáveis levam `play` (a revelação tem de TERMINAR com o
 * texto inteiro visível).
 *
 * As DECISÕES do relógio são puras (`src/lib/typewriterReveal.ts`); aqui está
 * só o fio dos timers — que em SSR não corre (o corte inicial é o de
 * `initialRevealCut`, provado em tests/typewriterReveal.test.ts).
 */
import type { Meta, StoryObj } from '@storybook/react';
import type { ReactElement } from 'react';
import { expect, within } from 'storybook/test';

import { TypewriterText } from './TypewriterText';
import { SegmentedMarkdown } from './SegmentedMarkdown';
import { shellDecorators } from '../../storybook/decorators';
import { CHAT_TEXTO_TYPEWRITER } from '../../storybook/fixtures.chat';

/** O texto curto da velocidade de LEITURA (7 tps — a teoria da aula). */
const TEXTO_LEITURA = 'Uma função transforma entradas em saídas.';

/**
 * A render-prop do app (ChatBubble → SegmentedMarkdown sobre o MESMO texto).
 * Histórias com `text` próprio repetem-no em `children` — a render-prop não
 * tem acesso aos args, e é assim que o app a constrói (a closure captura o
 * texto da mensagem).
 */
function revelarSegmentado(text: string): (partial: string, cut: number) => ReactElement {
  return (_partial: string, cut: number) => <SegmentedMarkdown markdown={text} cut={cut} />;
}

const meta = {
  title: 'Componentes/Chat/TypewriterText',
  component: TypewriterText,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  decorators: shellDecorators({ canvas: { width: 720, height: 'auto' } }),
  args: {
    text: CHAT_TEXTO_TYPEWRITER,
    active: true,
    tps: 100,
    instant: false,
    skip: false,
    children: revelarSegmentado(CHAT_TEXTO_TYPEWRITER),
  },
  argTypes: {
    text: { control: 'text', description: 'texto COMPLETO (o histórico guarda o inteiro)' },
    active: { control: 'boolean', description: 'true → digita no mount (mensagem nova)' },
    tps: { control: { type: 'number' }, description: 'tokens/s (100 livre · 10 review · 7 teoria)' },
    instant: { control: 'boolean', description: 'true → inteiro de uma vez (bolha de erro)' },
    skip: { control: 'boolean', description: 'true → varredura de ~1 s (pulo do aluno)' },
    children: {
      control: false,
      description: 'render-prop (partial, cut) → SegmentedMarkdown (uso real do app)',
    },
    onStart: { control: false },
    onDone: { control: false },
    onTick: { control: false },
  },
} satisfies Meta<typeof TypewriterText>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Digitação: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // A revelação tem de TERMINAR: o texto inteiro aparece (100 tps ≈ 400
    // chars/s; a fixture curta conclui em <1 s).
    await canvas.findByText(CHAT_TEXTO_TYPEWRITER, undefined, { timeout: 8000 });
  },
};

export const Instantâneo: Story = {
  args: { instant: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Sem passos: o texto inteiro está no PRIMEIRO quadro.
    expect(canvas.getByText(CHAT_TEXTO_TYPEWRITER)).toBeTruthy();
  },
};

export const RestauradaDoCache: Story = {
  args: { active: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByText(CHAT_TEXTO_TYPEWRITER)).toBeTruthy();
  },
};

export const PulandoADigitação: Story = {
  args: { skip: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // ONDA-SKIP-1S: o pulo varre o restante em ~1 s — nunca estoura num frame.
    await canvas.findByText(CHAT_TEXTO_TYPEWRITER, undefined, { timeout: 8000 });
  },
};

export const VelocidadeDeLeitura: Story = {
  // A teoria da aula é digitada a 7 tps (28 chars/s — chatBubbleTps); a
  // render-prop acompanha o texto (a closure captura o texto da mensagem).
  args: {
    text: TEXTO_LEITURA,
    tps: 7,
    children: revelarSegmentado(TEXTO_LEITURA),
  },
  argTypes: {
    tps: { control: { type: 'range', min: 1, max: 100, step: 1 } },
  },
};
