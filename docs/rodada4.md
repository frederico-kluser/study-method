# Rodada 4 — bugs B1/B2, tutorial fiel ao ondokai, UX refinada, matemática KaTeX e E2E real

Documento da **quarta rodada** da GUI Electron do study-method (app/). Ela fechou os dois bugs
abertos da rodada 3 (`B1` — `list-challenges "requer setupRoot"`; `B2` — "resposta sem
`choices[0].message.content`"), refez o onboarding com fidelidade ao ondokai, refinou o tema
escuro e a Home, adicionou render de fórmulas matemáticas (KaTeX) e entregou uma suíte E2E
**real** com as chaves do usuário. É a rodada que **prova B1 didaticamente** e valida a
didática certa/errada de ponta a ponta.

Este documento descreve **o que** a
rodada entregou e **como** cada parte funciona.

---

## Bugs da rodada 3, corrigidos

### B1 — `list-challenges "requer setupRoot"` (`fix15-list-challenges`, `73f749f`)

**Sintoma (rodada 3):** ao gerar uma aula, a aba Desafio chamava `study:list-challenges` e a
lista falhava com `list-challenges requer setupRoot` — o handler exigia um `setupRoot` explícito
que o fluxo de geração não passava, e o `study:generate-lesson` não registrava o setup criado.

**Causa-raiz:** o `setupRoot` morava dentro da `lessonOrchestrator` (aula materializada) mas
não era exposto de volta aos handlers do IPC; quem desse `list-challenges` sem `setupRoot` caía
no erro.

**Correção — o `setupRoot` flui do `generateLesson` para o `list-challenges` por três vias
complementares:**

1. **Progresso `materializing`** — `lessonTypes.ts` ganhou campos `setupRoot?`/`setupId?` no
   evento de progresso da materialização. Assim que o `createSetup` termina, o progresso
   `materializing` carrega o diretório do setup e o handler o captura (aditivo ao contrato,
   sem quebrar o envelope de progresso existente).
2. **Memória no handler** — `study-handlers.ts` mantém `lastSetupRoot`/`lastSetupId` na memória
   do processo main: salvos no `create-setup` e no progresso `materializing`, resetados a cada
   novo `generate-lesson`. Os handlers que pedem `setupRoot` (`list-challenges`, `new-session`)
   **fazem fallback** para `memory.lastSetupRoot` quando o invoke não passa o valor
   (`setupRoot` explícito ainda tem precedência).
3. **Contexto na UI** — `ChallengeNavProvider` (renderer) memoriza o `setupRoot` depois da
   geração e o passa ao `list-challenges`; os pontos de uso avaliam `setupRoot` do payload ou a
   memória do provider.

O `ChallengeView` também recebeu adaptações para ler o setup do fluxo de aula. Cobertura:
`tests/study-handlers.test.ts` (+86 linhas, o fluxo geração→listagem sem `setupRoot` explícito).

E o `fix15c-review` (`838c307`) reforçou: **reset do `lastSetupRoot`** em novo `generate-lesson`
(evita aula velha em lista nova); effect de listagem com dependência correta no `ChallengeView`.

### B2 — "resposta sem `choices[0].message.content`" (causa-raiz REAL) (`fix15-deepseek-parse`, `3a087a7`)

> **Nota de leitura (posterior a esta rodada).** Tudo abaixo é o registro do que aconteceu
> quando o app falava DIRETO com a API da DeepSeek. Depois disso o provedor migrou para o
> **OpenRouter** (`z-ai/glm-5.3-flash`, chave `OPENROUTER_API_KEY` no formato `sk-or-v1-…`),
> e os três serviços foram renomeados: `deepseekClient.ts` → `llmClient.ts`,
> `deepseekLessonAuthor.ts` → `lessonAuthor.ts`, `deepseekLlmJudge.ts` → `llmJudge.ts`. O
> contrato congelado do provedor vive hoje em `app/shared/llm/constants.ts`. Os nomes de
> ARQUIVO citados aqui já estão atualizados (senão não resolveriam no disco); os nomes de
> MODELO e a narrativa continuam os da época, porque é isso que este documento registra.

**Sintoma (rodada 3):** o feedback didático falhava de forma enganosa com "resposta sem
`choices[0].message.content`".

**Causa-raiz REAL (não era parse):** o id de modelo `deepseek-v4-flash-0731` **NÃO existe** na
API da DeepSeek. O `GET /models` devolve exatamente
`{deepseek-v4-flash, deepseek-v4-pro, deepseek-v4-flash-vision-exp}`; um
`POST /chat/completions` com `deepseek-v4-flash-0731` responde **HTTP 400**
`invalid_request_error: The supported API model names are ... but you passed
deepseek-v4-flash-0731` — e esse 400 **caía no caminho de sucesso** do cliente (que só tratava
`status >= 500` e 2xx), virando o enganoso "sem content" na UI.

**Correção (validada na API real):**

- **Modelo corrigido** para `deepseek-v4-flash` — literal único em
  `app/shared/piAgent/constants.ts` (`DEEPSEEK_MODEL.id` — símbolo daquela época; o contrato
  congelado do provedor vive hoje em `app/shared/llm/constants.ts`), validado com um
  `GET /models` real
  (lista exata) e com um `POST /chat/completions` real devolvendo 200 + content não-vazio. O
  comentário do código documenta todo o handoff (por que `-0731` não existe e o que o erro
  real responde).
- **Erros claros e endereçados** no `llmClient.ts` (então `deepseekClient.ts`): a resposta
  agora classifica o status —
  `KEY_INVALID` (401/403), `RATE_LIMIT` (429), `BAD_REQUEST` (qualquer 4xx, ex.: 400 de modelo
  inválido), `SERVER_ERROR` (5xx com corpo parseável), `NETWORK` (fetch/timeout/corpo ilegível) e
  `EMPTY_CONTENT` (2xx com content vazio). Cada 4xx/5xx entra no caminho de **erro**, não no de
  sucesso.
- `parseChoiceResult` virou **função pura** (testável) que destrincha a resposta e distingue
  `content` vazio de "só `reasoning_content`" — este último ganha um erro **explícito**
  (`EMPTY_CONTENT`, "o modelo devolveu apenas reasoning_content, sem conteúdo de aula"), nunca
  silencioso.
- **Sanitização reordenada** (`fix15c-review`): o corpo do erro é sanitizado **antes** de
  renderizar (nunca expõe a chave de API em fragmento de erro).

Cobertura ampla em `app/tests/llmClient.test.ts` (+113 linhas: 400→BAD_REQUEST, content vazio,
só-reasoning, corpo sanitizado), mais testes em `app/tests/lessonAuthor.test.ts`,
`app/tests/llmJudge.test.ts`, `PiAgentService.test.ts` e `piProviderMapper.test.ts`.

O `fix15c-review` (838c307) também fez o **juiz degradar com graça** `EMPTY_CONTENT`/`NETWORK`:
o `llmJudge` mapeia erro de conteúdo vazio e de rede para estados de juiz que a UI
consegue tratar em vez de quebrar.

---

## Tutorial refeito — fiel ao ondokai (`onda16-tutorial`, `7459808`; `fix16d-review`, `699737d`)

O onboarding foi **refeito** para ser fiel ao do ondokai (máscara + spotlight + bloqueio de
clique + auto-avanço por ação), com **Quick Start** (curto) e **Tutorial Completo** (detalhado).

### Overlay — `z-14000`, máscara em 4 segmentos + spotlight + bloqueio de clique

`OnboardingOverlay.tsx` renderiza em um **portal no `document.body`** com
`z-index: 14000` (acima dos modais — mesma escolha do ondokai):

- **Máscara de 4 segmentos** ao redor do `spotlight` (retângulo recortado sobre o alvo),
  bloqueando a interação **fora** dele;
- **Spotlight** no alvo (por `targetSelector`) com efeitos próprios;
- **Bloqueio de clique**: um handler de captura cobre a área fora do spotlight e fora do painel,
  reforçando a proteção além das máscaras (cliques não caem em elementos por baixo);
- Posicionamento via **RAF/`ResizeObserver`** com sincronização de `viewport` (efeito deste
  `useOnboarding`), travado até o alvo presente;
- `alternateTargetSelector` — conjunto alternativo de seletores procurados caso o primário
  não exista no momento (usado por steps que dependem de um alvo que só existe após transição).

### Avaliador de auto-avanço — `evaluateStepAction` puro, ~220ms

Cada step do Tutorial Completo declara um `expectedAction` (das **8 ações** discretas por
snapshot — ver abaixo). `evaluateStepAction.ts` é uma **função pura** que decide se a ação foi
satisfeita a partir do estado; quando satisfeita, o `useOnboarding` **auto-avança após ~220ms**
(`AUTO_ADVANCE_MS = 220`). Steps **informativos** (sem `expectedAction`) avançam com um botão
"Continuar".

As **8 ações esperadas** (`expectedAction`): `open-settings`, `settings-keys-filled`,
`open-lesson`, `fill-lesson-subject`, `generate-lesson`, `open-challenge`, `type-in-editor` e
`test-answer`. As *signals* que as avaliam ficam em `onboardingSignals.ts`, e o avanço/watch de
estado é orquestrado pelo `useOnboarding`.

### Dois tours

- **Tutorial Completo** (`onboardingSteps.ts`): 14 steps organizados nos 4 capítulos
  (`shell` → `settings` → `lesson` → `challenge`) — **13 didáticos mais o de conclusão**:
  título do app, toggle de tema, seletor de idioma, abas, abrir Configurações, preencher chaves,
  abrir Aula, preencher assunto, gerar aula, abrir Desafio, digitar no editor, Testar resposta,
  conclusão.
- **Quick Start** (`quickStartSteps.ts`): 6 steps mais curtos (título, abas, abrir Aula, abrir
  Desafio, Testar resposta, conclusão) — suficiente para o primeiro uso.

### Modal de seleção com gate de chaves

`TutorialSelectionModal` deixa o usuário escolher **Quick Start** ou **Tutorial Completo**.
Se as chaves (OpenRouter **e** Brave) não estão configuradas, o modal mostra um **gate de chaves**
com um **CTA "Configurar chaves"** que leva à aba Settings (o `fix16d-review` tirou o CTA de
dentro de um `Button disabled`, para o botão continuar acionável quando as chaves faltam); o
tutorial **Completo exige chaves** (seus steps de aula/geração dependem delas) — sem as duas
chaves ele fica travado no gate, enquanto o Quick Start pode seguir.

### First-run latch **síncrono** (StrictMode-safe)

A oferta de 1ª execução usa um **latch síncrono**: a flag (`study-method-onboarding-offered-v1`)
é escrita **antes** de o tutorial abrir, e um `firedRef` é marcado no mesmo tick — o
double-invoke do React StrictMode em dev **não dispara o modal duas vezes**. O `useFirstRunTutorialPrompt`
só dispara de fato depois que o **startup-gate está `ready`** (`isReady`), nunca em `offline`.

### Hint pós-tutorial (1x)

Depois de concluir **ou pular** o tutorial, um **mini-hint de 1 passo** aponta — na 1ª chegada à
aba Aula — o **campo de assunto** (`lesson-subject`) com "digite qualquer dúvida"
(`useHelpHint` + `helpHint.rule.ts` + flag one-shot `study-method-onboarding-help-hint-v1`).
É in-memory, sem tutorial novo/persistência; re-rodar o tutorial **não** rearra a dica.

### Narração via TTS local (Piper)

`onboardingAudio.service.ts` **adapta o sistema de áudio do ondokai** (que usava MP3 por passo)
ao TTS on-device: gera a **fala do texto do passo em runtime** com o Piper
(`localTts.generate`), voz da língua ativa, após a mudança de step (pequeno atraso p/ animação).
**Mute** persiste em `study-method-onboarding-audio-muted`; ausência de modelo/TTS **nunca é
erro** — resolve em silêncio (só texto + ícone de mute), as views nunca dependem do áudio.

### Robustez — skip de alvo ausente, persistência/retomada

- **Skip de alvo ausente** (`fix16d-review`, `stepTargetPresence.ts`): se um alvo não existe
  (ex.: o step aponta para um elemento de outra aba ainda não montado), o step é **pulado**
  com **fallback "Continuar"** — o tutorial **não trava**.
- **Persistência/retomada**: progresso (status + step atual + versão) fica em
  `study-method-onboarding-v1`; reabrir retoma **onde parou** (reload/relançamento). Estados
  `not_started | in_progress | completed | skipped`.
- `fix16d-review` fechou também: `delta` opcional em re-run (não obriga re-tipar valor já
  presente), largura efetiva do painel corrigida via `onboardingPositioning.utils.ts`, e
  `keys-fill` avaliado via `status` retornado (não só preenchimento visual); + **E2E de
  dead-lock** no desafio sem aula (`e2e-onboarding.spec.ts`).

---

## UX — dark refinado por camadas + Home guiada (`onda17a-ux`, `3a106e2`)

### Tema escuro refinado por camadas de elevação

`theme.ts` passou o **dark** para uma paleta explícita de **camadas de elevação**:

| Camada | Cor | Uso |
|---|---|---|
| `background.default` | `#0f1115` | superfície de base do app (fundo) |
| `background.paper` | `#171c23` | cards/papers/sheets (camada 2, levemente mais clara) |
| `text.secondary` | `#aeb6c2` | texto secundário — **AA** de contraste no dark |
| `divider` | `DARK_DIVIDER` | borda `1px` legível em `outlined`/separadores |
| `tertiary` (M3) | um acento de contraste | paleta Material 3 (o type MUI v9 foi estendido com `tertiary`) |

`tertiary` é uma cor de paleta do **Material 3** (acento de contraste sobre superfícies
escuras); o type do MUI v9 não o expõe, então o `theme.ts` estende o `Palette`. O **light**
permanece como estava (não invertido), só ganha `tertiary` para paridade. As cores são
**assertadas** no `tests/theme.test.ts` (paleta dark exata).

### Home guiada

O `placeholders.tsx` (a view Início) virou uma **Home guiada**:

- **Copy programação E matemática** (agora declara o escopo duplo do tutor);
- **3 passos** numéricos do "como usar";
- **CTA único contextual** — um único botão que muda conforme o estado (ex.: ir pra Aula quando
  pronto; para Configurar chaves quando faltam);
- **Card de status real das chaves** — mostra `ready`/`missing` agregado
  (`homeSetup.ts` → `HomeSetupStatus`) a partir do `KeysStatus` real, não um placeholder;
- **Chips de sugestão com pré-preenchimento** — chips programação + matemática com chave i18n
  (`homeSetup.ts`), que **pré-preenchem o campo de assunto** da aba Aula
  (`pendingSubject.ts` + consumo **one-shot** na `LessonView`, corrigido no `fix17c-review`).

Tudo em lógica pura testável (`tests/homeSetup.test.ts`, `tests/pendingSubject.test.ts`); o
i18n pt-BR/en ganhou as linhas novas (nenhum texto pt mora numa string de código).

### Consistência de altura input/botão na `LessonView` (`27d8d1a`)

A linha de comando da aula ficou com **alturas de input e botão consistentes** (MUI `InputBase`
alinhado ao `Button`), evitando o degrau visual entre o campo de assunto e o botão de gerar.

---

## Matemática — KaTeX nas aulas e desafios (`onda17b-math`, `27d8d1a`; `fix17c-review`, `b13dda0`)

O markdown de aulas **e** desafios agora renderiza **fórmulas matemáticas** com **KaTeX**:

- Dependências: `katex@0.16`, `remark-math@6` (parse de `$...$` inline e `$$...$$` em bloco) +
  `rehype-katex@7` (render), plugadas em `lessonMarkdown.ts` sobre o pipeline
  `remark-parse → remark-math → remark-rehype → rehype-katex → rehype-stringify`.
- **CSS no bundle**: o CSS do KaTeX (`katex/dist/katex.min.css`) é importado em `main.tsx`
  (incluído no bundle do renderer — sem link externo).
- **Escape de `$` de moeda antes do KaTeX** (`fix17c-review` ACHADO-2): `remark-math` devora
  `$` solitários pareados, então copy com cifrão ("Este plano custa $5 e $10") viraria matemática
  corrupta. `escapeLoneDollarSigns()` escapa `$` que é **claramente moeda** (seguido de dígito)
  **antes** do parse, sem tocar delimitadores LaTeX válidos:
  1. `$$` (bloco) → preserva;
  2. `$` + dígito (moeda, ex.: `$5`, `$ 5`, `$1.000,00`) → escapa para `\$`;
  3. `$x^2$` com par na mesma linha → LaTeX inline válido → preserva;
  4. `$` solitário → intacto.
  Falso-positivo documentado: `$5^2$` (math começando em dígito) é tratado como moeda — raro e
  aceito em favor de não corromper copy com cifrão.
- Cobertura: `tests/lessonMarkdown.test.ts` (render `.katex` live, `$x^2$`, bloco `$$`, markdown
  sem `$` intacto, escape de moeda) + teste E2E de render `.katex` ao vivo (`e2e-lesson.spec.ts`).

> **Dependência**: KaTeX renderiza bem **quando o modelo gera markdown bem-formado** (delimitadores
> `$`/`$$` corretos). Se o LLM emitir LaTeX mal formado, o render degrada visualmente — é uma
> qualidade de geração, não um bug do renderizador.

---

## E2E — suíte real com as chaves do usuário (`onda18-e2e-real`, `f801c30`; `fix18a-review`, `280c3df`)

A onda 18 acrescentou o subconjunto **REAL** ao harness E2E, além de um novo spec mock.

### Mock: 11 specs / 15 testes verdes

Roda com `npm run build && npm run test:e2e`. O app abre em **modo stub**
(`STUDY_METHOD_E2E=1`, sem rede real — handlers devolvem fixtures determinísticas em
`e2eStubs.ts`) com janela **oculta/não-focável** (`STUDY_METHOD_WINDOW_VISIBLE=0`). São **11
specs mock, 15 testes** (`e2e-gate`=2, `e2e-onboarding`=2, `more-flows`=3; demais 1). O novo
`more-flows.spec.ts` cobre fluxos transversais:

- **idioma + tema**: pt→en→pt reflete no Home e na aula; claro→escuro→system persiste junto;
- **Quick Start completo**: modal na 1ª execução → **Quick Start completa os 6 passos** →
  status `completed`;
- **persistência do tutorial**: o progresso **retoma entre reloads** (para onde parou).

### Real: 3 specs (`real-lesson`, `real-didactics`, `real-search`)

Rodam **sem** o stub (`STUDY_METHOD_E2E` ausente) — a fiação real flui (pesquisa Brave +
autoria por LLM da nuvem + runner/juiz de verdade). As **chaves reais entram por envars do shell**
(`OPENROUTER_API_KEY`/`BRAVE_API_KEY`) e o `userData` é isolado num TMP, apagado ao fim (nunca
toca as settings reais do dev; o TMP, que pode conter as chaves em claro sem keyring, é limpo —
também em falha de launch, `fix18a-review`).

```bash
export OPENROUTER_API_KEY=sk-or-v1-…
export BRAVE_API_KEY=BSAq…
npm run test:e2e:real   # falha com msg clara se faltar alguma env
```

O que cada um valida:

- `real-lesson` — gera **uma aula real** ("Inverter uma árvore binária"): markdown real
  (título + seções + código) e, crucialmente, **os desafios LISTAM e abrem** — a **regressão
  B1** (`list-challenges` não falha com "requer `setupRoot`") fica **provada na API real**;
- `real-didactics` — **didática certa/errada** no mesmo desafio real: resposta CORRETA
  (solução de referência) → veredito `PASSOU` + feedback didático da LLM na UI; resposta
  ERRADA/parcial (stub vazio) → `NÃO PASSOU` + feedback com dicas;
- `real-search` — **round-trip real com o Brave** (`keys:validate-brave` com a chave real →
  `isValid:true`, `get-status` refletindo `braveValidated`). As **fontes** da pesquisa real são
  cobertas dentro do `real-lesson` (não há canal IPC de busca direta de referências).

**Tempos realistas** (`fix18a-review`): gerar uma aula real (pesquisa + autoria + validação com
juiz LLM) leva **3-6min** e pode variar/estourar — a geração usa até **2 tentativas** de
`perAttemptMs` **420 s**, com até 2 avaliações didáticas. `real-lesson`/`real-didactics` usam
`test.setTimeout` de **1 800 000 ms (30 min)** para absorver a cauda lenta; `real-search` só 120 s.

### Segurança das chaves

- **Chaves NUNCA versionadas**: `.gitignore` ignora `.env.local` (`app/.gitignore`), e o
  `tools/run-e2e-real.sh` **falha com mensagem clara** se as envs não estão exportadas —
  preferência por exportar no shell; sempre entram por env no processo, isoladas num TMP.
- Sem as chaves, os specs reais fazem `test.skip` (reason claro) — a suíte mock continua verde;
  **grep limpo no HEAD**: nenhuma chave real entrou nos arquivos versionados.

---

## Números da rodada 4

| Métrica | Rodada 3 (fim) | Rodada 4 |
|---|---|---|
| Testes unitários (node:test) | 622 | **~721** (720 pass / 0 fail / 1 skipped) |
| E2E mock | 11 testes | **15** testes (11 specs) |
| E2E real | — | **3** specs |
| Modelo DeepSeek | `deepseek-v4-flash-0731` (INVÁLIDO) | **`deepseek-v4-flash`** (validado na API) |
| Gates (lint/build/unit/E2E) | verdes | **verdes** |

---

## Como rodar (recap)

```bash
cd app
npm ci
npm run build && npm run lint
npm test                          # bash tools/t.sh tests → 721 testes, verde
npm run build && npm run test:e2e # 15 testes mock, verde
npm run test:e2e:real             # 3 specs reais — exporte OPENROUTER_API_KEY/BRAVE_API_KEY no shell
```
