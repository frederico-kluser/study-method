/**
 * views/ChallengeView/TrackChallengePanel.stories.tsx — `Vistas/
 * TrackChallengePanel` (STORY-SPEC): o desafio de trilha nos 3 atos, com os
 * estados SEMeados pelo caminho REAL de retomada (`challengeDraftCache` —
 * ONDA-RETOMAR): o painel restaura o rascunho como o faria com o aluno a
 * voltar à aba, sem simulação de clique.
 *
 * Estados cobertos:
 *   - ato 1 (enunciado + "Começar"), carregando e erro com retry;
 *   - resolução: editor multi-arquivo (abas) × ficheiro único, gate de
 *     submissão bloqueado (W14: helper do que falta preencher);
 *   - estrelas 0-3 com o cronômetro;
 *   - draft guardado (retomada: código + relógio de onde parou);
 *   - vereditos: reprovado ("Refazer desafio" + "Gerar novo desafio"/
 *     "Ver a aula"/só-refazer no módulo), aprovado ("Avançar para a próxima
 *     aula"), proficiência aprovada e timeout (com o resultado do submit em
 *     voo — S9);
 *   - regeneração em curso (spinner + gates — o modal de progresso global é o
 *     `ChallengeGenerateModal`, área própria).
 *
 * NOTA: o "gate bloqueado por quiz" pedido vive na AULA
 * (`challengeOpenBlockedByQuiz` da LessonView — área própria); o gate deste
 * painel é o de submissão (W14), coberto abaixo.
 */
import type { ReactElement } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { installMockApi } from '../../storybook/mockApi';
import { shellDecorators } from '../../storybook/decorators';
import type { TrackChallengeSpec } from '@shared/ipc-contract';
import {
  challengeSelectionBeforeLesson,
  challengeSelectionLesson,
  challengeSelectionModule,
  challengeSelectionProficiency,
  fixtureTrackMastery,
  fixtureTrackSubmitNoChecks,
  fixtureTrackSubmitPartial,
  fixtureTrackSubmitPassed,
  seedTrackDraft,
  trackDraft,
} from '../../storybook/fixtures.challenge';
import { TrackChallengePanel } from './TrackChallengePanel';

const meta = {
  title: 'Vistas/TrackChallengePanel',
  component: TrackChallengePanel,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  decorators: shellDecorators({ canvas: false }),
  args: {
    selection: challengeSelectionLesson,
    onNavigate: (key: string) => console.debug('[storybook] onNavigate', key),
  },
} satisfies Meta<typeof TrackChallengePanel>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─── Ato 1: enunciado → "Começar" ────────────────────────────────────────────

export const Ato1NaoComecado: Story = {
  loaders: [
    async () => {
      seedTrackDraft(challengeSelectionLesson, trackDraft({ started: false, elapsedMs: 0 }));
      installMockApi();
      return {};
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(async () => {
      expect(await canvas.findByRole('button', { name: 'Começar' })).toBeTruthy();
    });
  },
};

export const Carregando: Story = {
  loaders: [
    async () => {
      installMockApi({ track: { challenge: () => new Promise(() => {}) } });
      return {};
    },
  ],
};

export const ErroComRetry: Story = {
  loaders: [
    async () => {
      installMockApi({
        track: {
          challenge: async () => {
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

// ─── Ato 2: resolução (editor + testar) ─────────────────────────────────────

/** Resolução multi-arquivo: as abas do seletor + código em curso. */
export const ResolucaoMultiArquivo: Story = {
  loaders: [
    async () => {
      seedTrackDraft(
        challengeSelectionLesson,
        trackDraft({
          started: true,
          elapsedMs: 38_000,
          starsLeft: 3,
          filesCode: {
            'solution.py': 'def para_celsius(f):\n    return (f - 32) * 5 / 9\n',
            'test_solution.py': 'import unittest\n\nclass T(unittest.TestCase):\n    pass\n',
          },
          activeFile: 'solution.py',
        }),
      );
      installMockApi({
        track: {
          challenge: async () => ({
            ok: true as const,
            challenge: multiFileSpec,
          }),
        },
      });
      return {};
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(async () => {
      expect(await canvas.findByText('Arquivos do desafio')).toBeTruthy();
      expect(await canvas.findByRole('tab', { name: /solution\.py/ })).toBeTruthy();
    });
  },
};

/** Ficheiro único (o editor só tem o `solution.mjs` histórico). */
export const ResolucaoFicheiroUnico: Story = {
  loaders: [
    async () => {
      seedTrackDraft(
        challengeSelectionLesson,
        trackDraft({ started: true, elapsedMs: 21_000 }),
        singleFileSpec.slug,
      );
      installMockApi({
        track: {
          challenge: async () => ({
            ok: true as const,
            challenge: singleFileSpec,
          }),
        },
      });
      return {};
    },
  ],
};

/** Gate de submissão bloqueado (W14): sem código, o botão diz O QUE falta. */
export const GateDeSubmissaoBloqueado: Story = {
  loaders: [
    async () => {
      seedTrackDraft(
        challengeSelectionLesson,
        trackDraft({ started: true, code: '', filesCode: {}, activeFile: null }),
        singleFileSpec.slug,
      );
      installMockApi({
        track: {
          challenge: async () => ({
            ok: true as const,
            challenge: singleFileSpec,
          }),
        },
      });
      return {};
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(async () => {
      expect(await canvas.findByText('Escreve a solução para testar')).toBeTruthy();
    });
  },
};

/** Resultado PARCIAL (2 de 3) com o checklist individual (ONDA 1). */
export const ResultadoParcial: Story = {
  loaders: [
    async () => {
      seedTrackDraft(
        challengeSelectionLesson,
        trackDraft({
          started: true,
          elapsedMs: 75_000,
          starsLeft: 2,
          result: fixtureTrackSubmitPartial,
        }),
      );
      installMockApi();
      return {};
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(async () => {
      expect(await canvas.findByText('2 de 3 testes passaram')).toBeTruthy();
      expect(await canvas.findByText('Resultado por teste')).toBeTruthy();
    });
  },
};

/** Resultado SEM checks (erro de sintaxe — a saída fala por si). */
export const ResultadoSemChecks: Story = {
  loaders: [
    async () => {
      seedTrackDraft(
        challengeSelectionLesson,
        trackDraft({
          started: true,
          elapsedMs: 51_000,
          starsLeft: 3,
          result: fixtureTrackSubmitNoChecks,
        }),
      );
      installMockApi();
      return {};
    },
  ],
};

// ─── Estrelas 0-3 + cronômetro ──────────────────────────────────────────────

export const Estrelas3: Story = {
  loaders: [
    async () => {
      seedTrackDraft(challengeSelectionLesson, trackDraft({ started: true, starsLeft: 3, elapsedMs: 30_000 }));
      installMockApi();
      return {};
    },
  ],
};

export const Estrelas2: Story = {
  loaders: [
    async () => {
      seedTrackDraft(challengeSelectionLesson, trackDraft({ started: true, starsLeft: 2, elapsedMs: 75_000 }));
      installMockApi();
      return {};
    },
  ],
};

export const Estrelas1: Story = {
  loaders: [
    async () => {
      seedTrackDraft(challengeSelectionLesson, trackDraft({ started: true, starsLeft: 1, elapsedMs: 125_000 }));
      installMockApi();
      return {};
    },
  ],
};

export const Estrelas0: Story = {
  loaders: [
    async () => {
      seedTrackDraft(challengeSelectionLesson, trackDraft({ started: true, starsLeft: 0, elapsedMs: 180_000 }));
      installMockApi();
      return {};
    },
  ],
};

/** Draft guardado (retomada): código + relógio de onde parou (ONDA-RETOMAR). */
export const DraftGuardado: Story = {
  loaders: [
    async () => {
      seedTrackDraft(
        challengeSelectionLesson,
        trackDraft({
          started: true,
          elapsedMs: 96_000,
          starsLeft: 2,
          code: 'def para_celsius(f):\n    # TODO: aplicar a fórmula\n    return None\n',
        }),
      );
      installMockApi();
      return {};
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(async () => {
      // O cronômetro retoma de onde parou (1:54 dos 3:30).
      expect(await canvas.findByRole('timer')).toBeTruthy();
    });
  },
};

// ─── Ato 3: vereditos ───────────────────────────────────────────────────────

/** Reprovado (proficiência): "Refazer desafio" + "Gerar novo desafio". */
export const VereditoReprovadoRefazerGerar: Story = {
  loaders: [
    async () => {
      seedTrackDraft(
        challengeSelectionProficiency,
        trackDraft({
          started: true,
          elapsedMs: 61_000,
          starsLeft: 2,
          concluded: 'failed',
          result: fixtureTrackSubmitPartial,
          marked: 'failed',
        }),
        'proficiencia',
      );
      installMockApi();
      return {};
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(async () => {
      expect(await canvas.findByRole('button', { name: /Refazer o desafio/ })).toBeTruthy();
      expect(await canvas.findByText('Gerar novo desafio')).toBeTruthy();
    });
  },
};

/** Reprovado ANTES da aula: "Refazer desafio" + "Ver a aula" (ONDA2). */
export const VereditoReprovadoVerAAula: Story = {
  loaders: [
    async () => {
      seedTrackDraft(
        challengeSelectionBeforeLesson,
        trackDraft({
          started: true,
          elapsedMs: 43_000,
          starsLeft: 1,
          concluded: 'failed',
          result: fixtureTrackSubmitPartial,
          marked: 'failed',
        }),
      );
      installMockApi();
      return {};
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(async () => {
      expect(await canvas.findByRole('button', { name: /Refazer o desafio/ })).toBeTruthy();
      expect(await canvas.findByText('Ver a aula')).toBeTruthy();
    });
  },
};

/** Reprovado no MÓDULO: só "Refazer desafio" (sem regeneração — autoral). */
export const VereditoModuloSoRefazer: Story = {
  loaders: [
    async () => {
      seedTrackDraft(
        challengeSelectionModule,
        trackDraft({
          started: true,
          elapsedMs: 140_000,
          starsLeft: 1,
          concluded: 'failed',
          result: fixtureTrackSubmitPartial,
          marked: 'failed',
        }),
        'desafio-modulo-fundamentos',
      );
      installMockApi();
      return {};
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(async () => {
      expect(await canvas.findByRole('button', { name: /Refazer o desafio/ })).toBeTruthy();
      // O módulo é autoral — não gera desafio novo.
      expect(canvas.queryByText('Gerar novo desafio')).toBeNull();
    });
  },
};

/** Aprovado (aula): "Avançar para a próxima aula" + "Gerar outro desafio". */
export const VereditoAprovado: Story = {
  loaders: [
    async () => {
      seedTrackDraft(
        challengeSelectionLesson,
        trackDraft({
          started: true,
          elapsedMs: 88_000,
          starsLeft: 2,
          concluded: 'passed',
          result: fixtureTrackSubmitPassed,
          marked: 'passed',
        }),
      );
      installMockApi();
      return {};
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(async () => {
      expect(await canvas.findByText('Passou com 2 estrela(s)!')).toBeTruthy();
      expect(await canvas.findByText('Avançar para a próxima aula')).toBeTruthy();
    });
  },
};

/** Proficiência aprovada: a trilha inteira destravada. */
export const ProficienciaAprovada: Story = {
  loaders: [
    async () => {
      seedTrackDraft(
        challengeSelectionProficiency,
        trackDraft({
          started: true,
          elapsedMs: 210_000,
          starsLeft: 3,
          concluded: 'passed',
          result: fixtureTrackSubmitPassed,
          marked: 'passed',
        }),
        'proficiencia',
      );
      installMockApi();
      return {};
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(async () => {
      expect(
        await canvas.findByText('Proficiência aprovada: a trilha inteira está destravada!'),
      ).toBeTruthy();
    });
  },
};

/** Timeout com o submit em voo (S9): o veredito do relógio FICA + o resultado. */
export const VereditoTimeout: Story = {
  loaders: [
    async () => {
      seedTrackDraft(
        challengeSelectionLesson,
        trackDraft({
          started: true,
          elapsedMs: 210_000,
          starsLeft: 0,
          concluded: 'timeout',
          result: fixtureTrackSubmitPartial,
          marked: 'timeout',
        }),
      );
      installMockApi();
      return {};
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(async () => {
      expect(await canvas.findByText('Tempo esgotado.')).toBeTruthy();
      expect(
        await canvas.findByText(
          'Tempo esgotado durante a execução: o resultado da tentativa segue.',
        ),
      ).toBeTruthy();
    });
  },
};

/** Análise de domínio do MÓDULO (o que demonstrou × o que refazer). */
export const ModuloAnaliseDeDominio: Story = {
  loaders: [
    async () => {
      seedTrackDraft(
        challengeSelectionModule,
        trackDraft({
          started: true,
          elapsedMs: 190_000,
          starsLeft: 1,
          result: {
            ...fixtureTrackSubmitPartial,
            mastery: fixtureTrackMastery,
          },
        }),
        'desafio-modulo-fundamentos',
      );
      installMockApi();
      return {};
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(async () => {
      expect(await canvas.findByText('O que esta tentativa demonstrou')).toBeTruthy();
    });
  },
};

// ─── Regeneração ────────────────────────────────────────────────────────────

/**
 * Regeneração em curso: o "Gerar novo desafio" dispara o processo GLOBAL
 * (challengeGenerateStore + `track:challengeRegenerate`) — o botão fica em
 * spinner e os gates ligam. O MODAL de progresso (etapas + eventos do main) é
 * o `ChallengeGenerateModal` (área própria, montado no shell).
 */
export const RegeneracaoEmCurso: Story = {
  loaders: [
    async () => {
      seedTrackDraft(
        challengeSelectionProficiency,
        trackDraft({
          started: true,
          elapsedMs: 61_000,
          starsLeft: 2,
          concluded: 'failed',
          result: fixtureTrackSubmitPartial,
          marked: 'failed',
        }),
        'proficiencia',
      );
      installMockApi({
        track: { challengeRegenerate: () => new Promise(() => {}) },
      });
      return {};
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const rotulo = await canvas.findByText('Gerar novo desafio');
    const botao = rotulo.closest('button');
    expect(botao).not.toBeNull();
    await userEvent.click(botao as HTMLElement);
    await waitFor(() => {
      expect((botao as HTMLButtonElement).disabled).toBe(true);
    });
  },
};

// ─── Especificações auxiliares (multi-arquivo × ficheiro único) ─────────────

const multiFileSpec: TrackChallengeSpec = {
  slug: 'desafio-aula-2-temperatura',
  title: 'Desafio: converter temperatura',
  concept: 'tipos',
  difficulty: 2,
  statement:
    '# Converter temperatura\n\n' +
    'Escreva `para_celsius(f)` em `solution.py` e valide em `test_solution.py`.\n\n' +
    'A fórmula é $c = \\frac{5}{9}(f - 32)$.\n',
  files: [
    {
      path: 'solution.py',
      starterCode: 'def para_celsius(f):\n    # TODO: aplique a fórmula\n    raise NotImplementedError\n',
    },
    {
      path: 'test_solution.py',
      starterCode: 'import unittest\n\nclass T(unittest.TestCase):\n    pass\n',
    },
  ],
  starterCode: 'def para_celsius(f):\n    # TODO: aplique a fórmula\n    raise NotImplementedError\n',
  expectedTestCount: 3,
  minFirstStarMs: 45_000,
  timeLimitMs: 210_000,
  source: 'track',
  lastVerdict: null,
  stars: 0,
  failedCount: 0,
};

const singleFileSpec: TrackChallengeSpec = {
  ...multiFileSpec,
  slug: 'desafio-solution-unico',
  title: 'Desafio: converter temperatura (solution.mjs)',
  statement:
    '# Converter temperatura\n\n' +
    'Escreva `para_celsius(f)` em `solution.mjs`.\n',
  files: undefined,
  starterCode: '// escreve aqui a tua solução\n',
};
