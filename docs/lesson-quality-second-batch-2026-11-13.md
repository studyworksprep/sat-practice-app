# Second optional lesson-quality batch — implemented

> **Status: Historical.** Completed November 13, 2026.

This batch implements the remaining high-priority items from the earlier ranking: Functions (independent application), Find the Equation (earlier modeling), Circle Geometric Relationships (replace non-coordinate grids), and Linear Inequalities (illustrate shading). The first optional batch and all later recommendations remain unchanged.

| Lesson | Implemented change | Cards before → after |
| --- | --- | --- |
| [Functions](https://studyworks.io/tutor/lessons/19488dc3-65b0-40f6-b3f8-e8f4300b34fb/preview) | Added a fresh one-shot function-condition question. Students must find the unknown constant and then evaluate the requested expression; neither the setup nor constant is supplied. Existing independent checks remain. | 31 → 32 |
| [Find the Equation](https://studyworks.io/tutor/lessons/b99bae72-d30c-4138-ad8c-4e7d957c2e71/preview) | Added a separate combined-rate idea card, a simple numerical Build, Record, Test model, and a changed retry check before returning to the original hose problem. The opening and existing final practice remain. | 33 → 36 |
| [Circle Geometric Relationships](https://studyworks.io/tutor/lessons/f86de617-9c6a-46b9-8c41-9c5e59f3447b/preview) | Replaced seven coordinate-grid presentations with six standalone figures: highlighted arc, central/inscribed angles, equal radii, tangent right triangle, paired tangents, and tangent quadrilateral area. | 28 → 28 |
| [Linear Inequalities](https://studyworks.io/tutor/lessons/aa64f806-99af-4a33-998d-330adda42f69/preview) | Illustrated the existing graph model with its dashed boundary, shaded solution region, and test point. The following changed check still requires interpreting its inequality without a supplied shaded answer. | 25 → 25 |

The added questions are newly authored lesson content, not questions represented as existing content-bank records. No strategy criticism withdrawn by the evidence recheck was reinstated.

## Validation and review

- All four saved-bank specifications compile and pass the lesson validator with zero errors and warnings. Compiled content exactly matches the intended saved blocks.
- Seventeen grading cases exercise accepted numeric equivalents and plausible wrong answers. The function condition reduces to `(d−4)(d²+6d+25)=0`, so its only real constant is 4 and the requested value is 11. Live Desmos returned d=4, RMSE=0, and 2d+3=11.
- The rate model gives `(1/2)/(1/4+1/12)=3/2` hours. Its changed check gives `(1/2)/(1/6+1/12)=2` hours. Feedback distinguishes the remaining fraction from the whole tank and rates from filling times.
- Tangent/right-angle coordinates and equal radii were checked in the diagram generator. The inequality uses equal coordinate scales, a strict dashed boundary, and the half-plane containing the true test point (0,0).
- Every slide was visited at laptop and mobile widths: 121 slides at each width, 242 captures. All images loaded; no page-width overflow was detected. Selected new and changed cards were reviewed visually, including the function prompt with the calculator hidden. Tutor preview shows answer feedback by design and records no student answers. Grading and retry content were checked separately through the production grading functions and preview.
- Pacing lint warnings were reviewed. Pre-existing explanation runs remain. Functions now ends with three one-shot practice checks; that short independent set is intentional.
- The complete 46-lesson comparison confirms exact intended content and 42 untouched lessons. All 1,506 original block IDs remain, including the first batch's additions. Four new blocks bring the bank to 1,510. All 49 student-progress rows, topics, techniques, assignments, curriculum placement, and publication/visibility settings are unchanged.

## Sources and preserved work

Work was authored against verified current main commit `52c625499a61bb70e20b79d0a38f5e3fe5a23e4e` in a separate clean checkout. Three model specifications were selected randomly and read:

- `docs/lesson-template-specs/boundaries-transition-word-placement-and-logic.json`
- `docs/lesson-template-specs/find-the-equation-with-my-numbers.json`
- `docs/lesson-template-specs/good-cop-bad-cop-reading-answers.json`

The four updated saved-bank specifications and their exact previous live versions are preserved on [the batch source branch](https://github.com/studyworksprep/sat-practice-app/tree/codex/lesson-quality-second-batch-20261113-bf5d). Previous versions are under `docs/lesson-template-specs/archive/quality-second-batch-2026-11-13/`.

Diagrams are original SVG files in `public/images/lesson-quality-second-batch/`, served from immutable asset commit [8208a60e](https://github.com/studyworksprep/sat-practice-app/commit/8208a60ea3cc84953ca8e5dd0abf54035c7d57f4). These lesson-content changes require no application deployment.

The existing local inequalities specification contains a separate, substantially different rewrite. It was preserved byte for byte. This batch's saved-bank inequality specification is available in the source branch and in `content/lesson-repairs/2026-11-13-quality-second-batch/after-specs/solving-linear-inequalities-boundary-and-test.json`. The other three local canonical specifications were updated; unrelated working files were left alone.

Local recovery and review materials are in `content/lesson-repairs/2026-11-13-quality-second-batch/`: before/after bank snapshots, guarded SQL, previous specifications, diagram sources, grading results, preview records, and the publication record.

## Still deferred

- Further independent assessment in Custom Regression, Systems by Graphing, Trigonometry's missing-length variation, and Name the Job's overall-structure variation.
- Circle formula-card separation/reference reminders, percent-change template formatting, and Advanced Factoring's changed cube check.
- Lower-priority eligibility/fallback examples, transition clause maps, survey-wording practice, and curriculum-role clarification.

These remain optional recommendations. No other lesson, local-only draft, question-bank item, curriculum relationship, or student record was revised in this batch.
