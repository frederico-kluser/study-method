# Design read

**Screen:** first-run chooser modal "Quer um tour?" (585×542 capture, light scheme), rendered by `TutorialSelectionModal.tsx` as a custom portal (`Paper role="dialog"`, `aria-modal="true"`, scrim from `palette.scrim`).

What the eye reads, in order: (1) bold headline "Quer um tour?" + faint gray "×" top-right; (2) one-line gray subtitle; (3) two identical pill-outline option cards ("Quick Start →" and "Tutorial Completo [SIMPLIFICADO]"), both with blue `accentText` titles and gray descriptions; (4) dark text "Agora não" bottom-right. The two option cards are the loudest objects and they are **co-equal** — nothing tells the user which tour is the recommended first move. The trailing "→" appears on one card only (and, in code, only in the `hasKeys` branch), so the two cards disagree on what "clickable" looks like. The badge "SIMPLIFICADO" sits next to "Tutorial Completo" and reads as an oxymoron — is the *complete* tour *simplified*? The badge carries no decision value and, in the en locale, the same key says "Complete" (the exact opposite of the pt-BR word). "Agora não" ("Not now") is a promise of deferral, but the offer latch (`study-method-onboarding-offered-v1`) is written **before** the modal opens, so any dismiss = the offer never returns; the only way back ("Ajuda e tutorial" button) is never mentioned at the decision point.

Interaction-wise this is not a MUI `Dialog`: it is a hand-rolled portal with `role="dialog"` and `aria-modal="true"` but **no focus trap, no initial focus, no Escape handler, no accessible name** — while `OnboardingOverlay.tsx` in the same feature implements all four and even documents that "sem o laço, o `aria-modal="true"` mente" (OnboardingOverlay.tsx:87-89). Scrim click and "Agora não" and "×" all silently consume the one-shot offer.

Positive: the surface work is careful — theme-calibrated `accentText` borders/labels (≥4.5:1), measured badge ratios, a single scrim token, capsule form-language for actions (`SHAPE.pill`), a global two-color focus ring (`theme.ts:908`), and a working recovery path (`TutorialHelpButton` → `tutorialLauncherService.openSelection()`).

*(uxui-evaluator API not called — no `UXUI_API_KEY` in this session; framework applied from internal knowledge. Part-6 accessibility codes are assigned as `F.6.x.xx` per the `F.[part].[chapter].[seq]` format. No em-dash "—" is used in any copy proposed below; existing em-dashes in shipped copy are flagged in finding-13.)*

# Score (interface_type, overall_score, band)

**modal (first-run onboarding chooser) · 25 · poor**

Arithmetic: 100 − 15 (1 critical) − 42 (6 warnings) − 18 (6 suggestions) = 25. The score is dominated by the single accessibility gap (finding-1) and the dismissal-truthfulness cluster (findings-2/3/5); the visual/contrast foundation is sound (see Strengths). Re-weighting finding-1 to "warning" would yield 40 (fair).

# Findings

## finding-1 (critical, F.6.2.01 accessibility-keyboard-focus-management)
**message:** The modal declares `role="dialog" aria-modal="true"` but implements none of the contract: no initial focus is moved into the dialog on open, there is no Tab focus trap, there is no Escape handler, and the dialog has no accessible name (`aria-labelledby`). A keyboard user must Tab through the entire app behind the scrim (the portal mounts at end of `document.body`) to reach the options; a screen-reader user hears "dialog" with no name and can freely wander into the inert background that `aria-modal` claims is hidden. The codebase itself flags this exact failure mode at OnboardingOverlay.tsx:87-89 ("Sem o laço, o `aria-modal="true"` mente") and ships the correct pattern at OnboardingOverlay.tsx:233-246 (Escape), :263 (initial focus), :304-341 (Tab loop) — the selection modal simply never got it. This blocks the first-run onboarding task for keyboard/SR users.
**remediation:** Port the OnboardingOverlay pattern verbatim: focus the `Paper` (or the first option button) on open; wrap Tab/Shift+Tab in a loop over the dialog's focusable elements; `Escape` → the same dismiss handler as "Agora não"; restore focus to the previously focused element on close; add `aria-labelledby` (title) and `aria-describedby` (subtitle) ids to the `Paper`.
**targets:** `app/src/features/onboarding/components/TutorialSelectionModal.tsx:76-83` (Paper: add `aria-labelledby`/`aria-describedby`, `tabIndex={-1}`, `ref`) -> add `useEffect` mirroring `app/src/features/onboarding/components/OnboardingOverlay.tsx:233-246,263,304-341`; `TutorialSelectionModal.tsx:85-87` (title `Typography`: add `id`), `:98-100` (subtitle: add `id`).

## finding-2 (warning, F.C.1.4.01 error-prevention — dismiss copy lies)
**message:** "Agora não" ("Not now") promises the offer will return. It never does: `useFirstRunTutorialPrompt` latches `study-method-onboarding-offered-v1` **before** opening (useFirstRunTutorialPrompt.ts:68-69), and `onClose` at OnboardingHost.tsx:133 only flips local state. Dismissing via "Agora não", "×", or scrim click permanently consumes the offer. The recovery affordance exists ("Ajuda e tutorial" button → `tutorialLauncherService.openSelection()`) but is never referenced at the decision point, so risk-averse users either take a tour they don't want or lose it believing they chose "later". The only copy that mentions the help button appears *after* tour completion (translation.json `tutorial.steps.quickStartComplete.description`).
**remediation:** Keep the one-shot latch (it is a deliberate product decision, see onboardingStorage.service.ts:14-16) but make the promise truthful: add a one-line hint under the dismiss row — "Você pode abrir o tour a qualquer momento pelo botão Ajuda e tutorial." (en: "You can open the tour anytime from the Help & tutorial button."). Alternative (behavioral, breaks tests): re-offer after N sessions until a tour completes.
**targets:** `app/src/features/onboarding/components/TutorialSelectionModal.tsx:254-258` -> append footnote `Typography variant="caption"` with new key `tutorial.selection.reopenHint`; `app/src/i18n/locales/pt-BR/translation.json:651`, `app/src/i18n/locales/en/translation.json:651` (add `reopenHint` next to `dismiss`).

## finding-3 (warning, F.1.1.02 cognitive-load — "SIMPLIFICADO" badge is meaningless)
**message:** The badge next to "Tutorial Completo" says "SIMPLIFICADO" (pt-BR) / "Complete" (en) from the same key (`tutorial.selection.badgeFull`, pt-BR translation.json:656 / en translation.json:656). In pt-BR it is an oxymoron against the title ("Completo" vs "Simplificado") and its referent is undefined — simplified compared to what? It reads like leaked dev jargon from the port ("versão simplificada do ondokai"). In en it merely repeats "Full Tutorial · Complete". The badge carries zero decision value and adds a decoding cost at the exact moment of choice (Hick/cognitive load). It is rendered `textTransform: uppercase` at 11px, amplifying the shout.
**remediation:** Delete `badgeFull` and its render block. If metadata is wanted, replace with a duration chip benefiting the decision ("~2 min" / "~10 min"); otherwise let the descriptions carry the difference (they already do).
**targets:** `app/src/features/onboarding/components/TutorialSelectionModal.tsx:171-192` (remove `hasKeys ? badgeFull : …` branch or swap to a duration key); `app/src/i18n/locales/pt-BR/translation.json:656`, `app/src/i18n/locales/en/translation.json:656` (delete `badgeFull`); `app/src/features/onboarding/constants/onboardingI18n.ts:98` (drop `'translation:tutorial.selection.badgeFull'` from the typed union).

## finding-4 (warning, F.D.2.1.02 visual-hierarchy — no dominant action, inconsistent affordance)
**message:** Both option cards are the same `variant="outlined"` capsule with the same `accentText` title color — two co-equal CTAs with no recommended default (design rule: ONE primary action clearly dominant). Affordance is also inconsistent card-to-card and state-to-state: "Quick Start" shows a trailing "→" **only when `hasKeys`** (TutorialSelectionModal.tsx:140-142), replacing the "Recomendado" badge — so the arrow is a fallback decoration, not an affordance; "Tutorial Completo" shows a chip and never an arrow. When keys are missing the second card flips `variant="outlined"` → `variant="text"` (:157), so its outline vanishes and the two "cards" stop looking like siblings. A user cannot infer whether either card is a button, a link, or a toggle, nor which is recommended.
**remediation:** Give both cards the same trailing affordance (`endIcon={<ArrowForwardRounded fontSize="small" />}` on both, or none on both); make Quick Start the dominant card with a persistent "Recomendado" chip + `borderWidth: 2` / `bgcolor: 'action.selected'` (or `variant="pop"` fill); keep `variant="outlined"` in the disabled state so geometry never shifts; remove the conditional "→" span.
**targets:** `app/src/features/onboarding/components/TutorialSelectionModal.tsx:104-148` (Quick Start card: endIcon + persistent badge), `:116-142` (delete the badge↔arrow `!hasKeys ? … : …` swap), `:155-161` (drop `variant` flip: `variant="outlined"` unconditionally), `:171-210` (chip logic follows the same rule).

## finding-5 (warning, F.C.1.1.01 consistency-and-standards — pt-BR UI speaks English)
**message:** "Quick Start" is an untranslated English label inside an otherwise pt-BR UI (pt-BR translation.json:652), while the same locale already carries an abandoned localized name in dead keys `quickTourTitle: "Tour rápido"` / `quickTourDescription` (pt-BR translation.json:648-649, referenced nowhere in `src/` or `tests/` — confirmed unused). The modal therefore mixes three naming systems in one viewport: "tour" (headline), "Quick Start" (English), "Tutorial Completo" (pt-BR with English-style Title Case; pt-BR orthography uses sentence case). A prior localization pass exists half-finished in the file. English keeps it in en/translation.json:652 fine as a product term, which makes the divergence a locale-consistency failure, not a branding choice.
**remediation:** Adopt one naming strategy in pt-BR: **"Tour rápido"** and **"Tour completo"** (sentence case: "Tour completo"), en: "Quick tour" / "Full tour" — consistent with the headline "Quer um tour?" / "Want a tour?". Reuse or delete the `quickTour*` dead keys (delete `quickTourTitle`/`quickTourDescription`, keep `quickStartTitle`/`quickStartDescription` keys so `onboardingI18n.ts` and code churn stay minimal — only values change). Update e2e selectors to `data-testid` so copy is free to evolve (see Fix spec).
**targets:** `app/src/i18n/locales/pt-BR/translation.json:648-649` (delete dead keys), `:652` ("Quick Start" -> "Tour rápido"), `:654` ("Tutorial Completo" -> "Tour completo"); `app/src/i18n/locales/en/translation.json:648-649,652,654`; `app/src/features/onboarding/constants/onboardingI18n.ts:93-94` (unchanged if keys kept; update if dead keys deleted from the union).

## finding-6 (warning, F.1.1.02 cognitive-load — a full sentence in an 11px ALL-CAPS badge)
**message:** When keys are missing, the `requiresKeys` string — "Requer as chaves de API (OpenRouter + Brave)." (pt-BR translation.json:657), a 43-character sentence — is rendered inside the badge style: `fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.08` (TutorialSelectionModal.tsx:194-209). A wrapped all-caps letterspaced sentence is near-unreadable (word shape destroyed, ~4.5:1 contrast at 11px against `action.hover`), and it is the sole explanation of *why* the option is disabled — the one string users most need to read in that state. Badges are for 1-2 word tags; sentences belong in body text.
**remediation:** Move the requirement out of the disabled button entirely (disabled controls are skipped by SR tab order) as a sibling note below the card: `<Stack direction="row" gap={1}><InfoOutlined fontSize="small"/><Typography variant="body2" color="text.secondary">{t('…requiresKeys')}</Typography></Stack>` above the "Configurar chaves" button. Badge style reserved for `badgeRecommended`.
**targets:** `app/src/features/onboarding/components/TutorialSelectionModal.tsx:193-210` -> replace badge `Box` with a body2 note; keep it outside the `disabled` `Button` (i.e., in the `Box` sibling at :217-250).

## finding-7 (warning, F.6.1.03 accessibility-aa-contrast — gated card defeats the calibrated disabled color)
**message:** The theme deliberately re-styles disabled buttons so blocked information stays readable — `MuiButton '&.Mui-disabled'` sets `color: text.secondary` with a measured 5.24:1 rationale ("ESTE carrega o motivo do bloqueio… precisa ser LIDO", theme.ts:1052-1076). The modal overrides the gated card's title back to `color: 'text.disabled'` (TutorialSelectionModal.tsx:167), which is the very token the theme abandoned for failing legibility. The title "Tutorial Completo" in the `!hasKeys` state sits below AA and contradicts a measured, documented decision in the same repo.
**remediation:** Delete the `...(!hasKeys ? { color: 'text.disabled' } : {})` spread; let the theme's `Mui-disabled` color apply. Nothing else needs to change.
**targets:** `app/src/features/onboarding/components/TutorialSelectionModal.tsx:165-170` -> `<Typography variant="subtitle1" sx={{ fontWeight: 600 }}>`.

## finding-8 (warning, F.6.2.02 accessibility-semantics — fake button for "Configurar chaves")
**message:** The recovery CTA "Configurar chaves" is a `<Box component="span" role="button" tabIndex={0}>` with hand-rolled `onKeyDown` (TutorialSelectionModal.tsx:218-249). Problems: (a) the Space branch (:226-231) never calls `e.preventDefault()`, so activating with Space also scrolls the page; (b) it re-implements what `Button` gives free — the codebase's global `*:focus-visible` ring (theme.ts:908) does cover it, but semantics, states (hover/active/pressed), and future styling drift from every other control; (c) it sits *below a disabled button* as loose inline text, so its affordance as a clickable control is weak. (The repo already learned this class of lesson in ACHADO-2, tutorialSelectionLogic.test.ts.)
**remediation:** Replace with `<Button size="small" variant="text" onClick={goToSettings}>` (theme already re-points `text` to `accentText`, theme.ts:1090-1096), placed after the card; if the span must stay, add `e.preventDefault()` to the Space branch.
**targets:** `app/src/features/onboarding/components/TutorialSelectionModal.tsx:217-250` -> real `Button`; keep `createOpenSettingsHandler` call (tutorialSelectionHelpers.ts:14-22 unchanged).

## finding-9 (suggestion, F.C.1.1.01 consistency — duplicated dismiss + mislabeled X)
**message:** Two labeled dismisses compete: "×" (top-right) and "Agora não" (bottom-right), plus scrim click — three silent exits (Escape is missing, see finding-1). MUI's X + text-dismiss pattern is acceptable only with clear hierarchy; here "Agora não" renders `color="inherit"` (dark, prominent) while "×" is `text.secondary`, so the *secondary* exit reads heavier than the standard chrome. Worse, the X's `aria-label` is `tutorial.controls.close` = **"Fechar tutorial"** (pt-BR translation.json:542) — the label for closing a *running tutorial*, wrong for a chooser modal (en "Close tutorial", equally wrong).
**remediation:** Keep both (chrome + explicit exit) but: quiet the text dismiss (`color="text.secondary"`), give X a purpose-built label `tutorial.selection.close: "Fechar"` / "Close", and route X, "Agora não", scrim and Escape through one `handleDismiss` with the reopen hint from finding-2.
**targets:** `app/src/features/onboarding/components/TutorialSelectionModal.tsx:88-95` (aria-label -> `tutorial.selection.close`), `:254-258` (`color="text.secondary"`); `app/src/i18n/locales/pt-BR/translation.json` + `en/translation.json` (`selection.close` added; `tutorial.controls.close` stays for the overlay).

## finding-10 (suggestion, F.I.2.2.02 fitts-law — 28px close target)
**message:** The X button is forced to `minWidth: 28, minHeight: 28, p: 0` (TutorialSelectionModal.tsx:92) — below the 44px target rule and below the repo's own generous standard (`TutorialHelpButton` documents 40px "acima do piso de 24px", TutorialHelpButton.tsx:36-38). It passes SC 2.5.8's 24px floor but is inconsistent and fiddly at the modal's corner.
**remediation:** Use `IconButton size="small"` with `sx={{ minWidth: 40, minHeight: 40 }}` and a `CloseRoundedIcon` (replacing the "×" text glyph, which is font-dependent and small); matches `TutorialHelpButton` exactly.
**targets:** `app/src/features/onboarding/components/TutorialSelectionModal.tsx:88-95`.

## finding-11 (suggestion, F.6.3.01 accessibility-semantics — headings/paragraphs inside buttons, bloated names)
**message:** The option buttons nest `Typography variant="subtitle1"` (MUI default component `h6`) and `variant="body2"` (`p`) inside `<button>` — invalid content model (phrasing content only) and it injects stray headings into the SR outline; the button's accessible name becomes the entire card ("Quick Start Uma visão rápida da interface, sem exigir configurar chaves. Ideal para começar agora."), which is what the e2e regexes silently rely on. Accessible names should be short and distinctive.
**remediation:** Add `component="span"` to both `Typography`s inside buttons; set explicit `aria-label` (e.g. `Tour rápido — visão rápida da interface`) or keep name-from-content once names are short; optionally `aria-describedby` pointing at the description id so SRs announce it as description, not name.
**targets:** `app/src/features/onboarding/components/TutorialSelectionModal.tsx:113-115,144-146,165-170,212-214`.

## finding-12 (suggestion, F.C.1.4.01 error-prevention — options flip after first paint)
**message:** `hasKeys` defaults to `true` "até resolver p/ não bloquear a 1ª open" (OnboardingHost.tsx:67-74) while `refreshKeys()` is an async IPC round-trip fired on `isReady`. If the modal opens before the promise settles, a keyless user first sees Tutorial Completo enabled with a "SIMPLIFICADO"-style badge, then watches it disable, re-badge, and grow a "Configurar chaves" link — state churn at the moment of decision.
**remediation:** Make `hasKeys` a tri-state (`'unknown' | true | false`) and render the second card disabled-neutral (no badges) until resolved; or delay `openTutorialSelection` until the first `refreshKeys` settles.
**targets:** `app/src/features/onboarding/OnboardingHost.tsx:66-79` (tri-state or gate the first-run prompt on keysResolved).

## finding-13 (suggestion, F.1.1.02 cognitive-load — narrow-width row + em-dashes in shipped copy)
**message:** The title+chip rows (`Stack direction="row"` at TutorialSelectionModal.tsx:112,164) have no `flexWrap`, so at narrow Electron windows the chip ("SIMPLIFICADO"/"Recomendado") crowds or clips the title. Separately, per the copy rules: existing em-dashes appear in user-facing copy (`tutorial.helpHint.description` — "…sobre o material — ele responde…" pt-BR translation.json:670-ish / en translation.json:670-ish; also `tutorial.steps.openLesson.description` en); none appear in the tour-modal strings themselves.
**remediation:** `flexWrap: 'wrap'` on both rows (or `Stack` with `useFlexGap`); replace em-dashes in `helpHint`/`openLesson` copy with commas/colon in both locales when those strings are next touched.
**targets:** `app/src/features/onboarding/components/TutorialSelectionModal.tsx:112,164`; `app/src/i18n/locales/pt-BR/translation.json` (`tutorial.helpHint.description`), `app/src/i18n/locales/en/translation.json` (same + `steps.openLesson.description`).

# Strengths

- **Calibrated contrast, measured in-repo.** Outlined pills use `accentText` for border+label (theme.ts:1096-1104, "reapontado para accentText, que o contrato calibrou como texto") — the light-blue outline in the screenshot is ≥4.5:1 by contract, comfortably above the 3:1 non-text floor. Badges were re-tinted after measurement (TutorialSelectionModal.tsx:128-135: 9.24:1 dark / 15.01:1 light on `action.selected`).
- **One scrim token.** `palette.scrim` via `color-mix` (theme.ts:667-671, designTokens SCRIM) — every overlay shares one value (TutorialSelectionModal.tsx:49-54).
- **Consistent form language.** Actions = capsule (`SHAPE.pill`, theme.ts:974-978), containers = `SURFACE_RADIUS`; the pill option cards are the system rule, not a stray style. Hover/press feedback and reduced-motion handling come with it (theme.ts:1010-1024).
- **Global two-color focus ring** (`*:focus-visible`, theme.ts:901-908) reaches every control in this modal, including the span-button.
- **A real way back exists.** `TutorialHelpButton` ("Ajuda e tutorial", 40px target, tooltip + aria-label parity) reopens this exact modal via `tutorialLauncherService.openSelection()` — the recovery story is built, it is just not *stated* at the dismiss point.
- **Engineering feedback loop.** ACHADO-2 (CTA trapped inside a disabled button) was fixed *and* regression-tested (`tutorialSelectionHelpers.ts` + `tutorialSelectionLogic.test.ts`) — the same discipline will protect this fix spec.

# Fix spec (implementation-ready)

## file: app/src/features/onboarding/components/TutorialSelectionModal.tsx

1. **Dialog contract (finding-1).** Add `const paperRef = useRef<HTMLDivElement>(null)`, `TITLE_ID`/`SUBTITLE_ID` consts; on `Paper` (L76-83): `ref={paperRef}`, `tabIndex={-1}`, `aria-labelledby={TITLE_ID}`, `aria-describedby={SUBTITLE_ID}`. Add one `useEffect` keyed on `isOpen`: on open, save `document.activeElement`, focus `paperRef`; `window.addEventListener('keydown', …, true)` for `Escape` → `handleDismiss`; a Tab/Shift+Tab loop over `paperRef.current.querySelectorAll('button, [href], [tabindex]:not([tabindex="-1"])')` (same algorithm as OnboardingOverlay.tsx:304-341); on cleanup, remove listener and restore saved focus.
2. **Single dismiss path (findings-2, 9).** `const handleDismiss = () => { onClose(); }` used by X, "Agora não", scrim `onClick` (L64) and Escape. Below the dismiss `Stack` (L254-258) add: `<Typography variant="caption" display="block" sx={{ color: 'text.secondary', textAlign: 'right', mt: 1 }}>{t('translation:tutorial.selection.reopenHint')}</Typography>`. Change dismiss Button to `color="text.secondary"`.
3. **X button (findings-9, 10).** Replace L88-95 with `<IconButton size="small" aria-label={t('translation:tutorial.selection.close')} onClick={handleDismiss} sx={{ minWidth: 40, minHeight: 40, color: 'text.secondary' }}><CloseRoundedIcon fontSize="small" /></IconButton>`; add `import IconButton from '@mui/material/IconButton'; import CloseRoundedIcon from '@mui/icons-material/CloseRounded';`.
4. **Option cards (finding-4).** On the Quick Start `Button` (L104-148): `variant="outlined"` kept, `endIcon={<ArrowForwardRounded fontSize="small" />}`, and dominant treatment `sx={{ borderWidth: 2, borderColor: 'primary.accentText', bgcolor: 'action.selected' }}` (tune hover via `'&:hover': { bgcolor: 'action.selected' }` if needed). On the full-tour `Button` (L155-216): same `endIcon`, `variant="outlined"` **unconditionally** (delete the ternary at L157), keep `disabled={!hasKeys}`. Delete the badge↔arrow swap at L116-142: the "Recomendado" chip becomes persistent on Quick Start (`badgeRecommended`), the arrow moves to `endIcon` on both.
5. **Chips and gated copy (findings-3, 6, 7).** Delete the `badgeFull` render (L171-192). Delete the `requiresKeys` badge (L193-210) and move the note outside the disabled button into the sibling `Box` (L217-250): `<Stack direction="row" spacing={1} sx={{ mt: 0.5, px: 2, alignItems: 'flex-start' }}><InfoOutlined fontSize="small" sx={{ color: 'text.secondary', mt: 0.25 }} /><Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('translation:tutorial.selection.requiresKeys')}</Typography></Stack>`. Remove the `text.disabled` spread at L167 (title becomes plain `sx={{ fontWeight: 600 }}`).
6. **Real button for "Configurar chaves" (finding-8).** Replace the span (L218-249) with `<Button size="small" variant="text" onClick={goToSettings} sx={{ ml: 1.5, mt: 0.5, px: 1 }}>{t('translation:tutorial.selection.openSettings')}</Button>`; keep `createOpenSettingsHandler` (tutorialSelectionHelpers.ts unchanged).
7. **Semantics cleanup (findings-11, 13).** Add `component="span"` to the four `Typography`s inside the two option buttons (L113, L144, L165, L212); add `flexWrap: 'wrap'` to the title rows (L112, L164). Add `data-testid="tutorial-option-quick-start" | "tutorial-option-full" | "tutorial-selection-dismiss"` to the two option buttons and the dismiss button.

## file: app/src/i18n/locales/pt-BR/translation.json

1. L648-649: delete dead keys `quickTourTitle`, `quickTourDescription`.
2. L651 `"dismiss"`: keep `"Agora não"`; add sibling `"reopenHint": "Você pode abrir o tour a qualquer momento pelo botão Ajuda e tutorial."`.
3. L652 `"quickStartTitle"`: `"Quick Start"` -> `"Tour rápido"` (L653 description unchanged, already plain and functional).
4. L654 `"fullTutorialTitle"`: `"Tutorial Completo"` -> `"Tour completo"` (sentence case, pt-BR norm).
5. L656: delete `"badgeFull": "Simplificado"` (and the whole key).
6. L657 `"requiresKeys"`: `"Requer as chaves de API (OpenRouter + Brave)."` — acceptable as body2; no uppercase rendering remains after fix 5.
7. Add `"close": "Fechar"` under `tutorial.selection`.
8. No em-dash in any string above. (Flagged existing: `tutorial.helpHint.description` uses "—" — replace with ":" when touched.)

## file: app/src/i18n/locales/en/translation.json

1. L648-649: delete `quickTourTitle`, `quickTourDescription`.
2. L651 `"dismiss"`: keep `"Not now"`; add `"reopenHint": "You can open the tour anytime from the Help & tutorial button."`.
3. L652 `"quickStartTitle"`: `"Quick Start"` -> `"Quick tour"` (drops the English term from pt-BR while keeping the two locales symmetric).
4. L654 `"fullTutorialTitle"`: `"Full Tutorial"` -> `"Full tour"`.
5. L656: delete `"badgeFull": "Complete"`.
6. Add `"close": "Close"` under `tutorial.selection`.
7. Em-dash flags: `tutorial.helpHint.description`, `tutorial.steps.openLesson.description` — replace "—" when next touched.

## file: app/src/features/onboarding/constants/onboardingI18n.ts

1. L98: remove `'translation:tutorial.selection.badgeFull'`.
2. Add `'translation:tutorial.selection.close'` and `'translation:tutorial.selection.reopenHint'` to the key union (keep `quickStartTitle`/`quickStartDescription` — keys unchanged, only values).

## file: app/tests/e2e/e2e-onboarding.spec.ts

1. L36-37, L83: `getByRole('button', { name: /Quick Start/ })` -> `page.getByTestId('tutorial-option-quick-start')`; `/Tutorial Completo/` -> `getByTestId('tutorial-option-full')` (decouples tests from copy permanently).
2. L35, L69, L82: keep `getByRole('heading', { name: 'Quer um tour?' })` — title unchanged.
3. L70 `getByRole('dialog')` count 0 — unchanged.

## file: app/tests/e2e/more-flows.spec.ts

1. L98: `/Quick Start/` -> `getByTestId('tutorial-option-quick-start')`.
2. L140: `/Tutorial Completo/` -> `getByTestId('tutorial-option-full')`.
3. L97, L139: heading assertions unchanged.

## file: app/src/features/onboarding/OnboardingHost.tsx (optional, finding-12)

1. L66-74: change `hasKeys` to tri-state; pass `hasKeys={hasKeys === true}` and gate the first-run prompt (`useFirstRunTutorialPrompt` L91-97) on `keysResolved` so the modal never paints the wrong gated state. Only if finding-12 is taken; otherwise leave.

**Order of execution:** modal a11y (1) -> dismiss copy+hint (2) -> X (3) -> cards (4) -> chips/gated copy (5) -> CTA button (6) -> semantics (7) -> locales (both files, keep parity) -> `onboardingI18n.ts` -> e2e specs -> run `npm test` (app/) + Playwright onboarding specs.

# Tests at risk

| Test | Coupling | Breaks when |
|---|---|---|
| `app/tests/e2e/e2e-onboarding.spec.ts:35-37,69,82-83` | `getByRole('heading', 'Quer um tour?')`, `getByRole('button', /Quick Start/)`, `/Tutorial Completo/`, `getByRole('dialog')` | option/title copy changes (finding-5), roles move to testids (fix spec), dialog role changes |
| `app/tests/e2e/more-flows.spec.ts:90-98,126,139-140` | same names + first-run modal appearance + Quick Start completing to `completed` | same as above; also if dismiss semantics change (finding-2 option B) |
| `app/tests/tutorialSelectionLogic.test.ts` (whole file) | `createOpenSettingsHandler` close→navigate contract ("ACHADO-2") | CTA refactored (fix 6) changes handler shape/order |
| `app/tests/onboardingTutorials.test.ts:27-80` | Quick Start vs Completo step arrays + i18n key coherence ("capítulos… chaves i18n válidas") | i18n keys renamed/deleted (badgeFull, quickTour*) without updating `onboardingI18n.ts` |
| `app/tests/onboardingStorage.test.ts:125-165` | `markTutorialSelectionOffered`/`wasTutorialSelectionOffered` one-shot latch | finding-2 option B (true "later" semantics) |
| `app/tests/onboardingFirstRun.test.ts` | `shouldOfferFirstRunTutorial` rule + offer gating | offer semantics or `hasKeys` gating changes (finding-12) |
| `app/tests/i18n-resources.test.ts`, `app/tests/i18n-wiring.test.ts` | locale key parity pt-BR/en, typed key union | any locale key edit done in one locale only, or `onboardingI18n.ts` drift |
| `app/tests/tutorialLauncher.test.ts` | reopen path (`openSelection`) | dismiss/reopen behavior changes |
| `app/tests/e2e/helpers.ts:28,94`, `helpers-real.ts:127` | pre-mark the offer flag to keep the modal out of unrelated specs | offer flag semantics change (finding-2 option B) |
| `app/tests/shellNavPanel.test.ts:77` | imports `quickStartSteps` | file moves/renames during naming cleanup (not required by this spec) |
