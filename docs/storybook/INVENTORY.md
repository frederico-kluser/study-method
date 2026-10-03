# Inventário visual para Storybook — `app/src`

> Inventário feito por leitura real dos ficheiros (`grep`/`read`) de todos os `.tsx` de `app/src` (50 ficheiros) e dos `.ts` de tokens visuais. Nenhum tipo foi inventado: as props são as interfaces/assinaturas lidas do código.

## 1. Critérios e infraestrutura transversal

**Classificação**

- **view pura** — a saída é função das props (pode usar `useTranslation`/`useTheme`/`useMemo`/`useId`, sem estado próprio nem efeitos).
- **stateful** — tem `useState`/`useReducer`/`useEffect`/`useSyncExternalStore`, refs com temporizadores, **ou** consome contextos/stores da app (`SessionStateCtx`, `ChallengeNavCtx`, `StartupCtx`, `OnboardingController`, `ShellSidebarSlotContext`, stores de módulo) **ou** chama `getApi()`.

**Blocos de infraestrutura que as stories têm de fornecer** (tudo isto existe e é usado por vários componentes):

| Infraestrutura | Onde vive | O que fornece |
|---|---|---|
| `getApi()` (apiBridge) | `app/src/lib/apiBridge.ts` | `ApiSchema` do preload (IPC). Tem `__setApiForTests(api)` / `__resetApiForTests()` — **ponto de mock oficial** para stories |
| `SessionStateCtx` / `SessionStateProvider` | `app/src/lib/sessionState.ts`, `app/src/components/sessionState/SessionStateProvider.tsx` | `SessionStateValue` (snapshot + dispatch); default existe (`DEFAULT_SESSION_STATE`) |
| `ChallengeNavCtx` / `ChallengeNavProvider` | `app/src/lib/challengeNav.ts`, `app/src/components/challengeNav/ChallengeNavProvider.tsx` | seleção do desafio (`TrackChallengeNavSelection`), `navigateToChallenge/…Lesson`, relatório de erro; default existe (`DEFAULT_CHALLENGE_NAV`) |
| `ShellSidebarSlotContext` / `ShellSidebarPortal` | `app/src/components/shell/ShellSidebarSlot.tsx` | portal para o slot `#shell-sidebar-view-slot`; sem slot renderiza `null` |
| `StartupCtx` / `useStartup()` | `app/src/gate/AppGate.tsx` | `status: StartupStatus \| null`, `flags: StartupFlags`, `recheck()`; default existe |
| `OnboardingController` / `useOnboardingController()` | `app/src/features/onboarding/OnboardingHost.tsx` | `openFromHelp`, `openTutorialSelection`, `progress` |
| Store de módulo quiz | `app/src/lib/quizOverlayState.ts` + `app/src/components/quiz/quizOverlayContent.ts` | estado do overlay lido por `useSyncExternalStore` (`openQuizOverlay`, `peekQuizOverlay`, `__resetQuizOverlayForTests`) |
| Store de módulo geração | `app/src/lib/challengeGenerateStore.ts` | estado do modal de geração (`startChallengeGenerate`, `__resetChallengeGenerateForTests`) |
| Cache de rascunho | `app/src/lib/challengeDraftCache.ts` | Map em memória (explicitamente **não** usa localStorage) |
| i18n | `app/src/i18n/index.ts` | namespace único `translation`; chamadas `t('translation:<chave>')` (também `t(\`translation:${...}\`)` dinâmico). Persistência em `localStorage['app-language']` |
| Tema | `app/src/theme.ts` (`theme`, `createTheme`) + `main.tsx` | `ThemeProvider` + `CssBaseline`; hooks `useTheme`/`useColorScheme` exigem esse provider |

**localStorage usado pela app** (para stubar em stories): `app-language` (i18n), `theme-mode` (`THEME_MODE_STORAGE_KEY` em `main.tsx`), `study-method-onboarding-v1`, `study-method-onboarding-help-hint-v1`, `study-method-onboarding-offered-v1` (`onboardingStorage.service.ts`). Os `.tsx` só tocam `localStorage` diretamente em `main.tsx` (leitura de `theme-mode`).

**Libs visuais presentes**: MUI (v9), `motion/react` (AnimatePresence/motion/useReducedMotion), `@uiw/react-codemirror` + `@codemirror/*`, `@xterm/xterm` + `@xterm/addon-fit`, KaTeX (via `katexRemarkPlugins`/`katexRehypePlugins` de `lib/lessonMarkdown`), `react-markdown` + `remark-gfm`, Web Speech/microfone via `useMicSTT` (getUserMedia + `getApi().stt.*`).

---

## 2. Índice — 58 componentes exportados (49 ficheiros; `main.tsx` não exporta componentes)

| # | Ficheiro | Export | Tipo | Estratégia de story |
|---|---|---|---|---|
| 1 | `app/src/App.tsx` | `App` (default) | stateful | mock de api + decorator |
| 2 | `app/src/components/challenge/ChallengeGenerateModal.tsx` | `ChallengeGenerateModal` | stateful | mock de api + seed de store |
| 3 | `app/src/components/challengeNav/ChallengeNavProvider.tsx` | `ChallengeNavProvider` | stateful | decorator de contexto |
| 4 | `app/src/components/chat/ChatBubble.tsx` | `ChatBubble` | view pura | props diretas |
| 5 | `app/src/components/chat/chatSurfaces.tsx` | `ChatAvatar` | view pura | props diretas |
| 6 | `app/src/components/chat/SegmentedMarkdown.tsx` | `SegmentedMarkdown` | view pura | props diretas |
| 7 | `app/src/components/chat/TypewriterText.tsx` | `TypewriterText` | stateful | props diretas |
| 8 | `app/src/components/chat/TypingIndicator.tsx` | `TypingIndicator` | view pura | props diretas |
| 9 | `app/src/components/cm/CodeMirrorField.tsx` | `CodeMirrorField` | view pura (contexto MUI) | props diretas + decorator de tema |
| 10 | `app/src/components/course/CourseSelector.tsx` | `CourseSelector` (default) | view pura | props diretas |
| 11 | `app/src/components/course/LessonSidebarHeader.tsx` | `LessonSidebarHeader` | view pura | props diretas |
| 12 | `app/src/components/editor/EditorPane.tsx` | `EditorPane` (forwardRef) | stateful | mock de api |
| 13 | `app/src/components/editor/EditorTabs.tsx` | `EditorTabs` | view pura | props diretas |
| 14 | `app/src/components/editor/FileExplorer.tsx` | `FileExplorer` | stateful | props diretas |
| 15 | `app/src/components/markdown/CodeBlock.tsx` | `CodeBlock` | stateful | props diretas |
| 16 | `app/src/components/markdown/MarkdownView.tsx` | `MarkdownView` | view pura | props diretas |
| 17 | `app/src/components/quiz/QuizChatCard.tsx` | `QuizChatCard` | view pura | props diretas |
| 18 | `app/src/components/quiz/QuizOverlayHost.tsx` | `QuizOverlayHost` | stateful | seed de store de módulo |
| 19 | `app/src/components/sessionState/SessionStateProvider.tsx` | `SessionStateProvider` (named+default) | stateful | decorator de contexto |
| 20 | `app/src/components/shell/GlobalBusyIndicator.tsx` | `GlobalBusyIndicator` (default) | stateful | decorator de contexto |
| 21 | `app/src/components/shell/NavigationRail.tsx` | `NavigationRail` (default) | view pura | props diretas |
| 22 | `app/src/components/shell/SessionFrame.tsx` | `SessionFrame` (default) | stateful | decorator de contexto |
| 23 | `app/src/components/shell/ShellSidebarSlot.tsx` | `ShellSidebarPortal` | stateful | decorator de contexto (portal) |
| 24 | `app/src/components/shell/SplitDivider.tsx` | `SplitDivider` (default) | stateful | props diretas |
| 25 | `app/src/components/terminal/AnswerTerminal.tsx` | `AnswerTerminal` (forwardRef) | stateful | props diretas + decorator de tema |
| 26 | `app/src/components/theme/ThemeModeSelector.tsx` | `ThemeModeSelector` (default) | stateful | decorator de tema |
| 27 | `app/src/components/tree/EvolutionTree.tsx` | `EvolutionTree` (default) | view pura | props diretas |
| 28 | `app/src/components/voice/MicButton.tsx` | `MicButton` | stateful | mock de api |
| 29 | `app/src/components/voice/SpeakButton.tsx` | `SpeakButton` | stateful | mock de api |
| 30 | `app/src/features/onboarding/components/OnboardingOverlay.tsx` | `OnboardingOverlay` | stateful | props diretas + DOM-alvo |
| 31 | `app/src/features/onboarding/components/TutorialHelpButton.tsx` | `TutorialHelpButton` (named+default) | view pura | decorator de contexto |
| 32 | `app/src/features/onboarding/components/TutorialSelectionModal.tsx` | `TutorialSelectionModal` | stateful | props diretas (portal) |
| 33 | `app/src/features/onboarding/OnboardingHost.tsx` | `OnboardingHost` | stateful | mock de api + decorator |
| 34 | `app/src/gate/AppGate.tsx` | `OfflineBanner` | stateful | decorator de contexto |
| 35 | `app/src/gate/AppGate.tsx` | `AppGate` | stateful | mock de api |
| 36 | `app/src/gate/SetupView.tsx` | `SetupView` | stateful | mock de api |
| 37 | `app/src/i18n/LanguageSwitcher.tsx` | `LanguageSwitcher` (default) | stateful | decorator de i18n |
| 38 | `app/src/views/ChallengeView/ChallengeView.tsx` | `ChallengeView` (default) | stateful | mock de api |
| 39 | `app/src/views/ChallengeView/TrackChallengePanel.tsx` | `TrackChallengePanel` | stateful | mock de api + decorator |
| 40 | `app/src/views/GamesView/GameLevelView.tsx` | `GameLangSelector` | view pura | props diretas |
| 41 | `app/src/views/GamesView/GameLevelView.tsx` | `GameLevelPanel` | view pura | props diretas |
| 42 | `app/src/views/GamesView/GameLevelView.tsx` | `GameLevelView` (default) | stateful | mock de api |
| 43 | `app/src/views/GamesView/GamesView.tsx` | `GameLevelNodeRow` | view pura | props diretas |
| 44 | `app/src/views/GamesView/GamesView.tsx` | `GamesMap` | view pura | props diretas |
| 45 | `app/src/views/GamesView/GamesView.tsx` | `GamesScreen` | view pura | props diretas |
| 46 | `app/src/views/GamesView/GamesView.tsx` | `GamesView` (default) | stateful | mock de api |
| 47 | `app/src/views/LessonView/LessonQuiz.tsx` | `LessonQuizCard` | view pura | props diretas |
| 48 | `app/src/views/LessonView/LessonView.tsx` | `LessonComposer` | view pura | props diretas |
| 49 | `app/src/views/LessonView/LessonView.tsx` | `LessonActionRow` | view pura | props diretas |
| 50 | `app/src/views/LessonView/LessonView.tsx` | `LessonSourceViewer` | stateful (leve) | props diretas |
| 51 | `app/src/views/LessonView/LessonView.tsx` | `LessonView` | stateful | mock de api + extrair hook |
| 52 | `app/src/views/placeholders.tsx` | `HomeView` | stateful | mock de api |
| 53 | `app/src/views/RoadmapView/RoadmapView.tsx` | `RoadmapView` | stateful | mock de api + decorator |
| 54 | `app/src/views/SettingsView/KeysPanel.tsx` | `KeysPanel` | stateful | mock de api |
| 55 | `app/src/views/SettingsView/LocalAiPanel.tsx` | `LocalAiPanel` | stateful | mock de api |
| 56 | `app/src/views/SettingsView/OrphanTracksPanel.tsx` | `OrphanTracksPanel` | stateful | mock de api |
| 57 | `app/src/views/SettingsView/ProgressPanel.tsx` | `ProgressPanel` | stateful | mock de api |
| 58 | `app/src/views/SettingsView/SettingsView.tsx` | `SettingsView` (default) | view pura | props diretas (transitivo dos painéis) |

---

## 3. Detalhe por ficheiro

### 3.1 `app/src/App.tsx`

| Export | Tipo | Props públicas | Dependências | Bloqueadores p/ story isolada | Estratégia |
|---|---|---|---|---|---|
| `App` (default) | stateful — `useStartup()` (StartupCtx), `useState`/`useEffect`×3/`useCallback` no `Shell` interno (mede `containerPx`, `dragging`) | nenhuma | MUI `Box`; i18n `t('translation:nav.challenge')`; monta `ChallengeNavProvider` + `SessionStateProvider` + `ShellSidebarSlotContext` + `OnboardingHost` + `ChallengeGenerateModal` + `QuizOverlayHost` + `GlobalBusyIndicator`; `lib/shellNav` (`navPanelId`, `navTabId`) | Consome `StartupCtx` (default existe mas `status: null`); as views-filho (`HomeView`, `LessonView`, `RoadmapView`, `SettingsView`, `GamesView`, `ChallengeView`) chamam `getApi()`; ResizeObserver no shell | **mock de api** + decorator que fornece `StartupCtx` resolvido; para "estoirar" só o shell, story separada de `SessionFrame`/`NavigationRail`/`SplitDivider` |

_Outros exports_: `VIEWS: Record<PanelKey, ComponentType<ViewProps>>` (interno), constantes `SIDEBAR_PREMEASURE_PX`, `SHELL_SPLIT_HINT_ID`. O `Shell` (interno, linhas 141–317) é o candidato a extrair para story própria do layout de split.

### 3.2 `app/src/components/challenge/ChallengeGenerateModal.tsx`

| Export | Tipo | Props públicas | Dependências | Bloqueadores | Estratégia |
|---|---|---|---|---|---|
| `ChallengeGenerateModal` (named) | stateful — `useSyncExternalStore(subscribeChallengeGenerate, peekChallengeGenerate)`, `useChallengeNav()`, `useEffect`×3 (focus trap, subscrição de progresso), `useReducedMotion` | nenhuma (auto-contido) | MUI (`Box`, `Button`, `IconButton`, `Stack`, `Typography`, `useTheme`); `motion/react` (`AnimatePresence`, `motion`); `lib/animationTokens` (`springs`, `scaleIn`, `transitions`, `windowVariants`); `theme.modalSurfaceStyles`; **apiBridge**: `getApi().track.onChallengeRegenerateProgress(cb)` (subscrição de eventos); `useChallengeNav`; i18n `challengeGen.close`, `challengeGen.doneHint`, `challengeGen.doneTitle`, `challengeGen.errorGeneric`, `challengeGen.title`, `challengeGen.viewChallenge` | Store de módulo `challengeGenerateStore` (sem seed só renderiza o estado `idle`), `ChallengeNavCtx`, `getApi()` | **mock de api** + **decorator de contexto** + seed do store (`startChallengeGenerate(...)` / `__resetChallengeGenerateForTests()`) |

_Outros exports_: tipos `ChallengeGenerateStatus`, `ChallengeGenerateTarget` (em `lib/challengeGenerateStore`).

### 3.3 `app/src/components/challengeNav/ChallengeNavProvider.tsx`

| Export | Tipo | Props públicas | Dependências | Bloqueadores | Estratégia |
|---|---|---|---|---|---|
| `ChallengeNavProvider` (named) | stateful — `useNavChallengeState()`, `useMemo`×3, `useCallback`×3 | `ChallengeNavProviderProps`: `children: ReactNode`, `onNavigateChallenge?: () => void`, `onNavigateLesson?: () => void` | `lib/challengeNav` (reducer/ctx), tipo `TrackChallengeErrorReport` de `shared/ipc-contract` | É um provider puro — não renderiza UI | **decorator de contexto** (usar como wrapper das stories que consomem `useChallengeNav`) |

### 3.4 `app/src/components/chat/ChatBubble.tsx`

| Export | Tipo | Props públicas | Dependências | Bloqueadores | Estratégia |
|---|---|---|---|---|---|
| `ChatBubble` (named) | view pura — `useTranslation`, `useTheme`, `useReducedMotion` | `ChatBubbleProps`: `message: TutorChatMessage`, `isNew: boolean`, `tps?: number`, `skip?: boolean`, `previous?: TutorChatMessage`, `onRegenerate?: () => void`, `regenerateDisabled?: boolean`, `onViewLesson?: () => void`, `onRetryChallenge?: () => void`, `onStreamStart?/onStreamDone?/onStreamTick?: () => void` | MUI (`Box`, `Button`, `Typography`); `motion/react`; `lib/trackLessonState` (`formatChatTime`, `TutorChatMessage`); `lib/chatBubbleStyle` (`chatBubbleTone`, `groupsWithPrevious`, `isUserTone`); `lib/animationTokens.springs`; `TypewriterText`, `SegmentedMarkdown`, `chatSurfaces` (`ChatAvatar`, `bubbleRestShadow`, `bubbleShellStyle`); i18n `challenge.regenerateButton`, `challenge.retryButton`, `lesson.tutorName`, `lesson.viewLessonButton`, `lesson.youName` | Só `ThemeProvider` + i18n; precisa de fixture `TutorChatMessage` | **props diretas** (fixtures: mensagem tutor/user/error, `isNew` true/false, com/sem `previous` para agrupamento) |

### 3.5 `app/src/components/chat/chatSurfaces.tsx`

| Export | Tipo | Props públicas | Dependências | Bloqueadores | Estratégia |
|---|---|---|---|---|---|
| `ChatAvatar` (named) | view pura | inline: `isUser: boolean`, `label: string` | MUI `Avatar` + ícones (`AutoStories`, `Person`); `lib/designTokens.SHAPE`; tipo `ChatBubbleTone` | `ThemeProvider` | **props diretas** |

_Outros exports_ (helpers de estilo, bons para docs): `CHAT_AVATAR_SIZE = 26`, `USER_BUBBLE_TINT_PCT = 43`, `BUBBLE_FLAT_SHADOW`, `TUTOR_AVATAR_SURFACE`, `bubbleRestShadow(_theme?, _tone?)`, `bubbleRadius()`, `bubbleShellStyle(...)`.

### 3.6 `app/src/components/chat/SegmentedMarkdown.tsx`

| Export | Tipo | Props públicas | Dependências | Bloqueadores | Estratégia |
|---|---|---|---|---|---|
| `SegmentedMarkdown` (named) | view pura — `useMemo` | `SegmentedMarkdownProps`: `markdown: string`, `cut: number` | `lib/typewriterSegments.splitTypewriterSegments`; `components/markdown` (`CodeBlock`, `MarkdownView` → react-markdown + KaTeX) | Só tema/i18n transitivos do `CodeBlock` | **props diretas** (varrer `cut` de 0 a `markdown.length` para documentar o efeito de digitação) |

### 3.7 `app/src/components/chat/TypewriterText.tsx`

| Export | Tipo | Props públicas | Dependências | Bloqueadores | Estratégia |
|---|---|---|---|---|---|
| `TypewriterText` (named) | stateful — `useEffect` (relógio de digitação) + `useRef`×6 | inline: `text: string`, `active: boolean`, `tps?: number` (default 100), `instant?: boolean` (default false), `skip?: boolean` (default false), `onStart?: () => void`, `onDone?: () => void`, `onTick?: () => void`, `children: (partial: string, cut: number) => ReactNode` | `lib/trackLessonState` (`typewriterCut`, `skipSweepCut`, `typewriterDelayPerChar`, `SKIP_SWEEP_TICK_MS`); `lib/confetti.prefersReducedMotion` | Nenhum estrutural; depende de timers (story com `play`/args ou estado `instant`) | **props diretas** (render-prop `children` para ver o texto parcial) |

### 3.8 `app/src/components/chat/TypingIndicator.tsx`

| Export | Tipo | Props públicas | Dependências | Bloqueadores | Estratégia |
|---|---|---|---|---|---|
| `TypingIndicator` (named) | view pura — `useTranslation`, `useTheme`, `useReducedMotion` | nenhuma | `motion/react`; `lib/animationTokens.transitions`; `chatSurfaces` (`ChatAvatar`, `bubbleShellStyle`); i18n `lesson.tutorName`, `lesson.typingDots`, `lesson.typingIndicator` | `ThemeProvider` + i18n | **props diretas** (sem props) |

### 3.9 `app/src/components/cm/CodeMirrorField.tsx`

| Export | Tipo | Props públicas | Dependências | Bloqueadores | Estratégia |
|---|---|---|---|---|---|
| `CodeMirrorField` (named) | view pura com contexto MUI — `useColorScheme()`, `useMemo`, `useRef` (guarda o editor) | `CodeMirrorFieldProps`: `value: string`, `onChange: (value: string) => void`, `filename?: string`, `ariaLabel?: string`, `className?: string`, `minHeight?: string`, `readOnly?: boolean`, `onSave?: () => void` | `@uiw/react-codemirror`, `@uiw/codemirror-themes`, `@lezer/highlight`, `@codemirror/state` (`Prec`), `@codemirror/view` (`keymap`, `EditorView`); `lib/codeTheme` (temas claro/escuro); `./language` (`extensionsForFilename`) | `useColorScheme()` exige `ThemeProvider` do MUI com colorSchemes (`undefined` até ao mount); **altura**: sem `minHeight`/container com altura o editor colapsa | **props diretas** + decorator de tema; story variante `readOnly` e `onSave` (Ctrl/Cmd+S) |

_Outros exports_: `EditorPaneHandle`-like não; aqui só o componente e o tipo `CodeMirrorFieldProps`. Constantes internas `BASIC_SETUP`, `EDITOR_HEIGHT`.

### 3.10 `app/src/components/course/CourseSelector.tsx`

| Export | Tipo | Props públicas | Dependências | Bloqueadores | Estratégia |
|---|---|---|---|---|---|
| `CourseSelector` (default) | view pura | `CourseSelectorProps`: `courses: CourseItem[]`, `onContinue: (slug: string) => void`, `sectionLabel?: string`, `emptyLabel?: string` | MUI (`Box`, `Button`, `Card`, `CardContent`, `Stack`, `Typography`, ícones); `lib/lessonSelection.CourseItem`; `theme` (`effectsTransition`, `FOCUS_RING`, `focusRingStyles`, `spatialTransition`) | `ThemeProvider` | **props diretas** (com `courses: []` para o estado vazio) |

### 3.11 `app/src/components/course/LessonSidebarHeader.tsx`

| Export | Tipo | Props públicas | Dependências | Bloqueadores | Estratégia |
|---|---|---|---|---|---|
| `LessonSidebarHeader` (named) | view pura — `useId`, `useMemo`, `useTranslation` | `LessonSidebarHeaderProps`: `title: string`, `courseTitle?: string`, `summary: string`, `challengeCount: number`, `pendingChallengeCount: number`, `challengesExpanded: boolean`, `onChallengesClick: (anchor: HTMLButtonElement) => void`, `onSourcesClick: () => void`, `theoryProgress: number` (0–100), `sectionCurrent: number`, `sectionTotal: number`, `prerequisites: ReadonlyArray<{ slug: string; title: string }>`, `onPrerequisiteClick: (slug: string) => void` | MUI (`Badge`, `Box`, `Button`, `Chip`, `LinearProgress`, `Typography`, ícones); i18n `lesson.challengesButton`, `lesson.prerequisitesLabel`, `lesson.sourcesButton` + interpolação `{{current}}`/`{{total}}` | `ThemeProvider` + i18n | **props diretas** (0 desafios / com desafios / com pré-requisitos) |

### 3.12 `app/src/components/editor/EditorPane.tsx`

| Export | Tipo | Props públicas | Dependências | Bloqueadores | Estratégia |
|---|---|---|---|---|---|
| `EditorPane` (named, `forwardRef<EditorPaneHandle, EditorPaneProps>`) | stateful — `useReducer(editorTabsReducer)`, `useState(error)`, `useCallback`×12, `useImperativeHandle` | `EditorPaneProps`: `workspaceDir: string`, `files: WorkspaceFile[]`, `onFilesChanged?: () => void`. Handle: `openFile(path)`, `createFile(name)`, `deleteFile(path)`, `save(): Promise<boolean>` | **apiBridge**: `getApi().study.readWorkspaceFile`, `study.writeWorkspaceFile`, `study.deleteWorkspaceFile`; MUI (`Box`, `Alert`, `Button`, `Typography`); `CodeMirrorField`, `EditorTabs`; i18n `editor.createError`, `editor.deleteError`, `editor.editorAria`, `editor.openError`, `editor.opening`, `editor.save`, `editor.saveError`, `editor.saveShortcut`, `editor.selectFilePrompt` | **apiBridge obrigatório** (leitura/escrita de ficheiros em disco via IPC); `forwardRef` (story com ref via `useRef` na play/meta) | **mock de api** (`__setApiForTests` com `study.*` fake) |

_Outros exports_: re-exporta `type EditorTab` de `lib/editorTabs`; `EditorPaneHandle`, `EditorPaneProps`.

### 3.13 `app/src/components/editor/EditorTabs.tsx`

| Export | Tipo | Props públicas | Dependências | Bloqueadores | Estratégia |
|---|---|---|---|---|---|
| `EditorTabs` (named) | view pura — `useTranslation` | `EditorTabsProps extends EditorTabsCallbacks`: `tabs: EditorTab[]`, `activePath: string \| null`, `onActivate: (path: string) => void`, `onClose: (path: string) => void` | MUI (`Box`, `Chip`, `IconButton`, ícone `Close`); i18n `editor.openTabsAria`, `editor.unsaved` | `ThemeProvider` + i18n | **props diretas** (tabs com dirty/limpo) |

### 3.14 `app/src/components/editor/FileExplorer.tsx`

| Export | Tipo | Props públicas | Dependências | Bloqueadores | Estratégia |
|---|---|---|---|---|---|
| `FileExplorer` (named) | stateful — `useState` (dialog novo ficheiro: `newName`, `showNew`), `useMemo` | `FileExplorerProps extends FileExplorerCallbacks`: `files: WorkspaceFile[]`, `activePath: string \| null`, `onOpenFile(path)`, `onCreateFile(name)`, `onRefresh()`, `onDeleteFile(path)` | MUI (`Dialog*`, `List*`, `TextField`, `Tooltip`, etc.); `lib/editorFiles` (`buildTreeFromFiles`, `sortTree`, `FileTreeNode`); i18n `common.cancel`, `editor.create`, `editor.deleteFile`, `editor.newFile`, `editor.newFilePlaceholder`, `editor.refresh`, `editor.workspaceEmpty` | Só tema/i18n; diálogos MUI abrem por interação | **props diretas** (fixtures `WorkspaceFile[]` aninhados; interação nos diálogos de criar/apagar) |

_Outros exports_: `FileExplorerCallbacks`, `FileExplorerProps`; internos `NodeIcon`, `TreeNodeRow`.

### 3.15 `app/src/components/markdown/CodeBlock.tsx`

| Export | Tipo | Props públicas | Dependências | Bloqueadores | Estratégia |
|---|---|---|---|---|---|
| `CodeBlock` (named) | stateful — `useState` (`copied`, `copyFailed`), `useEffect` (timer `COPIED_HOLD_MS = 2000`), `useMemo`, `useCallback` | `CodeBlockProps`: `code: string`, `lang: string`, `visibleLines?: number` (`undefined` = todas as linhas) | MUI (`Box`, `Button`, `Typography`, ícones); `lib/copyToClipboard.copyTextToClipboard`; `lib/designTokens` (`SHAPE`, `TYPE`); `lib/typewriterSegments` (`codeFenceRole`); `./codeHighlight` (`codeLabelFor`, `highlightCodeLines`, `highlightOutputLines`, `CodeToken`); i18n `challenge.output`, `common.copiedCode`, `common.copyCode`, `common.copyFailed` | Clipboard API (tem fallback); resto: tema/i18n | **props diretas** (variar `lang`, `visibleLines` para o modo typewriter, papel output vs código) |

### 3.16 `app/src/components/markdown/MarkdownView.tsx`

| Export | Tipo | Props públicas | Dependências | Bloqueadores | Estratégia |
|---|---|---|---|---|---|
| `MarkdownView` (named) | view pura | `MarkdownViewProps`: `markdown: string` | `react-markdown`, `remark-gfm`, `unified` (types); `lib/lessonMarkdown` (`escapeLoneDollarSigns`, `katexRemarkPlugins`, `katexRehypePlugins` → **KaTeX**); `lib/codeTheme.CODE_TYPOGRAPHY`; `lib/designTokens.SHAPE`; `CodeBlock` | KaTeX precisa do CSS do KaTeX para `$…$` renderizar alinhado; tema MUI | **props diretas** (fixture com GFM, math, blocos de código) |

_Outros exports_: `MARKDOWN_COMPONENTS: Components` (mapa de componentes do react-markdown — útil para docs).

### 3.17 `app/src/components/quiz/QuizChatCard.tsx`

| Export | Tipo | Props públicas | Dependências | Bloqueadores | Estratégia |
|---|---|---|---|---|---|
| `QuizChatCard` (named) | view pura — `useMemo`, `useTranslation` | `QuizChatCardProps`: `quizKey: string`, `status: QuizOverlayStatus`, `onScreen: boolean`, `question: string`, `generation: number`, `notice: string \| null`, `onOpen: () => void`, `onRetry: (() => void) \| null`, `onReopen: (() => void) \| null` | MUI (`Button`, `Stack`, `Typography`, ícones); `motion/react`; `lib/animationTokens.springs`; `components/quiz/quizOverlayContent` (`QUIZ_CARD_ANCHOR_ATTR`, `QuizOverlayStatus`); i18n `lesson.quizChatAnswer`, `lesson.quizChatExplaining`, `lesson.quizChatGenerating`, `lesson.quizChatMastered`, `lesson.quizChatOnScreen`, `lesson.quizChatQueued`, `lesson.quizChatReopen`, `lesson.quizChatRetry`, `lesson.quizChatUnavailable`, `lesson.quizChatWaiting`, `lesson.quizTitle` | Só tema/i18n | **props diretas** (percorrer os `QuizOverlayStatus` — bom candidato a story com `argTypes`/controls) |

### 3.18 `app/src/components/quiz/QuizOverlayHost.tsx`

| Export | Tipo | Props públicas | Dependências | Bloqueadores | Estratégia |
|---|---|---|---|---|---|
| `QuizOverlayHost` (named) | stateful — `useSyncExternalStore`×2 (overlay + conteúdo), `useEffect`×2 (focus trap, escuta), `useMemo`, `useCallback` | nenhuma (auto-contido) | MUI (`Box`, `Button`, `Stack`, `Typography`, `useTheme`); `motion/react` (`AnimatePresence`, `motion`, `useReducedMotion`); `lib/quizOverlayState` (`subscribeQuizOverlay`, `peekQuizOverlay`); `components/quiz/quizOverlayContent`; `lib/animationTokens` (`springs`, `windowVariants`); `lib/designTokens.SHAPE`; `theme.modalSurfaceStyles`; `views/LessonView/LessonQuiz.LessonQuizCard`; i18n `lesson.quizOverlayAria`, `lesson.quizOverlayHint`, `lesson.quizOverlayMinimize`, `lesson.quizOverlayTitle`, `lesson.quizChatReopen`, `lesson.quizChatRetry` | **Estado vive fora do React** (store de módulo): sem `openQuizOverlay(ctx)` não há overlay; o conteúdo vem de `quizOverlayContent`; focus trap próprio | **seed de store** (`openQuizOverlay`/`applyQuizOverlayStep` + `__resetQuizOverlayForTests`) num decorator — não há props para controlar |

_Outros exports_: `FocusReturnNode`, `FocusReturnAnchor`, `focusReturnTarget()` (ancoragem de devolução de foco — ONDA 13).

### 3.19 `app/src/components/sessionState/SessionStateProvider.tsx`

| Export | Tipo | Props públicas | Dependências | Bloqueadores | Estratégia |
|---|---|---|---|---|---|
| `SessionStateProvider` (named **e** default) | stateful — `useSessionStateMachine(clock, initial)` | `SessionStateProviderProps`: `children: ReactNode`, `clock?: SessionClock`, `initial?: SessionSnapshot` | `lib/sessionState` (`SessionStateCtx`, `SessionSnapshot`, `SessionClock`) | Provider puro; em produção o snapshot nasce vazio (`INITIAL_SESSION`) | **decorator de contexto** (fornecer `initial` determinístico às stories de `SessionFrame`/`GlobalBusyIndicator`/`LessonView`) |

### 3.20 `app/src/components/shell/GlobalBusyIndicator.tsx`

| Export | Tipo | Props públicas | Dependências | Bloqueadores | Estratégia |
|---|---|---|---|---|---|
| `GlobalBusyIndicator` (default) | stateful — `useSessionState()` (contexto) | nenhuma | MUI (`Box`, `Typography`); `lib/sessionState` (`sessionBusyLabelKey`, `useSessionState`); `lib/designTokens.SHAPE`; `theme.effectsTransition`; i18n dinâmica `t(\`translation:${labelKey}\`)` com `labelKey = sessionBusyLabelKey(reason)` → chaves `lesson.busy.*` | Sem `SessionStateProvider` com `busy` ativo renderiza `null` | **decorator de contexto** (`SessionStateProvider` com snapshot `busy`) |

### 3.21 `app/src/components/shell/NavigationRail.tsx`

| Export | Tipo | Props públicas | Dependências | Bloqueadores | Estratégia |
|---|---|---|---|---|---|
| `NavigationRail` (default) | view pura — `useTranslation` | `NavigationRailProps`: `active: PanelKey`, `onChange: (key: NavKey) => void` | MUI (`Tab`, `Tabs`, `Tooltip`, ícones); `lib/shellNav` (`NAV_ITEMS`, `navIndexOf`, `navPanelId`, `navTabId`); `lib/designTokens.SHAPE`; `theme` (`effectsTransition`, `FOCUS_RING`, `focusRingStyles`, `spatialTransition`); i18n `shell.rail.aria` | `ThemeProvider` + i18n | **props diretas** (variar `active` incluindo `'challenge'` — o painel "fantasma" sem tab selecionada) |

### 3.22 `app/src/components/shell/SessionFrame.tsx`

| Export | Tipo | Props públicas | Dependências | Bloqueadores | Estratégia |
|---|---|---|---|---|---|
| `SessionFrame` (default) | stateful — `useSessionState()` (contexto) | `SessionFrameProps`: `basisPx: number`, `animateBasis: boolean`, `slotRef: (el: HTMLElement \| null) => void` | MUI (`AppBar`, `Box`, `Divider`, `Typography`); `lib/sessionState` (`sessionPhaseLabelKey`); `lib/splitRatio` (`SHELL_SIDEBAR_PANE_ID`, `SPLIT_MOTION`); `lib/designTokens.SHAPE`; `theme.effectsTransition`; monta `ThemeModeSelector`, `LanguageSwitcher`, `TutorialHelpButton` e o slot `SHELL_SIDEBAR_SLOT_ID`; i18n `app.title`, `shell.session.aria`, `shell.session.idle`, `shell.session.noSubject`, `shell.session.phase`, `shell.session.subject` + dinâmica `translation:${phaseKey}` | Consome `SessionStateCtx`; `slotRef` espera um container real; filhos falam com i18n/onboarding | **decorator de contexto** (`SessionStateProvider` + container para `slotRef`) |

_Outros exports_: interno `SessionField` (linha 110).

### 3.23 `app/src/components/shell/ShellSidebarSlot.tsx`

| Export | Tipo | Props públicas | Dependências | Bloqueadores | Estratégia |
|---|---|---|---|---|---|
| `ShellSidebarPortal` (named) | stateful — `useShellSidebarSlot()` (contexto) + `createPortal` | `{ children: ReactNode }` | `react-dom.createPortal`; `ShellSidebarSlotContext` | **Sem slot (`null`) renderiza `null`** — precisa de um elemento com `id="shell-sidebar-view-slot"` no DOM e do provider | **decorator de contexto** (fornecer o elemento do slot via `ShellSidebarSlotContext.Provider`) |

_Outros exports_: `SHELL_SIDEBAR_SLOT_ID = 'shell-sidebar-view-slot'`, `ShellSidebarSlotContext`, `useShellSidebarSlot()`.

### 3.24 `app/src/components/shell/SplitDivider.tsx`

| Export | Tipo | Props públicas | Dependências | Bloqueadores | Estratégia |
|---|---|---|---|---|---|
| `SplitDivider` (default) | stateful — `useState(dragging)`, `useCallback`×4 (pointer events, teclado) | `SplitDividerProps` (tudo readonly): `ratio: number`, `containerPx: number`, `constraints: SplitConstraints`, `onRatioChange: (ratio: number) => void`, `onDragStart?: () => void`, `onDragEnd?: () => void`, `ariaLabel: string`, `hint?: string`, `hintId: string`, `controlsIds: readonly [string, string]`, `dividerId: string` | MUI (`Box`, `Typography`); `lib/designTokens.SHAPE`; `theme` (`FOCUS_RING`, `focusRingStyles`); `lib/splitRatio.SplitConstraints` | Nenhum estrutural; interação por pointer/teclado (story com `play`) | **props diretas** (bom candidato a story de interação: arraste e setas) |

### 3.25 `app/src/components/terminal/AnswerTerminal.tsx`

| Export | Tipo | Props públicas | Dependências | Bloqueadores | Estratégia |
|---|---|---|---|---|---|
| `AnswerTerminal` (named, `forwardRef<AnswerTerminalHandle>`) | stateful — `useEffect`×3 (cria/destroi instância xterm, resize), `useRef`×2, `useImperativeHandle`, `useColorScheme` | `AnswerTerminalProps`: `'aria-label'?: string` (interface não exportada). Handle: `writeLine(text, color?: AnswerTerminalColor)`, `clear()`, `autoFit()` | `@xterm/xterm` (`Terminal`), `@xterm/addon-fit` (`FitAddon`); MUI `Paper`, `useColorScheme`; `lib/codeTheme.terminalColors`; `lib/terminalBanner` (`buildTestBannerLines`) | Instância xterm real criada em `useEffect` (precisa de container com tamanho); `useColorScheme` exige tema MUI; `forwardRef` | **props diretas** + decorator de tema; usar o handle (via `useRef` na story) para chamar `writeLine` |

_Outros exports_: `AnswerTerminalColor` (= `TerminalColorName`), `AnswerTerminalHandle`, `printTestBanner(...)`.

### 3.26 `app/src/components/theme/ThemeModeSelector.tsx`

| Export | Tipo | Props públicas | Dependências | Bloqueadores | Estratégia |
|---|---|---|---|---|---|
| `ThemeModeSelector` (default) | stateful — `useColorScheme()` (`mode`, `setMode`) | `ThemeModeSelectorProps`: `variant?: 'full' \| 'compact'` | MUI (`ToggleButton`, `ToggleButtonGroup`, `Tooltip`, ícones); `components/theme/themeModeState` (`THEME_MODE_I18N_KEY`, `ThemeMode`); i18n `theme.mode.toggle` | `useColorScheme()` exige `ThemeProvider` do MUI (com colorSchemes) | **decorator de tema** (story nos 3 modos: `light`/`system`/`dark` e nos 2 variantes) |

### 3.27 `app/src/components/tree/EvolutionTree.tsx`

| Export | Tipo | Props públicas | Dependências | Bloqueadores | Estratégia |
|---|---|---|---|---|---|
| `EvolutionTree` (default) | view pura na raiz (os `TreeNode` internos têm `useState(open)`) | `EvolutionTreeProps`: `nodes: TreeViewNode[]`, `onSelectLesson: (lessonId: string) => void`, `title?: string`, `collapsed?: boolean`, `stateLabels?: TreeStateLabels`, `emptyLabel?: string` | MUI (`Box`, `Button`, `Chip`, `Collapse`, `Stack`, `Typography`, ícones); `lib/levels.DifficultyLevel`; `lib/treeView.TreeViewNode`; `theme` (`effectsTransition`, `FOCUS_RING`, `focusRingStyles`, `spatialTransition`) | Nenhum (rótulos default em pt-BR hardcoded) | **props diretas** (árvore com 3 níveis de profundidade; variante `collapsed`) |

_Outros exports_: `TreeStateLabels`; internos `LevelBadge`, `TreeNode` (stateful — candidatos a extrair).

### 3.28 `app/src/components/voice/MicButton.tsx`

| Export | Tipo | Props públicas | Dependências | Bloqueadores | Estratégia |
|---|---|---|---|---|---|
| `MicButton` (named) | stateful — `useMicSTT(lang)`, `useState(lang)`, `useMemo` | `MicButtonOptions` (argumento de função, não JSX-props): `ariaLabel?: string`, `locale?: 'pt-BR' \| 'en'`, `onTranscribed?: (text: string) => void`, `onError?: (err: string) => void` | `hooks/useMicSTT` → **apiBridge**: `getApi().stt.onStreamPartial`, `stt.onEngineStatus`, `stt.streamStart`, `stt.streamChunk`, `stt.streamStop`, `stt.streamCancel` + `navigator.mediaDevices.getUserMedia` | **apiBridge + permissão de microfone** (STT real em main); HTML nativo inline (sem MUI) | **mock de api** (fake de `stt.*` com eventos simulados) |

### 3.29 `app/src/components/voice/SpeakButton.tsx`

| Export | Tipo | Props públicas | Dependências | Bloqueadores | Estratégia |
|---|---|---|---|---|---|
| `SpeakButton` (named) | stateful — `useState(speaking)`, `useMemo`, `useRef` (áudio) | `SpeakButtonOptions` (argumento de função): `text: string`, `locale?: 'pt-BR' \| 'en'`, `speed?: number` (0.5–2.0), `ariaLabel?: string`, `onPlaybackEnd?: () => void` | **apiBridge**: `getApi().localTts.generate`, `localTts.cancelGenerate` (TTS Piper em main) | **apiBridge** + reprodução de áudio real | **mock de api** (fake de `localTts.*` devolvendo blob/URL vazio) |

### 3.30 `app/src/features/onboarding/components/OnboardingOverlay.tsx`

| Export | Tipo | Props públicas | Dependências | Bloqueadores | Estratégia |
|---|---|---|---|---|---|
| `OnboardingOverlay` (named) | stateful — `useState`×2 (`spotlightReady`, `panelVisible`), `useEffect`×8, `useLayoutEffect`, `useMemo`×4, `useCallback`×5 | `OnboardingOverlayProps`: `isVisible: boolean`, `currentStep: OnboardingStepDefinition`, `currentStepIndex: number`, `totalSteps: number`, `currentChapterIndex: number`, `totalChapters: number`, `currentChapterTitleKey: string`, `isLastStep: boolean`, `isActionSatisfied: boolean`, `canAdvance: boolean`, `isStepTransitioning: boolean`, `activeView?: PanelKey`, `isAudioMuted?: boolean`, `onToggleMute?: () => void`, `onNext: () => void`, `onSkip: () => void`, `onPause: () => void` | `react-dom.createPortal` (para `document.body`); MUI (`Box`, `Button`, `Paper`, `Stack`, `Typography`, `useTheme`); `./OnboardingOverlay.module.css` (CSS module); `constants/onboardingSteps.ONBOARDING_CHAPTERS`; i18n `tutorial.audio.mute`, `tutorial.audio.unmute`, `tutorial.confirm.cancel`, `tutorial.controls.close`, `tutorial.controls.finishTutorial`, `tutorial.controls.next`, `tutorial.controls.skipTutorial`, `tutorial.nav.goToTab`, `tutorial.progress.chapter`, `tutorial.progress.step`, `tutorial.status.readyToContinue`, `tutorial.status.waitingForAction` + chaves dinâmicas dos passos | **Portal + spotlight sobre DOM real**: mede alvos `[data-onboarding-*]` com `getBoundingClientRect`, reposiciona em resize/scroll (8 efeitos); sem alvos no DOM o spotlight não aparece | **props diretas** + fixture de DOM-alvo (decorator que injeta `div data-onboarding-target`); ou **extrair hook** de posicionamento (`onboardingPositioning.utils` já é puro) |

_Outros exports_: `OnboardingOverlayProps`; constantes internas `SPOTLIGHT_PADDING`, `SPOTLIGHT_RADIUS`, `FOCUSABLE`, ids de título, `NAV_TAB_KEY`, `RESPONSIVE_CLASS`.

### 3.31 `app/src/features/onboarding/components/TutorialHelpButton.tsx`

| Export | Tipo | Props públicas | Dependências | Bloqueadores | Estratégia |
|---|---|---|---|---|---|
| `TutorialHelpButton` (named **e** default) | view pura — `useTranslation` | nenhuma | MUI (`IconButton`, `Tooltip`, ícone `HelpRounded`); `services/tutorialLauncher.service` (pub/sub do tutorial); i18n `tutorial.helpButton.label` | Dispara `tutorialLauncherService` (sem listener é no-op) | **decorator de contexto** (registar listener do `tutorialLauncherService` na story para captar o evento) |

### 3.32 `app/src/features/onboarding/components/TutorialSelectionModal.tsx`

| Export | Tipo | Props públicas | Dependências | Bloqueadores | Estratégia |
|---|---|---|---|---|---|
| `TutorialSelectionModal` (named) | stateful — `createPortal`, `useEffect` (focus/esc), `useCallback` | `TutorialSelectionModalProps`: `isOpen: boolean`, `onClose: () => void`, `onSelectTutorial: (tutorialId: OnboardingTutorialId) => void`, `hasKeys: boolean`, `onOpenSettings: () => void` | MUI (`Box`, `Button`, `IconButton`, `Paper`, `Stack`, `Typography`, `useTheme`, ícones); `./tutorialSelectionHelpers.createOpenSettingsHandler`; i18n `tutorial.selection.*` (12 chaves) + `t('tutorial.*')` | Portal para `document.body`; foco/ESC próprios | **props diretas** (variantes `hasKeys: true/false`) |

### 3.33 `app/src/features/onboarding/OnboardingHost.tsx`

| Export | Tipo | Props públicas | Dependências | Bloqueadores | Estratégia |
|---|---|---|---|---|---|
| `OnboardingHost` (named) | stateful — `useOnboarding()` (máquina do tutorial), `useState`×2, `useEffect`×2, `useFirstRunTutorialPrompt`, `useHelpHint`, `useContext(OnboardingController)` | `OnboardingHostProps`: `isReady: boolean`, `activeView?: PanelKey`, `onNavigateView?: (view: PanelKey) => void` | **apiBridge**: `getApi().keys.getStatus()` (gate do Tour completo); `services/onboardingStorage.service` (**localStorage** `study-method-onboarding-*`); `services/onboardingAudio.service` (narração); `OnboardingOverlay`, `TutorialSelectionModal`; i18n transitiva | apiBridge + localStorage + áudio de narração + DOM-alvo do overlay; lógica de sinais (`onboardingSignals`, `evaluateStepAction`) | **mock de api** + decorator (ou **extrair hook** `useOnboarding` para stories dos passos) |

_Outros exports_: `useOnboardingController()`, `OnboardingHostProps` (o valor do contexto: `openFromHelp`, `openTutorialSelection`, `progress`).

### 3.34 `app/src/gate/AppGate.tsx`

| Export | Tipo | Props públicas | Dependências | Bloqueadores | Estratégia |
|---|---|---|---|---|---|
| `OfflineBanner` (named) | stateful — `useStartup()` (contexto) | nenhuma | MUI (`Alert`, `Button`, `Box`); i18n `gate.offline`, `gate.offlineTip`, `gate.tryAgain` | Precisa de `StartupCtx` com `flags` offline (default renderiza vazio) | **decorator de contexto** |
| `AppGate` (named) | stateful — `useEffect` (startup check), `useCallback`×2, `useMemo` | nenhuma | **apiBridge**: `getApi().keys.startupStatus()` (via cast `KeysWithStartupStatus`); `lib/ipcTimeout` (`IPC_TIMEOUT_MS`, `withTimeout`, `isTimeoutError`); `gate/startupState` (`applyOfflineFlags`, `StartupFlags`); monta `App`, `SetupView`; i18n `gate.checking`, `gate.readError`, `gate.startupTimeout`, `gate.tryAgain`, `common.error` | apiBridge + timeouts IPC; orquestra `App` inteiro quando o gate resolve | **mock de api** (fake de `keys.startupStatus`) — story do splash, do erro de gate e do banner offline separadas |

_Outros exports_: `StartupCtx`, `useStartup()`, `StartupContextValue`; internos `Splash`, `GateError`.

### 3.35 `app/src/gate/SetupView.tsx`

| Export | Tipo | Props públicas | Dependências | Bloqueadores | Estratégia |
|---|---|---|---|---|---|
| `SetupView` (named) | stateful — `useState`×2 (`saving`, `validationFailed`), `useEffect` | inline: `onDone: () => void \| Promise<void>`, `startupStatus?: StartupStatus \| null` | **apiBridge**: `getApi().keys.setKey`, `keys.validateLlm`, `keys.validateBrave`; MUI (formulário completo: `TextField`, `InputAdornment`, `Alert`, `Paper`…); `shared/llm/constants.OPENROUTER_KEY_PREFIX`; `lib/validationMessages.humanizeValidationError`; `LanguageSwitcher`; i18n `gate.invalidKeys`, `gate.title`, `gate.validateBothKeys`, `keys.*` (show/hide/save/validate/valid/errors) | apiBridge (validação assíncrona + timeout próprio `VALIDATE_TIMEOUT_MS`) | **mock de api** (fake de `keys.*` com validação ok/erro/timeout) |

### 3.36 `app/src/i18n/LanguageSwitcher.tsx`

| Export | Tipo | Props públicas | Dependências | Bloqueadores | Estratégia |
|---|---|---|---|---|---|
| `LanguageSwitcher` (default) | stateful — `useState` (menu), `useEffect` (sincroniza com `i18n`) | `LanguageSwitcherProps` (interface não exportada): `variant?: 'menu' \| 'select'` (default `'menu'`) | MUI (`IconButton`, `Menu`, `MenuItem`, `Select`, `Tooltip`); `react-i18next` (`i18n.changeLanguage`); persistência em `localStorage['app-language']` feita por `lib/i18n` (não pelo componente) | Precisa da instância i18n inicializada (`initI18n` de `main.tsx`) | **decorator de i18n** (global decorator do Storybook com `initI18n()`) |

_Outros exports_: internos `FlagLabel`, `MenuSwitcher`.

### 3.37 `app/src/views/ChallengeView/ChallengeView.tsx`

| Export | Tipo | Props públicas | Dependências | Bloqueadores | Estratégia |
|---|---|---|---|---|---|
| `ChallengeView` (default) | stateful — `useState`×8, `useEffect`×7, `useCallback`×8, `useRef`×6 (inclui `runSeqRef`, `testInFlightRef`), `useMemo`×2, `useChallengeNav()` | `ViewProps` (de `views/placeholders`): `setupsDir?: string`, `onNavigate?: (key: NavKey) => void` | **apiBridge**: `study.listChallenges`, `study.listWorkspaceFiles`, `study.readWorkspaceFile`, `study.markChallengeAttempt`, `study.testAnswer`, `study.onTestAnswerEvent` (stream de eventos), `settings.get`, `localAi.getActive`, `localAi.chat`, `pi.execute`, `pi.onStreamEvent`, `pi.abort`; `lib/feedbackProvider`/`feedbackProviderUi`; `lib/testAnswerEvents`; `lib/answerFlow`; `lib/confetti` (`fireConfetti`, `announceStatus`); `TrackChallengePanel`, `FileExplorer`, `EditorPane`, `AnswerTerminal`, `printTestBanner`, `MarkdownView`, `lib/codeTheme.CODE_TYPOGRAPHY`; `useChallengeNav`; i18n `challenge.*` (40 chaves) + `common.loading`, `common.tryAgain`, `nav.challenge` | **apiBridge pesado** (12 métodos + 2 streams de eventos + abort); orquestra xterm + CodeMirror + relógio de estrelas + confetti; `useChallengeNav` | **mock de api** (fake de `study.*`/`pi.*` com eventos) — provavelmente o candidato a **extrair hook** (o corpo tem `loadChallenges`, `loadWorkspace`, `runTests`, `runPi` como callbacks) |

### 3.38 `app/src/views/ChallengeView/TrackChallengePanel.tsx`

| Export | Tipo | Props públicas | Dependências | Bloqueadores | Estratégia |
|---|---|---|---|---|---|
| `TrackChallengePanel` (named) | stateful — `useState`×7, `useEffect`×6, `useCallback`×7, `useRef`×2, `useSyncExternalStore`, `useMemo`, `useChallengeNav()` | inline: `selection: TrackChallengeNavSelection` (`trackSlug`, `target: 'lesson' \| 'proficiency' \| 'module'`, `lessonId?`, `moduleSlug?`, `challengeId`, `title?`, `attemptedBeforeLesson?`), `onNavigate?: (key: NavKey) => void` | **apiBridge**: `track.get`, `track.challenge`, `track.challengeSubmit`, `track.challengeRegenerate`, `track.proficiency`; `lib/challengeStars` (`createStarTracker`, `formatClock`, `StarTracker`); `lib/challengeDraftCache` (rascunho em memória); `lib/pendingSubject.setPendingTrackLesson`; `lib/confetti.fireConfetti`; `lib/trackLessonState.buildErrorReport`; `CodeMirrorField`, `MarkdownView`; `useChallengeNav`; i18n `challenge.*` (22 chaves) + `common.*`, `lesson.viewLessonButton` | apiBridge (5 métodos) + `ChallengeNavCtx` (a seleção vem do contexto/nav) + relógio de estrelas com ticks + store de rascunho | **mock de api** + **decorator de contexto** (`ChallengeNavProvider` com seleção seedada) |

_Outros exports_ (helpers puros — ótimos para stories de lógica): `ChallengeVerdict`, `shouldMarkAbandon()`, `ChallengeDraftSnapshot`, `normalizeDraftForResume()`, `ChallengeRetryPlan`, `planChallengeRetry()`, `persistDraftOnUnmount()`, `restoreStarTracker()`.

### 3.39 `app/src/views/GamesView/GameLevelView.tsx`

| Export | Tipo | Props públicas | Dependências | Bloqueadores | Estratégia |
|---|---|---|---|---|---|
| `GameLangSelector` (named) | view pura | `GameLangSelectorProps`: `value: GameLang`, `onChange: (lang: GameLang) => void` | MUI (`ToggleButton`, `ToggleButtonGroup`); i18n `games.lang.aria` | Tema/i18n | **props diretas** |
| `GameLevelPanel` (named) | view pura — só `useTranslation`/`useMemo` | `GameLevelPanelProps`: `worldTitle: string`, `levelTitle: string`, `levelIndex: number` (1-based), `boss: boolean`, `lang: GameLang`, `onLangChange`, `enunciado: string`, `code: string`, `onCodeChange: (code: string) => void`, `optimize: GameLevelPayload['optimize']`, `busy: boolean`, `runResult: GameRunResult \| null`, `runError: string \| null`, `nextLevelId: string \| null`, `onBack`, `onTest`, `onAdvance: (levelId: string) => void`, `locale: string` | MUI (vários), `CodeMirrorField`, `lib/designTokens.SHAPE`; i18n `challenge.testAnswer`, `games.level.casesEmpty`, `games.level.completedBanner`, `games.level.enunciado` + `games.level.*`/`games.opt.*` via `tI` (helpers internos `OptimizationPanel`, `CaseList`, `GameLevelHeader`) | Tema/i18n + CodeMirror (contexto de tema) | **props diretas** (controlado — ideal para estados de run: null/ok/falha/erro) |
| `GameLevelView` (default) | stateful — `useState`×4, `useRef`, `useEffect`, `useCallback` | `GameLevelViewProps`: `worldId: string`, `worldTitle: string`, `levelId: string`, `levelTitle: string`, `levelIndex: number`, `boss: boolean`, `lang: GameLang`, `onLangChange`, `nextLevelId: string \| null`, `onBack`, `onAdvance: (levelId: string) => void` | **apiBridge** via `gamesApi.getGamesApi()`: `games.loadLevel`, `games.run`; `CodeMirrorField`; i18n `games.level.loading`, `games.level.loadError`, `games.level.runError`, `games.loadError`, `games.loadTimeout`, `common.tryAgain` | apiBridge (carga do nível + submissão) | **mock de api** (fake de `games.loadLevel`/`games.run`) |

_Outros exports_: `GameLangSelectorProps`, `GameLevelPanelProps`, `GameLevelViewProps`; internos `CaseMark`, `CaseValue`, `OptimizationPanel`, `CaseList`, `GameLevelHeader`.

### 3.40 `app/src/views/GamesView/GamesView.tsx`

| Export | Tipo | Props públicas | Dependências | Bloqueadores | Estratégia |
|---|---|---|---|---|---|
| `GameLevelNodeRow` (named) | view pura | `GameLevelNodeRowProps`: `levels: ReadonlyArray<GameLevelSummary>`, `openIndex: number`, `worldTitle: string` | MUI (`Box`, `Chip`, `LinearProgress`, `Typography`), `lib/designTokens.SHAPE`; sem i18n direta | Tema | **props diretas** |
| `GamesMap` (named) | view pura | `GamesMapProps`: `world: GameWorldSummary`, `lang: GameLang`, `onLangChange`, `previews: Record<string, GameLevelPayload \| undefined>`, `onPlay: (level: GameLevelSummary, index: number) => void`, `locale: string` | MUI; `GameLevelNodeRow`; i18n `games.map.introduces` | Tema/i18n | **props diretas** |
| `GamesScreen` (named) | view pura | `GamesScreenProps`: `status: GamesScreenStatus` (`'loading' \| 'error' \| 'empty' \| 'ok'`), `errorText: string \| null`, `onRetry: () => void`, `worlds: GameWorldSummary[]`, `lang: GameLang`, `onLangChange`, `previews: Record<string, GameLevelPayload \| undefined>`, `onPlay: (world, level, index) => void`, `locale: string` | MUI; `GamesMap`; i18n `games.title`, `games.loading`, `games.empty.title`, `games.empty.body`, `games.loadError`, `games.world.langHint`, `common.tryAgain` | Tema/i18n | **props diretas** (percorrer os 4 `GamesScreenStatus`) |
| `GamesView` (default) | stateful — `useState`, `useEffect`×2, `useCallback`×3 | nenhuma | **apiBridge** via `getGamesApi()`: `games.listWorlds`, `games.loadLevel` (previews); `lib/ipcTimeout` (`IPC_TIMEOUT_MS`, `withTimeout`); `GameLevelView`, `GameLangSelector`; i18n `games.loadError`, `games.loadTimeout` | apiBridge + timeouts IPC | **mock de api** |

_Outros exports_: `GamesScreenStatus`, `GamesScreenProps`, `GamesMapProps`, `GameLevelNodeRowProps`; internos `STATE_I18N_KEY`, `SR_ONLY`, `NODE_PX`.

### 3.41 `app/src/views/LessonView/LessonQuiz.tsx`

| Export | Tipo | Props públicas | Dependências | Bloqueadores | Estratégia |
|---|---|---|---|---|---|
| `LessonQuizCard` (named) | view pura — `useMemo`, `useTheme`, `useReducedMotion` | `LessonQuizCardProps`: `assertion: TrackAssertionDto`, `quiz: QuizState \| undefined`, `onSelect: (answerIndex: number) => void` | MUI (`Box`, `Button`, `Stack`, `Typography`, `useTheme`, ícones); `motion/react` (`fadeInUp`, `springs` de `animationTokens`); `lib/trackLessonState` (`optionVisualState`, `quizCycleOf`, `quizKeyFor`, `QuizState`); `lib/quizOptionOrder.quizOptionOrder` (ordem determinística por sessão); i18n `lesson.quizTitle`, `lesson.quizCorrect`, `lesson.quizWrong`, `lesson.quizFeedback` | Tema/i18n; `quizOptionOrder` mistura as opções por chave (fixtures devem usar chaves estáveis) | **props diretas** (estados: por responder / certa / errada) |

### 3.42 `app/src/views/LessonView/LessonView.tsx`

| Export | Tipo | Props públicas | Dependências | Bloqueadores | Estratégia |
|---|---|---|---|---|---|
| `LessonComposer` (named) | view pura (totalmente controlado) | `LessonComposerProps`: `draft: string`, `onDraftChange: (value: string) => void`, `onSend: () => void`, `onMicToggle: () => void`, `micTranscribing: boolean`, `disabled: boolean`, `showAdvance: boolean`, `advanceLocked: boolean`, `advanceDisabled: boolean`, `onAdvance: () => void`, `advanceTooltip: string`, `advanceLabel?: string` | MUI (`TextField`/`Button`/ícones); i18n `lesson.advanceButton`, `lesson.askSend`, `lesson.micStart`, `lesson.micStop` | Tema/i18n | **props diretas** (matriz dos estados do avanço: locked/disabled/label) |
| `LessonActionRow` (named) | view pura | `LessonActionRowProps`: `step: LessonActionStep`, `busy: boolean`, `generateRunning: boolean`, `quizCardOnScreen: boolean`, `pendingQuizCount: number`, `pendingChallengeCount: number`, `onFinish: () => void`, `onChallenge: (anchor: HTMLButtonElement) => void`, `onNextLesson: () => void`, `onRegenerate: () => void` | MUI; i18n `lesson.challengeStepButton`, `lesson.finishBlockedTooltip`, `lesson.finishButton`, `lesson.generateNewChallenge`, `lesson.nextLessonButton` + frases por `step` | Tema/i18n | **props diretas** (percorrer `LessonActionStep`) |
| `LessonSourceViewer` (named) | stateful (leve) — `useRef` + `useEffect` (foco no fechar) | `LessonSourceViewerProps`: `source: { title: string; url: string; description?: string }`, `onClose: () => void`, `openExternalHref: string` | MUI; `lib/sourceTitle`; sem i18n direta (usa helpers do ficheiro) | Tema | **props diretas** |
| `LessonView` (named) | stateful — `useState`×4, `useEffect`×19, `useCallback`×28, `useMemo`×16, `useRef`×13, `useSyncExternalStore`×2, `useSessionState()`, `useChallengeNav()`, `useMicSTT()` | `ViewProps`: `setupsDir?: string`, `onNavigate?: (key: NavKey) => void` | **apiBridge**: `track.lesson`, `track.lessonDone`, `track.tutorChat`, `track.quizAttempt`, `track.quizExplain`, `track.quizHistory`, `track.quizRemedial`, `track.challengeRegenerate`; `lib/lastLesson` (`peekLastLesson`/`saveLastLesson`), `lib/lessonPrefetch.prefetchLesson`; `QuizChatCard` + `quizOverlayBridge` (`overlayContextFor`, `overlayStatusFor`, `quizCycleTag`); `ShellSidebarPortal` + `LessonSidebarHeader`; `ChatBubble`, `TypingIndicator`, `LessonQuizCard`; `lib/confetti`; `motion/react`; `useMicSTT` (→ `getApi().stt.*`); i18n `lesson.*` (48 chaves) + `common.*` | **apiBridge** (8 métodos), `SessionStateCtx`, `ChallengeNavCtx`, `ShellSidebarPortal` (slot), store do overlay de quiz, microfone, portal em `LessonView` (linha 4458) | **mock de api** + **extrair hook** (a lógica de chat/quiz/desafio está toda no corpo; `LessonComposer`/`LessonActionRow`/`LessonSourceViewer` já estão extraídos e são a parte story-friendly) |

_Outros exports_ (helpers puros, candidatos a stories de lógica): `LESSON_COLUMN_SX`, `lessonLogSx()`, `LessonActionStep`, `LessonActionStepInput`, `lessonActionStep()`, `challengeOpenBlockedByQuiz()`, `ChallengeBadgeInput`, `challengeBadgeCount()`, `nextClickAction()`, `lessonActionStatusKey()`, `QUIZ_VERDICT_MS = 1600`, `pinLogToBottom()`, `nudgeLogToBottom()`.

### 3.43 `app/src/views/placeholders.tsx` (Home)

| Export | Tipo | Props públicas | Dependências | Bloqueadores | Estratégia |
|---|---|---|---|---|---|
| `HomeView` (named) | stateful — `useState`, `useEffect`×4, `useCallback`×2, `useMemo`, `useTranslation` | `ViewProps`: `setupsDir?: string`, `onNavigate?: (key: NavKey) => void` | **apiBridge**: `keys.getStatus`, `study.listTopics`, `track.list`, `track.orphans`; `lib/lastLesson.peekLastLesson`; `lib/pendingSubject.setPendingTrackSlug`; MUI (`Stepper`, `Card`, `Container`, `LinearProgress`…); i18n `home.*` (27 chaves) + `common.tryAgain` | apiBridge (4 métodos) | **mock de api** (fake de `keys.*`/`study.*`/`track.*`) |

_Outros exports_: `ViewProps` (contrato de todas as views), `SubjectPick`; internos stateful `TracksSection` (`useState` de tracks — extrair para story própria), `SetupStatusCard`, `SubjectCard`, `SubjectSections`, `TrackProgressBadge`, `HomeSteps`.

### 3.44 `app/src/views/RoadmapView/RoadmapView.tsx`

| Export | Tipo | Props públicas | Dependências | Bloqueadores | Estratégia |
|---|---|---|---|---|---|
| `RoadmapView` (named) | stateful — `useState`×3, `useEffect`, `useCallback`×6, `useMemo`×3, `useId`, `useChallengeNav()`, `useTheme()` | `ViewProps`: `setupsDir?: string`, `onNavigate?: (key: NavKey) => void` | **apiBridge**: `track.list`, `track.get`; `lib/challengeNav.useChallengeNav`; `lib/pendingSubject` (`drainPendingTrackSlug`, `setPendingTrackLesson`); `lib/roadmapNav` (`createUnlockDiffHolder`, `peekLastTrackSlug`, `setLastTrackSlug`); `motion/react`; `lib/animationTokens` (`springs`, `transitions`); i18n `roadmap.*` (16 chaves) + `common.*` | apiBridge + `ChallengeNavCtx` + estado de navegação da trilha | **mock de api** + **decorator de contexto** |

_Outros exports_: internos `LessonRow` (puro), `ModuleCard` (stateful — `useState(open)`; extrair para story de colapso).

### 3.45 `app/src/views/SettingsView/SettingsView.tsx`

| Export | Tipo | Props públicas | Dependências | Bloqueadores | Estratégia |
|---|---|---|---|---|---|
| `SettingsView` (default) | view pura (composição) | nenhuma | MUI (`Container`, `Divider`, `Stack`, `Typography`); `ThemeModeSelector`, `KeysPanel`, `LocalAiPanel`, `OrphanTracksPanel`, `ProgressPanel`; i18n `nav.settings`, `settings.appearanceDescription`, `settings.keysDescription`, `settings.keysTitle`, `settings.localAiDescription`, `settings.localAiTitle`, `settings.section.appearance` | Os painéis-filho exigem apiBridge (ver abaixo) | Story de composição com **mock de api** global (ou stories separadas dos painéis) |

### 3.46 `app/src/views/SettingsView/KeysPanel.tsx`

| Export | Tipo | Props públicas | Dependências | Bloqueadores | Estratégia |
|---|---|---|---|---|---|
| `KeysPanel` (named) | stateful — `useState`×2, `useEffect`, `useCallback` | nenhuma | **apiBridge**: `keys.getStatus`, `keys.setKey`, `keys.validateLlm`, `keys.validateBrave`; `lib/ipcTimeout` (`ACTION_TIMEOUTS`, `withTimeout`); `lib/validate.isNonEmpty`; `lib/validationAlert`; `panelCache` (`readCached`/`writeCached` — cache em memória do painel); `shared/llm/constants` (`OPENROUTER_KEY_PREFIX`, `OPENROUTER_MODEL`); i18n `keys.*` (19 chaves) + `common.*` | apiBridge (validação assíncrona + timeouts) | **mock de api** |

### 3.47 `app/src/views/SettingsView/LocalAiPanel.tsx`

| Export | Tipo | Props públicas | Dependências | Bloqueadores | Estratégia |
|---|---|---|---|---|---|
| `LocalAiPanel` (named) | stateful — `useState`×3, `useEffect`×3, `useMemo` | nenhuma | **apiBridge**: `localAi.detectHardware`, `localAi.download`, `localAi.delete`, `localAi.setActive`, `localAi.onDownloadProgress` (evento de progresso), `settings.set`; `lib/format` (`formatBytes`, `formatModelLabel`, `formatPercent`, `formatSpeedBps`); `panelCache`; i18n `localAi.*` (27 chaves) + `common.*` | apiBridge + stream de progresso de download (subscrição) + diálogos de confirmação | **mock de api** (fake com emitter de progresso) |

_Outros exports_: interno `HardwareView` (puro — candidato a story de hardware).

### 3.48 `app/src/views/SettingsView/OrphanTracksPanel.tsx`

| Export | Tipo | Props públicas | Dependências | Bloqueadores | Estratégia |
|---|---|---|---|---|---|
| `OrphanTracksPanel` (named) | stateful — `useState`×2, `useCallback`×2, `useEffect` | nenhuma | **apiBridge**: `track.orphans`, `track.purgeOrphans`; `lib/ipcTimeout`; `panelCache`; i18n `settings.orphans*` (16 chaves) + `common.*` | apiBridge + diálogo de confirmação | **mock de api** |

_Outros exports_: interno `OrphanRow` (puro).

### 3.49 `app/src/views/SettingsView/ProgressPanel.tsx`

| Export | Tipo | Props públicas | Dependências | Bloqueadores | Estratégia |
|---|---|---|---|---|---|
| `ProgressPanel` (named) | stateful — `useState`×2, `useCallback` | nenhuma | **apiBridge**: `study.clearProgress`; `lib/ipcTimeout`; i18n `settings.clearProgress*` (12 chaves) + `common.cancel` | apiBridge + diálogo de confirmação | **mock de api** |

### 3.50 `app/src/main.tsx` (entry — sem componentes)

Não exporta componentes. Exporta: `THEME_MODE_STORAGE_KEY = 'theme-mode'`, `resolveEffectiveScheme(): 'light' \| 'dark'` (lê `localStorage[THEME_MODE_STORAGE_KEY]`), `primeColorSchemeClass()`. Monta `ThemeProvider(theme)` + `CssBaseline` + `initI18n()` + `AppGate`. **Relevante para o Storybook**: o decorator global de tema deve reproduzir este `ThemeProvider` (e o `initI18n()`), senão `useColorScheme`/`useTheme` falham.

---

## 4. Tokens visuais (`.ts`)

### `app/src/lib/designTokens.ts` (642 linhas)
Exporta a base de design da app: `SURFACE_LIGHT`/`SURFACE_DARK` (camadas `surface.level0..4`), `READING_SURFACE_LEVELS = [0, 1]`, `INK_LIGHT`/`INK_DARK` (texto), `ACCENT_LIGHT`/`ACCENT_DARK` (`Record<AccentFamily, AccentPair>` com famílias `action | success | info | warn | study | error`), `NONTEXT_LIGHT`/`NONTEXT_DARK`, `DIVIDER_LIGHT`/`DIVIDER_DARK`, `SCRIM`, `MOTION`, `SPATIAL_ALLOWED_PROPERTIES`/`SPATIAL_FORBIDDEN_PROPERTIES`, `SHAPE` (raios), `FONT_STACK`, `FONT_BUNDLED`, `TYPE` (tipografia), `CELEBRATION` (confetti/celebração), helpers de contraste `redFlashRatio`, `isRedFlashColor`, `relativeLuminance`, `contrastRatio`, `CONTRAST_FLOOR`.
**Consumidores**: `theme.ts`, `codeTheme.ts`, `chatSurfaces.tsx`, `CodeBlock.tsx`, `MarkdownView.tsx`, `NavigationRail.tsx`, `SessionFrame.tsx`, `GlobalBusyIndicator.tsx`, `SplitDivider.tsx`, `QuizOverlayHost.tsx`, `GameLevelView.tsx`, `GamesView.tsx`, `LessonView.tsx`, `placeholders.tsx`, `dockState.ts`, `splitRatio.ts`.
**Storybook**: página de docs com swatches por camada/acento; não tem dependências (puro).

### `app/src/theme.ts` (1425 linhas)
`export const theme = createTheme({...})` + `export default theme` (tema MUI completo, incl. `modalSurfaceStyles(theme)` para superfícies de modal). Helpers exportados: `spatialTransition(theme, props)`, `effectsTransition(theme, props)`, `focusRingStyles(theme)`, `FOCUS_RING`, e tipos `SurfaceRamp`, `NonTextLayer`, `AccentPaletteColor`, `SpatialProperty`, `MotionSpeed`, `MotionTheme`, `StyleTheme`, `FocusRingTheme`.
**Consumidores**: `main.tsx`, `GlobalBusyIndicator`, `SplitDivider`, `SessionFrame`, `NavigationRail`, `CourseSelector`, `EvolutionTree`, `ChallengeGenerateModal`, `QuizOverlayHost` (e via `theme` todos os componentes com `useTheme`).
**Storybook**: decorator global `ThemeProvider` + `CssBaseline`; docs com a tabela de motion/FOCUS_RING. **Nota**: importa `designTokens`/fonts — sem efeitos colaterais de DOM, seguro em isolado.

### `app/src/lib/codeTheme.ts` (655 linhas)
Paletas de código/terminal: `CODE_LIGHT`/`CODE_DARK` (`CodePalette` com chrome, syntax roles, state roles, ANSI), `codePalette(scheme)`, `CODE_TYPOGRAPHY`/`codeTypography()`, `TERMINAL_CODE_COLORS_LIGHT/DARK` + `terminalColors(scheme)`, `XTERM_THEME_LIGHT/DARK` + `xtermTheme(scheme)`, `CODEMIRROR_SETTINGS_LIGHT/DARK` + `codeMirrorSettings(scheme)`, `codeMirrorSyntax(scheme)`, tipos `CodeScheme`, `CodeSyntaxRole`, `CodeStateRole`, `CodePaintRole`, `TerminalColorName`, `CodeChrome`, `CodeAnsi`, `CodePalette`, `CodeTypography`, `XtermCodeTheme`, `CodeMirrorCodeSettings`, e helpers `hexToRgb`, `truecolorForeground`, `codeColorEntries`, `animatableCodeColors`, constantes `CODE_SYNTAX_ROLES`, `CODE_STATE_ROLES`, `CODE_PAINT_ROLES`, `TERMINAL_COLOR_NAMES`, `CODE_ANSI_KEYS`.
**Consumidores**: `CodeMirrorField.tsx`, `AnswerTerminal.tsx`, `CodeBlock.tsx` (via `codeHighlight.ts`), `MarkdownView.tsx`, `ChallengeView.tsx`, `lib/terminalBanner.ts`.
**Storybook**: docs com swatches por role de syntax + tabela ANSI/xterm/CodeMirror; puro, sem dependências.

### `app/src/lib/animationTokens.ts` (92 linhas)
Tokens de motion (`motion/react`): `springs: Record<'window' | 'playful' | 'gentle' | 'snappy', Transition>`, `transitions: {...}` (durações/easings), `fadeInUp: Variants`, `scaleIn: Variants`, `windowVariants: Variants`.
**Consumidores**: `ChatBubble`, `TypingIndicator`, `ChallengeGenerateModal`, `QuizChatCard`, `QuizOverlayHost`, `LessonQuiz`, `LessonView`, `RoadmapView`.
**Storybook**: docs de motion (animar cada `Variants`); puro.

### `app/src/lib/chatBubbleStyle.ts` (71 linhas)
Semântica visual das bolhas de chat: `type ChatBubbleTone = 'user' | 'tutor' | 'reply' | 'error' | 'approved'`, `chatBubbleTone(message)`, `isUserTone(tone)`, `groupsWithPrevious(...)`.
**Consumidores**: `ChatBubble.tsx`, `chatSurfaces.tsx`. **Storybook**: puro — ótimo para docs de tom/agrupamento.

### `app/src/lib/levels.ts` (87 linhas)
Níveis de dificuldade: `LEVEL_ORDER = ['beginner','intermediate','advanced']`, `type DifficultyLevel`, `difficultyToLevel(difficulty)`, `type LevelI18nKey`, `levelI18nKey(level)`, `levelIndex(level)`, `levelLessThan(a, b)`.
**Consumidores**: `EvolutionTree.tsx`, `lib/roadmap.ts`, `lib/treeView.ts`. **Storybook**: puro — docs de níveis/cores.

---

## 5. Ficheiros `.tsx` que exigem mock de API (`getApi()`/`getGamesApi()`)

| Ficheiro | Métodos chamados |
|---|---|
| `app/src/components/challenge/ChallengeGenerateModal.tsx` | `track.onChallengeRegenerateProgress` (subscrição de eventos) |
| `app/src/components/editor/EditorPane.tsx` | `study.readWorkspaceFile`, `study.writeWorkspaceFile`, `study.deleteWorkspaceFile` |
| `app/src/components/voice/MicButton.tsx` | (via `useMicSTT`) `stt.onStreamPartial`, `stt.onEngineStatus`, `stt.streamStart`, `stt.streamChunk`, `stt.streamStop`, `stt.streamCancel` + `navigator.mediaDevices.getUserMedia` |
| `app/src/components/voice/SpeakButton.tsx` | `localTts.generate`, `localTts.cancelGenerate` |
| `app/src/features/onboarding/OnboardingHost.tsx` | `keys.getStatus` |
| `app/src/gate/AppGate.tsx` | `keys.startupStatus` |
| `app/src/gate/SetupView.tsx` | `keys.setKey`, `keys.validateLlm`, `keys.validateBrave` |
| `app/src/views/ChallengeView/ChallengeView.tsx` | `study.listChallenges`, `study.listWorkspaceFiles`, `study.readWorkspaceFile`, `study.markChallengeAttempt`, `study.testAnswer`, `study.onTestAnswerEvent`, `settings.get`, `localAi.getActive`, `localAi.chat`, `pi.execute`, `pi.onStreamEvent`, `pi.abort` |
| `app/src/views/ChallengeView/TrackChallengePanel.tsx` | `track.get`, `track.challenge`, `track.challengeSubmit`, `track.challengeRegenerate`, `track.proficiency` |
| `app/src/views/GamesView/GamesView.tsx` | `games.listWorlds`, `games.loadLevel` (via `getGamesApi`) |
| `app/src/views/GamesView/GameLevelView.tsx` | `games.loadLevel`, `games.run` (via `getGamesApi`) |
| `app/src/views/LessonView/LessonView.tsx` | `track.lesson`, `track.lessonDone`, `track.tutorChat`, `track.quizAttempt`, `track.quizExplain`, `track.quizHistory`, `track.quizRemedial`, `track.challengeRegenerate` |
| `app/src/views/placeholders.tsx` | `keys.getStatus`, `study.listTopics`, `track.list`, `track.orphans` |
| `app/src/views/RoadmapView/RoadmapView.tsx` | `track.list`, `track.get` |
| `app/src/views/SettingsView/KeysPanel.tsx` | `keys.getStatus`, `keys.setKey`, `keys.validateLlm`, `keys.validateBrave` |
| `app/src/views/SettingsView/LocalAiPanel.tsx` | `localAi.detectHardware`, `localAi.download`, `localAi.delete`, `localAi.setActive`, `localAi.onDownloadProgress`, `settings.set` |
| `app/src/views/SettingsView/OrphanTracksPanel.tsx` | `track.orphans`, `track.purgeOrphans` |
| `app/src/views/SettingsView/ProgressPanel.tsx` | `study.clearProgress` |

**Total: 18 ficheiros `.tsx`.** Ponto de mock: `__setApiForTests(api)` / `__resetApiForTests()` em `app/src/lib/apiBridge.ts`. Componentes que transitivamente dependem disto (sem chamar diretamente): `App`, `AppGate`, `SettingsView`, `MicButton` (via hook), e tudo o que renderize `EditorPane`/`LessonView`.

---

## 6. Top-5 componentes mais difíceis de estoirar em story

1. **`LessonView`** (`views/LessonView/LessonView.tsx`, 4598 linhas) — 8 métodos de `getApi().track.*`, `SessionStateCtx` + `ChallengeNavCtx` + `ShellSidebarPortal`, `useMicSTT`, store de módulo do overlay de quiz, cache de aula (`lastLesson`/`lessonPrefetch`), 19 `useEffect` + 28 `useCallback` num corpo só. Só se resolve com **mock de api + extrair hook** (o `LessonComposer`/`LessonActionRow`/`LessonSourceViewer` já extraídos são a parte story-friendly).
2. **`ChallengeView`** (`views/ChallengeView/ChallengeView.tsx`, 1466 linhas) — orquestra 3 subsistemas visuais (xterm `AnswerTerminal`, `EditorPane`+`FileExplorer` com disco, `TrackChallengePanel`) e 12 métodos de API incluindo 2 streams (`study.onTestAnswerEvent`, `pi.onStreamEvent`) + `pi.abort`; relógio de estrelas e confetti no meio. Exige mock de API com emitter de eventos ou extração dos callbacks `loadChallenges`/`runTests`/`runPi`.
3. **`TrackChallengePanel`** (`views/ChallengeView/TrackChallengePanel.tsx`, 1769 linhas) — 5 métodos `track.*`, seleção vindas de `ChallengeNavCtx` (`useSyncExternalStore` + contexto), star tracker com ticks, draft cache em memória, fluxo de regeneração com progresso; sem decorator de contexto + mock de API não mostra nada.
4. **`QuizOverlayHost`** (`components/quiz/QuizOverlayHost.tsx`, 640 linhas) — zero props: o estado vive em stores de módulo fora do React (`quizOverlayState` + `quizOverlayContent`) lidos por `useSyncExternalStore`; precisa de seed (`openQuizOverlay`) e `__resetQuizOverlayForTests` entre stories, mais focus-trap e `LessonQuizCard` por baixo. Só se documenta com **decorator que seeda o store** (ou refator para props).
5. **`OnboardingOverlay`** (`features/onboarding/components/OnboardingOverlay.tsx`, 797 linhas) — portal para `document.body`, spotlight calculado por `getBoundingClientRect` de alvos `[data-onboarding-*]` do DOM real, 8 `useEffect` + `useLayoutEffect` de reposicionamento (resize/scroll), CSS module e narração/áudio ligados pelo `OnboardingHost`. Sem fixture de DOM-alvo e sem os `OnboardingStepDefinition` corretos o overlay renderiza sem spotlight.
