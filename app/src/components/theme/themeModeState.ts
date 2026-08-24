/**
 * src/components/theme/themeModeState.ts — lógica PURA do toggle de tema.
 *
 * Extraída do componente para testes node:test (sem jsdom). Nada aqui depende
 * de DOM/React: ordem de ciclo, validação do modo persistido e parse do valor
 * guardado são funções puras.
 *
 * Contrato (alinha com main.tsx e com o useColorScheme do MUI):
 *   - modos suportados: 'light' | 'dark' | 'system';
 *   - ciclo do botão: light → dark → system → light …
 *   - default (não-guardado) = 'system' (segue o SO);
 *   - persistência: o ThemeProvider usa `modeStorageKey="theme-mode"`, então o
 *     MUI lê no boot e grava no setMode — ver main.tsx.
 */
/** Modos de tema aceitos pela GUI (mesmo vocabulário do MUI useColorScheme). */
export type ThemeMode = 'light' | 'dark' | 'system';

export const THEME_MODES: readonly ThemeMode[] = ['light', 'dark', 'system'] as const;

/**
 * Chaves i18n (namespace translation) por modo — usadas no tooltip/aria-label.
 * Literal union (como `NavI18nKey` em shellNav.ts) para passar pelo
 * `strictKeyChecks` do i18next — ver src/i18n/i18next.d.ts.
 */
export type ThemeModeI18nKey =
  | 'translation:theme.mode.light'
  | 'translation:theme.mode.dark'
  | 'translation:theme.mode.system';

/** Labels i18n por modo. */
export const THEME_MODE_I18N_KEY: Record<ThemeMode, ThemeModeI18nKey> = {
  light: 'translation:theme.mode.light',
  dark: 'translation:theme.mode.dark',
  system: 'translation:theme.mode.system',
};

/** Reconhece um valor persistido como um modo de tema válido (senão undefined). */
export function isThemeMode(value: unknown): value is ThemeMode {
  return typeof value === 'string' && (THEME_MODES as readonly string[]).includes(value);
}

/** Próximo modo no ciclo light → dark → system → light … */
export function nextThemeMode(current: ThemeMode): ThemeMode {
  const idx = THEME_MODES.indexOf(current);
  const next = (idx + 1) % THEME_MODES.length;
  return THEME_MODES[next];
}

/**
 * Resolve o modo a partir de um valor possivelmente persistido (chave 'theme-mode').
 * - null/undefined/string vazia → 'system' (default: segue o SO);
 * - valor válido (‹light|dark|system›) → esse modo;
 * - valor inválido → 'system' (fallback defensivo).
 */
export function parsePersistedThemeMode(stored: string | null | undefined): ThemeMode {
  if (!stored) return 'system';
  if (isThemeMode(stored)) return stored;
  return 'system';
}