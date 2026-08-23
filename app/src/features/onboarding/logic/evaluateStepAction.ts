/**
 * src/features/onboarding/logic/evaluateStepAction.ts
 *
 * AVALIAÇÃO de ações por snapshot — núcleo puro e testável do auto-avanço.
 *
 * Portado e ADAPTADO de `ondokai/.../useInteractiveOnboarding.ts::evaluateStepAction`.
 * O Ondokai comparava um snapshot do contexto (estado no início do passo) com o
 * contexto atual; cada `expectedAction` tem uma condição de satisfação. Aqui
 * replicamos o mesmo espírito para o Study Method:
 *
 *  - `open-settings|open-lesson|open-challenge` → a aba ativa do shell mudou
 *    para a esperada (delta em relação ao snapshot);
 *  - `fill-lesson-subject` / `type-in-editor` / `settings-keys-filled` → os
 *    sinais DOM ficaram non-vazios;
 *  - `generate-lesson` / `test-answer` → a ação foi disparada (saída de idle).
 *    Delta OPCIONAL (ACHADO-3): se o snapshot já indicava cumprido no início do
 *    passo (re-run do tutorial), a satisfação ainda vale — o estado deve apenas
 *    estar "cumprido" para o passo avançar.
 *
 * Função 100% pura (sem React/DOM) — testada em tests/evaluateStepAction.test.ts.
 */

import type {
  OnboardingExpectedAction,
  OnboardingRuntimeContext,
  OnboardingStepDefinition,
  OnboardingStepSnapshot,
} from '../types/onboarding.types';

/** Cria um snapshot do contexto (estado no início do passo). */
export function createSnapshot(
  ctx: OnboardingRuntimeContext,
): OnboardingStepSnapshot {
  return {
    activeView: ctx.activeView,
    lessonSubjectNonEmpty: ctx.lessonSubjectNonEmpty,
    lessonRunningOrDone: ctx.lessonRunningOrDone,
    studioCodeNonEmpty: ctx.studioCodeNonEmpty,
    testAnswerTriggered: ctx.testAnswerTriggered,
    keysFilled: ctx.keysFilled,
  };
}

/**
 * Avalia se a ação esperada do step foi satisfeita, comparando o snapshot
 * (início do passo) com o contexto atual. Steps SEM `expectedAction` retornam
 * `false` (avançados manualmente por "Continuar").
 */
export function evaluateStepAction(
  step: OnboardingStepDefinition,
  snapshot: OnboardingStepSnapshot,
  ctx: OnboardingRuntimeContext,
): boolean {
  switch (step.expectedAction) {
    case 'open-settings':
      return ctx.activeView === 'settings' && snapshot.activeView !== 'settings';
    case 'open-lesson':
      return ctx.activeView === 'lesson' && snapshot.activeView !== 'lesson';
    case 'open-challenge':
      return ctx.activeView === 'challenge' && snapshot.activeView !== 'challenge';
    case 'fill-lesson-subject':
      return ctx.lessonSubjectNonEmpty;
    case 'generate-lesson':
      // Delta opcional (ACHADO-3): satisfaz também quando o snapshot já indicava
      // a geração em andamento/concluída (re-run não trava por dead-lock de delta).
      return ctx.lessonRunningOrDone;
    case 'type-in-editor':
      return ctx.studioCodeNonEmpty;
    case 'test-answer':
      // Delta opcional (ACHADO-3): o teste já disparado no snapshot também satisfaz.
      return ctx.testAnswerTriggered;
    case 'settings-keys-filled':
      return ctx.keysFilled;
    case undefined:
    default:
      // Sem expectedAction → avanço manual ("Continuar").
      return false;
  }
}

/** Nomes legíveis das ações (para debug/erros). */
export const EXPECTED_ACTION_LABELS: Record<OnboardingExpectedAction, string> = {
  'open-settings': 'navegar para Configurações',
  'open-lesson': 'navegar para Aula',
  'open-challenge': 'navegar para Desafio',
  'fill-lesson-subject': 'digitar o assunto da aula',
  'generate-lesson': 'gerar a aula',
  'type-in-editor': 'escrever no editor',
  'test-answer': 'testar a resposta',
  'settings-keys-filled': 'preencher as chaves de API',
};

/**
 * Se o step tem `expectedAction` (auto-avanço) ou é manual ("Continuar").
 */
export function hasExpectedAction(step: OnboardingStepDefinition): boolean {
  return step.expectedAction !== undefined && step.expectedAction !== null;
}