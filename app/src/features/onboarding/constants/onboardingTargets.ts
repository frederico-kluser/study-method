/**
 * src/features/onboarding/constants/onboardingTargets.ts
 *
 * Registro de alvos destacáveis do tutorial do Study Method.
 *
 * Portado e ADAPTADO de `ondokai/.../onboardingTargets.ts`. No Ondokai o
 * catálogo servia a um tutorial dinâmico alimentado por LLM; aqui ele é a fonte
 * única de verdade dos elementos `data-onboarding-target` que o tutorial rápido
 * pode iluminar (spotlight). Preservamos o comportamento de DETECÇÃO de alvo:
 *
 *   - `isKnownTargetId(id)`  — id pertence ao catálogo;
 *   - `enumeratePresentTargetIds()` — alvos KNOWN que estão montados no DOM
 *     agora (o overlay usa para PULAR um step cujo alvo não existe — mesma
 *     regra de "step pula alvo ausente" do Ondokai, item 6 do handoff).
 *
 * MANTENHA o catálogo sincronizado com os atributos `data-onboarding-target="…"`
 * no JSX (grep do marcador) — `onboardingTargets.test.ts` guarda isso.
 */

import type { NavKey } from '../../../lib/shellNav';
import type { OnboardingChapterDefinition } from '../types/onboarding.types';

export interface OnboardingTargetMeta {
  /** Descrição legível (usada em metadados/debug e na geração de steps). */
  description: string;
  /** Aba do shell em que o elemento aparece (VERDADE para sempre-visíveis). */
  everywhere?: boolean;
  /** Aba onde o alvo é montado (quando não é everywhere). */
  view?: NavKey;
}

/**
 * id → metadados dos alvos estáveis. Sincronize com os
 * `data-onboarding-target` nos componentes (grep o marcador).
 */
export const ONBOARDING_TARGET_CATALOG: Record<string, OnboardingTargetMeta> = {
  // ─── AppBar (sempre visíveis em qualquer aba) ──────────────────────────────
  'app-title': {
    description: 'Título do app na AppBar (logo/título do Study Method).',
    everywhere: true,
  },
  'theme-toggle': {
    description: 'Botão de alternância de tema (claro/escuro/sistema) na AppBar.',
    everywhere: true,
  },
  'language-switcher': {
    description: 'Seletor de idioma na AppBar.',
    everywhere: true,
  },
  'nav-tabs': {
    description: 'Abas de navegação do shell (Início/Settings/Aula/Desafio).',
    everywhere: true,
  },

  // ─── Settings (aba settings) ───────────────────────────────────────────────
  'settings-keys-section': {
    description: 'Seção "Chaves de API" em Configurações (campo de chaves).',
    view: 'settings',
  },

  // ─── Aula (aba lesson) ─────────────────────────────────────────────────────
  'lesson-subject': {
    description: 'Área de assunto (campo de digitar o assunto da aula).',
    view: 'lesson',
  },

  // ─── Desafio (aba challenge) ───────────────────────────────────────────────
  'challenge-editor': {
    description: 'Editor de código (CodeMirror) no desafio.',
    view: 'challenge',
  },
  'challenge-terminal': {
    description: 'Terminal de saída determinística do desafio.',
    view: 'challenge',
  },
  'challenge-test-answer': {
    description: 'Botão "Testar resposta" do desafio.',
    view: 'challenge',
  },
};

/** True quando `id` é um alvo conhecido do catálogo. */
export function isKnownTargetId(id: string): boolean {
  return id in ONBOARDING_TARGET_CATALOG;
}

/** Forma mínima de elemento com `data-onboarding-target` (evita depender do lib DOM
 * sob o tsconfig.node.json dos testes, que usa `lib: ["ES2022"]`). */
interface TargetElement {
  getAttribute(name: string): string | null;
}

interface DocumentLike {
  querySelectorAll(selector: string): TargetElement[] | ArrayLike<TargetElement>;
}

/**
 * Enumera os alvos CONHECIDOS que estão montados no DOM agora.
 * Usado pelo overlay para decidir se o spotlight pode pousar num step (alvo
 * ausente ⇒ step é pulado — regra preservada do Ondokai).
 */
export function enumeratePresentTargetIds(): string[] {
  const doc = (globalThis as unknown as { document?: DocumentLike }).document;
  if (!doc) {
    return [];
  }
  const ids = new Set<string>();
  const nodes = doc.querySelectorAll('[data-onboarding-target]');
  for (let i = 0; i < (nodes as TargetElement[]).length; i += 1) {
    const id = (nodes as TargetElement[])[i]?.getAttribute('data-onboarding-target');
    if (id && isKnownTargetId(id)) {
      ids.add(id);
    }
  }
  return [...ids];
}

/** Capítulo do tutorial rápido (título por chave i18n `tutorial.chapter.*`). */
export const ONBOARDING_CHAPTERS: OnboardingChapterDefinition[] = [
  { id: 'shell', titleKey: 'translation:tutorial.chapter.shell' },
  { id: 'settings', titleKey: 'translation:tutorial.chapter.settings' },
  { id: 'lesson', titleKey: 'translation:tutorial.chapter.lesson' },
  { id: 'challenge', titleKey: 'translation:tutorial.chapter.challenge' },
];