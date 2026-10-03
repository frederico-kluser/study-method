# Design read
Home "Trilhas": a scrollable list of ready-made course tracks (title + 3-5 line description + progress badge) for self-study learners of programming, UI copy in pt-BR (en supported), rendered by an Electron + React + MUI desktop shell.

# Score
interface_type: list  overall_score: 38  band: poor

Deduction ledger: 1 critical (-15) + 5 warnings (-35) + 4 suggestions (-12) = -62. The deductions concentrate in one broken element (the progress badge, findings 1-2) and in description readability/hierarchy (3-5); the state machine and accessibility foundations are strong (see Strengths).

# Findings

## finding-1 (critical, F.1.1.02 cognitive-load-progress-badge-shredded)
message: The progress badge is crushed into a ~55-60px vertical column and breaks words mid-token without hyphenation ("conclu / ídas", "concluída / s", "concl / uídas"), with the count split across lines ("1 de / 115"). The card's primary status stat is effectively unreadable on all three visible cards. Root cause: `Chip` label is set to `whiteSpace: 'normal'` + `overflowWrap: 'anywhere'` with `maxWidth: '100%'` and no `flexShrink: 0`, inside a flex row whose text Box has no `minWidth: 0`; `overflowWrap: 'anywhere'` permits breaking at any character, so once the flex row squeezes the chip the label shreds.
remediation: Give the badge a fixed two-line structure ("1 de 115" / "aulas concluídas") whose lines never wrap (`whiteSpace: 'nowrap'` per line, `overflowWrap` removed), place it in a grid `auto` column that cannot shrink, and let the text column wrap instead. Badge must show at most 2 balanced lines at every supported window width.
targets:
- app/src/views/placeholders.tsx:514 -> replace `<Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>` with `<Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'minmax(0, 1fr) auto' }, columnGap: 1.5, rowGap: 0.75, alignItems: 'start' }}>`.
- app/src/views/placeholders.tsx:515-522 -> wrap text column in `<Box sx={{ minWidth: 0 }}>` (already a Box; add `minWidth: 0`).
- app/src/views/placeholders.tsx:532-545 -> replace the Chip body with the two-line `TrackProgressBadge` specified in Fix spec (no `overflowWrap: 'anywhere'`, per-line `whiteSpace: 'nowrap'`, label resets `overflow: 'visible'; textOverflow: 'clip'`).

## finding-2 (warning, C.1.4.01 error-prevention-i18n-width-contract)
message: The badge has no width/i18n contract. The label is one fused string (`home.trackProgress` = "{{done}} de {{total}} aulas concluídas") rendered in a shrinkable box: any label ~30% longer (German, Polish, longer pt-BR revisions), a 4-digit total, or a wider number font collapses it further; the number is already orphaned from its preposition ("1 de / 115"). This is a latent layout failure waiting on data/locale, not just on this data set.
remediation: Split count and unit into two i18n keys (count line bold, unit line below), render each on a non-wrapping line, and give the badge a content-driven width in a non-shrinking grid column. Verify with a +30% pseudo-locale and with total=1000.
targets:
- app/src/i18n/locales/pt-BR/translation.json:529 -> replace `"trackProgress": "{{done}} de {{total}} aulas concluídas"` with `"trackProgressCount": "{{done}} de {{total}}"` and `"trackProgressUnit": "aulas concluídas"` (exact strings in Fix spec).
- app/src/i18n/locales/en/translation.json:529 -> same replacement with `"{{done}} of {{total}}"` / `"lessons done"` (parity enforced by app/tests/i18n-resources.test.ts).
- app/src/views/placeholders.tsx:535 -> render the two keys via the new badge component.

## finding-3 (warning, F.1.1.02 cognitive-load-description-measure)
message: The description is `variant="caption"` (12px) running 300+ chars at ~105-115 chars per line for 4-5 dense lines with no measure cap - far past the comfortable 45-75 chars/line, at metadata weight, in the card's main reading slot. The text column also collides with the badge: the flex row's 8px gap is eaten and description text runs flush against the chip border (visible on cards 1 and 2 in the screenshot), with ragged card heights (4 vs 5 lines) breaking list rhythm. Descriptions are not data-truncated (track.json strings render in full) but the layout gives them no breathing room or clamp policy.
remediation: Render the description at `body2` (matching how RoadmapView.tsx:714 renders the same field, `maxWidth: 640`), cap measure (~640px / ~72ch), and move to the grid layout from finding-1 so the text column wraps beside a fixed badge column with a real gutter. Description must truncate gracefully if product later needs clamping: house policy forbids ellipsis (see Tests at risk), so use the "Mostrar mais/Mostrar menos" (MUI `Collapse`) pattern for anything beyond the fixed line budget; with today's 250-360 char descriptions, full wrap with equal-height cards (grid `alignItems: start`) suffices.
targets:
- app/src/views/placeholders.tsx:519-521 -> `<Typography variant="body2" sx={{ color: 'text.secondary', overflowWrap: 'break-word', mt: 0.5, maxWidth: 640 }}>{tr.description}</Typography>`.
- app/src/views/placeholders.tsx:513 -> keep `p: 1.5` for the card but the new grid gets `columnGap: 1.5` so the badge gutter is a token value, not a squeezed 8px.

## finding-4 (warning, C.1.1.01 consistency-standards-mid-token-break)
message: Code identifiers break mid-token in the description: card 1 renders "…e o compila sozinho com -" / "std=c11." leaving a dangling hyphen and a 1-char orphan line. The text column carries no `overflowWrap`/`minWidth: 0` guard at all (the sibling SubjectCard at placeholders.tsx:314-317 does), so at narrower window widths long tokens will overflow and be clipped by the card instead of wrapping. Nothing on the card protects atomic tokens ("-std=c11.", "C++", URLs).
remediation: Add `overflowWrap: 'break-word'` + `minWidth: 0` to the text column (break-word breaks only when a token cannot fit, so "-std=c11." stays intact at real widths and wraps whole otherwise); wrap flag-like tokens in the track content in `<code>`-ish non-breaking form is out of scope for copy, so rely on the container guard + measure cap from finding-3.
targets:
- app/src/views/placeholders.tsx:515 -> `<Box sx={{ minWidth: 0 }}>`.
- app/src/views/placeholders.tsx:516-521 -> add `overflowWrap: 'break-word'` to both title and description Typography.

## finding-5 (warning, D.2.1.02 visual-hierarchy-flat-section-vs-card)
message: The section title "Trilhas" and every card title are the exact same Typography (`variant="subtitle1"` + `fontWeight: 600`, both mapping to `<h6>`, 16px). The screen has no typographic step between "section" and "item", so scanning 3-6 cards has no anchor and the page reads as one undifferentiated block of equally-weighted labels (also weak document outline: everything is h6).
remediation: Raise section headers one full step (`variant="h6" component="h2"`, 20px/700) and keep card titles at `subtitle1`; apply the same treatment to the domain section titles ("Programação") so all section headers on the Home screen share one style.
targets:
- app/src/views/placeholders.tsx:464, 477, 496 -> `<Typography variant="h6" component="h2" sx={{ fontWeight: 700 }} gutterBottom>`.
- app/src/views/placeholders.tsx:351-353 -> same change for the domain section titles in `SubjectSections` (consistency across the screen).
- app/src/views/placeholders.tsx:516-518 -> keep `subtitle1`/600 for card titles (unchanged).

## finding-6 (warning, F.1.1.03 mental-model-empty-state-jargon)
message: The empty state (`home.tracksEmptyDescription`) speaks authoring-tool jargon to a learner: "o conteúdo vive em resources/tracks e é criado pelo CLI de autoria (npm run track -- track:new)". A student hitting this state (no tracks installed) gets filesystem paths and an npm command they cannot use - a dead end dressed as an explanation. Same class of phrasing exists in `roadmap.noTracks` ("criadas pelos autores da ferramenta (CLI)").
remediation: Rewrite the empty copy for the learner: what happened (no track installed yet), that it is not an error, and who adds tracks (the people who author the courses); keep the dev detail out of the learner UI or behind a secondary "detalhes técnicos" affordance. pt-BR and en strings in Fix spec.
targets:
- app/src/i18n/locales/pt-BR/translation.json:531 -> replace `tracksEmptyDescription` value (string in Fix spec).
- app/src/i18n/locales/en/translation.json:531 -> replace `tracksEmptyDescription` value (string in Fix spec).

## finding-7 (suggestion, D.2.1.02 visual-hierarchy-progress-affordance)
message: Progress is text-only in an outlined `Chip` that reads as a tag/button (chips are interactive elsewhere in the app, e.g. lesson prerequisite chips), and the row uses `alignItems: 'center'` so the badge floats vertically against multi-line text instead of aligning with the title. At "0 de 112" the user gets no at-a-glance signal that nothing is started; a 3px determinate `LinearProgress` under the unit line (or a small ring) would carry the same information pre-attentively.
remediation: Align the badge to the title line (`alignItems: 'start'` in the new grid), keep the chip non-clickable but visually static (drop the outlined-chip look in favor of plain stat text or keep chip with `sx` matching card radius), and optionally add a determinate `LinearProgress variant="determinate"` (with `aria-hidden`, since the text already states the numbers).
targets:
- app/src/views/placeholders.tsx:514, 532-545 -> covered by the Fix spec badge component (`alignSelf: 'start'`, radius `SHAPE.sm`, optional 3px progress bar under the label).

## finding-8 (suggestion, C.1.1.01 consistency-copy-cadeia-vs-trilha)
message: Terminology drift in visible copy: the C track says "Curso 1 de 4 da **cadeia** de C" while Python and Rust say "Curso 1 de 4 da **trilha** de Python/Rust", on a screen literally titled "Trilhas". Three words for the same unit (curso / trilha / cadeia) in one card list forces the learner to guess the hierarchy.
remediation: Standardize on "trilha" (the screen's own term): "Curso 1 de 4 da trilha de C". Keep "cadeia" only as the internal field name (`"cadeia": "c"` stays).
targets:
- app/resources/tracks/c-iniciante/track.json:5 -> "Curso 1 de 4 da trilha de C, feito para quem parte do zero absoluto. …" (rest unchanged).

## finding-9 (suggestion, C.1.1.01 consistency-em-dash-ui-punctuation)
message: Em-dash "—" is used as UI punctuation in visible copy: the Rust card description ("…escreve um crate inteiro sozinho — funções, decisão, …") and `entryCriteria` "zero absoluto — nunca programou" in all three shipped tracks. House style for new copy forbids em-dashes.
remediation: Replace with colon or hyphen per house rule: "sozinho: funções, decisão, …" and "zero absoluto: nunca programou".
targets:
- app/resources/tracks/rust-iniciante/track.json:5 -> "… o aluno escreve um crate inteiro sozinho: funções, decisão, laços, structs, enums, coleções e o modelo de dono e empréstimo que é o centro da linguagem."
- app/resources/tracks/c-iniciante/track.json:12, python-iniciante/track.json:12, rust-iniciante/track.json:12 -> `"zero absoluto: nunca programou"`.

## finding-10 (suggestion, C.1.1.01 consistency-radius-and-title-wrap)
message: Two small consistency leaks: (a) the card title has no `overflowWrap` guard while its sibling `SubjectCard` (placeholders.tsx:314) does - a long unbroken title will overflow at narrow widths; (b) the badge is a default MUI Chip (pill radius 999, divider-gray border #c6c6c8 ≈ 1.5:1 non-text contrast) sitting on a card with `SHAPE.base = 12` radius - two radius families and a low-contrast "container" outline on one row. Chips-as-tags are fine, but this chip holds a stat, not a tag.
remediation: Add `overflowWrap: 'break-word'` to the title (done in finding-4 targets); give the badge `borderRadius: '8px'` (SHAPE.sm) or drop the outline entirely in favor of plain text stat, matching the card's radius scale.
targets:
- app/src/views/placeholders.tsx:516 -> title `overflowWrap: 'break-word'` (same edit as finding-4).
- app/src/views/placeholders.tsx:532-545 -> badge `borderRadius: 8` (or plain-text stat variant).

# Strengths
- Named, never-silent list state machine (`homeTracksState` at app/src/lib/homeSetup.ts:169; rendering at app/src/views/placeholders.tsx:435-492): loading keeps the title + `LinearProgress` (no layout shift), empty is a legitimate explained state, error shows `Alert` + retry with `minHeight: 44` touch floor. Exactly C.1.4.01 + D.1.1.01 done right.
- Real affordance and keyboard access: `CardActionArea` (placeholders.tsx:512) makes each card a focusable control (Tab/Enter/Space) and the whole card is the hit target - comfortably above the 44px floor (I.2.2.02).
- Contrast contract is engineered, not accidental: `INK_LIGHT.secondary #525255` on white = ~7.8:1 (AAA) per app/src/lib/designTokens.ts:187-190, and the file's "[medido]" claims are re-verified by tests/theme.test.ts. Body text on level-1 surfaces meets the AAA floor (Part 6 clear).
- Single source of truth for the design system (designTokens.ts: `SURFACE_*`, `SHAPE` scale 8/12/18/999) with automated enforcement - the right infrastructure for the radius/consistency fixes above.
- Progress copy already carries its unit ("1 de 115 aulas concluídas") and deliberately mirrors `roadmap.trackCount` phrasing (placeholders.tsx:523-531) - the C.1.1.01 intent is there; only the layout fails it.
- i18n key parity between pt-BR and en is enforced by test (app/tests/i18n-resources.test.ts), so locale drift is caught mechanically.

# Fix spec (implementation-ready)

## file: app/src/views/placeholders.tsx
1. Line 502: keep `<Stack spacing={1}>` for the card list (card gap 8px is fine once cards are equal height).
2. Lines 507-513 (Card/CardActionArea/CardContent): unchanged except CardContent keeps `sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}`.
3. Line 514: replace
   `<Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>` with
   `<Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'minmax(0, 1fr) auto' }, columnGap: 1.5, rowGap: 0.75, alignItems: 'start' }}>`.
   (Close with `</Box>` instead of `</Stack>` at line 546.)
4. Lines 515-522: replace the text column with:
   ```tsx
   <Box sx={{ minWidth: 0 }}>
     <Typography variant="subtitle1" sx={{ fontWeight: 600, overflowWrap: 'break-word' }}>
       {tr.title}
     </Typography>
     <Typography variant="body2" sx={{ color: 'text.secondary', overflowWrap: 'break-word', mt: 0.5, maxWidth: 640 }}>
       {tr.description}
     </Typography>
   </Box>
   ```
5. Lines 532-545: replace the whole `<Chip …/>` with `<TrackProgressBadge done={tr.doneCount} total={tr.lessonCount} tI={tI} />` and add this component above `TracksSection`:
   ```tsx
   /** Distintivo de progresso da trilha: DUAS linhas fixas ("1 de 115" /
    *  "aulas concluídas"). Cada linha é nowrap (nunca parte palavra); a coluna
    *  do grid é `auto` e não encolhe, então o texto do cartão é quebra que se
    *  adapta. `overflow`/`textOverflow` do MuiChip-label são resetados: o
    *  default do Chip (hidden + ellipsis) reprova a régua F104 do e2e-spacing. */
   function TrackProgressBadge({ done, total, tI }: {
     done: number; total: number;
     tI: (key: string, options?: Record<string, string | number>) => string;
   }): ReactElement {
     return (
       <Chip
         size="small"
         variant="outlined"
         sx={{
           height: 'auto',
           py: 0.5,
           px: 1,
           alignSelf: 'start',
           borderRadius: '8px', // SHAPE.sm
           '& .MuiChip-label': {
             display: 'block',
             overflow: 'visible',
             textOverflow: 'clip',
             whiteSpace: 'normal',
             px: 0.5,
           },
         }}
         label={
           <Box component="span" sx={{ display: 'block', textAlign: 'center' }}>
             <Box component="span" sx={{ display: 'block', whiteSpace: 'nowrap', fontWeight: 700, lineHeight: 1.35 }}>
               {tI('home.trackProgressCount', { done, total })}
             </Box>
             <Box component="span" sx={{ display: 'block', whiteSpace: 'nowrap', lineHeight: 1.35, color: 'text.secondary' }}>
               {tI('home.trackProgressUnit')}
             </Box>
           </Box>
         }
       />
     );
   }
   ```
   (`tI` is already the prop of `TracksSection`; call shape matches line 535's `tI('home.trackProgress', …)` without the `translation:` prefix.)
6. Lines 464-465, 477-478, 496-498: change the three `tracksTitle` headers from `<Typography variant="subtitle1" sx={{ fontWeight: 600 }} gutterBottom>` to `<Typography variant="h6" component="h2" sx={{ fontWeight: 700 }} gutterBottom>`.
7. Lines 351-353 (SubjectSections domain titles): same `variant="h6" component="h2" sx={{ fontWeight: 700 }}` change, so "Programação"/"Matemática" match "Trilhas".
8. Do NOT introduce `noWrap`, `-webkit-line-clamp`, or `text-overflow: ellipsis` anywhere in this file (house rule "quebra, nunca recorta"; e2e-spacing F104 scans the Home frame).

## file: app/src/i18n/locales/pt-BR/translation.json
1. Line 529: replace
   `"trackProgress": "{{done}} de {{total}} aulas concluídas",` with
   ```
   "trackProgressCount": "{{done}} de {{total}}",
   "trackProgressUnit": "aulas concluídas",
   ```
2. Line 531: replace `tracksEmptyDescription` value with:
   `"Este app não cria trilhas sozinho: o conteúdo é adicionado por quem produz os cursos. Enquanto não houver nenhuma trilha instalada, esta seção fica assim mesmo: não é erro."`
3. Keys `tracksTitle`, `tracksDescription`, `tracksLoadFailed`, `tracksTimeout`, `tracksEmptyTitle`, `tracksLoading` unchanged.

## file: app/src/i18n/locales/en/translation.json
1. Line 529: replace
   `"trackProgress": "{{done}} of {{total}} lessons done",` with
   ```
   "trackProgressCount": "{{done}} of {{total}}",
   "trackProgressUnit": "lessons done",
   ```
2. Line 531: replace `tracksEmptyDescription` value with:
   `"This app does not create tracks on its own: content is added by the people who author the courses. Until a track is installed this section stays like this: it is not an error."`
3. Exact key parity with pt-BR is mandatory (tests/i18n-resources.test.ts asserts it).

## file: app/resources/tracks/c-iniciante/track.json
1. Line 5: change `"Curso 1 de 4 da cadeia de C, feito…"` to `"Curso 1 de 4 da trilha de C, feito…"` (rest of the string unchanged).
2. Line 12: `"zero absoluto — nunca programou"` -> `"zero absoluto: nunca programou"`.

## file: app/resources/tracks/python-iniciante/track.json
1. Line 12: `"zero absoluto — nunca programou"` -> `"zero absoluto: nunca programou"`.

## file: app/resources/tracks/rust-iniciante/track.json
1. Line 5: replace `"…o aluno escreve um crate inteiro sozinho — funções, decisão, laços, structs, enums, coleções e o modelo de dono e empréstimo que é o centro da linguagem."` with the same text using a colon: `"…o aluno escreve um crate inteiro sozinho: funções, decisão, laços, structs, enums, coleções e o modelo de dono e empréstimo que é o centro da linguagem."`
2. Line 12: `"zero absoluto — nunca programou"` -> `"zero absoluto: nunca programou"`.

## Verification (implementer's checklist)
1. `npm test` from `app/` (unit suite, includes i18n parity and cx-views SSR assertions).
2. Badge layout: at window widths 1440 / 943 / 560 the badge shows exactly 2 lines ("1 de 115" / "aulas concluídas"), no word is split, and the description column keeps a >= 12px gutter from the badge.
3. i18n robustness: temporarily set `trackProgressUnit` to a 30% longer string (e.g. "aulas concluídas registradas") and `done/total` to 4-digit numbers; layout must hold (badge widens, text wraps, nothing clips).
4. Run `app/tests/e2e/e2e-spacing.spec.ts` (F104: no `text-overflow: ellipsis`, no clipped boxes, no text-on-text) against the Home frame.
5. If product later demands clamping descriptions, use `Collapse` + "Mostrar mais"/"Mostrar menos" buttons (new i18n keys in both locales) - never ellipsis - and teach the e2e-spacing F104 scan about the intentional clamp region first.

# Tests at risk
- app/tests/i18n-resources.test.ts:1-8 -> asserts exact key parity pt-BR <-> en and non-empty values; WILL FAIL if `home.trackProgress` is replaced by `home.trackProgressCount`/`home.trackProgressUnit` in only one locale (update both in the same change).
- app/tests/trackOrphans.test.ts:409-412 -> asserts `home.tracksEmptyTitle` and `home.tracksEmptyDescription` exist in both locales; value rewrite is safe, key rename breaks it.
- app/tests/cx-views-views-ssr.test.ts:148-152 -> asserts the loading state renders `ptBR.home.tracksTitle` and that empty/failed strings are absent; safe as long as `home.tracksTitle` and the loading branch stay, but re-run it after the SectionTitle markup change (it renders `HomeView` to HTML).
- app/tests/e2e/e2e-spacing.spec.ts + app/tests/e2e/spacingScan.ts:269-283 -> F104 rules scan the Home session frame: computed `text-overflow: ellipsis` anywhere and any `overflow: hidden/auto/scroll` box whose scroll size exceeds its client size FAIL. Two consequences: (a) the new badge MUST reset `.MuiChip-label`'s inherited `overflow: hidden; text-overflow: ellipsis` (as spec'd); (b) any clamp/ellipsis/line-clamp on descriptions fails this spec - truncation must be "Mostrar mais" or nothing.
- app/tests/e2e/e2e-sidebar-aula-spacing.spec.ts:15-52 -> codifies the house policy "quebra, nunca recorta" (`whiteSpace: 'normal'` + `overflowWrap: 'anywhere'` for wrapped chips in the sidebar); not broken by this change, but it is the policy reference that rules out ellipsis in finding-3's remediation.
- app/tests/homeSubjects.test.ts:151-173 -> the existing pattern for "new home i18n keys present in both locales"; extend its key list with `home.trackProgressCount`/`home.trackProgressUnit` when implementing (not strictly required - parity is global - but it is the local convention).
- No test asserts the badge string "aulas concluídas", the Chip markup, or card layout in the tracks list (grep verified), so the visual restructure itself is assertion-free.
