/**
 * src/i18n/index.ts — núcleo i18n do Study Method.
 *
 * ESTRUTURA replicada do app Ondokai: i18next + react-i18next, um arquivo JSON
 * por locale sob `src/i18n/locales/<lng>/`, namespace único `translation`,
 * locales `pt-BR` e `en`.
 *
 * DECISÃO DE CARGA — bundler, não fs-backend:
 *   O renderer roda com `sandbox:true` no Electron, então NÃO há Node `fs` no
 *   renderer e o backend i18next-electron-fs-backend (que lê os JSONs do disco)
 *   NÃO pode ser usado em runtime. Por isso os resources são EMBUTIDOS no
 *   bundle via imports de JSON (Vite), mantendo a MESMA estrutura de arquivos
 *   por locale do Ondokai — só muda o mecanismo de carga (bundler vs fs).
 *   `createAppI18n()` cria sempre instâncias novas (isoladas) para podermos
 *   carregar quantas quisermos em testes.
 *
 * PERSISTÊNCIA (compatível com o Ondokai) — localStorage:
 *   Chave `LANGUAGE_STORAGE_KEY = 'app-language'`. A preferência é salva no
 *   evento `languageChanged` da instância (dispara em changeLanguage). Na
 *   inicialização o idioma inicial é resolvido por: `lng` explícito passado a
 *   createAppI18n/initI18n  >  localStorage('app-language')  >  detecção do
 *   idioma do sistema (navigator.language, pt→pt-BR / en→en)  >  DEFAULT
 *   ('pt-BR'). Em runtime (senha sandbox) localStorage/navigator existem; nos
 *   testes node:test (sem jsdom) ambos ausentes → sempre cai em DEFAULT/explicit.
 */

import i18next, { type i18n as I18nInstance, type InitOptions } from 'i18next';
import { initReactI18next } from 'react-i18next';
import ptBR from './locales/pt-BR/translation.json';
import en from './locales/en/translation.json';

/** Chave do localStorage onde o idioma escolhido é persistido (convenção Ondokai). */
export const LANGUAGE_STORAGE_KEY = 'app-language';

/** Locales suportados: códigos (usados pelo i18next) e metadados de exibição. */
export const SUPPORTED_LANGS = ['pt-BR', 'en'] as const;

/** Metadados de exibição por locale — o LanguageSwitcher e o shell MUI usam. */
export const SUPPORTED_LANGUAGES: ReadonlyArray<{ code: SupportedLng; name: string; flag: string }> = [
  { code: 'pt-BR', name: 'Português (Brasil)', flag: '🇧🇷' },
  { code: 'en', name: 'English', flag: '🇺🇸' },
];

export type SupportedLng = (typeof SUPPORTED_LANGS)[number];

/** O idioma padrão do tutor (pt-BR nativo, en como fallback). */
export const DEFAULT_LANGUAGE: SupportedLng = 'pt-BR';

/** Guard de tipo: só aceita um dos locales suportados. */
export function isSupportedLng(value: unknown): value is SupportedLng {
  return typeof value === 'string' && (SUPPORTED_LANGS as readonly string[]).includes(value);
}

/** Resources embutidos no bundle (vindos dos JSONs, carregados pelo bundler). */
export const RESOURCES: Record<SupportedLng, { translation: typeof ptBR }> = {
  'pt-BR': { translation: ptBR },
  en: { translation: en },
};

// ─── Acesso seguro a localStorage/navigator (no node:test ambos inexistem) ────

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function safeLocalStorage(): StorageLike | null {
  try {
    const ls = (globalThis as { localStorage?: StorageLike }).localStorage;
    if (ls && typeof ls.getItem === 'function' && typeof ls.setItem === 'function') return ls;
    return null;
  } catch {
    return null;
  }
}

/** Navegador presente (navigator.language) no runtime do renderer. */
function systemLanguage(): string | null {
  try {
    const nav = (globalThis as { navigator?: { language?: string | null } }).navigator;
    const lang = nav?.language;
    return typeof lang === 'string' && lang.length > 0 ? lang : null;
  } catch {
    return null;
  }
}

/**
 * Idioma salvo em localStorage ('app-language'), ou `null` quando nada salvo.
 * Só aceita locales suportados; valor desconhecido/ausente → `null`.
 */
export function getSavedLanguage(): SupportedLng | null {
  const ls = safeLocalStorage();
  const saved = ls?.getItem(LANGUAGE_STORAGE_KEY);
  return isSupportedLng(saved) ? saved : null;
}

/** Salva a preferência em localStorage (no-op quando indisponível). */
export function saveLanguage(lng: SupportedLng): void {
  const ls = safeLocalStorage();
  try {
    ls?.setItem(LANGUAGE_STORAGE_KEY, lng);
  } catch {
    // quota/privacidade: falha silenciosa, o idioma ativo continua válido na sessão.
  }
}

/**
 * Detecta o idioma do sistema no primeiro uso: `navigator.language`.
 * `pt*` → 'pt-BR', `en*` → 'en', senão `null` (deixa o DEFAULT decidir).
 */
export function detectSystemLanguage(): SupportedLng | null {
  const lang = (systemLanguage() ?? '').toLowerCase();
  if (lang.startsWith('pt')) return 'pt-BR';
  if (lang.startsWith('en')) return 'en';
  return null;
}

/**
 * Resolve o idioma INICIAL da instância (antes do init):
 *   lng explícito  >  localStorage  >  sistema  >  DEFAULT.
 */
export function resolveInitialLanguage(provided?: string): SupportedLng {
  if (provided !== undefined && isSupportedLng(provided)) return provided;
  const saved = getSavedLanguage();
  if (saved) return saved;
  const sys = detectSystemLanguage();
  if (sys) return sys;
  return DEFAULT_LANGUAGE;
}

function baseOptions(lng: SupportedLng): InitOptions {
  return {
    resources: RESOURCES,
    lng,
    fallbackLng: 'pt-BR',
    supportedLngs: SUPPORTED_LANGS as unknown as string[],
    interpolation: { escapeValue: false },
    // Resources já estão embutidos; nenhum backend/fallback async é necessário.
    load: 'currentOnly',
    returnEmptyString: false,
  };
}

/**
 * Cria uma instância i18next NOVA e já inicializada.
 *
 * O idioma inicial segue `resolveInitialLanguage(lng)` (localStorage e detecção
 * do sistema quando nada explícito). Persistência automática: a instância grava
 * o idioma no localStorage no evento `languageChanged` (toda troca futura — o
 * LanguageSwitcher só chama `changeLanguage`, a persistência é efeito do evento).
 */
export async function createAppI18n(lng?: string): Promise<I18nInstance> {
  const startLng = resolveInitialLanguage(lng);
  if (lng !== undefined && !isSupportedLng(lng)) {
    // eslint-disable-next-line no-console
    console.warn(`[i18n] língua '${lng}' não suportada; usando '${DEFAULT_LANGUAGE}'.`);
  }
  const instance = i18next.createInstance();
  // Persistência no evento de troca (compatível com Ondokai: saveLanguage).
  instance.on('languageChanged', (changed: string) => {
    if (isSupportedLng(changed)) saveLanguage(changed);
  });
  await instance.use(initReactI18next).init(baseOptions(startLng));
  return instance;
}

/**
 * Instância singleton com o idioma padrão, pronta para o app.
 *
 * O startup-gate (onda 6) chama `initI18n()` no arranque do renderer para
 * ativar o i18n global; depois disso `import('i18next').t(...)` / hooks do
 * react-i18next operam na instância default. Nos testes NUNCA usar esta — criar
 * instâncias isoladas via `createAppI18n()`.
 */
let _default: I18nInstance | null = null;

export async function initI18n(lng?: string): Promise<I18nInstance> {
  if (!_default) {
    _default = await createAppI18n(lng);
  } else if (lng !== undefined && isSupportedLng(lng)) {
    await _default.changeLanguage(lng);
  }
  return _default;
}

/** Instância default já inicializada (ou `null` antes de `initI18n`). */
export function getDefaultI18n(): I18nInstance | null {
  return _default;
}

export { i18next };