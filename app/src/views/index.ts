/**
 * src/views/index.ts — registry de views do shell.
 *
 * O shell navega por estado (useState, sem router); este arquivo centraliza os
 * componentes para o App. Nesta onda Settings e Aula são views reais e Desafio
 * passa a ser real (ChallengeView — onda 4). Início segue placeholder.
 */
export type { ViewProps } from './placeholders';
export { HomeView } from './placeholders';
export { default as SettingsView } from './SettingsView/SettingsView';
export { default as LessonView } from './LessonView/LessonView';
export { default as ChallengeView } from './ChallengeView/ChallengeView';