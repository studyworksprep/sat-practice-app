# Fourth optional lesson-quality batch — implemented

> **Status: Historical.** Completed November 13, 2026.

The three requested presentation and sequencing improvements are saved in the lesson bank. The other optional recommendations remain unapplied.

| Lesson | Change | Cards before → after |
| --- | --- | --- |
| [Circle Geometric Relationships](https://studyworks.io/tutor/lessons/f86de617-9c6a-46b9-8c41-9c5e59f3447b/preview) | Separate radius/diameter, circumference, and area cards, each with one boxed formula. The circumference and area cards identify the formulas available on the SAT reference sheet. The following existing card now focuses on the circumference-to-radius-to-area worked example. | 28 → 31 |
| [Solve Percent and Percent Change Problems with Desmos](https://studyworks.io/tutor/lessons/87964e64-d44c-48b1-98c6-85924ea0ccf2/preview) | Separate, labeled increase and decrease templates. Each highlights that both uses of Old mean the same starting value, and retains the percent-of notation and regression tilde instruction. | 39 → 40 |
| Advanced Factoring: Non-Monic Trinomials and Cubes | A fresh retry check on factoring `64z³−125` immediately follows the first difference-of-cubes model, before the sum-of-cubes model. Its hint cues cube roots and the existing sign mnemonic; its solution identifies the squared terms and middle product. | 33 → 34 |

The cube check is newly authored lesson practice. It is not presented as an existing content-bank question or as evidence that the taught strategy fails.

## Verification

- All three specifications compile and pass the current lesson validator with zero errors and warnings. Their compiled content exactly matches the saved lesson blocks.
- Multiplying all four cube choices confirms exactly one identity: `(4z−5)(16z²+20z+25)`. The other choices retain the wrong middle sign, omit the middle product, or use the sum identity. The quadratic has negative discriminant and no further real linear factorization. Its correct zero-based index is 2. Retry mode, a targeted hint, and a worked solution are present.
- The circle worked example still gives radius 6 and area 36π from circumference 12π. The unchanged following check gives radius 8 and area 64π from circumference 16π. The circumference and area reference-sheet reminders were checked against the official [SAT reference information](https://satsuite.collegeboard.org/media/pdf/english-sat-test-directions-bb.pdf), page 8.
- The percent templates preserve the original base: increasing 80 by 15% gives 92, and decreasing 80 by 15% gives 68. All existing Desmos expressions, success gates, expected answers, prompts, choices, hints, and feedback remain unchanged.
- The updated circle sequence and percent sequence, including their neighboring checks and Desmos models, were visited in live tutor preview at 1440-pixel and 390-pixel widths. Twenty-four captures show the affected cards and neighbors. New formulas render clearly at both widths, with no page-width overflow. Preview records no student answers.
- **Preview limitation:** Advanced Factoring is private. Its preview returns 404 for the current tutor role. Its saved content, placement, answer key, and compilation were verified through the content connector and local validator; live visual verification was unavailable. Visibility and access were not changed.
- Pacing lint warnings were reviewed separately from schema validation. The short circle formula sequence intentionally separates the three rules before the worked example and existing changed check. The two percent template cards intentionally sit between Old/New identification and the existing direction check. Other text runs and the factoring independent-practice run are pre-existing; the new cube check shortens the first uninterrupted run of cube models. No extra questions were added just to satisfy a block-count heuristic.
- The complete 46-lesson comparison confirms that all **43 other lesson records are unchanged**. All **1,514 original block IDs** are preserved. Only two original content objects change, and only their HTML: `whole_circle_model` and `percent_change_template`. All 726 existing check and Desmos-interactive content objects are unchanged. Five added cards bring the bank to **1,519 blocks**.
- Student progress (49 rows), topics, techniques, assignments, curriculum placement, titles, descriptions, publication status, and visibility are unchanged. Fingerprints were checked after the live previews.

## Source and recovery

Updated importable specifications are saved in `content/lesson-repairs/2026-11-13-quality-fourth-batch/after-specs/`:

- `circle-geometric-relationships.json`
- `percentages-and-percent-change.json`
- `advanced-factoring-non-monic-trinomials-and-cubes.json`

Exact previous live specifications are preserved under `docs/lesson-template-specs/archive/quality-fourth-batch-2026-11-13/`. All earlier circle diagrams and their immutable asset URLs are retained.

The [batch source branch](https://github.com/studyworksprep/sat-practice-app/tree/codex/lesson-quality-fourth-batch-20261113-bf5d) contains the three updated canonical specifications, their archives, and this record. These saved-content changes require no application deployment. Full bank snapshots, history fingerprints, and screenshots are retained locally, not included in the public source branch.

The original checkout contains separate local drafts of Percent Change and Advanced Factoring. Those files were preserved byte-for-byte. Their updated live canonical versions are in the review bundle and source branch. The root Circle specification matched the earlier approved live revision and was updated with this batch.

Work used a clean checkout matching current remote main, commit `52c625499a61bb70e20b79d0a38f5e3fe5a23e4e`. Fetching was limited by read-only Git metadata in the original checkout and unavailable DNS in the separate checkout. The GitHub connector independently confirmed main at the same commit. Current authoring and revision guidelines were used. The baseline specifications were compiled and compared with the live bank before editing; the Circle baseline includes the previously approved diagram batch.

Three model specifications were selected randomly and read at the same current-main revision:

- `docs/lesson-template-specs/special-right-triangles-45-45-90-and-30-60-90.json`
- `docs/lesson-template-specs/percentages-and-percent-change.json`
- `docs/lesson-template-specs/boundaries-transition-word-placement-and-logic.json`

Local review and recovery materials are in `content/lesson-repairs/2026-11-13-quality-fourth-batch/`: before/after snapshots, guarded update SQL, stable new IDs, source guards, answer-key analysis, validator and lint reports, preview evidence, and publication record. The update locked and checked the three target lessons before applying only the intended edits.
