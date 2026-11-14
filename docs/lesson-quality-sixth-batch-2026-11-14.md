# Sixth optional lesson-quality batch — visual support implemented

> **Status: Historical.** Completed November 14, 2026.

Six visuals were attached to existing explanatory cards in the four requested lessons. No cards, questions, or calculator activities were added, replaced, or reordered. Other optional recommendations remain unapplied.

| Lesson | Existing card | Added support |
| --- | --- | --- |
| [Constants in Equivalent Expressions with Regression](https://studyworks.io/tutor/lessons/4c22e546-2a07-4ffc-8f99-a2f3e3b21f59/preview) | 9, `process_setup` | Illustrated readout distinguishes fitted a=3 and b=9 from RMSE=0 for the polynomial example already introduced. |
| [Solving Equations with Regression](https://studyworks.io/tutor/lessons/128a9229-75b6-4aa8-b47d-792e478f4d2d/preview) | 6, `read_the_fit_error` | Illustrated readout distinguishes the solution n=5 from the mismatch measure RMSE=0 for the preceding 3n+4=19 example. |
| [Rates in Two-Variable Equations](https://studyworks.io/tutor/lessons/098be371-5059-4dbb-a744-744a88c23586/preview) | 5, `rate_definition`; 9, `rate_not_always_coefficient` | Unit-cancellation displays show dollars/notebook × notebooks = dollars and acres × trees/acre = trees. Coefficients and variables remain: the products are 5n dollars and 6a trees. |
| [Special Systems](https://studyworks.io/tutor/lessons/95a74105-c958-461d-954e-477437c5de5f/preview) | 22, `proportion_scale_model`; 23, `proportion_no_solution_model` | Coordinate graphs connect the existing coefficient-multiplier examples to coincident lines and distinct parallel lines. |

All six figures are original SVG illustrations. The regression images illustrate the actual labels and values verified in live Desmos; they are not screenshots. Existing text, models, questions, answers, hints, feedback, calculator state, and progression rules are unchanged.

## Verification

- All four specifications compile and pass the current lesson validator with zero errors and warnings. Compiled content exactly matches the saved lesson blocks. Existing pacing lint warnings are unchanged; the explanatory runs and independent-practice sets were retained.
- The live identity model displayed a=3, b=9, and RMSE=0 for x₁=[2,3,4]. The live equation model displayed n=5 and RMSE=0. The illustrated readouts use those verified values and distinguish parameter values from fit error. No requested combination is revealed on a new assessment card.
- The cancellation illustrations strike through unit labels only. They retain 5 and n in 5n dollars, and 6 and a in 6a trees. The second example preserves the lesson's distinction that the variable can be the rate.
- For the coincident graph, `4x+6y=10` and `10x+15y=25` both give `y=−(2/3)x+5/3`. For the parallel graph, the second equation is `10x+15y=30`, giving the same slope with intercept 2 rather than 5/3. The plotted coordinates were checked at five x-values, and both axes use equal unit scales. Solid/dashed paths and equation labels supplement color.
- Every slide was visited at desktop and mobile widths: 122 slides at each width, **244 captures**. All images loaded and no page-width overflow was detected. The six new figures were visually inspected at both widths. Mobile calculator panels were closed where necessary to inspect the reading view and reach the next slide. Live tutor preview displays answers and feedback and records no student responses. The temporary viewport override was reset.
- The complete bank comparison confirms **42 untouched lesson records**. All **1,522 block IDs, positions, and lesson lengths** are preserved. Only six original content objects changed, each by adding its figure field. All **730 existing check and Desmos-interactive content objects** are unchanged. The bank still contains **1,522 blocks**.
- Student progress (49 rows), topics, techniques, assignments, curriculum placement, titles, descriptions, publication status, and visibility are unchanged. Fingerprints were checked after the live previews. No question-bank records or student responses were edited.

## Source and recovery

Updated importable specifications are in `content/lesson-repairs/2026-11-14-quality-sixth-batch/after-specs/`:

- `find-missing-constants-in-equivalent-expressions-with-regression.json`
- `solving-equations-with-regression.json`
- `rates-and-units-in-two-variable-equations.json`
- `special-systems-no-solution-and-infinitely-many.json`

Exact previous live specifications are archived under `docs/lesson-template-specs/archive/quality-sixth-batch-2026-11-14/`. The illustrations are in `public/images/lesson-quality-sixth-batch/`, served from immutable asset commit [f38084e6](https://github.com/studyworksprep/sat-practice-app/commit/f38084e6eceb848a39c69a2406a161fe75e6d64e).

The [batch source branch](https://github.com/studyworksprep/sat-practice-app/tree/codex/lesson-quality-sixth-batch-20261114-bf5d) preserves the four canonical specifications, their archives, the six SVGs, and this record. These saved-content changes require no application deployment. Full bank snapshots, progress fingerprints, and preview screenshots remain local and are excluded from the public source branch.

The original checkout contains separate local drafts of all four lessons. Those files were preserved byte-for-byte; the updated live versions are in the review bundle and source branch. The earlier confirmed one-shot retrieval repair in Constants in Equivalent Expressions was retained in its live baseline and updated source.

Work used a separate checkout matching verified current remote main, `5431c64e3809d7486d0637c246f373b1f5b11de7`. Fetching was limited by unavailable DNS; the GitHub connector confirmed main, and that exact commit was already available locally. The current authoring and revision guidelines were used, and each baseline specification was compiled and compared with the fresh live bank before editing. The original working tree was left in place.

Three model specifications were selected randomly and read at current main:

- `docs/lesson-template-specs/rates-and-units-in-two-variable-equations.json`
- `docs/lesson-template-specs/find-missing-constants-in-equivalent-expressions-with-regression.json`
- `docs/lesson-template-specs/right-triangle-trigonometry-sohcahtoa.json`

The local recovery bundle is `content/lesson-repairs/2026-11-14-quality-sixth-batch/`: before/after snapshots, guarded SQL, source guards, exact previous and updated specifications, visual/math review, SVG sources, validator/lint reports, live Desmos evidence, preview captures, and publication record. The save locked and checked the four target lessons before adding only the six intended figure fields.
