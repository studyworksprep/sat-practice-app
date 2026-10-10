# SAT mobile overflow and emphasis repairs — October 10, 2026

**Status: Historical.** Repair and verification record for October 10, 2026.

The remaining audit findings covered 44 questions with content overflow at a 400px viewport and seven prompts missing official emphasis. Of the overflow cases, 42 contained long explanation equations and two contained wide answer-choice graphs (M-01248 and M-01759).

The shared QuestionRenderer now contains horizontal overflow inside answer-choice content and explanations. Explanations can shrink within their flex container. Normal prose wraps as before; wide equations and graphs remain at their authored size and can be scrolled to their far edge. The change applies to the shared practice, review, teacher, and test rendering surfaces.

The seven emphasis repairs are applied in production. Fresh College Board API records confirmed each occurrence. Semantic HTML restores underline on “miles” (M-00372), “cups” (M-01808), and “radians” (M-01917); bold on “NOT” (M-01746), “not” (M-01784), “square feet” (M-01797), and “millimeters” (M-01812). Only the stem, matching math cache, cache metadata, and repair timestamps were updated. Wording, math, question IDs, choices, and canonical answers were preserved, including M-01784’s previously expanded accepted responses.

## Verification

- All 44 original overflow cases were reproduced using the current merged renderer styles.
- 306 checks across all 51 affected questions at 320, 375, 400, 820, 1024, and 1440px found no page or card overflow, broken images, or unprocessed math.
- 172 content scroll checks reached their far edge without vertically clipping math. At 400px, math and graph dimensions match the baseline. All 42 emphasis visibility checks passed.
- 6,648 additional layout checks across the 3,324 saved published audit previews at 400 and 1440px passed with the updated CSS. These are saved audit snapshots, not a new full production-source audit.
- Eight browser regression tests use the actual shared component, CSS, and MathJax output in single-column and two-column layouts. They cover narrow phones, narrow desktop panes, full horizontal access, preserved math size, visible final prose, choice-label selection, and visible cross-out controls.
- 613 unit tests, TypeScript checking, and lint of the new test passed.
- Complete production metadata and all eight content/cache hashes matched the exact prepared values for the seven emphasis repairs. Seven new prior-content snapshots, 12 existing snapshots, and 2 student attempts were verified; existing history and attempts were unchanged. These questions had no practice-test memberships or item attempts.

The emphasis data repair is live. The mobile rendering code requires PR merge and deployment. No database schema changes are included. No Living document describes this CSS seam; there is no Living doc impact.

Full snapshots, fresh official records and hashes, guarded SQL, receipts, preservation checks, and the before/after gallery remain locally in `tmp/sat-mobile-emphasis-repairs-2026-10-10/` and are excluded from the PR.
