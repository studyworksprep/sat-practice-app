# Fifth optional lesson-quality batch — implemented

> **Status: Historical.** Completed November 14, 2026.

The four requested lesson improvements are saved in the production lesson bank. GCF sequencing and the other optional recommendations remain unapplied.

| Lesson | Change | Cards before → after |
| --- | --- | --- |
| [Survey Questions](https://studyworks.io/tutor/lessons/bbbc1579-78b1-46f1-bd1d-6a8f530af635/preview) | A changed retry question distinguishes leading wording from three neutral ways of asking about the same proposal. Random selection and complete response hold the other issues constant. It follows the existing nonresponse check. | 35 → 36 |
| [Multiple Percent Equations](https://studyworks.io/tutor/lessons/f0f36231-57d1-4be1-a013-1a19974137b5/preview) | A fresh independent numeric question connects three positive masses, with each percent based on the sum of the other two masses. No setup or scale is supplied before the attempt. | 29 → 30 |
| [Percent Change](https://studyworks.io/tutor/lessons/87964e64-d44c-48b1-98c6-85924ea0ccf2/preview) | A fresh independent numeric question recovers an original price from a discount, tax on the discounted price, and a fee on the original price. The calculator starts empty. The separate increase/decrease templates from the fourth batch remain intact. | 40 → 41 |
| [Place Transition Words by Logic](https://studyworks.io/tutor/lessons/b7c75cf1-1b02-4de9-99bc-3447929518f5/preview) | Three standalone clause maps appear on four existing explanatory cards: the general A–B versus B–C rule, the before-stop model and its mental rewrite, and the after-stop model. Existing questions receive no solved diagram. | 39 → 39 |

The three questions are newly authored lesson practice. They are not represented as existing content-bank items or evidence that the taught strategies fail.

## Verification

- All four specifications compile and pass the current lesson validator with zero errors and warnings. Compiled block types and content exactly match the saved bank. The transition specification was validated again after enlarging its worked-map text during mobile review.
- The survey key is C (zero-based index 2). “Finally” and “much-needed” praise the proposal before the response, while the other choices offer balanced support/opposition wording. The hint directs attention to framing; the worked solution separates wording bias from selection and nonresponse.
- For the new mass problem, U is one third of the total mass and V is one fifth. W is therefore 7/15 of the total and U+V is 8/15, so the requested percentage is uniquely `100(7/15)/(8/15)=87.5`. The positive scale U=5, V=3, W=7 satisfies all three equations. A live Desmos attempt initially returned all masses zero, p=1, and RMSE=0. Applying the already-taught repair, W=7, produced U=5, V=3, p=87.5, and RMSE=0. Thus zero RMSE alone is insufficient in this positive-mass context, as the existing lesson explains.
- For the price problem, `0.80(1.05)+0.03=0.87`, so the unique original price is `104.40/0.87=120`. The discounted price is 96, tax 4.80, and fee 3.60. Live Desmos found b=120 with RMSE=0 using one definition and one regression. Applying both percentages to either single price gives a different answer.
- Seventeen numeric grading cases cover accepted decimals and fractions, common wrong quantities, wrong-base calculations, and blank entries. Both new independent questions are one-shot and have no pre-attempt hint, supplied equation, or preloaded calculator expression.
- The maps preserve the existing passage facts and punctuation. The result map connects A to B and keeps therefore inside B; the contrast map connects B to C and begins C with however. Alt text states the same relationship without relying on color. The worked-map type was enlarged after mobile inspection.
- Forty-two live preview captures cover the changed cards and their neighbors at 1440-pixel and 390-pixel widths, including final map revisions and both numeric questions with the calculator hidden. Every inspected image loaded and no page-width overflow was detected. Both calculator setups were exercised in tutor preview. Preview displays answers and feedback by design and records no student answers. The temporary viewport override was reset.
- Pacing lint warnings were reviewed. Survey's existing scope/practice runs and prior explanation runs remain. Percent Change now finishes with three consecutive independent checks; that short practice set is intentional. No additional topic or generic lesson restructuring was introduced to satisfy a count heuristic.
- The complete 46-lesson comparison confirms **42 untouched lesson records**, all **1,519 original block IDs**, and all **727 existing check/Desmos content objects** unchanged. Only four original content objects changed, by adding their figure field. Three new questions bring the bank to **1,522 blocks**. Titles, descriptions, publication status, visibility, and curriculum placement are unchanged.
- Student progress (49 rows), topics, techniques, assignments, and curriculum fingerprints are unchanged after the live previews. No question-bank item or student response was edited.

## Sources and recovery

Updated importable specifications are in `content/lesson-repairs/2026-11-14-quality-fifth-batch/after-specs/`:

- `surveys-sampling-and-margin-of-error.json`
- `solve-multiple-percent-equations-with-list-regression.json`
- `percentages-and-percent-change.json`
- `boundaries-transition-word-placement-and-logic.json`

Exact previous live specifications are preserved under `docs/lesson-template-specs/archive/quality-fifth-batch-2026-11-14/`. The original SVGs are in `public/images/lesson-quality-fifth-batch/` and are served from immutable asset commit [64cad1fd](https://github.com/studyworksprep/sat-practice-app/commit/64cad1fd3872b1297faf44dd1863feb917cb9fb1).

The [batch source branch](https://github.com/studyworksprep/sat-practice-app/tree/codex/lesson-quality-fifth-batch-20261114-bf5d) preserves the four canonical specifications, their archives, the diagrams, and this record. These saved-content changes require no application deployment. Full bank snapshots, student-history fingerprints, and preview screenshots remain local and are excluded from the public source branch.

The original checkout contains separate local drafts of Survey Questions, Percent Change, and Transition Placement. Those three files were preserved byte-for-byte; the updated live versions are in the review bundle and source branch. Multiple Percent Equations had no root canonical file, so its current updated specification was also saved there.

Work used a separate checkout matching verified current remote main, `5431c64e3809d7486d0637c246f373b1f5b11de7`. The original working tree was left in place. Fetching in the separate checkout was limited by unavailable DNS; the GitHub connector confirmed the main commit, and that exact commit was already available locally. The authoring guide, revision guidelines, and implicated runtime files are unchanged from the previous main revision. Baseline specifications were compiled and compared with the live bank. The Percent Change baseline includes the approved fourth-batch templates.

Three model specifications were selected randomly and read at current main:

- `docs/lesson-template-specs/central-ideas-and-details-find-the-point.json`
- `docs/lesson-template-specs/initial-modifiers-match-the-noun-after-the-comma.json`
- `docs/lesson-template-specs/standard-regression-from-data.json`

The local recovery bundle is `content/lesson-repairs/2026-11-14-quality-fifth-batch/`: before/after snapshots, guarded update SQL and the figure-legibility follow-up, stable new IDs, source guards, answer analysis, grading cases, validator/lint reports, live Desmos evidence, preview captures, and publication record. Both database saves checked and locked the affected lesson content before applying the intended edits.
