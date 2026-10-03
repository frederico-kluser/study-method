/**
 * .storybook/main.ts — configuração do Storybook do study-method.
 *
 * O Storybook deste app é o CATÁLOGO VIVO do design system: cada componente
 * visual de `src/` tem aqui a sua história, e é por aqui que um futuro
 * redesign lê o vocabulário inteiro da UI (ver docs/storybook/HANDBOOK.md).
 *
 * Decisões:
 *   - stories COLOCADAS junto do código (glob `src` + `/*.stories.tsx`) — o
 *     inventário do Storybook é o inventário do código; se um componente não
 *     tem história, o script `tools/storybook-coverage.ts` reprova.
 *   - `@storybook/react-vite`: o renderer já é Vite (electron-vite), portanto o
 *     builder de Vite renderiza os mesmos módulos/aliases do app real.
 *   - aliases `@` e `@shared` espelham `tsconfig.json` para que stories e
 *     componentes usem os MESMOS caminhos de import do app.
 *   - addons só os que interessam: docs (páginas de referência), a11y (o app
 *     tem pisos WCAG verificados em tests/theme.test.ts) — o tema NÃO vem do
 *     addon-themes porque o modo é gerido à mão (ver preview.tsx: a classe
 *     `.light`/`.dark` no <html> é a MESMA mecânica do app real,
 *     `colorSchemeSelector: 'class'`).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeConfig } from 'vite';
import type { StorybookConfig } from '@storybook/react-vite';

const dirname = path.dirname(fileURLToPath(import.meta.url));

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y'],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  staticDirs: ['../resources'],
  viteFinal: (viteConfig) =>
    mergeConfig(viteConfig, {
      resolve: {
        alias: {
          '@shared': path.resolve(dirname, '../shared'),
          '@': path.resolve(dirname, '..'),
        },
      },
    }),
};

export default config;