/**
 * src/lib/i18nText.ts — tradução com FALLBACK para módulos PUROS.
 *
 * O padrão da casa é "módulo puro devolve CHAVE, a view traduz com `t()`"
 * (`themeModeState.ts`, `feedbackProviderUi.ts`, `levels.ts`). Há módulos cuja
 * API devolve COPY pronta (`buildCourseList`, `courseProgressText`, os defaults
 * da árvore, o fallback de `toTreeView`) — para esses, o i18n entra por aqui:
 * `tr(chave, fallback)` resolve na instância ATIVA do i18next QUANDO existe
 * (o app chama `initI18n()` no arranque; o preview do Storybook chama-o nos
 * loaders) e devolve o texto legado em pt-BR caso contrário (testes node:test,
 * ferramentas, SSR sem i18n).
 *
 * ─── A INSTÂNCIA ATIVA É A DE `src/i18n` ───────────────────────────────────
 * `initI18n()`/`createAppI18n()` constroem a instância com
 * `i18next.createInstance()` (ver src/i18n/index.ts) — NÃO é o export default
 * bruto do pacote `i18next`, que fica por inicializar. Quem sabe qual é a
 * instância ativa (a que `useTranslation()` vê, registada pelo
 * `initReactI18next`) é `getDefaultI18n()` de `src/i18n`. Este módulo não usa
 * React: só consulta esse registo de instância.
 *
 * ─── PORQUE O FALLBACK É O TEXTO COMPLETO ──────────────────────────────────
 * `t()` antes do `init` devolve `undefined` (medido), por isso o fallback é a
 * string legada JÁ interpolada pelo chamador — o valor que o produto sempre
 * mostrou em pt-BR, que é exatamente o valor da chave nova em pt-BR (paridade
 * guardada por tests/i18n-resources.test.ts).
 *
 * ─── PLURAIS: ESCOLHA POR CHAVE, NUNCA PELO `count` ────────────────────────
 * As regras CLDR do pt levam 0 para "one" (ver o finding-10a do
 * LessonSidebarHeader: "0 pendentes", não "0 pendente"). Por isso os chamadores
 * escolhem `_one`/`_other` EXPLICITAMENTE e só passam `count`/params de
 * interpolação à chave escolhida.
 */
import i18next from 'i18next';
import { getDefaultI18n } from '../i18n';

/**
 * Chave tipada `translation:<key>` — a união dos resources tipados
 * (`strictKeyChecks` de src/i18n/i18next.d.ts): uma chave que não exista nos
 * dois locales não compila.
 */
export type I18nTextKey = Parameters<typeof i18next.t>[0];

/**
 * Texto traduzido da `key`, ou `fallback` (o texto legado em pt-BR) quando o
 * i18n ainda não está inicializado. `params` interpola `{{…}}` na tradução.
 */
export function tr(
  key: I18nTextKey,
  fallback: string,
  params?: Record<string, string | number>,
): string {
  const i18n = getDefaultI18n();
  if (!i18n) return fallback;
  return i18n.t(key, { ...params, defaultValue: fallback });
}
