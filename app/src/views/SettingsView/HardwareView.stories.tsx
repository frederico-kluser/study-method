/**
 * HardwareView.stories.tsx — `Componentes/Definições/HardwareView`
 * (STORY-SPEC): o hardware detectado do painel de IA local.
 */
import type { Meta, StoryObj } from '@storybook/react';
import { fixtureHardwareInfo } from '../../storybook/fixtures';
import {
  settingsHardwareCpuLongo,
  settingsHardwareNoVram,
} from '../../storybook/fixtures.settings';
import { HardwareView } from './HardwareView';

const meta = {
  title: 'Componentes/Definições/HardwareView',
  component: HardwareView,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  args: {
    info: fixtureHardwareInfo,
  },
} satisfies Meta<typeof HardwareView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Padrao: Story = {};

export const SemVram: Story = {
  args: { info: settingsHardwareNoVram },
};

export const ConteudoLongo: Story = {
  args: { info: settingsHardwareCpuLongo },
};
