# Lesson Improvement Plan — 2026-08

> **Status: Living document — active plan.** Drafted 2026-08-18 from
> the findings in `lesson-suite-review-2026-08-18.md` (Historical).
> Delivery is tracked in the **Status ledger** below; every step that
> lands updates its row, per the docs rules. Last verified against code
> 2026-08-21.

This plan turns the review's recommendations into phased work and says,
for every step, **who does it**: an AI-authored step (a Claude Code /
Codex session producing a PR or a spec revision that a human reviews) or
a tutor-team task (judgment about students and the test, decisions,
recordings, sign-off). It deliberately reuses what the platform already
has — `review_queue`, `recommendLessonsForSkills`, `feature_efficacy`,
progressive hints, pattern tagging — and it does not restate the tutor
workstream in `foundations-and-question-patterns.md` §4; where a step
depends on that work it says so.

---

## Status ledger

| Phase | State | Notes |
|---|---|---|
| 0 — Unblock QA | **Complete** (2026-08-21) | **0.1 and 0.2 applied 2026-08-19** (one PR, 11 specs; every spec still passes the validator with zero warnings). 0.1: all seven §6.1 defects closed as specified, except Scale Factor 39-D uses `5:6` (the reversed A-to-B ratio) rather than the review's `72:50`, which reduces to choice A. 0.2: Systems 11/17/20/26 now say "click the intersection" (17 gets a fresh system, `x+y=8`/`y=3x`, because block 16 printed the old one; 20/26 gain a preset of the just-entered system; 26-D `{−3,2}` duplicated 26-A and is now "q=8 only"); Functions 14; Percentages 24 (90 is 25% greater than 72), guided 13–15 → 48 of 60 (80%), practice 35–36 → 51 of 85 (60%), plus the §6.2 20/22 pair (19/21 success messages no longer state the answer; block 16's example decoupled); x-Intercepts 29 rebuilt with graph-adjacent distractors and 40 deleted (spec is now 41 blocks — block numbers after 39 shift down by one relative to `dca3e524`). **0.4 verified and 0.3 applied 2026-08-20** (3 more specs; validator still zero warnings): (1) Subject–Verb 4 hedged to "In our review of released digital SAT and earlier SAT forms…"; (2) tutors confirmed `repeat()` exists in general Desmos but not in Bluebook — List Tools 28 kept, wording tightened to name the Bluebook calculator; (3) "%→of" auto-insert confirmed on all Desmos versions — no change; (4) tutor decision: no `stdev`/`stdevp` footnote in Standard Deviation; (5) Command of Evidence carries a top-level `authoring_notes` key coupling the two debriefs to their `question_link` UUIDs (importer ignores unknown top-level keys). **0.6 imports done 2026-08-20**, with a corrected premise: production (studyworks.io / Supabase `noqtadytxyslkoetchrs`) never matched the review's "21 drafts, 9 unimported" snapshot — that described the dev DB. In reality 29/30 specs were already imported **and published** (spec add-dates track lesson creation 2026-07-20→08-18). With the owner's approval, the 14 Phase-0-edited specs were re-imported (replace) into their live published lessons via Admin → Import, and `similar-triangles` was imported as a new draft (37 blocks). Three production lessons have no repo spec: "Testing Equivalent Expressions with Desmos Sliders", "Find Missing Constants in Equivalent Expressions with Regression" (published), "Special Right Triangles: Recognize, Scale, Solve" (draft) — reverse-drift to reconcile. Tutor-flagged follow-up 2026-08-20: the Transitions though-section was expanded beyond the 0.1 fix — new `though_initial_rules` + `though_initial_check` blocks teach that clause-initial ". Though," / "; though," is never a valid transition (eliminate on sight; verified against usage references) and initial though without a comma always creates a dependent clause; blocks 7/26 updated for consistency (36 blocks; re-imported). **0.5 signed off 2026-08-21**: the tutor team manually inspected every lesson (on live content, since 0.6 preceded it in practice), closing the phase. Also landed during QA: an image audit of all 14 lesson-authored SVGs fixed seven figures (font-dependent glyphs, mis-drawn angle arcs, oversized arrow markers, an overflowing callout) in PR #327. Exit criteria met: §6.1 closed, §6.3 resolved, edited specs re-imported. Carry-forwards: publish decision for the Similar Triangles draft, and reconciling the three spec-less production lessons. |
| 1 — Make checks mean something | **In progress** (2026-08-21) | **1.1–1.3 implemented 2026-08-21** (one PR). 1.1: `check_answers` entries now carry the full attempt history — `{selected, correct, first_try_correct, attempts:[{selected, at}]}` — built by a shared reducer (`applyCheckAttempt` in `lib/lesson/runtime-progress.mjs`) that both the slideshow's local state and the progress actions run; wrong attempts on retry checks and gated Desmos blocks persist with `markComplete:false` so the block stays out of `completed_blocks` and the Continue gate holds across reload (verified end-to-end on studyworks-dev: wrong attempt → reload → selection restored un-revealed, gate locked, attempt in the DB). Legacy two-key entries still read correctly everywhere. 1.2: completion banner now reports first-try accuracy ("You got N of M checks right on the first try"), lists 3+-try steps, and carries a per-check breakdown behind a disclosure — copy is a draft pending 1.7. 1.3: lesson-assignment tutor surfaces — roster page gains per-student progress bar + first-try badge + View report link, a cohort First-try accuracy tile, and a "Lesson checks" struggled-blocks rollup (struggled = 3+ tries or final wrong); the per-student report page renders a per-check table (step, label, first try, tries, final) from `lesson_progress`, with graceful never-started and legacy-entry states. Report logic in `lib/lesson/progress-report.mjs` with unit tests; components in `app/(tutor)/tutor/assignments/[id]/LessonProgressSections.tsx`. Also fixed in passing: a lesson with zero blocks crashed the slideshow (null `.open` read on the calculator override). **1.7 decided 2026-08-22 (owner):** reveal after 2 misses; reveal text = new `solution` field (worked solution, `explanation` fallback); the transfer-check list in `lesson-transfer-checks-proposal-2026-08.md` confirmed as proposed (60 transfer + 31 retrieval designations, all ⚠ judgment calls included). **1.4 + 1.5 implemented 2026-08-22** (one PR). 1.4 runtime: retry checks escalate on the second miss — the worked `solution` (fallback `explanation`) is revealed in an accent-bordered box (newlines render as step breaks), the block completes as struggled (`correct:false` in the attempt entry, so the banner, tutor heat-map, and first-try stats all see it), and Continue unlocks; the miss count restores from the persisted attempt history so a reload can't reset the countdown (verified end-to-end on studyworks-dev). Plumbing: `solution` + `max_attempts_before_reveal` validated in `lesson-validation.mjs` (non-empty string; positive integer; warning when `solution` sits on a one-shot check where it never shows), an editor field in the check form, generator-prompt + authoring-guide §2d/§3b updates; the importer needed nothing (`raw_block` content passes through). Banner copy now reads "Worth another look: Step N" covering both 3+-try and finalized-wrong blocks. 1.5: `scripts/apply-one-shot-checks.mjs` flipped all 91 designated checks to `allow_retry: false` (surgical text edits; parse-level verification that nothing else changed); all 32 specs still validate with zero warnings. Also landed: worked `solution` texts drafted for 72 retry checks across 19 specs (the practice/guided/chain checks plus computation-heavy appliers; agent-drafted, keys re-verified independently, answer-letter cross-checked against `correct_index` at apply time). Tutor-flagged revision 2026-08-22: 15 solutions in the six Desmos-method lessons walked by-hand algebra or verified by substitution where the lesson's point is the calculator workflow — rewritten technique-first in each lesson's own vocabulary (RMSE confirmation only where the lesson teaches RMSE; "read the assigned value" for custom regression; "Desmos displays" for standard regression; intercept labels for x-intercepts; "Desmos returns" for list tools), and the technique-fidelity rule added to the authoring guide §3b and the generator prompt — **1.8 complete 2026-08-22:** the tutor team reviewed all 72 drafted solutions on a generated review page (prompt, choices with the key marked, and hint / two-miss reveal / explanation side by side, LaTeX pre-rendered — rebuildable from the specs) and approved them with no changes. **Re-import complete 2026-08-25:** all 32 edited specs imported into production via Admin → Import (replace) — owner-approved, AI-driven through the admin UI in the owner's authenticated browser session; verified per lesson against the specs by DB query (91 one-shot checks and 72 worked solutions now live; the one block-count difference, Factor Polynomials 45 vs 39, is the two `branching_question` templates expanding to four blocks each at compile time — correct). The production "Bracket the Pivot" in-app draft (updated 08-24, no content ids/flags/solutions) was replaced by the spec per the owner's more-complete call; its distinctive voice-style opener and street-tree opening example are preserved in the session snapshot for Phase 6. Discovered during verification: **four production lessons have no repo spec** — the Phase 0 pair ("Testing Equivalent Expressions with Desmos Sliders", "Find Missing Constants in Equivalent Expressions with Regression") plus two new in-app drafts already using the 1.4 fields ("Circle Toolkit: Measure, Arcs, and Equations", "Initial Modifiers: Match the Noun After the Comma") — reverse-drift to reconcile; also Similar Triangles is now published (Phase 0 carry-forward closed) and Special Right Triangles remains a draft pending a publish decision. **Remaining:** 1.9 pilot (content is now live for it); 1.6 numeric entry parked for Phase 3. |
| 2 — Item-quality pass | **In progress** (2026-08-23) | **2.1 + 2.2 implemented 2026-08-23** (one PR). 2.1: linter logic in `lib/lesson/lesson-lint.mjs` (10 rules per the plan, each unit-tested on review-style defects and a clean control), per-spec CLI at `.agents/skills/create-sat-lesson/scripts/lint-lesson-spec.mjs`, and `scripts/check-lesson-specs.mjs` wired into CI — validator errors now fail the build (new gate; specs were previously unchecked in CI) while lint findings print as a report and never fail. Tuned against the corpus to remove three false-positive classes: LaTeX command names are preserved in normalization (`\tan` vs `\cos` are different answers), choice-text equality is case-sensitive (`x=6` vs `X=6` is the Desmos variable-naming distinction), and equations carry no bare numeric value (`y=3` ≠ `a=3`). 2.2: punch list generated at `lesson-lint-punch-list-2026-08.md` — **265 findings across 32 specs / 540 checks**; corpus keyed-longest rate **35.4%** (exit target < 30%), worst lesson Inference at 91%; by rule: keyed_longest 107, extreme_imbalance 58, check_run 20, key_term_echo 20, text_run 18, retrieval_nonsense_distractor 15, missing_figure 11, hint_gives_answer 9, equivalent_choices 5 (all five verified real — two are distractors numerically equal to the keyed answer, in the Probability transfer checks), meta_prompt 2. **2.6 seeded 2026-08-25:** `trap-catalog.md` (Living, indexed) drafts the trap catalog from the corpus itself — 209 candidate traps across all 32 lessons, extracted from distractor explanations, hints, worked solutions, and the Good Cop / Bad Cop wrong-choice debriefs, each anchored to the check block ids where a distractor encodes it; every entry is status `candidate` and every name a proposal until the tutor session confirms/renames (the 6.5 names rule applies). **2.7 derived 2026-08-25:** `authenticity-sheets.md` (Living, indexed) replaces the from-memory authoring the plan assumed with empirical derivation — the owner observed the question bank IS authentic College Board Educator Question Bank content, so every sheet is computed from `questions_v2` (3,430 live items), with **PT9–11 as the canonical anchor for currency and operational weighting** (owner decision; 433 distinct recent-test questions). Per skill: bank-vs-recent weighting with drift flags, stem-length percentiles, choice-shape stats, empirically mined stem templates (all seven R&W skills run on near-invariant closing questions — use verbatim in 2.4), difficulty profiles with exemplar `display_code`s per band (item text not reproduced — College Board's). Headline findings: the two Surveys-adjacent PSDA skills appear **zero times on PT9–11**; SPR is 24% of bank math (supports keeping 1.6); hard math items run 30–60% longer than easy ones. Queries preserved in `scripts/authenticity-sheets-queries.sql` for regeneration when the bank updates. **Tutor verification pass remaining:** format drift since PT11, divergence-vs-noise calls, and drill curation. **2.5 complete + Probability correctness fixes 2026-08-26** (one PR): all 32 final-retrieval checks (the 31 designated retrieval blocks plus Good Cop's `final_wrong_choice_check`) rebuilt — every distractor is now the lesson's own process with steps swapped, omitted, or a rule inverted, at comparable length in the lesson's vocabulary; keys and `correct_index` untouched (raw-text splice with parse-level verification that only the choices arrays changed). Also fixed the three Probability from Tables `equivalent_choices` defects: block 31 60/100→39/100 (grand-total error, no longer ≡ key 39/65), block 32 14/35→14/100 and 26/65→26/100 (single-cell-favorable errors, no longer ≡ key 40/100) — both were live one-shot correctness bugs — and block 22 24/40→6/40 (joint-vs-conditional error, B no longer ≡ C). Result: `retrieval_nonsense_distractor` 15→0, `equivalent_choices` 5→2 (the Scale Factor pair remains for 2.3/2.6), corpus keyed-longest 35.4%→31.1%, punch list 265→209 open (56 rows flipped to fixed); all 32 specs validate zero-warning and the CI gate passes. Production still carries the old items until the next owner-approved re-import. **Reverse-drift reconciliation complete 2026-08-26** (same PR): the four spec-less production lessons now have repo specs — `testing-equivalent-expressions-with-desmos-sliders.json` (22 blocks, published), `find-missing-constants-in-equivalent-expressions-with-regression.json` (33, published), `circle-toolkit-measure-arcs-and-equations.json` (43, draft), `initial-modifiers-match-the-noun-after-the-comma.json` (30, draft) — closing the Phase 0/1 carry-forward. Content was pulled from production via md5-verified base64 block dumps and each generated spec compiles to a block sequence that deep-equals the production dump exactly (text blocks use the `text` sugar; everything else is `raw_block` pass-through; `calculator` lifted to the spec level per corpus style; each spec carries an `authoring_notes` provenance line). All four validate zero-warning; the corpus gate now covers 36 specs / 600 checks. Lint on the newcomers: the two in-app drafts are clean; the two older published lessons add 21 open punch-list rows (Sliders is 57% keyed-longest — a 2.3 rewrite candidate) and have no transfer/retrieval designations yet — extending the 1.5/1.7 designation pass to them is a new open item for the tutors. **2.6 + 2.7 closed 2026-08-26 by owner blanket confirmation** — the owner confirmed both review artifacts as drafted rather than running the per-row tutor session / sheet-by-sheet pass the plan sketched: all 209 trap rows (names, scopes, the 10 family names) are status `confirmed`, check-artifact rows stay as documented-never-drafted, and the authenticity sheets stand as computed (no drift flagged since PT11; divergences stand as reported). Both remain Living — rename/delete on real student observation. The two 2.7 open questions were decided: **TS&P is hosted by `reading-comprehension-process-and-pre-answer`** (verbatim function stem; dedicated lesson stays a Phase 4 candidate), and **2.4 math items are MC-only until 1.6** (SPR variants added later, SPR-heavy skills first). Still uncatalogued/undesignated: the four reverse-drift lessons. **2.3 tranche 1 complete 2026-08-26** (same PR as the 2.6/2.7 closure): all `hint_gives_answer`, `meta_prompt`, and `equivalent_choices` rows resolved — 12 fixes (hints rewritten to point at the deciding step without stating the answer; the Probability model prompt reframed off "Why is X correct"; the two Scale Factor duplicate distractors re-encoded as confirmed traps: `3/2` change-over-original and `4:25` inverted area ratio) plus 3 reasoned deferrals (Good Cop's wrong-choice debrief is the lesson's taught technique; Sliders' "p=2" is the stated test value, not the answer; Inference's retrieval echo is the keyed process itself). Also the full **Inference lesson rebuild** — the corpus's worst at 91% keyed-longest — distractors re-typed across the five confirmed traps at key-comparable length with at most one extreme-quantifier choice per item (killing both the length tell and the hedged-key tell): 18 lint warnings → 1 deferral, keyed-longest 45%. **Corpus keyed-longest is now 29.5% — under the <30% exit target**; punch list stands at 198 open / 85 fixed / 3 deferred. **2.3 tranche 2 complete 2026-08-26** (one PR): full distractor rebuilds of the six lessons above the 50% bar — CLEAR the Claim 86%→36% (15 warnings→3 structural; `hard_bridge_check` prompt made self-contained, clearing its `missing_figure`), Good Cop 74%→11% (18→2; load-bearing strong-word traps kept — they anchor the wrong-choice debrief checks — while incidental extreme words were reworded; debrief-check distractors became plausible mis-diagnoses), Process and Pre-Answer RC 81%→13% (zero warnings), Rhetorical Synthesis 78%→33% (zero; the exploration and transfer text blocks' candidate lists updated in lockstep with their checks), Surveys 63%→13%, Sliders 57%→14% (its `retrieval_nonsense_distractor` cleared). Method as tranche 1: keys and `correct_index` untouched, distractors re-typed across the lessons' confirmed traps at key-comparable length, ≤1 listed-extreme-word distractor per item, explanations verified compatible (one reworded). **Both lint exit criteria are now met: corpus keyed-longest 22.0% (<30%) and highest lesson 47% (<50%).** Punch list: 144 open / 139 fixed / 3 deferred — the remainder is the scattered long tail plus structural classes. **2.8 preview sign-off 2026-08-26:** the owner previewed the rebuilt content as a student and approved proceeding with the remaining changes. **2.4 complete 2026-08-26** (one PR): every lesson now has ≥1 authentic-format item — 34 items authored and inserted as one-shot checks (block id `authentic_item`, placed before each lesson's final retrieval check), while CLEAR the Claim and Desmos Sliders already carry real bank items via `question_link`. Each item uses its skill's verbatim near-invariant stem, sits in the sheet's p25–p75 length band, matches the skill's choice shape (1-word WIC, punctuation chunks for Boundaries, ~20-word Rhetorical Synthesis sentences, mostly-numeric math), and draws its distractors from the lesson's confirmed test-scope traps; explanations model each lesson's taught workflow. Per the owner decisions: TS&P is hosted in `reading-comprehension-process-and-pre-answer` (the structure stem, which needs no underlining) and all math items are MC with the calculator open (Desmos is always available on the real section). Self-review caught and fixed one drafting bug: a Factor-out-GCF distractor that expanded to an expression equivalent to the original. Corpus after insertion: 634 checks, keyed-longest 21.3%, highest lesson 44% — the authentic items themselves are lint-clean; `check_run` grew 21→35 because items sit adjacent to retrieval checks (structural class, Phase 3 pacing). **Long-tail sweep complete + punch list CLOSED 2026-08-26** (same PR as 2.4): 76 more blocks across 24 lessons fixed — distractors lengthened to key-comparable length, extreme-word clusters reduced to ≤1 per item, echoed lesson terms placed into a distractor — taking `keyed_longest` 52→**0** and leaving `extreme_imbalance` / `key_term_echo` only as reasoned deferrals (the Special Systems and subject–verb rows whose choices are the lessons' own taxonomy labels). Structural classes (`check_run`, `text_run`, `missing_figure`) are class-deferred to Phase 3 where pacing rework and 3.1 are scheduled. Punch list final state: **229 fixed / 57 deferred / 0 open**. **Phase 2 exit criteria are all met:** every row fixed or deferred with a reason; corpus keyed-longest 19.4% (<30%); highest lesson 44% (<50%); every lesson has ≥1 authentic-format item; linter in CI since 2.1. **Remaining for Phase 2 closeout:** the owner-approved production re-import (Admin → Import) to bring the rebuilt corpus to students. |
| 3 — Use the medium | Not started | |
| 4 — Rebuild and re-scope the laggards | Not started | |
| 5 — Wire lessons into the platform | Not started | |
| 6 — Voice and personality | Not started | |

---

## How to read the steps

- **[AI]** — authored by an AI coding session. Code lands as a PR with
  tests; lesson content lands as a spec change validated by
  `.agents/skills/create-sat-lesson/scripts/validate-lesson-spec.mjs`
  and (after Phase 2) the linter. A human reviews before merge. Nothing
  reaches students without the tutor sign-off in the same phase — lesson
  `status` stays `draft` until then.
- **[Tutors]** — the tutoring team (owner + co-instructors). Anything
  that needs judgment about what students actually do, what the current
  Digital SAT actually looks like, brand voice, or a recording.
- **[Joint]** — an AI-drafts / tutor-approves / AI-applies loop.
- **[Owner/admin]** — a production action only an admin performs
  (re-import, publish, apply a migration via the Supabase MCP per
  `supabase/migrations/README.md`).
- Effort tags are rough: **S** ≤ 1 day, **M** 2–5 days, **L** 1–2 weeks.
- Block numbers refer to the specs as of `main @ dca3e524`; use the
  block `id`s named in the review where given.

Guiding split: AI does the code, the linting, the bulk transformations,
the drafting, and the documentation; tutors decide, verify against the
real test, name things, record, and sign off. Where the review found
that a check "measures test-wiseness rather than the skill," the fix is
always Joint — an AI can draft a plausible distractor, but only a tutor
knows which wrong answer a real student picks.

---

## Phase 0 — Unblock QA (days)

**Goal:** close every verified defect from review §6.1, resolve the
claims in §6.3, and hand the tutoring team a corpus that is at least
internally correct before they continue QA.

### AI-authored steps

- **0.1 [AI, S]** Apply the seven verified defects in one PR:
  Scale Factor block 39 duplicate-correct choice; GCF block 9
  single-escaped `\times`; Boundaries `--` → em dash (13 places) and
  delete the block-24 apology; Transitions block 28 "; though, …";
  Words in Context blocks 12/16 part-of-speech strand; Reading
  Comprehension block 22 key wording; Standard Regression block 31 hint.
  Run the validator on each spec.
- **0.2 [AI, S]** Remove the answer-revealing stems and duplicate items:
  Systems by Graphing 11/17/20/26 (delete the printed intersection),
  Functions 14 (delete "(3,6)"), Percentages 24 (new numbers) and the
  three 75% items, x-Intercepts 29/40 (merge). Same PR or a second.
- **0.3 [AI, S]** Apply whatever the tutor verification in 0.4 returns
  (edits to Subject–Verb block 4 wording, List Tools block 28, the
  Standard Deviation `stdev`/`stdevp` footnote, a coupling note in the
  Command of Evidence spec).

### Tutor-team tasks

- **0.4 [Tutors, S]** Verify the five claims in review §6.3 and report
  back a yes/no + wording for each: Subject–Verb "every reviewed
  question"; List Tools `repeat()` in Bluebook; Percentages "%→of" in
  Bluebook; `stdev` vs `stdevp`; Command of Evidence debrief coupling.
- **0.5 [Tutors, S]** Preview-as-student each edited lesson; sign off.
- **0.6 [Owner/admin, S]** Re-import the edited specs into the 21
  production drafts (Admin → Lessons → import into lesson) and import
  the 9 not-yet-imported specs.

**Exit:** §6.1 closed; §6.3 resolved; edited specs re-imported. No
lesson is published yet.

---

## Phase 1 — Make checks mean something (runtime; 1–2 weeks, parallel with Phase 2)

**Goal:** the retry gate produces data, the completion summary is
honest, a stuck student is never trapped, and tutors can see where a
student struggled. This improves all 30 lessons at once.

### AI-authored steps

- **1.1 [AI, M]** Persist every attempt. Extend the `check_answers`
  payload (`lesson_progress.check_answers` is jsonb — no migration) to
  `{selected, correct, first_try_correct, attempts:[{selected, at}]}`;
  update the retry branch of the check `onSubmit` in
  `lib/ui/LessonSlideshow.jsx`, `lib/lesson/runtime-progress.mjs`, and
  the progress action so wrong attempts are written without completing
  the block (the gate semantics stay exactly as they are). Unit tests
  on the reducer; a restore-on-reload test.
- **1.2 [AI, S]** Honest completion summary. Replace "You answered N of N
  checks correctly" with first-try tally + "took 3+ tries: …" and keep a
  per-block breakdown behind a disclosure. Copy to be approved in 1.7.
- **1.3 [AI, M]** Tutor visibility. On the tutor's lesson-assignment
  student view, a per-check table (block, first-try, attempts, final)
  and a roster-level "struggled blocks" rollup per lesson. Reuse the
  assignment report components; no new tables.
- **1.4 [AI, M]** Escalate instead of looping. New optional `solution`
  (HTML) on check content — spec, importer, validator, editor field,
  generator prompt (`lib/admin/lessonGenPrompt.ts`), authoring guide §3b.
  Runtime: in retry mode, after `max_attempts_before_reveal` (default 2)
  wrong tries, show `solution` (fallback: `explanation`), mark the block
  `struggled`, unlock Continue. Draft `solution` text for the ~60
  transfer/practice checks from their explanations (Joint review 1.8).
- **1.5 [AI, S]** One-shot transfer and retrieval. Authoring-guide rule +
  a scripted pass over the 30 specs setting `allow_retry:false` on the
  final retrieval check and the designated transfer check(s) per lesson
  (list agreed in 1.7). Land after 1.1 so the first-attempt data is
  meaningful.
- **1.6 [AI, L]** Numeric-entry check. Extend `check` content with
  `input: "numeric"`, `answer`, `tolerance`, optional `accept` list —
  keeps `block_type='check'`, so no CHECK-constraint migration. Runtime
  input + validation via the existing Desmos equivalence utilities;
  editor, validator, importer, generator, guide. Then convert the
  "what value…" math checks the linter flags (Phase 2) where the SAT
  would use a student-produced response. May slip into Phase 3.

### Tutor-team tasks

- **1.7 [Tutors, S]** Policy decisions before 1.4/1.5 land: reveal
  after 2 misses (or 3)? Full worked solution or the explanation? Which
  checks are "transfer" in each lesson (AI proposes a list; tutors
  confirm)? Approve the completion-summary copy.
- **1.8 [Tutors, S]** Spot-review the AI-drafted `solution` texts (all
  60 is ~1 hour; at minimum the R&W ones).
- **1.9 [Tutors, M]** Pilot: put 3–5 students through 2–3 lessons after
  1.1–1.3 ship; compare the struggled-blocks heat-map with what the
  tutor sees in session; report whether the signal is trustworthy.

**Exit:** attempts persisted and restorable; banner shows first-try;
tutor heat-map live; escalation live with tutor-approved policy;
authoring guide updated; pilot report filed in the ledger.

---

## Phase 2 — Item-quality pass (content; 2–3 weeks, parallel with Phase 1)

**Goal:** checks measure the skill, not test-wiseness. The keyed answer
stops being the longest choice; distractors mirror real errors; hints
nudge without solving; every lesson has at least one item at real DSAT
format and length.

### AI-authored steps

- **2.1 [AI, M]** Linter. Add warnings to
  `.agents/skills/create-sat-lesson/scripts/validate-lesson-spec.mjs`
  (or a sibling `lint-lesson-spec.mjs`, wired into CI as warnings with
  a per-lesson report): keyed choice ≥ 1.4× the mean length of the
  others; keyed choice is the only one containing the lesson's key term;
  extreme-word imbalance (all/every/only/must/proved/never/always) in
  distractors vs key; hint contains the keyed answer text or "=" followed
  by the numeric answer; prompt starts "Why is … correct/wrong" (meta
  check); two numerically/ratio-equivalent choices; prose references
  ("the diagram", "the first figure", "on the previous slide") without an
  `<img>` on that slide; final-retrieval distractors that share no
  content words with the process; ≥ 3 consecutive checks with no
  explanation block; ≥ 3 consecutive text blocks. Unit-test each rule
  on the review's known examples.
- **2.2 [AI, S]** Run the linter across all 30 specs; produce one punch
  list per lesson (a tracking table in this doc's ledger or one issue
  per lesson).
- **2.3 [Joint, L]** Distractor and hint rewrites. For every flagged
  item, the AI drafts replacements as a before/after table per lesson
  (choice, the student error it encodes, revised hint that points at the
  step). Math items whose distractors already encode a named error may
  be applied directly in the PR; R&W distractors and any item where the
  "would a student pick this" call is uncertain wait for 2.6. Use the
  `create-sat-lesson` skill's revise path so the validator runs on every
  save.
- **2.4 [Joint, M]** One authentic item per lesson. Add at least one
  transfer item at genuine DSAT format and length — exact stem wording,
  Boundaries choices as "closed; the / closed, the" chunks, WIC/inference
  stems of 2–4 sentences, math stems in the shapes the test uses
  ("Which expression is equivalent…", "best interpretation of…"). AI
  drafts from the authenticity sheet in 2.7; tutors approve.
- **2.5 [AI, S]** Rebuild the 32 final-retrieval checks: shorten the key
  to distractor length or replace nonsense distractors with plausible
  mis-orderings (the process with two steps swapped, a step omitted).

### Tutor-team tasks

- **2.6 [Tutors, M]** Approve or adjust the AI-drafted distractors — this
  is the judgment step. Keep a shared **trap catalog** per skill / pattern
  ("what students actually do wrong here"), which the AI drafts from
  and which also feeds the pattern catalog in
  `foundations-and-question-patterns.md` §4 step 2.
- **2.7 [Tutors, M]** Write a one-page **authenticity sheet** per R&W
  question type and per math domain: current stem wording, choice
  formats, typical stem length, what a hard item looks like. The AI
  cannot verify these against released forms; the tutors can. Update it
  when College Board changes formats.
- **2.8 [Tutors, S per lesson]** Preview-as-student, sign off; then
  **[Owner/admin]** re-import.

**Exit:** linter in CI; every lesson's punch list closed or explicitly
deferred with a reason; every lesson has ≥ 1 authentic-format item;
corpus-wide keyed-longest rate below ~30% and no lesson above 50%
(measured by the linter's report).

---

## Phase 3 — Use the medium (runtime + content; 2–4 weeks; after Phase 1)

**Goal:** figures stay visible when they're needed, Desmos-workflow
lessons can verify the workflow, students can see how long a lesson is,
and a human voice appears in the suite.

### AI-authored steps

- **3.1 [AI, M]** Pinned figure. A block-level `figure` object (`src`,
  `alt`, `caption`) that the slideshow renders persistently in the side
  pane alongside/instead of the calculator, with spec, importer, editor,
  and runtime support. Interim (S, first): scripted pass that repeats
  the `<img>` on every referencing slide in Similar Triangles, Trig,
  Scale Factor, Standard Deviation, and Command of Evidence.
- **3.2 [AI, L]** Desmos regression/table validation. Extend
  `lib/lesson/desmos-interactive.mjs` `state_rules` (or add a
  `regression` mode) with `require_table` (expected rows), `require_regression`
  (an expression using `~`), and `expected_parameters` (`{name, value,
  tolerance}`), evaluated at runtime through the Desmos API's regression
  parameter readout. Then author gates in Custom Regression (blocks 4,
  15, 23, 33), Standard Regression, Solving Equations with Regression,
  Functions (constant-by-regression), and the rebuilt List Tools.
- **3.3 [AI, S]** Time estimate and position. Compute an estimated
  duration from block mix at read time (rule of thumb: text 0.6 min,
  check 1 min, Desmos interactive 2 min, question_link 2 min) and show
  it in the catalog card and the lesson header ("~25 min · 3 of 5 in
  Reading Foundations" once Phase 5 ordering exists). No migration.
- **3.4 [AI, S]** Interface screenshots the guide already asks for:
  the Desmos regression readout (PARAMETERS / RMSE), the Regression
  button (move the existing image to the first slide that needs it), the
  "%→of" control, the visibility toggle where missing. Commit under
  `public/images/` with alt text; add to the specs. Generated by browser
  automation against the embedded Desmos pane.
- **3.5 [AI, S]** Video convention. Confirm the `video` block embeds
  unlisted YouTube/Vimeo in the student runtime; add a "60–90 s intro
  video as block 1" convention to the authoring guide and the generator
  prompt (`video_placeholder` already exists in the generated-spec
  path).

### Tutor-team tasks

- **3.6 [Tutors, L, ongoing]** Record 60–90 second intro videos per
  lesson (face + whiteboard: name the move, the test-day payoff, one
  caution). Start with the fourteen lessons rated 4 and the section
  foundations. AI provides a one-paragraph brief per lesson.
- **3.7 [Tutors, S]** Test the new Desmos gates and the regression
  readouts against the real Bluebook calculator so instructions match
  what students will see on test day.
- **3.8 [Tutors, S]** Provide the Bluebook eliminator screenshot for
  Words in Context block 25 (needs the Bluebook app).

**Exit:** figures persist; the four regression-dependent lessons gate on
the workflow; every catalog card shows a time estimate; ≥ 10 intro
videos live; screenshots in place.

---

## Phase 4 — Rebuild and re-scope the laggards (content; 2–3 weeks; after 2.1)

**Goal:** no lesson rated below 3; the multi-tool lessons are split into
one-tool lessons; the low-SAT-yield content is repositioned.

### AI-authored steps

- **4.1 [AI, M]** Rebuild **Desmos List Tools** around three or four
  real SAT data patterns (add k to every value → new mean/median;
  combine two groups; frequency-table mean via `total(x·f)/total(f)`;
  compare spreads with `stdev`), each solved once by hand and once with a
  list, gated once 3.2 lands. Via the `create-sat-lesson` skill from a
  tutor-supplied rundown (4.6).
- **4.2 [AI, L]** Splits, each as a new spec plus a trimmed original:
  Similar Triangles → "Altitude to the hypotenuse" spun out; Surveys →
  "Sampling and scope" + "Margin of error" (with a mean ± MOE item); Trig
  → radians section out, add numeric-ratio and sin/cos-complement items,
  sketch images/presets at 13, 16, 19, 34; Functions → notation vs
  constants-by-regression; Reading Comprehension → cut 15–19 (owned by
  Inference), merge 24/25, convert 23/26/32/34 to pre-choice target
  checks; Command of Evidence → trim to CLEAR + the three tests, add one
  full CLEAR run on a single item.
- **4.3 [AI, S]** Advanced Factoring: apply the 4.6 decision (trim cubes
  or tag advanced/optional), add DSAT-form items and the
  factor-vs-graph decision slide.
- **4.4 [AI, M]** Targeted passes: Scale Factor reorder (16–18 before 8)
  and DSAT-shaped drills; My Numbers difficulty ramp; Boundaries item
  format (chunk choices, 40–80-word items); Transitions keys
  (sentence-final *however/though*, plausible second distractor);
  Percentages by-hand fallback slide + screenshots; Custom Regression
  and Standard Regression gates + readout images; Rates & Units
  interpretation transfer; Probability Tables filler removal + "no given
  that" item; Inference hedged distractors + one literary passage;
  Rhetorical Synthesis full-format item; Good Cop / Bad Cop follow-up
  checks and the block-35 retrieval check; Find the Equation
  table-of-values and exponential contexts; Special Systems slider caveat
  and no-solution ratio case; Standard Deviation dot-plot / frequency-table
  practice items.

### Tutor-team tasks

- **4.5 [Tutors, S]** Scope decisions before the AI rebuilds: which
  splits to make; keep or drop cubes; which lessons carry an
  "advanced/optional" tag; whether Similar Triangles' altitude
  configuration is worth its own lesson.
- **4.6 [Tutors, S]** Rundowns for the rebuilds — the SAT patterns for
  List Tools, the trap catalog entries per lesson (from 2.6), and any
  house-specific method the AI must preserve.
- **4.7 [Tutors, M]** QA every rebuilt or split lesson Preview-as-student;
  sign off; **[Owner/admin]** re-import; publish the ones that pass.

**Exit:** no lesson below 3 on a re-rating; List Tools rebuilt; splits
published; the ledger records each lesson's new rating.

---

## Phase 5 — Wire lessons into the platform (product; 2–4 weeks; after Phase 1)

**Goal:** a lesson is not an island. It knows what comes before it, ends
in real practice, comes back two days later, and reports whether it
worked. Reuses `review_queue`, `recommendLessonsForSkills`,
`feature_efficacy`, and pattern tagging.

### AI-authored steps

- **5.1 [AI, M]** Prerequisite links. New `lesson_prerequisites
  (lesson_id, prerequisite_lesson_id)` table (migration via the Supabase
  MCP; regenerate types); catalog chip "Do *X* first →"; a soft warning
  (not a lock) on start; `recommendLessonsForSkills` orders by
  prerequisite depth. Backed by the graph the tutors author in 5.6.
- **5.2 [AI, M]** Practice at the end. On `lesson_complete`, a "Practice
  this now" CTA that launches a drill of the lesson's pattern (the
  `pattern_id` drill filter that `foundations-and-question-patterns.md`
  §3.4 step 3 introduces) or, for skill-scoped lessons, the skill drill.
  Command of Evidence's `question_link` usage is the manual precedent.
  Depends on 5.7.
- **5.3 [AI, M]** Delayed retrieval. On completion, enqueue in
  `review_queue` (new `item_type = 'lesson_check'` carrying the lesson's
  one-shot transfer/retrieval checks, or — simpler — the lesson's
  pattern/skill micro-drill) due in ~2 days; consumed by the existing
  Review hub "Due for review" card and plan `review` tasks. Extend
  `lib/review/schedule.ts` only if the new item type needs different
  intervals.
- **5.4 [AI, S]** Placement branching. Authoring convention + a drafted
  "Already know this? Try the transfer item" `branching_question` at
  block 2 of the foundational lessons (list from 5.8), routing strong
  students to the transfer and everyone else through the lesson.
- **5.5 [AI, S]** Efficacy view. Add first-try check accuracy and
  average attempts per block (from Phase 1 data) beside the existing
  `feature_efficacy` column on `/admin/lessons`, so a "hard item" can be
  told from a "broken item" (a transfer item at 95% first-try is too
  easy; below ~40% the teaching before it failed).

### Tutor-team tasks

- **5.6 [Tutors, S]** Author the prerequisite graph between lessons
  (batch it into the same working session as the optional
  `curriculum_units.prerequisite_unit_ids` in
  `foundations-and-question-patterns.md` §4).
- **5.7 [Tutors, ongoing]** Question → pattern classification
  (`foundations-and-question-patterns.md` §4 step 3). This is what makes
  5.2 automatic; it is already the tutor workstream, listed here only as
  a dependency.
- **5.8 [Tutors, S]** Decide which lessons get a test-out branch; review
  the efficacy view monthly (§4 step 6 of the foundations doc).

**Exit:** prerequisites visible in the catalog; every pattern lesson ends
in a drill; completion enqueues review; efficacy view shows first-try
accuracy per lesson.

---

## Phase 6 — Voice and personality (content; ongoing from Phase 2)

**Goal:** the lessons sound like Studyworks tutors, not a transcript.
Cheapest, highest-visibility levers first.

### AI-authored steps

- **6.1 [AI, S]** House voice guide (one page) merged into the
  authoring guide §2c and the generator prompts: open with the test-day
  payoff in one line; name the move and reuse the name; let the SAT be a
  character ("the test is betting you'll grab the grand total"); retire
  the universal "Correct. … **Next, you will…**" tail and the identical
  "Without looking back, which sequence…" closer; vary explanation
  register; end hard ("you vs. the SAT" item) rather than with a summary
  card. Include the two before/after rewrites from the review as the
  register examples.
- **6.2 [Joint, M]** Rewrite the 30 openers and the closers, retire the
  cadence, and propose names for the unnamed moves ("Zero-Graph-Click",
  "Total First", "Rank the Sides", "Bracket the Pivot", …) as a
  before/after table per lesson for tutor approval; apply on approval.
- **6.3 [AI, S]** Update the `create-sat-lesson` skill and
  `lessonGenPrompt.ts` so future lessons come out in the voice by
  default; add a linter warning for the retired tails.
- **6.4 [AI, S]** Completion-banner copy that rewards the right thing
  once Phase 1 data exists: first-try streaks, "you didn't fall for the
  trap" moments.

### Tutor-team tasks

- **6.5 [Tutors, S]** Choose the names — they must be words tutors
  actually say in session — and approve the voice guide; own the brand
  voice.
- **6.6 [Tutors, ongoing]** The intro videos (3.6) — the strongest
  personality lever in the suite.
- **6.7 [Tutors, optional]** One or two lines per lesson of real-world
  texture ("this is adapted from a real 2019 reef study"; "the trap
  we see most in session is …") for the AI to weave in.

**Exit:** voice guide merged into the authoring guide and generator; all
30 openers/closers rewritten and approved; move names in use in hints
and explanations.

---

## Sequencing summary

| Order | Who | What | Depends on |
|---|---|---|---|
| 1 | AI → Tutors → Admin | Phase 0 fixes, claims, re-import | — |
| 2 | AI (+ tutor policy) | Phase 1.1–1.5 attempts, summary, heat-map, escalation, one-shot | 1.7 decisions |
| 2 (parallel) | AI | Phase 2.1–2.2 linter + punch lists | — |
| 3 | Joint | Phase 2.3–2.8 rewrites, authentic items, sign-off | 2.6 trap catalog, 2.7 authenticity sheet |
| 3 (parallel) | Tutors | Pilot 1.9 | 1.1–1.3 |
| 4 | AI | Phase 3.1–3.5 figures, Desmos gating, time, screenshots, video convention | Phase 1 |
| 4 (parallel) | Tutors | 3.6 videos begin | AI briefs |
| 5 | Joint | Phase 4 rebuilds and splits | 2.1 linter, 4.5 decisions, 4.6 rundowns; 3.2 for gates |
| 6 | AI | Phase 5 prerequisites, practice, delayed retrieval, test-out, efficacy view | Phase 1; 5.6 graph; 5.7 classification |
| ongoing from 3 | Joint | Phase 6 voice | 6.5 names |
| ongoing | AI | Numeric-entry check (1.6) | may land in Phase 3 |

Phases 1 and 2 are the leverage: together they change what every one of
the 30 lessons does for a solo student without rewriting a single one.
Phase 4 is the only phase that rewrites lessons wholesale, and it waits
for the linter so the rebuilds are held to the new standard.

---

## How an AI-authored step runs

- One scoped session per step (or a small group of steps), prompted with
  this document's step id and the review's block references. Content
  steps go through the `create-sat-lesson` skill so the validator (and,
  after 2.1, the linter) runs on every save; runtime steps land as PRs
  with unit tests and, where UI changes, a Preview-as-student check.
- Migrations follow `CLAUDE.md` rule 3: timestamped file under
  `supabase/migrations/` **and** applied via the Supabase MCP
  `apply_migration`, then `lib/types/database.ts` regenerated. Only 5.1
  in this plan needs one; 1.1, 1.4, 1.6, 3.3 are deliberately designed
  not to.
- A step is done when its PR is merged **and** the tutor task it pairs
  with is complete; the ledger row records both. A lesson is published
  only after the tutor sign-off for the phase that last touched it.
- The AI never publishes, never applies to production, and never
  decides a scope split, a name, or a distractor's plausibility alone.

## Measuring whether it worked

- **Already available:** `feature_efficacy` (pre/post first-attempt
  practice accuracy per lesson skill) on `/admin/lessons` — refresh after
  each publish wave.
- **From Phase 1:** first-try accuracy and attempts per block. Targets:
  transfer items land in the 55–80% first-try band (above 90% the item is
  too easy; below 40% the teaching before it needs work); no block with a
  mean attempt count above 2.5 that isn't flagged as intentionally hard.
- **From Phase 2:** the linter's corpus report — keyed-longest rate,
  extreme-word imbalance, giveaway hints — trending to zero warnings on
  new lessons.
- **From Phase 5:** completion → practice → 48-hour review completion
  rates; the tutor heat-map in use in sessions.
- **Qualitative:** the pilot in 1.9 and a repeat of the review's rubric
  on any lesson that is rebuilt or split (Phase 4 exit).
