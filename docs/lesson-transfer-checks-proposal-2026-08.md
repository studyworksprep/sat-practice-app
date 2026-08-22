# Transfer-Check Designations — Proposal for Tutor Confirmation

> **Status: Living — pending tutor confirmation.** Drafted 2026-08-22 as
> the AI-proposes half of plan step **1.7** in
> `lesson-improvement-plan-2026-08.md`; the confirmed version of the
> table below is the input to step **1.5** (the scripted pass that sets
> `allow_retry: false` on the designated checks). Once 1.5 lands, this
> document records which checks are each lesson's measurement
> instrument — the same designations feed the 55–80% first-try band in
> the plan's success metrics and Phase 5.3's delayed retrieval.

## Decided policy (owner, 2026-08-22)

Two of the three 1.7 decisions are made:

1. **Reveal after 2 misses.** On a retry check, the second wrong attempt
   reveals the solution, marks the block `struggled`, and unlocks
   Continue (`max_attempts_before_reveal: 2`, the plan's default).
2. **Worked solution as the reveal text.** Step 1.4 adds an optional
   `solution` field (full worked solution, drafted per check, tutor
   spot-reviewed in 1.8); the runtime falls back to `explanation` where
   no `solution` exists yet.

The third decision is this document: **which checks are "transfer" in
each lesson.** Tutors confirm, trim, or swap rows below.

## The rule being proposed

Per lesson, flip to one-shot (`allow_retry: false`):

- **The final retrieval check** — always. It asks the student to
  reproduce the process from memory; with retry it measures nothing.
- **The designated transfer check(s)** — the items that apply the move
  to *fresh* content with no scaffold feeding them the answer. Most
  specs already label these (`independent_transfer*`, `transfer_*`,
  `mixed_transfer*`); lessons built around an end-of-lesson practice
  run get their most measurement-valuable practice items instead.

Everything else stays retry-mode (teach with hints, reveal after 2
misses per the policy above). One-shot checks keep today's behavior:
one submission, immediate reveal of answer + explanation, no Continue
gate.

**The 1.5 script keys on block *ids*, not block numbers.** Ids are
stable across spec edits; the numbers below are 1-indexed positions as
of current `main` and will drift as specs change.

## How to review this

For each row, ask one question: *would a tutor trust this item's
first-try rate as a signal that the student owns the move?* If a
proposed item is really rehearsal (or a skipped item really measures),
swap it. Rows marked ⚠ carry a judgment call spelled out in the notes.

## Proposed designations

Counts: **60 transfer checks + 31 retrieval checks** across 32 specs
(~91 of ~430 checks corpus-wide become one-shot). This is consistent
with 1.4's "~60 transfer/practice checks" estimate for solution drafts —
those drafts target the checks that *remain* retry-mode.

| Lesson | Transfer check(s) → one-shot | Retrieval → one-shot | Notes |
|---|---|---|---|
| Advanced Factoring | [34] `mixed_transfer_non_monic_one`, [35] `mixed_transfer_non_monic_two`, [36] `mixed_transfer_cubes` | [38] `retrieval_check` | Clean labeled set. |
| Boundaries: Punctuation Order | [39]–[43] `practice_full_stop`, `practice_colon`, `practice_dash`, `practice_comma`, `practice_serial_semicolon` | [44] `final_retrieval` | ⚠ Whole 5-item mixed drill proposed (one per mark; all fresh sentences). If five one-shots in a row feels harsh, trim to `practice_full_stop` + `practice_comma` — the two core category decisions. |
| Boundaries: Transition Placement | [33] `transfer_before_full_stop`, [34] `transfer_after_full_stop` | [35] `final_retrieval` | Clean labeled set. |
| Command of Evidence (CLEAR) | [26] `aggregation_check`, [28] `hard_bridge_check` | [37] `final_retrieval` | ⚠ No labeled transfers; these two are the fresh-scenario applications of the full CLEAR run. [28] reads data from the prior slide — still fresh reasoning. The two `question_link` DSAT items ([32], [35]) are real transfer but aren't checks; out of scope for the retry flag. |
| Custom Regression | [32] `transfer_setup_check`, [35] `transfer_equation_check` | [37] `final_retrieval_check` | ⚠ Transfer is a 3-check chain; [34] `transfer_constants_check` (mid-chain readout) stays retry so a reveal there doesn't hand over the final answer. |
| Desmos List Tools | [32] `practice_transformed_total`, [34] `practice_two_groups_mean` | [36] `final_retrieval_check` | ⚠ Provisional — Phase 4.1 rebuilds this lesson; these are the two most SAT-shaped items in the current practice run. |
| Factor Out the GCF | [32] `independent_transfer_one`, [34] `independent_transfer_two` | [36] `final_retrieval` | [35] `completeness_check` is conceptual — stays retry. |
| Factoring Polynomials | [34] `transfer_one`, [35] `transfer_two`, [36] `transfer_three` | [38] `retrieval_check` | Clean labeled set. |
| Find the Equation | [38] `independent_transfer` | [39] `final_retrieval` | |
| Functions & Function Notation | [32] `transfer_result_check`, [33] `requested_expression_check` | [36] `final_retrieval_check` | [33] is the answer-what's-asked trap (`2c+1`, not `c`) — high measurement value. [31] is a gated Desmos block; `allow_retry` doesn't apply to it. |
| Good Cop / Bad Cop | [37] `final_question_check`, [38] `final_wrong_choice_check` | — | ⚠ No retrieval check exists yet; Phase 4.4 adds it (designate it then). The closing pair is a full GCBC run on a fresh passage. |
| Inference | [23] `independent_transfer_check` | [24] `final_retrieval_check` | |
| My Numbers | [37] `independent_transfer_check` | [38] `final_retrieval` | |
| Percentages & Percent Change | [40] `practice_complex_result` | [41] `final_retrieval_check` | ⚠ Only the full multi-step problem proposed; [36]/[38] (basic + change results, each behind a gated Desmos entry) stay retry as mechanics practice. |
| Probability from Tables | [31] `transfer_given_probability_check`, [32] `transfer_no_given_check` | [33] `final_retrieval` | [30] `transfer_total_check` deliberately scaffolds [31] ("Total first") — stays retry. |
| Rates & Units | [22] `independent_transfer_check` | [23] `final_retrieval_check` | |
| Reading Comprehension | [33] `independent_transfer_one_check`, [35] `independent_transfer_two_check` | [36] `final_retrieval` | Provisional — Phase 4.2 trims this lesson; both items survive the planned cut list. |
| Rhetorical Synthesis | [21] `independent_transfer_check` | [22] `final_retrieval_check` | |
| Right-Triangle Trig | [39] `independent_transfer_check` | [40] `final_retrieval_check` | [36]/[37] (combined similar-triangle setup/result) are guided-hard — stay retry. |
| Scale Factor | [40] `practice_volume_to_area`, [41] `practice_area_to_volume` | [43] `final_retrieval_check` | ⚠ The 7-item practice run covers every conversion direction; these two are the hardest (two-step pivots through the linear ratio). Swap if you'd rather measure a different direction. |
| Similar Triangles | [20] `ordinary_transfer_check`, [35] `right_altitude_transfer_check` | [36] `final_retrieval_check` | ⚠ [35]'s stem says "Solve the proportion from the previous block" — it measures completing the altitude chain, not starting it. Drop it if that's too scaffolded. Provisional: lesson is an unpublished draft and Phase 4.2 may split the altitude section. |
| Solving Equations by Graphing | [32] `transfer_exact_check`, [39] `practice_three_answer` | [40] `final_retrieval_check` | [39] is the no-real-solution case — good discrimination. |
| Solving Equations w/ Regression | [39] `practice_system_setup`, [40] `practice_method_choice` | [41] `final_retrieval_check` | Setup + method choice are the skill; [36]–[38] are mechanics and stay retry. |
| Systems by Graphing | [26] `transfer_answer_check` | [27] `final_retrieval_check` | Follows the gated Desmos block [25], which validates the graph, not the answer. |
| Special Right Triangles | [32] `independent_square_transfer`, [33] `independent_equilateral_variable_transfer` | [34] `final_retrieval_check` | |
| Special Systems | [35] `transfer_check` | [36] `final_retrieval_check` | |
| Standard Deviation | [33] `transfer_order_sets` | [34] `final_retrieval_check` | Practice items [30]–[32] stay retry. |
| Standard Regression | [33] `transfer_points_check`, [34] `transfer_model_check` | [36] `final_retrieval_check` | ⚠ Two-check chain (table rows → equation); both proposed since the reveal on [33] doesn't give away [34]'s equation. |
| Subject–Verb Agreement | [36] `independent_transfer_check`, [37] `final_eligibility_check` | [38] `retrieval_check` | [37] measures knowing when *not* to use the trick — arguably the most important item in the lesson. |
| Surveys, Sampling & MOE | [29] `transfer_scope_check`, [30] `transfer_statement_check`, [31] `transfer_range_check` | [32] `final_retrieval` | Three independent fresh scenarios (scope / statement / range), not a chain. Provisional — Phase 4.2 splits this lesson; the designations map cleanly onto both halves. |
| Transitions: Bracket the Pivot | [23] `independent_transfer_local_scale` | [24] `final_retrieval` | [22] `guided_transfer_result` is labeled guided — stays retry. |
| Words in Context | [34] `transfer_one_check`, [35] `transfer_two_check`, [36] `transfer_three_check` | [37] `final_retrieval` | Clean labeled set. |

## What happens after confirmation

1. **1.5 [AI]:** scripted pass flips `allow_retry: false` on the
   confirmed ids; validator run on all 32 specs; authoring-guide rule
   added ("transfer and retrieval checks are one-shot"); PR for review.
2. **1.4 [AI]:** escalation lands with the decided policy (reveal after
   2 misses, `solution` field with `explanation` fallback), and
   `solution` texts are drafted for the checks that remain retry-mode —
   tutors spot-review per 1.8.
3. **[Owner/admin]:** re-import the touched specs after tutor sign-off.
4. First-try data from the designated checks starts feeding the 55–80%
   band (plan § Measuring whether it worked) and, in Phase 5.3, the
   delayed-retrieval queue.
