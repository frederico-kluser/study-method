/**
 * src/views/index.ts — registry de views do shell.
 *
 * Cada onda preenche uma view: Settings (settings), Lesson (aulas), Challenge
 * (desafios). Nesta onda (scaffold) todas são placeholders com um card
 * "em construção — chega na onda 3". O shell navega por estado (useState, sem
 * router); o registry centraliza os componentes para o App.
 *
 * Os componentes JSX vivem em placeholders.tsx (.tsx); este arquivo .ts fica
 * sem JSX e apenas reexporta, mantendo o ponto de entrada estável do registro.
 */
export type { ViewProps } from './placeholders';
export { HomeView, SettingsView, LessonView, ChallengeView } from './placeholders';