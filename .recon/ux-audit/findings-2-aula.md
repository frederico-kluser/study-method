# Design read

**Target:** lesson sidebar/header panel "Study Method: Tutor" during a lesson (screenshot `.recon/ux-audit/2-aula.webp`, 698x430), implemented by `app/src/components/course/LessonSidebarHeader.tsx` (portal-rendered into the shell sidebar slot by `app/src/views/LessonView/LessonView.tsx:4248-4271`), plus the shell status well below it (`app/src/components/shell/SessionFrame.tsx`).

**Anatomy observed, top → bottom (screenshot):**

1. Shell chrome: app title "Study Method: Tutor" (h6/700) + hairline `Divider` (SessionFrame, not this panel).
2. "Curso: C Iniciante: do primeiro printf ao programador C de arquivos" — caption 12px, `text.secondary`.
3. h1 "A porta do programa" — h6 18px/700, `text.primary`, wraps.
4. Summary, body2 `text.secondary`, 2 lines: *"Todo programa C começa a rodar pela função main — é o programa de fora quem chama, pelo nome, a função que você escreve inteira."* (contains an em-dash).
5. Theory progress: a 6px rounded gray bar at 0% + caption "Seção 0 de 3" stacked under it.
6. Action row: two outlined pill buttons — "🏆 Desafios" (accent-blue border + accent trophy glyph) and "📖 Fontes" (neutral border, dark book glyph), both ~44px tall, size="small" type.
7. "Não entendeu? Revisar:" (caption, secondary) + one outlined chip "A primeira linha na tela" (clickable, wraps, 44px min height).
8. Shell status well on a level-4 surface: HUD label "ASSUNTO" (13px/700, +0.08em letterspacing) over the value "o-esqueleto".

**What the eye sees vs. what the code is:** the "emoji" in the buttons are NOT literal emoji — they are MUI SVG icons `EmojiEventsIcon` (trophy) and `AutoStoriesIcon` (open book) (`LessonSidebarHeader.tsx:105-106, 311, 335`). They *read* as emoji because of the metaphor (a colored trophy next to a label is the 🏆 idiom) and because the trophy is accent-tinted while the book is ink-tinted. Literal emoji DO exist elsewhere in copy (`lessonCompleted: "Aula concluída! 🎉"`, `doneMarked: "Concluída ✓"`), while the project's own tests forbid celebratory text in feedback (`quizStalledExit.test.ts:625`, `quizOverlayWiring.test.ts:709` "sem confete de texto") — the tone policy is sober tutor, not gamified coach.

**Information architecture:** one column mixing four jobs — orientation (course/lesson/summary), feedback (progress), primary actions (Desafios/Fontes), and remediation navigation (prerequisite chips). The shell "ASSUNTO" well sits 12px below and reads as a fifth block of the same panel although it is global session chrome.

**Spacing rhythm:** block gap 12px (`theme.spacing(1.5)`), intra-block gap 4px (0.5), chips row gap 8px (1). Rhythm is consistent but flat: every group is equally distant, so "prerequisites" (navigation away) has the same visual weight as in-lesson actions.

**Contrast:** the token ramp is measured AAA/AA across five surface levels (`designTokens.ts:160-185`; `INK_LIGHT.secondary × SURFACE_LIGHT.level3 = 5.93:1`), so text contrast is a non-issue here. The weak non-text case is the 0% progress bar (see finding-2).

**Narrow widths / i18n:** the "wrap, never clip" policy (SC 1.4.12) is real and e2e-proven at the 180px pane floor (`tests/e2e/e2e-sidebar-aula-spacing.spec.ts`); labels wrap instead of ellipsizing. The residual risk is *mid-word* wrapping (`overflow-wrap: anywhere`) and how EN strings behave under +30% inflation.

# Score

- **interface_type:** `navigation` (note: lesson context/progress panel inside an AI-tutor shell; closest of the allowed types — it orients, reports progress, and routes to challenges/sources/previous lessons).
- **overall_score:** 54
- **band:** fair
- Formula: 100 − (4 × warning −7) − (6 × suggestion −3) = 100 − 28 − 18 = 54.
- **api_enriched:** false (`UXUI_API_KEY` not set; framework applied from internal knowledge of uxuiprinciples).

# Findings

## finding-1 (warning, F.1.1.03 mental-model) — "Seção 0 de 3" names a section that does not exist

**message.** The counter is `Seção {{current}} de {{total}}` fed with `chat.presentedSections.length` (`LessonView.tsx:4266`), i.e. *sections already presented*, but the label frames it as an ordinal position ("section 0 of 3"). Before "Começar aula" the user reads "Seção 0 de 3" — a phantom zeroth section; mid-lesson "Seção 1 de 3" is ambiguous between "you are on section 1" and "1 section done"; at "Seção 3 de 3" the lesson still has quizzes/challenges pending, so "3 de 3" overpromises completion. This is a mental-model mismatch: users count sections 1-based and read "N de M" as *position*, not *presented count*.

**remediation.** Reframe the string as an unambiguous count ("0 de 3 seções" / "0 of 3 sections"), which reads correctly at 0, mid, and end; optionally clamp/hide at 0 with a "not started" microcopy later. Keep the key and the `{{current}}`/`{{total}}` interpolation so unit tests keep passing.

**targets:**
- `app/src/i18n/locales/pt-BR/translation.json:213` → `"theoryCount": "{{current}} de {{total}} seções"`
- `app/src/i18n/locales/en/translation.json:213` → `"theoryCount": "{{current}} of {{total}} sections"`
- No component change (`LessonSidebarHeader.tsx:272` already interpolates; `LessonView.tsx:4266-4267` semantics stay).

## finding-2 (warning, D.2.1.02 visual-hierarchy) — the progress bar at 0% is indistinguishable from a divider

**message.** `LinearProgress variant="determinate" color="inherit"` at 6px (`LessonSidebarHeader.tsx:257-263`) renders as a rounded gray hairline when `theoryProgress = 0` — exactly the state in the screenshot. It has no fill, no accent, and sits directly under the summary where users already expect a separator; it reads as a rule, not as feedback. Progress is the panel's only dynamic element and should carry the single accent; today the accent is spent on the trophy glyph instead (finding-3/6).

**remediation.** Paint the determinate bar with the accent fill and give the track a visible, contrast-checked neutral; keep the 6px pill geometry and the textual counter (the triple encoding bar+text+aria is good). Verify non-text contrast (≥3:1 fill/track vs container, SC 1.4.11).

**targets:**
- `app/src/components/course/LessonSidebarHeader.tsx:257-263` → keep `variant="determinate"`, drop `color="inherit"`; add sx:
  ```tsx
  sx={(theme) => ({
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.vars.palette.nonText.neutral,
    '& .MuiLinearProgress-bar': { backgroundColor: theme.vars.palette.primary.fill },
  })}
  ```

## finding-3 (warning, C.1.1.01 consistency-standards) — icon metaphors read as emoji and are treated inconsistently

**message.** The buttons use real MUI icons, but `EmojiEvents` (trophy) is the gamification/award metaphor — visually the 🏆 idiom — and it is tinted accent while `AutoStories` is tinted ink; same row, two tint policies (C.1.1.01). Worse, `AutoStories` is already the **Tutor persona avatar** in chat (`app/src/components/chat/chatSurfaces.tsx:294`, documented at :249) and now also means "Fontes" — one glyph, two unrelated meanings. The trophy also conflicts with the app's own tone policy: tests explicitly forbid celebratory text ("sem confete de texto", `quizStalledExit.test.ts:625`, `quizOverlayWiring.test.ts:709`, `lessonActionRow.test.ts:436`) while `lessonCompleted` ships "🎉" (`pt-BR:260`) — an unresolved emoji policy. For a study tutor, neutral metaphors (checklist/assignment for challenges, menu-book for sources) beat an award trophy.

**remediation.** Adopt one icon policy: functional MUI glyphs only, one tint rule (both action icons in `text.primary`, or the single highlighted action in `primary.fill` — never mixed), no emoji in interactive controls. Swap `EmojiEvents → AssignmentOutlined` (or `ChecklistRounded`) for challenges app-wide and `AutoStories → MenuBookOutlined` for Fontes, keeping `AutoStories` exclusively for the Tutor persona. Optionally codify "no emoji in buttons; emoji allowed only in celebratory status copy" in `designTokens.ts` rules. Accessible names are unchanged (startIcon is decorative `aria-hidden`).

**targets:**
- `app/src/components/course/LessonSidebarHeader.tsx:105-106` (imports), `:311` (`startIcon={<EmojiEventsIcon />}` → `<AssignmentOutlinedIcon />`), `:335` (`startIcon={<AutoStoriesIcon />}` → `<MenuBookIcon />`), `:317-319` (icon tint: keep `primary.fill` only if Desafios remains *the* highlighted action; otherwise `text.primary` for both).
- Consistency sweep (same metaphor, else the swap creates a new inconsistency): `app/src/views/LessonView/LessonView.tsx:224, 1142, 3773`; `app/src/views/RoadmapView/RoadmapView.tsx:54, 356`.
- Tone policy note (flag only, copy is outside this panel): `app/src/i18n/locales/pt-BR/translation.json:260` / `en:260` ("🎉"), `pt-BR:268` / `en:268` ("✓").

## finding-4 (warning, F.1.1.03 mental-model) — the "ASSUNTO" well shows a raw slug ("o-esqueleto")

**message.** In the screenshot the shell status well labels the value "ASSUNTO" and displays `o-esqueleto` — a hyphenated lessonId slug, not a human topic. Cause: `LessonView.tsx` publishes `subject: lessonId/slug` on mount and on prerequisite navigation (`:2180, :2230, :2259, :2666`) but `subject: lesson?.title` only in the finish handler (`:2428`) — the HUD alternates between slug and title depending on path. A learner cannot map "o-esqueleto" to the lesson "A porta do programa" currently on screen; it looks like leaked debug data. Additionally, the well is a global session HUD but visually reads as a fifth block of the lesson panel (12px gap, same column), blurring scope.

**remediation.** Publish a human title whenever the lesson is loaded (republish `subject` when `lesson.title` arrives), fall back to the slug only pre-load; and visually detach the well from the lesson slot (extra top margin or a Divider before `role="status"`).

**targets:**
- `app/src/views/LessonView/LessonView.tsx:2180, 2230, 2259` → keep the slug only as pre-load fallback; add/extend an effect that republishes `publishSession({ subject: lesson.title })` when `lesson` resolves (the `publishSession({ subject: lesson?.title ?? trackLesson.lessonId, ... })` at `:2428` shows the intended shape).
- `app/src/views/LessonView/LessonView.tsx:2666` (openPrerequisite) → publish the target lesson's title when known (`lesson?.title`), else the slug.
- `app/src/components/shell/SessionFrame.tsx:296-310` → add `marginTop: theme.spacing(1)` (or a `Divider`) above the `role="status"` well so session chrome stops reading as lesson content; `:199` (`subjectValue`) unchanged.

## finding-5 (suggestion, C.1.1.01 consistency-standards) — `overflow-wrap: anywhere` invites mid-word breaks in labels

**message.** Buttons and chips set `whiteSpace: 'normal'` + `overflowWrap: 'anywhere'` (`LessonSidebarHeader.tsx:321-322, 339-340, 383-384`). `anywhere` breaks words even when the word fits on its own line; at the 180px pane floor the EN label was already measured at 162.6px vs a 155px column (comment `:283-291`), so "Challenges" can render as "Challe/nges". The no-clip policy (SC 1.4.12) is right; mid-word breaking is the wrong tool — it costs word recognition and violates the "no mid-word wrapping" taste rule. Long unbroken identifiers in *content* (title, summary, slug values) legitimately need `anywhere`; button/chip *labels* do not.

**remediation.** For button and chip labels use `overflowWrap: 'break-word'` (breaks only when the word truly cannot fit) paired with `minWidth: 0` on the Button so flexbox can still shrink it under the Badge's `maxWidth: '100%'` cap — preserving the no-overflow guarantee that `anywhere` bought. Keep `anywhere` on title/summary/course/counter.

**targets:**
- `app/src/components/course/LessonSidebarHeader.tsx:321-322` and `:339-340` → `overflowWrap: 'break-word'` + add `minWidth: 0`.
- `app/src/components/course/LessonSidebarHeader.tsx:383-384` (`.MuiChip-label`) → `overflowWrap: 'break-word'` (chip root already `maxWidth: '100%'` at `:381`).
- Re-verify at the 180px floor in `tests/e2e/e2e-sidebar-aula-spacing.spec.ts` (both languages).

## finding-6 (suggestion, C.1.1.01 consistency-standards) — pending badge uses error-red: second hue + wrong semantics

**message.** `Badge color="error"` (`LessonSidebarHeader.tsx:303`) paints the pending-count bubble red. Red means failure/destructive in this design system (theme.ts:43 documents the care taken to separate `error` from `primary`), but "N desafios pendentes" is a neutral to-do state, not an error. It also breaks the "ONE accent color" rule: the row already carries accent-blue (border + trophy) plus red — two non-neutral hues competing in a 44px band.

**remediation.** Badge fill = the same accent as the highlighted action (`primary.fill`) with the theme's on-fill ink, or a neutral ink bubble. Reserve `error` for actual failures.

**targets:**
- `app/src/components/course/LessonSidebarHeader.tsx:303` → `color="primary"` (verify `palette.primary` maps to the `action` accent with `contrastText` in `app/src/theme.ts:631-655`; if not, `sx={{ '& .MuiBadge-badge': { backgroundColor: theme.vars.palette.primary.fill } }}` using the same on-fill ink as the contained primary Button — no invented hex).

## finding-7 (suggestion, D.2.1.02 visual-hierarchy) — meta lines are typographically flattened; "Curso: …: …" double colon

**message.** Course caption, progress counter caption, and prerequisites label are all `caption`/`text.secondary` (`:205-215, :264-273, :356-365`) — three different kinds of meta (context, feedback, navigation) in one identical style, while the course line is the panel's orientation anchor (the owner explicitly asked for it, ONDA-CURSO-NO-SIDEBAR). Hierarchy must come from style, not only position. Separately, `courseLabel: "Curso: {{course}}"` (`pt-BR:211`) produces "Curso: C Iniciante: do primeiro printf…" — a double colon when the track title itself contains one (visible in the screenshot).

**remediation.** Promote the course line one step (e.g. `body2` with `fontWeight: 600` at `text.secondary`, or caption with the "Curso" fragment visually lighter and the name in `text.primary`); change the separator to a middot; keep the counter and prereq label as captions. Design must survive +30% label length: all these wrap already (SC 1.4.12 policy holds).

**targets:**
- `app/src/i18n/locales/pt-BR/translation.json:211` → `"courseLabel": "Curso · {{course}}"`; `app/src/i18n/locales/en/translation.json:211` → `"courseLabel": "Course · {{course}}"`.
- `app/src/components/course/LessonSidebarHeader.tsx:205-215` → bump variant to `body2` (or keep `caption` and split label/value spans with differentiated ink).

## finding-8 (suggestion, F.1.1.02 cognitive-load) — uniform 12px gaps flatten grouping

**message.** Root gap is `theme.spacing(1.5)` = 12px between every block (`:192`), so summary→progress, progress→actions, and actions→prerequisites are equidistant. The prerequisites block is a different *mode* (navigating away to earlier lessons) yet sits at the same rhythm as in-lesson actions; the summary block's 4px-internal grouping barely survives the flat 12px spacing at 240px width. Law of proximity says same-group items must be closer than between-group items — currently the between-group gap (12px) is only 3× the within-group gap (4px), and identical for all groups.

**remediation.** Keep 12px for progress→actions (both in-lesson), raise the gap before the prerequisites block to `theme.spacing(2.5)` (20px) or introduce a hairline `Divider` above it; keep intra-block 4px. Low risk: no test asserts pixel spacing (the e2e spacing suite scans for clipping, not rhythm).

**targets:**
- `app/src/components/course/LessonSidebarHeader.tsx:192` (root `gap`) → keep 1.5; `:355` (prereq block Box) → add `marginTop: theme.spacing(1)` (total 20px) or insert `<Divider sx={{ marginBlockStart: theme.spacing(1) }} />` before the block.

## finding-9 (suggestion, C.1.4.01 error-prevention) — prerequisite chips are clickable but read as tags

**message.** The chips (`:368-390`) are `variant="outlined"` + `onClick` + 44px `minHeight` (Fitts floor respected — good), but at rest they look identical to static tag chips; the only affordance cues are hover/pointer. In a teaching context the chips are *navigation to another lesson* — a misread as passive labels means the remediation path (the whole point of "Não entendeu? Revisar:") is missed.

**remediation.** Add a trailing/leading affordance glyph (e.g. `HistoryEdu`/`Replay` leading icon or a chevron) or an underline/hover-fill cue; keep the 44px floor and multi-line label.

**targets:**
- `app/src/components/course/LessonSidebarHeader.tsx:368-390` → add `icon={<HistoryEduIcon />}` (or `deleteIcon`-slot chevron), `sx` hover fill: `'&:hover': { backgroundColor: theme.vars.palette.nonText.neutral }`.

## finding-10 (suggestion, C.1.1.01 consistency-standards) — copy micro-defects: "(1 pendentes)", em-dashes, EN tone

**message.** (a) `challengesButtonAria: "Desafios da aula ({{pending}} pendentes)"` (`pt-BR:271`) is grammatically wrong for 1: "1 pendentes" should be "1 pendente"; EN (`en:271`) is fine. (b) The lesson summary in the panel contains an em-dash ("main — é o programa"), and i18n copy uses em-dashes as punctuation (`pt-BR:232`/`en:232` "…revela a seção inteira — Avançar fica para depois."); the taste rule bans em-dash as punctuation in proposed copy and asks existing ones be flagged. (c) `prerequisitesLabel` EN "Stuck? Review:" (`en:214`) is harsher than the empathetic PT "Não entendeu? Revisar:" (`pt-BR:214`).

**remediation.** (a) i18n plural (`_one`/`_other`) for the pt-BR aria label — OPTIONAL because it changes an e2e-asserted accessible name; if applied, update the tests listed under Tests at risk. (b) Flag only for content strings (summary comes from track content, `LessonView.tsx:4253` `lesson.summary`); for owned i18n copy replace "—" with comma/period in future edits. (c) EN label → "Didn't get it? Review:" (tone parity; not e2e-asserted).

**targets:**
- `app/src/i18n/locales/pt-BR/translation.json:271` (optional) → `"challengesButtonAria_one": "Desafios da aula ({{pending}} pendente)", "challengesButtonAria_other": "Desafios da aula ({{pending}} pendentes)"` (keep the base key for i18next fallback).
- `app/src/i18n/locales/en/translation.json:214` → `"prerequisitesLabel": "Didn't get it? Review:"`.
- Flagged, not changed: `pt-BR:232`/`en:232` em-dash; lesson summary content (em-dash, track-authored).

# Strengths

1. **"Wrap, never clip" is real and tested (SC 1.4.12).** No `noWrap`/ellipsis anywhere in the panel; title, summary, counter, button labels and chip labels all wrap, and `tests/e2e/e2e-sidebar-aula-spacing.spec.ts` proves it at the 180px pane floor in both languages and at minimum window height (`LessonSidebarHeader.tsx:41-61`).
2. **Touch targets at the 44px floor everywhere (I.2.2.02).** `TOUCH_TARGET_PX` on both buttons and on every chip (`:114, :324, :342, :380`) — including multi-line chips, via `minHeight` over `height: 'auto'`.
3. **A11y model is deliberate and complete (Part 6).** `<section aria-labelledby>` named by the lesson h1 (never a second `banner` landmark), exactly one h1 with full text, `aria-haspopup`/`aria-expanded` reflecting the view-owned popover, accessible names frozen to what the e2e suite resolves (`:76-91`).
4. **Progress is redundantly encoded.** Bar + "Seção N de M" caption + `aria-label` percent (`:257-273`) — sighted, low-vision and screen-reader users all get the state (the *semantics* need fixing, the encoding does not).
5. **Contrast is measured, not guessed.** `INK_* × SURFACE_*` ratios documented across five levels with secondary ink ≥5.56:1 everywhere (`designTokens.ts:160-185`) — AA/AAA holds for every string in this panel.
6. **Progressive disclosure without chrome (D.1.1.01).** Sources live behind a dialog and challenges behind a popover; the panel stays lean; empty states are honest (no chips → no label, no challenges → no button, no course → no orphan "Curso:") (`:302-330, :354, :204-216`).

# Fix spec (implementation-ready)

Ordered per file; e2e-visible labels ("Desafios", "Fontes", headings, `challengesButtonAria`) stay stable unless explicitly marked optional.

## file: app/src/components/course/LessonSidebarHeader.tsx

1. **Progress bar accent + track (finding-2).** At `:257-263`, remove `color="inherit"`; replace the `sx` with:
   ```tsx
   sx={(theme) => ({
     height: 6,
     borderRadius: 3,
     backgroundColor: theme.vars.palette.nonText.neutral,
     '& .MuiLinearProgress-bar': { backgroundColor: theme.vars.palette.primary.fill },
   })}
   ```
   Keep `variant="determinate"`, `value`, and the `aria-label` (`:262`) untouched. Check non-text contrast ≥3:1 between bar fill and track in both schemes.
2. **Badge hue (finding-6).** At `:303`, `color="error"` → `color="primary"` (if `palette.primary` in `app/src/theme.ts` is the `action` accent with `contrastText`; otherwise `sx` badge background `theme.vars.palette.primary.fill` + the same on-fill ink used by the contained primary Button).
3. **Icon swap (finding-3).** `:105-106`: `import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined'; import MenuBookIcon from '@mui/icons-material/MenuBook';`. `:311` → `startIcon={<AssignmentOutlinedIcon />}`; `:335` → `startIcon={<MenuBookIcon />}`. Keep icon tint rule: `& .MuiButton-startIcon { color: theme.vars.palette.primary.fill }` on Desafios only (the one highlighted action), leave Fontes' icon inheriting `text.primary`; document the one-highlight rule in the header comment block.
4. **Wrap policy (finding-5).** On both Buttons (`:312-325`, `:336-343`): `overflowWrap: 'anywhere'` → `'break-word'`, and add `minWidth: 0`. On `.MuiChip-label` (`:383-384`): `overflowWrap: 'anywhere'` → `'break-word'`. Leave `anywhere` on course/title/summary/counter (`:211, :225, :236, :269`).
5. **Grouping rhythm (finding-8).** Prereq block Box (`:355`): add `marginTop: theme.spacing(1)` (12 + 4 = 16–20px separation) — or insert `<Divider />` before the block; keep root `gap: 1.5`.
6. **Chip affordance (finding-9).** Chip (`:368-373`): add a leading icon (`icon={<HistoryEduIcon />}`) and hover fill `'&:hover': { backgroundColor: theme.vars.palette.nonText.neutral }`; keep `minHeight: TOUCH_TARGET_PX` and `maxWidth: '100%'`.
7. **Course line hierarchy (finding-7).** `:205-215`: change `variant="caption"` → `variant="body2"` and `fontWeight: 600`, keep `text.secondary` (or split "Curso ·" span in `text.secondary` + name span in `text.primary`). Strings still wrap (`whiteSpace/overflowWrap` unchanged).

## file: app/src/views/LessonView/LessonView.tsx

1. **Subject slug leak (finding-4).** Republish a human subject when the lesson resolves: add
   ```tsx
   useEffect(() => {
     if (lesson?.title) publishSession({ subject: lesson.title });
   }, [lesson?.title, publishSession]);
   ```
   near the other `publishSession` effects (~`:2273`/`:2452` region), and at `:2666` (openPrerequisite) prefer the known title over `slug`. Leave `:2180, :2230, :2259` as the pre-load slug fallback (they run before `lesson` exists) — the new effect supersedes them.
2. **No changes to the sidebar props block** (`:4248-4271`): `sectionCurrent`/`sectionTotal` semantics stay; the copy fix (finding-1) lives in i18n.

## file: app/src/components/shell/SessionFrame.tsx

1. **Scope detach (finding-4).** Above the `role="status"` well (`:296`), add `marginTop: theme.spacing(1)` to the well's `sx` or a `<Divider sx={{ marginBlockStart: 1 }} />`, so session chrome stops reading as part of the lesson panel. Do not touch `role="status"`, `aria-live`, `data-session-last-activity`, or the assunto→fase order (`:293-297` freeze them).

## file: app/src/i18n/locales/pt-BR/translation.json

1. `:213` `"theoryCount": "{{current}} de {{total}} seções"` (finding-1).
2. `:211` `"courseLabel": "Curso · {{course}}"` (finding-7).
3. `:271` OPTIONAL plural (finding-10a): `"challengesButtonAria_one": "Desafios da aula ({{pending}} pendente)", "challengesButtonAria_other": "Desafios da aula ({{pending}} pendentes)"` — only together with the e2e updates in Tests at risk; skip if the accessible name must stay byte-stable.
4. Keep `:214` `"prerequisitesLabel": "Não entendeu? Revisar:"` (e2e-visible via unit tests; tone is good in PT).

## file: app/src/i18n/locales/en/translation.json

1. `:213` `"theoryCount": "{{current}} of {{total}} sections"` (finding-1).
2. `:211` `"courseLabel": "Course · {{course}}"` (finding-7).
3. `:214` `"prerequisitesLabel": "Didn't get it? Review:"` (finding-10c; tone parity with PT; not e2e-asserted).
4. `:271` stays `"Lesson challenges ({{pending}} pending)"` (EN is grammatical as-is).

## file: app/src/views/LessonView/LessonView.tsx + app/src/views/RoadmapView/RoadmapView.tsx (icon consistency sweep, finding-3)

1. Replace the remaining `EmojiEventsIcon` challenge metaphors with `AssignmentOutlinedIcon`: `LessonView.tsx:224 (import), 1142, 3773`; `RoadmapView.tsx:54 (import), 356`. Keep `AutoStoriesIcon` only for the Tutor persona (`chatSurfaces.tsx:294`).

## file: app/src/lib/designTokens.ts (policy note, finding-3)

1. Add to the rules block: "No emoji in interactive controls; celebratory emoji only in one-shot status copy; one icon tint rule per action tier." (Documentation-only change.)

## Sanity pass after implementation

- Run `npm test` from `app/` (unit) and the sidebar e2e suites: `e2e-sidebar-aula-spacing.spec.ts`, `e2e-lesson.spec.ts`, `e2e-fontes.spec.ts`.
- Re-measure EN labels at the 180px pane floor (the 162.6px-vs-155px case) and with +30% inflated labels (SC 1.4.12 text-spacing overrides).
- Verify badge contrast and bar fill/track non-text contrast in dark scheme too.

# Tests at risk

By proposed change (all paths relative to `app/`):

- **finding-5 (wrap `anywhere` → `break-word`):**
  - `tests/lessonSidebarHeaderWrap.test.ts` — describes 2 & 3 assert `finalDeclOf(..., 'overflow-wrap') === 'anywhere'` for Desafios, Fontes (both scenarios) and the chip label (`:274-312`). Update expected value to `break-word` and re-check the `whiteSpace: normal` assertions (unchanged).
- **finding-3/6 (icons, badge hue):**
  - `tests/lessonSidebarHeader.test.ts:372-393` ("regra 3b" block) — asserts `border-color`/`color` of both buttons and `color: var(--mui-palette-primary-fill)` on Desafios' `.MuiButton-startIcon`. Border/label assertions survive; icon-tint assertion survives only if the Desafios tint rule is kept (spec step 3 keeps it). Badge color is not asserted (`:353` matches the span text only) — safe.
- **finding-1/7 (i18n value changes to `theoryCount`, `courseLabel`, `prerequisitesLabel`):**
  - `tests/lessonSidebarHeader.test.ts:267, 280-289, 415, 430, 441-444` and `tests/lessonSidebarHeaderCoverage.test.ts:216-273, 342` — all interpolate expected strings **from the same dictionaries**, so value changes pass; only test *titles* mentioning "Seção 0 de 0" go stale. `tests/i18n-resources.test.ts` (key parity + `challengesButtonAria` interpolation `:164-176`) passes unchanged unless finding-10a is applied.
- **finding-10a ONLY (optional plural of `challengesButtonAria` — accessible name changes):**
  - `tests/e2e/e2e-lesson.spec.ts:281, 290` — hard-codes `'Desafios da aula (1 pendentes)'` (role name + `aria-label` attribute selector).
  - `tests/e2e/e2e-sidebar-aula-spacing.spec.ts:172` — `desafios: (n) => \`Desafios da aula (${n} pendentes)\``; used at `:555`.
  - `tests/lessonSidebarHeader.test.ts:220, 346-362` + `tests/lessonSidebarHeaderCoverage.test.ts:308-321, 441` build the expected aria from the dict → pass, but re-check exact-match helpers if `_one/__other` key splitting is introduced.
  - `tests/i18n-resources.test.ts:164-176` — interpolates `lesson.challengesButtonAria`; keep the base key to stay green.
- **finding-4 (subject republish):**
  - `tests/sessionState.test.ts:62-94` (`tests/` root) — asserts `publishSession` subject semantics; the new effect uses the same API, so behavior tests pass, but any test that seeds `subject` via lesson mount order and asserts the slug must expect the title once `lesson` resolves. E2E-wise, `tests/e2e/e2e-sidebar-aula-spacing.spec.ts` seeds the well's `spans[1]` itself (order assunto→fase preserved) — safe.
- **Untouched, deliberately stable:** `tests/e2e/e2e-lesson.spec.ts:247` ("Fontes" button), `:294` / `e2e-fontes.spec.ts:66, 86, 93` ("Fontes desta aula"), `real-lesson.spec.ts:89` ("Desafios" heading), `real-didactics.spec.ts:85`, `e2e-test-answer.spec.ts:134`, `e2e-desafio-retomar.spec.ts:410, 625`, `tests/e2e/helpers.ts:139` — all resolve buttons by substring name ("Desafios"/"Fontes"), which the spec keeps byte-identical.
