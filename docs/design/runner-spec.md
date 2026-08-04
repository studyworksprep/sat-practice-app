# Runner design spec — the codified Bluebook exception

> **Status: Living.** Last verified against code 2026-08-03.
> This is the design contract for the two "runner" surfaces — the
> practice-session runner and the practice-test runner. Design audits
> and restyles of the runners work from this document. The runners'
> resemblance to College Board's Bluebook app is **deliberate product
> intent**, not legacy residue.

## Why the runners look the way they do

Students take the real SAT in Bluebook. Practicing inside a layout that
mirrors Bluebook builds test-day familiarity: the timer is where it
will be on test day, mark-for-review works the same way, the question
map behaves the same way. So:

- The **practice-test runner** aims for **close parity** with the
  Bluebook module experience.
- The **practice-session runner** (drills, assignments, reviews) is a
  **brand-aligned echo** of the same layout — same regions and verbs,
  visibly more Studyworks: brand serif accents, floating cards, subject
  coloring, richer learning tools (hints, detours, notes, flashcards).

Any audit that flags the runners as "inconsistent with the design
system" should be answered with this spec: consistency around the
runners is mandatory; consistency *inside* them is subordinate to
Bluebook familiarity.

## Where the runners live (and what styles them)

Both runners are styled **entirely by CSS Modules +
`app/styles/next-tokens.css`**. `app/globals.css` contains no runner
styles — the dead runner/practice-test sections that used to live
there (old `.ptSession*` Bluebook chrome, global `.option` styles,
etc.) were deleted 2026-08-01 (upgrade-plan §6.2).

| Surface | Component | Styles |
|---|---|---|
| Practice-session runner | `lib/practice/PracticeInteractive.js` (mounted from `app/(student)/practice/s/[sessionId]/[position]/` and the tutor-training twin) | `lib/practice/PracticeInteractive.module.css` |
| Question card (shared) | `lib/ui/QuestionRenderer.js` | `lib/ui/QuestionRenderer.module.css` |
| Practice question map | `lib/practice/QuestionMap.jsx` | `lib/practice/QuestionMap.module.css` |
| Practice-test runner | `app/(student)/practice/test/attempt/[attemptId]/m/[moduleAttemptId]/[position]/TestRunnerInteractive.js` + `NavPopover.js` | `TestRunner.module.css` (same dir) |
| Module review ("Check your work") | `.../m/[moduleAttemptId]/review/ModuleReviewInteractive.js` | `ModuleReview.module.css` |
| Header tools (calculator, reference) | `lib/ui/ToolButton.tsx`, `lib/ui/ReferenceSheetButton.jsx` | `app/styles/next-tools.css`, module CSS |

Both runner routes suppress the app shell (sidebar) via
`SHELL_SUPPRESSED_PATTERNS` in `lib/ui/nav-links.ts`, checked
client-side in `lib/ui/AppSidebar.tsx` (client check because App
Router layouts don't re-render on soft navigation). Presenter mode
needs no suppression — it's client-side state inside report pages.

## Parity-locked (do not restyle without owner sign-off)

These are the elements whose **structure, placement, and behavior**
mirror Bluebook. Changing them trades away test-day familiarity.

1. **Layout regions** — top bar (section label left, timer center,
   tools right), full-width question area, sticky bottom bar
   (question-map trigger center, Back/Next right). No max-width
   clamp on the test runner's question area.
2. **Timer placement and behavior** — always visible top-center in the
   test runner; mono digits; warn state at 5:00, critical at 0:30.
3. **Mark for review** — in the test runner it sits *in the question
   header next to the question number* (Bluebook placement), a
   borderless flag that tints gold when active. The practice runner
   may move it to the header toolbar (echo, not parity).
4. **Question map** — the test runner's map is a *popover from the
   bottom-bar trigger* showing answered (solid) / unanswered (dashed) /
   marked (gold bookmark) with a location pin over the current
   question, plus "Go to Review Page". Binary answered/unanswered
   only — the test map never reveals correctness.
5. **Option interaction** — lettered circle badges, whole-row click
   target, and the **eliminate/cross-out control** (per-option
   strike-through with undo). SPR (student-produced response) input
   with the accepted-format hint.
6. **Module review page** — "Check your work" with the full bubble
   grid before submit.
7. **No feedback during a test module** — no correctness signal, no
   hints, no rationale until the module is submitted (the practice
   runner deliberately breaks this: it's a learning surface).

## Brand-adjustable (token-level polish is welcome)

Within the structures above, these are Studyworks-owned and should
track the design system:

- **Color tokens** — all chrome colors come from
  `app/styles/next-tokens.css` (navy `--color-app-primary` accent,
  gold highlight, semantic success/danger). No hardcoded palette
  hexes in runner CSS beyond `#fff`-on-fill text and fallback values
  that duplicate the token.
- **Typography** — Inter everywhere; the brand serif (Playfair) may
  appear in small flashes (the practice runner's "06 / 24" progress
  pill, the review page's "Check your work" heading) but never in
  question content.
- **Focus states** — `:focus-visible` rings on options, nav buttons,
  map cells (shipped in §6.3); always brand-navy, never browser-blue.
- **Micro-interactions** — hover states, the Bluebook-style
  active-press flash on Next, view transitions on question advance
  (§6.3b), skeletons.
- **Radius / shadow / spacing** — token-scale values.

## The echo-vs-parity distinction, concretely

Current, intentional differences between the two runners:

| Dimension | Test runner (parity) | Practice runner (echo) |
|---|---|---|
| Page background | flat `--bg` | tinted `--bg-tint` wash; white cards float |
| Header | flat edge-to-edge bar, border-bottom | floating rounded card with shadow |
| Subject identity | none (Bluebook shows none) | 3px subject rail on the question card (`--color-subject-rw` orange / `--color-subject-math` blue), subject-tinted map cells |
| Question map | popover, binary states | always-visible sticky strip with correctness colors, legend, mono numerals |
| Brand serif | review-page heading only | progress-pill numerals |
| Feedback | none until submit | submit-per-question with result banner, rationale, hints, detours |
| Extra tools | calculator, reference sheet | + notes, flashcards, error log, concept tags, hint panel, step-back detours |

Rule of thumb: **the test runner may gain brand polish only at the
token level; the practice runner may additionally take brand structure
(cards, rails, serif flashes) as long as the region layout and the
option/map/timer verbs stay recognizably Bluebook.**

Both columns of the two-pane layouts are plain white. (2026-08-03:
the cream passage wash and the soft math-blue Desmos-pane wash were
removed by owner preference — the tinted columns read as odd against
the otherwise neutral cards. Column separation relies on the 1px
divider alone; the subject rail carries subject identity.)

The reading two-column boundary is a **draggable divider**
(2026-08-03, a parity *addition* — Bluebook's reading view has one):
QuestionRenderer's `.paneDivider` between the passage and question
panes, ported from presenter mode's calculator divider (pointer-
captured drag, ←/→ on the focused separator, 25–70% clamp,
double-click resets to the stylesheet default — even split, or the
wider 6.5b data-table split). The chosen width persists in
localStorage (`sw:qr-pane-split`) and follows the student across
both runners and the review/report surfaces, which all share the
renderer. The Desmos slot layout (math questions with the
calculator open) carries the same divider under its own key
(`sw:qr-calc-split`); it goes zero-width and inert while the
calculator is collapsed so the open/close animation is
undisturbed.

Presenter mode renders questions **frameless** (2026-08-03):
QuestionRenderer's `frameless` prop drops the rounded-card chrome so
the two-column layouts fill the stage edge-to-edge — a reading
passage|question split then reads exactly like the math
calculator|question split, which is the parity the two question types
were missing. Single-column stacks clamp to 920px instead (a
full-bleed option row on a projector is unreadable). Only presenter
passes the prop; the runners and in-page report panes keep the card.

## Known deviations to keep (and why)

- The practice runner's per-question **Submit** (vs Bluebook's
  navigate-only autosave): pedagogical — immediate feedback is the
  point of practice.
- **Hints ("Need a nudge?") and detour cards** exist only in the
  practice runner; the test runner's question loader never even
  selects the `hints` column (parity by construction, §3.2).
- **ACT sessions** reuse the practice runner with a `SectionTimer`
  pill; ACT has no Bluebook equivalent, so parity pressure doesn't
  apply there.

## Housekeeping rules

- New runner styles go in the module CSS files listed above — never
  in `app/globals.css`.
- Colors reference tokens; if a needed tint doesn't exist, add a token
  to `next-tokens.css` (or use `color-mix` on an existing token) —
  don't inline a hex.
- Anything that changes a parity-locked element (list above) needs an
  explicit owner decision recorded in the upgrade plan or this spec.
