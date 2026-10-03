/**
 * Funcionalidades/Onboarding/OnboardingOverlay — o OVERLAY do tutorial.
 *
 * O overlay é um PORTAL para `document.body` que ilumina alvos reais do DOM
 * (`[data-onboarding-*]`) com um spotlight medido por `getBoundingClientRect`
 * — por isso cada história monta um SHELL FALSO com os alvos de exemplo em
 * volta e corre em `layout: 'fullscreen'`: o spotlight posiciona-se em
 * coordenadas de viewport e tem de pousar sobre um alvo visível.
 *
 * O que estas histórias documentam (além do visual):
 *   - os ESTADOS de cada tipo de passo: informativo ("Continuar" pronto), com
 *     ação pendente (status "Aguardando a ação…" e sem botão), com ação
 *     satisfeita ("Pronto: pode continuar"), e o último passo ("Concluir
 *     tutorial");
 *   - a dica de NAVEGAÇÃO ("Vá para a aba: …") quando o alvo do passo não está
 *     montado e a aba pedida é outra;
 *   - a narração legível (o painel é `aria-live="polite"`; mute/unmute);
 *   - o foco PRESO (o painel `aria-modal` recebe o foco ao abrir e o Tab
 *     circula dentro dele — o laço é o `lib/focusTrap`);
 *   - a confirmação de PULAR (alertdialog com a verdade da dispensa).
 *
 * Os passos são REAIS (`ONBOARDING_STEPS` — os mesmos que o tutorial usa) e a
 * coerção de props vive em `OnboardingOverlay.stories.helpers.ts`. A geometria
 * do spotlight (rect, máscara, bloqueio de interação) é pura e testada em
 * `tests/onboardingSpotlightGeometry.test.ts`.
 *
 * NOTA DE QUERY: o conteúdo vai para `document.body` (portal) — as `play`
 * procuram em `document.body`, não no `canvasElement`.
 */
import type { Meta, StoryObj } from '@storybook/react';
import type { ComponentProps, ReactElement } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { expect, userEvent, within } from 'storybook/test';
import { OnboardingOverlay } from './OnboardingOverlay';
import { overlayPropsFor, stepById } from './OnboardingOverlay.stories.helpers';

/**
 * Shell FALSO com os alvos `[data-onboarding-*]` reais do catálogo: a AppBar
 * (título, tema, idioma), o rail `nav-tabs` e o editor do Desafio. É em cima
 * destes elementos que o spotlight pousa (seletores de
 * `constants/onboardingSteps.ts`).
 */
function ShellFalso(): ReactElement {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, p: 2, minHeight: '100vh' }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          p: 1,
          border: 1,
          borderColor: 'divider',
          borderRadius: 2,
        }}
      >
        <Typography variant="h6" data-onboarding-target="app-title" sx={{ flexGrow: 1 }}>
          Study Method
        </Typography>
        <Button variant="outlined" data-onboarding-target="theme-toggle">
          Tema
        </Button>
        <Button variant="outlined" data-onboarding-target="language-switcher">
          PT
        </Button>
      </Box>
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
        <Box
          component="nav"
          data-onboarding-target="nav-tabs"
          sx={{
            width: 120,
            p: 1,
            border: 1,
            borderColor: 'divider',
            borderRadius: 2,
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
          }}
        >
          <Button size="small">Início</Button>
          <Button size="small">Configurações</Button>
          <Button size="small">Aula</Button>
          <Button size="small">Trilha</Button>
        </Box>
        <Paper variant="outlined" sx={{ p: 2, flex: 1, minWidth: 0 }}>
          <Typography variant="h6" component="h2">
            Desafio
          </Typography>
          <Paper
            variant="outlined"
            data-onboarding-target="challenge-editor"
            sx={{ p: 1, minHeight: 120, mt: 1 }}
          >
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              while True: pass
            </Typography>
          </Paper>
          <Button
            variant="contained"
            data-onboarding-target="challenge-test-answer"
            sx={{ mt: 1 }}
          >
            Testar resposta
          </Button>
        </Paper>
      </Box>
    </Box>
  );
}

/** A história = shell falso + o overlay em portal (ordem: alvo antes do overlay). */
function ComShell(props: ComponentProps<typeof OnboardingOverlay>): ReactElement {
  return (
    <>
      <ShellFalso />
      <OnboardingOverlay {...props} />
    </>
  );
}

/** O overlay vive em `document.body` (portal) — as queries saem daqui. */
function corpoDoDocumento(): ReturnType<typeof within> {
  return within(document.body);
}

const meta = {
  title: 'Funcionalidades/Onboarding/OnboardingOverlay',
  component: OnboardingOverlay,
  tags: ['autodocs'],
  parameters: {
    // O spotlight posiciona-se em coordenadas de viewport: a story tem de
    // preencher o viewport para o alvo estar visível (STORY-SPEC §7).
    layout: 'fullscreen',
  },
  args: overlayPropsFor(stepById('shell-app-title')),
  argTypes: {
    isActionSatisfied: { control: 'boolean' },
    canAdvance: { control: 'boolean' },
    isStepTransitioning: { control: 'boolean' },
    isAudioMuted: { control: 'boolean' },
    isVisible: { control: 'boolean' },
  },
  render: (args) => <ComShell {...args} />,
} satisfies Meta<typeof OnboardingOverlay>;

export default meta;
type Story = StoryObj<typeof meta>;

/* ═══════════════════════════════════════════════════════════════════════════
 * Estados de cada tipo de passo
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Passo INFORMATIVO: título/corpo reais e "Continuar" pronto a nascer. */
export const PassoInformativo: Story = {
  args: overlayPropsFor(stepById('shell-app-title')),
  play: async () => {
    const tela = corpoDoDocumento();
    await tela.findByRole('heading', { name: 'O Study Method' });
    expect(tela.getByText('Capítulo 1 / 4')).toBeTruthy();
    expect(tela.getByRole('button', { name: 'Continuar' })).toBeTruthy();
  },
};

/** Passo COM AÇÃO pendente: status "Aguardando a ação…" e sem "Continuar". */
export const PassoComAcaoPendente: Story = {
  args: overlayPropsFor(stepById('challenge-editor-type'), {
    isActionSatisfied: false,
    canAdvance: false,
  }),
  play: async () => {
    const tela = corpoDoDocumento();
    await tela.findByText('Aguardando a ação…');
    expect(tela.queryByRole('button', { name: 'Continuar' })).toBeNull();
  },
};

/** Passo COM AÇÃO satisfeita: "Pronto: pode continuar" + "Continuar". */
export const PassoComAcaoSatisfeita: Story = {
  args: overlayPropsFor(stepById('challenge-editor-type'), {
    isActionSatisfied: true,
    canAdvance: true,
  }),
  play: async () => {
    const tela = corpoDoDocumento();
    await tela.findByText('Pronto: pode continuar');
    expect(tela.getByRole('button', { name: 'Continuar' })).toBeTruthy();
  },
};

/** Último passo: o rótulo vira "Concluir tutorial". */
export const UltimoPasso: Story = {
  args: overlayPropsFor(stepById('tour-complete'), { isLastStep: true }),
  play: async () => {
    const tela = corpoDoDocumento();
    await tela.findByRole('button', { name: 'Concluir tutorial' });
    expect(tela.getByText('Passo 11 / 11')).toBeTruthy();
  },
};

/**
 * Dica de NAVEGAÇÃO: o alvo do passo não está montado e a aba pedida é outra
 * — o painel diz "Vá para a aba: …" e o spotlight não pousa.
 */
export const DicaDeNavegacao: Story = {
  args: overlayPropsFor(stepById('settings-keys-fill'), {
    activeView: 'home',
    isActionSatisfied: false,
    canAdvance: false,
  }),
  play: async () => {
    const tela = corpoDoDocumento();
    await tela.findByText('Vá para a aba: Configurações');
  },
};

/* ─── Narração ────────────────────────────────────────────────────────────── */

/** Narração ativa: o botão de áudio anuncia "Mutar narração". */
export const ComNarracao: Story = {
  args: overlayPropsFor(stepById('shell-app-title'), {
    isAudioMuted: false,
    onToggleMute: () => console.debug('[storybook] onToggleMute'),
  }),
  play: async () => {
    const tela = corpoDoDocumento();
    await tela.findByRole('button', { name: 'Mutar narração' });
  },
};

/** Narração muda: o mesmo botão passa a "Ouvir narração". */
export const NarracaoMuda: Story = {
  args: overlayPropsFor(stepById('shell-app-title'), {
    isAudioMuted: true,
    onToggleMute: () => console.debug('[storybook] onToggleMute'),
  }),
  play: async () => {
    const tela = corpoDoDocumento();
    await tela.findByRole('button', { name: 'Ouvir narração' });
  },
};

/* ─── Diálogo de confirmação e foco ───────────────────────────────────────── */

/**
 * Confirmação de PULAR: "Pular tutorial" abre o `alertdialog` com a verdade da
 * dispensa ("pode reabri-lo depois pelo botão de ajuda") e "Cancelar" volta ao
 * painel.
 */
export const ConfirmacaoDePular: Story = {
  args: overlayPropsFor(stepById('shell-app-title')),
  play: async () => {
    const tela = corpoDoDocumento();
    await userEvent.click(await tela.findByRole('button', { name: 'Pular tutorial' }));
    const dialogo = await tela.findByRole('alertdialog');
    expect(
      within(dialogo).getByText('Pular o tutorial? Você pode reabri-lo depois pelo botão de ajuda.'),
    ).toBeTruthy();
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    expect(tela.queryByRole('alertdialog')).toBeNull();
  },
};

/**
 * FOCO PRESO (SC 2.4.3): ao abrir, o foco entra no painel `aria-modal` e o Tab
 * circula DENTRO dele (o laço é o `lib/focusTrap`) — a promessa do
 * `aria-modal="true"`.
 */
export const FocoPresoNoPainel: Story = {
  args: overlayPropsFor(stepById('shell-app-title')),
  play: async () => {
    const tela = corpoDoDocumento();
    const painel = await tela.findByRole('dialog');
    expect(painel.getAttribute('aria-modal')).toBe('true');
    // O foco de ENTRADA é o painel (tabIndex -1 focado pelo laço).
    expect(document.activeElement === painel || painel.contains(document.activeElement)).toBe(true);
    // Alguns Tabs seguidos nunca escapam do painel (laço de `lib/focusTrap`).
    for (let i = 0; i < 6; i += 1) {
      await userEvent.tab();
      const ativo = document.activeElement;
      expect(ativo === painel || painel.contains(ativo)).toBe(true);
    }
  },
};
