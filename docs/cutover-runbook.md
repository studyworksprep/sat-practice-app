# Cutover runbook: legacy → next, per student

The goal: move one student's `app_metadata.ui_version` from
`'legacy'` to `'next'` without losing access to any of their
existing data.

The new tree reads from `practice_test_attempts_v2`,
`assignments_v2`, `practice_sessions`, and the shared `attempts`
table. The legacy tree reads from `practice_test_attempts`,
`question_assignments`, `lesson_assignments`, and `attempts`.
Cutover is a per-user flag flip; the data those two trees see
is reconciled by:

- The shared `attempts` table — both eras write here.
- The one-shot v1 → v2 copy migrations (`20240101000015`,
  `20240101000022`).
- Continuous-sync triggers on `question_assignments` /
  `lesson_assignments` that mirror new rows into `assignments_v2`.
- The per-student `import_student_practice_history` RPC, fired
  on flip, that copies v1 practice-test attempts to the v2 tables.
- The `question_id_map` lookup at every read site that joins
  `attempts.question_id` → `questions_v2.id`.

---

## Pre-flight

Run these once per student before the flip. They confirm the
data path is healthy; they don't change anything.

1. **Confirm role.** `SELECT id, role FROM profiles WHERE id =
   '<student-uuid>';` Must return `role='student'`. A
   `role='practice'` user belongs on `/subscribe`, not the new
   tree, and the (student) layout will redirect them.

2. **Confirm their teacher is on the new tree** (or the kill
   switch is `'next'`). A flipped student whose teacher is still
   on `'legacy'` will continue receiving assignments via the v1
   `question_assignments` table — those flow to v2 via the
   continuous-sync trigger landed in
   `20240101000032_continuous_assignment_sync.sql`, so this is
   safe in either configuration. Worth noting if a tutor reports
   "I assigned X but my flipped student doesn't see it" — first
   check whether the trigger is installed in that environment.

3. **Spot-check a recent practice-test attempt.** From the tutor
   UI, open `/tutor/students/<id>` and click a completed test row.
   The tutor-tree results page (`/tutor/students/<id>/tests/<aid>/results`)
   should render. If it 404s, run `import_student_practice_history`
   manually first; if the report renders but a section is sparse
   (timing bars, MCQ student picks), it's the legacy data shape
   — covered by the loader's fallbacks but worth eyeballing.

4. **Smart Review sanity.** Visit the legacy `/review` page on
   that student's behalf if possible. The Smart Review tab pulls
   from the v2-native `buildWeakQueue`. If it's empty for a
   student with significant attempt history, run the v1→v2 ID
   audit (commit `1a4185b` for the helper that resolves these).

5. **Per-student data audit** (optional but useful for the first
   few flips). The following SQL surfaces what the student has
   on the legacy side so you know what to expect afterwards:

   ```sql
   select
     (select count(*) from attempts where user_id = '<sid>')                     as total_attempts,
     (select count(*) from practice_test_attempts where user_id = '<sid>')      as legacy_test_attempts,
     (select count(*) from practice_test_attempts_v2 where user_id = '<sid>')   as v2_test_attempts,
     (select count(*) from question_assignments where student_id = '<sid>')    as legacy_assignments,
     (select count(*) from assignment_students_v2 where student_id = '<sid>')  as v2_assignments,
     (select count(*) from question_status where user_id = '<sid>' and notes is not null and length(trim(notes)) > 0) as legacy_error_notes,
     (select count(*) from question_error_notes where user_id = '<sid>')       as v2_error_notes,
     (select count(*) from flashcard_sets where user_id = '<sid>')             as flashcard_sets,
     (select count(*) from flashcards f join flashcard_sets fs on f.set_id=fs.id where fs.user_id='<sid>') as flashcards;
   ```

   - `legacy_test_attempts` should match `v2_test_attempts` after
     the import RPC runs (or be ≤ — re-imports skip already-in-v2
     rows). A wide gap pre-flip and zero v2 means the import
     hasn't run yet; the flip handles that automatically.
   - `legacy_error_notes` should equal `v2_error_notes` after
     `import_student_error_notes` runs (or v2 ≥ legacy if the
     student has already written some notes after a previous
     flip + flip-back).
   - `legacy_assignments` and `v2_assignments` should be roughly
     equal post-cutover; the continuous-sync trigger keeps them
     in step.

---

## The flip

Use `migrateUserToNext` from
`app/next/(tutor)/tutor/students/[studentId]/actions.js` — it's
the canonical path. The action:

1. Verifies the caller is admin (or manager assigned to the
   student, depending on env).
2. Calls `import_student_practice_history(p_student_id)` to pull
   v1 practice-test attempts into the v2 tables. Idempotent — if
   already run, the action skips.
3. Calls `recomputeAttemptScores` on every imported attempt to
   populate `composite_score / rw_scaled / math_scaled` against
   the v2 score-conversion lookup.
4. Calls `import_student_error_notes(p_user_id)` to backfill the
   student's legacy `question_status.notes` rows into the new
   v2-keyed `question_error_notes` table. Idempotent — `ON
   CONFLICT DO NOTHING` keeps any v2-side edits the student has
   already made (e.g. if they re-flipped to legacy and back).
5. Sets `app_metadata.ui_version = 'next'` on the user via the
   service-role auth client.
6. Returns either
   `{ ok: true, importedAttempts, recomputed, errorNotesImported, errorNotesSkipped }`
   or a structured error.

The button lives on `/tutor/students/<id>` next to the existing
"Import practice history" button. Clicking it shows a confirm
dialog ("This student will switch to the new app on their next
page load"), runs the action, and reflects the result inline.

**On the user's next page load**, the proxy at `proxy.js`:

- Reads the kill switch (`feature_flags.force_ui_version`),
  cached ~5s per server instance.
- Reads `app_metadata.ui_version` from the JWT (zero DB hops
  beyond the auth refresh).
- Resolves to `'next'`, rewrites `/foo` → `/next/foo`, sets the
  `x-ui-tree: next` request header.

The legacy `<NavBar />` at the root reads that header and bails;
the new-tree `<AppNav />` mounts via the route-group layouts.

---

## Post-flip verification

Done as the student (or as an admin impersonating them). Two
minutes per student.

1. **Dashboard.** `/dashboard` should serve the new-tree dashboard
   with non-zero "Total attempts" and a populated performance
   grid. The grid uses `resolveQuestionV2Meta` so v1-era attempts
   show up.

2. **Practice tests hub.** `/practice/tests` should show the
   imported attempts in the recent-tests table. Each row's
   "View report" link should land on a real report (not redirect
   to the runner — that's the in-progress fallback).

3. **Assignments.** `/assignments` should show every assignment
   the legacy student saw. New legacy-side assignments propagate
   via the `20240101000032` triggers; pre-existing ones came in
   via `20240101000022`. A flipped student with no assignments
   visible after a tutor assigned them is the trigger
   misbehaving — check `pg_trigger` for
   `trg_question_assignment_v2_sync`.

4. **Review.** `/review` should show the new-tree review surface
   (Common errors, Weak drill, Flashcards). Weak drill should be
   non-empty for a student with attempt history.

5. **A practice question.** From `/practice/start`, run a
   2-question session. Submit each, verify the attempt records
   land in `attempts` with `source='practice'`, and that the
   review page renders the rationale + correctness correctly.

6. **Error log carry-over.** If the pre-flight audit showed
   `legacy_error_notes > 0`, visit `/review/error-log` and
   confirm the count matches. Open one entry's "Show question"
   to confirm the question content + the student's latest
   answer render. If `import_student_error_notes` skipped
   anything (`errorNotesSkipped > 0` in the action result),
   that means the v1 question wasn't in `question_id_map` —
   rare and only affects truly orphaned v1 rows.

7. **Flashcards.** Visit `/flashcards`. The student's existing
   sets + cards should appear; no migration is required since
   `flashcard_sets` and `flashcards` are user-keyed and shared
   between trees. Click a set, confirm the card list renders,
   and (if the set has cards) click Review to confirm the flip
   + self-rate flow loads.

8. **Mark-for-review on practice.** Start a 2-question session
   from `/practice/start`. On the first question click "Mark
   for review", then navigate to question 2 and back. The
   gold-dot badge should persist on the bottom strip. Pre-flip
   marks don't carry over (legacy practice was 1-question-at-
   a-time and didn't write session rows), but post-flip marks
   should be sticky.

If any of those fails, **roll back first**, then debug.

---

## Rollback

Set `app_metadata.ui_version = 'legacy'` on the user (or remove
the key entirely — legacy is the default fallback). The next
page load takes the user back to the legacy tree without data
loss. Every write the new tree did goes to the shared `attempts`
table or to v2 tables that the legacy tree doesn't read. The
v1 tables are unchanged.

A clean rollback is a non-event for the user. We use this on any
"something looks wrong" report and debug from the legacy side.

---

## Bulk rollout

When ready to flip cohorts of students at once, prefer a small
SQL migration that updates `app_metadata.ui_version` for a
filtered set, plus a one-time `import_student_practice_history`
fan-out (idempotent, so safe to re-run). The kill switch
(`feature_flags.force_ui_version`) is the lever for "everyone
to next" / "everyone to legacy" — propagates within the proxy's
~5s cache TTL.

The kill switch overrides the per-user flag in both directions:

- `force_ui_version = 'next'` — every authenticated request gets
  the new tree, even users with `'legacy'` in their JWT.
- `force_ui_version = 'legacy'` — every authenticated request
  goes to legacy, even users flipped to `'next'`. Useful as a
  panic button if the new tree starts misbehaving in production.

Either way, NavBar visibility tracks the proxy's decision via
the `x-ui-tree` request header, not the JWT, so the chrome stays
consistent with what's actually being served.

---

## Known asymmetries (none of these block cutover)

- **`practice_sessions` is v2-only.** Legacy practice activity
  (one-question-at-a-time on `/practice/[questionId]`) wrote to
  `attempts` but didn't create session rows. After a flip, the
  student's "practice history" list at `/practice/history` is
  empty even though their attempts are intact and counted on
  the dashboard, in Common Errors, in Smart Review, etc.
  Reviewing an individual pre-flip question still works via
  the Error Log row's "Show question" expand.

- **Per-question timing on imported tests.** Bluebook uploads
  didn't capture `attempts.time_spent_ms`; the per-module wall
  time on imports has identical `started_at` / `finished_at`.
  The results page falls back to summing per-question time when
  available; for pure Bluebook imports it shows "no timing
  recorded" rather than blank bars.

- **Bluebook MCQ picks.** Old Bluebook uploads wrote
  `selected_option_id` (a v1 uuid) but not `response_text`. The
  loader resolves the option's label from `answer_options` for
  display so the renderer's red-X-on-wrong styling fires. New
  uploads going forward match the v2 shape.

- **Mark-for-review on past sessions.** The new
  `practice_sessions.marked_positions` column is v2-only. Pre-
  flip practice activity has no concept of "marked for review"
  to import. Post-flip marks are sticky on the runner and the
  per-session review map.

- **Concept tags written post-cutover.** The
  `question_concept_tags` table FKs the legacy `questions` v1
  id. Read paths translate v2 → v1 via `legacy-id-map`, so
  reads work fine. Writes still require a v1 row to exist —
  questions added to v2 after cutover (no v1 counterpart) get a
  friendly "no v1 counterpart" error from `addConceptTag`. The
  schema fix is the v1-decommissioning work in the parked queue.

- **Desmos saved states.** `desmos_saved_states.question_id`
  carries v1 ids historically. The next-tree loader reads by
  the v2 id directly without translation — so a teacher-set
  saved state on a v1 question won't surface for the v2
  student until we migrate that table. Worth a one-shot
  migration if any saved states exist; check
  `select count(*) from desmos_saved_states` first.

---

## Pointers to the relevant code

| Concern | File |
|---|---|
| Proxy + `x-ui-tree` header | `proxy.js` |
| Legacy NavBar gate | `components/NavBar.js` (consumes `uiTree` prop) |
| New-tree AppNav | `lib/ui/AppNav.jsx` |
| Per-student migrate action | `app/next/(tutor)/tutor/students/[studentId]/actions.js` (`migrateUserToNext`) |
| Practice-test import RPC | `supabase/migrations/20240101000016_create_import_student_practice_history.sql` |
| Continuous assignment sync | `supabase/migrations/20240101000032_continuous_assignment_sync.sql` |
| v1→v2 attempt-id translation | `lib/practice/weak-queue.js` (`resolveQuestionV2Meta`, `expandToAttemptIds`) |
| Score recompute on import | `lib/practice-test/recompute-scores.js` |
