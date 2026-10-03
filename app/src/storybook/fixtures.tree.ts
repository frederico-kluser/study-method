/**
 * src/storybook/fixtures.tree.ts — fixtures pt-BR da ÁRVORE DE EVOLUÇÃO para
 * as histórias (`Componentes/Árvore/EvolutionTree`).
 *
 * Regras desta pasta (STORY-SPEC §7): os dados partilhados vivem em
 * `src/storybook/fixtures.ts` (propriedade do catálogo — NÃO editar); os
 * dados de UMA área ficam no seu `fixtures.<area>.ts`. Aqui estão as árvores
 * de aulas (`TreeViewNode` de `src/lib/treeView`) — títulos reais do currículo,
 * estados reais da evolução (concluído/em andamento/pendente) e níveis reais
 * da trilha (`DifficultyLevel`).
 *
 * Os RÓTULOS de estado vêm dos resources de i18n do PRODUTO
 * (`trilha.state.*` / `trilha.levels.*`) — nada de texto inventado: é o mesmo
 * vocabulário que uma view multilíngue passaria em `stateLabels`.
 *
 * PURO: só dados + funções de construção (sem React, sem DOM).
 */
import type { DifficultyLevel } from '../lib/levels';
import type { TreeViewNode } from '../lib/treeView';
import type { TreeStateLabels } from '../components/tree/evolutionTreeState';
import ptBR from '../i18n/locales/pt-BR/translation.json';

/* ═════════════════════════ RÓTULOS (i18n real) ═══════════════════════════ */

/**
 * Rótulos de estado/nível do nó, lidos dos resources de produção
 * (`translation:trilha.state.*`, `translation:trilha.levels.*`) — o contrato
 * de i18n do `EvolutionTree` (`TreeStateLabels`), como uma view multilíngue o
 * passaria.
 */
export const fixtureTreeStateLabels: TreeStateLabels = {
  done: ptBR.trilha.state.done,
  current: ptBR.trilha.state.current,
  pending: ptBR.trilha.state.pending,
  level: (level: DifficultyLevel): string => ptBR.trilha.levels[level],
};

/* ═════════════════════════ ÁRVORE PEQUENA ════════════════════════════════ */

/**
 * Árvore pequena — TRÊS níveis de profundidade com os TRÊS estados do nó e
 * níveis da trilha: o caso de uso normal do componente (uma aula quebrada em
 * sub-aulas, a "em andamento" destacada com `aria-current`).
 */
export const fixtureTreeNodesPequenos: TreeViewNode[] = [
  {
    lessonId: 'funcao-o-que-e',
    label: 'O que é uma função?',
    state: 'done',
    completedAt: '2026-02-08T15:20:00.000Z',
    level: 'beginner',
    children: [
      {
        lessonId: 'funcao-parametros',
        label: 'Parâmetros e retorno',
        state: 'done',
        completedAt: '2026-02-09T15:20:00.000Z',
        level: 'beginner',
        children: [
          {
            lessonId: 'funcao-parametros-nomeados',
            label: 'Parâmetros nomeados e valores padrão',
            state: 'done',
            completedAt: '2026-02-10T15:20:00.000Z',
            children: [],
          },
        ],
      },
      {
        lessonId: 'funcao-escopo',
        label: 'Escopo e closures',
        state: 'current',
        completedAt: null,
        level: 'intermediate',
        children: [
          {
            lessonId: 'funcao-escopo-local',
            label: 'Escopo local contra escopo global',
            state: 'pending',
            completedAt: null,
            children: [],
          },
        ],
      },
    ],
  },
  {
    lessonId: 'recursao-simples',
    label: 'Recursão simples',
    state: 'pending',
    completedAt: null,
    level: 'advanced',
    children: [
      {
        lessonId: 'recursao-caso-base',
        label: 'Caso base e caso recursivo',
        state: 'pending',
        completedAt: null,
        children: [],
      },
    ],
  },
];

/** Árvore vazia — o empty-state (`emptyLabel`). */
export const fixtureTreeNodesVazio: TreeViewNode[] = [];

/* ═════════════════════════ ÁRVORE GRANDE ═════════════════════════════════ */

/**
 * Árvore GRANDE — quatro módulos × três aulas × duas sub-aulas (40 nós): o
 * caso de estouro do `maxHeight: 420` do componente (o scroll interno) e de
 * canvas pequeno (a história `Overflow`).
 */
function subAulas(lessonId: string, titulo: string, feitas: boolean): TreeViewNode[] {
  return [
    {
      lessonId: `${lessonId}-exemplo`,
      label: `${titulo}: exemplo guiado`,
      state: feitas ? 'done' : 'pending',
      completedAt: feitas ? '2026-02-12T15:20:00.000Z' : null,
      children: [],
    },
    {
      lessonId: `${lessonId}-pratica`,
      label: `${titulo}: prática dirigida`,
      state: feitas ? 'done' : 'pending',
      completedAt: feitas ? '2026-02-13T15:20:00.000Z' : null,
      children: [],
    },
  ];
}

const MODULOS: ReadonlyArray<{ id: string; titulo: string; aulas: readonly string[] }> = [
  {
    id: 'm1',
    titulo: 'Módulo 1 — Fundamentos',
    aulas: ['Variáveis e tipos', 'Condicionais', 'Laços de repetição'],
  },
  {
    id: 'm2',
    titulo: 'Módulo 2 — Funções',
    aulas: ['Definir e chamar', 'Argumentos e retorno', 'Funções como valores'],
  },
  {
    id: 'm3',
    titulo: 'Módulo 3 — Estruturas de dados',
    aulas: ['Listas e dicionários', 'Pilhas e filas', 'Conjuntos'],
  },
  {
    id: 'm4',
    titulo: 'Módulo 4 — Projeto',
    aulas: ['Planejar o programa', 'Implementar', 'Testar e corrigir'],
  },
];

/** Os 40 nós da árvore grande — estados determinísticos por posição. */
export const fixtureTreeNodesGrandes: TreeViewNode[] = MODULOS.map((modulo, m) => ({
  lessonId: modulo.id,
  label: modulo.titulo,
  state: m === 0 ? 'done' : m === 1 ? 'current' : 'pending',
  completedAt: m === 0 ? '2026-02-14T15:20:00.000Z' : null,
  level: m === 0 ? 'beginner' : m === 1 ? 'intermediate' : 'advanced',
  children: modulo.aulas.map((aula, i) => ({
    lessonId: `${modulo.id}-a${i + 1}`,
    label: aula,
    state: m === 0 || (m === 1 && i === 0) ? 'done' : m === 1 && i === 1 ? 'current' : 'pending',
    completedAt:
      m === 0 || (m === 1 && i === 0) ? '2026-02-15T15:20:00.000Z' : null,
    level: m === 0 ? 'beginner' : m === 1 ? 'intermediate' : 'advanced',
    children: subAulas(`${modulo.id}-a${i + 1}`, aula, m === 0),
  })),
}));
