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

    // Resources embutidos (bundler): as chaves válidas para t(), por locale.
    resources: {
      'pt-BR': typeof ptBR;
      en: typeof en;
    };

    // t() nunca devolve null/objeto — só strings (returnEmptyString false).
    returnNull: false;
    returnObjects: false;

    // Separadores padrão (chaves aninhadas por '.', namespace por ':').
    keySeparator: '.';
    nsSeparator: ':';
  }
}