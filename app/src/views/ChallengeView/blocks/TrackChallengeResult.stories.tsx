/**
 * blocks/TrackChallengeResult.stories.tsx — `Componentes/Desafio/
 * TrackChallengeResult` (STORY-SPEC): o resultado da tentativa reprovada
 * (razão PARCIAL + checklist individual + saída do runner).
 */
import type { Meta, StoryObj } from '@storybook/react';
import type { TrackSubmitResult } from '@shared/ipc-contract';
import { TrackChallengeResult } from './TrackChallengeResult';
import {
  fixtureTrackSubmitNoChecks,
  fixtureTrackSubmitPartial,
} from '../../../storybook/fixtures.challenge';

/** Nada passou (0 de 3 — severity error, não warning). */
const nadaPassou: TrackSubmitResult = {
  ...fixtureTrackSubmitPartial,
  output:
    '✖ para_celsius(32) devolve 0.0\n' +
    '✖ para_celsius(212) devolve 100.0\n' +
    '✖ o resultado é float\n' +
    '0 passed, 3 failed in 0.05s',
  checks: [
    { name: 'para_celsius(32) devolve 0.0', passed: false },
    { name: 'para_celsius(212) devolve 100.0', passed: false },
    { name: 'o resultado é float', passed: false },
  ],
  passedCount: 0,
  totalCount: 3,
};

/** Saída gigante (a truncagem é AVISADA — nunca em silêncio). */
const saidaGigante: TrackSubmitResult = {
  ...fixtureTrackSubmitPartial,
  output: 'linha de log do runner\n'.repeat(400),
};

const meta = {
  title: 'Componentes/Desafio/TrackChallengeResult',
  component: TrackChallengeResult,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: { result: fixtureTrackSubmitPartial },
} satisfies Meta<typeof TrackChallengeResult>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ParcialComChecklist: Story = {};

export const NadaPassou: Story = {
  args: { result: nadaPassou },
  parameters: {
    docs: {
      description: {
        story:
          'S10: severity `error` só quando NADA passa; com casos a passar é `warning` (a ' +
          'gravidade não inflaciona).',
      },
    },
  },
};

export const SemChecksErroDeSintaxe: Story = {
  args: { result: fixtureTrackSubmitNoChecks },
  parameters: {
    docs: {
      description: {
        story: 'Sem checks (erro de sintaxe) a razão some — a saída fala por si.',
      },
    },
  },
};

export const SaidaTruncadaComAviso: Story = {
  args: { result: saidaGigante },
  parameters: {
    docs: {
      description: {
        story: 'A saída capa em 4000 chars, mas o corte é avisado (truncar em silêncio escondia diagnóstico).',
      },
    },
  },
};
