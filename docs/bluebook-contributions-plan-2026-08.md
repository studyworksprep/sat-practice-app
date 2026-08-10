# Bluebook Contributions Plan — 2026-08

> **Status: Living document — active build plan.** Design settled
> 2026-08-05. Delivery is tracked in the **Status ledger** below; every
> phase commit updates it, per the docs rules.

## Status ledger

| Phase | State | Notes |
|---|---|---|
| 0 — Security prerequisite | **Done** (2026-08-05) | RLS enabled on `score_conversion` + `practice_test_routing_rules` on dev **and** prod, with authenticated-read / admin-write policies + the demo read-only lockdown. Read audit found the student scoring path reads the table through the RLS-bound user client, so bare RLS-with-no-policies would have silently degraded every new score to the estimated curve. |
| 1 — Schema | **Done** (2026-08-05) | `contributor_codes`, `bluebook_submissions`, `score_conversion.submission_id` + `.flagged_at`, private `bluebook-reports` bucket, validation trigger, RLS — dev **and** prod. Two deltas from the plan text, both recorded below: contribution is a capability (`can_contribute()`) rather than only a role, and the module-2 routing check reads `practice_tests_v2` thresholds because `practice_test_routing_rules` is v1-dead. |
| 2 — Server | **Done** (2026-08-05) | Parser moved server-side (`lib/bluebook/parse-report.ts`, linkedom) with fixture tests; submission create/cross-check/review/promote actions; provenance loop closed in both the upload route and Recalculate. Also fixed a hard-coded adaptive-routing threshold in the upload route — see below. |
| 3 — UI | **Done** (2026-08-05) | New `(contributor)` route group at `/contribute` (list + three-flow wizard incl. the Bluebook entry view and the checksummed grid), admin review queue at `/admin/bluebook-submissions`, nav + proxy + role-landing wiring. Driven end-to-end in the browser: a real flow-C submission landed with its distractor, and verify worked. Promotion is verified at the SQL and authorization layers but **not** through the running app — the local `.env.local` service-role key is invalid (see below). |
| 4 — Trust & polish | **Done** (2026-08-05) | Shared track-record tally behind both surfaces, auto-verification for evidence-backed submissions from proven contributors (dev **and** prod), contributor guide at `docs/bluebook-contributor-guide.md`. |

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
- **Security issue (closed, 2026-08-10):** RLS was disabled on
  `score_conversion`, `practice_test_routing_rules`, and the `stg_*` tables in prod — the anon
  key could write ground truth. Phase 0 enabled RLS on the first two on dev + prod
  (2026-08-05); the 11 `stg_*` tables were dropped outright on dev + prod 2026-08-10
  (`20260810131605_drop_stg_staging_tables.sql`). The advisor no longer reports any
  RLS-disabled tables on either project.
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
Enable RLS on `score_conversion` and `practice_test_routing_rules` (the `stg_*` cleanup
landed separately: dropped 2026-08-10). First audit how the app reads these tables: if all reads are server-side
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

**As built (2026-08-05) — three decisions the plan text left open:**

1. **Contribution is a capability, not just a role.** `contributor` exists as a base role for
   outside contributors, but `profiles.role` is single-valued: a tutor who switched to it would
   lose their roster, and flow B *requires* the contributor to still be their student's tutor.
   So the gate everywhere is `can_contribute()` = `is_teacher() or is_contributor()`. Staff hold
   the capability implicitly; outside contributors hold it via the role.
2. **The module-2 routing check reads `practice_tests_v2`, not `practice_test_routing_rules`.**
   The v2 migration moved adaptive thresholds onto `rw_route_threshold` / `math_route_threshold`
   columns and left the routing-rules table behind as v1 residue with no consumers. The trigger
   compares a submission's optional `{rw,math}_m2_route` against
   `m1_correct >= threshold -> 'hard'` (the rule in `lib/practice-test/adaptive-routing.js`).
   When a test has no threshold it records a `route_check_skipped` flag rather than duplicating
   that module's `DEFAULT_THRESHOLDS`, where the two copies would drift.
   Route codes are `easy` / `hard` — not `std` / `adv`.
3. **Staff cannot review their own submissions.** Since tutors are contributors, an unqualified
   `is_teacher()` UPDATE policy would have made the review gate a formality — you could verify
   and promote your own data. The policy carries `contributor_id <> auth.uid()`.

Hard violations raise (malformed vector, checksum mismatch, count above the module's item count,
illegal status transition, verifying an `html_upload` with no stored artifact). Soft findings land
in `validation_flags` and never block: `conversion_conflict`, `route_inconsistent`,
`route_check_skipped`. A conflict also stamps `score_conversion.flagged_at` on the row it
disagrees with — flagging both sides, overwriting neither.

### Phase 2 — Server
- Refactor `lib/parseBluebookHtml.js` so the existing student upload route and the new
  submission flows share one parser; add fixture-based tests with saved report HTML.
- Endpoints/actions: create submission (per entry method), attach/parse HTML artifact,
  flow-B cross-check (parsed vector vs stored attempt vector → diff report), review actions
  (verify/reject), promotion function (verified → `score_conversion` with `submission_id`).
- **Close the provenance loop (pending follow-up from 2026-08-05):** update the existing
  upload-bluebook route and the Recalculate flow to set `official_source`, `officialized_at`,
  and `score_conversion.attempt_id` at write time.

**As built (2026-08-05):**

- **The parser is server-side and there is only one of it.** `lib/parseBluebookHtml.js` used
  the browser's `DOMParser`, so each client parsed the `.htm` itself and POSTed the *parsed*
  questions — the server stored a hand-editable answer vector on faith. It is now
  `lib/bluebook/parse-report.ts` (linkedom). The tutor upload card and the admin batch tool
  preview through `POST /api/bluebook/parse` and send the raw file; `upload-bluebook` re-parses
  it. **The parse endpoint deliberately returns no per-question correct answers** — a parsed
  report is the answer key for a whole form, and the `contributor` role is an outside account.
- **Wrong-answer placeholders are deterministic.** When a report omits the student's own answer
  (the "show my answers" toggle) the parser synthesizes one. It used to pick at random, which
  meant re-parsing the stored artifact produced different bytes — defeating the point of keeping
  it. It is now derived from the ordinal, and `toResponseVector` never records a synthesized
  value as `chosen`, so a placeholder can't be mistaken for real distractor data.
- **A flow-B disagreement is refused, not recorded.** If an attached report disagrees with the
  linked attempt on any question, the submission is rejected with the count. It means the
  answers keyed into Bluebook aren't the answers the student gave, so the official scores
  describe a different sitting. A contributor who trusts the report over the app submits it
  through flow A instead, where the report's own vector is what gets stored.
- **Promotion never overwrites a conflicting curve.** A section whose (test, section, m1, m2)
  key already exists at a different scaled score is skipped and reported; the existing row keeps
  its `flagged_at`. Promotion is manager/admin only (it writes `score_conversion`, which is
  admin-write), goes through the service role, and re-checks the self-review rule that RLS would
  otherwise have enforced.
- **Fixed in passing: the upload route's adaptive-routing threshold was hard-coded** to 18 (RW)
  and 14 (Math). Real per-test thresholds live on `practice_tests_v2` and range 16–19 / 14–16 in
  production, so uploads for any test that wasn't 18/14 were attached to the wrong module-2 form —
  and therefore to the wrong questions. It now calls `chooseModule2Route`, the same function the
  live runner routes students with.

### Phase 3 — UI
- Contributor surface (new route group `(contributor)` or extend `(tutor)`): submission list +
  status, new-submission wizard with the three flows (HTML upload default), flow-B attempt
  picker + score confirm + Bluebook entry view, flow-C checksummed grid (render from
  `practice_test_module_items_v2` ordinals) with optional distractor popover.
- Admin review queue (extend `(admin)`, near `bluebook-batch`): pending submissions, parsed
  summary, artifact link, conflict flags, verify/reject/promote, contributor track record.

**As built (2026-08-05):**

- **`(contributor)` route group, not an extension of `(tutor)`.** The audience is wider than
  either existing tree: tutors hold the capability implicitly, outside contributors hold the
  role. `(tutor)`'s layout would have locked the second group out. Staff keep their usual nav
  at `/contribute`; the `contributor` role gets a nav of just Contribute + Help, because every
  other surface would redirect or 403 for them.
- **`/contribute` is deliberately absent from `SUBSCRIPTION_REQUIRED`.** Contributors donate
  data and have no subscription; gating the one surface they exist to use would put them in a
  redirect loop. It *is* in `BLOCKED_FOR_PRACTICE`.
- **The grid reads real ordinals, not 1..N.** Production numbers questions from 1, but that is
  data rather than a guarantee — and the dev seed numbers from 0, which is how this surfaced.
  The wizard is handed each module's actual ordinal list, so the vector it builds is keyed the
  way the module items are on any test.
- **The artifact is downloaded, never navigated to.** The reviewer's link is a short-lived
  signed URL with `download: true`: the file is untrusted HTML from a contributor and must not
  render as a document in the app's origin.

**Verification gap to close (2026-08-05).** Flow C was driven end-to-end in a browser against
dev — a real submission landed with its distractor captured, the checksum gate held, and
verify worked. **Promotion could not be completed through the running app**: the local
`.env.local` `SUPABASE_SERVICE_ROLE_KEY` is invalid, so every `requireServiceRole` path fails
with "Invalid API key" (the role gate passes and the error surfaces correctly — it's the key,
not the code). Promotion is covered at the SQL layer instead, exercised on dev inside a
rolled-back transaction: `submission_id` stamped, the conflicting curve skipped rather than
overwritten, `flagged_at` left set. **Re-run the promote button once the local key is
refreshed.** The same stale key blocks local testing of the Recalculate flow and the
upload-bluebook route.

### Phase 4 — Trust & polish
- Contributor stats (submitted / verified / rejected); auto-verify rule for HTML-backed
  submissions from contributors above a track-record threshold.
- Docs for contributors: how to save the My Practice report as HTML, privacy rules
  (no student names anywhere, consent is the contributor's responsibility).

**As built (2026-08-05):**

- **Auto-verification never writes `score_conversion`.** It skips one human step of two — the
  reading of evidence that already speaks for itself. Promotion stays a deliberate
  manager/admin act on every submission, auto-accepted ones included.
- **The rule (`lib/bluebook/contributor-trust.ts`) is deliberately mean.** All four conditions
  must hold: a stored artifact, no severe flag (`conversion_conflict` / `route_inconsistent`),
  never had a submission rejected, and at least 3 promoted. Being too strict costs a reviewer
  thirty seconds; being too loose puts a bad curve in front of students.
- **`auto_verified_at` rather than relaxing the reviewer requirement.** The trigger's rule was
  "verified requires `reviewed_by`" — the thing stopping a submission from marking itself
  reviewed. Auto-verified rows have no reviewer, so they carry their own marker; the two are
  mutually exclusive and a row with neither is still refused. "Who accepted this?" always has
  exactly one answer.
- **The auto-verify write goes through the service role, and that is the design working.** A
  contributor has *no* UPDATE policy on their own submissions — the only UPDATE policy is the
  staff one, which excludes your own rows. The first cut ran this on the caller's own client,
  where the update silently matched zero rows; caught by probing RLS directly. Nobody, the
  contributor included, may move their own submission to verified. The rule can, because the
  rule is not them.
- **The threshold is stated to the contributor**, on their own contributions page, rather than
  left to be inferred from behaviour.

## Open items after the phase build (2026-08-05)

1. **Nothing issues or redeems a `contributor_code` yet.** The table, the role, the capability
   helper, the middleware and the landing route all exist and work, and an admin can now assign
   the role from the user-detail page — but there is still no UI to mint a code and no signup
   path to redeem one, so a code you insert today is inert. Tutors are unaffected: they hold the
   capability through `is_teacher()` and can contribute now. Build this before inviting anyone
   from outside; the pattern to follow is `teacher_codes` —
   `app/(admin)/admin/users/codes/` for issuance, `app/api/signup/route.js` for redemption.
2. **Re-run the promote button once the local service-role key is refreshed** (see Phase 3).
3. **`scripts/dev-seed-ui-preview.sql` numbers module items from 0**, where production numbers
   from 1. Harmless now — the grid reads real ordinals rather than assuming — but it makes dev
   an unrepresentative place to eyeball anything ordinal-related.

### Verification
- Parser fixtures (multiple report vintages if available).
- Trigger tests: checksum mismatch, routing inconsistency, conversion conflict flag.
- Playwright: one happy path per entry flow; review + promote round-trip asserting
  `score_conversion` row lands with `submission_id`.
- Confirm product pipelines (`item_stats`, mastery snapshots, review queue) are untouched by
  submissions (nothing keys off `bluebook_submissions`).

**As verified (2026-08-05):**

- **Parser fixtures — done, but synthetic.** No real College Board export was in the repo, and
  checking one in would mean checking in a real student's answers. Three fixtures reproduce the
  structures the original browser parser was written against (current vintage, the status-only
  variant, the older heading-driven format); each fixture's header records the counts its tests
  assert. Ten tests, including re-parse determinism and a doctored file with inline script.
- **Trigger tests — done, as SQL probes against dev before each migration reached prod.** 11 for
  the Phase 1 trigger, 13 RLS probes, 6 more for the Phase 4 auto-verify guards. They live in
  the phase commit messages rather than in a suite; a `pgTAP`-style home for them is a
  reasonable follow-up.
- **Playwright — partially.** The existing e2e suite is a *negative* auth harness and
  deliberately doesn't drive Server Actions (see its own header comment), so the plan's
  "happy path per entry flow" doesn't fit it as written. What was added fits: anon → 401 on
  `/api/bluebook/parse`, students blocked from `/contribute`, `/contribute/new` and the review
  queue, teachers blocked from the review queue, and — the assertion that would catch an
  over-tightened layout — teachers **able** to reach both contributor pages. 23 pass.
  The happy paths were instead driven by hand in a browser (Phase 3 notes what that did and
  didn't cover).
- **Product pipelines untouched — confirmed.** `bluebook_submissions` is referenced only by its
  own feature files, its own validation trigger, and the intended
  `score_conversion.submission_id` FK. No other function, view, or foreign key touches it.
