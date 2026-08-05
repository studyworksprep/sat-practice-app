# Bluebook Contributions Plan — 2026-08

> **Status: Living document — active build plan.** Design settled
> 2026-08-05. Delivery is tracked in the **Status ledger** below; every
> phase commit updates it, per the docs rules.

## Status ledger

| Phase | State | Notes |
|---|---|---|
| 0 — Security prerequisite | **Done** (2026-08-05) | RLS enabled on `score_conversion` + `practice_test_routing_rules` on dev **and** prod, with authenticated-read / admin-write policies + the demo read-only lockdown. Read audit found the student scoring path reads the table through the RLS-bound user client, so bare RLS-with-no-policies would have silently degraded every new score to the estimated curve. |
| 1 — Schema | Not started | |
| 2 — Server | Not started | |
| 3 — UI | Not started | |
| 4 — Trust & polish | Not started | |

Goal: let tutors and (eventually) external contributors submit official Bluebook practice-test
results to grow the score-calibration dataset, without tying submissions to enrolled students
and without double data entry. Decided in design discussion 2026-08-05 (Julio + Claude).

## Background / hard-won context

- Production Supabase project is **"SAT Question Bank"** (`noqtadytxyslkoetchrs`); dev is
  **studyworks-dev** (`ikzhizgsawzjpuuznfid`). Test schema changes on dev first.
- Migration `add_score_provenance` (2026-08-05, applied to both) added:
  - `practice_test_attempts_v2.official_source` (`'bluebook_upload' | 'recalculate' | NULL` = estimated)
    and `.officialized_at`
  - `score_conversion.attempt_id` (FK, `ON DELETE SET NULL`) and `.created_at`
    (default `now()`; NULL = pre-migration row)
  - Backfill: 59/155 `score_conversion` rows linked to attempts; 30 attempts marked
    `bluebook_upload`, 14 `recalculate`. Recovered via Postgres `xmin` adjacency — do not
    rely on that trick again; the columns exist now, populate them at write time.
- **Circularity trap:** a `score_conversion` row that predates an app-scored attempt may be the
  row the estimator itself read. Never treat count+score coincidence as provenance; only
  explicit `attempt_id` / `submission_id` links count.
- Per-question flags live in `attempts` (`is_correct`, `selected_option_id`), joined via
  `practice_test_item_attempts_v2.attempt_id = attempts.id` (NOT via `context_id`).
- **Security issue (closed for two of three, 2026-08-05):** RLS was disabled on
  `score_conversion`, `practice_test_routing_rules`, and the `stg_*` tables in prod — the anon
  key could write ground truth. Phase 0 enabled RLS on the first two on dev + prod. The 11
  `stg_*` tables are still open and still flagged by the Supabase security advisor; they are
  slated for deletion in a separate cleanup (`docs/database.md` "Known drift").
- Known data-quality wrinkles: 25 item-attempt rows reference questions later swapped out of
  their module slot; several attempts have a 200 section from an all-zero (not-taken) section.

## Design decisions (settled — do not relitigate)

1. **Decouple from student records.** Contributions go to a new `bluebook_submissions` table,
   not `practice_test_attempts_v2`. No fake student accounts. No student PII anywhere in the
   submission schema — at most a contributor-private label ("Student A").
2. **Three entry flows, effort scaling with what's already known:**
   - **A. HTML upload (default):** contributor uploads the saved My Practice score-report HTML;
     `lib/parseBluebookHtml.js` (refactor for reuse) extracts response vector, module counts,
     scaled scores. Contributor confirms a summary screen. Zero grid entry.
   - **B. Attempt-linked (Recalculate workflow):** student took the test in-app; contributor
     keyed answers into Bluebook. Submission references the existing attempt — no answer
     re-entry. New info is only the official scores (typed) or the result HTML (parsed, and
     verified question-by-question against the stored vector; mismatch = Bluebook keying error,
     surfaced immediately). Also build a **"Bluebook entry view"**: the attempt's answers as a
     large-type ordered transcription list to make the manual Bluebook keying itself faster.
   - **C. Exception-only grid (fallback):** all answers prefilled green (correct); contributor
     flips the wrong ones. **Checksum guardrail:** module correct counts must be entered first
     (from the score report summary) and the grid refuses submission until flip counts match.
     Live "21/22 marked" feedback. Optional one-tap popover on flip to capture the chosen
     answer (distractor data) or "omitted" — offered, not required.
3. **Trust tiers:** HTML-backed submissions can auto-verify (artifact attached); grid-only
   submissions queue for staff review. Contributor track record (share of submissions surviving
   review) gates future auto-verification.
4. **Promotion pipeline:** `pending → verified → promoted` (or `rejected`). Only a server-side
   promotion function writes `score_conversion`, stamping `submission_id`. Contributors never
   write `score_conversion` directly.
5. **Store the raw HTML artifact** in Supabase Storage, referenced from the submission row —
   audit trail + reparse-ability when College Board changes the report format.
6. **Treat uploaded HTML as hostile:** parse server-side only, never render it, sanitize.
   A doctored file is possible — HTML is evidence, not proof; cross-checks still run.
7. **Access:** authenticated contributor accounts via invite code (mirror `teacher_codes` /
   `student_invite_codes` patterns), new `contributor` role. No anonymous intake.
8. **Capture `report_date`** (when the Bluebook test was taken) to detect future form revisions.

## Build phases

### Phase 0 — Security prerequisite
Enable RLS on `score_conversion` and `practice_test_routing_rules` (leave `stg_*` for a
separate cleanup). First audit how the app reads these tables: if all reads are server-side
(service role), enabling RLS with no policies is safe; if clients read them, add read-only
policies for `authenticated`. Verify score display + test routing still work on dev, then prod.

### Phase 1 — Schema (dev first, then prod)
- `contributor_codes` (or extend existing invite-code pattern) + `contributor` role handling
  in `profiles` / middleware.
- `bluebook_submissions`: id, contributor_id, practice_test_id, entry_method
  (`html_upload | attempt_link | manual_grid`), linked `attempt_id` (nullable, for flow B),
  per-section: m1/m2 correct counts + scaled scores; `responses jsonb`
  (module → ordinal → {correct, chosen?}), `subject_label text`, `report_date date`,
  `html_artifact_path text`, `status` (`pending|verified|promoted|rejected`),
  reviewer fields, timestamps. Append-only for contributors.
- `score_conversion.submission_id uuid` (FK → bluebook_submissions, `ON DELETE SET NULL`).
- Storage bucket `bluebook-reports` (private; contributor can write own path, staff read).
- Validation trigger on submissions: counts match vector; scaled in [200,800] step 10;
  M2 branch consistent with `practice_test_routing_rules` given M1 count; on exact
  (test_id, section, m1, m2) match with an existing `score_conversion` row at a *different*
  scaled score → flag both for review (do not block, do not overwrite).
- RLS: contributors insert + select own rows; staff (is_teacher/admin) select/update all.

### Phase 2 — Server
- Refactor `lib/parseBluebookHtml.js` so the existing student upload route and the new
  submission flows share one parser; add fixture-based tests with saved report HTML.
- Endpoints/actions: create submission (per entry method), attach/parse HTML artifact,
  flow-B cross-check (parsed vector vs stored attempt vector → diff report), review actions
  (verify/reject), promotion function (verified → `score_conversion` with `submission_id`).
- **Close the provenance loop (pending follow-up from 2026-08-05):** update the existing
  upload-bluebook route and the Recalculate flow to set `official_source`, `officialized_at`,
  and `score_conversion.attempt_id` at write time.

### Phase 3 — UI
- Contributor surface (new route group `(contributor)` or extend `(tutor)`): submission list +
  status, new-submission wizard with the three flows (HTML upload default), flow-B attempt
  picker + score confirm + Bluebook entry view, flow-C checksummed grid (render from
  `practice_test_module_items_v2` ordinals) with optional distractor popover.
- Admin review queue (extend `(admin)`, near `bluebook-batch`): pending submissions, parsed
  summary, artifact link, conflict flags, verify/reject/promote, contributor track record.

### Phase 4 — Trust & polish
- Contributor stats (submitted / verified / rejected); auto-verify rule for HTML-backed
  submissions from contributors above a track-record threshold.
- Docs for contributors: how to save the My Practice report as HTML, privacy rules
  (no student names anywhere, consent is the contributor's responsibility).

### Verification
- Parser fixtures (multiple report vintages if available).
- Trigger tests: checksum mismatch, routing inconsistency, conversion conflict flag.
- Playwright: one happy path per entry flow; review + promote round-trip asserting
  `score_conversion` row lands with `submission_id`.
- Confirm product pipelines (`item_stats`, mastery snapshots, review queue) are untouched by
  submissions (nothing keys off `bluebook_submissions`).
