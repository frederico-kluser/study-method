/**
 * src/components/ui/SettingsSection.stories.tsx — Componentes/UI/SettingsSection.
 *
 * O bloco de secção de Configurações (auditoria de layout §8):
 * `<section aria-labelledby>` + título + descrição — as 5 cópias de Settings
 * (SettingsView ×3, ProgressPanel, OrphanTracksPanel) aposentadas. As
 * histórias mostram o completo, sem descrição, com o `data-onboarding-target`
 * do tutorial e conteúdo longo.
 */
import type { Meta, StoryObj } from '@storybook/react';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';

import { SettingsSection } from './SettingsSection';
import { ActionButton } from './ActionButton';

const meta = {
  title: 'Componentes/UI/SettingsSection',
  component: SettingsSection,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: {
    title: 'Aparência',
    description: 'Escolhe o tema claro, escuro ou o do sistema.',
    children: <Switch aria-label="Tema escuro" />,
  },
  argTypes: {
    title: { control: 'text' },
    description: { control: 'text' },
    level: { control: 'select', options: [2, 3, 4] },
    id: { control: false },
    onboardingTarget: { control: 'text', description: 'data-onboarding-target (alvo do tutorial)' },
    children: { control: false },
  },
} satisfies Meta<typeof SettingsSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Padrão: Story = {};

export const SemDescrição: Story = {
  args: { description: undefined },
};

export const ComAlvoDoTutorial: Story = {
  args: {
    title: 'Chaves de API',
    description: 'As chaves do OpenRouter (aulas e feedback) e do Brave Search (fontes).',
    onboardingTarget: 'settings-keys-section',
    children: <ActionButton variant="outlined">Configurar chaves</ActionButton>,
  },
  parameters: {
    docs: {
      description: {
        story:
          'O `data-onboarding-target` é o alvo que o tutorial usa para apontar (3 das 5 cópias tinham-no).',
      },
    },
  },
};

export const ConteúdoLongo: Story = {
  args: {
    title: 'Modelos locais de inteligência artificial',
    description:
      'Descarrega e gere os modelos que correm neste computador para transcrição de voz, síntese de fala e assistência local sem rede.',
    children: (
      <Typography variant="body2">
        O conteúdo da secção é do chamador — painéis, listas, formulários.
      </Typography>
    ),
  },
};
