/**
 * src/components/chat/SegmentedMarkdown.tsx — Componentes/Chat/SegmentedMarkdown.
 *
 * A ponte entre o RELÓGIO do typewriter e a renderização segmentada: o
 * markdown COMPLETO entra (`markdown`) e o ÍNDICE do corte (`cut`) decide o
 * que já está visível — prosa cortada em fronteira segura e blocos de código
 * revelados LINHA A LINHA, já formatados. As histórias varrem o `cut` (o
 * controlo numérico documenta o efeito de digitação sem correr o relógio).
 *
 * CONTEÚDO: fixtures reais pt-BR de `src/storybook/fixtures.chat.ts` — prosa
 * longa, lista, tabela GFM, código com saída de terminal, fórmula KaTeX e
 * bloco de estouro (o `cut` total é o estado "tudo visível").
 */
import type { Meta, StoryObj } from '@storybook/react';
import { Box, Typography } from '@mui/material';

import { SegmentedMarkdown } from './SegmentedMarkdown';
import { shellDecorators } from '../../storybook/decorators';
import {
  CHAT_MD_CODIGO,
  CHAT_MD_ESTOURO,
  CHAT_MD_RICO,
} from '../../storybook/fixtures.chat';

const meta = {
  title: 'Componentes/Chat/SegmentedMarkdown',
  component: SegmentedMarkdown,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  decorators: shellDecorators({ canvas: { width: 720, height: 'auto' } }),
  args: {
    markdown: CHAT_MD_RICO,
    cut: CHAT_MD_RICO.length,
  },
  argTypes: {
    markdown: { control: false, description: 'markdown COMPLETO (fixtures.chat.ts)' },
    cut: {
      control: { type: 'range', min: 0, max: CHAT_MD_RICO.length, step: 1 },
      description: 'índice do corte (typewriter) — length = tudo visível',
    },
  },
} satisfies Meta<typeof SegmentedMarkdown>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TudoVisível: Story = {
  args: { cut: CHAT_MD_RICO.length },
};

export const CorteParcial: Story = {
  args: { cut: Math.floor(CHAT_MD_RICO.length * 0.35) },
};

export const AntesDoPrimeiroCaractere: Story = {
  args: { cut: 0 },
};

export const RevelandoCódigoLinhaALinha: Story = {
  args: {
    markdown: CHAT_MD_CODIGO,
    cut: Math.floor(CHAT_MD_CODIGO.length * 0.55),
  },
};

export const ConteúdoComEstouro: Story = {
  args: {
    markdown: CHAT_MD_ESTOURO,
    cut: CHAT_MD_ESTOURO.length,
  },
};

/**
 * A mesma mensagem em TRÊS cortes — o contrato da revelação por passos
 * (composição: a render-prop do TypewriterText entrega `(partial, cut)` e é o
 * `cut` que manda em cada quadro).
 */
export const CortesSequenciais: Story = {
  render: () => {
    const texto = 'Uma função transforma entradas em saídas — e o corte revela por partes.';
    const cortes = [0, Math.floor(texto.length / 2), texto.length];
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {cortes.map((cut) => (
          <Box key={cut} sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              cut = {cut} de {texto.length}
            </Typography>
            <SegmentedMarkdown markdown={texto} cut={cut} />
          </Box>
        ))}
      </Box>
    );
  },
};
