# Design read

The "Fontes desta aula" dialog is a MUI modal whose entire job is one decision: pick a reference
source and open it. The chrome is honest and quiet — `DialogTitle` ("Fontes desta aula", pt-BR) +
`DialogContent dividers`, white paper over a scrim, three list rows with a darker title line and a
gray description. The problem is that the ONE interactive layer is invisible: the rows are
`ListItemButton`s that close the dialog and open an in-app iframe viewer (`LessonSourceViewer`, with
an "Abrir no navegador" fallback link — `app/src/views/LessonView/LessonView.tsx:4273-4303`,
`:4305+`), but they render with zero action affordance. No chevron, no external-link icon, no
accent/underline, no URL shown, no hover state visible in a static frame. The rows read as a dead
glossary — the mental model of "a list of citations" beats the reality of "a list of buttons", so
the dialog's primary task is undiscoverable.

Second voice problem: the content data speaks with an LLM tell. Titles are
"`<real source name>` — `<made-up qualifier>`" with em-dashes, and the qualifier
"a referência oficial da linguagem" repeats verbatim on two of three rows (and is factually wrong —
cppreference is a community reference, not "a referência oficial"); descriptions open with the same
"A página oficial…" formula twice. The rhythm is also flat: a `dense` list where entry separation
relies on whitespace alone (no dividers) while the dialog chrome itself uses `dividers` — two
divider languages in one 600px card. Hierarchy between entry title and description is a 2px size
step plus color, no weight step. Exit is Esc/backdrop only — no visible close. What is genuinely
good underneath: real buttons (keyboard-reachable), `aria-labelledby` on the dialog, measured
AAA-grade ink tokens (7.79:1 secondary on paper), focus ring from theme, and an empty state.

# Score (interface_type, overall_score, band)

- **interface_type**: `modal`
- **interface_type_note**: modal whose rows are navigation actions into an embedded source viewer; audited as the modal surface itself.
- **overall_score**: 55
- **band**: fair (40-64)
- **api_enriched**: false (uxuiprinciples API key absent; framework applied from internal knowledge)

Score math: 100 − 15 (finding-1, critical) − 7×3 (findings-2..4, warnings) − 3×3 (findings-5..7,
suggestions) = 55.

# Findings

## finding-1 (critical, F.1.1.03 Mental Model — the rows look like dead text)

**message.** The dialog's only actions are the three list rows, but they carry no action affordance
whatsoever: `ListItemText primary/secondary` inside a `ListItemButton` with no trailing icon, no
link color, no underline, no URL, no hint that clicking opens an in-app viewer. In the screenshot
they are indistinguishable from static citation text. A user who wants "the URL of this source"
(the stated purpose of a Fontes dialog) scans for a link, finds none, and treats the dialog as
read-only — the primary task (open the source) is blocked by a broken mental model, not by
functionality. Worse: the row doesn't disclose where it goes (the destination URL is never shown),
so even users who suspect it is clickable cannot predict the outcome.

**remediation.** Make each row announce itself as an action and disclose its destination:
(1) trailing action icon in accent color (`OpenInNewIcon` or `ChevronRight`) via `secondaryAction`;
(2) primary title in accent/link treatment (semibold, `primary.accentText`, underline on hover);
(3) a third meta line with the URL host (e.g. `en.cppreference.com`) so the destination is visible
before committing; (4) cursor/hover elevation already comes with `ListItemButton` — keep it.
Target: ≥90% of first-time users identify the rows as clickable without trial-and-error.

**targets:**
- `app/src/views/LessonView/LessonView.tsx:4287-4300` -> restructure each row:
  `<ListItem key={s.url} disableGutters secondaryAction={<IconButton tabIndex={-1} aria-hidden edge="end"><OpenInNewIcon fontSize="small" color="primary" /></IconButton>}>` +
  `ListItemButton` with `aria-label` (see finding-7), `ListItemText primary={<Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'primary.accentText' }}>{…}</Typography>}` plus a host line
  `<Typography variant="caption" sx={{ color: 'text.secondary' }}>{hostOf(s.url)}</Typography>`.
- `app/src/views/LessonView/LessonView.tsx:4296` -> `ListItemText primary={s.title}` currently
  renders the title as default `body1` regular — dead-text look originates here.
- Keep the exact statement `setSourcesOpen(false); setOpenSource(s);` inline in the onClick
  (asserted verbatim by `app/tests/lessonSourcesViewer.test.ts:218-221`).

## finding-2 (warning, C.1.1.01 Consistency & Standards — no visible close affordance)

**message.** The dialog has no close button and no cancel action: `DialogTitle` + `DialogContent`
only. Dismissal exists (Esc, backdrop click via `onClose`) but is invisible; the platform/MUI
dialog convention — an X in the title row and/or an explicit "Fechar" action — is missing. A modal
without a visible exit manufactures the "am I stuck?" moment, and this dialog is a chooser, so it
also lacks a "cancel, I don't want a source" action. The e2e suite proves Esc works
(`app/tests/e2e/e2e-fontes.spec.ts:88-92`), which confirms the exit exists but is keyboard-only
knowledge.

**remediation.** Add an `IconButton` close (X) at the end of `DialogTitle` with
`aria-label="Fechar"` (pt-BR) / `"Close"` (en), 44px touch target, plus an optional `DialogActions`
with a text "Fechar" button for mouse users. Keep `onClose` unchanged (Esc/backdrop keep working).

**targets:**
- `app/src/views/LessonView/LessonView.tsx:4280` -> replace `<DialogTitle id="lesson-sources-title">{…}</DialogTitle>`
  with a flex row: title text + `<IconButton aria-label={t('translation:lesson.sourcesClose')} onClick={() => setSourcesOpen(false)} sx={{ ml: 'auto', minWidth: 44, minHeight: 44 }}><CloseIcon /></IconButton>`
  (`CloseIcon` is already imported for the viewer — `LessonView.tsx:1368`).
- `app/src/i18n/locales/pt-BR/translation.json:289-292` and `app/src/i18n/locales/en/translation.json:289-292`
  -> add `lesson.sourcesClose` = "Fechar" / "Close". IMPORTANT: do NOT name it
  `lesson.sourcesViewerClose*` — `app/tests/lessonSourcesViewerGaps.test.ts:297-315` asserts the
  `lesson.sourcesViewer*` key set is EXACTLY the 3 existing keys.

## finding-3 (warning, F.1.1.02 Cognitive Load — em-dash AI tell + fabricated repeated qualifier in source titles)

**message.** Every visible title mixes the real source name with an invented qualifier through an
em-dash flourish: "Function definition — a referência oficial da linguagem", "Statements — a
referência oficial da linguagem", "ISO/IEC 9899 — o rascunho público do padrão (N3220)". Three
problems compound: (a) the em-dash "—" is the #1 LLM punctuation tell and marks the whole content
as machine-written in a study app that must earn trust; (b) the qualifier "a referência oficial da
linguagem" is verbatim filler repeated on two of three rows — zero information, pure scanning noise
(F.1.1.02) — and it is factually wrong (cppreference is a community reference; only the ISO draft
is "official"); (c) descriptions repeat the same formula ("A página oficial…" ×2, "O padrão do C por
dentro…" ×1), so all three entries read as one generated template. The titles also bury the one
thing the user needs — the real source name — behind the flourish.

**remediation (CONTENT layer — recommended normalization strategy below).** Titles must be the
real source name alone ("Function definition (cppreference)", "ISO/IEC 9899 draft N3220");
qualifiers either deleted or made specific per entry; descriptions rewritten to say what the user
gets there, without the "A página oficial/por dentro" opener. The pattern is systemic:
**696 of ~820 `sources[].title` entries across `app/resources/tracks/**/{lesson,challenge}.json`
contain an em-dash** — too many for a hand content pass.

**Recommended approach (choose this one): a display-time normalizer + authoring lint.**
1. **Display-time sanitizer (primary):** one helper splits `"<Name> — <qualifier>"` at the first
   em-dash/en-dash and renders `Name` as the title and `qualifier` as muted meta (or drops known
   filler qualifiers entirely). One choke point (`LessonView.tsx` dialog + `LessonSourceViewer`
   header) fixes all 696 titles now and all future ones. See fix spec file #2.
2. **Authoring lint (anti-regression):** add a quality-gate rule rejecting new content with " — "
   in `sources[].title` or the filler phrases ("a referência oficial da linguagem",
   "o rascunho público do padrão") so the generator stops producing the tell.
3. Optional **content pass** only for `description` copy (semantic filler cannot be auto-fixed) —
   scoped to `c-iniciante` first (the audited track).

**targets:**
- CONTENT: `app/resources/tracks/c-iniciante/modules/a-tela/lessons/o-esqueleto/lesson.json:82-98`
  (the audited lesson — titles at :84, :89, :94; repeated "A página oficial…" at :86, :91) and the
  same `sources[].title|description` shape in every `app/resources/tracks/*/modules/*/lessons/*/lesson.json`
  and `challenges/*/challenge.json` (696 em-dash titles; e.g. also
  `app/resources/tracks/rust-iniciante/.../lesson.json` with "X — The Rust Programming Language").
- UI sanitizer (new): `app/src/lib/sourceTitle.ts` (see fix spec).
- Lint: `app/electron/main/engine/research/qualityGate.ts:57-61` (failure-reason enum) -> add
  `FONTE_TITULO_PADRAO_IA` and check `title` against / — |–/ and the filler phrase list.

## finding-4 (warning, D.2.1.02 Visual Hierarchy — entry title vs description differ only by 2px and color)

**message.** `ListItemText primary={s.title} secondary={s.description}` uses MUI defaults: primary
`body1` regular (16px/400), secondary `body2` gray (14px). The only hierarchy signal is a 2px size
step plus `text.secondary` color, so the "bold-ish" titles don't scan as titles — all three blocks
read as one gray text mass (visible in the screenshot). With em-dash titles wrapping to full width
there is no left-edge anchor, and the dialog title (`h6`) vs entry titles (16px) is a weak step
within the only two levels the dialog has.

**remediation.** Two clear levels: primary → `subtitle2`-class typography at `fontWeight: 600` in
`text.primary` (or accent per finding-1), secondary → `body2` `text.secondary` with a 4-6px top gap.
This gives a weight step (400→600) in addition to size/color, so scanning works at a glance.

**targets:**
- `app/src/views/LessonView/LessonView.tsx:4296` -> `<ListItemText
  primary={<Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.primary' }}>{displayTitle}</Typography>}
  secondary={<Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>{s.description}</Typography>}
  />` (or `slotProps`/`primaryTypographyProps` equivalents in MUI 9).

## finding-5 (suggestion, C.1.1.01 Consistency & Standards — list rhythm and divider language)

**message.** Two spacing languages coexist in one card: the dialog chrome separates title from body
with MUI `dividers`, while the list separates its entries with whitespace alone (`<List dense
disablePadding>` + `<ListItem disableGutters disablePadding>` at `LessonView.tsx:4287-4289`). The
gap between an entry's description and the next title (~16-20px from button padding) is only
modestly larger than the title→description gap (~4px), and `dense` tightens everything further, so
the three entries neither group as three distinct cards nor read as one continuous list. Rows also
sit flush at 0 gutter (`disableGutters`) against the dialog's 24px content padding — edge rhythm is
inconsistent.

**remediation.** Pick one language. Recommended: keep whitespace grouping but make the rhythm
explicit and non-dense — `<List disablePadding>` (drop `dense`), each `ListItemButton` gets
`sx={{ py: 1.5, px: 2, borderRadius: 1, '&:hover': { bgcolor: 'action.hover' } }}`, and 12-16px
between rows via `sx={{ '& > li + li': { mt: 1 } }}` on the List. Alternative: `<List disablePadding
divider>` for a strict ruled list — but then use dividers consistently (drop `dividers` from
`DialogContent`). Same edit block as finding-1/4.

**targets:**
- `app/src/views/LessonView/LessonView.tsx:4287-4298` (List/ListItem/ListItemButton props as above);
  `:4281` `DialogContent dividers` — keep only if the list is NOT ruled (decide one language).

## finding-6 (suggestion, I.2.2.02 Fitts's Law — dialog geometry and scroll behavior)

**message.** `<Dialog maxWidth="sm" fullWidth>` (600px) is a sane width for 2-line descriptions
(no truncation in the dialog — good), but there is no `scroll` prop and no max-height: with the
default `scroll="body"`, a lesson with 10+ sources grows the paper past the viewport and the whole
body scrolls — the title and the (currently invisible) close affordance leave the viewport and the
only exit left is Esc. No scroll affordance (edge fade/scrollbar styling) is specified either. With
the screenshot's small window the dialog already fills nearly the full width, so `fullWidth` +
`sm` is fine; the risk is purely vertical.

**remediation.** Set `scroll="paper"` and constrain the content:
`<DialogContent dividers sx={{ maxHeight: 'min(60vh, 480px)', overflowY: 'auto', px: 2 }}>` —
title and close stay pinned (finding-2's X lives in `DialogTitle`, outside the scroll area), the
list scrolls inside the paper. Fitts: the close target is then always within reach, and rows remain
full-width (large targets — keep).

**targets:**
- `app/src/views/LessonView/LessonView.tsx:4279` -> add `scroll="paper"` to the `Dialog` props
  (regex assertion in `app/tests/lessonSourcesViewer.test.ts:234` matches only
  `open={sourcesOpen} onClose={...}` — appending props after `onClose` is safe).
- `app/src/views/LessonView/LessonView.tsx:4281` -> `sx` on `DialogContent` as above.

## finding-7 (suggestion, F.6.1.01 Accessibility (Part 6) — accessible name noise and destination transparency)

**message.** Keyboard reachability is real (each row is a `ListItemButton` → `<button>`, focus ring
comes from the theme, the viewer focuses "Fechar" on mount) — but name/role/value is sloppy: the
accessible name of each row is the CONCATENATION of title + description (both render inside the
button), so a screen-reader user hears a 2-sentence name per option with no indication that Enter
opens a viewer; and sighted users get no URL/destination disclosure (WCAG 2.4.4-adjacent trust
problem, and Part 6 destination transparency). Minor: `key={i}` (`LessonView.tsx:4288`) should be
`s.url`. Note contrast is NOT a problem here (measured 7.79:1 secondary-on-paper, AAA —
`app/src/lib/designTokens.ts:165-169`).

**remediation.** Give each row an explicit `aria-label` composed from an action verb + title
("Abrir fonte: Function definition" / "Open source: Function definition"), move the description to
`aria-describedby` or leave it visual-only, keep the icon `aria-hidden`/`tabIndex={-1}`, switch to
`key={s.url}`, and show the host line from finding-1 (visible destination). Row height with
title+description already exceeds the 44px minimum — keep ≥44px when the meta line is added.

**targets:**
- `app/src/views/LessonView/LessonView.tsx:4288-4297` -> `key={s.url}`; `aria-label` on
  `ListItemButton`; icon `aria-hidden`.
- `app/src/i18n/locales/pt-BR/translation.json` + `en/translation.json` -> new key
  `lesson.sourcesItemOpen` = "Abrir fonte" / "Open source" (composed in code as
  `` `${t('translation:lesson.sourcesItemOpen')}: ${displayTitle}` ``). Not under the
  `sourcesViewer*` prefix (exact-set test — see finding-2 target note).

# Strengths

- **Real controls, real keyboard path (F.6.1.01).** Rows are `ListItemButton` → `<button>`
  (Enter/Space work), MUI dialog traps focus and closes on Esc, and `LessonSourceViewer` focuses
  its "Fechar" on mount (`LessonView.tsx:1307-1310`) — a deliberate, documented focus design.
- **Contrast engineered above AAA for reading surfaces.** `INK_LIGHT.secondary #525255` on paper =
  7.79:1, `INK_DARK.secondary` ≥5.24:1 on every level (`app/src/lib/designTokens.ts:160-179`).
- **Honest dialog semantics and empty state.** `aria-labelledby="lesson-sources-title"`, a proper
  heading, `sourcesEmpty` copy for lessons without sources (`LessonView.tsx:4282-4285`).
- **No truncation in the dialog; reflow-safe wrapping.** Descriptions wrap to 2 lines cleanly; the
  viewer truncates visually (CSS `noWrap`) while keeping full text in the DOM (SC 1.4.10,
  `LessonView.tsx:1336-1343`).
- **Escape hatch for hostile embeds.** The viewer announces `sourcesViewerFrameHint` and provides
  "Abrir no navegador" (`target="_blank" rel="noreferrer"`) when a site refuses framing
  (`LessonView.tsx:1344-1355`) — error prevention done right.
- **Consistent content shape.** All 820 source entries carry title+url+description uniformly, so
  the display-time normalization in the fix spec is safe to apply.

# Fix spec (implementation-ready)

Ordered per file. Em-dash "—" is banned in any copy proposed here (colon/hyphen/line break instead).

## file: `app/src/lib/sourceTitle.ts` (NEW — display-time normalizer, recommended primary fix)

1. Export `normalizeSourceTitle(raw: string): { name: string; qualifier: string | null }`:
   - Split at the first ` — ` / ` – ` / ` -- ` occurrence.
   - `name` = left side, trimmed. `qualifier` = right side, trimmed, or `null` when absent.
   - If `qualifier` matches a known filler (exact/normalized compare): `"a referência oficial da
     linguagem"`, `"o rascunho público do padrão"` (+ trailing parenthetical like `(N1570)`/`(N3220)`,
     which is kept as part of `name` instead), return `qualifier: null` and append the parenthetical
     draft number to `name` ("ISO/IEC 9899 (N3220)").
   - Never mutate the raw string otherwise (no truncation; G5 test requires full text in DOM).
2. Export `sourceHost(url: string): string` → `new URL(url).hostname` with `www.` stripped, `''` on
   parse failure (defensive; content gate requires absolute http(s) already).
3. Unit-test alongside existing lib tests: filler stripped, non-filler qualifier preserved,
   em-dash-free output, idempotence.

## file: `app/src/views/LessonView/LessonView.tsx`

1. Imports (near `:202-204` and the icon imports already used at `:1353`/`:1368`): add
   `DialogActions`, `IconButton` to the MUI import; `CloseIcon`, `OpenInNewIcon` already exist;
   import `normalizeSourceTitle`, `sourceHost` from `../lib/sourceTitle` (path relative to view).
2. `:4279` — `<Dialog open={sourcesOpen} onClose={() => setSourcesOpen(false)} aria-labelledby="lesson-sources-title" maxWidth="sm" fullWidth scroll="paper">`
   (keep `open`/`onClose` byte-identical: asserted by `tests/lessonSourcesViewer.test.ts:234`).
3. `:4280` — title row with visible close (finding-2):
   ```tsx
   <DialogTitle id="lesson-sources-title" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
     {t('translation:lesson.sourcesTitle')}
     <IconButton aria-label={t('translation:lesson.sourcesClose')} onClick={() => setSourcesOpen(false)} sx={{ ml: 'auto', minWidth: 44, minHeight: 44 }}>
       <CloseIcon />
     </IconButton>
   </DialogTitle>
   ```
   Optional: add `<DialogActions><Button onClick={() => setSourcesOpen(false)}>{t('translation:lesson.sourcesClose')}</Button></DialogActions>` after `:4302`.
4. `:4281` — `<DialogContent dividers sx={{ maxHeight: 'min(60vh, 480px)', overflowY: 'auto', px: 2 }}>`.
5. `:4287-4300` — the row (findings 1, 4, 5, 7 in one edit):
   ```tsx
   <List disablePadding sx={{ '& > li + li': { mt: 1 } }}>
     {lesson.sources.map((s) => {
       const { name, qualifier } = normalizeSourceTitle(s.title);
       return (
         <ListItem key={s.url} disableGutters
           secondaryAction={<IconButton tabIndex={-1} aria-hidden edge="end"><OpenInNewIcon fontSize="small" color="primary" /></IconButton>}>
           <ListItemButton
             aria-label={`${t('translation:lesson.sourcesItemOpen')}: ${name}`}
             sx={{ py: 1.5, px: 2, borderRadius: 1, alignItems: 'flex-start' }}
             onClick={() => {
               setSourcesOpen(false);
               setOpenSource(s);
             }}
           >
             <ListItemText
               primary={<Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.primary' }}>{name}</Typography>}
               secondary={
                 <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
                   {s.description}
                   <Typography component="span" variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 0.5 }}>
                     {sourceHost(s.url)}{qualifier ? ` · ${qualifier}` : ''}
                   </Typography>
                 </Typography>
               }
             />
           </ListItemButton>
         </ListItem>
       );
     })}
   </List>
   ```
   Hard constraints (source-regex tests): keep `setSourcesOpen(false); setOpenSource(s);` as the
   literal inline statements; keep the `<ListItemButton` element name; do not touch the
   `closeSourceViewer` callback or the `LessonSourceViewer` header Typography (see tests at risk).
6. Optional copy polish: nothing in `sourcesTitle`/`sourcesEmpty` needs rewording; both are clean,
   no em-dash. (Out of scope but flagged: `revealGateTyping`, `timeoutDuringSubmit`, `masteryNothing`
   in both locale files still use em-dashes.)

## file: `app/src/i18n/locales/pt-BR/translation.json`

1. Inside `lesson` (after `:289` `sourcesTitle`), add:
   - `"sourcesClose": "Fechar"`
   - `"sourcesItemOpen": "Abrir fonte"`
   Both must NOT be prefixed `sourcesViewer` (exact-set test in `tests/lessonSourcesViewerGaps.test.ts:297-315`).

## file: `app/src/i18n/locales/en/translation.json`

1. Same two keys at the same location: `"sourcesClose": "Close"`, `"sourcesItemOpen": "Open source"`
   (values must differ from pt-BR — parity/distinctness tests).

## file: `app/electron/main/engine/research/qualityGate.ts` (CONTENT anti-regression, secondary)

1. `:57-61` failure enum: add `FONTE_TITULO_PADRAO_IA`.
2. In the source validation path: reject `sources[].title` matching / — | – / or containing the
   filler phrases ("a referência oficial da linguagem", "o rascunho público do padrão") with a
   repair hint ("use só o nome real da fonte; qualificador específico vai em description").
3. Publish the same rule in the authoring bar (`app/content-src/BARRA-DE-AUTORIA.md:61`, which
   already mandates "2–3 `sources[]` oficiais, URL real e verificável").

## content pass (OPTIONAL, semantic filler only — description copy)

1. Scope: `app/resources/tracks/c-iniciante/**/` first. For each `sources[]`: title → real source
   name only ("Function definition (cppreference)", "Statements (cppreference)",
   "ISO/IEC 9899 draft N3220"); description → drop the "A página oficial…"/"O padrão do C por
   dentro…" opener and state the concrete payoff ("Assinatura, corpo e chamada por nome").
2. Do NOT hand-edit the 696 titles — the display-time normalizer covers them; this pass is only for
   descriptions and for the audited lesson (`o-esqueleto/lesson.json:82-98`) as the reference
   example.

# Tests at risk

| test | risk |
|---|---|
| `app/tests/lessonSourcesViewer.test.ts:165-166` | asserts `title="MDN — JavaScript"` on the iframe; if the viewer header also runs `normalizeSourceTitle`, this becomes `title="MDN"`/`"MDN: JavaScript"` — update fixture (`:81`, itself an em-dash tell) and assertion together. |
| `app/tests/lessonSourcesViewer.test.ts:217` | `assert.match(VIEW, /<ListItemButton/)` — keep the element name in the row rewrite. |
| `app/tests/lessonSourcesViewer.test.ts:218-221` | requires the literal inline `setSourcesOpen(false); setOpenSource(s);` — do not extract to a named handler. |
| `app/tests/lessonSourcesViewer.test.ts:234` | `/<Dialog open=\{sourcesOpen\} onClose=\{\(\) => setSourcesOpen\(false\)\}/` — keep that exact inline arrow; append new props AFTER `onClose`. |
| `app/tests/lessonSourcesViewerGaps.test.ts:297-315` | asserts the `lesson.sourcesViewer*` locale key set is EXACTLY the 3 viewer keys — new keys must not use the `sourcesViewer` prefix. |
| `app/tests/lessonSourcesViewerGaps.test.ts:337-352` | long-title test fixture contains ` — ` and asserts raw title text is emitted plus the exact noWrap Typography regex on `{source.title}` — a normalizer in the viewer header breaks both; either keep the viewer header raw or update fixture+assertions in the same PR. |
| `app/tests/e2e/e2e-fontes.spec.ts:65-92` | locators `getByRole('button', { name: /MDN/ })`, heading "Fontes desta aula", `getByRole('button', { name: 'Fechar' })` (viewer close) — keep "MDN" in the row's accessible name; ensure the new dialog close button ("Fechar") is unmounted before the viewer's "Fechar" assertions (MUI unmounts closed dialog content — verify in the run). |
| `app/tests/lessonSidebarHeader.test.ts:368-440` | asserts `sourcesButton` copy ("Fontes"/"Sources") in pt-BR and en — untouched by this spec; fails only if the sidebar button label changes. |
| `app/tests/i18n-resources.test.ts` (and `i18n-wiring`) | pt-BR/en parity: the two new keys must exist non-empty and distinct in BOTH locale files. |
| `app/tests/cx-views-gap-lesson-view.test.ts:233` | LessonView SSR fixture with `sources: [{ title: 'Docs de Python', … }]` — source-regex assertions over rendered HTML may shift with the new row markup (no em-dash in fixture title, so the normalizer is a no-op here; risk is markup shape only). |
