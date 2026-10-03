/**
 * src/components/markdown/MarkdownView.tsx — Componentes/Markdown/MarkdownView.
 *
 * A renderização de markdown do app, em UM lugar só (chat, enunciado do
 * desafio, review): react-markdown + GFM (tabelas, task lists, autolinks) +
 * KaTeX (a matemática que aparece na programação), componentes CONSTANTE de
 * módulo (nunca fábrica por render — o bloco de código não perde o scroll
 * durante a digitação) e o `CodeBlock` do app para as cercas.
 *
 * CONTEÚDO: fixtures reais pt-BR de `src/storybook/fixtures.chat.ts` — prosa
 * longa, lista (marcadores/numerada/tarefa), tabela GFM, código com saída de
 * terminal, fórmula KaTeX e o bloco de estouro (overflow).
 */
import type { Meta, StoryObj } from '@storybook/react';

import { MarkdownView } from './MarkdownView';
import { shellDecorators } from '../../storybook/decorators';
import {
  CHAT_MD_CODIGO,
  CHAT_MD_ESTOURO,
  CHAT_MD_FORMULA,
  CHAT_MD_LISTA,
  CHAT_MD_PROSA,
  CHAT_MD_RICO,
  CHAT_MD_TABELA,
} from '../../storybook/fixtures.chat';

const meta = {
  title: 'Componentes/Markdown/MarkdownView',
  component: MarkdownView,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  // O markdown vive na coluna de LEITURA (a teoria da aula tem 78% da coluna
  // dentro da bolha) — o canvas fixo é o enquadramento partilhado.
  decorators: shellDecorators({ canvas: { width: 720, height: 'auto' } }),
  args: { markdown: CHAT_MD_RICO },
  argTypes: {
    markdown: { control: 'text', description: 'markdown CRU (fixtures.chat.ts)' },
  },
} satisfies Meta<typeof MarkdownView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ConteúdoCompleto: Story = {
  args: { markdown: CHAT_MD_RICO },
};

export const ProsaLonga: Story = {
  args: { markdown: CHAT_MD_PROSA },
};

export const Lista: Story = {
  args: { markdown: CHAT_MD_LISTA },
};

export const Tabela: Story = {
  args: { markdown: CHAT_MD_TABELA },
};

export const CódigoComSaídaDeTerminal: Story = {
  args: { markdown: CHAT_MD_CODIGO },
};

export const FórmulaKaTeX: Story = {
  args: { markdown: CHAT_MD_FORMULA },
};

export const EstouroHorizontal: Story = {
  args: { markdown: CHAT_MD_ESTOURO },
};
