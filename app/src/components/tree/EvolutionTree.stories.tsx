/**
 * EvolutionTree.stories.tsx — Componentes/Árvore/EvolutionTree.
 *
 * A ÁRVORE DE EVOLUÇÃO das aulas: lista aninhada colapsável onde uma aula
 * quebrada ganha sub-aulas; nós concluídos aparecem preenchidos com ✓, a "em
 * andamento" ganha o ponto de acento + `aria-current`, as pendentes ficam mais
 * claras. Cada nó é um botão real (Enter/Espaço) com `aria-expanded` nas
 * pastas.
 *
 * Estado ≠ view (STORY-SPEC §5): o layout do grafo (que pastas estão abertas)
 * e as derivações (aria-label, texto de estado, recuo) vivem em
 * `evolutionTreeState.ts` — puro, testado sem jsdom em
 * tests/evolutionTreeState.test.ts. Aqui cada estado é dirigido por `args`.
 *
 * Cobertura: árvore pequena (3 níveis, os 3 estados) · nós concluídos/em
 * progresso com rótulos i18n REAIS (`trilha.state.*`/`trilha.levels.*`) ·
 * árvore grande (40 nós — estoura o `maxHeight: 420` e o scroll interno) ·
 * colapsada · empty-state · overflow num canvas pequeno (`withFixedCanvas`) ·
 * interação (play: clique num nó e numa pasta).
 */
import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import EvolutionTree from './EvolutionTree';
import { withFixedCanvas } from '../../storybook/decorators';
import {
  fixtureTreeNodesGrandes,
  fixtureTreeNodesPequenos,
  fixtureTreeNodesVazio,
  fixtureTreeStateLabels,
} from '../../storybook/fixtures.tree';

const meta = {
  title: 'Componentes/Árvore/EvolutionTree',
  component: EvolutionTree,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Árvore de evolução das aulas (role="tree" — cada nó é um `treeitem` botão). ' +
          'Sem nós, o `emptyLabel`; com pastas, colapso por nó. Os rótulos de estado/nível ' +
          'entram por `stateLabels` (i18n) — os defaults legados são pt-BR.',
      },
    },
  },
  args: {
    nodes: fixtureTreeNodesPequenos,
    onSelectLesson: fn(),
  },
  argTypes: {
    collapsed: { control: 'boolean', description: 'Nasce com todas as pastas fechadas.' },
    title: { control: 'text' },
    emptyLabel: { control: 'text' },
  },
} satisfies Meta<typeof EvolutionTree>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Árvore pequena — três níveis, rótulos legados (pt-BR) por omissão. */
export const ArvorePequena: Story = {};

/**
 * Nós concluídos / em progresso / pendentes com os rótulos i18n REAIS do
 * produto (`trilha.state.*` + `trilha.levels.*`) e os selos de nível: o nó
 * "em andamento" é o destaque da próxima aula (`aria-current`, borda de
 * acento + ponto preenchido).
 */
export const NosConcluidosEmProgresso: Story = {
  args: { stateLabels: fixtureTreeStateLabels },
};

/**
 * Árvore GRANDE — quatro módulos × três aulas × duas sub-aulas (40 nós): o
 * scroll interno do componente (`maxHeight: 420`, `overflow: auto`) entra em
 * ação.
 */
export const ArvoreGrande: Story = {
  args: { nodes: fixtureTreeNodesGrandes, stateLabels: fixtureTreeStateLabels },
};

/** Colapsada — todas as pastas nascem fechadas (`collapsed: true`). */
export const Colapsada: Story = {
  args: { collapsed: true },
};

/** Empty-state — nenhuma evolução registada (`emptyLabel`). */
export const EstadoVazio: Story = {
  args: { nodes: fixtureTreeNodesVazio },
};

/**
 * Overflow — a árvore num canvas de 480×320 (`withFixedCanvas`, o envelope
 * de dimensões reais do catálogo): a largura estreita empurra os rótulos
 * longos para a quebra e a altura limitada mostra o scroll interno.
 */
export const Overflow: Story = {
  args: { nodes: fixtureTreeNodesGrandes, stateLabels: fixtureTreeStateLabels },
  decorators: [withFixedCanvas(480, 320)],
};

/**
 * Interação — clicar numa PASTA alterna o colapso (`aria-expanded`) e entrega
 * a aula em `onSelectLesson`; clicar numa FOLHA só navega.
 */
export const InteracaoDeNos: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    // Pasta: "Escopo e closures" (nasce aberta → aria-expanded="true").
    const pasta = canvas.getByRole('treeitem', { name: /Escopo e closures/ });
    await expect(pasta).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(canvas.getByRole('button', { name: 'Escopo e closures' }));
    await expect(pasta).toHaveAttribute('aria-expanded', 'false');
    await expect(args.onSelectLesson).toHaveBeenCalledWith('funcao-escopo');
    // Folha: "Caso base e caso recursivo" — navega, sem o que dobrar.
    await userEvent.click(canvas.getByRole('button', { name: 'Caso base e caso recursivo' }));
    await expect(args.onSelectLesson).toHaveBeenCalledWith('recursao-caso-base');
  },
};
