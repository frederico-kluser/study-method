/**
 * LessonSidebarHeader.stories.tsx — Componentes/Curso/LessonSidebarHeader.
 *
 * O CABEÇALHO DA AULA na coluna lateral do shell: curso (sobretítulo) → título
 * (o único h1) → resumo → progresso da teoria (barra + contador) → ações
 * (Desafios com bolha de pendentes / Fontes) → pré-requisitos (chips
 * clicáveis). View pura — só props + i18n; quem guarda estado é a view
 * chamadora (a LessonView o publica no slot via `ShellSidebarPortal`).
 *
 * ─── PORQUE É RENDERIZADO NUMA COLUNA DE 280px ──────────────────────────────
 * O componente vive na coluna ESTREITA do sidebar (piso de 180px, típica de
 * 240–280px — ver o cabeçalho do ficheiro do componente). O
 * `withFixedCanvas(280, …)` do catálogo reproduz essa realidade: sem ela, a
 * política "QUEBRA, NUNCA RECORTA" (SC 1.4.12) não se vê — títulos longos
 * partem em linhas e a coluna cresce em altura, em vez de cortar com reticências.
 *
 * Cobertura: padrão · título longo (quebra; truncar é proibido por política) ·
 * sem desafios · UM desafio pendente (aria-label no singular) · sem
 * pré-requisitos · progresso zero/completo · sem curso · ações (play).
 *
 * Os nomes acessíveis são os MESMOS que os e2e procuram ("Desafios da aula
 * (1 pendente)", "Fontes") — se uma story os mudar, os specs quebram.
 */
import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { LessonSidebarHeader } from './LessonSidebarHeader';
import { withFixedCanvas } from '../../storybook/decorators';
import {
  fixtureSidebarHeader,
  fixtureSidebarHeaderProgressoCompleto,
  fixtureSidebarHeaderProgressoZero,
  fixtureSidebarHeaderSemCurso,
  fixtureSidebarHeaderSemDesafios,
  fixtureSidebarHeaderSemPrerequisitos,
  fixtureSidebarHeaderTituloLongo,
  fixtureSidebarHeaderUmPendente,
} from '../../storybook/fixtures.course';

const meta = {
  title: 'Componentes/Curso/LessonSidebarHeader',
  component: LessonSidebarHeader,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Cabeçalho da aula para a coluna lateral do shell. Tudo sempre montado (sem colapso), ' +
          'tudo quebrando linha (SC 1.4.12: quebra, nunca recorta) e uma única ação destacada ' +
          'por fileira (Desafios: borda/ícone/bolha no acento; Fontes: tinta neutra).',
      },
    },
  },
  // Coluna do sidebar: 280px é a largura típica do painel (piso de 180px) —
  // o canvas fixo é o contexto REAL do componente, não decoração.
  decorators: [withFixedCanvas(280, 'auto')],
  args: {
    ...fixtureSidebarHeader,
    onChallengesClick: fn(),
    onSourcesClick: fn(),
    onPrerequisiteClick: fn(),
  },
  argTypes: {
    theoryProgress: { control: { type: 'range', min: 0, max: 100, step: 1 } },
    challengesExpanded: { control: 'boolean' },
  },
} satisfies Meta<typeof LessonSidebarHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Padrão — curso, resumo, progresso a meio, 3 desafios (2 pendentes), 2 pré-requisitos. */
export const Padrão: Story = {};

/**
 * Título longo — QUEBRA em linhas e a coluna cresce em altura: truncar é
 * proibido por política (SC 1.4.12, o "quebra, nunca recorta" do sidebar);
 * identificadores longos sem espaço também partem (`overflow-wrap: anywhere`).
 */
export const TituloLongo: Story = {
  args: { ...fixtureSidebarHeaderTituloLongo },
};

/** Sem desafios — o botão "Desafios" e a bolha não renderizam; sobra o "Fontes". */
export const SemDesafios: Story = {
  args: { ...fixtureSidebarHeaderSemDesafios },
};

/**
 * UM desafio pendente — o nome acessível usa o singular do pt-BR
 * ("Desafios da aula (1 pendente)", chave `…_one` — finding-10a).
 */
export const UmDesafioPendente: Story = {
  args: { ...fixtureSidebarHeaderUmPendente },
};

/** Sem pré-requisitos — o bloco (rótulo + chips) não renderiza. */
export const SemPrerequisitos: Story = {
  args: { ...fixtureSidebarHeaderSemPrerequisitos },
};

/** Progresso zero — barra vazia, contador "0 de 0 seções" (começo da teoria). */
export const ProgressoZero: Story = {
  args: { ...fixtureSidebarHeaderProgressoZero },
};

/** Progresso completo — barra cheia, contador "7 de 7 seções". */
export const ProgressoCompleto: Story = {
  args: { ...fixtureSidebarHeaderProgressoCompleto },
};

/** Sem curso — a linha de sobretítulo não renderiza (chamadores sem o dado). */
export const SemCurso: Story = {
  args: { ...fixtureSidebarHeaderSemCurso },
};

/**
 * Ações (interação) — "Desafios" entrega o PRÓPRIO botão como âncora
 * (`onChallengesClick(e.currentTarget)`, para a view ancorar o popover) e
 * "Fontes" dispara `onSourcesClick`. Os dois nomes acessíveis são os que os
 * e2e procuram.
 */
export const Acoes: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Desafios da aula (2 pendentes)' }));
    await expect(args.onChallengesClick).toHaveBeenCalledTimes(1);
    await userEvent.click(canvas.getByRole('button', { name: 'Fontes' }));
    await expect(args.onSourcesClick).toHaveBeenCalledTimes(1);
  },
};
