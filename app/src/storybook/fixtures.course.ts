/**
 * src/storybook/fixtures.course.ts — fixtures pt-BR da área CURSO para as
 * histórias (`Componentes/Curso/CourseSelector`, `Componentes/Curso/
 * LessonSidebarHeader`).
 *
 * Regras desta pasta (STORY-SPEC §7): os dados partilhados vivem em
 * `src/storybook/fixtures.ts` (propriedade do catálogo — NÃO editar); os
 * dados de UMA área ficam no seu `fixtures.<area>.ts`. Aqui estão os assuntos
 * que o CourseSelector renderiza e o conteúdo real do cabeçalho da aula —
 * nada de `lorem ipsum`: é a mesma forma (`CourseItem` de
 * `src/lib/lessonSelection`, `LessonSidebarHeaderProps`) e o mesmo vocabulário
 * que o app usa.
 *
 * PURO: só dados + funções de construção (sem React, sem DOM) — os objetos de
 * `CourseItem` vêm do MESMO pipeline do app (`buildCourseList`), nunca
 * escritos à mão, para as histórias mostrarem os rótulos reais
 * ("Continuar · 3 aulas feitas", "Gerar nova aula").
 */
import type { CourseItem, CourseSubject } from '../lib/lessonSelection';
import { buildCourseList } from '../lib/lessonSelection';
import type { LessonSidebarHeaderProps } from '../components/course/LessonSidebarHeader';

/* ═════════════════════════ COURSE SELECTOR ═══════════════════════════════ */

/**
 * Quatro assuntos com os quatro estados do seletor: progresso parcial (3/5),
 * uma aula feita (singular do rótulo), tudo feito (8/8) e SEM aulas ainda
 * (o botão vira "Gerar nova aula").
 */
export const fixtureCourseSubjects: CourseSubject[] = [
  {
    id: 'subj-1',
    name: 'Funções em Python',
    slug: 'funcoes-em-python',
    lessonCount: 5,
    answeredCount: 3,
  },
  {
    id: 'subj-2',
    name: 'Álgebra básica',
    slug: 'algebra-basica',
    lessonCount: 3,
    answeredCount: 1,
  },
  {
    id: 'subj-3',
    name: 'Estruturas de dados',
    slug: 'estruturas-de-dados',
    lessonCount: 8,
    answeredCount: 8,
  },
  {
    id: 'subj-4',
    name: 'Recursão',
    slug: 'recursao',
    lessonCount: 0,
    answeredCount: 0,
  },
];

/** Os mesmos assuntos, já convertidos para render (pipeline real). */
export const fixtureCourseItems: CourseItem[] = buildCourseList(fixtureCourseSubjects);

/** UM curso — o caso mínimo da lista. */
export const fixtureCourseItemsUm: CourseItem[] = buildCourseList([fixtureCourseSubjects[0]]);

/** Curso SEM aulas — a ação "Gerar nova aula" (ícone +). */
export const fixtureCourseItemsSemAulas: CourseItem[] = buildCourseList([fixtureCourseSubjects[3]]);

/** Lista vazia — o empty-state do seletor. */
export const fixtureCourseItemsVazio: CourseItem[] = [];

/* ═════════════════════════ LESSON SIDEBAR HEADER ═════════════════════════ */

/** O contrato de props do cabeçalho MENOS os callbacks (a story os injeta). */
export type LessonSidebarHeaderData = Omit<
  LessonSidebarHeaderProps,
  'onChallengesClick' | 'onSourcesClick' | 'onPrerequisiteClick'
>;

/** Cabeçalho completo: curso + resumo + progresso + desafios + pré-requisitos. */
export const fixtureSidebarHeader: LessonSidebarHeaderData = {
  title: 'Parâmetros e retorno',
  courseTitle: 'Funções em Python',
  summary:
    'Como uma função recebe entradas, aplica uma regra e devolve um resultado — com exemplos executáveis.',
  challengeCount: 3,
  pendingChallengeCount: 2,
  challengesExpanded: false,
  theoryProgress: 45,
  sectionCurrent: 3,
  sectionTotal: 7,
  prerequisites: [
    { slug: 'o-que-e-uma-funcao', title: 'O que é uma função?' },
    { slug: 'primeiro-programa', title: 'O seu primeiro programa' },
  ],
};

/**
 * Título e resumo LONGOS — o caso de estouro da coluna estreita: QUEBRAM
 * linha (SC 1.4.12, política "quebra, nunca recorta"), nunca truncam.
 */
export const fixtureSidebarHeaderTituloLongo: LessonSidebarHeaderData = {
  ...fixtureSidebarHeader,
  title:
    'Como funções de ordem superior reorganizam o seu programa: closures, callbacks e o preço escondido da abstração',
  summary:
    'Quando uma função recebe outra função como argumento (ou devolve uma), o seu programa ganha uma nova alavanca — e um novo modo de se partir. Esta aula mostra onde a abstração paga o seu custo.',
};

/** Sem desafios — o botão "Desafios" (e a bolha) não renderiza. */
export const fixtureSidebarHeaderSemDesafios: LessonSidebarHeaderData = {
  ...fixtureSidebarHeader,
  challengeCount: 0,
  pendingChallengeCount: 0,
};

/** UM desafio pendente — o aria-label muda para singular ("1 pendente"). */
export const fixtureSidebarHeaderUmPendente: LessonSidebarHeaderData = {
  ...fixtureSidebarHeader,
  challengeCount: 1,
  pendingChallengeCount: 1,
};

/** Sem pré-requisitos — o bloco inteiro não renderiza. */
export const fixtureSidebarHeaderSemPrerequisitos: LessonSidebarHeaderData = {
  ...fixtureSidebarHeader,
  prerequisites: [],
};

/** Progresso zero (começo da teoria) — barra vazia, contador "0 de 0 seções". */
export const fixtureSidebarHeaderProgressoZero: LessonSidebarHeaderData = {
  ...fixtureSidebarHeader,
  theoryProgress: 0,
  sectionCurrent: 0,
  sectionTotal: 0,
};

/** Progresso completo — barra cheia, contador "7 de 7 seções". */
export const fixtureSidebarHeaderProgressoCompleto: LessonSidebarHeaderData = {
  ...fixtureSidebarHeader,
  theoryProgress: 100,
  sectionCurrent: 7,
  sectionTotal: 7,
  pendingChallengeCount: 0,
};

/** Sem curso — a linha de sobretítulo não renderiza (chamadores antigos). */
export const fixtureSidebarHeaderSemCurso: LessonSidebarHeaderData = {
  ...fixtureSidebarHeader,
  courseTitle: undefined,
};
