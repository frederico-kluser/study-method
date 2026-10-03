/**
 * src/components/challengeNav/ChallengeNavProvider.stories.tsx —
 * Componentes/Desafio/ChallengeNavProvider.
 *
 * HISTÓRIA DE COMPOSIÇÃO: o provider não desenha nada — o que estas histórias
 * documentam é o que o CONTEXTO FORNECE a quem consome (`useChallengeNav`) e
 * como cada gesto se reflete no valor observado. O consumidor de exemplo é
 * código de story (não é componente do produto): ele mostra, ao vivo, os
 * campos do `ChallengeNavValue` e dispara as funções que o produto chama —
 * a LessonView seleciona desafios, o shell navega, o TrackChallengePanel
 * reporta falhas e a LessonView limpa o relatório.
 *
 * Os dois callbacks do provider (`onNavigateChallenge`/`onNavigateLesson`) são
 * ligados a `fn()` — aparecem no painel de interações do Storybook cada vez
 * que o shell seria chamado a trocar de aba.
 */
import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { type ReactElement } from 'react';

import { ChallengeNavProvider } from './ChallengeNavProvider';
import { useChallengeNav } from '../../lib/challengeNav';
import type { TrackChallengeErrorReport } from '../../../shared/ipc-contract';

/** Um relatório de falha de desafio (o que o painel grava antes de navegar). */
const RELATORIO: TrackChallengeErrorReport = {
  trackSlug: 'python-iniciante',
  lessonId: 'a-primeira-linha',
  challengeId: 'inventariar-os-modulos',
  challengeTitle: 'Inventariar os módulos',
  files: [{ path: 'resposta.py', code: 'print("oi")' }],
  output: 'FAIL  expected 3 tests_run, got 2',
  checks: [
    { name: 'conta os módulos importados', passed: true },
    { name: 'ignora módulos nativos', passed: false },
  ],
  passedCount: 1,
  totalCount: 2,
};

/**
 * CONSUMIDOR DE EXEMPLO (código de story): o espelho do `ChallengeNavValue` —
 * mostra o que o contexto fornece e liga cada função do contrato a um botão.
 */
function ConsumidorDeExemplo(): ReactElement {
  const nav = useChallengeNav();
  return (
    <Stack spacing={2} sx={{ maxWidth: 640, p: 2 }}>
      <Typography variant="h6" component="h2">
        O que o ChallengeNavCtx fornece
      </Typography>

      <Box
        component="pre"
        sx={(tema) => ({
          m: 0,
          p: 1.5,
          borderRadius: 1,
          border: '1px solid',
          borderColor: 'divider',
          bgcolor: tema.vars.palette.surface.level1,
          fontSize: 13,
          overflowX: 'auto',
        })}
      >
        {JSON.stringify(
          {
            version: nav.version,
            selectedChallenge: nav.selectedChallenge,
            trackChallenge: nav.trackChallenge,
            lastSetupRoot: nav.lastSetupRoot,
            challengeErrorReport:
              nav.challengeErrorReport === null
                ? null
                : {
                    trackSlug: nav.challengeErrorReport.trackSlug,
                    challengeId: nav.challengeErrorReport.challengeId,
                    passedCount: nav.challengeErrorReport.passedCount,
                    totalCount: nav.challengeErrorReport.totalCount,
                  },
          },
          null,
          2,
        )}
      </Box>

      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
        <Button
          size="small"
          variant="outlined"
          onClick={() =>
            nav.selectTrackChallenge({
              trackSlug: 'python-iniciante',
              target: 'lesson',
              lessonId: 'a-primeira-linha',
              challengeId: 'inventariar-os-modulos',
              title: 'Inventariar os módulos',
            })
          }
        >
          selectTrackChallenge(…)
        </Button>
        <Button size="small" variant="outlined" onClick={() => nav.selectTrackChallenge(null)}>
          selectTrackChallenge(null)
        </Button>
        <Button size="small" variant="contained" onClick={() => nav.navigateToChallenge()}>
          navigateToChallenge()
        </Button>
        <Button size="small" variant="outlined" onClick={() => nav.navigateToLesson()}>
          navigateToLesson()
        </Button>
        <Button size="small" variant="outlined" onClick={() => nav.reportChallengeError(RELATORIO)}>
          reportChallengeError(…)
        </Button>
        <Button size="small" variant="outlined" onClick={() => nav.clearChallengeError()}>
          clearChallengeError()
        </Button>
        <Button size="small" variant="outlined" onClick={() => nav.setLastSetupRoot('/home/aluno/setup')}>
          setLastSetupRoot(…)
        </Button>
        <Button size="small" variant="outlined" onClick={() => nav.setLastSetupRoot(null)}>
          setLastSetupRoot(null)
        </Button>
      </Stack>

      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        Os botões são os GESTOS que o produto chama: a LessonView seleciona o desafio e pede ao
        shell para navegar; o painel do desafio reporta a falha e volta à aula; a LessonView limpa
        o relatório depois de o semear no chat.
      </Typography>
    </Stack>
  );
}

const meta = {
  title: 'Componentes/Desafio/ChallengeNavProvider',
  component: ChallengeNavProvider,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'O contexto de navegação Desafio ↔ Aula. Ele não tem markup próprio: o valor (`ChallengeNavValue`) é o produto — seleção (auleta e trilha), `version` (para invalidar caches), `lastSetupRoot`, o relatório de erro do desafio que falhou e as duas navegações do shell.',
      },
    },
  },
  args: {
    children: <ConsumidorDeExemplo />,
    onNavigateChallenge: fn(),
    onNavigateLesson: fn(),
  },
  argTypes: {
    children: { control: false, description: 'quem consome o contexto (aqui: o consumidor de exemplo)' },
    onNavigateChallenge: {
      control: false,
      description: 'o shell navega para a aba Desafio (chamado por navigateToChallenge)',
    },
    onNavigateLesson: {
      control: false,
      description: 'o shell navega para a aba Aula (chamado por navigateToLesson)',
    },
  },
} satisfies Meta<typeof ChallengeNavProvider>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Composicao: Story = {
  name: 'Composição: o que o contexto fornece',
};

export const InteracaoSelecionarENavegar: Story = {
  name: 'Interação: selecionar desafio e navegar',
  play: async ({ canvasElement, args }) => {
    const tela = within(canvasElement);
    await userEvent.click(tela.getByRole('button', { name: 'selectTrackChallenge(…)' }));
    // O valor observado reflete a seleção (e o `version` sobe — é ele que
    // invalida os caches dependentes).
    await expect(tela.getByText(/inventariar-os-modulos/)).toBeVisible();

    await userEvent.click(tela.getByRole('button', { name: 'navigateToChallenge()' }));
    await expect(args.onNavigateChallenge).toHaveBeenCalledOnce();

    await userEvent.click(tela.getByRole('button', { name: 'navigateToLesson()' }));
    await expect(args.onNavigateLesson).toHaveBeenCalledOnce();
  },
};

export const InteracaoRelatorioDeErro: Story = {
  name: 'Interação: relatório de erro (guardar → limpar)',
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    await userEvent.click(tela.getByRole('button', { name: 'reportChallengeError(…)' }));
    // O relatório fica no contexto (o painel grava ANTES de navegar para a
    // aula) — é a LessonView quem o semeia na bolha de erro e o limpa.
    await expect(tela.getByText(/"passedCount": 1/)).toBeVisible();

    await userEvent.click(tela.getByRole('button', { name: 'clearChallengeError()' }));
    await expect(tela.getByText(/"challengeErrorReport": null/)).toBeVisible();
  },
};
