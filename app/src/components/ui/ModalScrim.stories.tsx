/**
 * src/components/ui/ModalScrim.stories.tsx — Componentes/UI/ModalScrim.
 *
 * O shell de overlay/modal (auditoria de layout §6): fixed + scrim + blur +
 * centrado seguro + scroll — as ~25 linhas copiadas entre `QuizOverlayHost` e
 * `ChallengeGenerateModal` aposentadas. As histórias mostram o cartão normal,
 * o cartão ALTO (que prova o centrado seguro: rola, nunca corta o topo), o
 * cartão estreito (`LAYOUT.modalCardNarrowPx`), o movimento reduzido e a
 * dispensa por Escape (`play`).
 */
import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { ModalScrim } from './ModalScrim';
import { ActionButton } from './ActionButton';
import { LAYOUT, SHAPE } from '../../lib/designTokens';

/** Espião partilhado: o `play` de Escape conta as dispensas de verdade. */
const onDismiss = fn();

const meta = {
  title: 'Componentes/UI/ModalScrim',
  component: ModalScrim,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  args: {
    open: true,
    ariaLabel: 'Gerar novo desafio',
    reducedMotion: false,
    onDismiss,
    children: (
      <Stack spacing={2}>
        <Typography variant="h6">Gerar novo desafio?</Typography>
        <Typography variant="body2">
          O novo desafio parte dos teus erros do quiz e é validado pelos testes.
        </Typography>
        <ActionButton variant="contained">Gerar</ActionButton>
      </Stack>
    ),
  },
  argTypes: {
    open: { control: 'boolean' },
    ariaLabel: { control: 'text', description: 'nome acessível em linha — o chamador traduz' },
    ariaLabelledBy: {
      control: 'text',
      description: 'id do TÍTULO do diálogo (contrato do tutorial, achado-1)',
    },
    ariaDescribedBy: {
      control: 'text',
      description: 'id do SUBTÍTULO do diálogo (contrato do tutorial, achado-1)',
    },
    maxWidth: { control: 'number', description: 'LAYOUT.* (default: modalCardPx = 520)' },
    zIndex: { control: 'number', description: 'Z_INDEX.* (default: modal)' },
    reducedMotion: { control: 'boolean', description: 'fade puro (reducedFadeVariants)' },
    cardSx: { control: false, description: 'chrome do cartão — compõe por cima da superfície base' },
    cardClassName: { control: 'text', description: 'classe do cartão (CSS/animações do chamador)' },
    children: { control: false },
  },
} satisfies Meta<typeof ModalScrim>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Padrão: Story = {};

export const Fechado: Story = {
  args: { open: false },
  parameters: {
    docs: { description: { story: 'Fechado não renderiza nada (a saída anima via `AnimatePresence`).' } },
  },
};

export const CartãoEstreito: Story = {
  args: { maxWidth: LAYOUT.modalCardNarrowPx, ariaLabel: 'Configurar chaves' },
};

export const ComTítuloEDescrição: Story = {
  args: {
    ariaLabel: undefined,
    ariaLabelledBy: 'selecao-titulo',
    ariaDescribedBy: 'selecao-subtitulo',
    maxWidth: LAYOUT.modalCardNarrowPx,
    children: (
      <Stack spacing={2}>
        <Typography variant="h6" id="selecao-titulo">
          Escolhe o teu tutorial
        </Typography>
        <Typography variant="body2" id="selecao-subtitulo">
          Podes repetir o tutorial a qualquer momento a partir de Ajuda.
        </Typography>
        <ActionButton variant="contained">Tour completo</ActionButton>
      </Stack>
    ),
  },
  parameters: {
    docs: {
      description: {
        story:
          'O contrato auditado do tutorial (achado-1): o nome acessível do diálogo é o TÍTULO (`aria-labelledby`) e a descrição é o SUBTÍTULO (`aria-describedby`) — o `aria-label` em linha fica para quem não tem título referenciável.',
      },
    },
  },
};

export const ComChromeDoCartao: Story = {
  args: {
    ariaLabel: 'Gerar novo desafio',
    maxWidth: LAYOUT.modalCardNarrowPx,
    cardClassName: 'cartao-com-sombra',
    cardSx: {
      borderRadius: `${SHAPE.lg}px`,
      boxShadow:
        '0 24px 64px -24px color-mix(in srgb, var(--mui-palette-common-black) 45%, transparent)',
    },
    children: (
      <Stack spacing={2}>
        <Typography variant="h6">Gerar novo desafio?</Typography>
        <Typography variant="body2">
          O chrome (moldura/sombra medido do chamador) compõe por cima da superfície base do
          primitivo — o scrim e o centrado seguro continuam a cargo do `ModalScrim`.
        </Typography>
        <ActionButton variant="contained">Gerar</ActionButton>
      </Stack>
    ),
  },
  parameters: {
    docs: {
      description: {
        story:
          'Slot de chrome (`cardSx` + `cardClassName`): a sombra `color-mix` medida do QuizOverlayHost, sem reescrever a casca. Cores vêm de `theme.vars` (aqui via variável CSS) — nunca hex.',
      },
    },
  },
};

export const ConteúdoAlto: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'Centrado SEGURO (§6): com o cartão mais alto que a janela, as margens auto resolvem para 0, o cartão encosta ao topo e o SHELL rola até ao fim — nunca fica cortado e inalcançável.',
      },
    },
  },
  args: {
    ariaLabel: 'Detalhes do desafio',
    children: (
      <Stack spacing={2}>
        <Typography variant="h6">Detalhes do desafio</Typography>
        {Array.from({ length: 12 }, (_, i) => (
          <Typography key={i} variant="body2">
            Parágrafo {i + 1} — o desafio tem enunciado, workspace materializado e testes de
            validação; este conteúdo comprido prova que o overlay rola sem cortar.
          </Typography>
        ))}
        <ActionButton variant="contained">Começar</ActionButton>
      </Stack>
    ),
  },
};

export const MovimentoReduzido: Story = {
  args: { reducedMotion: true, maxWidth: LAYOUT.modalCardNarrowPx },
  parameters: {
    docs: {
      description: {
        story:
          'Com movimento reduzido o cartão entra em fade puro (`reducedFadeVariants` de `lib/animationTokens.ts`) — sem deslocamento nem escala.',
      },
    },
  },
};

export const EscapeDispensa: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'O contrato do diálogo `aria-modal`: Escape dispensa (o `onDismiss` corre) e o laço de foco prende o Tab dentro do cartão (`lib/focusTrap.ts` via `useFocusTrap`).',
      },
    },
  },
  play: async ({ canvasElement }) => {
    onDismiss.mockClear();
    await userEvent.keyboard('{Escape}');
    expect(onDismiss.mock.calls.length).toBeGreaterThan(0);
    expect(within(canvasElement).getByRole('dialog')).toBeTruthy();
  },
};
