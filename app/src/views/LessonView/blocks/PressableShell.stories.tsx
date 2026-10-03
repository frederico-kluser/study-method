/**
 * Componentes/Aula/PressableShell — a casca de press-feedback dos botões da
 * aula (alias do primitivo `components/ui/Pressable`; audit §2). O gesto:
 * scale 0.98 com spring snappy, e a casca NUNCA é parada de tab (tabIndex=-1).
 */
import type { Meta, StoryObj } from '@storybook/react';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import SendIcon from '@mui/icons-material/Send';
import { PressableShell } from './PressableShell';

const meta = {
  title: 'Componentes/Aula/PressableShell',
  component: PressableShell,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  args: {
    children: <Button variant="contained">Avançar</Button>,
  },
} satisfies Meta<typeof PressableShell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BotãoDeAção: Story = {};

export const BotãoDeÍcone: Story = {
  args: {
    children: (
      <IconButton aria-label="Enviar">
        <SendIcon fontSize="small" />
      </IconButton>
    ),
  },
};
