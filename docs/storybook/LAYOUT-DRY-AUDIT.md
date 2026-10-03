# LAYOUT-DRY-AUDIT — repetição de layout a consolidar antes do Storybook

> Auditoria **somente-leitura** do layout de `app/` (Electron + React 19 + MUI 9.3.1).
> Objetivo: encontrar a repetição de código de layout que deve virar
> componentes/utilitários partilhados **antes** de extrair histórias de Storybook —
> cada repetição não consolidada vira N histórias que divergem entre si.
>
> Método: varredura completa de `app/src/**` (`App.tsx`, `components/**`,
> `views/**`, `features/onboarding/**`, `gate/**`), extração automatizada de todos
> os blocos `sx={{…}}` / `style={{…}}` / `sx={(theme) => ({…})}` (inclui a forma
> função), clustering por conteúdo exato e por assinatura de propriedades, mais
> contagem repo-wide de cada idioma (grep). Todos os `ficheiro:linhas` abaixo
> foram verificados no código. **Nenhum código foi alterado.**
>
> Semântica MUI usada na análise (verificada em `app/node_modules/@mui/system`):
> em `sx`, `gap`/`margin`/`padding` numéricos passam por `theme.spacing`
> (`gap: 1` = 8px), `width`/`height`/`minHeight` numéricos são px **exceto** valores
> `≤ 1` que viram percentagem (`width: 1` → `100%`), e `borderRadius` numérico é
> `theme.shape.borderRadius × n` (base = `SHAPE.base` = 12 → `borderRadius: 2` = 24px).

---

## Índice por impacto

| # | Achado | Ocorrências | Ficheiros | Proposta |
|---|--------|-------------|-----------|----------|
| 1 | `TOUCH_TARGET_PX = 44` redeclarado + literais `44` | 27 decl/usos diretos (~98 refs) | 20 | `designTokens.TARGET` |
| 2 | Casca de press-feedback `motion.span` + botão de ação | 15 | 4 | `components/ui/Pressable.tsx` |
| 3 | Bloco erro + “Tentar de novo” (e `Alert action` retry) | 16 (+10) | 12 | `components/ui/LoadErrorState.tsx` / `RetryAlert.tsx` |
| 4 | Coluna centrada `p:2, maxWidth:N, mx:'auto'` (zoo de larguras) | 13 (+12 só `maxWidth: 640`) | 11 | `LAYOUT` tokens + `CenteredColumn` |
| 5 | Estilo sr-only (5 cópias; 4 com bug `width: 1`) | 5 | 5 | `lib/a11yStyles.ts` → `SR_ONLY_SX` |
| 6 | Shell de overlay/modal (fixed + scrim + blur + safe-center) | 5 | 4 | `components/ui/ModalScrim.tsx` + `Z_INDEX` |
| 7 | Seletor `FOCUSABLE` + laço de foco copiado | 4 | 4 | `lib/focusTrap.ts` |
| 8 | Linha de cabeçalho de secção/painel (título + chips/ações) | ~12 | 8 | `components/ui/SectionHeader.tsx` |
| 9 | Diálogo de confirmação (Dialog+Title+Content+Actions) | 4 | 4 | `components/ui/ConfirmDialog.tsx` |
| 10 | Cartão de lista `Card+CardContent` com mesmo padding/texto | ~9 | 4 | `components/ui/InfoCard.tsx` |
| 11 | Vocabulário de raio duplicado (`borderRadius: n` vs `SHAPE.*`) | ~16 vs ~17 | ~14 | normalizar p/ `SHAPE` |
| 12 | `zIndex` mágicos (1300/1400/14000/14500/10/40) | 8 | 7 | `designTokens.Z_INDEX` |
| 13 | `REDUCED_VARIANTS` copiado; `pillOutline` recalculado | 2 + 2 | 2 + 2 | `lib/animationTokens.ts` / `lib/quizPill.ts` |
| 14 | `MicButton`/`SpeakButton` (pílula + erro, cores cruas) | 2 (fora do tema) | 2 | apagar ou reescrever |
| — | **Já DRY (não mexer)** | — | — | ver §15 |

---

## 1. `TOUCH_TARGET_PX = 44` — o piso de alvo de toque, 27 definições/usos literais

**Impacto máximo**: o mesmo número é *redeclarado como constante local* em 12
ficheiros e escrito *à mão* como literal `44` em mais 15 pontos de 8 ficheiros.
Os comentários reconhecem a cópia (“token local, como em FileExplorer/
LessonSidebarHeader”), mas não há fonte única.

**Aparência da repetição** (12 cópias idênticas):

```ts
/** Piso de alvo de toque (px) — o piso de 44 que o design system cobra para … */
const TOUCH_TARGET_PX = 44;
```

Declarações (`const TOUCH_TARGET_PX = 44`):

- `app/src/views/LessonView/LessonView.tsx:499`
- `app/src/views/placeholders.tsx:120`
- `app/src/views/RoadmapView/RoadmapView.tsx:78`
- `app/src/views/GamesView/GamesView.tsx:68`
- `app/src/views/GamesView/GameLevelView.tsx:79`
- `app/src/views/SettingsView/KeysPanel.tsx:57`
- `app/src/views/SettingsView/LocalAiPanel.tsx:53`
- `app/src/views/SettingsView/OrphanTracksPanel.tsx:57`
- `app/src/views/SettingsView/ProgressPanel.tsx:42`
- `app/src/components/course/LessonSidebarHeader.tsx:158`
- `app/src/components/editor/FileExplorer.tsx:48`
- `app/src/features/onboarding/components/TutorialSelectionModal.tsx:69`

Literais `44` soltos (mesma regra, sem a constante):

- `app/src/views/ChallengeView/TrackChallengePanel.tsx:1376, 1483, 1490, 1727, 1738, 1752`
- `app/src/views/LessonView/LessonView.tsx:4090, 4564`
- `app/src/components/quiz/QuizChatCard.tsx:284, 309`
- `app/src/components/quiz/QuizOverlayHost.tsx:629`
- `app/src/components/markdown/CodeBlock.tsx:277`
- `app/src/components/chat/ChatBubble.tsx:342`
- `app/src/components/theme/ThemeModeSelector.tsx:116-117` (`minHeight: 44` / `minWidth: 44`)

Compostos que repetem o mesmo piso dentro do `sx` (contados na mineração de
blocos idênticos): `minHeight: TOUCH_TARGET_PX` ×17, `width: TOUCH_TARGET_PX,
height: TOUCH_TARGET_PX` ×7, `minHeight: TOUCH_TARGET_PX, whiteSpace: 'normal',
overflowWrap: 'break-word'` ×6, `minHeight: 44, whiteSpace: 'normal',
overflowWrap: 'anywhere'` ×4, `whiteSpace: 'nowrap', minHeight: TOUCH_TARGET_PX,
px: 3` ×5, `mt: 1, minHeight: TOUCH_TARGET_PX` ×3.

**Trecho repetido** (ex.: `app/src/views/SettingsView/ProgressPanel.tsx:106`):

```tsx
<Button variant="outlined" onClick={…} sx={{ minHeight: TOUCH_TARGET_PX }}>
```

**Proposta de consolidação**

- `app/src/lib/designTokens.ts` — nova secção:
  ```ts
  export const TARGET = { minTouchTargetPx: 44 } as const;
  ```
  (mesma família de `SHAPE`/`MOTION`/`TYPE`; um único valor, um único lugar).
- `app/src/lib/layoutSx.ts` (novo) — helpers de uso imediato:
  `touchTargetSx = { minHeight: TARGET.minTouchTargetPx }`,
  `touchTargetBoxSx = { width: …, height: … }`, `actionButtonSx = { whiteSpace:
  'nowrap', minHeight: …, px: 3 }`.
- Em cada uso: trocar a declaração local por `import { TARGET } from '…/designTokens'`
  (ou manter `const TOUCH_TARGET_PX = TARGET.minTouchTargetPx;` como alias local de
  1 linha — migração semântica nula) e substituir os literais `44` por `TARGET.minTouchTargetPx`.
- Bónus para o Storybook: um `ActionButton`/`TouchTarget` que aplique o piso por
  omissão elimina a classe inteira de repetição de `sx`.

**Muda em cada uso**: 1 linha de import + substituição do literal; nenhum efeito
visual (o valor não muda).

---

## 2. Casca de press-feedback `motion.span` + botão de ação — 15 cópias

O bloco abaixo está copiado **15 vezes** em 4 ficheiros, sempre com o mesmo
comentário de origem (“casca animada: nunca parada de tab”, o fix do
`tabIndex=0` que o framer-motion injeta):

```tsx
<motion.span
  whileTap={{ scale: 0.98 }}
  transition={springs.snappy}
  tabIndex={-1}
  style={{ display: 'inline-block' }}
>
  <Button … sx={{ whiteSpace: 'nowrap', minHeight: TOUCH_TARGET_PX, px: 3 }} />
</motion.span>
```

Ocorrências:

- `app/src/views/LessonView/LessonView.tsx:624, 705, 745, 1142, 1193, 1230, 1246, 1369, 3711, 3804` (10×)
- `app/src/components/quiz/QuizChatCard.tsx:244, 272, 298` (3× — o de `244` acrescenta `whileHover={{ y: -2 }}`)
- `app/src/components/challenge/ChallengeGenerateModal.tsx:414, 441` (2× — forma inline de 1 linha)

Variantes do mesmo botão que também repetem: `sx={{ minHeight: 44 }}`
(`QuizChatCard.tsx:284, 309`, `LessonView.tsx:4090`) e `sx={{ minHeight: 48,
px: 4, mt: 0.5 }}` (`QuizChatCard.tsx:261`).

**Proposta**

- `app/src/components/ui/Pressable.tsx` (novo):
  - `<Pressable hover?>` — a casca `motion.span` com `whileTap={{ scale: 0.98 }}`,
    `transition={springs.snappy}`, `tabIndex={-1}`, `style={{ display:
    'inline-block' }}` (e `whileHover={{ y: -2 }}` opcional).
  - `<ActionButton>` — `<Pressable><Button sx={actionButtonSx} …/></Pressable>`,
    com o piso de toque do §1 por omissão.
- Tokens: o `scale: 0.98` vira `MOTION.pressScale` em `designTokens.ts`
  (hoje está nos 15 pontos).
- Em cada uso: os 6 atributos + o comentário do `tabIndex` desaparecem; fica
  `<ActionButton variant="contained" startIcon={…}>`.

**Muda em cada uso**: bloco de 7 linhas → 1 componente; ganha-se uma única
história de Storybook para o comportamento de press.

---

## 3. Bloco “erro + Tentar de novo” — 16 blocos em 12 ficheiros (+10 `Alert action`)

Duas formas do mesmo padrão:

**(a) estado de erro de carregamento** (`Box` centrado + `Alert` + botão retry):

```tsx
<Box sx={{ p: 2, maxWidth: 640, mx: 'auto', pt: 4 }}>
  <Alert severity="error">{loadError}</Alert>
  <Button variant="outlined" onClick={retry} sx={{ mt: 1 }}>
    {t('translation:common.tryAgain')}
  </Button>
</Box>
```

- `app/src/views/LessonView/LessonView.tsx:3565-3574` (erro) e `3580-3590` (loading)
- `app/src/views/ChallengeView/TrackChallengePanel.tsx:1311-1317`
- `app/src/views/GamesView/GameLevelView.tsx:1080-1092` (com `Alert action`)
- `app/src/views/GamesView/GamesView.tsx:514-525`
- `app/src/views/placeholders.tsx:543-553` e `836-846`
- `app/src/views/RoadmapView/RoadmapView.tsx:655-672`
- `app/src/views/SettingsView/OrphanTracksPanel.tsx:205-211`
- `app/src/views/SettingsView/KeysPanel.tsx:440-447`

**(b) `Alert` com retry na ação** — 10 sítios: `ChallengeView.tsx:1095-1105,
1112-1122, 1145-1155, 1234-1245, 1367-1377`; `GameLevelView.tsx:1080-1092`;
`GamesView.tsx:514-525`; `placeholders.tsx:836-846`; `LessonView.tsx:4114-4130,
4164-4175`.

Cada ocorrência de `common.tryAgain` (16 em 12 ficheiros) é um ponto do mesmo
idioma. Há ainda o sub-padrão “Alert com mensagem + detalhe” (frase `body2` +
legenda `caption` com `display: 'block', opacity: 0.85` — 4 cópias idênticas:
`gate/SetupView.tsx:415-423`, `views/SettingsView/LocalAiPanel.tsx:352-357 e
515-520`, `views/SettingsView/ProgressPanel.tsx:117-122`).

**Proposta**

- `app/src/components/ui/LoadErrorState.tsx` (novo): `<LoadErrorState message
  onRetry loading? />` — encapsula `Alert severity="error"` + retry + o
  contêiner centrado (§4).
- `app/src/components/ui/RetryAlert.tsx` (novo): `<RetryAlert severity message
  detail? onRetry />` — a forma (b) + o detalhe em legenda.
- Onde vive: pasta nova `app/src/components/ui/` (paralela a `components/shell/`),
  pronta para virar stories (`LoadErrorState`, `RetryAlert`).

**Muda em cada uso**: 6–12 linhas → 1 componente com props; a copy i18n mantém-se
no chamador.

---

## 4. Coluna centrada `p: 2, maxWidth: N, mx: 'auto'` — 13 blocos, 6 larguras diferentes

```tsx
<Box sx={{ p: 2, maxWidth: 640, mx: 'auto' }}>
```

- `maxWidth: 640` — **12 ocorrências em 8 ficheiros**:
  `views/LessonView/LessonView.tsx:3547, 3565, 3580`; `views/LessonView/LessonQuiz.tsx:156`;
  `views/RoadmapView/RoadmapView.tsx:576, 715`; `views/placeholders.tsx:653, 800` (+ comentário `644`);
  `views/GamesView/GamesView.tsx:320, 540`; `views/GamesView/GameLevelView.tsx:831`
- Outras larguras do mesmo molde: `680` (`components/course/CourseSelector.tsx:59, 71`,
  `components/tree/EvolutionTree.tsx:258`), `720` (`TrackChallengePanel.tsx:1312, 1353`),
  `760` (`RoadmapView.tsx:613`), `1200` (`ChallengeView.tsx:978`), `520`/`440`/`380` (modais — ver §6)
- Estado vazio centralizado (variante com `alignItems: 'center'` + ícone + título +
  descrição + CTA): `views/LessonView/LessonView.tsx:3544-3559`:

```tsx
<Stack spacing={2} sx={{ p: 2, maxWidth: 640, mx: 'auto', pt: 6, alignItems: 'center' }}>
  <AutoStoriesIcon color="primary" sx={{ fontSize: 56 }} />
  <Typography variant="h6" align="center">…</Typography>
  <Typography variant="body2" align="center" sx={{ color: 'text.secondary', maxWidth: 480 }}>…</Typography>
  <Button variant="contained" …>…</Button>
</Stack>
```

O mesmo formato de “coluna de conteúdo com teto” aparece ainda em
`views/ChallengeView/TrackChallengePanel.tsx:1353` e
`views/LessonView/LessonView.tsx:437` (`LESSON_COLUMN_SX` — hoje sem teto, ver §15).

**Proposta**

- `app/src/lib/designTokens.ts` — secção `LAYOUT`:
  ```ts
  export const LAYOUT = {
    readingColumnPx: 640,   // ~72ch (SC 1.4.8) — o valor repetido 12×
    wideColumnPx: 720,
    panelColumnPx: 760,
    pageMaxPx: 1200,
  } as const;
  ```
  (mantendo coerência com `TYPE.measureCh`/`measureMaxCh`, que hoje não têm
  equivalente em px — é precisamente por isso que `640` foi escrito à mão 12 vezes).
- `app/src/components/ui/CenteredColumn.tsx` (novo): `<CenteredColumn width
  topPad?>` → `<Box sx={{ p: 2, mx: 'auto', maxWidth: … }}>`.
- `app/src/components/ui/EmptyState.tsx` (novo): ícone + título + descrição + CTA
  centrados (o formato de `LessonView.tsx:3544-3559`).
- Em cada uso: `<Box sx={{ p: 2, maxWidth: 640, mx: 'auto' }}>` → `<CenteredColumn>`.

**Muda em cada uso**: 1 linha; o valor `640` passa a viver num token (mudança de
medida de leitura torna-se 1 lugar).

---

## 5. Estilo sr-only — 5 cópias, 4 delas com bug latente (`width: 1` → 100%)

Cinco implementações do “texto só para leitores de tela”, 4 grafias diferentes:

| Ficheiro | Constante | Grafia | Estado |
|---|---|---|---|
| `app/src/views/GamesView/GamesView.tsx:86-98` | `SR_ONLY` | `width: '1px'`, `margin: '-1px'`, `pointerEvents: 'none'` | ✅ correta (fix documentado no comentário) |
| `app/src/components/editor/EditorTabs.tsx:47-58` | `VISUALLY_HIDDEN` | `width: 1, height: 1, m: -1` | ⚠️ bug |
| `app/src/components/shell/SplitDivider.tsx:76-87` | `HIDDEN_HINT_SX` | `width: 1, height: 1, margin: -1` | ⚠️ bug |
| `app/src/views/RoadmapView/RoadmapView.tsx:87-99` | `HIDDEN_STATE_SX` | `width: 1, height: 1, margin: -1` | ⚠️ bug |
| `app/src/views/ChallengeView/ChallengeView.tsx:983-995` | (inline no `sx`) | `width: 1, height: 1, m: -1` | ⚠️ bug |

**Trecho repetido** (o `SR_ONLY` correto, `app/src/views/GamesView/GamesView.tsx:86-98`):

```ts
const SR_ONLY = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
  pointerEvents: 'none',
} as const;
```

**Porque é bug**: aplicado via `sx`, `width: 1`/`height: 1` passam pelo
`sizingTransform` do `@mui/system` (`value <= 1 && value !== 0` → `${value*100}%`),
ou seja viram `100% × 100%`; e `m: -1` vira `theme.spacing(-1)` = `-8px`, não
`-1px`. O comentário do `GamesView` documenta exatamente este bug (régua F104
acusou texto-sobre-texto) — mas o fix só foi aplicado numa das 5 cópias.

**Proposta**

- `app/src/lib/a11yStyles.ts` (novo): `export const SR_ONLY_SX` (a grafia correta,
  incl. `pointerEvents: 'none'`) — um único objeto `as const`.
- Em cada uso: apagar a constante local e `sx={SR_ONLY_SX}`; nas 4 cópias
  corrigir o bug em simultâneo (mudança visual: as caixas phantom deixam de
  ocupar 100% do contentor).

---

## 6. Shell de overlay/modal — 5 cópias do mesmo fixed+scrim+blur+safe-center

`QuizOverlayHost` e `ChallengeGenerateModal` são cópias estruturais (os
comentários cruzam-se: “o MESMO blur do irmão ChallengeGenerateModal” /
“mesma receita do QuizOverlayHost”):

```tsx
<motion.div
  style={{
    position: 'fixed', inset: 0, zIndex: 1300,
    display: 'flex',
    alignItems: 'flex-start',      // centrado SEGURO (comentário ONDA-UX-SCROLL)
    justifyContent: 'center',
    overflowY: 'auto',
    padding: 16,
    background: scrim,             // token palette.scrim
    backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
  }}
  onClick={onDismiss}
>
  <motion.div style={{ width: '100%', maxWidth: 520, margin: 'auto' }}>…</motion.div>
</motion.div>
```

Ocorrências:

- `app/src/components/quiz/QuizOverlayHost.tsx:358-401` (`zIndex: 1300`, card `maxWidth: 520`)
- `app/src/components/challenge/ChallengeGenerateModal.tsx:231-273` (`zIndex: 1300`, card `maxWidth: 440`)
- `app/src/features/onboarding/components/TutorialSelectionModal.tsx:165-190`
  (`zIndex: 14500`, `bgcolor: scrim`, `p: 2`, `Paper` `maxWidth: 520`)
- `app/src/features/onboarding/components/OnboardingOverlay.tsx:565-580`
  (`zIndex: 14000`, fixed inset 0) + `755-765` (backdrop do diálogo de confirmação,
  “o MESMO token das máscaras — era a quarta rgba() crua”)
- Família próxima: `app/src/gate/AppGate.tsx:79-84, 136-138` e
  `app/src/gate/SetupView.tsx:362-374` (`minHeight: '100vh'` + flex center + `p: 2`
  + `Paper variant="outlined" sx={{ maxWidth: 520, width: '100%' }}`) — as duas
  cópias do `AppGate` são **literais idênticas**.

**Proposta**

- `app/src/components/ui/ModalScrim.tsx` (novo): `<ModalScrim zIndex onDismiss
  maxWidth children>` — o `motion.div` fixed + scrim + blur + safe-center + o
  wrapper do card (`width: '100%', maxWidth, margin: 'auto'`). Variantes
  `asMotion` para os dois que animam com `AnimatePresence`.
- `app/src/lib/designTokens.ts` — `Z_INDEX` (ver §12) para os 4 pisos usados.
- Os `blur(6px)` e `padding: 16` passam a constantes do componente (hoje escritos
  2× com o mesmo valor e comentários a jurar que são iguais).

**Muda em cada uso**: os dois `motion.div` + a receita de scroll centrado
(≈25 linhas cada) → `<ModalScrim zIndex={Z_INDEX.modal} …>`.

---

## 7. Seletor `FOCUSABLE` (+ laço de foco) copiado 4×

```ts
/** Tudo que pode receber Tab dentro do diálogo (a lista canónica do laço). */
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
```

- `app/src/components/quiz/QuizOverlayHost.tsx:162-163` (o exemplar)
- `app/src/components/challenge/ChallengeGenerateModal.tsx:106-107` (“cópia do QuizOverlayHost”)
- `app/src/features/onboarding/components/TutorialSelectionModal.tsx:56-57`
- `app/src/features/onboarding/components/OnboardingOverlay.tsx:92-93`
  (“COPIADA do exemplar (QuizOverlayHost.tsx)”)

Os quatro ficheiros implementam ainda o **laço de foco** (`keydown` com
`Shift+Tab`/`Tab` + `focusReturnTarget`) de forma independente
(`OnboardingOverlay.tsx` para os dois painéis; `TutorialSelectionModal.tsx:125-155`).

**Proposta**

- `app/src/lib/focusTrap.ts` (novo):
  - `export const FOCUSABLE_SELECTOR` (a string);
  - `export function getFocusable(root: HTMLElement): HTMLElement[]`;
  - `export function useFocusTrap(opts: { ref, active, onDismiss })` — o laço +
    devolução de foco ao abridor (regra que hoje está escrita 4× e comentada 4×).
- Em cada uso: apagar constante + efeito de `keydown`; fica `useFocusTrap(…)`.
- Ganho para o Storybook: uma única story de “diálogo com laço de foco”.

---

## 8. Linha de cabeçalho de secção/painel — título + chips/ações, ~12 cópias

```tsx
<Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
  <Typography variant="h6" component="h2" sx={{ flexGrow: 1 }}>…</Typography>
  <Chip size="small" variant="outlined" label={…} />
</Stack>
```

- `app/src/views/ChallengeView/ChallengeView.tsx:998-1005` (cabeçalho h4),
  `1135-1139` (h6 + Chip), `1218-1225` (subtitle2 + Chips), `1248-1257`
- `app/src/views/ChallengeView/TrackChallengePanel.tsx:1361-1370`, `1383-1390`
- `app/src/views/RoadmapView/RoadmapView.tsx:315`
- `app/src/features/onboarding/components/OnboardingOverlay.tsx:637`, `722-730`
- `app/src/features/onboarding/components/TutorialSelectionModal.tsx:192-207`
  (título + botão fechar 44×44)
- `app/src/views/SettingsView/SettingsView.tsx:37-44, 49-56, 61-68` (secção h6 +
  descrição — ver §9)
- `app/src/components/course/LessonSidebarHeader.tsx:274`, `app/src/components/shell/SessionFrame.tsx:262`

A variante “título + descrição `body2` `color: 'text.secondary', mb: 1.5`”
repete-se 5× (`SettingsView.tsx:40, 52, 64`, `ProgressPanel.tsx:94`,
`OrphanTracksPanel.tsx:194`).

**Proposta**

- `app/src/components/ui/SectionHeader.tsx` (novo):
  `<SectionHeader title actions? description? level? />` (Stack row + Typography +
  slot de chips/ações + a descrição por baixo).
- `app/src/components/ui/SettingsSection.tsx` (novo): o bloco
  `<section aria-labelledby>` + h6 + descrição — usado 5× em Settings.

---

## 9. Diálogo de confirmação — 4 cópias da mesma estrutura

```tsx
<Dialog open={confirmOpen} onClose={…} aria-labelledby="…-title" maxWidth="xs" fullWidth>
  <DialogTitle id="…-title">…</DialogTitle>
  <DialogContent dividers>…</DialogContent>
  <DialogActions>
    <Button onClick={cancel}>{t('…cancel')}</Button>
    <Button variant="contained" color="error" onClick={confirm} disabled={busy}>…</Button>
  </DialogActions>
</Dialog>
```

- `app/src/views/SettingsView/ProgressPanel.tsx:129-147`
- `app/src/views/SettingsView/OrphanTracksPanel.tsx:266-292`
- `app/src/views/SettingsView/LocalAiPanel.tsx:531-559`
- `app/src/components/editor/FileExplorer.tsx:313-327`

**Proposta**: `app/src/components/ui/ConfirmDialog.tsx` (novo) com props
`open/title/description/confirmLabel/confirmColor/onCancel/onConfirm/busy`;
o id ARIA é gerado internamente. As 4 chamadas ficam com ~6 linhas cada.

---

## 10. Cartão de lista — `Card variant="outlined"` + mesmo `CardContent`

```tsx
<Card variant="outlined">
  <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>…</Typography>
    <Typography variant="caption" sx={{ color: 'text.secondary' }}>…</Typography>
  </CardContent>
</Card>
```

- Padding idêntico `p: 1.5, '&:last-child': { pb: 1.5 }` — 3×:
  `app/src/views/placeholders.tsx:618`, `app/src/views/RoadmapView/RoadmapView.tsx:314`,
  `app/src/views/SettingsView/OrphanTracksPanel.tsx:79`
- Bloco de estado do setup com o mesmo `Card+CardContent+subtitle1 fontWeight:600` — 3×
  em `app/src/views/placeholders.tsx:182-196, 202-210, 223-236`
- Cartão selecionável (`Card` + `CardActionArea` + `CardContent`, comentado como
  “o padrão do SubjectCard”) — `app/src/views/placeholders.tsx:294-325, 617-661`,
  `app/src/views/RoadmapView/RoadmapView.tsx:586-604`
- `fontWeight: 600` em subtítulo — 16 cópias em 13 ficheiros (parte do mesmo idiom)

**Proposta**

- `app/src/components/ui/InfoCard.tsx` (novo): `<InfoCard title subtitle actions
  selectable? icon? />` com o padding canónico (token `CARD_PADDING = '12px'` /
  `p: 1.5`) — 1 story cobre os 9 usos.
- O `fontWeight: 600` do subtítulo vira parte do componente (ou uma variante de
  tipografia do tema).

---

## 11. Vocabulário de raio duplicado — `borderRadius: n` vs `SHAPE.*`

Duas linguagens para o mesmo conceito, ~16 vs ~17 ocorrências:

- Escala numérica (× `theme.shape.borderRadius` = 12px): `borderRadius: 1` (=12px,
  `RoadmapView.tsx:194`, `LocalAiPanel.tsx:82`, `LessonView.tsx:4399, 4560`,
  `ChallengeView.tsx:1306`, `TutorialSelectionModal.tsx:269`, `OnboardingOverlay.tsx:689, 708`),
  `borderRadius: 2` (=**24px — fora da rampa SHAPE 8/12/18**, `LessonQuiz.tsx:166`,
  `TrackChallengePanel.tsx:1430`, `ChallengeGenerateModal.tsx:316`,
  `TutorialSelectionModal.tsx:190`, `OnboardingOverlay.tsx:628, 775`),
  `borderRadius: 1.5` (=18px, `ChallengeGenerateModal.tsx:358`),
  `borderRadius: 3` (=36px, `LessonSidebarHeader.tsx:321`)
- Tokens explícitos: `` borderRadius: `${SHAPE.sm}px` `` etc. — 17 usos
  (`GameLevelView.tsx:161, 272, 341, 405, 514`, `GamesView.tsx:219`,
  `placeholders.tsx:429`, `LessonView.tsx:696`, `QuizOverlayHost.tsx:419, 498`,
  `NavigationRail.tsx:179`, `SessionFrame.tsx:318`, `MarkdownView.tsx:109`,
  `SplitDivider.tsx:229`, `CodeBlock.tsx:205`, `GlobalBusyIndicator.tsx:101`,
  `chatSurfaces.tsx:192`)

`designTokens.SHAPE` define a rampa `sm=8 / md=12 / lg=18 / pill=999`; a escala
numérica produz 12/24/36, ou seja `borderRadius: 2` e `3` **não pertencem à rampa**
e `borderRadius: 1` duplica `SHAPE.md` sob outro nome.

**Proposta**

- Adotar **só** `SHAPE` (com helper `shapeRadius('md')` → `theme.vars.shape…` ou
  template `` `${SHAPE.md}px` ``) e substituir os numéricos;
- Se 24px/36px são intencionais, acrescentá-los explicitamente a `SHAPE`
  (`xl: 24`?) para a rampa voltar a fechar;
- Em `MicButton.tsx:53, 65` / `SpeakButton.tsx:96` há ainda `borderRadius: 999`
  cru (ver §14).

---

## 12. `zIndex` mágicos — 8 valores literais em 7 ficheiros

| Valor | Onde | Papel |
|---|---|---|
| `1300` | `components/challenge/ChallengeGenerateModal.tsx:241`, `components/quiz/QuizOverlayHost.tsx:369` | modal/overlay |
| `1400` | `components/shell/GlobalBusyIndicator.tsx:86` | pílula de ocupação (documentado em `App.tsx:112` como “1400 > 1300”) |
| `14000` | `features/onboarding/components/OnboardingOverlay.tsx:572` | overlay do tutorial |
| `14500` | `features/onboarding/components/TutorialSelectionModal.tsx:172` | modal de seleção do tutorial |
| `40` | `views/LessonView/LessonView.tsx:4463` | overlay do visualizador de fontes |
| `10` | `views/ChallengeView/ChallengeView.tsx:1408`, `views/GamesView/GameLevelView.tsx:901` | barra sticky |

A ordem relativa vive em **comentários** (“flutua acima do overlay do quiz
(zIndex 1400 > 1300)”), não em código.

**Proposta**: `app/src/lib/designTokens.ts` →

```ts
export const Z_INDEX = {
  stickyBar: 10, contentOverlay: 40,
  modal: 1300, busy: 1400, tutorial: 14000, tutorialModal: 14500,
} as const;
```

com um comentário de contrato (ordem total). Os 8 literais passam a referências;
`AppGate`/`GlobalBusyIndicator` param de depender de conhecimento externo.

---

## 13. Constantes de animação/quiz duplicadas

- `REDUCED_VARIANTS` (fade puro para `prefers-reduced-motion`) — 2 cópias
  idênticas: `components/quiz/QuizOverlayHost.tsx:155-160`,
  `components/challenge/ChallengeGenerateModal.tsx:99-104` (“mesmo padrão do
  QuizOverlayHost”). **Proposta**: mover para `app/src/lib/animationTokens.ts`
  (que já exporta `springs`/`fadeInUp`/`windowVariants`/`scaleIn`) como
  `export const reducedFadeVariants`.
- `pillOutline` (`color-mix(in srgb, ink N%, transparent)`) recalculado à mão em
  dois pontos com percentagens diferentes: `views/LessonView/LessonQuiz.tsx:148`
  (72%) e `components/quiz/QuizOverlayHost.tsx:266` (55%). **Proposta**:
  `app/src/lib/quizPill.ts` → `quizPillOutline(theme, pct)` com os valores
  nomeados (`PILL_OUTLINE.overlay`, `PILL_OUTLINE.card`).

---

## 14. `MicButton` / `SpeakButton` — pílula e erro duplicados FORA do tema

`app/src/components/voice/MicButton.tsx:51-76` e
`app/src/components/voice/SpeakButton.tsx:92-100` repetem o mesmo estilo com
`style` inline (não `sx`), sem tokens e com cores cruas — contra o contrato do
`designTokens.ts`:

```tsx
<button style={{ borderRadius: 999, padding: '8px 18px', cursor: 'pointer' }}>…</button>
…
{error && <span style={{ fontSize: 12, color: '#d33' }}>{error}</span>}
```

Cores cruas: `#d33`, `#999`, `#555`, `rgba(128,128,128,0.3)`; textos fixos em
português (fora do i18n). Os dois componentes **não são importados por nenhuma
view** (só se referenciam entre si e num comentário de
`shared/constants/ttsModels.constants.ts:201`) — são código morto/legado.

**Proposta**: apagar os dois ficheiros (ou reescrever com MUI + tokens +
`ActionButton` do §2 se a voz voltar à UI). Se se mantiverem, o estilo da pílula
e o span de erro passam a `designTokens.SHAPE.pill` + `error.accentText`.

---

## 15. O que já está DRY (não mexer)

Curto, para proteger na refatoração:

1. **`app/src/components/chat/chatSurfaces.tsx`** — `ChatAvatar`, `bubbleShellStyle`,
   `bubbleRestShadow`, `bubbleRadius`, `CHAT_AVATAR_SIZE`, `BUBBLE_PADDING`,
   `USER_BUBBLE_TINT_PCT`, `TUTOR_AVATAR_SURFACE` — consumido por
   `ChatBubble.tsx` e `TypingIndicator.tsx`. É o modelo a seguir.
2. **`app/src/lib/animationTokens.ts`** — `springs`, `transitions`, `fadeInUp`,
   `windowVariants`, `scaleIn` usados em 8 ficheiros; os tokens de movimento já
   são partilhados (só a *casca* JSX é que está copiada — §2).
3. **`app/src/lib/designTokens.ts` + `app/src/theme.ts`** — superfícies/acentos/
   `SHAPE`/`MOTION`/`TYPE`, mais `modalSurfaceStyles`, `focusRingStyles`,
   `FOCUS_RING`, `spatialTransition`/`effectsTransition`; o shell e os overlays
   já os usam de forma consistente (`theme.vars.*`, sem ternários de `palette.mode`).
4. **`app/src/views/LessonView/LessonView.tsx:437` `LESSON_COLUMN_SX`** e
   **`:481` `lessonLogSx(theme)`** — largura da coluna e estilo do log exportados
   e testados como única fonte (não duplicar nas views irmãs).
5. **`app/src/components/shell/SplitDivider.tsx`** — a divisória é uma só,
   reutilizada pelo shell (`App.tsx`) e pelo desafio (mesmo contrato APG).
6. **`app/src/components/markdown/`** (`MarkdownView`, `CodeBlock`) — renderizador
   único para prosa e desafios (substituiu duplicação antiga).
7. **`app/src/lib/validationAlert.ts`** — a decisão severity/i18n do `Alert` é
   pura e única (`KeysPanel`); manter como está.
8. **Espaçamento por `theme.spacing`** — `gap: 1|0.5|2…` está tokenizado pelo
   tema em toda a base (o único gap em px cru é `views/GamesView/GameLevelView.tsx:493`,
   `gap: '3px'`); não há “zoo” de gaps a consolidar.

---

## 16. Plano de consolidação sugerido (ordem de execução)

Fase A — tokens (sem mudança visual, 1 PR):
`designTokens.ts` ganha `TARGET`, `LAYOUT`, `Z_INDEX`; `animationTokens.ts` ganha
`reducedFadeVariants`; `lib/a11yStyles.ts` e `lib/focusTrap.ts` nascem.

Fase B — componentes `app/src/components/ui/` (com stories desde o início):
`Pressable`/`ActionButton`, `LoadErrorState`/`RetryAlert`, `CenteredColumn`,
`EmptyState`, `ModalScrim`, `SectionHeader`/`SettingsSection`, `ConfirmDialog`,
`InfoCard`.

Fase C — migração uso a uso (o diff é maior em `LessonView.tsx`,
`TrackChallengePanel.tsx`, `ChallengeView.tsx`), incluindo a correção do bug
sr-only (§5) e a normalização do raio (§11).

Estimativa de ficheiros tocados pela consolidação completa: **≈35 ficheiros
existentes** (13 em `views/`, 16 em `components/`, 2 em `features/onboarding/`,
2 em `gate/`, 2 em `lib/`) + **8–10 ficheiros novos** em `components/ui/` e `lib/`.