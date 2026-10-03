/**
 * src/components/chat/TypingIndicator.tsx — Componentes/Chat/TypingIndicator.
 *
 * "O tutor está digitando…" como uma MENSAGEM CHEGANDO: a MESMA casca
 * (`bubbleShellStyle` no tom `tutor`) e o MESMO cabeçalho (avatar + nome) da
 * bolha real — o indicador e a bolha ocupam o mesmo lugar em momentos
 * diferentes, e qualquer diferença de geometria entre os dois volta a ser o
 * salto de layout que este componente veio matar (provado na história
 * `NoFluxoDoChat`).
 *
 * Sem props: o componente SÓ existe no DOM enquanto a digitação está ativa
 * (mount condicional — nunca oculto por CSS), `role="status"` com rótulo i18n
 * e o laço de pulso desligado sob `prefers-reduced-motion` (SC 2.3.3 — o
 * toolbar global "Movimento" força o modo para capturas determinísticas).
 */
import type { Meta, StoryObj } from '@storybook/react';
import type { ReactElement } from 'react';
import { Box } from '@mui/material';

import { TypingIndicator } from './TypingIndicator';
import { ChatBubble } from './ChatBubble';
import { shellDecorators } from '../../storybook/decorators';
import { mensagemTutor } from '../../storybook/fixtures.chat';

const meta = {
  title: 'Componentes/Chat/TypingIndicator',
  component: TypingIndicator,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  decorators: shellDecorators({ canvas: { width: 720, height: 'auto' } }),
} satisfies Meta<typeof TypingIndicator>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Padrão: Story = {};

/**
 * O contrato de estabilidade: o indicador ocupa o MESMO lugar da bolha que
 * vai substituí-lo — quando a mensagem chega, nada salta.
 */
export const NoFluxoDoChat: Story = {
  render: (): ReactElement => (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <TypingIndicator />
      <ChatBubble message={mensagemTutor()} isNew={false} />
    </Box>
  ),
};
