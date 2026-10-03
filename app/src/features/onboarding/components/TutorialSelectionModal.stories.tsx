/**
 * Funcionalidades/Onboarding/TutorialSelectionModal — o MODAL de seleção do
 * tutorial ("Quer um tour?").
 *
 * O que estas histórias documentam:
 *   - a SELEÇÃO com as duas opções — "Tour rápido" (cartão dominante, chip
 *     "Recomendado") e "Tour completo" (gateado por chaves de API);
 *   - o estado SEM CHAVES: o tour completo desabilitado (mesma geometria), a
 *     nota "Requer chaves de API" FORA do botão e o CTA "Configurar chaves";
 *   - CONFIRMAR/CANCELAR: escolher um tour chama `onSelectTutorial` com o id
 *     real (`quick-start`/`first-workflow`); o "×", o "Agora não" e o Escape
 *     passam todos pelo CAMINHO ÚNICO de dispensa (`onClose`);
 *   - o FOCO preso (o painel `aria-modal` recebe o foco ao abrir — o laço é o
 *     `useFocusTrap` da base, auditoria §7).
 *
 * O modal é um PORTAL para `document.body` — as `play` procuram em
 * `document.body`, não no `canvasElement`.
 */
import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { TutorialSelectionModal } from './TutorialSelectionModal';

/** O modal vive em `document.body` (portal) — as queries saem daqui. */
function corpoDoDocumento(): ReturnType<typeof within> {
  return within(document.body);
}

const meta = {
  title: 'Funcionalidades/Onboarding/TutorialSelectionModal',
  component: TutorialSelectionModal,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  args: {
    isOpen: true,
    onClose: fn(),
    onSelectTutorial: fn(),
    hasKeys: true,
    onOpenSettings: fn(),
  },
  argTypes: {
    isOpen: { control: 'boolean' },
    hasKeys: { control: 'boolean' },
  },
} satisfies Meta<typeof TutorialSelectionModal>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Seleção com as duas opções disponíveis (chaves preenchidas). */
export const SelecaoDeTours: Story = {
  play: async ({ args }) => {
    const tela = corpoDoDocumento();
    await tela.findByRole('heading', { name: 'Quer um tour?' });
    const rapido = tela.getByTestId('tutorial-option-quick-start');
    expect(rapido.getAttribute('disabled')).toBeNull();
    expect(tela.getByText('Recomendado')).toBeTruthy();
    const completo = tela.getByTestId('tutorial-option-full');
    expect(completo.getAttribute('disabled')).toBeNull();
  },
};

/** Confirmar: escolher o "Tour rápido" chama `onSelectTutorial('quick-start')`. */
export const EscolherTourRapido: Story = {
  play: async ({ args }) => {
    const tela = corpoDoDocumento();
    await userEvent.click(await tela.findByTestId('tutorial-option-quick-start'));
    expect(args.onSelectTutorial).toHaveBeenCalledWith('quick-start');
  },
};

/** Confirmar o tour completo: `onSelectTutorial('first-workflow')`. */
export const EscolherTourCompleto: Story = {
  play: async ({ args }) => {
    const tela = corpoDoDocumento();
    await userEvent.click(await tela.findByTestId('tutorial-option-full'));
    expect(args.onSelectTutorial).toHaveBeenCalledWith('first-workflow');
  },
};

/**
 * SEM CHAVES: o tour completo fica desabilitado (a geometria não muda), a nota
 * "Requer chaves de API" fica FORA do botão e o CTA "Configurar chaves" fecha o
 * modal e navega.
 */
export const SemChavesComCta: Story = {
  args: { hasKeys: false },
  play: async ({ args }) => {
    const tela = corpoDoDocumento();
    const completo = await tela.findByTestId('tutorial-option-full');
    expect(completo.getAttribute('disabled')).not.toBeNull();
    expect(tela.getByText('Requer chaves de API')).toBeTruthy();
    await userEvent.click(tela.getByRole('button', { name: 'Configurar chaves' }));
    expect(args.onClose).toHaveBeenCalled();
    expect(args.onOpenSettings).toHaveBeenCalled();
  },
};

/** Cancelar/dispensar: o "Agora não" passa pelo caminho único de dispensa. */
export const Dispensar: Story = {
  play: async ({ args }) => {
    const tela = corpoDoDocumento();
    await userEvent.click(await tela.findByRole('button', { name: 'Agora não' }));
    expect(args.onClose).toHaveBeenCalledTimes(1);
    // A promessa da dispensa está no rodapé (onde reabrir o tour).
    expect(tela.getByText(/pode abrir o tour a qualquer momento/)).toBeTruthy();
  },
};

/**
 * FOCO e Escape (contrato `aria-modal`, SC 2.4.3): o foco entra no painel ao
 * abrir e o Escape dispensa pelo mesmo caminho único.
 */
export const FocoPresoEDismiss: Story = {
  play: async ({ args }) => {
    const tela = corpoDoDocumento();
    const painel = await tela.findByRole('dialog');
    expect(painel.getAttribute('aria-modal')).toBe('true');
    expect(painel.getAttribute('aria-labelledby')).toBe('tutorial-selection-title');
    expect(painel.getAttribute('aria-describedby')).toBe('tutorial-selection-subtitle');
    // O foco de ENTRADA é o painel (tabIndex -1 focado pelo laço).
    expect(document.activeElement === painel || painel.contains(document.activeElement)).toBe(true);
    // Escape dispensa.
    await userEvent.keyboard('{Escape}');
    expect(args.onClose).toHaveBeenCalled();
  },
};
