/**
 * views/ChallengeView/ChallengeView.stories.tsx — `Vistas/ChallengeView`
 * (STORY-SPEC): a tela de Desafio COMPLETA, com a API falsa do mockApi e os
 * decorators partilhados (`shellDecorators` + canvas fixo para o xterm).
 *
 * Estados cobertos (os que a tela desenha):
 *   1. sem desafios (vazio legítimo + CTA para a Aula);
 *   2. desafio carregado (enunciado + workspace);
 *   3. a executar (fase determinística em voo — chip "rodando…" + Abortar);
 *   4. veredito aprovado (veredito do avaliador em markdown);
 *   5. veredito reprovado (2 de 3 — severity warning + perda de estrela);
 *   6. tempo esgotado (relógio de estrelas — "Tempo esgotado", mark 'timeout');
 *   7. erro de rede com retry (listagem falha — "Tentar de novo");
 *   8. modo desafio de TRILHA × PROFICIÊNCIA (ChallengeNav → TrackChallengePanel);
 *   extras: feedback do MODELO LOCAL e erro de CHAVE do avaliador (W10).
 *
 * Os fluxos interativos usam `play` + `storybook/test` (o módulo de testes do
 * Storybook 10). NOTA de medição: o texto do banner PASSOU/NÃO PASSOU é
 * escrito no xterm (canvas — não é texto do DOM), por isso as asserções
 * medem o que é DOM (veredito, chips, avisos, região de status sr-only).
 * O xterm precisa de canvas com dimensões (RENDER-PLAYBOOK §4) — o
 * `shellDecorators({ canvas })` trata disso.
 */
import type { ReactElement } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { expect, waitFor, within } from 'storybook/test';
import { emitMockEvent, installMockApi } from '../../storybook/mockApi';
import { shellDecorators } from '../../storybook/decorators';
import { fixtureSettings, fixtureTestAnswerResult } from '../../storybook/fixtures';
import {
  challengeActive,
  challengeSelectionBeforeLesson,
  challengeSelectionLesson,
  challengeSelectionProficiency,
  fixturePiExecuteMissingKey,
  fixturePiExecutePartial,
  fixtureTestAnswerEventStarted,
  fixtureTestAnswerFailed,
  fixtureVerdictPassed,
} from '../../storybook/fixtures.challenge';
import {
  advanceWallClock,
  ChallengeNavSeed,
  clickTestAnswer,
} from './challenge.stories.helpers';
import ChallengeView from './ChallengeView';
import type { ViewProps } from '../placeholders';

/** Força o avaliador REMOTO (o fixture canónico usa o modelo local ativo). */
const avaliadorRemoto = {
  settings: {
    get: async () => ({ ...fixtureSettings, defaultModelProvider: 'openrouter' as const }),
  },
};

const meta = {
  title: 'Vistas/ChallengeView',
  component: ChallengeView,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  decorators: shellDecorators({ canvas: { width: 1080, height: 720 } }),
  args: {
    onNavigate: (key: string) => console.debug('[storybook] onNavigate', key),
  },
} satisfies Meta<typeof ChallengeView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A view com o desafio legado já selecionado (fluxo workspace da geração). */
function ComDesafio(args: ViewProps): ReactElement {
  return (
    <ChallengeNavSeed selectedChallenge={challengeActive}>
      <ChallengeView {...args} />
    </ChallengeNavSeed>
  );
}

/* ─── 1. Sem desafios — o vazio legítimo (ONDA-UX-VAZIO) ─────────────────── */

export const SemDesafios: Story = {
  loaders: [
    async () => {
      installMockApi({ study: { listChallenges: async () => [] } });
      return {};
    },
  ],
};

/* ─── 2. Desafio carregado — enunciado + workspace ───────────────────────── */

export const DesafioCarregado: Story = {
  loaders: [
    async () => {
      installMockApi();
      return {};
    },
  ],
  render: (args): ReactElement => ComDesafio(args),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(async () => {
      expect(await canvas.findByText('Desafio: funções reutilizáveis')).toBeTruthy();
    });
  },
};

/* ─── 3. A executar — fase determinística em voo (terminal a correr) ─────── */

export const AExecutar: Story = {
  loaders: [
    async () => {
      installMockApi({
        // Canal MUDO de propósito: o `testAnswer` nunca resolve — a tela fica
        // no estado "em corrida" (chip, spinner e Abortar ligados).
        study: { testAnswer: () => new Promise(() => {}) },
      });
      return {};
    },
  ],
  render: (args): ReactElement => ComDesafio(args),
  play: async ({ canvasElement }) => {
    await clickTestAnswer(canvasElement);
    const canvas = within(canvasElement);
    await waitFor(async () => {
      expect(await canvas.findByText('rodando…')).toBeTruthy();
    });
    // O push do main (started) exercita o canal de eventos dos testes.
    emitMockEvent('study', 'onTestAnswerEvent', fixtureTestAnswerEventStarted as never);
  },
};

/* ─── 4. Veredito aprovado — veredito do avaliador em markdown ───────────── */

export const VereditoAprovado: Story = {
  loaders: [
    async () => {
      installMockApi({
        ...avaliadorRemoto,
        pi: {
          execute: async () => ({
            success: true,
            output: fixtureVerdictPassed,
            executionTimeMs: 2040,
          }),
        },
      });
      return {};
    },
  ],
  render: (args): ReactElement => ComDesafio(args),
  play: async ({ canvasElement }) => {
    await clickTestAnswer(canvasElement);
    const canvas = within(canvasElement);
    await waitFor(async () => {
      expect(await canvas.findByText('Veredito do avaliador')).toBeTruthy();
    });
  },
};

/* ─── 5. Veredito reprovado — 2 de 3 (aviso + perda de estrela) ──────────── */

export const VereditoReprovado: Story = {
  loaders: [
    async () => {
      installMockApi({
        ...avaliadorRemoto,
        study: { testAnswer: async () => fixtureTestAnswerFailed },
        pi: { execute: async () => fixturePiExecutePartial },
      });
      return {};
    },
  ],
  render: (args): ReactElement => ComDesafio(args),
  play: async ({ canvasElement }) => {
    await clickTestAnswer(canvasElement);
    const canvas = within(canvasElement);
    await waitFor(async () => {
      expect(await canvas.findByText('Veredito do avaliador')).toBeTruthy();
      // O anúncio factual do resultado (região sr-only `role="status"`).
      expect(
        await canvas.findByText(
          'Os testes falharam: 2 de 3 casos passaram. O caso que falhou está na saída.',
        ),
      ).toBeTruthy();
    });
  },
};

/* ─── 6. Tempo esgotado — o relógio de estrelas marca 'timeout' ──────────── */

export const TempoEsgotado: Story = {
  loaders: [
    async () => {
      installMockApi();
      return {};
    },
  ],
  render: (args): ReactElement => ComDesafio(args),
  play: async ({ canvasElement }) => {
    // O relógio do desafio (difficulty 2 → 210s) estoura com o deslocamento do
    // `Date.now` — o tick seguinte marca o veredito terminal 'timeout'.
    advanceWallClock(400_000);
    const canvas = within(canvasElement);
    await waitFor(async () => {
      expect(await canvas.findByText('Tempo esgotado')).toBeTruthy();
    });
  },
};

/* ─── 7. Erro de rede com retry — a listagem falha com saída (W11) ────────── */

export const ErroDeRedeComRetry: Story = {
  loaders: [
    async () => {
      installMockApi({
        study: {
          listChallenges: async () => {
            throw new Error('ipc: canal mudo — ECONNRESET');
          },
        },
      });
      return {};
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(async () => {
      expect(await canvas.findByText('Tentar de novo')).toBeTruthy();
    });
  },
};

/* ─── 8/9. Modo desafio de TRILHA × PROFICIÊNCIA (ChallengeNav) ──────────── */

export const ModoTrilhaDeAula: Story = {
  loaders: [
    async () => {
      installMockApi();
      return {};
    },
  ],
  render: (args): ReactElement => (
    <ChallengeNavSeed trackChallenge={challengeSelectionLesson}>
      <ChallengeView {...args} />
    </ChallengeNavSeed>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(async () => {
      expect(await canvas.findByText('Desafio: converter temperatura')).toBeTruthy();
    });
  },
};

export const ModoTrilhaAntesDaAula: Story = {
  loaders: [
    async () => {
      installMockApi();
      return {};
    },
  ],
  render: (args): ReactElement => (
    <ChallengeNavSeed trackChallenge={challengeSelectionBeforeLesson}>
      <ChallengeView {...args} />
    </ChallengeNavSeed>
  ),
};

export const ModoProficiencia: Story = {
  loaders: [
    async () => {
      installMockApi();
      return {};
    },
  ],
  render: (args): ReactElement => (
    <ChallengeNavSeed trackChallenge={challengeSelectionProficiency}>
      <ChallengeView {...args} />
    </ChallengeNavSeed>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(async () => {
      expect(await canvas.findByText('Teste de proficiência: Python do Zero')).toBeTruthy();
    });
  },
};

/* ─── Extra: feedback do MODELO LOCAL (chip do provedor) ─────────────────── */

export const FeedbackLocal: Story = {
  loaders: [
    async () => {
      // O mundo canónico: `defaultModelProvider: 'local'` com modelo ativo →
      // a fase de feedback corre em `localAi.chat` (sem streaming).
      installMockApi({ study: { testAnswer: async () => fixtureTestAnswerResult } });
      return {};
    },
  ],
  render: (args): ReactElement => ComDesafio(args),
  play: async ({ canvasElement }) => {
    await clickTestAnswer(canvasElement);
    const canvas = within(canvasElement);
    await waitFor(async () => {
      expect(await canvas.findByText('Veredito do avaliador')).toBeTruthy();
    });
  },
};

/* ─── Extra: erro de CHAVE do avaliador (W10 — keyHint sem retry) ────────── */

export const AvaliadorSemChave: Story = {
  loaders: [
    async () => {
      installMockApi({
        ...avaliadorRemoto,
        study: { testAnswer: async () => fixtureTestAnswerFailed },
        pi: { execute: async () => fixturePiExecuteMissingKey },
      });
      return {};
    },
  ],
  render: (args): ReactElement => ComDesafio(args),
  play: async ({ canvasElement }) => {
    await clickTestAnswer(canvasElement);
    const canvas = within(canvasElement);
    await waitFor(async () => {
      expect(await canvas.findByText('Veja a dica da chave no enunciado.')).toBeTruthy();
    });
  },
};
