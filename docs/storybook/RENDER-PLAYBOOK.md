# RENDER-PLAYBOOK — renderizar componentes isolados (base para Storybook)

> Mapa verificado do **como esta base renderiza componentes hoje**, para servir de
> base a um Storybook fiel ao app real. Tudo aqui foi lido/medido no código:
> caminhos são exatos, tempos são medidos nesta máquina. Escopo: `app/`
> (Electron + React 19 + MUI 9.3.1).
>
> Resumo executivo: os testes **não têm jsdom** — renderizam com
> `react-dom/server` + `ThemeProvider` + i18n reais; a API do main entra por
> `__setApiForTests` (fakes parciais por arquivo; o caminho completo é
> `createExposedApi(fakeIpc)`); o que não renderiza em browser puro são os
> módulos nativos do `electron/main` (node-llama-cpp, sherpa, tree-sitter) — que
> o renderer nunca importa — e a ausência de `window.api`.

---

## 1. Como os testes existentes renderizam React

### 1.1 Runner — `node:test` + tsx, SEM jsdom

- **Runner**: `node:test` nativo, carregado com tsx. O wrapper é
  [`app/tools/t.sh`](../../app/tools/t.sh) — `node --import tsx --test <ficheiros>`.
  Ele tem a **EMPTY-GLOB GUARD (V-00)**: um glob que não casa nenhum ficheiro
  vira **FALHA** (exit 1), nunca verde silencioso.
- **Comando**: `cd app && bash tools/t.sh tests` (= `npm test`). Aceita ficheiro,
  diretório ou glob (`bash tools/t.sh tests/lessonSidebarHeader.test.ts`).
- **NÃO existe jsdom, happy-dom nem @testing-library** na suíte da app (os
  pacotes `@testing-library/*` que aparecem no `app/package-lock.json` são
  transitivos do Storybook recém-adicionado aos devDependencies — não são usados
  por nenhum `app/tests/**`). Convenção declarada em
  [`app/tests/_helpers/README.md`](../../app/tests/_helpers/README.md) e em
  praticamente o doc-block de cada teste ("sem jsdom").
- **Escala medido**: 382 ficheiros `.test.ts`, **7285 testes / 1739 suites,
  0 falhas** (2 skipped) em **~62 s** de wall-time (`node --test` paraleliza por
  ficheiro; um ficheiro SSR de 24 testes demora ~1,4 s).
- **Type-check dos testes**: `npm run lint` compila `app/tests/**` no projeto
  [`app/tsconfig.node.json`](../../app/tsconfig.node.json) — `lib: ["ES2022"]`
  **sem DOM** e **sem `jsx`**. Consequências mecânicas para quem escreve
  teste/story:
  - `.tsx` **não pode ser importado estaticamente** (TS6142). O padrão da casa é
    **import dinâmico com specifier computado** (ver
    [`app/tests/lessonSidebarHeader.test.ts:79`](../../app/tests/lessonSidebarHeader.test.ts)):
    ```ts
    const COMPONENT_MODULE = new URL('../src/components/course/LessonSidebarHeader.tsx', import.meta.url).href;
    // no before():
    const mod = (await import(COMPONENT_MODULE)) as { LessonSidebarHeader: ComponentType<Props> };
    ```
  - o contrato de props é **declarado localmente** no teste (o tipo exportado pelo
    `.tsx` não é alcançável) e o componente é tipado como `ComponentType<Props>`.
  - testes usam `createElement(...)` em vez de JSX.

### 1.2 Técnica de render — SSR com `react-dom/server` + tema + i18n reais

A técnica da casa (32 ficheiros em `app/tests/**` usam-na) é:

```ts
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ThemeProvider } from '@mui/material/styles';
import { theme } from '../src/theme';

const html = renderToStaticMarkup(
  createElement(ThemeProvider, { theme }, createElement(Comp, props)),
);
```

Exemplos canónicos (com helpers de leitura de HTML/CSS que valem copiar):
[`app/tests/lessonSidebarHeader.test.ts`](../../app/tests/lessonSidebarHeader.test.ts),
[`app/tests/lessonChatLayout.test.ts`](../../app/tests/lessonChatLayout.test.ts),
[`app/tests/panelCacheSwr.test.ts`](../../app/tests/panelCacheSwr.test.ts),
[`app/tests/quizOverlayRender.test.ts`](../../app/tests/quizOverlayRender.test.ts),
[`app/tests/shellSidebar.test.ts`](../../app/tests/shellSidebar.test.ts),
[`app/tests/cx-views-gap-lesson-view.test.ts`](../../app/tests/cx-views-gap-lesson-view.test.ts)
(renderiza a `LessonView` inteira).

O que os testes medem no HTML emitido (helpers locais repetidos ficheiro a
ficheiro — **não existe helper de render partilhado**):
`cssRulesOf(html)` (extrai `<style>` do emotion no SSR), `markupOf(html)` (marcação
sem folhas), `openTagWith`/`emotionClassOf`/`finalDeclOf` (a tag, a classe
`css-*` do emotion e a última declaração de uma propriedade na regra base =
o que o navegador pinta).

**Limites do SSR que o Storybook NÃO herda** (porque o Storybook renderiza num
browser real):

| SSR (`renderToStaticMarkup`) | Storybook (browser) |
|---|---|
| efeitos (`useEffect`) **não correm** → o IPC do mount não dispara | efeitos correm → `getApi()` é chamado ⇒ **mock obrigatório** |
| sem eventos/ref | cliques, foco, hover funcionam |
| `createPortal` não existe (ver [`ShellSidebarSlot.tsx:48`](../../app/src/components/shell/ShellSidebarSlot.tsx) e `LessonView.tsx` "null até o cliente montar") | portais funcionam |
| sem layout (0px de largura real) | layout real; xterm/CodeMirror medem o container |

Convenção de design que ajuda o Storybook: os componentes "de apresentação" são
**exportados de propósito** para serem montados sozinhos (`LessonComposer`,
`LessonSidebarHeader`, `ChatBubble`, `QuizOverlayHost`, `SessionFrame`, …) —
ver doc-block de [`app/src/views/LessonView/LessonView.tsx:518`](../../app/src/views/LessonView/LessonView.tsx).
São os melhores candidatos a primeiras stories.

### 1.3 Helpers existentes

- [`app/tests/_helpers/fs.ts`](../../app/tests/_helpers/fs.ts) — **só filesystem**:
  `mkTempDir(prefix?)`, `rmrf(dir)`, `writeFile`, `readFile`, `fileExists`.
  Convenções em [`app/tests/_helpers/README.md`](../../app/tests/_helpers/README.md).
- Não há `renderWithProviders` partilhado: cada teste SSR repete o seu
  `renderX(props)` local com `ThemeProvider` + i18n. **Um decorator de Storybook
  substitui com vantagem essa repetição toda.**
- Fixtures de conteúdo: [`app/tests/fixtures/`](../../app/tests/fixtures)
  (python/rust/tracks/typescript) e [`app/tests/_fixtures/`](../../app/tests/_fixtures)
  (skill scripts fake, t.sh). Só dados, não render.

### 1.4 Injeção do fake da API — `__setApiForTests`

A ponte única é [`app/src/lib/apiBridge.ts`](../../app/src/lib/apiBridge.ts):

- `getApi(): ApiSchema` (`:36`) — as views **nunca** tocam `window`; leem tudo por
  aqui. Sem API disponível **lança** `'window.api não está disponível…'` (`:41-43`).
- `__setApiForTests(api)` (`:51`) — injeta o fake (guarda o anterior).
- `__resetApiForTests()` (`:56`) — repõe o estado (volta a `window.api`).
- O tipo é [`ApiSchema`](../../app/electron/preload/api-schema.ts) (`:189`) —
  9 grupos: `settings, keys, pi, localAi, study, track, games, stt, localTts`.
- Também lê `globalThis.api` / `globalThis.window.api` (`:25-30`) — equivalente a
  pôr o mock em `window.api` (útil para o Storybook).

Padrão de uso nos testes: `__setApiForTests(fake)` no `before`/`beforeEach`,
`__resetApiForTests()` no `after`/`afterEach`
([`app/tests/lessonPrefetch.test.ts`](../../app/tests/lessonPrefetch.test.ts)).

### 1.5 Inventário dos fakes de API disponíveis (caminhos exatos)

| O quê | Onde | Completude | Notas |
|---|---|---|---|
| `makeFakeApi(tag)` | [`app/tests/apiBridge.test.ts:21`](../../app/tests/apiBridge.test.ts) | **parcial** (keys/localAi/study) | cada método devolve `'<tag>:<metodo>'`; cast `as unknown as ApiSchema` |
| `fakeApi({fail, gate})` | [`app/tests/lessonPrefetch.test.ts:27`](../../app/tests/lessonPrefetch.test.ts) | **parcial** (`track.lesson`) | conta chamadas; simula falha/presa |
| `makeFakeIpc()` + `createExposedApi(ipc)` | [`app/tests/ipc-contract.test.ts:46`](../../app/tests/ipc-contract.test.ts) | **COMPLETO** (todos os canais) | fake de `IpcBridgeLike` que regista `invoke`/`on`; `createExposedApi` ([`app/electron/preload/api-schema.ts:160`](../../app/electron/preload/api-schema.ts)) deriva TODOS os métodos de `API_GROUPS` (fonte única: [`app/shared/ipc-contract.ts`](../../app/shared/ipc-contract.ts)) |
| bridge inline `IpcBridgeLike` | [`app/tests/startup-contract.test.ts:49`](../../app/tests/startup-contract.test.ts) | parcial (canal de startup) | mesmo molde |
| **e2eStubs** (fixtures determinísticas) | [`app/electron/main/services/e2eStubs.ts`](../../app/electron/main/services/e2eStubs.ts) | **comportamento completo do main** | ativado por `STUDY_METHOD_E2E=1`; substitui handlers de keys/gate/pi/study/localAi/voz/track/games/quiz por fixtures sem rede/LLM. Construtores de payload reutilizáveis: `buildStartupStatus()` (`:151`), `lessonFindings()` (`:236`), `buildLesson()` (`:248`), `materializeChallengeWorkspace()` (`:206`), `validResult()` (`:195`) |

**Conclusão**: não existe um "fake `ApiSchema` completo" reutilizável exportado
de `tests/_helpers` — os fakes são parciais e locais. A **fábrica completa** é
`createExposedApi(fakeIpc)` sobre um transporte falso (linha do `ipc-contract.test.ts`),
e as **respostas realistas** vêm do `e2eStubs.ts`. É exatamente essa combinação
que a §6 propõe para `.storybook/api-mock.ts`.

---

## 2. Como o tema é montado (o que o decorator precisa reproduzir)

Fontes: [`app/src/theme.ts`](../../app/src/theme.ts), [`app/src/main.tsx`](../../app/src/main.tsx),
[`app/src/fonts.ts`](../../app/src/fonts.ts), [`app/src/index.css`](../../app/src/index.css),
[`app/src/lib/designTokens.ts`](../../app/src/lib/designTokens.ts).

### 2.1 A árvore real de produção (`main.tsx:148-155`)

```tsx
import './fonts';                      // efeito colateral: @font-face (main.tsx:61)
import 'katex/dist/katex.min.css';     // (main.tsx:72)
import './index.css';

<StrictMode>
  <ThemeProvider theme={theme} defaultMode="system" modeStorageKey="theme-mode">
    <CssBaseline />
    <AppGate />                        // → <App/> dentro de StartupCtx
  </ThemeProvider>
</StrictMode>
```

Antes do primeiro render, `primeColorSchemeClass()` (`main.tsx:119`) põe a classe
`.light`/`.dark` no `<html>` (resolve `localStorage['theme-mode']` →
`matchMedia('(prefers-color-scheme: dark)')`). `AppGate`/`App` acrescentam ainda
`SessionStateProvider` e `ChallengeNavProvider`
([`app/src/App.tsx:327`](../../app/src/App.tsx)) — só necessários para stories de
componentes que consomem esses contextos.

### 2.2 O tema (`theme.ts`)

- Exporta `theme` (`theme.ts:679`, também `export default`) — `createTheme` do
  **MUI v9.3.1** com:
  - `colorSchemes: { light, dark }` (light é o `defaultColorScheme`);
  - `cssVariables: { colorSchemeSelector: 'class' }` (`theme.ts:701`) —
    **obrigatório**: com o default `'media'` o `setMode()` do toggle não faz nada;
  - `motion: { reducedMotion: 'system' }`;
  - slots customizados (`palette.surface`, `palette.nonText`, `accentText`…)
    derivados de `designTokens.ts` (**nenhum hex vive no theme.ts**);
  - transições nomeadas `spatial*`/`effects*` (module augmentation) e
    `focusRingStyles`/`modalSurfaceStyles` exportados;
  - tipografia pinada (13 variantes), `typography.fontSize: 16`, famílias de
    `FONT_STACK` (display/body/mono) de `designTokens.ts`.
- Regra dura do tema: **nunca** ternário sobre o modo (`mode === 'dark' ? A : B`);
  tudo lê `theme.vars.palette.*` (CSS vars resolvidas pela classe
  `.light`/`.dark` do `<html>`). Um decorator do Storybook que troque o modo deve
  trocar a **classe do `<html>`** (ou `setMode()` do `useColorScheme`), nunca
  montar dois temas.
- O `CssBaseline` do tema tem `styleOverrides` como **função** que pinta
  `*:focus-visible` (guardado por [`app/tests/theme.test.ts`](../../app/tests/theme.test.ts)).

### 2.3 Fontes e CSS globais (o decorator tem de os importar)

- [`app/src/fonts.ts`](../../app/src/fonts.ts) — módulo **de efeito colateral**
  (não exporta nada): regista `@fontsource-variable/inter/wght.css` e
  `@fontsource-variable/jetbrains-mono/wght.css`. Os nomes registados casam com
  `FONT_BUNDLED` de `designTokens.ts` ('Inter Variable', 'JetBrains Mono
  Variable'); as stacks começam por `-apple-system`/SF (não redistribuível).
  Guardas: [`app/tests/bootstrapFonts.test.ts`](../../app/tests/bootstrapFonts.test.ts)
  (proíbe fontes retro e qualquer `fonts.googleapis.com`/`fonts.gstatic` no
  código e no build).
- [`app/src/index.css`](../../app/src/index.css) — regras globais que caem em DOM
  de terceiro (xterm/CodeMirror montam fora da árvore MUI) + baseline do
  `#root`. Sem este import o visual de editor/terminal sai errado.
- `katex/dist/katex.min.css` — estilos das fórmulas (importado no `main.tsx:72`).
- **CSP do app** ([`app/index.html`](../../app/index.html)):
  `style-src 'self' 'unsafe-inline'; font-src 'self'; frame-src https:` —
  necessária para os estilos inline do CodeMirror/xterm e o iframe do
  LessonSourceViewer. No Storybook não há CSP equivalente; se algum dia o
  Storybook for servido dentro do app, copiar estes valores.

### 2.4 dir/lang

- [`app/index.html`](../../app/index.html): `<html lang="pt-BR">`, sem `dir`
  (LTR implícito). O decorator deve garantir `document.documentElement.lang`
  (ex.: repor `'pt-BR'`/`'en'` conforme o locale ativo da toolbar).

**Checklist do decorator de tema (fiel à produção):**
`import '../src/fonts'` → `import '../src/index.css'` →
`import 'katex/dist/katex.min.css'` →
`<ThemeProvider theme={theme} defaultMode="system" modeStorageKey="theme-mode"><CssBaseline/>…`
→ classe `.light`/`.dark` no `<html>` coerente com o modo escolhido.

---

## 3. Como o i18n é inicializado (e o que o decorator precisa)

Fonte: [`app/src/i18n/index.ts`](../../app/src/i18n/index.ts) +
[`app/src/i18n/i18next.d.ts`](../../app/src/i18n/i18next.d.ts).

- **Stack**: i18next 25 + react-i18next 16. **Resources embutidos no bundle**
  (imports de JSON — o renderer é `sandbox: true`, sem `fs`; o
  `i18next-electron-fs-backend` está instalado mas **não é usado** em runtime).
- **Locales reais**: [`app/src/i18n/locales/pt-BR/translation.json`](../../app/src/i18n/locales/pt-BR/translation.json)
  e [`app/src/i18n/locales/en/translation.json`](../../app/src/i18n/locales/en/translation.json)
  — namespace único `translation`; export `RESOURCES` (`index.ts:57`).
- **Opções** (`baseOptions`, `index.ts:135`): `fallbackLng: 'pt-BR'`,
  `supportedLngs: ['pt-BR','en']`, `interpolation: { escapeValue: false }`,
  `load: 'currentOnly'`, `returnEmptyString: false`.
- **Duas formas de instância**:
  - `initI18n(lng?)` (`:181`) — **singleton default** (o que `useTranslation()`
    vê); é o que [`app/src/main.tsx:146`](../../app/src/main.tsx) chama antes do
    primeiro render. Os testes **não** a usam (só
    [`app/tests/i18n-wiring.test.ts`](../../app/tests/i18n-wiring.test.ts) a testa).
  - `createAppI18n(lng?)` (`:156`) — **instância isolada nova**; o recomendado
    para testes e para o Storybook (imune a poluição do singleton entre stories).
- **Resolução de idioma** (`resolveInitialLanguage`, `:126`): `lng` explícito →
  `localStorage['app-language']` (`LANGUAGE_STORAGE_KEY`, `:35`) →
  `navigator.language` (`pt*`→pt-BR, `en*`→en) → DEFAULT `'pt-BR'` (`:49`).
  A instância grava `app-language` no evento `languageChanged` (`:164`).
- **Typing estrito de chaves** (`strictKeyChecks` em `i18next.d.ts`): chave nova
  só compila depois de existir nos resources; paridade pt-BR/en é guardada por
  [`app/tests/i18n-resources.test.ts`](../../app/tests/i18n-resources.test.ts).
- **Padrão que os testes SSR usam** (replicar no decorator):
  [`app/tests/lessonSourcesViewerGaps.test.ts:123`](../../app/tests/lessonSourcesViewerGaps.test.ts)
  cria `i18next.createInstance()` (ou `createAppI18n('pt-BR')`) e envolve com
  `<I18nextProvider i18n={inst}>`. O comentário ali é a razão: renders que
  dependem do default ficam reféns da ordem dos testes/stories (medido: perdiam
  traduções quando um teste irmão mexia no singleton).

**Checklist do decorator de i18n**: uma instância por locale
(`createAppI18n('pt-BR')` / `createAppI18n('en')`) → `<I18nextProvider i18n={…}>`
→ toolbar/global `lang` chama `changeLanguage` (que também atualiza
`document.documentElement.lang`). Traduções reais pt-BR/en saem dos JSONs de
produção — nada de mock de texto.

---

## 4. Dependências "não-web" — o que renderiza (ou não) num browser puro

| Dependência | Onde é usada | Render no Storybook (browser)? | Bloqueador / Workaround |
|---|---|---|---|
| **CodeMirror** (`@uiw/react-codemirror`, `@codemirror/lang-*`, `@lezer/highlight`) | [`app/src/components/cm/CodeMirrorField.tsx:65`](../../app/src/components/cm/CodeMirrorField.tsx), [`app/src/lib/editorLanguage.ts`](../../app/src/lib/editorLanguage.ts), [`app/src/components/markdown/codeHighlight.ts`](../../app/src/components/markdown/codeHighlight.ts) | **Sim** — é uma biblioteca de browser | Não é SSR-ável (o editor precisa de DOM), mas o Storybook tem DOM real. Injeta estilos inline (o CSP do app precisa de `style-src 'unsafe-inline'`); container precisa de largura/altura. `codeHighlight.ts` é puro (lezer) e testável headless. |
| **xterm** (`@xterm/xterm`, `@xterm/addon-fit`) | [`app/src/components/terminal/AnswerTerminal.tsx:78-80`](../../app/src/components/terminal/AnswerTerminal.tsx) (+ `@xterm/xterm/css/xterm.css`) | **Sim, com container medível** | O `FitAddon` calcula colunas/linhas do `clientWidth/Height` — num container 0px o terminal sai vazio. Envolver a story num `Box` de tamanho fixo. Tema vem de [`app/src/lib/codeTheme.ts`](../../app/src/lib/codeTheme.ts) (dado puro). |
| **KaTeX** (`katex`, `rehype-katex`, `remark-math`) | [`app/src/lib/lessonMarkdown.ts:30`](../../app/src/lib/lessonMarkdown.ts), [`app/src/components/markdown/MarkdownView.tsx`](../../app/src/components/markdown/MarkdownView.tsx); CSS no `main.tsx:72` | **Sim** | Só não esquecer o `katex/dist/katex.min.css` no preview (sem ele as fórmulas saem sem estilo). LaTeX malformado vira `span.katex-error` (não rebenta). |
| **node-llama-cpp** (3.18, ESM, GGUF, nativo) | Só [`app/electron/main/services/embeddedLlm/*`](../../app/electron/main/services/embeddedLlm) (import lazy: `llmEngine.process.ts:96`, `modelStore.ts:111`) | **NÃO** — módulo Node/nativo; nunca chega ao renderer | Só é alcançável via IPC (`window.api.localAi.*`). Workaround: **api-mock** (§6); proibir `electron/**` em stories. |
| **sherpa-onnx-node** (addon N-API) + CLI `sherpa-onnx-offline-tts` | [`app/electron/main/services/localStt/asrEngineCore.ts:103`](../../app/electron/main/services/localStt/asrEngineCore.ts) (processo utilitário ASR), [`app/electron/main/services/localTts/ttsEnginePaths.ts`](../../app/electron/main/services/localTts/ttsEnginePaths.ts) | **NÃO** — nativo + binário externo | Atrás de `window.api.stt.*` / `window.api.localTts.*`. Mock de API; stories de `MicButton`/`SpeakButton` são só apresentação (sem jsdom, não testadas — boas stories). |
| **web-tree-sitter + tree-sitter-rust** | [`app/electron/main/engine/lang/rust.ts`](../../app/electron/main/engine/lang/rust.ts) (subprocesso `spawnSync`) | **NÃO** | Só processo main (motor de trilhas). Irrelevante para stories de UI. |
| **pi SDK** (`@mariozechner/pi-*`), **sql.js**, **systeminformation** | `electron/main/**` | **NÃO** | Idem — atrás de IPC. |
| **MUI v9 / emotion / React 19 / motion / lucide-react / react-markdown (unified)** | `src/**` | **Sim** | Nenhum. |

**Bloqueadores de render num browser puro (lista curta):**

1. **`window.api` ausente** — `getApi()` lança
   (`apiBridge.ts:41-43`). No Storybook os efeitos correm, então qualquer
   componente com IPC no mount/handler rebenta sem mock. É o bloqueador nº 1.
2. **Import transitivo de `electron/**` ou `node:*`** — quebra o bundle do
   Vite no browser. Os TESTES fazem isto (ex.:
   `lessonSourcesViewerGaps.test.ts` importa
   `electron/main/engine/research/qualityGate`) — **não copiar para stories**.
3. **xterm sem container com dimensões** — render "vazio" (não erro).
4. **CodeMirror/xterm fora do CSS global** (`src/index.css`) — sai sem cor/
   posicionamento corretos.
5. **KaTeX sem `katex.min.css`** — fórmulas sem estilo.
6. (Menor) SSR não existe aqui: portais (`ShellSidebarSlot`), refs e efeitos
   funcionam no Storybook — o contrário dos testes.

**Workarounds de módulo (quando necessário)**: no `viteFinal`/`resolve.alias` do
`.storybook/main.ts` apontar `electron/main/...` para um stub fino, OU melhor:
manter as stories só sobre `src/**` + api-mock — a fronteira `window.api` já é
limpa por construção (todas as views falam só com `getApi()`), pelo que **não é
preciso mockar módulo nenhum** para a esmagadora maioria das stories.

---

## 5. Comandos exatos de verificação (tempos medidos nesta máquina)

Tudo de `app/` (`cd app`), exceto os gates da raiz.

| O quê | Comando | Como corre | Tempo medido |
|---|---|---|---|
| **Lint** (type-check) | `npm run lint` | `tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.node.json` — duas passagens: renderer (`src`+`shared`) e projeto node (`electron`+`tests`+`tools`+`src/lib`, composite, **sem DOM**) | **~31 s** |
| **Testes unitários** | `bash tools/t.sh tests` (= `npm test`) | `node --import tsx --test`, 382 ficheiros paralelos; EMPTY-GLOB GUARD (glob vazio → exit 1) | **~62 s** (7285 testes, 1739 suites, 0 fail, 2 skipped) |
| **Um ficheiro** | `bash tools/t.sh tests/lessonSidebarHeader.test.ts` | idem, 1 ficheiro | **~1,4 s** |
| **Build** (pré-e2e) | `npm run build` | `electron-vite build` → `out/main`, `out/renderer` + postbuild copia `vocab` | **~6 s** |
| **E2E** | `npm run build && npm run test:e2e` | Playwright `_electron` (`playwright.config.ts`: `tests/e2e`, **1 worker**, `timeout: 90s`/teste, `retries: 0`, `reporter: list`) sobre o build real de `out/`, com o main em stub mode (`STUDY_METHOD_E2E=1` → [`e2eStubs.ts`](../../app/electron/main/services/e2eStubs.ts); janela oculta via `STUDY_METHOD_WINDOW_VISIBLE=0`, ver [`app/tests/e2e/helpers.ts`](../../app/tests/e2e/helpers.ts)) | **medido**: `e2e-theme.spec.ts` = 2 testes em **20,9 s** (~10 s/teste — cada teste arranca o seu Electron). Suíte mock inteira (~18 specs) = **vários minutos**. `real-*` ficam skipped sem chaves reais. |
| **E2E sem display** | `xvfb-run -a npm run test:e2e` | igual (usado e medido aqui) | idem |
| **E2E com serviços reais** | `npm run test:e2e:real` (`bash tools/run-e2e-real.sh`) | rede/LLM reais — não usar em CI | — |

Avisos:
- O e2e corre contra **`out/`**: **rebuild antes do e2e** ou corre com código antigo.
- Os specs e2e fixam strings de copy (títulos, aria-labels) — mudar copy implica
  atualizar specs (ex.: `e2e-i18n`, `e2e-gate`).
- Gates da raiz (bash puro, sem Node): `bash tests/validate.sh`
  (contratos docs/00-contratos.md), `tests/spec-conformance.sh`,
  `tests/gate-build.sh`, `tests/gate-lint.sh`, `tests/gate-bash32.sh`,
  `tests/smoke.sh` (integração ponta-a-ponta em dir temporário).

---

## 6. Recomendação final — estrutura do Storybook fiel ao app

Estado atual: devDependencies já instaladas (`storybook@10.6.1`,
`@storybook/react-vite`, `@storybook/addon-{a11y,docs,themes}` em
[`app/package.json`](../../app/package.json)); **ainda não existe `.storybook/`
nem `*.stories.*`**. Sugestão de arranque:

```
app/.storybook/main.ts        # react-vite; stories: ../src/**/*.stories.tsx
app/.storybook/preview.tsx     # decorators: api → i18n → tema
app/.storybook/api-mock.ts     # ApiSchema completo (createExposedApi + fixtures)
app/.storybook/theme-decorator.tsx / i18n-decorator.tsx   # (opcional, split)
```

### 6.1 `main.ts` — alinhamento com o Vite do app

Espelhar os aliases do renderer ([`app/electron.vite.config.ts:116`](../../app/electron.vite.config.ts)):

```ts
export default {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-a11y', '@storybook/addon-docs', '@storybook/addon-themes'],
  framework: '@storybook/react-vite',
  async viteFinal(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': resolve(__dirname, '..'),        // app/
      '@shared': resolve(__dirname, '../shared'),
    };
    return config;
  },
};
```

### 6.2 `preview.tsx` — a árvore fiel (ordem importa)

```tsx
import '../src/fonts';                     // @font-face — mesmo papel de main.tsx:61
import '../src/index.css';                 // globais xterm/CodeMirror + baseline
import 'katex/dist/katex.min.css';         // main.tsx:72

import { createElement } from 'react';
import type { Decorator } from '@storybook/react-vite';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { I18nextProvider } from 'react-i18next';
import { theme } from '../src/theme';               // theme.ts:679 (cssVariables+class)
import { createAppI18n, type SupportedLng } from '../src/i18n';
import { installApiMock, resetApiMock } from './api-mock';

const i18nByLng: Record<SupportedLng, I18n> = {};   // cache: 1 instância por locale

export const globalTypes = {
  lang: { defaultValue: 'pt-BR', toolbar: { items: ['pt-BR', 'en'] } },
  themeMode: { defaultValue: 'system', toolbar: { items: ['light', 'system', 'dark'] } },
};

const withProviders: Decorator = (Story, ctx) => {
  resetApiMock(installApiMock(ctx.parameters?.api)); // 1. API ANTES de tudo (efeitos correm)
  const i18n = cachedI18n(ctx.globals.lang as SupportedLng); // 2. i18n real (JSONs de produção)
  applySchemeClass(ctx.globals.themeMode);          // 3. classe .light/.dark no <html>
  return createElement(
    I18nextProvider, { i18n },
    createElement(
      ThemeProvider, { theme, defaultMode: 'system', modeStorageKey: 'theme-mode' },
      createElement(CssBaseline, null),
      createElement(Story),
    ),
  );
};

export const decorators = [withProviders];
```

Notas de fidelidade:
- **Tema**: copiar literalmente as props do `main.tsx:150`
  (`defaultMode="system" modeStorageKey="theme-mode"`). Para toggle determinístico,
  o `addon-themes` (ou o `applySchemeClass`) deve **setar a classe do `<html>`**
  (`primeColorSchemeClass()` de `main.tsx:119`) ou chamar `setMode()` do
  `useColorScheme` — nunca criar um segundo tema.
- **i18n**: `createAppI18n('pt-BR' | 'en')` por locale + `I18nextProvider`
  (padrão de `lessonSourcesViewerGaps.test.ts:123`), com `changeLanguage` na
  toolbar; traduções reais pt-BR/en; `document.documentElement.lang` a acompanhar.
- **StrictMode** não é preciso no decorator (o app usa em `main.tsx:149`, mas só
  afeta dupla-invocação de efeitos em dev).

### 6.3 `api-mock.ts` — o fake mais fiel (e porquê)

Construir o `ApiSchema` **completo** pela fábrica oficial do preload, com um
transporte falso cujas respostas vêm das fixtures do e2eStubs:

```ts
import { createExposedApi, type IpcBridgeLike } from '../electron/preload/api-schema';
import { __setApiForTests, __resetApiForTests } from '../src/lib/apiBridge';
// fixtures de payload (as mesmas formas que o e2e usa):
// buildStartupStatus/lessonFindings/buildLesson/validResult de
// electron/main/services/e2eStubs.ts — extrair para módulo partilhado se importar
// 'electron' for pesado; os CONSTRUTORES são puros o suficiente para copiar.

const handlers: Record<string, (...args: unknown[]) => unknown> = {
  'keys:startup-status': () => startupStatusFixture(),   // gate 'ready' p/ stories
  'study:list-topics': () => topicsFixture(),
  'track:list': () => trackListFixture(),
  'track:lesson': (req) => trackLessonFixture(req),
  // …override por canal, com defaults seguros para os restantes
};

function makeIpc(): IpcBridgeLike {
  return {
    invoke: async (channel, ...args) =>
      handlers[channel]?.(...args) ?? defaultFor(channel),
    on: (channel, listener) => { /* regista emitters p/ canais de evento */ return () => {}; },
  };
}

export function installApiMock(overrides?: Record<string, unknown>): ApiSchema {
  const api = createExposedApi(makeIpc());   // TODOS os 9 grupos derivados de API_GROUPS
  __setApiForTests(api);                     // apiBridge.ts:51 — igual aos testes
  return api;
}
export function resetApiMock(): void { __resetApiForTests(); }
```

Porque esta forma é a mais fiel:
1. **Cobertura total automática** — `createExposedApi` deriva cada método de
   `shared/ipc-contract.ts`; uma story nunca falha por "método esquecido" no fake
   (ao contrário dos fakes parciais de `apiBridge.test.ts`/`lessonPrefetch.test.ts`).
2. **Mesma fronteira do app real** — as views falam com `getApi()`; o mock entra
   pelo mesmo buraco (`__setApiForTests`), e funciona também via `window.api`
   (o `apiBridge` lê o global) se uma story precisar do caminho de produção.
3. **Dados realistas e determinísticos** — as fixtures do
   [`e2eStubs.ts`](../../app/electron/main/services/e2eStubs.ts) são as mesmas que
   sustentam o e2e (aula, findings, challenge workspace, keys/startup, quiz,
   trilhas); zero rede, zero LLM, como os testes exigem.
4. **Eventos push** (canais `on*`: `pi.onStreamEvent`, `study.onLessonProgress`,
   `track.onChallengeRegenerateProgress`, `localAi.onDownloadProgress`, …) ficam
   expostos por um emitter simples — o decorator/stória pode disparar eventos
   para compor estados (streaming, progresso).
5. **Override por story**: `parameters.api = { 'study:get-lesson': () => … }` —
   merge sobre o handler base; reset por story (igual ao `__resetApiForTests`
   dos testes).

### 6.4 Primeiras stories recomendadas

Componentes de apresentação já "preparados" pela base (montáveis sozinhos, sem
contexto extra): `LessonSidebarHeader`, `LessonComposer`, `ChatBubble`,
`TypingIndicator`, `QuizOverlayHost`, `SessionFrame`, `ShellSidebar`,
`SplitDivider`, `GamesView`/`GameLevelView` (helpers puros em
`src/views/GamesView/gamesUi.ts`). Evitar no arranque: `AnswerTerminal` (precisa
de container medido) e `CodeMirrorField` (pesado) — ou isolá-los em stories
próprias com `Box` de tamanho fixo.

---

## Apêndice — invariantes que um Storybook não pode quebrar

1. `tsconfig.node.json` compila sem DOM: **módulos puros de `src/lib` não podem
   voltar a depender de DOM/React** (cada um é listado à mão lá; um módulo novo
   puro tem de ser acrescentado à lista).
2. Testes de FONTE (source-guards) leem os `.tsx` com `readFileSync` e assertam
   literais do código de produção — renomear/estruturar pode quebrar testes de
   propósito; stories não substituem esses contratos.
3. i18n: chaves novas em **pt-BR e en** (paridade testada); `strictKeyChecks` não
   deixa compilar com chave inexistente.
4. Nenhum hex no `theme.ts` (tudo vem de `designTokens.ts`); nenhuma fonte via
   CDN (guardas em `bootstrapFonts.test.ts`).
5. E2e fixa copy e aria-labels — mudanças de texto visível implicam specs.