/**
 * src/i18n/i18next.d.ts — augmentação de tipos i18next para o Study Method.
 *
 * Convenção herdada do app Ondokai (lá: src/@types/i18next.d.ts). Declara o
 * resources TYPED para o app: `t()` só aceita chaves realmente presentes nos
 * JSONs embutidos, com o ownership de namespace `translation` (unique).
 *
 * Diferente do Ondokai (que recusou typed-resources por causa de ~5400 chaves e
 * usa AST validation), aqui o conjunto é pequeno e estável, então tipar o
 * resources é seguro e pega chaves erradas em tempo de compilação.
 */

import type ptBR from './locales/pt-BR/translation.json';
import type en from './locales/en/translation.json';

declare module 'i18next' {
  interface CustomTypeOptions {
    // Namespace default e único do app.
    defaultNS: 'translation';

    // strictKeyChecks: chaves passadas a t()/useTranslation() que NÃO existem
    // nos resources embutidos passam a FALHAR o type-check (fix do revisor da
    // onda 7). Com strictKeyChecks, o `t()` tipado exige a forma
    // `translation:<key>` (namespace do app); em runtime isso resolve com o
    // `nsSeparator: ':'` + `defaultNS: 'translation'` — ver teste em
    // `tests/i18n-resources.test.ts` e a documentação em src/theme.ts.
    strictKeyChecks: true;

    // Resources embutidos modelados como um ÚNICO namespace `translation`
    // contendo o mapa de chaves achatado. (Em runtime os resources são keyed
    // por locale em src/i18n/index.ts — `{ 'pt-BR': { translation }, en: {...} }`
    // — e o i18next resolve `translation:<key>` segurando o locale ativo.
    // Aqui tipamos o namespace sozinho para que as chaves válidas sejam as
    // literais `translation:<key>`, e chaves erradas falhem.)
    resources: {
      translation: typeof ptBR & typeof en;
    };

    // t() nunca devolve null/objeto — só strings (returnEmptyString false).
    returnNull: false;
    returnObjects: false;

    // Separadores padrão (chaves aninhadas por '.', namespace por ':').
    keySeparator: '.';
    nsSeparator: ':';
  }
}