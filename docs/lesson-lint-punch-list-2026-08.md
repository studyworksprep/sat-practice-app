# Lesson Lint Punch List — 2026-08

> **Status: Living — the Phase 2 work queue.** Generated 2026-08-23 by
> the item-quality linter (plan step 2.2; regenerate tables with
> `node scripts/check-lesson-specs.mjs`, or per lesson with
> `.agents/skills/create-sat-lesson/scripts/lint-lesson-spec.mjs`).
> The **Status** column is hand-maintained: `open` → `fixed` (spec
> edited) or `deferred: <reason>` (a human judged the flag a
> legitimate exception — e.g. an intentional end-of-lesson practice
> run tripping `check_run`). Phase 2 exits when every row is fixed or
> deferred with a reason, the corpus keyed-longest rate is below
> ~30%, and no lesson is above 50%.

Rules (all heuristic warnings, never build failures):
`keyed_longest` (key ≥ 1.4× mean distractor length), `key_term_echo`
(only the key names the lesson's term), `extreme_imbalance`
(all/every/only/must/never/always/proved cluster in distractors),
`hint_gives_answer`, `meta_prompt` ("Why is … correct/wrong"),
`equivalent_choices`, `missing_figure` (figure reference, no `<img>`
on the slide), `retrieval_nonsense_distractor`, `check_run` /
`text_run` (3+ consecutive).

## Summary

**265 findings** across 32 specs and 540 checks at the 2026-08-23 baseline. Corpus keyed-longest rate at baseline: **35.4%** (191/540); exit target is < 30% corpus-wide with no lesson above 50%.

**As of 2026-08-26 (after 2.3 tranche 2):** 144 rows open, 139 fixed, 3 deferred with reasons. Closed so far: the 2.5 retrieval-check rebuilds; the Probability `equivalent_choices` defects; tranche 1 (mechanical classes + the Inference rebuild); and tranche 2 — full distractor rebuilds of the six lessons that were above the 50% per-lesson bar: CLEAR the Claim 86%→36%, Process and Pre-Answer RC 81%→13%, Rhetorical Synthesis 78%→33%, Good Cop / Bad Cop 74%→11%, Surveys 63%→13%, Desmos Sliders 57%→14%. `retrieval_nonsense_distractor` and `equivalent_choices` are at zero; `hint_gives_answer` and `meta_prompt` are down to one reasoned deferral each. The corpus is 36 specs / 600 checks. Corpus keyed-longest rate: **22.0%** (132/600) with the highest lesson at 47% — **both lint exit criteria (<30% corpus, no lesson >50%) are now met**. The remaining open rows are the long tail of scattered `keyed_longest` / `extreme_imbalance` / `key_term_echo` items plus the structural `check_run` / `text_run` / `missing_figure` classes (Phase 3 territory).

### Advanced Factoring: Non-Monic Trinomials and Cubes

`advanced-factoring-non-monic-trinomials-and-cubes.json` — 6 findings; keyed-longest 4/19 (21%)

| Step | Block | Rule | Finding | Status |
|---|---|---|---|---|
| 8 | `cross_products_check` | `keyed_longest` | Keyed choice is 1.7x the mean length of the distractors. | open |
| 25 | `difference_of_cubes_check` | `hint_gives_answer` | Hint states "= 3", the keyed numeric answer. | fixed (2026-08-26) |
| 38 | `retrieval_check` | `keyed_longest` | Keyed choice is 1.4x the mean length of the distractors. | fixed (2026-08-26) |
| 38 | `retrieval_check` | `extreme_imbalance` | 2 distractors carry extreme words (all/every/only/must/never/always/proved); the key carries none. | fixed (2026-08-26) |
| 38 | `retrieval_check` | `retrieval_nonsense_distractor` | Retrieval distractors A, C share no content words with the keyed process — eliminable on sight. | fixed (2026-08-26) |
| 34 | `mixed_transfer_non_monic_one` | `check_run` | 3 consecutive checks (steps 34–36). | open |

### Bracket the Pivot: Choose Precise SAT Transitions

`transitions-bracket-the-pivot.json` — 4 findings; keyed-longest 3/11 (27%)

| Step | Block | Rule | Finding | Status |
|---|---|---|---|---|
| 24 | `final_retrieval` | `key_term_echo` | Keyed choice is the only one containing the lesson term "bracket". | fixed (2026-08-26) |
| 24 | `final_retrieval` | `retrieval_nonsense_distractor` | Retrieval distractors B, C share no content words with the keyed process — eliminable on sight. | fixed (2026-08-26) |
| 22 | `guided_transfer_result` | `check_run` | 3 consecutive checks (steps 22–24). | open |
| 4 | `opening_debrief` | `text_run` | 3 consecutive text blocks (steps 4–6). | open |

### Circle Toolkit: Measure, Arcs, and Equations

`circle-toolkit-measure-arcs-and-equations.json` — 0 findings; keyed-longest 1/20 (5%). Entered the corpus 2026-08-26 via the reverse-drift export from production (in-app draft); lint-clean.

### CLEAR the Claim: Command of Evidence

`command-of-evidence-clear-the-claim.json` — 17 findings; keyed-longest 12/14 (86%)

| Step | Block | Rule | Finding | Status |
|---|---|---|---|---|
| 3 | `opening_check` | `keyed_longest` | Keyed choice is 1.5x the mean length of the distractors. | fixed (2026-08-26) |
| 6 | `capture_task_check` | `keyed_longest` | Keyed choice is 1.5x the mean length of the distractors. | fixed (2026-08-26) |
| 8 | `expect_evidence_check` | `keyed_longest` | Keyed choice is 1.7x the mean length of the distractors. | fixed (2026-08-26) |
| 14 | `true_but_irrelevant_check` | `keyed_longest` | Keyed choice is 1.4x the mean length of the distractors. | fixed (2026-08-26) |
| 18 | `specific_bar_check` | `keyed_longest` | Keyed choice is 1.6x the mean length of the distractors. | fixed (2026-08-26) |
| 19 | `graph_prediction_check` | `keyed_longest` | Keyed choice is 1.7x the mean length of the distractors. | fixed (2026-08-26) |
| 20 | `graph_claim_check` | `keyed_longest` | Keyed choice is 1.7x the mean length of the distractors. | fixed (2026-08-26) |
| 24 | `gap_pattern_check` | `keyed_longest` | Keyed choice is 1.5x the mean length of the distractors. | fixed (2026-08-26) |
| 26 | `aggregation_check` | `keyed_longest` | Keyed choice is 1.5x the mean length of the distractors. | fixed (2026-08-26) |
| 28 | `hard_bridge_check` | `keyed_longest` | Keyed choice is 1.8x the mean length of the distractors. | fixed (2026-08-26) |
| 28 | `hard_bridge_check` | `extreme_imbalance` | 2 distractors carry extreme words (all/every/only/must/never/always/proved); the key carries none. | fixed (2026-08-26) |
| 37 | `final_retrieval` | `key_term_echo` | Keyed choice is the only one containing the lesson term "evidence". | fixed (2026-08-26) |
| 28 | `hard_bridge_check` | `missing_figure` | Prose references a diagram/figure/previous slide, but this slide has no <img> of its own. | fixed (2026-08-26) |
| 37 | `final_retrieval` | `retrieval_nonsense_distractor` | Retrieval distractors B, C share no content words with the keyed process — eliminable on sight. | fixed (2026-08-26) |
| 18 | `specific_bar_check` | `check_run` | 3 consecutive checks (steps 18–20). | open |
| 15 | `data_passage_first` | `text_run` | 3 consecutive text blocks (steps 15–17). | open |
| 29 | `reject_traps` | `text_run` | 3 consecutive text blocks (steps 29–31). | open |

### Factor Out the Greatest Common Factor

`factor-out-greatest-common-factor.json` — 5 findings; keyed-longest 3/18 (17%)

| Step | Block | Rule | Finding | Status |
|---|---|---|---|---|
| 36 | `final_retrieval` | `keyed_longest` | Keyed choice is 1.7x the mean length of the distractors. | fixed (2026-08-26) |
| 36 | `final_retrieval` | `key_term_echo` | Keyed choice is the only one containing the lesson term "greatest". | fixed (2026-08-26) |
| 3 | `group_observation_check` | `missing_figure` | Prose references a diagram/figure/previous slide, but this slide has no <img> of its own. | open |
| 36 | `final_retrieval` | `retrieval_nonsense_distractor` | Retrieval distractor D shares no content words with the keyed process — eliminable on sight. | fixed (2026-08-26) |
| 34 | `independent_transfer_two` | `check_run` | 3 consecutive checks (steps 34–36). | open |

### Factor Polynomials: Trinomials and Difference of Squares

`factoring-polynomials-gcf-trinomials-difference-of-squares.json` — 6 findings; keyed-longest 1/19 (5%)

| Step | Block | Rule | Finding | Status |
|---|---|---|---|---|
| 13 | `middle_constant_relationship_check` | `keyed_longest` | Keyed choice is 1.6x the mean length of the distractors. | open |
| 38 | `method_selection_check` | `key_term_echo` | Keyed choice is the only one containing the lesson term "difference". | open |
| 44 | `retrieval_check` | `retrieval_nonsense_distractor` | Retrieval distractors A, B, D share no content words with the keyed process — eliminable on sight. | fixed (2026-08-26) |
| 40 | `transfer_one` | `check_run` | 3 consecutive checks (steps 40–42). | open |
| 4 | `gcf_identification_diagnostic_correct` | `text_run` | 3 consecutive text blocks (steps 4–6). | open |
| 8 | `gcf_division_diagnostic_correct` | `text_run` | 5 consecutive text blocks (steps 8–12). | open |

### Find a Standard Regression Equation from Data

`standard-regression-from-data.json` — 10 findings; keyed-longest 5/17 (29%)

| Step | Block | Rule | Finding | Status |
|---|---|---|---|---|
| 3 | `first_result_check` | `hint_gives_answer` | Hint states "= 2", the keyed numeric answer. | fixed (2026-08-26) |
| 6 | `recognition_check` | `keyed_longest` | Keyed choice is 2.8x the mean length of the distractors. | open |
| 15 | `button_sequence_check` | `keyed_longest` | Keyed choice is 1.5x the mean length of the distractors. | open |
| 15 | `button_sequence_check` | `key_term_echo` | Keyed choice is the only one containing the lesson term "regression". | open |
| 29 | `third_point_reason_check` | `keyed_longest` | Keyed choice is 2.0x the mean length of the distractors. | open |
| 29 | `third_point_reason_check` | `key_term_echo` | Keyed choice is the only one containing the lesson term "standard". | open |
| 29 | `third_point_reason_check` | `extreme_imbalance` | 2 distractors carry extreme words (all/every/only/must/never/always/proved); the key carries none. | open |
| 36 | `final_retrieval_check` | `keyed_longest` | Keyed choice is 2.3x the mean length of the distractors. | fixed (2026-08-26) |
| 36 | `final_retrieval_check` | `key_term_echo` | Keyed choice is the only one containing the lesson term "standard". | fixed (2026-08-26) |
| 36 | `final_retrieval_check` | `retrieval_nonsense_distractor` | Retrieval distractor C shares no content words with the keyed process — eliminable on sight. | fixed (2026-08-26) |

### Find Missing Constants in Equivalent Expressions with Regression

`find-missing-constants-in-equivalent-expressions-with-regression.json` — 11 findings; keyed-longest 5/18 (28%). Entered the corpus 2026-08-26 via the reverse-drift export from production (published lesson).

| Step | Block | Rule | Finding | Status |
|---|---|---|---|---|
| 4 | `check_2` | `keyed_longest` | Keyed choice is 1.6x the mean length of the distractors. | open |
| 4 | `check_2` | `key_term_echo` | Keyed choice is the only one containing the lesson term "equivalent". | open |
| 6 | `check_3` | `keyed_longest` | Keyed choice is 1.6x the mean length of the distractors. | open |
| 8 | `check_4` | `keyed_longest` | Keyed choice is 1.8x the mean length of the distractors. | open |
| 8 | `check_4` | `key_term_echo` | Keyed choice is the only one containing the lesson term "equivalent expressions". | open |
| 20 | `check_9` | `keyed_longest` | Keyed choice is 1.6x the mean length of the distractors. | open |
| 27 | `check_13` | `keyed_longest` | Keyed choice is 1.8x the mean length of the distractors. | open |
| 27 | `check_13` | `key_term_echo` | Keyed choice is the only one containing the lesson term "expression". | open |
| 27 | `check_13` | `extreme_imbalance` | 2 distractors carry extreme words (all/every/only/must/never/always/proved); the key carries none. | open |
| 26 | `check_12` | `check_run` | 7 consecutive checks (steps 26–32). | open |
| 9 | `process_setup` | `text_run` | 3 consecutive text blocks (steps 9–11). | open |

### Find Missing Constants with Custom Regression

`custom-regression-from-data.json` — 10 findings; keyed-longest 4/17 (24%)

| Step | Block | Rule | Finding | Status |
|---|---|---|---|---|
| 7 | `custom_recognition_check` | `keyed_longest` | Keyed choice is 1.5x the mean length of the distractors. | open |
| 7 | `custom_recognition_check` | `key_term_echo` | Keyed choice is the only one containing the lesson term "missing". | open |
| 18 | `definition_reasoning_check` | `keyed_longest` | Keyed choice is 2.4x the mean length of the distractors. | open |
| 18 | `definition_reasoning_check` | `key_term_echo` | Keyed choice is the only one containing the lesson term "constants". | open |
| 30 | `troubleshooting_check` | `keyed_longest` | Keyed choice is 2.9x the mean length of the distractors. | open |
| 32 | `transfer_setup_check` | `hint_gives_answer` | Hint states "= 18", the keyed numeric answer. | fixed (2026-08-26) |
| 35 | `transfer_equation_check` | `hint_gives_answer` | Hint states "= 4", the keyed numeric answer. | fixed (2026-08-26) |
| 37 | `final_retrieval_check` | `keyed_longest` | Keyed choice is 1.8x the mean length of the distractors. | fixed (2026-08-26) |
| 37 | `final_retrieval_check` | `retrieval_nonsense_distractor` | Retrieval distractors A, C share no content words with the keyed process — eliminable on sight. | fixed (2026-08-26) |
| 1 | `lesson_prerequisite` | `text_run` | 4 consecutive text blocks (steps 1–4). | open |

### Find Probability from Tables: Favorable over Total

`probability-from-tables-favorable-over-total.json` — 8 findings; keyed-longest 3/16 (19%)

| Step | Block | Rule | Finding | Status |
|---|---|---|---|---|
| 16 | `denominator_trap_check` | `hint_gives_answer` | Hint states "= 30", the keyed numeric answer. | fixed (2026-08-26) |
| 20 | `model_check` | `meta_prompt` | Prompt asks why an answer is correct/wrong — the key is given away as the premise. | fixed (2026-08-26) |
| 22 | `reverse_direction_check` | `equivalent_choices` | Choices B and C are equivalent. | fixed (2026-08-26) |
| 31 | `transfer_given_probability_check` | `equivalent_choices` | Choices A and C are equivalent. | fixed (2026-08-26) |
| 32 | `transfer_no_given_check` | `equivalent_choices` | Choices A and B are equivalent. | fixed (2026-08-26) |
| 33 | `final_retrieval` | `key_term_echo` | Keyed choice is the only one containing the lesson term "favorable over". | fixed (2026-08-26) |
| 30 | `transfer_total_check` | `check_run` | 4 consecutive checks (steps 30–33). | open |
| 27 | `single_event_scope` | `text_run` | 3 consecutive text blocks (steps 27–29). | open |

### Find the Equation with My Numbers

`find-the-equation-with-my-numbers.json` — 5 findings; keyed-longest 5/17 (29%)

| Step | Block | Rule | Finding | Status |
|---|---|---|---|---|
| 16 | `same_values_check` | `extreme_imbalance` | 2 distractors carry extreme words (all/every/only/must/never/always/proved); the key carries none. | open |
| 30 | `collision_action_check` | `keyed_longest` | Keyed choice is 1.4x the mean length of the distractors. | open |
| 39 | `final_retrieval` | `keyed_longest` | Keyed choice is 1.5x the mean length of the distractors. | fixed (2026-08-26) |
| 39 | `final_retrieval` | `retrieval_nonsense_distractor` | Retrieval distractors A, B, C share no content words with the keyed process — eliminable on sight. | fixed (2026-08-26) |
| 11 | `dependent_values` | `text_run` | 3 consecutive text blocks (steps 11–13). | open |

### Functions and Function Notation on the SAT

`functions-and-function-notation.json` — 8 findings; keyed-longest 5/17 (29%)

| Step | Block | Rule | Finding | Status |
|---|---|---|---|---|
| 7 | `notation_definition_check` | `keyed_longest` | Keyed choice is 1.5x the mean length of the distractors. | open |
| 7 | `notation_definition_check` | `key_term_echo` | Keyed choice is the only one containing the lesson term "function". | open |
| 18 | `solve_function_equation_check` | `extreme_imbalance` | 2 distractors carry extreme words (all/every/only/must/never/always/proved); the key carries none. | open |
| 20 | `notation_decision_check` | `keyed_longest` | Keyed choice is 1.4x the mean length of the distractors. | open |
| 35 | `common_mistakes_check` | `keyed_longest` | Keyed choice is 2.0x the mean length of the distractors. | open |
| 36 | `final_retrieval_check` | `keyed_longest` | Keyed choice is 2.4x the mean length of the distractors. | fixed (2026-08-26) |
| 36 | `final_retrieval_check` | `extreme_imbalance` | 2 distractors carry extreme words (all/every/only/must/never/always/proved); the key carries none. | open |
| 15 | `point_graph_equivalence` | `text_run` | 3 consecutive text blocks (steps 15–17). | open |

### Good Cop / Bad Cop: Prove Every Reading Answer

`good-cop-bad-cop-reading-answers.json` — 20 findings; keyed-longest 15/19 (79%)

| Step | Block | Rule | Finding | Status |
|---|---|---|---|---|
| 2 | `answer_target_check` | `key_term_echo` | Keyed choice is the only one containing the lesson term "reading". | fixed (2026-08-26) |
| 4 | `opening_question_check` | `extreme_imbalance` | 2 distractors carry extreme words (all/every/only/must/never/always/proved); the key carries none. | fixed (2026-08-26) |
| 6 | `roles_check` | `extreme_imbalance` | 2 distractors carry extreme words (all/every/only/must/never/always/proved); the key carries none. | fixed (2026-08-26) |
| 12 | `city_maps_check` | `keyed_longest` | Keyed choice is 2.1x the mean length of the distractors. | fixed (2026-08-26) |
| 16 | `function_question_check` | `keyed_longest` | Keyed choice is 1.5x the mean length of the distractors. | fixed (2026-08-26) |
| 19 | `island_lizards_check` | `extreme_imbalance` | 3 distractors carry extreme words (all/every/only/must/never/always/proved); the key carries none. | fixed (2026-08-26) |
| 20 | `island_lizards_wrong_choice_check` | `keyed_longest` | Keyed choice is 3.0x the mean length of the distractors. | fixed (2026-08-26) |
| 23 | `roof_coating_check` | `extreme_imbalance` | 2 distractors carry extreme words (all/every/only/must/never/always/proved); the key carries none. | fixed (2026-08-26) |
| 24 | `roof_coating_runner_up_check` | `keyed_longest` | Keyed choice is 1.8x the mean length of the distractors. | fixed (2026-08-26) |
| 24 | `roof_coating_runner_up_check` | `meta_prompt` | Prompt asks why an answer is correct/wrong — the key is given away as the premise. | deferred: wrong-choice debriefs are this lesson's taught technique; the premise is established by the preceding check (2026-08-26) |
| 26 | `no_choice_fits_check` | `keyed_longest` | Keyed choice is 1.7x the mean length of the distractors. | fixed (2026-08-26) |
| 28 | `bee_navigation_check` | `extreme_imbalance` | 2 distractors carry extreme words (all/every/only/must/never/always/proved); the key carries none. | fixed (2026-08-26) |
| 29 | `bee_navigation_wrong_choice_check` | `keyed_longest` | Keyed choice is 3.3x the mean length of the distractors. | fixed (2026-08-26) |
| 32 | `devon_poem_wrong_choice_check` | `keyed_longest` | Keyed choice is 2.7x the mean length of the distractors. | fixed (2026-08-26) |
| 34 | `transportation_check` | `extreme_imbalance` | 2 distractors carry extreme words (all/every/only/must/never/always/proved); the key carries none. | fixed (2026-08-26) |
| 37 | `final_question_check` | `keyed_longest` | Keyed choice is 1.5x the mean length of the distractors. | fixed (2026-08-26) |
| 37 | `final_question_check` | `extreme_imbalance` | 2 distractors carry extreme words (all/every/only/must/never/always/proved); the key carries none. | fixed (2026-08-26) |
| 38 | `final_wrong_choice_check` | `keyed_longest` | Keyed choice is 2.3x the mean length of the distractors. | fixed (2026-08-26) |
| 38 | `final_wrong_choice_check` | `retrieval_nonsense_distractor` | Retrieval distractors B, C, D share no content words with the keyed process — eliminable on sight. | fixed (2026-08-26) |
| 9 | `city_maps_example` | `text_run` | 3 consecutive text blocks (steps 9–11). | open |

### Inference Questions: Make the Smallest Supported Leap

`inference-minimum-supported-conclusion.json` — 19 findings; keyed-longest 10/11 (91%)

| Step | Block | Rule | Finding | Status |
|---|---|---|---|---|
| 3 | `opening_exploration_check` | `keyed_longest` | Keyed choice is 1.7x the mean length of the distractors. | fixed (2026-08-26) |
| 3 | `opening_exploration_check` | `extreme_imbalance` | 2 distractors carry extreme words (all/every/only/must/never/always/proved); the key carries none. | fixed (2026-08-26) |
| 5 | `definition_check` | `keyed_longest` | Keyed choice is 1.5x the mean length of the distractors. | fixed (2026-08-26) |
| 5 | `definition_check` | `key_term_echo` | Keyed choice is the only one containing the lesson term "supported". | fixed (2026-08-26) |
| 8 | `soundbite_check` | `keyed_longest` | Keyed choice is 1.5x the mean length of the distractors. | fixed (2026-08-26) |
| 10 | `combine_facts_check` | `keyed_longest` | Keyed choice is 1.5x the mean length of the distractors. | fixed (2026-08-26) |
| 12 | `strength_check` | `keyed_longest` | Keyed choice is 1.6x the mean length of the distractors. | fixed (2026-08-26) |
| 12 | `strength_check` | `extreme_imbalance` | 3 distractors carry extreme words (all/every/only/must/never/always/proved); the key carries none. | fixed (2026-08-26) |
| 14 | `worked_example_check` | `keyed_longest` | Keyed choice is 1.8x the mean length of the distractors. | fixed (2026-08-26) |
| 14 | `worked_example_check` | `extreme_imbalance` | 2 distractors carry extreme words (all/every/only/must/never/always/proved); the key carries none. | fixed (2026-08-26) |
| 16 | `one_sentence_trap_check` | `keyed_longest` | Keyed choice is 1.8x the mean length of the distractors. | fixed (2026-08-26) |
| 16 | `one_sentence_trap_check` | `extreme_imbalance` | 2 distractors carry extreme words (all/every/only/must/never/always/proved); the key carries none. | fixed (2026-08-26) |
| 18 | `association_check` | `extreme_imbalance` | 3 distractors carry extreme words (all/every/only/must/never/always/proved); the key carries none. | fixed (2026-08-26) |
| 20 | `data_variation_check` | `keyed_longest` | Keyed choice is 1.4x the mean length of the distractors. | fixed (2026-08-26) |
| 20 | `data_variation_check` | `extreme_imbalance` | 2 distractors carry extreme words (all/every/only/must/never/always/proved); the key carries none. | fixed (2026-08-26) |
| 23 | `independent_transfer_check` | `keyed_longest` | Keyed choice is 1.5x the mean length of the distractors. | fixed (2026-08-26) |
| 23 | `independent_transfer_check` | `extreme_imbalance` | 2 distractors carry extreme words (all/every/only/must/never/always/proved); the key carries none. | fixed (2026-08-26) |
| 24 | `final_retrieval_check` | `keyed_longest` | Keyed choice is 1.8x the mean length of the distractors. | fixed (2026-08-26) |
| 24 | `final_retrieval_check` | `key_term_echo` | Keyed choice is the only one containing the lesson term "smallest supported". | deferred: the phrase is the substance of the keyed process; distractors deliberately corrupt exactly it (2026-08-26) |

### Initial Modifiers: Match the Noun After the Comma

`initial-modifiers-match-the-noun-after-the-comma.json` — 0 findings; keyed-longest 4/15 (27%). Entered the corpus 2026-08-26 via the reverse-drift export from production (in-app draft); lint-clean.

### Place Transition Words by Logic

`boundaries-transition-word-placement-and-logic.json` — 9 findings; keyed-longest 8/17 (47%)

| Step | Block | Rule | Finding | Status |
|---|---|---|---|---|
| 3 | `exploration_check` | `keyed_longest` | Keyed choice is 1.8x the mean length of the distractors. | open |
| 7 | `nonessential_check` | `keyed_longest` | Keyed choice is 2.1x the mean length of the distractors. | open |
| 11 | `backward_check` | `keyed_longest` | Keyed choice is 1.4x the mean length of the distractors. | open |
| 11 | `backward_check` | `extreme_imbalance` | 2 distractors carry extreme words (all/every/only/must/never/always/proved); the key carries none. | open |
| 31 | `though_elimination_check` | `keyed_longest` | Keyed choice is 2.1x the mean length of the distractors. | open |
| 31 | `though_elimination_check` | `extreme_imbalance` | 2 distractors carry extreme words (all/every/only/must/never/always/proved); the key carries none. | open |
| 35 | `final_retrieval` | `keyed_longest` | Keyed choice is 2.0x the mean length of the distractors. | fixed (2026-08-26) |
| 35 | `final_retrieval` | `extreme_imbalance` | 2 distractors carry extreme words (all/every/only/must/never/always/proved); the key carries none. | fixed (2026-08-26) |
| 33 | `transfer_before_full_stop` | `check_run` | 3 consecutive checks (steps 33–35). | open |

### Process and Pre-Answer Reading Comprehension Questions

`reading-comprehension-process-and-pre-answer.json` — 8 findings; keyed-longest 14/16 (88%)

| Step | Block | Rule | Finding | Status |
|---|---|---|---|---|
| 7 | `introduction_check` | `keyed_longest` | Keyed choice is 1.4x the mean length of the distractors. | fixed (2026-08-26) |
| 17 | `inference_check` | `keyed_longest` | Keyed choice is 1.7x the mean length of the distractors. | fixed (2026-08-26) |
| 17 | `inference_check` | `extreme_imbalance` | 2 distractors carry extreme words (all/every/only/must/never/always/proved); the key carries none. | fixed (2026-08-26) |
| 29 | `detail_variation_check` | `extreme_imbalance` | 2 distractors carry extreme words (all/every/only/must/never/always/proved); the key carries none. | fixed (2026-08-26) |
| 31 | `keyword_trap_check` | `extreme_imbalance` | 2 distractors carry extreme words (all/every/only/must/never/always/proved); the key carries none. | fixed (2026-08-26) |
| 33 | `independent_transfer_one_check` | `extreme_imbalance` | 2 distractors carry extreme words (all/every/only/must/never/always/proved); the key carries none. | fixed (2026-08-26) |
| 36 | `final_retrieval` | `extreme_imbalance` | 2 distractors carry extreme words (all/every/only/must/never/always/proved); the key carries none. | fixed (2026-08-26) |
| 36 | `final_retrieval` | `retrieval_nonsense_distractor` | Retrieval distractor D shares no content words with the keyed process — eliminable on sight. | fixed (2026-08-26) |

### Rates in Two-Variable Equations: Read the Units

`rates-and-units-in-two-variable-equations.json` — 7 findings; keyed-longest 6/13 (46%)

| Step | Block | Rule | Finding | Status |
|---|---|---|---|---|
| 5 | `unit_chain_check` | `keyed_longest` | Keyed choice is 1.6x the mean length of the distractors. | open |
| 12 | `whole_equation_check` | `keyed_longest` | Keyed choice is 2.3x the mean length of the distractors. | open |
| 14 | `coefficient_interpretation_check` | `keyed_longest` | Keyed choice is 1.5x the mean length of the distractors. | open |
| 23 | `final_retrieval_check` | `keyed_longest` | Keyed choice is 1.6x the mean length of the distractors. | fixed (2026-08-26) |
| 23 | `final_retrieval_check` | `extreme_imbalance` | 2 distractors carry extreme words (all/every/only/must/never/always/proved); the key carries none. | open |
| 23 | `final_retrieval_check` | `retrieval_nonsense_distractor` | Retrieval distractor C shares no content words with the keyed process — eliminable on sight. | fixed (2026-08-26) |
| 14 | `coefficient_interpretation_check` | `check_run` | 3 consecutive checks (steps 14–16). | open |

### Reason Through SAT Survey Questions

`surveys-sampling-and-margin-of-error.json` — 8 findings; keyed-longest 11/16 (69%)

| Step | Block | Rule | Finding | Status |
|---|---|---|---|---|
| 5 | `terms_check` | `extreme_imbalance` | 3 distractors carry extreme words (all/every/only/must/never/always/proved); the key carries none. | fixed (2026-08-26) |
| 8 | `bias_check` | `key_term_echo` | Keyed choice is the only one containing the lesson term "survey". | fixed (2026-08-26) |
| 10 | `nonresponse_check` | `keyed_longest` | Keyed choice is 1.5x the mean length of the distractors. | fixed (2026-08-26) |
| 10 | `nonresponse_check` | `extreme_imbalance` | 2 distractors carry extreme words (all/every/only/must/never/always/proved); the key carries none. | fixed (2026-08-26) |
| 14 | `supported_statement_check` | `extreme_imbalance` | 2 distractors carry extreme words (all/every/only/must/never/always/proved); the key carries none. | fixed (2026-08-26) |
| 21 | `range_certainty_check` | `keyed_longest` | Keyed choice is 1.9x the mean length of the distractors. | fixed (2026-08-26) |
| 27 | `model_check` | `extreme_imbalance` | 2 distractors carry extreme words (all/every/only/must/never/always/proved); the key carries none. | fixed (2026-08-26) |
| 29 | `transfer_scope_check` | `check_run` | 4 consecutive checks (steps 29–32). | open |

### Recognize and Use Similar Triangles

`similar-triangles.json` — 13 findings; keyed-longest 5/19 (26%)

| Step | Block | Rule | Finding | Status |
|---|---|---|---|---|
| 5 | `definition_meaning_check` | `keyed_longest` | Keyed choice is 1.9x the mean length of the distractors. | open |
| 7 | `aa_recognition_check` | `keyed_longest` | Keyed choice is 1.5x the mean length of the distractors. | open |
| 22 | `right_altitude_observation_check` | `keyed_longest` | Keyed choice is 1.5x the mean length of the distractors. | open |
| 22 | `right_altitude_observation_check` | `extreme_imbalance` | 2 distractors carry extreme words (all/every/only/must/never/always/proved); the key carries none. | open |
| 24 | `right_altitude_aa_check` | `extreme_imbalance` | 2 distractors carry extreme words (all/every/only/must/never/always/proved); the key carries none. | open |
| 36 | `final_retrieval_check` | `keyed_longest` | Keyed choice is 1.7x the mean length of the distractors. | fixed (2026-08-26) |
| 36 | `final_retrieval_check` | `extreme_imbalance` | 2 distractors carry extreme words (all/every/only/must/never/always/proved); the key carries none. | fixed (2026-08-26) |
| 3 | `angle_observation_check` | `missing_figure` | Prose references a diagram/figure/previous slide, but this slide has no <img> of its own. | open |
| 4 | `similar_definition` | `missing_figure` | Prose references a diagram/figure/previous slide, but this slide has no <img> of its own. | open |
| 10 | `correspondence_process` | `missing_figure` | Prose references a diagram/figure/previous slide, but this slide has no <img> of its own. | open |
| 12 | `side_size_shortcut` | `missing_figure` | Prose references a diagram/figure/previous slide, but this slide has no <img> of its own. | open |
| 13 | `side_rank_check` | `missing_figure` | Prose references a diagram/figure/previous slide, but this slide has no <img> of its own. | open |
| 34 | `leg_setup_check` | `check_run` | 3 consecutive checks (steps 34–36). | open |

### Rhetorical Synthesis: Let the Goal Lead

`rhetorical-synthesis-goal-first.json` — 7 findings; keyed-longest 8/9 (89%)

| Step | Block | Rule | Finding | Status |
|---|---|---|---|---|
| 3 | `first_exploration_check` | `keyed_longest` | Keyed choice is 1.6x the mean length of the distractors. | fixed (2026-08-26) |
| 9 | `action_word_check` | `keyed_longest` | Keyed choice is 1.8x the mean length of the distractors. | fixed (2026-08-26) |
| 14 | `worked_example_check` | `keyed_longest` | Keyed choice is 1.5x the mean length of the distractors. | fixed (2026-08-26) |
| 16 | `comparison_check` | `keyed_longest` | Keyed choice is 1.9x the mean length of the distractors. | fixed (2026-08-26) |
| 19 | `fact_check_example_check` | `keyed_longest` | Keyed choice is 1.8x the mean length of the distractors. | fixed (2026-08-26) |
| 19 | `fact_check_example_check` | `extreme_imbalance` | 2 distractors carry extreme words (all/every/only/must/never/always/proved); the key carries none. | fixed (2026-08-26) |
| 22 | `final_retrieval_check` | `keyed_longest` | Keyed choice is 1.9x the mean length of the distractors. | fixed (2026-08-26) |

### Right Triangle Trigonometry with SOHCAHTOA

`right-triangle-trigonometry-sohcahtoa.json` — 11 findings; keyed-longest 4/20 (20%)

| Step | Block | Rule | Finding | Status |
|---|---|---|---|---|
| 18 | `sine_result_check` | `hint_gives_answer` | Hint states "= 9", the keyed numeric answer. | fixed (2026-08-26) |
| 22 | `process_decision_check` | `keyed_longest` | Keyed choice is 2.1x the mean length of the distractors. | open |
| 22 | `process_decision_check` | `extreme_imbalance` | 2 distractors carry extreme words (all/every/only/must/never/always/proved); the key carries none. | open |
| 29 | `mode_interpretation_check` | `keyed_longest` | Keyed choice is 1.8x the mean length of the distractors. | open |
| 32 | `similar_trig_value_check` | `extreme_imbalance` | 2 distractors carry extreme words (all/every/only/must/never/always/proved); the key carries none. | open |
| 33 | `similar_length_contrast_check` | `keyed_longest` | Keyed choice is 3.7x the mean length of the distractors. | open |
| 36 | `combined_setup_check` | `hint_gives_answer` | Hint states "= 10", the keyed numeric answer. | fixed (2026-08-26) |
| 39 | `independent_transfer_check` | `hint_gives_answer` | Hint states "= 20", the keyed numeric answer. | fixed (2026-08-26) |
| 40 | `final_retrieval_check` | `keyed_longest` | Keyed choice is 2.1x the mean length of the distractors. | fixed (2026-08-26) |
| 40 | `final_retrieval_check` | `extreme_imbalance` | 2 distractors carry extreme words (all/every/only/must/never/always/proved); the key carries none. | open |
| 21 | `common_mistakes` | `missing_figure` | Prose references a diagram/figure/previous slide, but this slide has no <img> of its own. | open |

### Solve Equations by Graphing: Find the x-Intercepts

`solving-equations-by-graphing-x-intercepts.json` — 5 findings; keyed-longest 5/16 (31%)

| Step | Block | Rule | Finding | Status |
|---|---|---|---|---|
| 7 | `x_intercept_check` | `keyed_longest` | Keyed choice is 1.5x the mean length of the distractors. | open |
| 27 | `viewport_check` | `keyed_longest` | Keyed choice is 1.9x the mean length of the distractors. | open |
| 40 | `final_retrieval_check` | `keyed_longest` | Keyed choice is 1.9x the mean length of the distractors. | fixed (2026-08-26) |
| 40 | `final_retrieval_check` | `key_term_echo` | Keyed choice is the only one containing the lesson term "x-intercept". | fixed (2026-08-26) |
| 21 | `solution_count_transition` | `text_run` | 4 consecutive text blocks (steps 21–24). | open |

### Solve Equations with Regression in Desmos

`solving-equations-with-regression.json` — 8 findings; keyed-longest 5/19 (26%)

| Step | Block | Rule | Finding | Status |
|---|---|---|---|---|
| 10 | `rmse_check` | `keyed_longest` | Keyed choice is 1.5x the mean length of the distractors. | open |
| 14 | `multiple_solution_limit_check` | `keyed_longest` | Keyed choice is 1.4x the mean length of the distractors. | open |
| 31 | `method_choice_check` | `extreme_imbalance` | 2 distractors carry extreme words (all/every/only/must/never/always/proved); the key carries none. | open |
| 34 | `transfer_result_check` | `keyed_longest` | Keyed choice is 1.6x the mean length of the distractors. | open |
| 40 | `practice_method_choice` | `key_term_echo` | Keyed choice is the only one containing the lesson term "equation". | open |
| 41 | `final_retrieval_check` | `keyed_longest` | Keyed choice is 1.8x the mean length of the distractors. | fixed (2026-08-26) |
| 36 | `practice_single_equation` | `check_run` | 6 consecutive checks (steps 36–41). | open |
| 6 | `four_step_process` | `text_run` | 4 consecutive text blocks (steps 6–9). | open |

### Solve Percent and Percent Change Problems with Desmos

`percentages-and-percent-change.json` — 4 findings; keyed-longest 3/16 (19%)

| Step | Block | Rule | Finding | Status |
|---|---|---|---|---|
| 12 | `rmse_check` | `keyed_longest` | Keyed choice is 1.6x the mean length of the distractors. | open |
| 41 | `final_retrieval_check` | `keyed_longest` | Keyed choice is 1.9x the mean length of the distractors. | fixed (2026-08-26) |
| 41 | `final_retrieval_check` | `extreme_imbalance` | 3 distractors carry extreme words (all/every/only/must/never/always/proved); the key carries none. | open |
| 27 | `mathematical_sentence_principle` | `text_run` | 5 consecutive text blocks (steps 27–31). | open |

### Solve SAT Boundaries Questions in the Fastest Order

`boundaries-punctuation-order.json` — 8 findings; keyed-longest 7/21 (33%)

| Step | Block | Rule | Finding | Status |
|---|---|---|---|---|
| 11 | `serial_semicolon_check` | `extreme_imbalance` | 2 distractors carry extreme words (all/every/only/must/never/always/proved); the key carries none. | open |
| 14 | `fanboys_check` | `hint_gives_answer` | Hint contains the keyed choice text. | fixed (2026-08-26) |
| 17 | `duplicate_choice_check` | `extreme_imbalance` | 2 distractors carry extreme words (all/every/only/must/never/always/proved); the key carries none. | open |
| 28 | `single_dash_check` | `keyed_longest` | Keyed choice is 1.4x the mean length of the distractors. | open |
| 44 | `final_retrieval` | `keyed_longest` | Keyed choice is 1.4x the mean length of the distractors. | fixed (2026-08-26) |
| 44 | `final_retrieval` | `extreme_imbalance` | 2 distractors carry extreme words (all/every/only/must/never/always/proved); the key carries none. | open |
| 39 | `practice_full_stop` | `check_run` | 6 consecutive checks (steps 39–44). | open |
| 23 | `colon_model` | `text_run` | 3 consecutive text blocks (steps 23–25). | open |

### Solve Subject–Verb Agreement with the Odd-One-Out Trick

`subject-verb-agreement-odd-one-out.json` — 7 findings; keyed-longest 4/18 (22%)

| Step | Block | Rule | Finding | Status |
|---|---|---|---|---|
| 9 | `multiword_check` | `keyed_longest` | Keyed choice is 1.8x the mean length of the distractors. | open |
| 21 | `both_check` | `extreme_imbalance` | 2 distractors carry extreme words (all/every/only/must/never/always/proved); the key carries none. | open |
| 27 | `full_gate_check` | `keyed_longest` | Keyed choice is 1.7x the mean length of the distractors. | open |
| 33 | `tense_trap_check` | `extreme_imbalance` | 2 distractors carry extreme words (all/every/only/must/never/always/proved); the key carries none. | open |
| 38 | `retrieval_check` | `keyed_longest` | Keyed choice is 1.8x the mean length of the distractors. | fixed (2026-08-26) |
| 36 | `independent_transfer_check` | `check_run` | 3 consecutive checks (steps 36–38). | open |
| 4 | `name_the_pattern` | `text_run` | 3 consecutive text blocks (steps 4–6). | open |

### Solve Systems of Equations by Graphing in Desmos

`solving-systems-of-equations-by-graphing.json` — 5 findings; keyed-longest 1/13 (8%)

| Step | Block | Rule | Finding | Status |
|---|---|---|---|---|
| 7 | `intersection_meaning_check` | `extreme_imbalance` | 3 distractors carry extreme words (all/every/only/must/never/always/proved); the key carries none. | open |
| 11 | `first_system_solution_check` | `extreme_imbalance` | 2 distractors carry extreme words (all/every/only/must/never/always/proved); the key carries none. | open |
| 23 | `nonlinear_points_check` | `extreme_imbalance` | 2 distractors carry extreme words (all/every/only/must/never/always/proved); the key carries none. | open |
| 26 | `transfer_answer_check` | `extreme_imbalance` | 2 distractors carry extreme words (all/every/only/must/never/always/proved); the key carries none. | open |
| 27 | `final_retrieval_check` | `keyed_longest` | Keyed choice is 1.8x the mean length of the distractors. | fixed (2026-08-26) |

### Solve Words in Context with Read, Predict, Match

`words-in-context-read-predict-match.json` — 6 findings; keyed-longest 4/19 (21%)

| Step | Block | Rule | Finding | Status |
|---|---|---|---|---|
| 5 | `process_order_check` | `key_term_echo` | Keyed choice is the only one containing the lesson term "predict". | open |
| 26 | `unfamiliar_choice_check` | `keyed_longest` | Keyed choice is 1.8x the mean length of the distractors. | open |
| 37 | `final_retrieval` | `key_term_echo` | Keyed choice is the only one containing the lesson term "predict". | fixed (2026-08-26) |
| 37 | `final_retrieval` | `extreme_imbalance` | 3 distractors carry extreme words (all/every/only/must/never/always/proved); the key carries none. | fixed (2026-08-26) |
| 37 | `final_retrieval` | `retrieval_nonsense_distractor` | Retrieval distractors B, D share no content words with the keyed process — eliminable on sight. | fixed (2026-08-26) |
| 34 | `transfer_one_check` | `check_run` | 4 consecutive checks (steps 34–37). | open |

### Special Right Triangles: Recognize, Scale, Solve

`special-right-triangles-45-45-90-and-30-60-90.json` — 4 findings; keyed-longest 4/20 (20%)

| Step | Block | Rule | Finding | Status |
|---|---|---|---|---|
| 34 | `final_retrieval_check` | `extreme_imbalance` | 2 distractors carry extreme words (all/every/only/must/never/always/proved); the key carries none. | fixed (2026-08-26) |
| 34 | `final_retrieval_check` | `retrieval_nonsense_distractor` | Retrieval distractor B shares no content words with the keyed process — eliminable on sight. | fixed (2026-08-26) |
| 21 | `thirty_sixty_variable_hypotenuse_check` | `check_run` | 3 consecutive checks (steps 21–23). | open |
| 29 | `equilateral_perimeter_check` | `check_run` | 6 consecutive checks (steps 29–34). | open |

### Special Systems: No Solution and Infinitely Many Solutions

`special-systems-no-solution-and-infinitely-many.json` — 9 findings; keyed-longest 8/15 (53%)

| Step | Block | Rule | Finding | Status |
|---|---|---|---|---|
| 3 | `no_solution_observation_check` | `keyed_longest` | Keyed choice is 1.5x the mean length of the distractors. | open |
| 7 | `infinite_solution_observation_check` | `keyed_longest` | Keyed choice is 1.5x the mean length of the distractors. | open |
| 17 | `slider_method_choice_check` | `keyed_longest` | Keyed choice is 1.6x the mean length of the distractors. | open |
| 31 | `proportion_no_solution_check` | `keyed_longest` | Keyed choice is 1.6x the mean length of the distractors. | open |
| 31 | `proportion_no_solution_check` | `key_term_echo` | Keyed choice is the only one containing the lesson term "no solution". | open |
| 36 | `final_retrieval_check` | `keyed_longest` | Keyed choice is 1.9x the mean length of the distractors. | fixed (2026-08-26) |
| 36 | `final_retrieval_check` | `extreme_imbalance` | 2 distractors carry extreme words (all/every/only/must/never/always/proved); the key carries none. | fixed (2026-08-26) |
| 14 | `slider_no_solution_explanation` | `missing_figure` | Prose references a diagram/figure/previous slide, but this slide has no <img> of its own. | open |
| 18 | `multiple_constants_transition` | `text_run` | 3 consecutive text blocks (steps 18–20). | open |

### Testing Equivalent Expressions with Desmos Sliders

`testing-equivalent-expressions-with-desmos-sliders.json` — 10 findings; keyed-longest 4/7 (57%). Entered the corpus 2026-08-26 via the reverse-drift export from production (published lesson). Note: worst keyed-longest rate in the corpus after Inference — a 2.3 rewrite candidate.

| Step | Block | Rule | Finding | Status |
|---|---|---|---|---|
| 8 | `check_3` | `keyed_longest` | Keyed choice is 2.2x the mean length of the distractors. | fixed (2026-08-26) |
| 8 | `check_3` | `key_term_echo` | Keyed choice is the only one containing the lesson term "expressions". | fixed (2026-08-26) |
| 10 | `check_4` | `hint_gives_answer` | Hint states "= 2", the keyed numeric answer. | deferred: false positive — "p=2" is the slider test value already stated in the prompt, not the keyed answer (2026-08-26) |
| 12 | `check_5` | `keyed_longest` | Keyed choice is 1.7x the mean length of the distractors. | fixed (2026-08-26) |
| 12 | `check_5` | `key_term_echo` | Keyed choice is the only one containing the lesson term "sliders". | fixed (2026-08-26) |
| 17 | `check_7` | `keyed_longest` | Keyed choice is 2.2x the mean length of the distractors. | fixed (2026-08-26) |
| 17 | `check_7` | `extreme_imbalance` | 2 distractors carry extreme words (all/every/only/must/never/always/proved); the key carries none. | fixed (2026-08-26) |
| 17 | `check_7` | `retrieval_nonsense_distractor` | Retrieval distractor D shares no content words with the keyed process — eliminable on sight. | fixed (2026-08-26) |
| 14 | `branching_question_13_correct` | `text_run` | 3 consecutive text blocks (steps 14–16). | open |
| 18 | `branching_question_14_correct` | `text_run` | 3 consecutive text blocks (steps 18–20). | open |

### Understand and Use Standard Deviation

`standard-deviation.json` — 8 findings; keyed-longest 9/19 (47%)

| Step | Block | Rule | Finding | Status |
|---|---|---|---|---|
| 3 | `spread_observation_check` | `extreme_imbalance` | 2 distractors carry extreme words (all/every/only/must/never/always/proved); the key carries none. | open |
| 5 | `meaning_check` | `extreme_imbalance` | 2 distractors carry extreme words (all/every/only/must/never/always/proved); the key carries none. | open |
| 15 | `replacing_value_check` | `keyed_longest` | Keyed choice is 1.6x the mean length of the distractors. | open |
| 27 | `outlier_result_check` | `keyed_longest` | Keyed choice is 1.7x the mean length of the distractors. | open |
| 29 | `prediction_process_check` | `keyed_longest` | Keyed choice is 1.9x the mean length of the distractors. | open |
| 34 | `final_retrieval_check` | `keyed_longest` | Keyed choice is 1.5x the mean length of the distractors. | fixed (2026-08-26) |
| 3 | `spread_observation_check` | `missing_figure` | Prose references a diagram/figure/previous slide, but this slide has no <img> of its own. | open |
| 29 | `prediction_process_check` | `check_run` | 6 consecutive checks (steps 29–34). | open |

### Use Desmos Lists and List Tools

`desmos-list-tools.json` — 6 findings; keyed-longest 8/21 (38%)

| Step | Block | Rule | Finding | Status |
|---|---|---|---|---|
| 27 | `menu_speed_check` | `keyed_longest` | Keyed choice is 1.5x the mean length of the distractors. | open |
| 27 | `menu_speed_check` | `extreme_imbalance` | 3 distractors carry extreme words (all/every/only/must/never/always/proved); the key carries none. | open |
| 31 | `process_check` | `keyed_longest` | Keyed choice is 1.4x the mean length of the distractors. | open |
| 36 | `final_retrieval_check` | `keyed_longest` | Keyed choice is 2.0x the mean length of the distractors. | fixed (2026-08-26) |
| 23 | `mean_check` | `check_run` | 3 consecutive checks (steps 23–25). | open |
| 31 | `process_check` | `check_run` | 6 consecutive checks (steps 31–36). | open |

### Use My Numbers to Make Abstract SAT Problems Concrete

`my-numbers-strategy.json` — 7 findings; keyed-longest 5/14 (36%)

| Step | Block | Rule | Finding | Status |
|---|---|---|---|---|
| 5 | `collision_response_check` | `keyed_longest` | Keyed choice is 1.7x the mean length of the distractors. | open |
| 11 | `recognition_check` | `keyed_longest` | Keyed choice is 2.5x the mean length of the distractors. | open |
| 31 | `collision_check` | `keyed_longest` | Keyed choice is 1.8x the mean length of the distractors. | open |
| 38 | `final_retrieval` | `keyed_longest` | Keyed choice is 1.6x the mean length of the distractors. | fixed (2026-08-26) |
| 38 | `final_retrieval` | `retrieval_nonsense_distractor` | Retrieval distractor C shares no content words with the keyed process — eliminable on sight. | fixed (2026-08-26) |
| 8 | `name_strategy` | `text_run` | 3 consecutive text blocks (steps 8–10). | open |
| 12 | `variables_equations_cue` | `text_run` | 5 consecutive text blocks (steps 12–16). | open |

### Use Scale Factors with Similar Shapes

`scale-factor-and-similar-shapes.json` — 7 findings; keyed-longest 2/24 (8%)

| Step | Block | Rule | Finding | Status |
|---|---|---|---|---|
| 5 | `area_meaning_check` | `extreme_imbalance` | 2 distractors carry extreme words (all/every/only/must/never/always/proved); the key carries none. | open |
| 7 | `ratio_direction_check` | `equivalent_choices` | Choices A and C are equivalent. | fixed (2026-08-26) |
| 30 | `arbitrary_ratio_check` | `equivalent_choices` | Choices A and B are equivalent. | fixed (2026-08-26) |
| 43 | `final_retrieval_check` | `keyed_longest` | Keyed choice is 1.7x the mean length of the distractors. | fixed (2026-08-26) |
| 3 | `area_observation_check` | `missing_figure` | Prose references a diagram/figure/previous slide, but this slide has no <img> of its own. | open |
| 43 | `final_retrieval_check` | `retrieval_nonsense_distractor` | Retrieval distractors A, D share no content words with the keyed process — eliminable on sight. | fixed (2026-08-26) |
| 36 | `practice_linear_to_area` | `check_run` | 8 consecutive checks (steps 36–43). | open |
