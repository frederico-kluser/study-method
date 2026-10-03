/**
 * SettingsView.stories.tsx — `Vistas/SettingsView` (STORY-SPEC).
 *
 * Cada painel das Definições nos seus estados reais: Chaves (configuradas,
 * validação inválida, a validar, canal sem resposta — o honesto "Não foi
 * possível verificar" W2), IA local (modelos + download com PROGRESSO em tempo
 * real via `emitMockEvent` do mockApi), Progresso (confirmação destrutiva W18)
 * e Resquícios (listados / nada órfão / erro). Os painéis assíncronos são os
 * CONTAINERS semeados com `installMockApi`; os estados determinísticos usam as
 * views puras por args.
 */
import type { Meta, StoryObj } from '@storybook/react';
import { fixtureKeysStatus, fixtureTrackOrphans } from '../../storybook/fixtures';
import { emitMockEvent, installMockApi } from '../../storybook/mockApi';
import {
  fixtureHardwareInfo,
  fixtureLocalModels,
  settingsDownloadTicks,
  settingsOrphansList,
} from '../../storybook/fixtures.settings';
import SettingsView from './SettingsView';
import { KeysPanel } from './KeysPanel';
import { KeysPanelView, type KeysPanelViewProps } from './KeysPanelView';
import { LocalAiPanel } from './LocalAiPanel';
import { LocalAiPanelView, type LocalAiPanelViewProps } from './LocalAiPanelView';
import { OrphanTracksPanel } from './OrphanTracksPanel';
import { OrphanTracksPanelView, type OrphanTracksPanelViewProps } from './OrphanTracksPanelView';
import { ProgressPanel } from './ProgressPanel';
import { ProgressPanelView } from './ProgressPanelView';

const iaLocalBase: LocalAiPanelViewProps = {
  hardware: fixtureHardwareInfo,
  models: fixtureLocalModels,
  detecting: false,
  loadingModels: false,
  error: null,
  pendingDelete: null,
  feedbackMsg: null,
  detectMsg: '',
  downloading: null,
  downloadTicks: {},
  busy: {},
  feedbackProvider: 'openrouter',
  setPendingDelete: () => {},
  handleFeedbackProviderChange: async () => {},
  handleDetect: async () => {},
  handleDownload: async () => {},
  handleSetActive: async () => {},
  handleConfirmDelete: async () => {},
};

const resquíciosBase: OrphanTracksPanelViewProps = {
  orphans: settingsOrphansList,
  list: settingsOrphansList,
  loadError: null,
  confirmOpen: false,
  busy: false,
  feedback: null,
  load: () => {},
  handleRemove: async () => {},
  setConfirmOpen: () => {},
};

const meta = {
  title: 'Vistas/SettingsView',
  component: SettingsView,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof SettingsView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Vista completa (composição real — os painéis falam com a API falsa). */
export const ComposiçãoCompleta: Story = {};

// ─── Chaves ─────────────────────────────────────────────────────────────────

const chavesBase: KeysPanelViewProps = {
  providers: {
    openrouter: { value: '', visible: false, message: '', uiState: 'idle', saving: false },
    brave: { value: '', visible: false, message: '', uiState: 'idle', saving: false },
  },
  initialStatus: fixtureKeysStatus,
  statusError: false,
  keysConfigured: true,
  patch: () => {},
  handleSave: async () => {},
  handleValidate: async () => {},
  setReloadToken: () => {},
};

export const ChavesConfiguradas: Story = {
  render: () => <KeysPanel />,
  beforeEach: () => {
    installMockApi({ keys: { getStatus: async () => fixtureKeysStatus } });
  },
};

export const ChavesValidaçãoInválida: Story = {
  render: () => (
    <KeysPanelView
      {...chavesBase}
      providers={{
        ...chavesBase.providers,
        openrouter: {
          value: 'sk-or-v1-exemplo-de-chave-recusada',
          visible: true,
          // Espelha `translation:keys.error401` em pt-BR (conteúdo real).
          message: 'Erro 401: chave inválida ou sem permissão.',
          uiState: 'invalid',
          saving: false,
        },
      }}
    />
  ),
};

export const ChavesAValidar: Story = {
  render: () => (
    <KeysPanelView
      {...chavesBase}
      providers={{
        ...chavesBase.providers,
        openrouter: {
          value: 'sk-or-v1-exemplo',
          visible: true,
          // Espelha `translation:keys.validating` em pt-BR.
          message: 'Validando…',
          uiState: 'validating',
          saving: false,
        },
      }}
    />
  ),
};

export const ChavesSemRespostaDoCanal: Story = {
  render: () => <KeysPanel />,
  beforeEach: () => {
    installMockApi({
      keys: {
        getStatus: async () => {
          throw new Error('ipc: keys.getStatus não respondeu');
        },
      },
    });
  },
};

// ─── IA local ───────────────────────────────────────────────────────────────

export const IaLocalModelos: Story = {
  render: () => <LocalAiPanel />,
};

export const IaLocalDownloadComProgresso: Story = {
  render: () => <LocalAiPanel />,
  // O push main→renderer simulado: o painel assinou `localAi.onDownloadProgress`
  // na montagem e pinta a barra quando o tick chega.
  play: () => {
    emitMockEvent('localAi', 'onDownloadProgress', settingsDownloadTicks.meio);
  },
};

export const IaLocalHardwareDetectado: Story = {
  render: () => <LocalAiPanelView {...iaLocalBase} />,
};

export const ResquíciosComConfirmaçãoAberta: Story = {
  render: () => <OrphanTracksPanelView {...resquíciosBase} confirmOpen />,
};

// ─── Progresso ──────────────────────────────────────────────────────────────

/**
 * O painel REAL (container `ProgressPanel` — `useProgressPanel` + o
 * `study.clearProgress` pela API falsa): a secção como monta nas Definições,
 * com o botão destrutivo fechado e sem feedback.
 */
export const Progresso: Story = {
  render: () => <ProgressPanel />,
};

export const ProgressoComConfirmaçãoDestrutiva: Story = {
  render: () => (
    <ProgressPanelView
      confirmOpen
      busy={false}
      feedback={null}
      onConfirmOpen={() => {}}
      onConfirmClose={() => {}}
      onClear={async () => {}}
    />
  ),
};

// ─── Resquícios ─────────────────────────────────────────────────────────────

export const Resquícios: Story = {
  render: () => <OrphanTracksPanel />,
  beforeEach: () => {
    installMockApi({ track: { orphans: async () => fixtureTrackOrphans } });
  },
};

export const ResquíciosVazios: Story = {
  render: () => <OrphanTracksPanel />,
  beforeEach: () => {
    installMockApi({
      track: {
        orphans: async () => ({ ok: true, orphans: [], installedSlugs: ['python-iniciante'] }),
      },
    });
  },
};

export const ResquíciosComErro: Story = {
  render: () => <OrphanTracksPanel />,
  beforeEach: () => {
    installMockApi({
      track: {
        orphans: async () => {
          throw new Error('ipc: track.orphans não respondeu');
        },
      },
    });
  },
};
