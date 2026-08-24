# May 2026 SAT import batch

> **Status: Living document.** Last verified: 2026-08-23.

Source material and build artifacts for the "May 2026 SAT" question
batch — 349 questions reconstructed from the May 2026 US
administration, imported as **unpublished, opt-in pool** questions
(`questions_v2.pool = 'opt_in'`, `source = 'exam_recon'`,
`source_external_id = 'may2026-qNNN'`). Schema background:
docs/database.md § "Question pools and import batches".

## Files

| File | What it is |
|---|---|
| `fbb52e30-….mmd` | Mathpix OCR of the question set (the content source) |
| `*.jpg` (41) | Figure crops extracted by Mathpix, referenced from the mmd |
| `may-sat-part1/2.pdf` | Source PDFs: one page per question, correct option highlighted green, typed `Answer:` line per page. **Answer-marked — keep out of `public/`.** |
| `answer-key.csv` | Per-question key + section/module, machine-extracted from the PDFs' text layer |
| `corrections.json` | Hand-verified per-question overrides (underline restorations, truncation reconstructions, blank keys, skips) — every entry carries a `note` with its justification |
| `build/parsed-questions.json` | Generated: the exact rows the importer inserts |
| `build/report.md` | Generated: per-question flags + PDF page pointers for review |

## Pipeline

`scripts/import-may2026-batch.mjs` parses the mmd (cross-checked
against the answer key's 349-question inventory), converts to the
bank's HTML format, applies `corrections.json`, pre-renders math via
`lib/content/render-math.mjs`, and writes the build artifacts.
Referenced figures are copied to `public/images/may2026/` and served
from there until the migrate-public-images workflow moves them into
the question-figures bucket.

Inserting into the database is the **import-question-batch** GitHub
workflow (manual dispatch; dry-run first, then `apply=true`).
Idempotent — re-runs only add missing rows.

## State (2026-08-23)

- 346 of 349 questions import; 3 are skipped as unreconstructable
  from the source captures (Q86 key/underline contradiction; Q297 and
  Q306 truncated through their keyed options) — see `corrections.json`.
- Every correction is flagged for tutor review in `build/report.md`
  (underline placements, reconstructed option D tables for
  Q166/198/256/283, derived SPR keys for Q177/209).
- Difficulty and score band are deliberately NULL. Domain/skill
  classification is the next step — questions stay `is_published =
  false` until classified and tutor-reviewed.
