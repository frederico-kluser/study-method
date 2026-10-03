# Design read

The capture shows the app's left navigation rail at its shipped width (104px): a sliders icon above a label that is forced to break mid-word into "Configuraç / ões", and an adjacent element ("N…") hard-clipped at the right edge of the rail boundary. This is not a font or translation accident — it is a deterministic layout failure with a paper trail in the code. `NavigationRail.tsx:167-168` sets `whiteSpace: 'normal'` + `overflowWrap: 'anywhere'` on the tab label, explicitly permitting mid-word breaks, while `RAIL_WIDTH = 104` (`NavigationRail.tsx:57`) leaves only an 84px content box for the label (104 − 2×6 `marginInline` − 2×4 `paddingInline`). The label "Configurações" at the theme's caption size (14px — `theme.ts:823-826`, scale −1 ≈ 14.06→14px) needs ≈88–92px. The code comment at `NavigationRail.tsx:50-55` even admits the word does not fit ("porque o rótulo é palavra inteira em pt-BR ('Configurações' não, mas 'Início'/'Trilha' sim)") — the layout was documented as failing and shipped anyway, with a misapplied SC 1.4.12 rationale (F104 concerns user-applied text-spacing stress; it does not license guaranteed daily mid-word breaks in the primary locale).

Every other rail item ("Início", "Aula", "Trilha") fits today only because it is short; the failure is structural (box size + wrap policy), so it will recur with any longer label (e.g. "Ajuda e tutorial"), any font-fallback, or any text-spacing stress. There is no Tooltip anywhere in the rail, so the broken string has no recovery affordance — while the i18n file already carries orphaned `shell.rail.expand`/`collapse` strings (`pt-BR/translation.json:679-680`) for a collapse mode that does not exist. Underneath the visible bug the rail is otherwise well engineered: AA-verified contrast, ≥44px targets, a two-colour focus ring with reserved gutter, correct tablist semantics with arrow-key navigation, and reduced-motion handling. The fix is therefore narrow and cheap — but the shell's horizontal budget decides which fix is legal: the lesson composer's worst-case column (documented arithmetic in `tests/composerMinWidth.test.ts:261-285`) has only **8px of slack** at the Electron window `minWidth: 900` (`app/electron/main/index.ts:268`). Widening the rail to a "labels fit" width (120–128px) either evaporates that slack or breaks the composer floor outright. The correct pattern for this shell is **icon-only rail (M3 narrow, 80px) + MUI Tooltip + `aria-label`** — the same pattern the app already uses and documents for the theme selector ("o ícone sozinho merece nome", `ThemeModeSelector.tsx:19`).

# Score (interface_type, overall_score, band)

`interface_type: desktop navigation rail (Electron + MUI/Emotion shell chrome) · overall_score: 48 · band: fair`

100 − 15 (1 critical) − 28 (4 warnings) − 9 (3 suggestions) = **48 / 100 — fair (40-64)**.

# Findings

## finding-1 (critical, F.1.1.02 cognitive-load — nav label breaks mid-word)

**message.** The primary-locale label of a primary navigation destination renders as the non-word fragment "Configuraç / ões" (`3-configuracoes-rail.webp`). Mid-word wrapping on a nav label is a bug, not a feature: it destroys word-shape recognition (the fastest channel for scanning a rail), adds decoding load on every visit, and reads as a broken app. Root cause is a wrap policy, not a width accident: `whiteSpace: 'normal'` + `overflowWrap: 'anywhere'` authorise the break at `NavigationRail.tsx:167-168`. The F104/SC 1.4.12 argument in the surrounding comment (`:161-166`) is misapplied — SC 1.4.12 governs user-applied text-spacing stress, not a licence to shatter labels under default rendering. With the label broken and no Tooltip (finding-4), the destination name has no recovery path for a first-time user.

**remediation.** Remove the wrap-anywhere policy from rail labels entirely. Preferred: drop visible labels (icon-only rail + Tooltip + `aria-label`, fix-spec step set A). Fallback if product insists on labels: `whiteSpace: 'nowrap'` + `textOverflow: 'ellipsis'` + Tooltip — never `overflow-wrap` on nav chrome.

**targets:**
- `app/src/components/shell/NavigationRail.tsx:167-168` -> delete `whiteSpace: 'normal'` and `overflowWrap: 'anywhere'` (and the now-false comment `:161-166`).
- `app/src/components/shell/NavigationRail.tsx:212` -> `label={t(item.i18nKey)}` becomes `aria-label={t(item.i18nKey)}` (icon-only) or a one-line ellipsised span (fallback).

## finding-2 (warning, D.2.1.02 visual-hierarchy — rail width budget mismeasured against its own content)

**message.** The width is 20px too small for its widest content: `RAIL_WIDTH = 104` (`NavigationRail.tsx:57`) minus `marginInline: 6px`×2 (`:152`, from `RAIL_ITEM_GUTTER = 2+3+1`, `:76`) minus `paddingInline: 4px`×2 (`:154`) leaves an **84px** label box, while "Configurações" at caption 14px (`theme.ts:823-826`) needs ≈88–92px. The header comment (`:50-55`) documents the misfit instead of fixing it. Consequence: the wrapped item grows past `minHeight: 76` (`:60`, minHeight is a floor) while siblings stay at 76 — the captured settings item is visibly taller, breaking the rail's vertical rhythm (D.2.1.02).

**remediation.** Either fit labels structurally (icon-only, recommended) or size the box from the longest label with headroom; never let a nav item's height depend on its label length.

**targets:**
- `app/src/components/shell/NavigationRail.tsx:57` -> `const RAIL_WIDTH = 80;` (icon-only; M3 narrow rail) — or `120` max in the labelled fallback (see fix spec; `128` is forbidden, see finding-3 math).
- `app/src/components/shell/NavigationRail.tsx:50-56` -> rewrite the comment: it currently rationalises a known break.

## finding-3 (warning, C.1.1.01 consistency-standards — i18n robustness is inverted; primary locale is the broken one)

**message.** pt-BR is the primary locale and is the one that breaks; en ("Settings", 8 chars ≈ 56px) fits comfortably (`en/translation.json:5`, `pt-BR/translation.json:4`). The layout is therefore tuned to the *secondary* locale. Robustness is structural: any future longer label ("Ajuda e tutorial" ≈ 110px) re-breaks the rail even after a modest widening, and SC 1.4.12 text-spacing stress (+0.12em ≈ +15px on 13 glyphs) re-breaks a 120px rail too. The shell's horizontal budget forbids "just widen it": worst-case lesson-composer column = (900 − RAIL − 6) × 0.5 − 64 with a 323px floor (`tests/composerMinWidth.test.ts:261-285`, window `minWidth: 900` at `app/electron/main/index.ts:268`); RAIL=104 → 331 (8px slack), RAIL=120 → 323 (**zero** slack), RAIL=128 → 319 (**breaks the composer**), RAIL=80 → 343 (20px slack).

**remediation.** Choose the fix that makes label length irrelevant to layout: icon-only rail with Tooltip + `aria-label` (recommended), or nowrap + ellipsis + Tooltip. Treat locale width as unbounded input; never size chrome to one locale.

**targets:**
- `app/src/components/shell/NavigationRail.tsx:57` + `app/src/components/shell/NavigationRail.tsx:204-215` -> see fix spec §NavigationRail.
- `app/tests/composerMinWidth.test.ts:261-285` -> update `RAIL_PX` and the `331` account in lockstep (fix spec §composerMinWidth).

## finding-4 (warning, F.1.1.03 mental-model — no tooltip on any rail item; naming affordance missing exactly where it is needed)

**message.** `NavigationRail.tsx` imports no Tooltip; the only name affordance is the label, and the label is the thing that is broken (finding-1). The moment labels truncate (ellipsis fallback) or collapse (icon-only), a Tooltip is mandatory — and the app already codified this rule for icon-only controls in the theme selector ("Tooltip por segmento (o ícone sozinho merece nome)", `ThemeModeSelector.tsx:19`). The i18n files even ship `shell.rail.expand`/`shell.rail.collapse` strings (`pt-BR/translation.json:679-680`) that nothing consumes — evidence the tooltip/collapse affordance was planned and dropped.

**remediation.** MUI `<Tooltip>` on every rail item (hover **and** keyboard focus), `title` = the translated nav label, `placement="right"`. Keep `aria-label` on the Tab so the accessible name survives independently of the Tooltip.

**targets:**
- `app/src/components/shell/NavigationRail.tsx:204-215` -> wrap each `<Tab>` in `<Tooltip title={t(item.i18nKey)} placement="right">`.
- `app/src/i18n/locales/pt-BR/translation.json:679-680` (and `en/translation.json` `shell.rail`) -> either consume `expand`/`collapse` in a future collapsible rail or delete the orphans (cleanup, not blocking).

## finding-5 (warning, D.2.1.02 visual-hierarchy — neighbouring content hard-clipped at the rail boundary)

**message.** The capture shows an adjacent element ("N…") sliced at the rail's right border with zero gutter between the rail's 1px `borderRight` (`NavigationRail.tsx:133`) and the next column. Part of the clipping is the tight 121px recon crop, but the boundary itself is genuinely unforgiving: the sidebar column is `width: basisPx` + `minWidth: 0` (`SessionFrame.tsx:220-228`) and hides inline overflow by policy ("a coluna é rolável no eixo de bloco e esconde o eixo inline", asserted at `tests/shellSplitUi.test.ts:244-246`), so anything that cannot wrap is *cut*, not ellipsised. At the minimum window (900px) with the persisted split (`DEFAULT_SHELL_SPLIT_RATIO = 0.2`, max 0.5 — `splitRatio.ts:125,585`) the neighbour column can be as narrow as ≈159px, where fixed-width controls and first words ("N…") clip against the rail border.

**remediation.** Keep the sidebar's "wrap, never truncate" policy for text (it is correct there), but give fixed-width chrome (segmented control, icon buttons) shrink behaviour or a min-width budget, and re-verify the rail/next-column seam at window 900 + split 0.5. Icon-only rail (80px) reclaims 24px and eases the seam.

**targets:**
- `app/src/components/shell/SessionFrame.tsx:220-228` -> add `minWidth` guard for fixed-width children of the sidebar column (or `overflowX: 'auto'` instead of `hidden` for the controls row).
- `app/src/components/shell/NavigationRail.tsx:57` -> width reclaimed via fix spec (secondary benefit).

## finding-6 (suggestion, F.1.1.03 mental-model — Settings uses a sliders icon, not a gear)

**message.** `NAV_ICON.settings = <TuneRoundedIcon />` (`NavigationRail.tsx:90`). Sliders/tune conventionally reads "adjustments/filter/tuning"; the near-universal convention for Settings is the gear (`SettingsRoundedIcon`). Users scanning for settings look for the gear first (mental model, F.1.1.03) — doubly important in an icon-only rail.

**remediation.** Swap to `SettingsRoundedIcon` when going icon-only; keep `TuneRoundedIcon` only if the product deliberately brands Settings as "tuning your tutor".

**targets:**
- `app/src/components/shell/NavigationRail.tsx:40,90` -> `import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';` + `settings: <SettingsRoundedIcon />`.

## finding-7 (suggestion, C.1.1.01 consistency-standards — mixed icon families across shell chrome)

**message.** The rail uses the `*Rounded` set consistently (`NavigationRail.tsx:39-42`), but the theme selector in the same shell chrome uses the non-rounded default set: `DarkModeIcon`, `LightModeIcon`, `SettingsBrightnessIcon` (`ThemeModeSelector.tsx:53-55`). Same chrome level, two icon styles — a quiet consistency crack (C.1.1.01).

**remediation.** Standardise shell chrome on one family (`*Rounded`), including the scroll-button chevrons that `scrollButtons="auto"` (`NavigationRail.tsx:117`) may inject at short window heights.

**targets:**
- `app/src/components/theme/ThemeModeSelector.tsx:53-55` -> `DarkModeRounded` / `LightModeRounded` / `SettingsBrightnessRounded`.

## finding-8 (suggestion, D.2.1.02 visual-hierarchy — item heights drift with label length)

**message.** `minHeight: 76` is a floor; the two-line broken label pushes the settings item to ≈79px+ while siblings sit at 76, so the rail's item rhythm varies with translation length (visible in the capture: the broken item is taller). Any future longer label widens the drift.

**remediation.** Icon-only makes all items identical by construction; in the labelled fallback set a fixed `height` (not minHeight) or keep `whiteSpace: 'nowrap'` so a label can never grow its item.

**targets:**
- `app/src/components/shell/NavigationRail.tsx:149-155` -> after icon-only, keep `minHeight: RAIL_ITEM_MIN_HEIGHT` (now deterministic); fallback: `height: RAIL_ITEM_MIN_HEIGHT` + nowrap label.

# Strengths

- **Contrast verified AA (Part 6):** `text.secondary` on `surface.level3` measures 5,93:1 (light) / 6,10:1 (dark); `text.primary` 12,82:1 / 11,07:1 (`designTokens.ts:161-179`) — both clear 4.5:1. The accent-as-fill-only rule for chrome levels is documented and correct (`NavigationRail.tsx:24-28,135-137`).
- **Fitts's Law (I.2.2.02) passes comfortably:** items are ≥76px tall × ~92px wide (`NavigationRail.tsx:60,149-153`) — far above the 44px floor; `:active` scale feedback is a nice touch.
- **Focus visibility is exemplary:** two-colour ring (`focusRingStyles`, `theme.ts:457-467`) with a computed gutter (`RAIL_ITEM_GUTTER = offset+width+1`, `NavigationRail.tsx:76`) so the ring is never clipped by the scroller — including reduced-motion handling (`:198-201`).
- **Correct semantics + keyboard nav:** `<Tabs orientation="vertical">` gives `role="tablist"/"tab"`, `aria-orientation`, arrow-key/Home/End navigation and roving tabindex for free; `id`/`aria-controls`/`aria-labelledby` wiring is centralised and tested (`shellNav.ts:100-107`, `tests/shellNavPanel.test.ts:210,306-328`). The "phantom panel" (challenge without a tab → no tab selected) is a genuinely thoughtful edge case.
- **Engineering culture:** the worst-case composer arithmetic is pinned by a unit test (`tests/composerMinWidth.test.ts`) and the sidebar "wrap, never truncate" policy is enforced by `tests/shellSplitUi.test.ts:236-239` — the fixes below plug into that discipline instead of fighting it.

# Fix spec (implementation-ready)

**Chosen pattern: icon-only rail (M3 narrow, 80px) + MUI Tooltip + `aria-label`.**
Why not "widen so labels fit": fitting "Configurações" on one line needs a label box ≥90px → `RAIL_WIDTH` ≥ 112, comfortable at 120. But the shell's horizontal budget is already over-committed: the lesson composer's worst-case column is (900 − RAIL − 6) × 0.5 − 64 against a hard 323px floor (`tests/composerMinWidth.test.ts:261-285`). At RAIL=120 slack hits **0px**; at 128 the composer **overflows** at the supported minimum window. At RAIL=80 the worst case improves to 343px (+20px slack). Icon-only also makes label length a non-issue for every locale and future label ("Ajuda e tutorial"), matches M3 narrow rail and the VS Code activity-bar reference the project itself cites (`shellNav.ts:63`), and reuses the app's own established pattern ("o ícone sozinho merece nome", `ThemeModeSelector.tsx:19`). Accessible names are preserved via `aria-label`, so the ~35 e2e `getByRole('tab', { name })` call sites keep passing.

## file: app/src/components/shell/NavigationRail.tsx

1. **Line 57** — `const RAIL_WIDTH = 104;` -> `const RAIL_WIDTH = 80;` (M3 narrow rail). Update the comment block `:49-56` to state: icon-only rail; labels live in `aria-label` + Tooltip; width is not label-dependent.
2. **Lines 44** — add `import Tooltip from '@mui/material/Tooltip';`.
3. **Lines 88-93** — (finding-6, optional but recommended) `settings: <SettingsRoundedIcon />` with the matching import replacing `TuneRoundedIcon` at `:40`.
4. **Lines 161-168** — delete the comment and both `whiteSpace: 'normal'` and `overflowWrap: 'anywhere'`. No wrap policy remains on nav chrome (nothing left to wrap).
5. **Lines 192-194** — `'& .MuiTab-icon': { marginBottom: 0 }` (icon-only: no label beneath the icon; keeps the 24px glyph optically centred in the 76px item).
6. **Lines 204-215** — replace the map body with Tooltip-wrapped, label-less tabs:

```tsx
{NAV_ITEMS.map((item, i) => (
  <Tooltip key={item.key} title={t(item.i18nKey)} placement="right">
    <Tab
      id={navTabId(item.key)}
      aria-controls={item.key === active ? panelId : undefined}
      aria-label={t(item.i18nKey)}
      icon={NAV_ICON[item.key]}
      value={i}
    />
  </Tooltip>
))}
```

Notes: MUI `Tooltip` shows on hover **and** keyboard focus by default (keep `disableFocusListener` unset); `Tab` (ButtonBase) forwards the ref Tooltip needs. Keep `aria-label` on the Tab (never rely on Tooltip for the accessible name). Everything else — indicator (`:138-147`), hover/selected/active (`:174-184`), focus ring (`:188-189`), reduced-motion (`:198-201`), `data-onboarding-target` (`:125`) — stays untouched.

**Fallback (only if product rejects icon-only):** `RAIL_WIDTH = 120` **max** (128 breaks the composer floor — see finding-3), keep `label={t(item.i18nKey)}` but render it in a span with `whiteSpace: 'nowrap'`, `overflowWrap: 'normal'`, `hyphens: 'none'`, `overflow: 'hidden'`, `textOverflow: 'ellipsis'`, `display: 'block'`, `maxWidth: '100%'`, wrapped in `<Tooltip title={t(item.i18nKey)}>` for the truncated case. Never reintroduce `overflow-wrap` on rail labels.

## file: app/tests/composerMinWidth.test.ts

1. **Line 16** — comment: `− rail 104` -> `− rail 80`.
2. **Line 262** — `const RAIL_PX = 104;` -> `const RAIL_PX = 80;` (and line 261's docstring).
3. **Line 270** — comment `janela 900, rail 104` -> `rail 80`.
4. **Lines 275-285** — the account becomes `(900 − 80 − 6) × 0.5 − 32 × 2 = 343`; update the assertion `PIOR_COLUNA_PX === 331` to `343` and its message.
5. **Line ~290** — `323 ≤ 331` becomes `323 ≤ 343` (slack 20px); update the assertion message at **line 356** accordingly.

## file: app/tests/e2e/perf-settings.spec.ts

1. **Line 74** — `tab.textContent?.includes('Configurações')` -> `tab.getAttribute('aria-label')?.includes('Configurações')` (icon-only tabs have empty textContent; the name now lives in `aria-label`). Lines 84/137 (`h1` checks) are unaffected.

## file: app/tests/shellNavPanel.test.ts

1. **Lines 256-259** — these `html.includes(ptBR.nav.*)` assertions stay green (the label strings still appear inside `aria-label="…"`), but they no longer verify a *visible* label. Strengthen to `assert.ok(html.includes(\`aria-label="${ptBR.nav.settings}"\`), …)` (and same for home/lesson/roadmap) so a future silent drop of `aria-label` fails the suite.
2. **Lines 323-328** — the "exactly one `<Tab … />`" regex still matches with the Tooltip wrapper (the pattern matches the self-closing `<Tab … />` only); no edit, but re-run to confirm.

## file: app/src/i18n/locales/pt-BR/translation.json + en/translation.json

1. **No changes required** for the fix — Tooltip and `aria-label` reuse `nav.*` (`pt-BR:3-7`, `en:3-8`). Optional cleanup: `shell.rail.expand` / `shell.rail.collapse` (`pt-BR:679-680`) are orphaned; either wire them to a future collapsible rail or delete them in both locales.

## file: app/src/components/theme/ThemeModeSelector.tsx (optional, finding-7)

1. **Lines 53-55** — swap to `DarkModeRounded` / `LightModeRounded` / `SettingsBrightnessRounded` for one icon family across shell chrome.

## files with NO change needed

- `app/src/lib/designTokens.ts` — contrast tokens already AA-verified (values cited in Strengths).
- `app/src/index.css` — contains no rail styles (only typography notes); nothing to edit.
- `app/src/lib/shellNav.ts` — label/i18n wiring is already the single source of truth (`:65-70`); no edit.
- `app/src/components/shell/ShellSidebarSlot.tsx` — portal mechanics unaffected by rail changes.

# Tests at risk

| Test | Coupling | Effect of fix |
|---|---|---|
| `app/tests/composerMinWidth.test.ts:16,261-285,356` | Hard-codes `RAIL_PX = 104` and asserts worst column `331`, `323 ≤ 331` | **Fails** on any width change; update per fix spec (80 → 343, slack 20) |
| `app/tests/e2e/perf-settings.spec.ts:74` | `tab.textContent?.includes('Configurações')` | **Fails** under icon-only (empty textContent) → switch to `aria-label` |
| `app/tests/shellNavPanel.test.ts:256-259` | Asserts label strings present in rail SSR HTML | **Passes** (string now inside `aria-label`) but weakens; strengthen to exact `aria-label="…"` |
| `app/tests/shellNavPanel.test.ts:323-328` | Regex `/<Tab[\s\S]*?\/>/` count = 1 | **Passes** (Tooltip wraps, Tab stays self-closing) — re-verify |
| `app/tests/e2e/e2e-nav-history.spec.ts:52,57,74,75,89`; `e2e-offline.spec.ts:30,33`; `e2e-setup-timeout.spec.ts:133`; `e2e-settings.spec.ts:42`; `e2e-gate.spec.ts:46`; `e2e-cadeado.spec.ts:109,165`; `e2e-lesson.spec.ts:312,372`; `e2e-onboarding.spec.ts:95`; `more-flows.spec.ts:41-86`; `e2e-i18n.spec.ts:24,32-33`; `tests/e2e/helpers-real.ts:97,212,276`; `e2e-desafio-retomar.spec.ts:346-347` | `getByRole('tab', { name: 'Configurações' \| 'Aula' \| 'Trilha' \| 'Início' \| 'Home' \| 'Lesson' \| … })` (~35 call sites), incl. `exact: true` in `switchTab` | **Pass** via `aria-label` (accessible name preserved verbatim; `exact: true` matches the full aria-label). Spot-check `e2e-desafio-retomar.spec.ts:347` and `e2e-i18n.spec.ts:24-33` (locale switch must update `aria-label`) |
| `app/tests/shellSplitUi.test.ts:236-239` | Asserts `overflow-wrap:anywhere` present and **no** `white-space:nowrap`/`text-overflow:ellipsis` | **Unaffected** — scoped to `renderSidebar` (SessionFrame), not the rail. Only relevant if the labelled *fallback* is taken and someone renders rail+sidebar in one SSR test |
| `app/tests/shellNavPanel.test.ts:210` | "4 tabs, all unselected" for challenge panel | **Unaffected** (item count unchanged) |

No unit test asserts `RAIL_WIDTH` itself except `composerMinWidth.test.ts`; no e2e screenshot snapshots of the rail were found. Onboarding copy (`pt-BR/translation.json:580,610-611`: "Clique na aba Configurações") stays truthful — the spotlight target `data-onboarding-target="nav-tabs"` (`NavigationRail.tsx:125`) is preserved — but consider rewording to "ícone de Configurações" once the rail is icon-only.
