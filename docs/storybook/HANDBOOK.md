# HANDBOOK — o Storybook como fonte do próximo redesign (study-method)

> **Para quem isto é**: o agente/humano que for redesenhar a UI do study-method.
> Em vez de ler 12 000 linhas de views, lê este documento, abre o Storybook e
> tem o vocabulário visual inteiro do produto — o que existe, de que variantes e
> estados é feito, que tokens o definem e que regras não se podem quebrar.

---

## 1. Como abrir o catálogo

```bash
cd app
npm run storybook          # dev server em http://localhost:6006
npm run build-storybook    # build estático em app/storybook-static/
npx tsx tools/storybook-coverage.ts   # gate: 100% dos componentes têm história
```

A árvore do Storybook é a tabela de conteúdos do produto:

| Secção | O que contém |
|---|---|
| `Fundamentos/*` | Cores, Tipografia, Espaço, Movimento, Foco e Contraste, Ícones — os TOKENS do contrato |
| `Componentes/<Grupo>/*` | Todos os componentes visuais, agrupados por área (Chat, Shell, Editor, Markdown, Quiz, Desafio, Curso, Voz, Tema, Árvore, Terminal, UI) |
| `Padrões/*` | Composições recorrentes (painéis, empty states, fluxos de resposta) |
| `Vistas/*` | As views compostas do app (LessonView, ChallengeView, RoadmapView, SettingsView, GamesView, HomeView, SetupView/AppGate) |
| `Funcionalidades/Onboarding/*` | Onboarding, tutoriais, seletor de idioma |

Cada história tem: **Docs** autogerados (props reais), **controls** para as
variantes, toolbar de **Tema** (claro/escuro/sistema — a mesma mecânica do app:
classe `.light`/`.dark` no `<html>`) e toolbar de **Movimento** (para capturas
determinísticas).

---

## 2. As três leis que o catálogo impõe

1. **Nenhum hex fora do contrato.** Toda a cor/raio/espaçamento/duração vive em
   `app/src/lib/designTokens.ts` (dado puro) e é publicado em `app/src/theme.ts`
   (MUI `cssVariables`). As histórias de `Fundamentos/*` mostram os valores;
   `tests/theme.test.ts` recalcula cada afirmação `[medido]`.
2. **State ≠ View.** Cada componente tem uma view pura (só props) e a sua
   lógica/estado em módulos puros ou hooks testáveis sem jsdom
   (`*.state.ts`, `use*.ts`, `src/lib/*.ts`). É por isso que as histórias
   conseguem dirigir cada estado por `args`.
3. **Nada de layout copiado.** Os primitivos de layout/UI de
   `app/src/components/ui/` (ver `docs/storybook/PRIMITIVES.md`) e os helpers de
   `src/lib/layoutSx.ts` / `src/lib/a11yStyles.ts` são a única forma de montar
   painéis, colunas, empty states, erros com retry, overlays e alvos de toque.

---

## 3. Como um redesign consome isto

1. **Inventário**: percorre `Fundamentos/*` para ver o que o contrato fixa (o
   que NÃO pode mudar por capricho: pisos de contraste AAA, alvo de toque 44px,
   red-flash, foco visível) e `Componentes/*` para ver o inventário completo.
2. **Mapa de estados**: cada história cobre default + variantes + estados de
   ciclo de vida (carregando, vazio, erro, desabilitado, foco) — o redesign tem
   de responder a TODOS eles; um estado sem história não existe.
3. **Substituição por camada**: como tudo vem de componentes com view pura, um
   redesign toca nas views (e nos tokens) sem reescrever a lógica — os hooks e
   módulos `*.state.ts` continuam e a suíte continua verde.
4. **Verificação**: depois de trocar um visual,
   ```bash
   cd app
   npx tsc --noEmit -p tsconfig.json   # stories e componentes tipados
   bash tools/t.sh tests               # lógica intacta
   npx tsx tools/storybook-coverage.ts # nenhum componente ficou sem história
   npm run build-storybook             # o catálogo compila
   ```
   e percorre o catálogo nos DOIS temas (toolbar) — regra do produto: nenhuma
   cor por ternário de modo; as variáveis trocam sozinhas.
5. **Memória**: as decisões deste sistema estão registadas na memória CoALA do
   projeto (`$COALA search "storybook"` / `--tags design-system,storybook`); o
   repositório é a verdade, a memória aponta para ela.

---

## 4. Contrato de uma história (resumo)

Ver `docs/storybook/STORY-SPEC.md` para a letra de lei. Em uma frase: CSF3,
`título` literal na árvore, `satisfies Meta<typeof X>`, args realistas em
pt-BR, cobertura de variantes/estados/interações, API falsa via
`installMockApi` (de `src/storybook/mockApi.ts`) com fixtures de
`src/storybook/fixtures*.ts`, contextos via decorators de
`src/storybook/decorators.tsx`, zero hex inventados.

---

## 5. Mapa de propriedade (quem mexe onde)

| Área | Código | Histórias |
|---|---|---|
| Tokens/contrato | `src/lib/designTokens.ts`, `src/theme.ts`, `src/lib/animationTokens.ts` | `src/storybook/foundations/*` |
| Primitivos UI | `src/components/ui/*`, `src/lib/layoutSx.ts`, `src/lib/a11yStyles.ts`, `src/lib/focusTrap.ts` | `Componentes/UI/*` |
| Chat/Markdown | `src/components/chat/*`, `src/components/markdown/*` | `Componentes/Chat/*`, `Componentes/Markdown/*` |
| Shell | `src/components/shell/*`, `src/lib/splitRatio.ts`, `src/lib/shellNav.ts` | `Componentes/Shell/*` |
| Desafio/Quiz | `src/components/challenge/*`, `src/components/quiz/*`, `src/components/challengeNav/*` | `Componentes/Desafio/*`, `Componentes/Quiz/*` |
| Editor/Terminal | `src/components/editor/*`, `src/components/cm/*`, `src/components/terminal/*` | `Componentes/Editor/*`, `Componentes/Terminal/*` |
| Curso/Árvore/Voz/Tema | `src/components/course/*`, `src/components/tree/*`, `src/components/voice/*`, `src/components/theme/*` | `Componentes/Curso|Árvore|Voz|Tema/*` |
| Vistas | `src/views/**` | `Vistas/*` |
| Onboarding | `src/features/onboarding/**`, `src/i18n/LanguageSwitcher.tsx` | `Funcionalidades/Onboarding/*` |

---

## 6. Índice do catálogo (estado a 2026-10-03)

**565 histórias + 98 páginas de docs automáticas**, em 98 ficheiros `*.stories.tsx`
colocados ao lado do componente. Cobertura: **113/113 componentes visuais (100%)**
— o gate `npx tsx tools/storybook-coverage.ts` reprova qualquer componente sem
história (exit 1) e é a fonte viva deste índice.

| Secção | Histórias | O que cobre |
|---|---|---|
| `Fundamentos/*` | 19 | Cores (rampa completa por esquema), Tipografia, Espaço, Movimento, Foco e Contraste (pisos `[medido]`), Ícones (71 glifos reais + política) |
| `Componentes/UI/*` | 11 ficheiros | Pressable, ActionButton, LoadErrorState, RetryAlert, CenteredColumn, EmptyState, ModalScrim, SectionHeader, SettingsSection, ConfirmDialog, InfoCard |
| `Componentes/Chat/*` + `Markdown/*` | 7 ficheiros | ChatBubble (5 tons), ChatAvatar, SegmentedMarkdown, TypewriterText, TypingIndicator, CodeBlock, MarkdownView |
| `Componentes/Shell/*` | 5 ficheiros | GlobalBusyIndicator (9 busy reasons), NavigationRail, SessionFrame, ShellSidebarSlot, SplitDivider (arraste + APG) |
| `Componentes/Desafio/*` + `Quiz/*` | 22 ficheiros | ChallengeGenerateModal/View (5 etapas), ChallengeNavProvider, QuizChatCard, QuizOverlayView/Host (3 fases), TrackChallengePanel (21 estados) e 18 blocos |
| `Componentes/Editor|CodeMirror|Terminal/*` | 6 ficheiros | EditorPane(+View), EditorTabs, FileExplorer, CodeMirrorField (2 temas × 3 linguagens), AnswerTerminal |
| `Componentes/Curso|Árvore|Tema|Aula/*` | 17 ficheiros | CourseSelector, LessonSidebarHeader, EvolutionTree, ThemeModeSelector, LessonComposer/ActionRow/SourceViewer + 9 blocos da aula |
| `Vistas/*` | 11 ficheiros | App (shell completo), LessonView (9 estados do fluxo), ChallengeView (12), TrackChallengePanel (21), GamesView/GameLevelView (29), RoadmapView, HomeView, SettingsView (13), SetupView, AppGate |
| `Funcionalidades/Onboarding/*` | 5 ficheiros | OnboardingOverlay (spotlight real), TutorialSelectionModal, TutorialHelpButton, OnboardingHost, LanguageSwitcher |

Como navegar num redesign: começa em `Fundamentos/*` (o que não pode mudar),
depois `Componentes/UI/*` (o vocabulário de construção), depois as `Vistas/*`
(onde o vocabulário compõe telas). Cada componente tem os seus estados de ciclo
de vida documentados como histórias nomeadas em português.

## 7. Dívida conhecida (registada, não esquecida)

**Bloqueada por guardas de fonte** (os testes fixam o enraizamento; a extração
exige atualizar as guardas com a mesma intenção — planos prontos):

- `LessonView.tsx`: hooks `useLessonFlow`/`useLessonQuiz`/`useLessonChat`/`useLessonSources`
  (guardas: quizHistoryHydration, lessonSidebarWiringCoverage, quizVerdictCycle, quizStalledExit).
- `TrackChallengePanel.tsx`: editor/markAttempt/loadSpec/handleRetry inline
  (guardas: challengeRetry, challengeDraftCache, cadeadoIntegracao — mapa em CoALA #5137).
- `SplitDivider.tsx`: handlers de arraste (guardas: shellSplitUi, shellSidebar, shellNavPanel).
- Listas de fontes/desafios da LessonView → `InfoCard` (guardas: lessonSourcesViewer, cadeadoIntegracao;
  o InfoCard ainda não expressa aria-label por linha, secundário de 2 linhas, `disabled` nem chevron).

**Decisões de produto pendentes** (não são bugs — falta decidir):

- `Alert` do MUI v9: retry e descarte (×) são mutuamente exclusivos (só há × com
  `action == null`). O × do mic nunca chegou a renderizar; o output atual foi
  preservado byte a byte. "Retry E × no mesmo alerta" é uma decisão visual nova.
- `EvolutionTree`: nó com `minHeight: 36` abaixo do piso de toque 44 (densidade
  vs SC 2.5.5) e `maxHeight: 420` sem token (`LAYOUT.treeScrollPx`).
- `EvolutionTree.nodeIndent` = 16 unidades `theme.spacing` (128px/nível) — suspeito
  de querer dizer 16px; nunca mudar sem decisão de design.
- Aviso fail-closed do quiz (`QuizChatCard`/`QuizOverlayHost`) mantém desenho
  medido próprio (ícone `info.accentText`, 3,39:1/5,20:1) — o `RetryAlert` não o reproduz.
- `SectionHeader` sem slot de 2.ª ação (botão "Voltar" do RoadmapView) nem slot de
  `children` (cartão de formulário das chaves).

**Dívida de contrato de tokens** (as histórias de Fundamentos documentam):

- Sem escala de ESPAÇO nomeada em `designTokens.ts` (usa-se `theme.spacing`, base 8px).
- Escala tipográfica visível (62/48/38/29/23/18/14) e raios de superfície vivem em
  `theme.ts`, não no contrato de tokens.
- `lucide-react` é dependência com **0 usos** — candidata a remoção.

**Resolvido nesta ronda** (fica para a história): envelope `localTts:*` dessincronizado
do `ApiSchema` (a narração do onboarding nunca tocava) — corrigido no preload com
unwrap tipado e 9 testes; componentes mortos `MicButton`/`SpeakButton` apagados;
bug do sr-only (`width: 1` → 100%) corrigido em 5 cópias via `SR_ONLY_SX`; estado
"sem desafios" da ChallengeView que rebentava em `active.title`.