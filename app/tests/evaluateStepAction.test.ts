/**
 * tests/evaluateStepAction.test.ts — núcleo puro de auto-avanço (onda 16).
 *
 * Cobre as regras de avaliação por snapshot para o fluxo real do Study Method:
 * navegação de abas, digitar assunto, gerar aula, escrever no editor, testar
 * resposta e preencher chaves. Sem jsdom.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluateStepAction,
  createSnapshot,
  hasExpectedAction,
} from '../src/features/onboarding/logic/evaluateStepAction';
import type {
  OnboardingRuntimeContext,
  OnboardingStepDefinition,
  OnboardingStepSnapshot,
} from '../src/features/onboarding/types/onboarding.types';

function ctx(over: Partial<OnboardingRuntimeContext>): OnboardingRuntimeContext {
  return {
    activeView: 'home',
    lessonSubjectNonEmpty: false,
    lessonRunningOrDone: false,
    studioCodeNonEmpty: false,
    testAnswerTriggered: false,
    keysFilled: false,
    ...over,
  };
}

function stepFor(action: OnboardingStepDefinition['expectedAction']): OnboardingStepDefinition {
  return {
    id: 'tour-complete',
    chapterId: 'lesson',
    titleKey: 'translation:tutorial.steps.tourComplete.title',
    descriptionKey: 'translation:tutorial.steps.tourComplete.description',
    targetSelector: '[data-onboarding-target="nav-tabs"]',
    expectedAction: action,
  };
}

describe('evaluateStepAction: navegação de abas (open-*)', () => {
  it('open-settings satisfaz quando a aba ativa mudou p/ settings', () => {
    const step = stepFor('open-settings');
    const snapshot: OnboardingStepSnapshot = { ...createSnapshot(ctx({ activeView: 'home' })) };
    assert.equal(evaluateStepAction(step, snapshot, ctx({ activeView: 'settings' })), true);
  });

  it('open-settings NÃO satisfaz já estando em settings (sem delta)', () => {
    const step = stepFor('open-settings');
    const snapshot = createSnapshot(ctx({ activeView: 'settings' }));
    assert.equal(evaluateStepAction(step, snapshot, ctx({ activeView: 'settings' })), false);
  });

  it('open-lesson satisfaz quando muda p/ lesson', () => {
    const step = stepFor('open-lesson');
    const snapshot = createSnapshot(ctx({ activeView: 'home' }));
    assert.equal(evaluateStepAction(step, snapshot, ctx({ activeView: 'lesson' })), true);
  });

  it('open-challenge satisfaz quando muda p/ challenge', () => {
    const step = stepFor('open-challenge');
    const snapshot = createSnapshot(ctx({ activeView: 'settings' }));
    assert.equal(evaluateStepAction(step, snapshot, ctx({ activeView: 'challenge' })), true);
  });
});

describe('evaluateStepAction: aula (rodada 8 — sem geração)', () => {
  // RODADA 8: o aluno NÃO gera mais aula — as ações 'fill-lesson-subject' e
  // 'generate-lesson' foram REMOVIDAS do catálogo. O capítulo Aula começa com
  // 'open-lesson' (navegar para a aba) e o chat do tutor não tem auto-avanço
  // (o tutor é conversa, não step). Sem expectedAction → avanço manual.
  it('step sem expectedAction avança manualmente (nunca auto-satisfaz)', () => {
    const step = stepFor(undefined);
    const snapshot = createSnapshot(ctx({ activeView: 'lesson' }));
    assert.equal(evaluateStepAction(step, snapshot, ctx({ activeView: 'lesson' })), false);
  });

  it('open-lesson segue satisfazendo pela troca de aba', () => {
    const step = stepFor('open-lesson');
    const snapshot = createSnapshot(ctx({ activeView: 'home' }));
    assert.equal(evaluateStepAction(step, snapshot, ctx({ activeView: 'lesson' })), true);
  });
});

describe('evaluateStepAction: desafio (editor + teste) e chaves', () => {
  it('type-in-editor satisfaz quando o editor tem conteúdo', () => {
    const step = stepFor('type-in-editor');
    const snapshot = createSnapshot(ctx({ studioCodeNonEmpty: false }));
    assert.equal(evaluateStepAction(step, snapshot, ctx({ studioCodeNonEmpty: true })), true);
  });

  it('test-answer satisfaz quando o usuário disparou o teste', () => {
    const step = stepFor('test-answer');
    const snapshot = createSnapshot(ctx({ testAnswerTriggered: false }));
    assert.equal(evaluateStepAction(step, snapshot, ctx({ testAnswerTriggered: true })), true);
  });

  it('test-answer NÃO satisfaz sem delta (ainda não clicou)', () => {
    const step = stepFor('test-answer');
    const snapshot = createSnapshot(ctx({ testAnswerTriggered: false }));
    assert.equal(evaluateStepAction(step, snapshot, ctx({ testAnswerTriggered: false })), false);
  });

  it('test-answer satisfaz mesmo se o snapshot já indicava disparado (ACHADO-3 delta opcional)', () => {
    const step = stepFor('test-answer');
    const snapshot = createSnapshot(ctx({ testAnswerTriggered: true }));
    assert.equal(evaluateStepAction(step, snapshot, ctx({ testAnswerTriggered: true })), true);
  });

  it('settings-keys-filled satisfaz quando ambas as chaves estão preenchidas', () => {
    const step = stepFor('settings-keys-filled');
    const snapshot = createSnapshot(ctx({ keysFilled: false }));
    assert.equal(evaluateStepAction(step, snapshot, ctx({ keysFilled: true })), true);
  });
});

describe('evaluateStepAction: sem expectedAction', () => {
  it('step informativo NUNCA auto-avança (false) — avanço manual', () => {
    const step = stepFor(undefined);
    const snapshot = createSnapshot(ctx({ activeView: 'home' }));
    assert.equal(evaluateStepAction(step, snapshot, ctx({ activeView: 'challenge' })), false);
    assert.equal(hasExpectedAction(step), false);
  });

  it('hasExpectedAction é true p/ steps com ação', () => {
    assert.equal(hasExpectedAction(stepFor('open-settings')), true);
    assert.equal(hasExpectedAction(stepFor('type-in-editor')), true);
  });
});

describe('createSnapshot', () => {
  it('copia todas as chaves do contexto', () => {
    const snapshot = createSnapshot(ctx({ activeView: 'settings', keysFilled: true }));
    assert.equal(snapshot.activeView, 'settings');
    assert.equal(snapshot.keysFilled, true);
    assert.equal(snapshot.lessonSubjectNonEmpty, false);
  });
});