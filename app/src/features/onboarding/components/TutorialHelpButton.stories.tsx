/**
 * Funcionalidades/Onboarding/TutorialHelpButton — o botão de AJUDA do shell
 * ("Ajuda e tutorial"), a promessa de reabrir o tour.
 *
 * Os três estados do pedido de catálogo (idle/novo/aberto) traduzem-se em:
 *   - `EmRepouso` (idle) — o botão no pé da barra, com o seu alvo de toque;
 *   - `ComDica` (novo) — a dica (`Tooltip`) que nomeia a ação antes de o
 *     utilizador a conhecer: hover mostra "Ajuda e tutorial", o MESMO texto do
 *     `aria-label` (leitor de tela e hover dizem o mesmo);
 *   - `ComSelecaoAberta` (aberto) — o clique dispara
 *     `tutorialLauncherService.openSelection()` e o host falso da história abre
 *     o MESMO modal de seleção da primeira execução (a composição real do app:
 *     SessionFrame → serviço → OnboardingHost → TutorialSelectionModal).
 *
 * Sem host montado o clique é no-op honesto (o serviço devolve `false` e nada
 * derruba a UI) — é o contrato documentado em `tutorialLauncher.service.ts`.
 */
import { useEffect, useState, type ReactElement } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import Box from '@mui/material/Box';
import { expect, fn, userEvent, within } from 'storybook/test';
import { TutorialHelpButton } from './TutorialHelpButton';
import { TutorialSelectionModal } from './TutorialSelectionModal';
import { tutorialLauncherService } from '../services/tutorialLauncher.service';

/**
 * Host FALSO da composição "aberto": regista os abridores no
 * `tutorialLauncherService` (o mesmo contrato do `OnboardingHost`) e abre o
 * `TutorialSelectionModal` quando o botão dispara `openSelection()`.
 */
function ComHostFalso(): ReactElement {
  const [aberto, setAberto] = useState(false);
  useEffect(() => {
    const openers = {
      openSelection: (): void => setAberto(true),
      restart: (): void => setAberto(true),
    };
    tutorialLauncherService.register(openers);
    return () => {
      tutorialLauncherService.unregister(openers);
    };
  }, []);
  return (
    <Box sx={{ display: 'flex', gap: 1, p: 2, minHeight: 240, alignItems: 'flex-start' }}>
      <TutorialHelpButton />
      <TutorialSelectionModal
        isOpen={aberto}
        onClose={() => setAberto(false)}
        onSelectTutorial={(tutorialId) => {
          console.debug('[storybook] onSelectTutorial', tutorialId);
          setAberto(false);
        }}
        hasKeys
        onOpenSettings={() => console.debug('[storybook] onOpenSettings')}
      />
    </Box>
  );
}

const meta = {
  title: 'Funcionalidades/Onboarding/TutorialHelpButton',
  component: TutorialHelpButton,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof TutorialHelpButton>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Idle: o botão em repouso, com nome acessível próprio. */
export const EmRepouso: Story = {
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    expect(tela.getByRole('button', { name: 'Ajuda e tutorial' })).toBeTruthy();
    // Alvo de onboarding do catálogo (o futuro step de ajuda ilumina-o).
    expect(canvasElement.querySelector('[data-onboarding-target="help-button"]')).toBeTruthy();
  },
};

/**
 * Novo (a dica): o `Tooltip` nomeia a ação em hover — o mesmo texto do
 * `aria-label`, para leitor de tela e hover dizerem o mesmo.
 */
export const ComDica: Story = {
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    const botao = tela.getByRole('button', { name: 'Ajuda e tutorial' });
    await userEvent.hover(botao);
    const dica = await within(document.body).findByRole('tooltip');
    expect(dica.textContent).toBe('Ajuda e tutorial');
  },
};

/** Aberto: o clique abre o modal de seleção (composição com o host falso). */
export const ComSelecaoAberta: Story = {
  render: () => <ComHostFalso />,
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    await userEvent.click(tela.getByRole('button', { name: 'Ajuda e tutorial' }));
    await within(document.body).findByRole('heading', { name: 'Quer um tour?' });
  },
};
