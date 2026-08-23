/**
 * src/features/onboarding/constants/onboardingI18n.ts
 *
 * Union tipada das chaves `translation:tutorial.*` usadas pelo tutorial.
 *
 * Com `strictKeyChecks` (i18next v25 + src/i18n/i18next.d.ts), `t()` só aceita
 * chaves que existem nos resources embutidos (pt-BR e en). Seguimos o mesmo
 * padrão do `NavI18nKey` (shellNav.ts) e do `ThemeModeI18nKey` (themeModeState.ts):
 * um literal-union explícito de TODAS as chaves de tutorial que o overlay e os
 * steps referenciam. Isso garante em TEMPO DE COMPILAÇÃO que toda chave existe.
 *
 * As chaves precisam estar em paridade EXATA em src/i18n/locales/{pt-BR,en}/
 * translation.json (bloco `tutorial` final) — `tests/i18n-resources.test.ts` valida.
 */
export type OnboardingI18nKey =
  // progresso
  | 'translation:tutorial.progress.chapter'
  | 'translation:tutorial.progress.step'
  // controles
  | 'translation:tutorial.controls.close'
  | 'translation:tutorial.controls.skip'
  | 'translation:tutorial.controls.next'
  | 'translation:tutorial.controls.finish'
  // confirmação
  | 'translation:tutorial.confirm.skipMessage'
  | 'translation:tutorial.confirm.closeMessage'
  | 'translation:tutorial.confirm.cancel'
  | 'translation:tutorial.confirm.skipConfirm'
  | 'translation:tutorial.confirm.closeConfirm'
  // navegação
  | 'translation:tutorial.nav.goToTab'
  // capítulos
  | 'translation:tutorial.chapter.shell'
  | 'translation:tutorial.chapter.settings'
  | 'translation:tutorial.chapter.lesson'
  | 'translation:tutorial.chapter.challenge'
  // steps — shell
  | 'translation:tutorial.steps.shellAppTitle.title'
  | 'translation:tutorial.steps.shellAppTitle.description'
  | 'translation:tutorial.steps.shellThemeToggle.title'
  | 'translation:tutorial.steps.shellThemeToggle.description'
  | 'translation:tutorial.steps.shellLanguageSwitcher.title'
  | 'translation:tutorial.steps.shellLanguageSwitcher.description'
  | 'translation:tutorial.steps.shellNavTabs.title'
  | 'translation:tutorial.steps.shellNavTabs.description'
  // steps — settings
  | 'translation:tutorial.steps.settingsKeys.title'
  | 'translation:tutorial.steps.settingsKeys.description'
  // steps — lesson
  | 'translation:tutorial.steps.lessonSubject.title'
  | 'translation:tutorial.steps.lessonSubject.description'
  // steps — challenge
  | 'translation:tutorial.steps.challengeEditor.title'
  | 'translation:tutorial.steps.challengeEditor.description'
  | 'translation:tutorial.steps.challengeTerminal.title'
  | 'translation:tutorial.steps.challengeTerminal.description'
  | 'translation:tutorial.steps.challengeTestAnswer.title'
  | 'translation:tutorial.steps.challengeTestAnswer.description'
  // steps — conclusão
  | 'translation:tutorial.steps.tourComplete.title'
  | 'translation:tutorial.steps.tourComplete.description'
  // modal de seleção
  | 'translation:tutorial.selection.title'
  | 'translation:tutorial.selection.subtitle'
  | 'translation:tutorial.selection.quickTourTitle'
  | 'translation:tutorial.selection.quickTourDescription'
  | 'translation:tutorial.selection.badgeRecommended'
  | 'translation:tutorial.selection.dismiss';