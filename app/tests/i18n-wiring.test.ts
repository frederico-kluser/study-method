/**
 * tests/i18n-wiring.test.ts — trava a CAMADA DE WIRING do i18n do Study Method.
 *
 * Difere dos testes de `i18n-resources` (que usam instâncias ISOLADAS via
 * `createAppI18n`): aqui validamos o caminho de RUNTIME real que o renderer
 * usa — `initI18n()` do `src/i18n/index.ts`, que inicializa a instância default
 * registrada no react-i18next (a que `useTranslation()`/`useTranslation().i18n`
 * enxerga via `getI18n()`). É o mesmo fluxo que `src/main.tsx` chama no boot.
 *
 * SEM jsdom: `initI18n()` cai no default quando não há `localStorage`/`navigator`
 * (node:test), então resolvemos pt-BR ou o `lng` explícito — o que é exatamente o
 * que queremos travar.
 *
 * NOTA DE MODULE IDENTITY (falso negativo de duplicação do react-i18next):
 *   o pacote exporta `dist/commonjs` E `dist/es` (dual-package). Sob o runner
 *   oficial (`node --test --import tsx`, ESM), TODOS os imports de `react-i18next`
 *   e de `src/i18n/*` no MESMO processo resolvem para o MESMO bundle (`./dist/es`),
 *   então `initReactI18next` e `getI18n()` compartilham o mesmo estado de módulo e
 *   `initI18n()` de fato registra a instância que `getI18n()` devolve. Se um futuro
 *   runner resolver um import para cjs e outro para es, este teste dispara falso
 *   negativo — documente/pr��� o runner, não contorne o check.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Imports do app NORMAL — o que o t.sh roda. Resolvem como o renderer (ESM).
import { initI18n, getDefaultI18n, DEFAULT_LANGUAGE } from '../src/i18n/index';
import { getI18n } from 'react-i18next';

describe('i18n wiring: initI18n → instância default → t()', () => {
  it('initI18n() seta a instância default e o react-i18next (getI18n) a enxerga', async () => {
    const inst = await initI18n();
    assert.equal(inst.isInitialized, true, 'instância default deve estar inicializada');
    assert.equal(getDefaultI18n() === inst, true, 'getDefaultI18n deve devolver a mesma instância');
    // getI18n() do react-i18next é registrado pelo initReactI18next ao iniciar.
    assert.equal(getI18n() === inst, true, 'useTranslation() deve enxergar a instância default');
  });

  it("resolve 'translation:app.title' no default (pt-BR → 'Study Method — Tutor')", async () => {
    await initI18n();
    const inst = getDefaultI18n();
    assert.ok(inst, 'instância default deve existir');
    assert.equal(inst!.language, DEFAULT_LANGUAGE);
    // `t('translation:app.title')` com o namespace explícito: mesmo idioma nos
    // dois locales, então é estável; o que importa é não cair na chave crua.
    assert.equal(inst!.t('translation:app.title'), 'Study Method — Tutor');
  });

  it("changeLanguage('en') faz a mesma chave resolver para o valor en", async () => {
    const inst = await initI18n('en');
    assert.equal(inst.language, 'en');
    // app.title é idêntico nos dois locales; nav.home prova a troca real.
    assert.equal(inst.t('translation:app.title'), 'Study Method — Tutor');
    assert.equal(inst.t('translation:nav.home'), 'Home');
  });
});