# Remaining DC question normalization

> **Status: Historical document.** The remaining 451 production questions were normalized and verified October 9, 2026. The shared code and mobile table containment changes accompany this record in a follow-up PR; publication of question data does not deploy application code.

All **459 published Math questions** with five- or six-digit `source_external_id` values ending in `-DC` now use the bank's existing content conventions. This completes the 451 questions remaining after the [first eight-question batch](dc-question-normalization-2026-10-08.md), using the official College Board responses captured and hashed during the [original audit](dc-question-bank-audit-2026-10-08.md).

## Content and rendering

- Converted **3,117 equation-image occurrences**, representing **2,307 distinct PNGs**, to TeX rendered by the existing MathJax pipeline. There is no separate renderer for DC questions.
- Added **364 image-hash-bound reviewed transcriptions** for ambiguous speech, geometry markings, accessibility-description defects, and longer formulas needing line breaks. The offline speech parser consumes the entire description and rejects unknown or ambiguous expressions; reviewed PNG pixels resolve those cases.
- Normalized paragraphs, emphasis, underlining, variable labels, table classes, and imported wrappers. Removed invalid paragraph/table nesting and closing tags for void `col` elements. Diagrams, table cells, and their spans were preserved.
- Regenerated every question's stem, stimulus, rationale, and choice rendering caches together with the normalized source fields.
- Added local horizontal scrolling for wide tables in the shared renderer's single-column stimulus and stem regions. This code change takes effect when the follow-up PR is merged and deployed.

Three content defects confirmed by the official sources were corrected alongside formatting:

| Question | Correction |
|---|---|
| M-00010 | Removed the stray stimulus paragraph “Which statement about the graph is true?” from the Avery earnings question. |
| M-00158 | Restored the table caption “Percent of Residents Who Earned a Bachelor's Degree or Higher”; all seven values are unchanged. |
| M-01477 | Corrected choice C from `6x - 2y = 10` to `6x - 2y = 0`. The answer key remains B. |

Formula transcriptions follow the actual source PNG when its accessibility description omits or misstates a term, sign, segment bar, or arc. Examples include M-00843's second factor `(a-8)`, M-01371's denominator `EF`, and missing terms in M-00363, M-01377, and M-01593. These are transcription corrections, not changes to the source mathematics.

## Publication and preservation

The 451 updates were applied in 60 successful transactions against production project `noqtadytxyslkoetchrs`. Each transaction locked question IDs in sorted order and checked the saved timestamp, original content, choice identities, source identity, publication status, unrelated metadata, and absence of pending drafts. The installed history trigger retained the original published content.

One original batch guard rejected M-00952 because JavaScript had rounded its stored fractional answer number. No question in that transaction was updated. Native PostgreSQL JSON text was captured for the remaining 106 questions and used in the rebuilt guards. The database's exact fractional keys were preserved; no update statement wrote answer keys.

Final verification confirmed:

- **451/451 exact normalized source and cache matches**, including choices and source hashes.
- **451 new prior-content snapshots**, matching original content, choices, and answer keys. The 62 earlier history records remain present.
- Answer keys preserved as exact native PostgreSQL JSON text; other metadata and choice identities unchanged.
- All **2,809 preexisting student attempts** preserved by complete-row fingerprints. Six new attempts were created after the baseline; a separate timestamp-bounded query verified the earlier rows and accounted for all six additions.
- Practice-test memberships unchanged: zero memberships before and after for this cohort.
- Zero broken questions and zero remaining equation-image questions across the complete 459-question cohort.

## Validation and retained evidence

All **902 desktop/mobile browser checks** passed using the shared `QuestionRenderer`: no page/card overflow, broken images, equation-image markers, old formatting classes, or MathJax errors. The 364 reviewed transcriptions also render without math errors. All 604 existing unit tests and nine content-normalization tests passed, as did project type checking, lint with existing warnings, repository hygiene, and the production build.

The local evidence directory is `tmp/dc-question-remaining-2026-10-08/`: original snapshots, source manifests, proposals, formula comparisons, 902 screenshots, executed transaction receipts, before/after fingerprints, exact metadata strings, attempt-preservation evidence, and the final verification summary. The comparison gallery is also incorporated into `tmp/dc-question-audit-2026-10-08/previews/`. Raw bank content and database snapshots are retained locally and are not committed in this PR.

The reproducible tools accept saved audit directories and reviewed registries:

- `prepare-remaining-dc-questions.ts` assembles the remaining cohort from verified official sources and an unchanged live baseline.
- `review-dc-math-corpus.ts` produces paginated source-PNG/formula comparison sheets.
- `preview-dc-question-repairs.ts` builds normalized proposals, preservation checks, and shared-renderer previews.
- `verify-dc-question-previews.ts` checks all pages at desktop and mobile widths.
- `build-dc-normalization-sql.ts` prepares guarded SQL without executing it. Its optional fourth argument contains verified completed receipts for resuming a partially applied package. Baselines must retain native `preserved_text` for precise PostgreSQL numerics; regenerating a baseline through parsed JavaScript numbers can cause a guard rejection.
- `verify-dc-normalization.ts` verifies saved live results and marks the gallery published only after preservation checks pass. Optional timestamp-bounded attempt evidence permits newly created attempts while requiring every baseline fingerprint to match exactly.

## Source caveats

M-00861's official API response omits its prompt. Its existing stored prompt was preserved and only its formatting normalized.

M-01631's official explanation contains the equality `5/4 = (2^-2)`, apparently omitting a factor of 5 on the right. That source formula was preserved in this formatting pass and remains a separate content issue for review.
