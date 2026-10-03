/**
 * Funcionalidades/Onboarding/OnboardingHost — o HOST do tutorial: a composição
 * real que junta a máquina (`useOnboarding`), a oferta de primeira execução
 * (`useFirstRunTutorialPrompt`), a dica pós-tutorial (`useHelpHint`), o modal
 * de seleção (com gate de chaves via `keys.getStatus`) e o overlay.
 *
 * O que estas histórias documentam:
 *   - a OFERTA de primeira execução: utilizador novo (`not_started`, oferta
 *     nunca mostrada) + gate liberado + aba Início ⇒ o modal "Quer um tour?"
 *     abre UMA vez (o latch one-shot vive em `onboardingStorageService`);
 *   - o GATE de chaves do Tutorial Completo (IPC real `keys.getStatus` pela
 *     API falsa do catálogo): sem OpenRouter/Brave o tour completo nasce
 *     desabilitado com o CTA "Configurar chaves";
 *   - os estados de silêncio honestos: antes do startup-gate (`isReady:
 *     false`) NADA abre, e quem já decidiu não é re-ofertado.
 *
 * O estado do host é REAL (localStorage + máquina do tutorial); as histórias
 * semeiam o ambiente — nunca o comportamento. Os modais vão para
 * `document.body` (portal): as `play` procuram lá.
 */
import type { Meta, StoryObj } from '@storybook/react';
import { expect, within } from 'storybook/test';
import { OnboardingHost } from './OnboardingHost';
import { onboardingStorageService } from './services/onboardingStorage.service';
import { installMockApi } from '../../storybook/mockApi';
import { fixtureKeysStatus } from '../../storybook/fixtures';

/** As chaves do latch de oferta (o mesmo nome de `onboardingStorage.service`). */
const OFFERED_KEY = 'study-method-onboarding-offered-v1';

/** O host vive no app; os modais vão para `document.body` (portal). */
function corpoDoDocumento(): ReturnType<typeof within> {
  return within(document.body);
}

/** Semeia "utilizador novo": sem oferta registada, sem progresso. */
function semearUtilizadorNovo(): void {
  onboardingStorageService.clear();
  globalThis.localStorage?.removeItem(OFFERED_KEY);
}

/** Semeia "quem já decidiu": oferta registada, tutorial concluído. */
function semearUtilizadorComDecisao(): void {
  onboardingStorageService.clear();
  globalThis.localStorage?.setItem(OFFERED_KEY, '1');
  onboardingStorageService.save({
    status: 'completed',
    currentStepId: 'tour-complete',
    updatedAt: Date.now(),
  });
}

const meta = {
  title: 'Funcionalidades/Onboarding/OnboardingHost',
  component: OnboardingHost,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: {
    isReady: true,
    activeView: 'home',
    onNavigateView: (view) => console.debug('[storybook] onNavigateView', view),
  },
  argTypes: {
    isReady: { control: 'boolean' },
    activeView: { control: 'select', options: ['home', 'settings', 'lesson', 'roadmap', 'games', 'challenge'] },
  },
} satisfies Meta<typeof OnboardingHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Oferta de primeira execução: o utilizador novo vê "Quer um tour?" UMA vez. */
export const OfertaDePrimeiraExecucao: Story = {
  beforeEach: () => {
    semearUtilizadorNovo();
    return () => onboardingStorageService.clear();
  },
  play: async () => {
    const tela = corpoDoDocumento();
    await tela.findByRole('heading', { name: 'Quer um tour?' });
  },
};

/**
 * Gate de chaves (IPC real pela API falsa): sem OpenRouter/Brave o "Tour
 * completo" nasce desabilitado com o CTA "Configurar chaves".
 */
export const OfertaSemChaves: Story = {
  beforeEach: () => {
    semearUtilizadorNovo();
    installMockApi({
      keys: {
        getStatus: async () => ({
          ...fixtureKeysStatus,
          llmConfigured: false,
          braveConfigured: false,
        }),
      },
    });
    return () => onboardingStorageService.clear();
  },
  play: async () => {
    const tela = corpoDoDocumento();
    await tela.findByText('Requer chaves de API');
    expect((await tela.findByTestId('tutorial-option-full')).getAttribute('disabled')).not.toBeNull();
  },
};

/** Antes do startup-gate: o onboarding NUNCA abre (`isReady: false`). */
export const AntesDoGate: Story = {
  args: { isReady: false },
  beforeEach: () => {
    semearUtilizadorNovo();
    return () => onboardingStorageService.clear();
  },
  play: async () => {
    expect(corpoDoDocumento().queryByRole('dialog')).toBeNull();
    expect(corpoDoDocumento().queryByRole('alertdialog')).toBeNull();
  },
};

/** Quem já decidiu não é re-ofertado (latch one-shot + tutorial concluído). */
export const SemReoferta: Story = {
  beforeEach: () => {
    semearUtilizadorComDecisao();
    return () => onboardingStorageService.clear();
  },
  play: async () => {
    const tela = corpoDoDocumento();
    // Sem modal de seleção (a oferta é one-shot por decisão de produto).
    expect(tela.queryByRole('heading', { name: 'Quer um tour?' })).toBeNull();
  },
};
