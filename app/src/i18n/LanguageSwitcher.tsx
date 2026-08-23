/**
 * src/i18n/LanguageSwitcher.tsx — trocador de idioma do Study Method.
 *
 * Componente React PURO (sem jsdom; só lógica + marcação): troca o idioma ativo
 * via `i18n.changeLanguage(lng)` (instância registrada pelo react-i18next).
 *
 * PERSISTÊNCIA: repassada ao núcleo. `createAppI18n`/`initI18n` já grava a
 * preferência no localStorage (chave `LANGUAGE_STORAGE_KEY = 'app-language'`) no
 * evento `languageChanged` — então este componente só chama `changeLanguage` e a
 * persistência é efeito do evento. Na montagem aplica o idioma salvo como
 * segurança caso a instância tenha sido inicializada sem ler o localStorage.
 *
 * `variant`: 'select' (default) renderiza um <select>; 'menu' renderiza um
 * grupo de botões. Os rótulos saem de `SUPPORTED_LANGUAGES` (code/name/flag),
 * a mesma fonte que o shell MUI da onda 7 usará.
 */

import { useEffect, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DEFAULT_LANGUAGE,
  getSavedLanguage,
  isSupportedLng,
  SUPPORTED_LANGUAGES,
  type SupportedLng,
} from './index';

interface LanguageSwitcherProps {
  variant?: 'menu' | 'select';
}

/**
 * Aplica o idioma salvo no localStorage, se divergir do atual — garante que a
 * última escolha do usuário vale mesmo quando a instância foi criada sem o
 * localStorage (ex.: algum ponto que inicializou com lng explícito).
 */
async function applyPersistedLanguage(
  i18n: { language: string; changeLanguage(lng: string): Promise<unknown> },
): Promise<void> {
  const saved = getSavedLanguage();
  if (saved && saved !== i18n.language) {
    await i18n.changeLanguage(saved);
  }
}

function onChangeLang(
  i18n: { changeLanguage(lng: string): Promise<unknown> },
  value: string,
): void {
  if (!isSupportedLng(value)) return;
  // Persistência em localStorage acontece no evento languageChanged (núcleo).
  void i18n.changeLanguage(value).catch(() => undefined);
}

export default function LanguageSwitcher({ variant = 'select' }: LanguageSwitcherProps): ReactElement {
  const { i18n } = useTranslation();
  const current = i18n.language;
  const currentCode: SupportedLng = isSupportedLng(current) ? current : DEFAULT_LANGUAGE;

  useEffect(() => {
    void applyPersistedLanguage(i18n).catch(() => undefined);
  }, [i18n]);

  if (variant === 'menu') {
    return (
      <div className="i18n-switcher" role="group" aria-label="Idioma / Language">
        {SUPPORTED_LANGUAGES.map(({ code }) => (
          <button
            key={code}
            type="button"
            className={'i18n-switcher__item' + (currentCode === code ? ' is-active' : '')}
            onClick={() => onChangeLang(i18n, code)}
            aria-pressed={currentCode === code}
          >
            {labelFor(code)}
          </button>
        ))}
      </div>
    );
  }

  return (
    <select
      className="i18n-switcher__select"
      aria-label="Idioma / Language"
      value={currentCode}
      onChange={(e) => onChangeLang(i18n, e.target.value)}
    >
      {SUPPORTED_LANGUAGES.map(({ code }) => (
        <option key={code} value={code}>
          {labelFor(code)}
        </option>
      ))}
    </select>
  );
}

/** Rótulo de exibição por locale (nome + bandeira). */
function labelFor(code: SupportedLng): string {
  const entry = SUPPORTED_LANGUAGES.find((l) => l.code === code);
  return entry ? `${entry.flag} ${entry.name}` : code;
}