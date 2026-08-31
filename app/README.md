# Study Method — GUI Electron

GUI desktop (Electron + React + Vite + TypeScript) do tutor **study-method**: aprender
programação e a matemática que aparece nela **através de código executável** — com aula,
analogia, visualização e desafio validado por teste. A GUI é a frente interativa da skill
[`skills/study-method`](../skills/study-method); todo o trabalho pesado (aulas, desafios,
validação, pesquisa) é feito pelos scripts e pelo lesson-orchestrator do processo **main**.

Este README cobre o **o que é, como rodar e o fluxo principal**. Um documento pt-BR detalhado —
manual do usuário + arquitetura técnica + mapa de contratos — vive em
[`docs/app-gui.md`](../docs/app-gui.md) (complemento, não duplicação).

## Como rodar

**Atalho (da raiz do repositório):** `./install.sh` instala tudo (skill + `npm ci` aqui + cria
`app/.env.local` a partir do exemplo) e `./run.sh` sobe a janela. Os comandos abaixo são o que
esses atalhos fazem por baixo.

Requisitos: Node ≥ 22.13 (Node v24 testado), npm ≥ 11. O `.npmrc` libera `allow-scripts` para os
`postinstall` de esbuild/electron que o build exige.

```bash
npm ci        # instala dependências (manifesto/package-lock congelados)
npm run dev   # electron-vite dev — abre a janela
```

Produção / checagens:

```bash
npm run build   # main + preload + renderer em out/
npm run lint    # tsc --noEmit (tsconfig.json + tsconfig.node.json)
npm test        # bash tools/t.sh tests — node:test + tsx (suite completa)
npm run test:e2e  # Playwright `_electron` sobre o build (veja § E2E)
npm run test:e2e:real  # Playwright `_electron` REAL — exige DEEPSEEK_API_KEY/BRAVE_API_KEY no shell (veja § E2E)
```

> Os gates desta app (verdes antes de considerar concluído) são: `bash tools/t.sh tests`
> (**1563 testes unitários: 1562 pass / 0 fail** / 1 skipped) · `npm run lint` · `npm run build`
> · `npm run test:e2e` (13 specs mock, **19 testes verdes**; as 3 specs reais `real-*` —
> real-lesson, real-didactics, real-search — ficam `skipped` sem as chaves e rodam via
> `npm run test:e2e:real` com `DEEPSEEK_API_KEY`/`BRAVE_API_KEY`).

## Rodada 4 (ondas 15–18) — resumo

A **quarta rodada** fechou os dois bugs da rodada 3, refez o onboarding fiel ao ondokai,
refinou o tema escuro + Home, adicionou matemática KaTeX e entregou uma suíte E2E **real**. As
sessões abaixo detalham cada parte; detalhes em
[`docs/rodada4.md`](../docs/rodada4.md):

- **Bugs corrigidos:**
  - **B1** — `list-challenges "requer setupRoot"`: o `setupRoot` agora **flui do
    `generateLesson`** para o `list-challenges` (progresso `materializing` + memória
    `lastSetupRoot` no handler + contexto `ChallengeNav`), provado na **API real** pelo
    `real-lesson`.
  - **B2** — "resposta sem `choices[0].message.content`": causa-raiz era o **id de modelo
    `deepseek-v4-flash-0731` inexistente** (HTTP 400 caía no caminho de sucesso). Corrigido
    para **`deepseek-v4-flash`** (validado na API) + erros claros `BAD_REQUEST`/`EMPTY_CONTENT`
    e `parseChoiceResult` puro.
- **Tutorial refeito fiel ao ondokai**: overlay `z-14000` (máscara 4 segmentos + spotlight +
  bloqueio de clique), auto-avanço por `expectedAction`, **Tutorial Completo** (14 steps) +
  **Quick Start** (6), modal com gate de chaves, first-run latch síncrono, hint pós-tutorial 1x,
  narração TTS local, skip de alvo ausente, persistência/retomada.
- **UX**: dark refinado por camadas de elevação (`#0f1115`/`#171c23`/`text.secondary` `#aeb6c2`
  AA/divider/tertiary M3) + **Home guiada** (copy programação+matemática, 3 passos, CTA único
  contextual, card de status real das chaves, chips de sugestão com pré-preenchimento) +
  consistência de altura input/botão na `LessonView`.
- **Matemática**: **KaTeX** (`katex@0.16`+`remark-math@6`+`rehype-katex@7`) nas aulas/desafios,
  com **escape de `$` de moeda** antes do parse.
- **E2E real**: suíte com as chaves do usuário (`npm run test:e2e:real`) — aula real (B1
  provado), didática certa/errada com feedback do juiz, Brave round-trip; chaves **nunca**
  versionadas (`.gitignore .env.local`).

## Rodada 5 (ondas 20a/20b + fix20c) — resumo

A **quinta rodada** corrigiu dois bugs de UX do usuário e fechou um terceiro achado da revisão
adversarial. O relatório orquestrado (ondas, commits, gates, revisões) está em
[`docs/rodada5.md`](../docs/rodada5.md):

- **Bug A — tutorial/modal centralizado (`onda20a`)** — o painel do onboarding **sem spotlight**
  (steps informativos/conclusão) caía no **canto inferior-direito**; agora é um **card central**
  com viés de 8% para cima + clamp no viewport
  (`onboardingPositioning.utils.ts`, ramo `!spotlight`). Testes novos em
  `tests/onboardingPositioning.test.ts`. Fechado pelo **fix20c-clamp**: o `top` nunca fica
  negativo mesmo com painel mais alto que a viewport (`Math.max(margin, …)` no max do clamp).
- **Bug B — dark Dracula de verdade (`onda20b`)** — o dark agora importa a paleta Dracula
  canônica de `src/lib/draculaTheme.ts` (`#282a36` / `#2f3142` / `#f8f8f2` / `#44475a` /
  `#bd93f9` / `#8be9fd`; a lib **não** foi tocada). O `AppBar` deixou de usar
  `color="primary"` (nada de header azul `#4f8cff`): `color="default"` + `applyStyles`
  (light = primary `#1565c0` intacto; dark = `background.paper` + borda `divider`). Contraste
  WCAG 2.2 ≥ 4.5:1 **medido no teste** (text.primary 13.4:1, secondary 6.96:1, contrastText
  6.78:1, tertiary 10.3:1, primary 5.9:1). Bootstrap da janela segue o bg Dracula `#282a36`.
  Testes: `tests/theme.test.ts` (valores + contraste) e `tests/e2e/e2e-theme.spec.ts` (asserts
  de cor dark/light reais).

## Rodada 9 (ondas R9-1..R9-6) — resumo

A **nona rodada** expandiu a trilha **Node.js do Zero** de 8 para **18 módulos**
(118 aulas) — do zero absoluto até o nível **especialista** — e entregou uma
**UX de aula sem LLM**: a teoria é apresentada de forma **determinística**
(direto do arquivo, seção por seção, sem loading), o LLM fica **só** para
dúvidas (`answer`) e para gerar novo desafio, e sem chave a falha é rápida
(erro estruturado `TUTOR_UNAVAILABLE`, nunca spinner infinito). Relatório
completo em [`docs/15-trilha-nodejs.md`](../docs/15-trilha-nodejs.md):

- **UX: teoria pronta + checks por teste (R9-1)** — aula em chat apresenta o
  markdown do `lesson.json` sem LLM; o veredito do desafio mostra a **lista de
  checks individuais** (✓/✗ por teste, com nome) e a razão **"N de M testes
  passaram"** — aprovação não é tudo-ou-nada; "Gerar novo desafio" aparece em
  qualquer não-aprovação total e o confete só sai com `passed=true`.
- **Desafio de MÓDULO (R9-2)** — no fim de cada módulo, um desafio
  **multi-arquivo** (`files[]` com 2–3 arquivos que se importam entre si) e
  **elaborado** (statement longo, cenário do mundo real, 4–6 testes): card
  "Desafio do módulo" na trilha, editor com **abas por arquivo**, submit envia
  todos os arquivos; por ser **autoral**, a regeneração por LLM fica **oculta**
  para o target `module`.
- **Conteúdo (R9-3..R9-5)** — 10 módulos novos: linguagem em profundidade
  (arrays-profundas 14, objetos-profundos 8, poo 11, funcoes-avancadas 8,
  assincronismo-avancado 6) e backend em profundidade (nodejs-avancado 8,
  http-avancado 6, banco-de-dados-avancado 5, arquitetura-e-padroes 8,
  especialista 8); + desafios de módulo dos 8 módulos originais. Trilha total:
  **18 módulos, 118 aulas, 137 desafios** (118 de aula + 18 de módulo +
  proficiência), todos verificados por execução (`track:validate` **136/136
  "verificado ✓"** + proficiência ok).
- **Gate** — suíte unitária + integração: **1688 testes — 1688 pass / 0 fail**;
  `npm run lint` / `build` / `test:e2e` verdes.

## Rodada 8 (ondas R8-1..R8-6) — resumo

A **oitava rodada** fez o pivô de produto: **o aluno NÃO GERA mais aula**. As
trilhas (cursos inteiros) são criadas pelos AUTORES via **CLI**
(`npm run track -- ...`) e chegam prontas no app; o aluno abre a trilha,
escolhe a aula e estuda num **chat direto com a IA** (teoria progressiva uma
seção por vez + dúvidas; fontes atrás do botão "Fontes"). Desafios com botão
"Começar" (o cronômetro só roda depois), **carência da 1ª estrela**
(`minFirstStarMs`), **teste de proficiência** que cobre tudo e destrava a
trilha, e **"Gerar novo desafio"** ao errar (a LLM vê os desafios que o aluno
errou naquela aula e não repete — validado por execução antes de chegar).
Trilha completa **Node.js do Zero** incluída: 8 módulos, 36 aulas, 36 desafios
+ proficiência, todos verificados por execução. Relatório completo em
[`docs/app-gui.md`](../docs/app-gui.md) (seções 2.13 Canais TRACK_CHANNELS e 2.14 CLI de autoria e runner).

## Rodada 7 (ondas R7-1..R7-5) — resumo

A **sétima rodada** fechou o ciclo pedagógico do produto: avaliar a **resposta
digitada** (matemática por execução, interpretação por LLM), **nunca repetir
desafios tentados** e mostrar **progresso por matéria** (Home por domínio +
Trilha), com **persistência** de matérias/lições/tentativas no SQLite (schema
v3). O relatório orquestrado está em
[`docs/app-gui.md`](../docs/app-gui.md); o contrato das
features em [`docs/14-respostas-nunca-repetir.md`](../docs/14-respostas-nunca-repetir.md):

- **Estrelas + cronômetro no desafio (R7-1)** — 3 estrelas iniciais; perda por
  blur/timeout/erro/decaimento por velocidade (`T = 90s + difficulty×60s`,
  fallback 300s); confete em PASS respeitando `prefers-reduced-motion` com
  anúncio `role="status"`; sem "Parabéns!" ritualizado
  (`src/lib/challengeStars.ts` + `src/lib/confetti.ts`).
- **Pesquisa Brave ao vivo (R7-2)** — canal `study:research-progress` com
  eventos por query/rodada durante a geração; planner LLM com fallback
  heurístico; rodadas cap 2; chave ausente/inválida **aborta** a geração com
  mensagem clara; **checklist na UI** com deltas por rodada e término garantido.
- **Trilha (R7-2)** — aba dedicada com seções Iniciante (1–2) / Intermediário
  (3) / Avançado (4–5), estados done/current/pending; clicar num nó **abre a
  lição persistida por id** (`get-lesson-by-id` com `subjectSlug`/`challenge`).
- **Resposta digitada (R7-3)** — ramo matemática (`check-math-answer`, **sem
  LLM**: o main re-computa o esperado da `mathLib`; esperado exibido só após a
  1ª tentativa errada; 4 famílias, seed determinístico — errou, o próximo
  problema é outro) e ramo interpretação (`judge-answer` LLM deepseek→local com
  veredito `correct`/`partial`/`incorrect`; `ok:false` = erro de serviço, nunca
  veredito inventado). Avanço por **veredito terminal** + botão primário
  ("Avançar mesmo assim" para parcial/incorreto).
- **Persistência + nunca-repetir (R7-4)** — matérias/lições/tentativas no
  SQLite (schema v3 com `exercise_json`, migração v1→v3 crash-safe sem perda);
  `mark-challenge-attempt` (verdict/stars/duração; programação por slug, math
  por slug sintético `math:<subjectSlug>:<family>:<seed>`); `list-challenges`
  filtra desafios tentados; trocar de desafio sem concluir = `abandoned`
  (design); mark **otimista** (falha transitória de IPC pode perder um registro
  na sessão — limitação documentada).
- **Home por domínio (R7-4)** — seções Programação/Matemática com matérias
  escolhidas + **diálogo de aviso** ao trocar de matéria com aula em andamento
  (a avaliação da aula atual é feita pela LLM); `publishSession` da LessonView
  alimenta o quadro de sessão do shell e a Home (com guarda de identidade de
  geração por token).

## Fluxo principal (produto)

1. **Home** (aba Início): com matérias persistidas, mostra **seções por domínio**
   — Programação e Matemática — com um cartão por matéria (nome + "x de y aulas").
   Clicar numa matéria vai para a aba Aula com ela pré-selecionada; se houver
   **aula em andamento de outra matéria**, um **diálogo de aviso** pergunta antes
   de trocar ("não dá para trocar de matéria no meio da aula — a avaliação da
   aula atual é feita pela LLM"). Sem matérias, a Home guiada (3 passos + chips de
   sugestão) é o onboarding.
2. **Configurações** (aba Settings): cadastre as chaves de API e, opcionalmente, baixe um
   modelo **LLM local**.
3. **Aula** (aba Aula): digite um **assunto** → o app pesquisa (Brave, com
   **checklist de pesquisa ao vivo** por query/rodada — chave ausente/inválida
   aborta a geração), autora a aula (DeepSeek), materializa um `setup` e
   **valida os desafios** antes de mostrá-los (domínio math: gera um exercício de
   matemática conferido pela `mathLib`, sem desafio de código TDD).
4. **Resposta digitada**: cada aula termina num input de resposta com **veredito**:
   - **Matemática** — verificação **por execução, sem LLM** (`check-math-answer`):
     o main re-computa o esperado da `mathLib` e compara; o esperado só aparece
     após a 1ª tentativa errada; errou, o próximo problema é outro (seed
     determinístico por tentativa).
   - **Interpretação** — juiz LLM (`judge-answer`, DeepSeek → modelo local):
     veredito `correct`/`partial`/`incorrect` + feedback pt-BR. `correct` conclui
     a aula; `partial`/`incorrect` deixam veredito visível com "Avançar mesmo
     assim". O avanço é sempre do botão primário.
5. **Desafio** (aba Desafio): edite o stub no editor (CodeMirror), salve (Ctrl+S ou ⌘S),
   e clique **Testar resposta**.
   - Fase **determinística**: rodam os testes do desafio no workspace (resultado PASS/FAIL,
     contagem de testes, saída no terminal).
   - Fase **pi coding agent** (DeepSeek): o app monta um prompt com o código + saída dos
     testes e envia ao `pi` para um **feedback** revisto por LLM, com streaming
     (texto/raciocínio/ferramentas) em painel colapsável.
   - **3 estrelas + cronômetro** por desafio (limite `90s + difficulty×60s`;
     perda por foco/tempo/erro/demora) e **confete** ao passar — sem "Parabéns!"
     ritualizado, anúncio em `role="status"` respeitando reduced-motion.
   - **Nunca-repetir**: eventos terminais marcam a tentativa e **desafios tentados
     somem da lista** (trocar sem concluir conta como `abandoned`).
6. **Trilha** (aba Trilha): roadmap da matéria em seções **Iniciante (1–2) /
   Intermediário (3) / Avançado (4–5)**, com nós `done`/`current`/`pending`;
   clicar num nó **abre a lição persistida por id** na aba Aula.

## Onde estão as chaves

As chaves são cadastradas na aba **Settings** e persistidas localmente (settingsStore, no
processo main). Não vão para o código nem para o git. Também podem vir do ambiente:

- `DEEPSEEK_API_KEY` — autoria de aulas, juiz do desafio e o coding agent `pi`.
- `BRAVE_API_KEY` — pesquisa de fontes para a aula.

Variáveis de caminho/execução:

- `STUDY_METHOD_SKILL_DIR` — diretório da skill study-method (com `scripts/`). Se ausente, o
  runner resolve procurando a árvore a partir dos próprios parent dirs da app; em produção
  recomenda-se definir explicitamente.
- `STUDY_METHOD_SETUPS_DIR` — onde os `setups/` (aula por aula) são criados. Default:
  `~/.local/share/study-method/setups`.
- `STUDY_METHOD_LLM_IN_PROCESS` — `=1` roda o motor LLM local no processo principal (dev);
  sem ela o motor sobe num **utility process** dedicado (`llm-engine`).

## Interface (MUI v9, claro + escuro) e idioma

- **Material UI v9.** O renderer inteiro roda dentro de um
  `<ThemeProvider theme={theme} defaultMode="system">` + `<CssBaseline>` (único ponto
  onde o fundo é aplicado no `<body>`, definido em `src/main.tsx` e `src/theme.ts`).
- **Tema claro + escuro (onda 11)** — o app suporta os **dois** esquemas
  (`colorSchemes: { light, dark }`), o **default segue o SO**
  (`defaultMode="system"` → `prefers-color-scheme`/nativeTheme), e um
  **`ThemeToggleButton`** na AppBar cicla `light → dark → system →
  light` via `useColorScheme()` do MUI. O `colorSchemeSelector: 'class'`
  aplica `.light`/`.dark` no `<html>` (obrigatório para o toggle manual
  funcionar). **Persistência:** `modeStorageKey="theme-mode"` → a escolha fica
  em `localStorage['theme-mode']`, lida no boot e gravada no `setMode`;
  sem valor salvo = `system` (segue o SO). **Anti-flash:** com `cssVariables:
  true` o MUI resolve o scheme de forma síncrona antes do 1º paint, e o
  bootstrap chama `primeColorSchemeClass()` no `<html>` antes do render. O
  dark (onda 20B) é a paleta **Dracula** (`background.default` `#282a36`, `paper`
  `#2f3142`, `primary` `#bd93f9`, `tertiary` `#8be9fd` e contraste AA medido); o
  `primary` do **light** é `#1565c0` (WCAG AA). Detalhe em
  `tests/theme.test.ts`.
  Lógica pura do ciclo/persistência em `src/components/theme/themeModeState.ts`.
- **Editor e terminal SEGUEM o tema (redesign, §7.4)** — antes o editor CodeMirror
  e o terminal xterm eram **Dracula escuro fixo** (`#282a36`) nos dois esquemas da
  shell: uma janela preta dentro de um app claro. Agora os dois leem a paleta de
  código **bi-polar** de `src/lib/codeTheme.ts` (`CODE_LIGHT`/`CODE_DARK`,
  derivada dos mesmos acentos do tema, com todo token a ≥ 4,5:1 **contra a faixa
  de seleção**) — claro no esquema claro, escuro no escuro. A coerência
  editor ⇄ terminal, que era a propriedade boa do arranjo Dracula, continua: as
  duas superfícies são o **mesmo** nível 2 da rampa, e a **tipografia** dos dois
  (família *e* corpo) sai de um contrato único, `codeTypography()` —
  `FONT_STACK.mono` + `TYPE.codeSize`, exposto nas duas formas que os dois
  consumidores exigem (número em px para `new Terminal({ fontSize })`, string
  com unidade para o CodeMirror). No terminal nenhuma folha de CSS global
  governa isso: o DomRenderer do xterm injeta uma regra `.xterm-rows` mais
  específica que qualquer `.xterm`, então valem só as opções do construtor.
  O editor pinta via `createTheme` de `@uiw/codemirror-themes` +
  tags do `@lezer/highlight`; o terminal via `xtermTheme(scheme)` e
  `truecolorForeground` (SGR `38;2`), e **reimprime** o scrollback na paleta nova
  ao trocar de tema (o SGR já escrito é absoluto e não se desfaz sozinho).
  Provado em `tests/codeTheme.test.ts` e `tests/e2e/e2e-code-theme.spec.ts`.
- **Componentes:** AppBar + Tabs (shell), Stepper (fases da aula), painéis/Select/Menu do
  Desafio e Settings. O CSS custom legado (`src/index.css`) ficou só para variáveis de tema
  + os placeholders (view Início) + os estilos de CodeMirror/xterm; as views reais usam MUI `sx`.
- **i18n pt-BR/en** (`src/i18n/`): um namespace único `translation`, chaveada via
  `t('translation:<chave>')`. **pt-BR é o default**; `en` é o fallback. Recursos JSON
  embutidos no bundle (sem fs-backend — o renderer roda sandboxed).
- **Troca de idioma:** `LanguageSwitcher` (dropdown/ícone na AppBar) chama `changeLanguage`.
  A **persistência** é automática — o núcleo grava no `localStorage` (chave `app-language`)
  no evento `languageChanged`, e no boot reaplica a escolha salva. O gate e o boot chamam
  `initI18n()` (inicializa a instância default que o `useTranslation()`/`getI18n()` usam).
- Teste de **wiring** dessa camada: `tests/i18n-wiring.test.ts` (sem jsdom, roda no
  `bash tools/t.sh tests`).

## Matemática (KaTeX) — onda 17B

O markdown de aulas **e** desafios renderiza fórmulas matemáticas com **KaTeX**
(`katex@0.16` + `remark-math@6` + `rehype-katex@7`, pipeline em `src/lib/lessonMarkdown.ts`);
o CSS do KaTeX entra no bundle do renderer (`src/main.tsx`). Para não corromper copy com
cifrão gerada por IA, `escapeLoneDollarSigns()` **escapa `$` de moeda** (`$5`, `$ 5`,
`$1.000,00`) **antes** do parse, preservando delimitadores LaTeX válidos (`$x^2$`, `$$...$$`).
Ver [`docs/rodada4.md`](../docs/rodada4.md) → Matemática.

## Tutorial / onboarding (portado do Ondokai — onda 12+13; refeito fiel ao ondokai na onda 16)

O **onboarding** é portado do app Ondokai e adaptado ao nosso escopo (4 abas):
um **tutorial interativo** com **overlay com spotlight** no alvo destacado e um
**modal** na primeira execução. Na **onda 16** foi **refeito** com fidelidade ao
ondokai: overlay `z-14000` com **máscara em 4 segmentos** + spotlight + **bloqueio de
clique** fora deles, **auto-avanço** por `expectedAction` (~220ms), dois tours
(**Tutorial Completo** de 14 steps / **Quick Start** de 6), e **narração por TTS local**
(Piper) — ver detalhes em [`docs/rodada4.md`](../docs/rodada4.md).

- **Host:** `OnboardingHost` (`src/features/onboarding/OnboardingHost.tsx`) é
  montado em `src/App.tsx` assim:

  ```tsx
  <OnboardingHost isReady={isReady} activeView={active} />
  ```

  — `isReady` é a fase do startup-gate (`=== 'ready'`: o onboarding **nunca**
  abre antes de o app estar liberado, nem em `offline`); `activeView` é a aba
  ativa do shell (usa a **dica de navegação** "vá para a aba X"). Sem
  `activeView`, steps cujo alvo está em outra aba são pulados.
- **Auto-avanço por ação:** steps com `expectedAction` (8 ações discretas —
  `open-settings`, `settings-keys-filled`, `open-lesson`, `fill-lesson-subject`,
  `generate-lesson`, `open-challenge`, `type-in-editor`, `test-answer`) avançam sozinhos
  quando a ação é satisfeita (`evaluateStepAction` **puro**, `tests/evaluateStepAction.test.ts`);
  steps informativos usam "Continuar".
- **Overlay fiel ao ondokai:** portal em `document.body` com **`z-index: 14000`**, máscara em
  **4 segmentos** ao redor do spotlight, **bloqueio de clique** fora dele, `alternateTargetSelector`
  e **posicionamento via RAF** (`OnboardingOverlay.tsx`).
- **Modal de seleção com gate de chaves:** `TutorialSelectionModal` oferece Quick Start ou
  Tutorial Completo; **sem as chaves** (DeepSeek + Brave) mostra um **CTA "Configurar chaves"**
  que leva à aba Settings — o Tutorial Completo **exige chaves** (steps de aula/geração
  dependem delas), o Quick Start pode seguir.
- **First-run latch síncrono (StrictMode-safe):** a oferta da 1ª execução é marcada **antes**
  de abrir (double-invoke de dev não dispara o modal duas vezes).
- **Hint pós-tutorial (1x):** após concluir **ou pular** o tutorial, um mini-hint de 1 passo
  aponta o **campo de assunto** na 1ª chegada à aba Aula.
- **Narração TTS local:** gera a fala do passo com Piper em runtime (mute persistente;
  ausência de modelo nunca é erro).
- **Robustez:** skip de alvo ausente (não trava), **persistência/retomada** do progresso entre
  reloads.
- **Estados (persistidos):** `not_started | in_progress | completed | skipped`
  (`src/features/onboarding/types/onboarding.types.ts`).
- **Storage (localStorage, `onboardingStorage.service.ts`):**
  - `study-method-onboarding-v1` → progresso (status + step atual + versão);
  - `study-method-onboarding-offered-v1` → oferta da 1ª execução já mostrada
    (one-shot; dismiss não rearma);
  - `study-method-onboarding-help-hint-v1` → dica pós-tutorial (reservada).
  A validação descarta payloads corrompidos/desconhecidos.
- **Reabertura:** `useOnboardingController().openFromHelp()` reabre o tutorial
  a partir do início (ex.: botão de ajuda).
- Testes: `tests/onboarding*.test.ts` (node:test) + spec E2E
  `tests/e2e/e2e-onboarding.spec.ts` + `tests/e2e/more-flows.spec.ts` (Quick Start completo e
  persistência).

## Logo (prompt p/ geração)

O **prompt-excelente** da logo do Study Method para o **Nano Banana 2** (fal.ai)
vive em [`docs/nano-banana-2-logo-prompt.md`](../docs/nano-banana-2-logo-prompt.md):
identidade visual (roxo Dracula `#bd93f9` → ciano `#8be9fd`, fundo dark `#282a36`),
prompt pronto para colar (versão com placeholders + versão pronta com fundo dark),
variantes (ícone / com wordmark / mono) e "como usar" (parâmetros na fal, o que
ajustar e pós-processamento de fundo transparente). Não geramos a imagem — só o
prompt + guia.

## Startup-gate (chaves DeepSeek + Brave)

Ao abrir, o app valida as chaves **antes de liberar a UI** (canal `keys:startup-status`):

- **Sem chaves** (ou só com uma) → tela de **Setup** bloqueada (`setup blocked`): não mexe
  na rede, apenas pede para configurar as duas chaves em Configurações.
- **Chaves presentes** → valida **as duas** com timeout curto (~8 s) a cada boot:
  - `401/403` → chave inválida → bloqueado com a chave apontada;
  - **ambas** falharem por **erro de rede** → **modo offline** (`offline`): o app inicia com
    um aviso e as features online ficam gateadas (dá para navegar/ver o que é local);
  - uma válida + outra por rede-falhou → não é offline (exige **ambas** por rede) → bloqueado
    apontando a que falhou.

O gate vive em `src/gate/AppGate.tsx` + `electron/main/ipc/startup-handlers.ts`; a decisão
`classifyStartup` é uma função pura testada em `tests/startup-handlers.test.ts`.

## Voz (STT local + TTS Piper)

Tudo local e on-device, no **processo main** (o renderer só vê canais `stt:*`/`localTts:*`):

- **STT (transcrição)** — `sherpa-onnx-node` (Nemotron streaming) num **utility process**
  (`asr-engine`). O modelo embutido viaja no instalador em `resources/stt-models/<modelId>`.
  Os botões `MicButton` (captura) usam o hook `useMicSTT` (`src/hooks/useMicSTT.ts`), que
  resampleia o microfone para 16 kHz mono e abre a sessão **antes** de alimentar frames.
- **TTS (síntese)** — o binário `sherpa-onnx-offline-tts` (Piper, GPL isolado num processo
  filho) gera WAV; modelos Piper viajam em `resources/tts-models/<modelId>` e o engine em
  `resources/tts-engine/<platform>-<arch>/` (+ `resources/espeak-ng-data`). `SpeakButton`
  monta o áudio da síntese.
- **Env overrides (dev/CI):**
  - `STUDY_METHOD_TTS_ENGINE_BIN` — caminho explícito do binário do engine TTS;
  - `STUDY_METHOD_TTS_MIRROR_BASE` — base URL de download dos modelos Piper;
  - `STUDY_METHOD_STT_MIRROR_BASE` — base URL de download dos modelos de STT.
- A preferência de voz (modelId/voz/speed) é **persistida** no settingsStore (chave
  `localTtsPreference`) via `localTts:set-preference`/`get-preference`.

## E2E (Playwright)

Aceita o app **Electron real** sobre o build de release (`out/`), com o main em **modo stub**
(`STUDY_METHOD_E2E=1`): **sem rede real, sem GPU de inferência, sem LLM/GGUF/STT/TTS** — os
handlers devolvem fixtures determinísticas (`electron/main/services/e2eStubs.ts`); o renderer
é exatamente o de produção.

```bash
npm run build && npm run test:e2e        # 1 worker (Electron não paraleliza)
xvfb-run -a npm run test:e2e            # sem display (CI), após `npm run build`
```

A fixture `tests/e2e/helpers.ts` injeta `STUDY_METHOD_WINDOW_VISIBLE=0`, então o
app abre **oculto e não-focável** durante a suíte — os testes **não sobrepõem o
seu desktop nem roubam o foco** (o main respeita a env na criação da janela;
env ausente ⇒ janela visível/focável, comportamento normal). As **duas formas
acima rodam as mesmas 13 specs mock = 19 testes** (`e2e-gate` 2, `e2e-onboarding` 2,
`more-flows` 3, `e2e-fonts` 2, `e2e-theme` 2, demais 1; o subconjunto `real-*` fica
`skipped` sem chaves reais); não usamos
`--headless` (modo não confirmado para `_electron`). A spec `more-flows` cobre fluxos
transversais: idioma+tema (pt→en→pt, claro→escuro→system persistindo juntos), **Quick Start
completo (6 passos → `completed`)** e **persistência do tutorial entre reloads**.

Envars de controle do stub (lidas pelo main em modo E2E): `E2E_GATE` (`blocked|invalid|offline|ready`),
`E2E_KEYS=invalid`, `E2E_NETWORK=offline`, `E2E_WORKSPACE_ROOT` (raiz dos workspaces), e
`E2E_ONBOARDING=1` (deixa a oferta de 1ª execução do tutorial disparar — usada pela spec de
onboarding; por padrão a fixture pré-marca a oferta como mostrada para não bloquear a UI das
demais specs, já que o OnboardingHost está montado). Detalhes em `tests/e2e/README.md`.

### Suíte E2E REAL (`real-*`) — didática com as chaves reais

Onda 18: `real-search`, `real-lesson` e `real-didactics` lançam o app **sem** o stub
(`STUDY_METHOD_E2E` ausente) para validar a didática de fato — pesquisa Brave, aula
real e a avaliação certa/errada do aluno por DeepSeek. As chaves reais entram por
envars do shell e o `userData` é isolado em tmp (apagado no fim).

```bash
export DEEPSEEK_API_KEY=sk-…
export BRAVE_API_KEY=BSAq…
npm run test:e2e:real        # falha com msg clara se faltar alguma env
```

A geração de uma aula real (pesquisa + autoria + validação com juiz LLM) costuma
levar 3-6min e pode falhar transitoriamente no DeepSeek — `real-lesson`/`real-didactics`
repetem a geração 1× nesse caso. Sem chaves, essas specs fazem `test.skip`.

## LLM local

Na aba Settings → LLM local o app detecta o hardware, recomenda um quant, **baixa
automaticamente os binários** (node-llama-cpp + pesos) e ativa um modelo. Escolha no painel o
**provedor de feedback do desafio**:

- **DeepSeek (nuvem)** (default) — o coding agent `pi` avalia a resposta, com streaming.
- **Modelo local** — o modelo local vira o **avaliador/juiz do feedback**: quando selecionado
  E há um modelo local ativo, a fase de feedback do Desafio roda a inferência localmente (sem
  depender do DeepSeek), com o mesmo prompt pedagógico pt-BR. Sem modelo ativo, o feedback
  volta automaticamente ao DeepSeek.

> **Primeiro-run local:** o download baixa o modelo (e o backend nativo do node-llama-cpp)
> automaticamente na primeira ativação; pode demorar e consumir banda/GPU conforme o tamanho.
> A inferência local é **um bloco único (sem streaming)**; modelos grandes podem demorar mais
> para responder.

## Arquitetura (resumo)

```
app/
├─ electron/
│  ├─ main/index.ts            bootstrap: janela única, CSP/sandbox, registra handlers IPC
│  ├─ main/main-setup.ts       buildMainSetup: ORDEM fixa de registro (ipc→keys→localAi→pi→study)
│  ├─ main/ipc/                handlers por grupo: settings/keys/localAi/pi/study (+safeHandle)
│  ├─ main/services/           stores e serviços do main
│  │  ├─ PiAgentService.ts     coding agent `pi` (SDK @mariozechner/pi-*)
│  │  ├─ deepseekClient.ts     cliente DeepSeek one-shot
│  │  ├─ deepseekLessonAuthor.ts  autor de aulas (prompt pt-BR + validação de draft)
│  │  ├─ deepseekLlmJudge.ts   juiz LLM do protocolo REQUEST/APPLY
│  │  ├─ lessonOrchestrator.ts cadeia assunto→pesquisa→autoria→materialização→validação
│  │  ├─ studyMethodRunner.ts  runner dos scripts da skill (createSetup/createChallenge/verify)
│  │  ├─ braveSearchService.ts + researchPlanner.ts   pesquisa de fontes
│  │  └─ embeddedLlm/          motor LLM local (node-llama-cpp) em utility process
│  │  └─ localStt/ + localTts/ STT Nemotron (utility process asr-engine) e TTS Piper
│  ├─ preload/index.ts         contextBridge → expõe window.api
│  └─ preload/api-schema.ts    createExposedApi (puro) + tipagem ApiSchema
├─ shared/ipc-contract.ts      CONTRATO único de canais e tipos (congelado)
├─ src/                        renderer React
│  ├─ views/                   Home (por domínio) / Aula (LessonView) / Desafio
│  │                           (ChallengeView) / Trilha (RoadmapView) / Settings
│  ├─ features/onboarding/     OnboardingHost (tutorial interativo) + overlay/modal/steps
│  ├─ components/  editor, terminal (xterm), CodeMirror, voice (MicButton/SpeakButton),
│  │               theme (ThemeToggleButton + themeModeState)
│  └─ lib/                     lógica pura (incl. codeTheme.ts, a paleta de código
│                              bi-polar que editor e terminal compartilham,
│                              challengeStars.ts, researchProgress.ts, roadmap.ts,
│                              sessionState.ts, lessonGenerationGuard.ts)
│                              + apiBridge (porta única para window.api)
└─ tests/                      1563 testes (node:test, sem jsdom) + tests/e2e (Playwright)
```

Três alvos de build (electron-vite): `main` (inclui os processos `llm-engine` e `asr-engine`), `preload` e
`renderer` (SPA com `base: './'` para rodar sobre `file://`). Camadas:

- **main** — janela (1280×800, min 900×600, tema segue o SO com toggle claro/escuro),
  ciclo de vida, instance-lock,
  handlers IPC, e **todo o tráfego de rede** (DeepSeek/Pi/Brave/download de modelo). O
  renderer não fala com a internet; só com o main via IPC.
- **preload** — `contextBridge.exposeInMainWorld('api', …)`, `contextIsolation: true`,
  `sandbox: true`, `nodeIntegration: false`.
- **renderer** — shell React por estado; lê a API exclusivamente por
  `src/lib/apiBridge.ts` (`getApi()` — testável sem jsdom).

## Módulos nativos (Electron × Node)

O SQL interno usa **dois backends SQLite, selecionados em runtime** em
`electron/main/db/connection.ts` (`openSqlite`):

- **Node do sistema** (testes, CLI): `node:sqlite` (`DatabaseSync`), embutido no Node
  (>= 22.5, unflagged desde 22.13);
- **Electron main**: o Node embutido do Electron **NÃO compila `node:sqlite`** — medido no
  Electron 37.2.4: `require('node:sqlite')` lança `ERR_UNKNOWN_BUILTIN_MODULE` e o app caía
  no boot. O app usa então o adaptador **sql.js (WASM)**
  (`electron/main/db/sqljsAdapter.ts`), que expõe a MESMA superfície
  (`exec`/`prepare().get/run/all`/`close`) e persiste o arquivo a cada commit.

Por isso o app **não tem addon nativo de SQLite**:

- **Zero compilação pós-install**: não há `.node` para compilar nem ABI para casar. O mesmo
  banco (SQLite padrão, legível pelos dois lados) abre nos DOIS runtimes sem rebuild, sem
  alias, sem script de ciclo de vida.
- O addon anterior (`better-sqlite3`) era sensível ao ABI do runtime: o prebuild do Node do
  sistema **segfaultava em silêncio** (SIGSEGV) ao carregar dentro do Electron 33 (Node 20
  embutido) — segfault não é exceção JS, nenhum try/catch salva. `node:sqlite` (Node) e
  `sql.js` (Electron) eliminam essa classe de problema por construção.
- A API usada (`db.exec`, `db.prepare().get/run/all`, `db.close`) mapeia 1:1 para
  `DatabaseSync` e para o wrapper sql.js; `db.transaction(fn)()` vira um helper
  `withTransaction` (BEGIN/COMMIT/ROLLBACK) em `electron/main/db/repo.ts`.

Nenhum `postinstall`/`predev` especial é necessário — `npm ci` é suficiente (sql.js é dep
normal do npm; o WASM é lido de `node_modules/sql.js/dist`).

## Segurança

- **CSP** estrita no `app/index.html` (`default-src 'self'`; `script-src 'self'`; somente o
  necessário para o editor/terminal injetarem estilos inline). Sem `unsafe-eval`. Ver
  `docs/app-gui.md → Segurança`.
- **`sandbox: true`** nas webPreferences (preload enxuto que só `require('electron')`).
- `webSecurity: true` (default) e links externos `http(s)` abrem no navegador do sistema.
- Operações de **workspace** (`read/write/delete`) são restritas ao `workspaceDir` por
  contenção de path (`resolveContainedWorkspacePath`); traversal é rejeitado.

## Contrato IPC

O único fonte de verdade para nomes de canal e tipos é
[`app/shared/ipc-contract.ts`](./shared/ipc-contract.ts) — congelado; não duplicar strings
soltas nem renomear canais. Grupos: `settings:*`, `keys:*`, `pi:*`, `localAi:*`, `study:*`,
`stt:*` (voz/transcrição), `localTts:*` (voz/síntese), `keys:startup-status` (gate).

Convenções do preload (`electron/preload/api-schema.ts`):

- **Requisição** (`invoke`): `window.api.<grupo>.<metodo>(args)` → `Promise<R>`.
- **Evento** (push main→renderer): método `onXxx(cb)` devolve unsubscribe (`stop()`).
  Nome derivado do canal: `pi:stream-event` → `onStreamEvent`;
  `study:lesson-progress` → `onLessonProgress`; `study:test-answer-event` → `onTestAnswerEvent`.

Onde o renderer chama um método do `ApiSchema` ainda tipado sem parâmetros (placeholders), o
padrão aceito é o **cast local** no ponto de uso (ex.: `api.study.readWorkspaceFile` cast para
`(a: ReadArgs) => Promise<string>`). A verificação fim-a-fim de assinatura (payload da UI ×
handler) está coberta por testes de wiring em `tests/study-wiring.test.ts`.

## Limitações conhecidas

- **Primeiro-run do LLM local** baixa o modelo/binários automaticamente (ver acima).
- **Chat local é um bloco único (sem streaming)** — a inferência do modelo local no feedback
  do desafio não streama deltas (diferente do pi/DeepSeek); o primeiro uso pode baixar os
  binários do node-llama-cpp automaticamente, e modelos grandes têm tempo de resposta maior.
- **Erro de chat local não vira fallback automático** — se a inferência local falhar no
  runtime, o app mostra o erro no painel com a dica de ativar o modelo local em Configurações
  ou trocar o provedor para DeepSeek; não re-dispara o pi sozinho.
- **Verificação de desafio é rígida** (regras DES-1/DES-4): o desafio só entra na aula se a
  referência/alternativas passarem e o juiz aprovar; `not_run` ≠ sucesso e tem diagnóstico
  honesto de porquê.
- **Naming de função derivado do slug**: a função principal do desafio deve seguir o nome que
  a semente do `challenge-new.sh` deriva do slug (ex.: slug `fatorial-recursivo` →
  `fatorial_recursivo` em python/js/rust/c e `FatorialRecursivo` em go). Se o modelo desviar,
  a validação rejeita.
- **Persistência de seleção em Desafio** não é restaurada entre sessões (ver `docs/app-gui.md`).
- **Geração real de aula é cauda pesada/flaky** — a geração de uma aula real (pesquisa +
  autoria + validação com juiz LLM) leva 3-6min e pode falhar transitoriamente no DeepSeek
  ("content vazio"/só `reasoning_content`); a geração é repetida 1× nos specs reais, mas o
  corredor com chaves pode exigir re-run. **KaTeX/TTS dependem de o modelo gerar markdown
  bem-formado** (delimitadores `$`/`$$` e texto de voz corretos); LaTeX mal formado degrada o
  render visualmente. O **Tutorial Completo exige as duas chaves** configuradas (sem elas a UI
  fica no gate de chaves do modal).

Detalhes, arquitetura técnica e o manual pt-BR completo: [`docs/app-gui.md`](../docs/app-gui.md).
