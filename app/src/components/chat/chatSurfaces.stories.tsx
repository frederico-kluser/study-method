/**
 * src/components/chat/chatSurfaces.tsx — Componentes/Chat/ChatAvatar.
 *
 * A CASCA do balão e o avatar do autor num lugar só (a bolha e o indicador
 * "digitando" são o MESMO objeto visual). `ChatAvatar` é o único componente
 * visual exportado; os helpers de estilo (`bubbleShellStyle`, `bubbleRadius`,
 * `bubbleRestShadow`, `CHAT_AVATAR_SIZE`, `USER_BUBBLE_TINT_PCT`) são o
 * vocabulário de superfície do chat — documentados aqui na história
 * `SuperficiesDoBalão` (as cinco tonalidades de `chatBubbleTone`), porque é
 * isto que um redesign lê para redesenhar as cascas sem as re-inventar.
 *
 * Nada de cor escrita à mão (regra do design system): as cascas resolvem
 * `theme.vars.palette.*` do tema real, tal como em produção.
 */
import type { Meta, StoryObj } from '@storybook/react';
import type { ReactElement } from 'react';
import { Box, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';

import {
  ChatAvatar,
  bubbleRestShadow,
  bubbleShellStyle,
} from './chatSurfaces';
import type { ChatBubbleTone } from '../../lib/chatBubbleStyle';
import { shellDecorators } from '../../storybook/decorators';

const meta = {
  title: 'Componentes/Chat/ChatAvatar',
  component: ChatAvatar,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  decorators: shellDecorators({ canvas: false }),
  args: { isUser: false, label: 'Tutor' },
  argTypes: {
    isUser: { control: 'boolean', description: 'aluno (acento cheio) × tutor (neutro)' },
    label: { control: 'text', description: 'nome acessível (aria-label) — i18n no app' },
  },
} satisfies Meta<typeof ChatAvatar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Tutor: Story = {
  args: { isUser: false, label: 'Tutor' },
};

export const Aluno: Story = {
  args: { isUser: true, label: 'Você' },
};

/* ─── O vocabulário de superfícies (bubbleShellStyle) ───────────────────── */

const TONS: ReadonlyArray<{ tone: ChatBubbleTone; nome: string }> = [
  { tone: 'tutor', nome: 'tutor · teoria' },
  { tone: 'reply', nome: 'reply · resposta à dúvida' },
  { tone: 'user', nome: 'user · aluno' },
  { tone: 'approved', nome: 'approved · review aprovada' },
  { tone: 'error', nome: 'error · review com erro' },
];

/** Uma casca de balão num tom (view de story: só desenha o helper real). */
function CascaDoBalão({ tone, nome }: { tone: ChatBubbleTone; nome: string }): ReactElement {
  const theme = useTheme();
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, alignItems: 'flex-start' }}>
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {nome} · sombra de repouso {bubbleRestShadow(theme, tone)}
      </Typography>
      <Box component="div" style={bubbleShellStyle(theme, tone, false)}>
        <Typography variant="body2">A teoria da aula mora dentro deste balão.</Typography>
      </Box>
    </Box>
  );
}

/**
 * As cinco tonalidades (`chatBubbleTone`) — a superfície de leitura pura do
 * tutor, o tint de 43% do aluno e os DOIS estados de review (borda tingida).
 */
export const SuperficiesDoBalão: Story = {
  render: () => (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, p: 1 }}>
      {TONS.map(({ tone, nome }) => (
        <CascaDoBalão key={tone} tone={tone} nome={nome} />
      ))}
    </Box>
  ),
};
