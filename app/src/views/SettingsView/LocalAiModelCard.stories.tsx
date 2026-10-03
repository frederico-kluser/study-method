/**
 * LocalAiModelCard.stories.tsx — `Componentes/Definições/LocalAiModelCard`
 * (STORY-SPEC): o cartão de modelo local nos seus estados — por baixar,
 * baixado, em uso, com download em progresso (barra + velocidade), com erro de
 * download (W19: detalhe técnico em legenda) e ocupado (ações desabilitadas).
 */
import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import type { LocalModelInfo } from '../../../shared/ipc-contract';
import { fixtureLocalModels } from '../../storybook/fixtures';
import { fixtureT, settingsDownloadTicks } from '../../storybook/fixtures.settings';
import { LocalAiModelCard } from './LocalAiModelCard';

const porBaixar = fixtureLocalModels[1];
const baixado = fixtureLocalModels[2];
const emUso = fixtureLocalModels[0];

const meta = {
  title: 'Componentes/Definições/LocalAiModelCard',
  component: LocalAiModelCard,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  args: {
    model: porBaixar,
    tick: undefined,
    isDownloading: false,
    pct: 0,
    busy: false,
    inUse: false,
    onDownload: fn(),
    onSetActive: fn(),
    onRequestDelete: fn(),
    tI: fixtureT,
  },
} satisfies Meta<typeof LocalAiModelCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PorBaixar: Story = {};

export const Baixado: Story = {
  args: { model: baixado },
};

export const EmUso: Story = {
  args: { model: emUso, inUse: true },
};

export const Recomendado: Story = {
  args: { model: { ...porBaixar, recommended: true } satisfies LocalModelInfo },
};

export const ComProgresso: Story = {
  args: {
    model: porBaixar,
    tick: settingsDownloadTicks.meio,
    isDownloading: true,
    pct: settingsDownloadTicks.meio.percent,
  },
};

export const DownloadComErro: Story = {
  args: {
    model: porBaixar,
    tick: settingsDownloadTicks.falhou,
    isDownloading: false,
    pct: settingsDownloadTicks.falhou.percent,
  },
};

export const Ocupado: Story = {
  args: { model: baixado, busy: true },
};

export const ConteudoLongo: Story = {
  args: {
    model: {
      ...porBaixar,
      label: 'LFM2.5-8B-A1B com rótulo comprido para testar a quebra em limites de palavra',
      quant: 'Q4_K_M_SAFETY_FINE_TUNED_LONG_CONTEXT',
      sizeBytes: 12_345_678_901,
    } satisfies LocalModelInfo,
  },
};
