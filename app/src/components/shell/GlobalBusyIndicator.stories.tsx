/**
 * src/components/shell/GlobalBusyIndicator.stories.tsx —
 * Componentes/Shell/GlobalBusyIndicator.
 *
 * O LOADER GLOBAL de ocupação: a pílula fixa no canto inferior direito que diz
 * O QUE está em voo (`lesson.busy.*`, via `sessionBusyLabelKey`), sempre por
 * cima de overlay e scroll. Quando nada está em voo o componente não renderiza
 * NADA (sem pílula órfã, sem região vazia) — por isso a história `Oculta` é um
 * canvas vazio: é exatamente isso que o app mostra.
 *
 * ESTADOS DOCUMENTADOS:
 *   · `Oculta` — `busy: null`: o componente devolve `null` (contrato).
 *   · As sete histórias de MOTIVO — uma por `SessionBusyReason` (o vocabulário
 *     do canal `busy` em lib/sessionState): o texto vem do locale real, o
 *     `data-busy-reason` carrega a razão canónica.
 *   · `AcimaDoOverlay` — a pílula flutua sobre um overlay (o do quiz/moção é
 *     `zIndex: 1300`) e NÃO o intercepta (`pointerEvents: 'none'` — o canto
 *     inferior direito é onde mora o botão ENVIAR do composer).
 *
 * O estado entra pelo canal de sessão (o mesmo caminho da produção: a
 * LessonView publica, o shell lê) — o `SessionSeed` dos decorators partilhados
 * publica o patch no `SessionStateProvider` do `withShellContexts`.
 */
import type { ReactElement } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { expect, within } from 'storybook/test';

import { type SessionBusyReason } from '../../lib/sessionState';
import { Z_INDEX } from '../../lib/designTokens';
import GlobalBusyIndicator from './GlobalBusyIndicator';
import { SessionSeed, shellDecorators } from '../../storybook/decorators';

const meta = {
  title: 'Componentes/Shell/GlobalBusyIndicator',
  component: GlobalBusyIndicator,
  tags: ['autodocs'],
  // A pílula é `position: fixed` no canto inferior direito do viewport — tal
  // como no app (e por cima de qualquer overlay).
  parameters: { layout: 'fullscreen' },
  decorators: shellDecorators({ canvas: false }),
} satisfies Meta<typeof GlobalBusyIndicator>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A pílula com um motivo de ocupação publicado no canal de sessão. */
function BusyPill({ reason }: { reason: SessionBusyReason }): ReactElement {
  return (
    <SessionSeed patch={{ busy: { reason } }}>
      <GlobalBusyIndicator />
    </SessionSeed>
  );
}

/**
 * Ociosa — nada em voo, nada no ecrã. `busy: null` limpa o canal e o indicador
 * some inteiro (nem pílula, nem `role="status"` — o e2e/inspeção não acha nada).
 */
export const Oculta: Story = {};

/** Respondendo a uma dúvida (`pendingAction: 'answer'`). */
export const Responder: Story = {
  render: () => <BusyPill reason="responder" />,
};

/** Turno determinístico do "Próximo" (`pendingAction: 'next'`). */
export const ProximaSecao: Story = {
  render: () => <BusyPill reason="proximaSecao" />,
};

/** Bolha em digitação (streaming) — seção ou explicação. */
export const Digitando: Story = {
  render: () => <BusyPill reason="digitando" />,
};

/** O ciclo do quiz está a escrever a explicação do erro. */
export const Explicando: Story = {
  render: () => <BusyPill reason="explicando" />,
};

/** O ciclo do quiz está a gerar o quiz remediador. */
export const Gerando: Story = {
  render: () => <BusyPill reason="gerando" />,
};

/**
 * O quiz QUER rodar mas espera o turno do tutor (a fila FIFO do LLM local) —
 * a causa raiz do "a aula travou" que motivou este indicador.
 */
export const AguardandoVez: Story = {
  render: () => <BusyPill reason="aguardandoVez" />,
};

/** "Concluir aula" a gravar (busy sem pendingAction e sem regeneração em voo). */
export const Concluindo: Story = {
  render: () => <BusyPill reason="concluindo" />,
};

/**
 * Acima do overlay — a pílula é a ÚLTIMA camada da janela: visível sobre o
 * overlay do quiz (zIndex 1300) e nunca um alvo de ponteiro
 * (`pointerEvents: 'none'`), para não comer os cliques do botão ENVIAR que
 * mora no mesmo canto.
 */
export const AcimaDoOverlay: Story = {
  render: () => (
    <>
      <Box
        data-story-overlay=""
        sx={(theme) => ({
          // O MESMO arranjo do overlay do quiz/moção (QuizOverlayHost):
          // fixed + scrim + safe-center. O degrau é o papel `overlay` do
          // contrato `Z_INDEX` — a pílula usa o papel `busy`, logo acima.
          position: 'fixed',
          inset: 0,
          zIndex: Z_INDEX.overlay,
          backgroundColor: theme.vars.palette.scrim,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          overflowY: 'auto',
          padding: theme.spacing(2),
        })}
      >
        <Paper sx={{ width: '100%', maxWidth: 520, margin: 'auto', padding: 2 }}>
          <Typography variant="h6" component="h2">
            Overlay de exemplo
          </Typography>
          <Typography variant="body2">
            O overlay do quiz cobre a aula inteira — e a pílula de ocupação
            continua legível por cima dele.
          </Typography>
        </Paper>
      </Box>
      <BusyPill reason="aguardandoVez" />
    </>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // A pílula nasce quando o `SessionSeed` publica o motivo (efeito de
    // montagem) — `findByRole` espera o anúncio aparecer.
    const pill = await canvas.findByRole('status');
    const overlay = canvasElement.querySelector('[data-story-overlay]');
    if (overlay === null) throw new Error('o overlay de exemplo não renderizou');
    const view = canvasElement.ownerDocument.defaultView;

    const pillZ = Number(view?.getComputedStyle(pill).zIndex);
    const overlayZ = Number(view?.getComputedStyle(overlay).zIndex);
    expect(pillZ).toBeGreaterThan(overlayZ);

    // A pílula é um anúncio: nunca intercepta o ponteiro.
    expect(view?.getComputedStyle(pill).pointerEvents).toBe('none');
  },
};