import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

const shared = resolve(__dirname, 'shared');

/**
 * Extensões de arquivo de FONTE. Só isto: nada de imagem, nada de SVG.
 * O `?` de query aparece quando o asset chega por `url(...?v=1)`; o Vite já
 * separa o postfix antes de chamar a callback, mas o padrão tolera os dois.
 */
const FONT_FILE_RE = /\.(?:woff2?|ttf|otf|eot)(?:\?.*)?$/i;

/**
 * `build.assetsInlineLimit` como FUNÇÃO — o conserto de um furo de CSP que já
 * existia em `main`, e que o empacotamento das fontes locais só tornou maior.
 *
 * O QUE ESTAVA QUEBRADO. O bloco `renderer.build` não declarava
 * `assetsInlineLimit`, então valia o default do Vite: 4096 B. Todo asset abaixo
 * disso vira `url(data:font/woff2;base64,…)` dentro do CSS. Só que o
 * `index.html` desta app declara `font-src 'self'` — e `data:` NÃO é coberto
 * por `'self'` (CSP Level 3 trata `data:` como um esquema à parte, que precisa
 * ser listado nome a nome). Resultado medido no bundle: DUAS `@font-face`
 * nasciam bloqueadas pela política —
 *   - `KaTeX_Size3-Regular.woff2` (vinda de katex/dist/katex.min.css), que já
 *     estava assim ANTES do redesign: é bug de `main`, não regressão;
 *   - `jetbrains-mono-cyrillic-ext-wght-normal.woff2` (2028 B), a única das 18
 *     faces do @fontsource que cai abaixo dos 4096 B.
 * A falha é silenciosa: erro no console e queda para o fallback, sem quebrar
 * nada visível — dívida que só aparece quando alguém precisa do glifo.
 *
 * POR QUE NÃO AFROUXAR A CSP. `font-src 'self' data:` resolveria o sintoma pelo
 * lado errado e contraria o guarda-corpo de fontes locais de
 * docs/ux-redesign.md §4.1: `data:` é um esquema de conteúdo arbitrário, e
 * abri-lo para fonte é abrir um vetor de injeção por um problema de
 * EMPACOTAMENTO. O certo é o bundle parar de gerar `data:` — a fonte já é um
 * arquivo local em `out/renderer/assets/`, carregada por file:// como qualquer
 * outro asset, exatamente o que `'self'` cobre.
 *
 * A ASSINATURA (conferida no Vite 6.4.3 instalado, não de memória —
 * `node_modules/vite/dist/node/index.d.ts`):
 *     assetsInlineLimit?: number | ((filePath: string, content: Buffer) => boolean | undefined)
 * e a semântica, em `shouldInline()` do runtime:
 *     const userShouldInline = assetsInlineLimit(file, content);
 *     if (userShouldInline != null) return userShouldInline;
 *     limit = DEFAULT_ASSETS_INLINE_LIMIT;   // 4096
 * Ou seja: `false` proíbe o inline daquele arquivo; `undefined` devolve a
 * decisão ao limite default. É por isso que esta função devolve `false` SÓ para
 * fonte e `undefined` para todo o resto — ícone pequeno e afins continuam
 * embutidos como sempre, porque `img-src 'self' data:` os cobre.
 */
function neverInlineFonts(filePath: string): boolean | undefined {
  return FONT_FILE_RE.test(filePath) ? false : undefined;
}

// reference: /home/ondokai/Projects/leet-code-rpg/electron.vite.config.ts
// Três alvos: `main` e `preload` são bundles Node com módulos nativos externalizados
// (externalizeDepsPlugin) — node-llama-cpp carrega dos node_modules em runtime
// (electron-builder faz asarUnpack). `renderer` é o React SPA com base: './' para
// carregar sobre file://. O target `main` ganha a entrada do utility process de
// LLM (llm-engine), forçado pelo LlmProxyService a partir de out/main/.
/**
 * ONDA 6 — POR QUE `typescript` PRECISA SER `dependencies` (e não devDep).
 *
 * `externalizeDepsPlugin()` externaliza o que está em `dependencies` do
 * package.json, e SÓ isso. O processo main precisa do compilador em RUNTIME: a
 * contagem DECLARADA de testes (`adapter.countDeclared`, o gate de igualdade da
 * submissão do aluno) é por AST, e o adaptador o alcança com um
 * `require('typescript')` LITERAL (`engine/lang/javascript.ts`). Com
 * `typescript` em devDependencies duas coisas quebravam:
 *   - o Rollup, vendo o require literal de um pacote NÃO externalizado, tentaria
 *     inlinar o compilador inteiro dentro de out/main/index.js;
 *   - e o electron-builder, que não empacota devDependencies, deixaria o app
 *     instalado sem o módulo — `require('typescript')` morreria no primeiro
 *     "verificar" do aluno.
 * Guardado por `tests/engineLangRegistry.test.ts` ("typescript é DEPENDENCY de
 * runtime"). Medido: com a promoção, out/main/index.js foi de 434,8 kB para
 * 437,2 kB — o compilador continua FORA do bundle.
 */
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
          // Onda 8 (voz): utility process de ASR local — forkado pelo
          // AsrProxyService a partir de out/main/asr-engine.js.
          'asr-engine': resolve(
            __dirname,
            'electron/main/services/localStt/asrEngine.process.ts',
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
      // Nenhum .woff2/.woff/.ttf/.otf/.eot vira `url(data:…)`. Ver
      // `neverInlineFonts` acima: sem isto o default de 4096 B do Vite embute
      // as fontes pequenas e a CSP `font-src 'self'` do index.html as barra.
      assetsInlineLimit: neverInlineFonts,
      rollupOptions: {
        input: { index: resolve(__dirname, 'index.html') },
      },
    },
  },
});