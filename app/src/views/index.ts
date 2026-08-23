/**
 * src/views/index.ts — registry de views do shell.
 *
 * O shell navega por estado (useState, sem router); este arquivo centraliza os
 * componentes para o App. Nesta onda Settings e Aula passam a ser views reais
 * (src/views/SettingsView, src/views/LessonView); Início e Desafio seguem como
 * placeholders (placeholders.tsx) até as ondas seguintes.
 */
export type { ViewProps } from './placeholders';
export { HomeView, ChallengeView } from './placeholders';
export { default as SettingsView } from './SettingsView/SettingsView';
export { default as LessonView } from './LessonView/LessonView';