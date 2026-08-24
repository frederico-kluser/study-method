/**
 * src/features/onboarding/constants/onboardingI18n.ts
 *
 * Union tipada das chaves `translation:tutorial.*` usadas pelo tutorial.
 *
 * Com `strictKeyChecks` (i18next v25 + src/i18n/i18next.d.ts), `t()` só aceita
 * chaves que existem nos resources embutidos (pt-BR e en). Mantemos um
 * literal-union explícito de TODAS as chaves de tutorial usadas pelo overlay,
 * steps (completo + quick start), modal de seleção, status e áudio.
 *
 * As chaves precisam estar em PARIDADE EXATA em src/i18n/locales/{pt-BR,en}/
 * translation.json (bloco `tutorial`) — `tests/i18n-resources.test.ts` e
 * `tests/onboardingSteps.test.ts` validam.
 */
export type OnboardingI18nKey =
  // progresso
  | 'translation:tutorial.progress.chapter'
  | 'translation:tutorial.progress.step'
  // controles
  | 'translation:tutorial.controls.close'
  | 'translation:tutorial.controls.skip'
  | 'translation:tutorial.controls.skipTutorial'
  | 'translation:tutorial.controls.next'
  | 'translation:tutorial.controls.finish'
  | 'translation:tutorial.controls.finishTutorial'
  // status do auto-avanço
  | 'translation:tutorial.status.readyToContinue'
  | 'translation:tutorial.status.waitingForAction'
  // áudio
  | 'translation:tutorial.audio.mute'
  | 'translation:tutorial.audio.unmute'
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
  // steps — settings (guia por ação)
  | 'translation:tutorial.steps.openSettings.title'
  | 'translation:tutorial.steps.openSettings.description'
  | 'translation:tutorial.steps.settingsKeys.title'
  | 'translation:tutorial.steps.settingsKeys.description'
  | 'translation:tutorial.steps.settingsKeysFill.description'
  // steps — lesson (assunto + gerar)
  | 'translation:tutorial.steps.openLesson.title'
  | 'translation:tutorial.steps.openLesson.description'
  | 'translation:tutorial.steps.lessonSubject.title'
  | 'translation:tutorial.steps.lessonSubject.description'
  | 'translation:tutorial.steps.lessonSubjectFill.description'
  | 'translation:tutorial.steps.lessonGenerate.title'
  | 'translation:tutorial.steps.lessonGenerate.description'
  // steps — challenge
  | 'translation:tutorial.steps.openChallenge.title'
  | 'translation:tutorial.steps.openChallenge.description'
  | 'translation:tutorial.steps.challengeEditor.title'
  | 'translation:tutorial.steps.challengeEditor.description'
  | 'translation:tutorial.steps.challengeEditorType.description'
  | 'translation:tutorial.steps.challengeTerminal.title'
  | 'translation:tutorial.steps.challengeTerminal.description'
  | 'translation:tutorial.steps.challengeTestAnswer.title'
  | 'translation:tutorial.steps.challengeTestAnswer.description'
  // steps — conclusão (completo + quick start)
  | 'translation:tutorial.steps.tourComplete.title'
  | 'translation:tutorial.steps.tourComplete.description'
  | 'translation:tutorial.steps.quickStartComplete.title'
  | 'translation:tutorial.steps.quickStartComplete.description'
  // steps — quick start (descrições exclusivas)
  | 'translation:tutorial.steps.qsOpenLesson.description'
  | 'translation:tutorial.steps.qsOpenChallenge.description'
  | 'translation:tutorial.steps.qsChallengeTestAnswer.description'
  // dica pós-tutorial (help hint)
  | 'translation:tutorial.helpHint.title'
  | 'translation:tutorial.helpHint.description'
  // modal de seleção (duas opções)
  | 'translation:tutorial.selection.title'
  | 'translation:tutorial.selection.subtitle'
  | 'translation:tutorial.selection.quickStartTitle'
  | 'translation:tutorial.selection.quickStartDescription'
  | 'translation:tutorial.selection.fullTutorialTitle'
  | 'translation:tutorial.selection.fullTutorialDescription'
  | 'translation:tutorial.selection.badgeRecommended'
  | 'translation:tutorial.selection.badgeFull'
  | 'translation:tutorial.selection.requiresKeys'
  | 'translation:tutorial.selection.openSettings'
  | 'translation:tutorial.selection.dismiss';