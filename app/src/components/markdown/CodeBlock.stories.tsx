/**
 * src/components/markdown/CodeBlock.tsx — Componentes/Markdown/CodeBlock.
 *
 * O bloco de código DE VERDADE: fonte/tamanho de `codeTheme.CODE_TYPOGRAPHY`,
 * highlight pelos 9 papéis de sintaxe (ENTRADA) e pelos 5 de estado (SAÍDA),
 * gutter de números de linha (adorno: aria-hidden + user-select:none) e a
 * distinção de FORMA entrada × saída (moldura sólida × tracejada + prefixo ❯).
 *
 * ESTADOS/Variantes: entrada (`lang` com gramática), saída (`text`/`output` —
 * o rótulo vira "Saída"), `visibleLines` (modo typewriter: a caixa reserva a
 * altura final e revela linha a linha) e o estouro horizontal (o bloco rola
 * por dentro — a bolha não cresce). INTERAÇÃO: o botão "Copiar" copia o `code`
 * CRU e confirma "Copiado ✓" por ~2 s (a máquina de estado é a pura
 * `src/lib/copyFeedbackState.ts`) — verificado com `play`.
 */
import type { Meta, StoryObj } from '@storybook/react';
import { expect, userEvent, within } from 'storybook/test';

import { CodeBlock } from './CodeBlock';
import { shellDecorators } from '../../storybook/decorators';

/** O código de ENTRADA das histórias (o que o ALUNO escreve). */
const CODIGO_ENTRADA = `from dataclasses import dataclass


@dataclass
class Contador:
    valores: list[int]
    alvo: int

    def ocorrencias(self) -> int:
        """Conta quantas vezes o alvo aparece."""
        total = 0
        for valor in self.valores:
            if valor == self.alvo:
                total += 1
        return total


print(Contador([3, 7, 3, 9, 3], 3).ocorrencias())`;

/** A SAÍDA do computador (o que o terminal responde). */
const CODIGO_SAIDA = `❯ python ocorrencias.py
3

❯ pytest test_ocorrencias.py -q
..F
FAILED test_ocorrencias.py::test_lista_vazia — TypeError: object of type 'NoneType' has no len()
✓ 2 de 3 testes passaram em 0.041s`;

/** Linha longa sem espaços — o estouro horizontal (o bloco rola por dentro). */
const CODIGO_ESTOURO = `curl -X POST https://api.exemplo.pt/v1/trilhas/python-funcoes/desafios/validar -H "Authorization: Bearer sk-proj-9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08" -d '{"submissao": "def conta(v, a): return sum(1 for x in v if x == a)"}'`;

const meta = {
  title: 'Componentes/Markdown/CodeBlock',
  component: CodeBlock,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  decorators: shellDecorators({ canvas: { width: 720, height: 'auto' } }),
  args: {
    code: CODIGO_ENTRADA,
    lang: 'python',
  },
  argTypes: {
    code: { control: 'text', description: 'conteúdo do bloco, SEM cercas' },
    lang: {
      control: 'text',
      description: "tag da cerca normalizada (`python`, `text`, `''`…)",
    },
    visibleLines: {
      control: { type: 'number', min: 0 },
      description: 'linhas já reveladas (typewriter) — vazio = todas',
    },
  },
} satisfies Meta<typeof CodeBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Entrada: Story = {
  args: { code: CODIGO_ENTRADA, lang: 'python' },
};

export const Saída: Story = {
  args: { code: CODIGO_SAIDA, lang: 'text' },
};

export const LinhasVisíveis: Story = {
  args: { code: CODIGO_ENTRADA, lang: 'python', visibleLines: 4 },
};

export const EstouroHorizontal: Story = {
  args: { code: CODIGO_ESTOURO, lang: 'text' },
};

export const SemTagDeLinguagem: Story = {
  // Tag vazia é SAÍDA (o que o computador responde — `codeFenceRole`): rótulo
  // "Saída", moldura tracejada e prefixo de terminal, como `text`.
  args: {
    code: 'escolha de um lado só: entrada com gramática, saída com estado.',
    lang: '',
  },
};

/* ─── Interação: copiar o código cru → "Copiado ✓" → repouso ────────────── */

export const CopiarCódigo: Story = {
  args: { code: CODIGO_SAIDA, lang: 'text' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // A API da área de transferência é do browser: a história FIXA uma via que
    // resolve (a cadeia real — writeText → textarea → false — está testada em
    // tests/copyToClipboard.test.ts).
    const clipOriginal = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: async () => {} },
      configurable: true,
    });
    try {
      await userEvent.click(canvas.getByRole('button', { name: 'Copiar' }));
      // Confirmação visível + aria-live (o rótulo inteiro do botão muda).
      await canvas.findByText('Copiado ✓', undefined, { timeout: 2000 });
    } finally {
      if (clipOriginal !== undefined) Object.defineProperty(navigator, 'clipboard', clipOriginal);
    }
    // O hold (~2 s, COPIED_HOLD_MS) devolve o botão ao repouso.
    await canvas.findByText('Copiar', undefined, { timeout: 5000 });
  },
};

/* ─── O estado de FALHA de cópia também é visível (W15) ─────────────────── */

export const CópiaComFalha: Story = {
  args: { code: CODIGO_ENTRADA, lang: 'python' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Sem clipboard e sem execCommand: nenhuma via funciona → o botão mostra
    // "Não foi possível copiar" em vez de fingir que copiou.
    const clipOriginal = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    const execOriginal = Object.getOwnPropertyDescriptor(document, 'execCommand');
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      configurable: true,
    });
    Object.defineProperty(document, 'execCommand', {
      value: undefined,
      configurable: true,
    });
    try {
      await userEvent.click(canvas.getByRole('button', { name: 'Copiar' }));
      await canvas.findByText('Não foi possível copiar', undefined, { timeout: 2000 });
      expect(canvas.queryByText('Copiado ✓')).toBeNull();
    } finally {
      if (clipOriginal !== undefined) Object.defineProperty(navigator, 'clipboard', clipOriginal);
      if (execOriginal !== undefined) Object.defineProperty(document, 'execCommand', execOriginal);
    }
  },
};
