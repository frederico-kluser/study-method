# PRIMITIVES — o registo dos primitivos de layout da consolidação DRY

> Registo das **Fases A e B** do plano da §16 de
> `docs/storybook/LAYOUT-DRY-AUDIT.md`. Quem faz a **Fase C** (migração uso a
> uso) lê este ficheiro antes de tocar num consumidor: cada primitivo diz
> QUAL duplicação aposenta e ONDE entra.
>
> Regra permanente: valores de design só em `src/lib/designTokens.ts` /
> `src/theme.ts`; copy só por `useTranslation` (chaves nos DOIS locales);
> contrato state/view — view pura em `<Nome>.tsx`, raciocínio em
> `<Nome>.state.ts` (puro, testado sem jsdom) ou `lib/*.ts`.

---

## Fase A — tokens e módulos puros

### `src/lib/designTokens.ts` (aditivo)

| Export | Valor | Substitui / justificação |
|---|---|---|
| `TARGET.minTouchTargetPx` | `44` | §1 — o piso de alvo de toque, redeclarado 27× (12 constantes locais + 15 literais `44`). DECISÃO escrita no ficheiro: 44px é o patamar AAA (WCAG 2.2 SC 2.5.5) / Apple HIG, acima do mínimo AA do SC 2.5.8 (24px). |
| `LAYOUT.*` | 8 larguras nomeadas | §4/§6 — o molde `p: 2, maxWidth: N, mx: 'auto'` (13 blocos) e os cartões de modal: `readingColumnPx 640` (12×), `chooserColumnPx 680`, `wideColumnPx 720`, `panelColumnPx 760`, `pageMaxPx 1200`, `modalCardPx 520`, `modalCardNarrowPx 440`, `modalCardTightPx 380`. |
| `Z_INDEX.*` | 7 papéis | §12 — os 8 literais mágicos em 7 ficheiros: `stickyBar 10`, `contentOverlay 40`, `overlay 1300`, `modal 1300`, `busy 1400`, `tutorial 14000`, `tutorialModal 14500`. A ordem total está no comentário do contrato. |
| `PRESS.scale` | `0.98` | §2 — o `scale` escrito à mão nas 15 cópias da casca de press. |
| `PRESS.hoverLiftPx` | `2` | §2 — o `y: -2` da variante com hover (QuizChatCard). |

### `src/lib/animationTokens.ts` (aditivo)

| Export | Substitui |
|---|---|
| `reducedFadeVariants` | §13 — as duas cópias de `REDUCED_VARIANTS` (QuizOverlayHost, ChallengeGenerateModal): o ciclo de janela em fade puro para `prefers-reduced-motion`. |

### `src/lib/a11yStyles.ts` (novo)

| Export | Substitui |
|---|---|
| `SR_ONLY_SX` | §5 — as 5 cópias de sr-only (GamesView, EditorTabs, SplitDivider, RoadmapView, ChallengeView), **4 delas com bug** (`width: 1` → 100%, `m: -1` → -8px). Medidas absolutas SEMPRE em string de px. Prova do CSS emitido em `tests/a11yStyles.test.ts`. |

### `src/lib/focusTrap.ts` (novo, puro — DOM por injeção)

| Export | Substitui |
|---|---|
| `FOCUSABLE_SELECTOR` | §7 — a lista canónica copiada 4× (QuizOverlayHost, ChallengeGenerateModal, TutorialSelectionModal, OnboardingOverlay). |
| `getFocusable(root)` | A consulta dos focáveis (raiz estrutural — o DOM real serve sem cast). |
| `trapTabTarget` / `createFocusLoop` | O laço `Shift+Tab`/`Tab` reimplementado em cada cópias. **DECISÃO**: reforço — foco escapado volta a entrar pela ponta certa (as cópias só davam a volta nas bordas); no meio da lista o Tab nunca é sequestrado. |
| `focusReturnTarget` (+ `FocusReturnNode`/`FocusReturnAnchor`) | A devolução de foco ao abridor (a regra das 3 pernas, de que `QuizOverlayHost.focusReturnTarget` é a origem — a Fase C passa a importar daqui, mesma assinatura). |

O adapter React é `components/ui/useFocusTrap.ts` (cola fina: refs/DOM →
funções puras; nenhuma decisão vive lá).

### `src/lib/layoutSx.ts` (novo, só objetos de estilo)

| Export | Substitui (cópias) |
|---|---|
| `touchTargetSx` | §1 — `minHeight: TOUCH_TARGET_PX` (17×). |
| `touchTargetBoxSx` | §1 — `width/height: TOUCH_TARGET_PX` (7×). |
| `actionButtonSx` | §2 — `whiteSpace: 'nowrap', minHeight, px: 3` (5×). |
| `wrappingActionSx` | §1 — `minHeight, whiteSpace: 'normal', overflowWrap: 'break-word'` (6×). |
| `wrappingActionAnywhereSx` | §1 — o composto com `overflowWrap: 'anywhere'` (4×). |
| `alertMessageSx` / `alertDetailSx` | §3 — o par frase `body2` + legenda `caption` (`display: 'block', opacity: 0.85`) (4×). |
| `centeredColumnSx(maxWidth, topPad?)` | §4 — o molde de coluna centrada (13×). |
| `sectionDescriptionSx` | §8 — `color: 'text.secondary', mb: 1.5` (5×). |
| `infoCardPaddingSx` | §10 — `p: 1.5, '&:last-child': { pb: 1.5 }` (3×). |
| `infoCardTitleSx` | §10 — `fontWeight: 600` do subtítulo (16×). |

---

## Fase B — primitivos `src/components/ui/`

Todos com `*.stories.tsx` ao lado (título `Componentes/UI/<Nome>`, CSF3,
`satisfies Meta`, textos pt-BR traduzidos) e contrato state/view.

| Primitivo | Props (principais) | Substitui (§ da auditoria) | Estado/lógica |
|---|---|---|---|
| `Pressable` | `children`, `hover?`, `reducedMotion?` | §2 — a casca `motion.span` copiada 15× (o fix do `tabIndex=-1` incluído) | `Pressable.state.ts` (`pressableMotionState`) |
| `ActionButton` | `ButtonProps` + `loading?`, `hover?`, `sx?` | §2 — casca + botão com piso de toque; piso aplicado por omissão (`actionButtonSx`) | `ActionButton.state.ts` (`actionButtonBusyState`) |
| `LoadErrorState` | `message?`, `onRetry`, `loading?`, `retryLabel?`, `width?` | §3 (a) — bloco erro + retry centrado (16×) | vista pura (sem lógica extraível) |
| `RetryAlert` | `severity?`, `message?`, `detail?`, `action?`, `onRetry?`, `retryLabel?`, `onClose?`, `sx?` | §3 (b) — `Alert` com retry na ação (10×) + par mensagem/detalhe (4×) | `RetryAlert.state.ts` (`retryAlertState`) |
| `CenteredColumn` | `width?`, `topPad?`, `children?` | §4 — o molde de coluna centrada (13×) | vista pura |
| `EmptyState` | `icon?` (componente MUI), `title`, `description?`, `action?`, `width?`, `topPad?` | §4 — o estado vazio centrado (LessonView) | vista pura |
| `ModalScrim` | `open`, `ariaLabel?`/`ariaLabelledBy?`/`ariaDescribedBy?`, `onDismiss`, `maxWidth?`, `zIndex?`, `reducedMotion?`, `cardSx?`, `cardClassName?`, `getReturnAnchor?`, `children?` | §6 — o shell fixed+scrim+blur+safe-center (5×; ~25 linhas cada) | `ModalScrim.state.ts` + `useFocusTrap` |
| `SectionHeader` | `title`, `description?`, `actions?`, `level?` (1–4), `variant?`, `titleId?` | §8 — linha de cabeçalho (12×) + cabeçalhos de página (ChallengeViewHeader, TrackChallengeHeader) | `SectionHeader.state.ts` (`sectionHeadingStyle`) |
| `SettingsSection` | `title`, `description?`, `level?`, `id?`, `onboardingTarget?`, `children?` | §8 — bloco `<section aria-labelledby>` de Settings (5×) | vista pura (compõe o SectionHeader) |
| `ConfirmDialog` | `open`, `title`, `description?`, `confirmLabel?`, `cancelLabel?`, `confirmColor?`, `busy?`, `initialFocus?`, `onCancel`, `onConfirm` | §9 — o diálogo de confirmação (4×) | `ConfirmDialog.state.ts` (`confirmDialogIds`, `confirmDialogActionsState`) |
| `InfoCard` | `title`, `subtitle?`, `actions?`, `icon?`, `selectable?`, `selected?`, `onClick?` | §10 — cartão de lista (~9×) + `fontWeight: 600` (16×) | `InfoCard.state.ts` (`infoCardState`) |

Módulos `*.state.ts` são PUROS e estão listados em `tsconfig.node.json`
(como `quizOverlayContent.ts` e os demais) — a prova de que não podem voltar
a depender de DOM/React. Views e `useFocusTrap.ts` pertencem ao projeto do
renderer.

### Extensões das ondas de migração (props que desbloquearam consumidores)

1. **`RetryAlert.action?: boolean`** (default `true`) — `false` mostra só a
   mensagem/detalhe, sem botão (o bloco de erro de CHAVE do
   ChallengeFeedbackPanel não tem retentativa). `onRetry` passou a opcional:
   SEM `onRetry` não há botão (um "Tentar de novo" que não faz nada é mentira) —
   a regra é `retryAlertState()`. O default (com `onRetry`) preserva o
   comportamento original.
2. **`SectionHeader` nível `1` + `variant?`** — os cabeçalhos de PÁGINA são
   `<h1>`: `ChallengeViewHeader` (h4/h1) e `TrackChallengeHeader` (h5/h1).
   O nível decide SEMPRE a semântica (`component`); o `variant` é escape hatch
   de TALHE para páginas fora da escala. Mapeamento completo em
   `SectionHeader.state.ts`.
3. **`ModalScrim.ariaLabelledBy?`/`ariaDescribedBy?`** — o contrato auditado do
   tutorial (achado-1) exige `aria-labelledby` (título) e `aria-describedby`
   (subtítulo) no diálogo. O nome acessível é `ariaLabelledBy` OU `ariaLabel`
   (pelo menos um — o accname dá prioridade ao `aria-labelledby`); desbloqueia
   o TutorialSelectionModal.
4. **`ModalScrim.cardSx?`/`cardClassName?`** — SLOT DE CHROME do cartão: a
   moldura/sombra medida de cada modal (o `cardShadow` `color-mix` do
   QuizOverlayHost, o glow animado do done) compõe POR CIMA da superfície base
   (superfície modal + `SHAPE.md` + padding), sem reescrever o scrim/safe-center
   do primitivo. Desbloqueia as migrações do QuizOverlayHost e do
   ChallengeGenerateModal. Cores sempre via `theme.vars` (variáveis CSS), nunca
   hex — ver a story `ModalScrim/ComChromeDoCartao`.
5. **`RetryAlert.onClose?: () => void` + `RetryAlert.sx?`** (onda DRY da
   LessonView) — os três `Alert` da aula (aviso do canal do quiz, erro do mic,
   erro do tutor) têm DESCARTE (`onClose`) e, no mic, chrome fino
   (`sx={{ py: 0.5 }}`), que o primitivo não expressava. Extensões ADITIVAS:
   sem `onClose` não há × (todos os consumidores anteriores ficam byte a byte
   como estavam) e o `sx` compõe por cima do base, como no `ActionButton`.
   REGRA do próprio MUI v9 (`Alert.js`: `action == null && onClose`):
   **retry e × são mutuamente exclusivos** — com ação em cena o `Alert`
   desenha a ação e não o ×. É o comportamento real de HOJE destes três
   alertas (a cópia do erro do tutor dizia-o a palavras: *"sem receita, só o
   fechar de sempre"*) e a decisão vive em `RetryAlert.state.ts`
   (`showDismiss`), em vez de um `onClose` entregue ao MUI para ele ignorar.
   Se um dia se quiser retry E × no mesmo alerta, é a decisão que muda (e a
   vista passa a compor os dois no slot `action`) — nunca silenciosamente.

## Novo módulo puro da onda da LessonView

| Módulo | Substitui |
|---|---|
| `src/lib/quizPill.ts` (`quizPillOutline(theme, pct)` + `PILL_OUTLINE.card/overlay`) | §13 — as 2 cópias de `pillOutline` (`color-mix(in srgb, ink N%, transparent)`) recalculadas à mão com percentagens diferentes: `LessonQuiz.tsx` (72%) e `QuizOverlayHost.tsx` (55%). Registado em `tsconfig.node.json` e testado em `tests/quizPill.test.ts`. **Migrado só o uso do LessonQuiz**; o do `QuizOverlayHost` é de outra onda — o valor nomeado `PILL_OUTLINE.overlay` (55) está pronto a ser consumido. |

---

## i18n

Chaves novas (namespace `ui`, nos DOIS locales — paridade guardada por
`tests/i18n-resources.test.ts`):

| Chave | pt-BR | Onde |
|---|---|---|
| `ui.actionButton.busy` | "A processar…" | anúncio sr-only do `ActionButton` ocupado |
| `ui.loadError.message` | "Não foi possível carregar este conteúdo." | fallback do `LoadErrorState` |
| `ui.retryAlert.message` | "Não foi possível concluir a operação." | fallback do `RetryAlert` |

O resto da copy vive no CHAMADOR (regra da §3). Os primitivos reutilizam as
chaves existentes: `common.tryAgain`, `common.cancel`, `common.confirm`.

---

## Testes (node:test, sem jsdom)

| Ficheiro | Prova |
|---|---|
| `tests/focusTrap.test.ts` | seletor, `getFocusable`, as 5 regras do laço, `createFocusLoop`, as 3 pernas da devolução de foco |
| `tests/a11yStyles.test.ts` | `SR_ONLY_SX` no CSS EMITIDO (`renderToStaticMarkup` + regras do emotion): `1px` nunca `100%`, `-1px` nunca `-8px`; e o token num primitivo real (ActionButton ocupado) |
| `tests/layoutSx.test.ts` | os compostos de `sx` exatos das cópias + guarda de cor crua |
| `tests/uiPrimitivesState.test.ts` | os sete `*.state.ts` (press, ocupado, shell do overlay, níveis/talhe, ids/ocupado do diálogo, modos do cartão, há retry?) |
| `tests/uiPrimitivesRender.test.ts` | o markup das vistas por SSR (i18n real + tema real): erro/retry traduzidos, empty state, `aria-labelledby` do `<section>` casado, `aria-pressed` honesto, `role="dialog"` do `ModalScrim` |

---

## Decisões contra o relatório da auditoria (para a Fase C saber)

1. **`LAYOUT` com 8 larguras, não 6** — a §4 fala em "6 larguras" porque conta
   a família de modais como uma; o código real tem 5 larguras de coluna + 3 de
   cartão de modal (520/440/380). Todos os 8 valores estão nomeados.
2. **`Z_INDEX.overlay` e `Z_INDEX.modal` no mesmo degrau (1300)** — são a
   mesma camada (diálogo sobre scrim) e nunca se empilham; os nomes ficam
   separados porque os papéis são diferentes. Se um dia coexistirem, é no
   token que se abre um degrau.
3. **Laço de foco reforçado** — `trapTabTarget` traz de volta foco escapado
   (as 4 cópias só davam a volta nas bordas). Documentado no cabeçalho de
   `lib/focusTrap.ts`; a migração para `useFocusTrap` herda o comportamento.
4. **`useFocusTrap` vive em `components/ui/`, não em `lib/`** — `src/lib`
   compila sem DOM/React (tsconfig.node.json); a §7 pedia o hook em
   `lib/focusTrap.ts`, o que é mecanicamente impossível. `lib/focusTrap.ts`
   tem as funções puras; o hook é cola sem decisão.
5. **`ConfirmDialog.initialFocus`** — default `'cancel'` (a regra W18 da
   cópia do ProgressPanel); a cópia do FileExplorer usava foco no confirmar,
   que passa a ser `initialFocus="confirm"`. A divergência das cópias estava
   por decidir no relatório.
6. **`ActionButton` não extende `ButtonProps['sx']` em array** — MUI v9 não
   aceita arrays aninhados em `SxProps`; o `sx` do chamador é
   `SystemStyleObject` composto por cima de `actionButtonSx`.
7. **`MicButton`/`SpeakButton` (§14)** não foram tocados — estão fora do
   escopo desta onda (Fase C / onda de voz).
8. **A largura do cartão de modal do `AppGate` é 440, não 520** (o relatório
   dizia 520 para a família AppGate/SetupView) — o `LAYOUT.modalCardNarrowPx`
   cobre o caso real.
9. **`PRESS` em vez de `MOTION.pressScale`** — a §2 propunha `MOTION.pressScale`,
   mas `MOTION` é o contrato CONGELADO dos dois níveis de movimento separados
   por propriedade (spatial/effects — guardado por
   `tests/cx-views-theme-design.test.ts`), e a escala de press/lift de hover
   não são um nível de movimento: são magnitudes de gesto. Nasce o token
   `PRESS` (`scale`, `hoverLiftPx`) ao lado — valores idênticos aos das
   cópias, contrato congelado intacto.
