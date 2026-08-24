/**
 * tests/tutorialSelectionLogic.test.ts — ACHADO-2 (CTA "Configurar chaves"
 * inoperante dentro de `<Button disabled>`).
 *
 * O card do Tutorial Completo era um `<Button disabled={!hasKeys}>` com o CTA
 * "Configurar chaves" DENTRO — e `<button disabled>` SUPRIME clicks dos
 * descendentes, então `goToSettings()` nunca disparava sem chaves.
 *
 * A correção: (1) o CTA saiu de DENTRO do button desabilitado (irmão abaixo) e
 * (2) o callback `goToSettings` foi extraído para uma função pura exportada
 * (`createOpenSettingsHandler`), testável aqui sem jsdom.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createOpenSettingsHandler } from '../src/features/onboarding/components/tutorialSelectionHelpers';

describe('createOpenSettingsHandler (CTA "Configurar chaves")', () => {
  it('fecha o modal E navega para Settings', () => {
    let closed = false;
    let opened = false;
    const handler = createOpenSettingsHandler(
      () => { closed = true; },
      () => { opened = true; },
    );
    handler();
    assert.equal(closed, true, 'deve fechar o modal de seleção');
    assert.equal(opened, true, 'deve navegar para a aba Settings');
  });

  it('navega mesmo sem fechar (onClose vazio) — ordem fecha→navega preservada', () => {
    const calls: string[] = [];
    const handler = createOpenSettingsHandler(
      () => calls.push('close'),
      () => calls.push('open'),
    );
    handler();
    assert.deepEqual(calls, ['close', 'open'], 'fecha antes de navegar');
  });

  it('chama ambos exatamente uma vez por clique', () => {
    let closeCount = 0;
    let openCount = 0;
    const handler = createOpenSettingsHandler(
      () => { closeCount += 1; },
      () => { openCount += 1; },
    );
    handler();
    handler();
    assert.equal(closeCount, 2);
    assert.equal(openCount, 2);
  });
});