# First DC question normalization batch

> **Status: Historical document.** Eight production questions normalized and verified October 8, 2026. The shared authoring/normalization code changes are local workspace changes and have not been deployed.

The first reviewed batch from the [DC question audit](dc-question-bank-audit-2026-10-08.md) now uses the bank's existing HTML and MathJax conventions in production. This is 8 of the 459 matching questions; 451 remain for subsequent reviewed batches.

## Published content

| Question | Change |
| --- | --- |
| M-00005 | Normalize paragraphs and variables; replace eight explanation equation images |
| M-00006 | Normalize table layout and paragraph wrappers; replace seven explanation equation images |
| M-00016 | Preserve the graph and its accessibility description; replace four explanation equation images |
| M-00054 | Replace fourteen equation images across the prompt, choices, and explanation |
| M-00059 | Replace six fraction/polynomial images across prose, choices, and explanation |
| M-00061 | Place the leading equation in a centered stimulus; normalize numerical choices and explanation |
| M-00211 | Use aligned display equations; merge explanation variables into complete mathematical expressions |
| M-00340 | Remove restrictive table layout attributes; normalize numerical choices and the percentage-change explanation |

All four content surfaces were handled together: `stem_html`, `stimulus_html`, `options[].content_html`, and `rationale_html`. Inline expressions use `\(...\)`; standalone equations use `\[...\]`. Stem/stimulus paragraphs and tables use the current bank classes; explanations use ordinary paragraphs and options use bare inline content. Real graphs retain their source image and alt text.

Forty-three equation images were replaced using 42 visually reviewed formulas. Every original math image was matched to the official response, and the reviewed registry records each image's SHA-256, original alt text, proposed TeX, and official-response hash. Formula inference is not performed during publication.

## Shared code

- [bank-html-conventions.ts](../lib/content/bank-html-conventions.ts) supplies paragraph/table conventions to both the authoring serializer and normalizer.
- [normalize-bank-html.ts](../lib/content/normalize-bank-html.ts) handles legacy wrappers, reviewed variables, semantic italics, paragraph alignment, tables, and reviewed equation images. Existing TeX is protected during HTML parsing, including literal comparison operators and aligned-equation separators. An unreviewed equation image is retained or causes a review error when strict conversion is requested.
- [bank-html.ts](../lib/content/bank-html.ts) now saves centered display equations with supported `text-align` styling. Its prior paragraph `align` attribute was removed by the shared sanitizer.
- [dc-question-formatting-reviewed.json](../scripts/verification/dc-question-formatting-reviewed.json) is the reviewed first-batch conversion registry. New batches require their own source and visual review.

The authoring code fix is local and awaits the normal code deployment. The database content changes are already live and use the current deployed shared renderer.

## Publication and verification

Two guarded data-update transactions changed only content and rendering-cache fields. The transactions locked each question, checked its prior timestamp and content fingerprints, preserved every unrelated column, and rejected pending drafts. The installed history trigger captured all eight prior content versions automatically.

The existing `renderRow` rebuilt `stem_rendered`, `stimulus_rendered`, `rationale_rendered`, `options_rendered`, and `rendered_source_hash`; `rendered_at` was refreshed with the batch preparation time. Production fingerprints match every reviewed raw field, choice, and rendering cache exactly.

Verification confirmed:

- Eight original-content history snapshots match the saved before state.
- All answer keys, option identities, taxonomy, publication flags, and other question metadata were preserved.
- All 89 existing student attempt records retained their full fingerprints.
- The cohort remains 459 published questions with no Broken flags.
- Sixteen browser checks across desktop and mobile widths passed, with no overflow, broken images, remaining equation-image markers, legacy formatting classes, or math errors in the normalized cards.
- Five normalization regression tests and focused TypeScript checks passed. The original working directory had four unrelated errors in `tmp/verify-question-repair-records.ts`. Full-project type checking, all 604 existing unit tests, lint (existing warnings only), repository hygiene, and the production build passed in the clean PR worktree.

The comparison gallery (`tmp/dc-question-audit-2026-10-08/previews/index.html`, retained locally) shows the original content beside the published normalization. The verification summary (`tmp/dc-question-audit-2026-10-08/normalization-verification-summary.json`, retained locally) records the production result. Before/after fingerprints, raw originals, source hashes, execution results, and screenshots are retained in the same audit directory.

## Reproduction

`npm run test:content-normalization` runs the normalization regression checks and is included in CI. `npm run typecheck` covers the normalization, SQL preparation, and saved-result verifier in a clean checkout. The local snapshot/response files are prerequisites for the audit and preview commands; they are deliberately not committed.

`scripts/preview-dc-question-repairs.ts` prepares local content and browser previews from a saved snapshot and the reviewed registry. `scripts/verify-dc-question-previews.ts` checks all reviewed pages at desktop and mobile widths, saves screenshots and browser-check results, and fails on layout/rendering defects. Both accept an optional audit-directory argument. `scripts/build-dc-normalization-sql.ts` builds guarded data updates after successful preservation/browser checks; it does not execute them. `scripts/verify-dc-normalization.ts` checks a saved live verification result and marks the gallery as published only after all assertions pass.

Do not execute the saved publication statements again: they are guarded against the original timestamps and intentionally reject an already-updated question. New work must capture fresh production content and review its own batch. The original snapshots and `question_content_history` remain available for restoration if needed.

The three content defects identified by the audit and M-00861's incomplete official prompt remain outside this first formatting batch.
