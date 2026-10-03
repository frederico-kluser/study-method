/**
 * CourseSelector.stories.tsx — Componentes/Curso/CourseSelector.
 *
 * A SELEÇÃO de aulas por assunto: um cartão por assunto com UM único CTA
 * contextual ("Continuar · N aulas feitas" ou "Gerar nova aula" quando o
 * assunto ainda não tem aulas). O componente é view pura — todo o estado
 * (qual ação, que texto de progresso) é decidido em
 * `courseSelectionState.ts` (testado sem jsdom em
 * tests/courseSelectionState.test.ts), então cada estado aqui é dirigido por
 * `args` (STORY-SPEC §5).
 *
 * Cobertura: UM curso · VÁRIOS cursos (inclui singular/plural do rótulo e o
 * curso 100% feito) · ação de GERAR (assunto sem aulas) · empty-state ·
 * seleção (play: o clique chama `onContinue(slug)` — o componente não tem
 * estado "selecionado" próprio; o contrato de seleção é o CALLBACK).
 *
 * O CTA é o `ActionButton` do design system (casca `Pressable` = press-feedback
 * da auditoria §2): é na história que se vê o toque a comprimir o botão.
 */
import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import CourseSelector from './CourseSelector';
import {
  fixtureCourseItems,
  fixtureCourseItemsSemAulas,
  fixtureCourseItemsUm,
} from '../../storybook/fixtures.course';

const meta = {
  title: 'Componentes/Curso/CourseSelector',
  component: CourseSelector,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Seleção de aulas por assunto. Um cartão por assunto com um único CTA contextual; ' +
          'sem assuntos, o empty-state canónico `EmptyState`. Os rótulos por omissão vêm do ' +
          'i18n REAL do produto (chaves `course.sectionLabel`/`course.empty`) — o loader do ' +
          'preview inicializa o i18n, tal como o app.',
      },
    },
  },
  args: {
    courses: fixtureCourseItems,
    onContinue: fn(),
    // `sectionLabel`/`emptyLabel` ficam POR CONTA do i18n (chaves `course.*`):
    // é a demonstração de que as stories renderizam com o i18n REAL do produto
    // (o loader do preview chama `initI18n('pt-BR')`). Os controls abaixo
    // servem para experimentar substituições.
  },
  argTypes: {
    sectionLabel: { control: 'text', description: 'Rótulo da seção (default: `course.sectionLabel`).' },
    emptyLabel: { control: 'text', description: 'Mensagem do empty-state (default: `course.empty`).' },
  },
} satisfies Meta<typeof CourseSelector>;

export default meta;
type Story = StoryObj<typeof meta>;

/** UM curso — o caso mínimo da lista. */
export const UmCurso: Story = {
  args: { courses: fixtureCourseItemsUm },
};

/**
 * VÁRIOS cursos — os quatro estados da lista lado a lado: progresso parcial
 * (3/5), uma aula feita (singular "1 aula feita"), tudo feito (8/8) e sem
 * aulas ("Gerar nova aula").
 */
export const VariosCursos: Story = {};

/**
 * Ação de GERAR — o assunto ainda não tem aulas: o botão vira "Gerar nova
 * aula" com o ícone de adição (a primeira toque cria a primeira aula).
 */
export const CursoParaGerar: Story = {
  args: { courses: fixtureCourseItemsSemAulas },
};

/**
 * Empty-state — nenhum assunto disponível: o bloco canónico `EmptyState` do
 * design system (PRIMITIVES.md §4) com o `sectionLabel` como título e o
 * `emptyLabel` como descrição.
 */
export const SemCursos: Story = {
  args: { courses: [] },
};

/**
 * Seleção (interação) — o clique no CTA entrega o `slug` do assunto em
 * `onContinue`. É o contrato de seleção do componente: sem estado "atuado"
 * próprio, quem guarda a seleção é a view chamadora.
 */
export const SelecaoDeCurso: Story = {
  args: { courses: fixtureCourseItemsUm },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const cta = canvas.getByRole('button', { name: 'Continuar · 3 aulas feitas' });
    await userEvent.click(cta);
    await expect(args.onContinue).toHaveBeenCalledWith('funcoes-em-python');
  },
};
