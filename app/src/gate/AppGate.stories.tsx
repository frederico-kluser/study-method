/**
 * AppGate.stories.tsx — `Vistas/AppGate` (STORY-SPEC).
 *
 * As fases REAIS do arranque (a decisão é pura — `resolveGatePhase` em
 * `gate/startupState.ts`): a ler chaves (splash), setup obrigatório (o
 * SetupView real, semeados os canais com `installMockApi`), offline com aviso
 * (banner + app) e liberado. O conteúdo do app entra como SLOT (`app`) — no
 * container real é `<App/>`; aqui é um nó leve para documentar as fases sem
 * montar o shell inteiro.
 *
 * EXCEÇÃO documentada: `ContêinerReal` monta o CONTAINER `AppGate` (o export
 * público que o `main.tsx` usa) — o gate de cobertura exige a referência ao
 * container, e é a única story que prova o arranque de ponta a ponta
 * (`useStartupGate` → fases → `<App/>`) com a API falsa do catálogo.
 */
import type { Meta, StoryObj } from '@storybook/react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { installMockApi } from '../storybook/mockApi';
import {
  settingsStartupBlocked,
  settingsStartupBlockedInvalidKeys,
  settingsStartupOffline,
  settingsStartupReady,
  settingsValidationInvalidBrave,
} from '../storybook/fixtures.settings';
import { onboardingStorageService } from '../features/onboarding/services/onboardingStorage.service';
import { AppGate } from './AppGate';
import { AppGateView, OfflineBanner } from './AppGateView';

/** O slot do app: no container real é `<App/>` (shell completo). */
const appSlot = (
  <Box sx={{ p: 2 }}>
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        {`Conteúdo do app (o container passa <App/>).`}
      </Typography>
    </Paper>
  </Box>
);

const meta = {
  title: 'Vistas/AppGate',
  component: AppGateView,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  args: {
    phase: 'ready',
    app: appSlot,
    onRetry: () => {},
    onSetupDone: () => {},
    startupStatus: settingsStartupReady,
  },
} satisfies Meta<typeof AppGateView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ALerChaves: Story = {
  args: { phase: 'splash', startupStatus: null },
};

export const SetupObrigatório: Story = {
  args: { phase: 'setup', startupStatus: settingsStartupBlocked },
  // Semeia os canais do SetupView (validação das chaves digitadas).
  beforeEach: () => {
    installMockApi({
      keys: {
        validateLlm: async () => settingsValidationInvalidBrave,
        validateBrave: async () => settingsValidationInvalidBrave,
      },
    });
  },
};

export const SetupComChavesInválidas: Story = {
  args: { phase: 'setup', startupStatus: settingsStartupBlockedInvalidKeys },
};

export const OfflineComAviso: Story = {
  args: { phase: 'offline', startupStatus: settingsStartupOffline },
};

export const Liberado: Story = {
  args: { phase: 'ready', startupStatus: settingsStartupReady },
};

export const ErroDoGate: Story = {
  args: { phase: 'error-timeout', startupStatus: null },
};

/** O aviso offline isolado (fora do app — o que o banner mostra no topo). */
export const BannerOffline: Story = {
  render: () => <OfflineBanner />,
  parameters: { layout: 'padded' },
};

/**
 * O CONTAINER real (`AppGate` — o export que o `main.tsx` monta) a correr de
 * ponta a ponta: o gate consulta `keys.startupStatus` (API falsa do catálogo),
 * resolve a fase e monta o `<App/>` completo dentro do `StartupCtx`. É o
 * arranque do produto sem Electron.
 */
export const ContêinerReal: Story = {
  render: () => (
    <Box sx={{ height: 640, overflow: 'hidden' }}>
      <AppGate />
    </Box>
  ),
  // O shell inclui o OnboardingHost: "quem já decidiu" mantém o arranque limpo
  // (a oferta de primeira execução está documentada em
  // `Funcionalidades/Onboarding/OnboardingHost` e em `Vistas/App`).
  beforeEach: () => {
    onboardingStorageService.clear();
    onboardingStorageService.markTutorialSelectionOffered();
  },
};
