# First optional lesson-quality batch — implemented

November 13, 2026

The five requested lessons are updated in the live lesson bank. Other optional recommendations remain unapplied. These are targeted instructional improvements, not evidence that the previous strategies were invalid.

| Lesson | Implemented change | Cards before → after |
| --- | --- | --- |
| [My Numbers](https://studyworks.io/tutor/lessons/7459378d-1581-4e4b-afaa-a96a130c6ebb/preview) | Added a fresh powered-quotient question with two constrained variables. Students choose legal values and compare all choices; the calculator starts empty. Retained the tickets warm-up. | 32 → 33 |
| [Sliders](https://studyworks.io/tutor/lessons/32188826-a78c-448d-86c9-808113b23e58/preview) | Added an empty-calculator comparison requiring both uppercase sliders, the original, and four choices, followed by a one-shot decision. Includes targeted retry help. Retained M-00066 as a warm-up. | 19 → 21 |
| [Desmos Lists](https://studyworks.io/tutor/lessons/0ae583f2-825c-498a-9d91-31ec0de156f0/preview) | Added an earlier reverse-transformation rule, simple worked model, and changed-example entry activity. Added an independent correction/join/median question with no supplied setup. | 32 → 36 |
| [Special Right Triangles](https://studyworks.io/tutor/lessons/b62b7ce7-e3cf-499f-9cbf-5edbac932eee/preview) | Attached labeled figures to 28 cards covering side roles, square diagonals, equilateral altitudes, and perpendicular radii. | 35 → 35 |
| [Trigonometry](https://studyworks.io/tutor/lessons/cd9e2655-3adc-4b36-9d75-a31bbd0aaaba/preview) | Attached labeled figures to 14 cards covering named vertices, reference angles, side measurements, and corresponding triangles. | 34 → 34 |

The practice questions added here are newly authored lesson items. They are not represented as questions from the existing content bank. Geometry questions and answer keys were retained; check diagrams show givens and unknowns without printing keyed numerical results. The unsorted-side recognition question deliberately remains verbal because positioning its lengths on a diagram would supply the classification it asks students to perform.

## Verification

- All five canonical specifications compile and pass the lesson validator with zero errors or warnings. Their compiled content exactly matches the intended saved blocks.
- Nineteen grading cases cover correct entries, missing expressions, lowercase variable misuse, unchanged default sliders, wrong inverse operations, extra rows, numeric equivalents, and plausible wrong medians. Both plain division and Desmos fraction formatting are accepted for the guided list calculation.
- The expression identities and numerical choices were checked independently. Live Desmos comparisons returned the expected values; list entry returned 6, 10, 14.
- Every slide was visited at laptop and narrow widths (159 slides at each width). The long new expressions were split across lines after mobile review. Geometry images loaded successfully, including three images rechecked after initial loading. Preview shows all answer feedback by design; it does not record student answers. Submission success/failure and retry behavior were exercised through the same grading functions used by the lesson viewer.
- Pacing lint warnings were reviewed. Existing explanation runs remain. Lists ends with five independent checks rather than four; that intentional practice set is retained.
- The complete 46-lesson comparison confirms that the other 41 records are unchanged. All 1,499 original block IDs remain; seven new blocks bring the bank to 1,506. Student-progress fingerprints (49 rows), topics, techniques, assignments, and curriculum placement are unchanged.

The slider entry gate verifies the requested expressions and slider state. It requires a value change from the default; the later question assesses the selected match. It does not record a student's complete history of slider movements or prove that every suggested retest occurred.

## Source and recovery

The five canonical specifications are in `docs/lesson-template-specs/`. Exact previous live specifications are preserved in [the batch archive](lesson-template-specs/archive/quality-first-batch-2026-11-13/). The original diagram sources are in `public/images/lesson-quality-first-batch/`.

Diagram URLs point to the immutable asset commit [4601e571](https://github.com/studyworksprep/sat-practice-app/commit/4601e571c6664080b36e5df9d5912e0d229dcf20). Source changes are preserved on [the batch branch](https://github.com/studyworksprep/sat-practice-app/tree/codex/lesson-quality-first-batch-20261113-bf5d); no application deployment is needed for these saved-content changes.

Local review and recovery materials are in `content/lesson-repairs/2026-11-13-quality-first-batch/`: before/after bank snapshots, guarded SQL, source specifications, diagram manifest, grading report, and live previews. No student-progress rows were altered. Previously confirmed audit fixes remain intact.
