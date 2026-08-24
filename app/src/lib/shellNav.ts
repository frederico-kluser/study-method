/**
 * src/lib/shellNav.ts — mapa puro de navegação do shell (lógica, sem React/DOM).
 *
 * Extraído da App.tsx (onda 7 — MUI shell) para ser testável via node:test sem
 * jsdom, e para que a ordem das abas e a associação aba→chave i18n (`nav.*`)
 * vivam num único lugar de verdade. As chaves `nav.*` são literais (strictKeyChecks).
 */
export type NavKey = 'home' | 'settings' | 'lesson' | 'challenge';

/**
 * Chaves i18n dos rótulos das abas. Usam o namespace explícito `translation:`
 * porque o `strictKeyChecks` (i18next v25) só aceita a forma
 * `translation:<key>` — ver src/i18n/i18next.d.ts. Em runtime resolve via
 * `defaultNS: 'translation'` + `nsSeparator: ':'`.
 */
export type NavI18nKey =
  | 'translation:nav.home'
  | 'translation:nav.settings'
  | 'translation:nav.lesson'
  | 'translation:nav.challenge';

export interface NavItem {
  key: NavKey;
  /** Chave i18n do rótulo da aba (nav.*). */
  i18nKey: NavI18nKey;
}

/** Ordem canônica das abas do shell (Início → Settings → Aula → Desafio). */
export const NAV_ITEMS: ReadonlyArray<NavItem> = [
  { key: 'home', i18nKey: 'translation:nav.home' },
  { key: 'settings', i18nKey: 'translation:nav.settings' },
  { key: 'lesson', i18nKey: 'translation:nav.lesson' },
  { key: 'challenge', i18nKey: 'translation:nav.challenge' },
];

/** Índice de um NavKey na ordem canônica (para o Tabs value). */
export function navIndexOf(key: NavKey): number {
  return NAV_ITEMS.findIndex((n) => n.key === key);
}

/** Retorna o NavItem de um índice válido da ordem canônica. */
export function navItemAt(index: number): NavItem | undefined {
  return NAV_ITEMS[index];
}

/** Validada que o mapa é uma permutação contígua de 0..n-1 (para o Tabs). */
export function navIsContiguous(): boolean {
  return NAV_ITEMS.every((_, i) => navItemAt(i) !== undefined);
}