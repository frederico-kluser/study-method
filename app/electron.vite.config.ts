import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

const shared = resolve(__dirname, 'shared');

// reference: /home/ondokai/Projects/leet-code-rpg/electron.vite.config.ts
// Três alvos: `main` e `preload` são bundles Node com módulos nativos externalizados
// (externalizeDepsPlugin) — node-llama-cpp carrega dos node_modules em runtime
// (electron-builder faz asarUnpack). `renderer` é o React SPA com base: './' para
// carregar sobre file://. O target `main` ganha a entrada do utility process de
// LLM (llm-engine), forçado pelo LlmProxyService a partir de out/main/.
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@shared': shared } },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'electron/main/index.ts'),
          'llm-engine': resolve(
            __dirname,
            'electron/main/services/embeddedLlm/llmEngine.process.ts',
          ),
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@shared': shared } },
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'electron/preload/index.ts') },
      },
    },
  },
  renderer: {
    root: __dirname,
    base: './',
    plugins: [react()],
    resolve: {
      alias: {
        '@': resolve(__dirname, '.'),
        '@shared': shared,
      },
    },
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'index.html') },
      },
    },
  },
});