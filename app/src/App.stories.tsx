/**
 * App.stories.tsx — `Vistas/App` (STORY-SPEC): o SHELL COMPLETO do produto.
 *
 * Esta é a story do CONTAINER raiz (`src/App.tsx` — `App`), a demonstração do
 * produto inteiro: NavigationRail + SessionFrame + divisória arrastável + a
 * view ativa (Início), mais o que vive fora do Shell e sobrevive à navegação
 * (`OnboardingHost`, `ChallengeGenerateModal`, `QuizOverlayHost`,
 * `GlobalBusyIndicator`). Ao contrário das stories de `Vistas/*` — que
 * renderizam as views PURAS por props — aqui entra a árvore REAL, com o estado
 * a vir do `installMockApi` do preview (mesmos canais IPC do app).
 *
 * ─── PORQUÊ ESTE CAMINHO (`src/App.stories.tsx`) ───────────────────────────
 * A história fica AO LADO do componente (STORY-SPEC §1) porque é aí que o
 * gate `tools/storybook-coverage.ts` procura: uma story do `App` noutro
 * diretório (`src/storybook/`) não casa com o componente e a cobertura ficava
 * em 112/113. O título (`Vistas/App`) é o que manda na árvore do catálogo.
 *
 * ─── O QUE A STORY SEMEIA (e porquê) ───────────────────────────────────────
 *  - `StartupCtx` com o `fixtureStartupStatus` (fase 'ready'): em produção é o
 *    `AppGate` que envolve o `<App/>` com este contexto — sem ele o
 *    `OnboardingHost` nunca destrava (`isReady`). Os flags derivam do MESMO
 *    `applyOfflineFlags` do gate, não de literais.
 *  - o latch de oferta do tutorial (`onboardingStorageService`): num browser
 *    limpo do Storybook a oferta de primeira execução abriria o modal por cima
 *    do shell. `ShellCompleto` semeia "quem já decidiu" (o shell limpo);
 *    `PrimeiraExecucao` semeia "utilizador novo" e mostra o modal — o
 *    comportamento real do primeiro arranque (o mesmo registo de
 *    `Funcionalidades/Onboarding/OnboardingHost`).
 *  - os decorators partilhados (`shellDecorators` de `src/storybook/decorators`)
 *    — o canvas de dimensões fixas que o `ResizeObserver` do split precisa.
 *    O slot lateral NÃO é montado pelo decorator: o `SessionFrame` do App já
 *    tem o contêiner-slot dele (dois nós com o mesmo id seriam mentira).
 */
import type { Decorator, Meta, StoryObj } from '@storybook/react';
import type { ReactElement } from 'react';
import App from './App';
import { StartupCtx } from './gate/AppGate';
import { applyOfflineFlags } from './gate/startupState';
import { onboardingStorageService } from './features/onboarding/services/onboardingStorage.service';
import { shellDecorators } from './storybook/decorators';
import { fixtureStartupStatus } from './storybook/fixtures';

/**
 * O gate de arranque semeado — em produção é o `AppGate` que publica este
 * contexto à volta do `<App/>`. O `recheck` é um no-op tipado (não há canal
 * real por trás; o `installMockApi` responde ao `keys.startupStatus`).
 */
const withStartupReady: Decorator = (Story): ReactElement => (
  <StartupCtx.Provider
    value={{
      status: fixtureStartupStatus,
      flags: applyOfflineFlags(fixtureStartupStatus),
      recheck: async () => {},
    }}
  >
    <Story />
  </StartupCtx.Provider>
);

/** "Quem já decidiu": oferta de primeira execução já mostrada (one-shot). */
function semearUtilizadorComDecisao(): void {
  onboardingStorageService.clear();
  onboardingStorageService.markTutorialSelectionOffered();
}

/** "Utilizador novo": sem oferta registada ⇒ o modal abre UMA vez. */
function semearUtilizadorNovo(): void {
  onboardingStorageService.clear();
  onboardingStorageService.markTutorialSelectionOffered();
  // O latch da oferta é uma flag própria (o service só sabe MARCÁ-la) — a
  // story de primeiro arranque limpa-a para o estado de fábrica.
  globalThis.localStorage?.removeItem('study-method-onboarding-offered-v1');
}

const meta = {
  title: 'Vistas/App',
  component: App,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  decorators: [withStartupReady, ...shellDecorators({ canvas: { width: '100%', height: 680 } })],
} satisfies Meta<typeof App>;

export default meta;
type Story = StoryObj<typeof meta>;

/** O shell completo, app destravado (fase 'ready') e Início com dados reais. */
export const ShellCompleto: Story = {
  beforeEach: semearUtilizadorComDecisao,
};

/**
 * O PRIMEIRO arranque: a oferta de primeira execução ("Quer um tour?") abre
 * UMA vez sobre o shell — o comportamento real do produto recém-instalado.
 */
export const PrimeiraExecucao: Story = {
  beforeEach: semearUtilizadorNovo,
};
