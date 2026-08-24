/**
 * src/features/onboarding/logic/stepTargetPresence.ts
 *
 * DETECÇÃO de ausência de alvo do passo do tutorial — núcleo puro do
 * ACHADO-1 da revisão adversarial da Onda 16 ("Pular se alvo ausente").
 *
 * A regra preserve do Ondokai é: um passo cujo alvo NÃO existe no DOM é
 * PULADO (avançado) em vez de travar. Mas há um limite: se o alvo pode
 * nascer por ação do usuário na view atual (ex.: digitar o assunto cria o
 * painel; selecionar um desafio monta o editor/teste), NÃO se pula — o
 * overlay mostra a dica de navegação + o fallback de "Continuar".
 *
 * Funções 100% puras (sem React/DOM direto — leem via `globalThis.document`
 * no mesmo formato mínimo de `onboardingSignals`), testáveis sem jsdom.
 */

import type { OnboardingStepDefinition } from '../types/onboarding.types';
import {
  enumeratePresentTargetIds,
  isKnownTargetId,
  ONBOARDING_TARGET_CATALOG,
} from '../constants/onboardingTargets';

/** Extrai o id de um seletor `data-onboarding-target="<id>"` (ou null). */
function parseTargetId(selector?: string): string | null {
  if (!selector) return null;
  const m = /data-onboarding-target="([^"]+)"/.exec(selector);
  return m ? m[1] : null;
}

/**
 * Ids de alvo que o passo pode iluminar (alternativo — tentado ANTES do
 * primário — seguido do primário), sem duplicar.
 */
export function stepTargetIds(step: OnboardingStepDefinition): string[] {
  const ids: string[] = [];
  for (const id of [
    parseTargetId(step.alternateTargetSelector),
    parseTargetId(step.targetSelector),
  ]) {
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/**
 * True quando AO MENOS um alvo do passo está montado no DOM agora
 * (usa `enumeratePresentTargetIds` — alvos conhecidos presentes).
 */
export function isStepTargetPresent(step: OnboardingStepDefinition): boolean {
  const ids = stepTargetIds(step);
  if (ids.length === 0) return false;
  const present = new Set(enumeratePresentTargetIds());
  return ids.some((id) => present.has(id));
}

/**
 * Decide se o passo deve ser PULADO automaticamente por alvo ausente.
 *
 * Regra ondokai: alvo ausente + nenhuma ação possível na view atual ⇒ skip.
 * Em concreto:
 *  - passo sem alvo detectável ⇒ skip (nada a focar);
 *  - algum alvo do passo presente no DOM ⇒ NÃO pula (aguarda a ação);
 *  - alvo ausente cujo id NÃO pertence ao catálogo ⇒ nunca nasce ⇒ skip;
 *  - alvo ausente "everywhere" (sempre-visível) ⇒ não vira por ação do
 *    usuário nesta view ⇒ skip;
 *  - alvo ausente GATED por aba (ex.: `challenge-editor`/`challenge-test-answer`
 *    quando não há desafio ativo) ⇒ PODE nascer por ação do usuário (selecionar
 *    desafio) ⇒ NÃO pula: o overlay mostra o fallback de "Continuar" + dica.
 */
export function shouldAutoSkipStep(step: OnboardingStepDefinition): boolean {
  const ids = stepTargetIds(step);
  if (ids.length === 0) return true;
  const present = new Set(enumeratePresentTargetIds());
  if (ids.some((id) => present.has(id))) return false;

  // Alvo ausente: pula apenas se NENHUM alvo do passo pode nascer por ação.
  return ids.every((id) => {
    if (!isKnownTargetId(id)) return true; // id desconhecido ⇒ nunca nasce.
    const meta = ONBOARDING_TARGET_CATALOG[id];
    if (meta?.everywhere) return true; // sempre-visível ausente ⇒ não vira.
    return false; // gated por aba ⇒ pode nascer por ação ⇒ NÃO pula.
  });
}