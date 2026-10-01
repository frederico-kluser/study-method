/**
 * tests/tutorialLauncher.test.ts — testes PUROS do lançador global do tutorial.
 *
 * node:test + tsx, SEM jsdom (padrão do Study Method). Cobre:
 *   - registo → `openSelection()`/`restart()` disparam os abridores certos;
 *   - sem registo → devolvem `false` e NÃO lançam (o botão de ajuda nunca
 *     derruba a UI por falta de host);
 *   - `unregister` idempotente: remove só o registo dono do cleanup (dupla
 *     montagem do StrictMode não apaga o registo da montagem nova);
 *   - re-registo sobrescreve (último host montado vence).
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { tutorialLauncherService } from '../src/features/onboarding/services/tutorialLauncher.service';
import { ONBOARDING_TARGET_CATALOG } from '../src/features/onboarding/constants/onboardingTargets';

describe('tutorialLauncherService', () => {
  beforeEach(() => {
    // Estado de módulo: cada teste começa sem host montado.
    tutorialLauncherService.unregister();
  });

  it('sem registo: openSelection/restart devolvem false e não lançam', () => {
    assert.equal(tutorialLauncherService.isRegistered(), false);
    assert.equal(tutorialLauncherService.openSelection(), false);
    assert.equal(tutorialLauncherService.restart(), false);
  });

  it('com registo: openSelection e restart disparam os abridores certos', () => {
    const calls: string[] = [];
    tutorialLauncherService.register({
      openSelection: () => calls.push('selection'),
      restart: () => calls.push('restart'),
    });
    assert.equal(tutorialLauncherService.isRegistered(), true);
    assert.equal(tutorialLauncherService.openSelection(), true);
    assert.equal(tutorialLauncherService.restart(), true);
    assert.deepEqual(calls, ['selection', 'restart']);
  });

  it('unregister(idêntico) remove o registo; chamadas seguintes devolvem false', () => {
    const openers = { openSelection: () => {}, restart: () => {} };
    tutorialLauncherService.register(openers);
    tutorialLauncherService.unregister(openers);
    assert.equal(tutorialLauncherService.isRegistered(), false);
    assert.equal(tutorialLauncherService.openSelection(), false);
  });

  it('unregister de OUTRO registo não apaga o dono atual (StrictMode-safe)', () => {
    const owner = { openSelection: () => {}, restart: () => {} };
    const stale = { openSelection: () => {}, restart: () => {} };
    tutorialLauncherService.register(owner);
    // cleanup atrasado de um registo antigo não pode derrubar o novo.
    tutorialLauncherService.unregister(stale);
    assert.equal(tutorialLauncherService.isRegistered(), true);
  });

  it('re-registo sobrescreve: o último host montado vence', () => {
    const calls: string[] = [];
    tutorialLauncherService.register({
      openSelection: () => calls.push('first'),
      restart: () => calls.push('first'),
    });
    tutorialLauncherService.register({
      openSelection: () => calls.push('second'),
      restart: () => calls.push('second'),
    });
    tutorialLauncherService.openSelection();
    assert.deepEqual(calls, ['second']);
  });

  it('unregister() sem dono limpa qualquer registo (reset entre testes)', () => {
    tutorialLauncherService.register({ openSelection: () => {}, restart: () => {} });
    tutorialLauncherService.unregister();
    assert.equal(tutorialLauncherService.isRegistered(), false);
  });
});

/* ─── Guardas de fonte: o botão de ajuda não pode sumir em silêncio ──────────
 * (mesmo padrão de shellSidebar/shellSidebarSlot — greps do marcador no JSX).
 * A promessa do tutorial ("reabra pelo botão de ajuda") depende destes três:
 * o botão EXISTE, é renderizado na coluna lateral e tem o alvo de onboarding. */

describe('botão de ajuda: contrato de fonte', () => {
  const read = (rel: string): string =>
    readFileSync(new URL(`../src/${rel}`, import.meta.url), 'utf8');

  it('TutorialHelpButton declara o alvo help-button e chama o lançador', () => {
    const src = read('features/onboarding/components/TutorialHelpButton.tsx');
    assert.ok(src.includes('data-onboarding-target="help-button"'), 'faltou o alvo help-button');
    assert.ok(src.includes('tutorialLauncherService.openSelection()'), 'o botão tem de abrir o tutorial');
  });

  it('a SessionFrame renderiza o TutorialHelpButton (linha de controles)', () => {
    const src = read('components/shell/SessionFrame.tsx');
    assert.ok(src.includes('<TutorialHelpButton'), 'o botão saiu da coluna lateral sem registo');
  });

  it('o catálogo de alvos conhece help-button (everywhere)', () => {
    assert.equal(ONBOARDING_TARGET_CATALOG['help-button']?.everywhere, true);
  });
});