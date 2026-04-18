# Session handoff — Phase 3 schema simplification

**For:** the next Claude Code session continuing this work.
**From:** the sessions that completed Phases 2 and 3.
**Delete this file** when the remaining follow-ups below are
either done or re-scoped into a new handoff.

---

## TL;DR

Phase 2 is done. Phase 3 is substantively complete: indexes,
audit columns, grants parity, tag-table cleanup, and the
assignment-model unification are all landed and deployed to
the Vercel preview.

What's left on Phase 3 is small-UX follow-up (archive toggle,
auto-completion), not schema work. Phase 4 can start whenever.

---

## Branch

`claude/continue-architecture-migration-SikEX` — all changes
pushed. Predecessor branch: `claude/continue-architecture-
migration-BETbL`.

---

## What's done in Phase 3

### Schema simplification
- **Indexes**: `profiles(role)`, `attempts(user_id, question_id)`,
  `question_status(question_id)` — migration 000019
- **Audit columns**: `created_by`, `updated_by`, `deleted_at`,
  `updated_at` (with auto-trigger) on `practice_tests_v2`,
  `practice_test_modules_v2`, `practice_test_module_items_v2`,
  `questions_v2` — migration 000019
- **`answer_choice_tags` + `option_answer_choice_tags`**: dropped
  (migration 000020).
- **Grants parity**: migration 000018.
- **`question_availability`**: marked for Phase 6 deletion.
- **Options normalization**: skipped (small, bounded, always read
  with parent). Documented in migration 000020's commit.

### Assignment-model unification (this session)
- **Schema**: migration 000021 — `assignments_v2` +
  `assignment_students_v2`, type-discriminated (`questions`,
  `lesson`, `practice_test`). Partial CHECK per type requires
  the matching payload column non-null; RLS uses `can_view()`
  plus SECURITY DEFINER bridges to break the parent↔child
  cycle; `archived_at` on parent for teacher-side hiding;
  per-student `completed_at` on child.
- **Content copy**: migration 000022 — v1 `question_assignments`
  + `lesson_assignments` + junctions copied in. Practice-test
  rows (jerry-rigged in v1 via `filter_criteria.type =
  'practice_test'`) are translated to `assignment_type =
  'practice_test'` with `practice_test_id` pulled out of the
  json. V1 `completed_at` on the parent maps to `archived_at`
  on the v2 parent. V1 UUIDs are preserved; `ON CONFLICT (id)
  DO NOTHING` makes the migration idempotent.
- **Student UI**: `/assignments` (list), `/assignments/[id]`
  (detail, branches on type). Dashboard gets an Assignments
  panel. Start/Continue button creates a `practice_sessions`
  row with the assignment's `question_ids` and redirects to
  `/practice/s/<sid>/0`.
- **Teacher UI**: `/tutor/assignments` (list with per-
  assignment completion rollup), `/tutor/assignments/new`
  (one form, three type-specific field groups),
  `/tutor/assignments/[id]` (per-student progress table).
  `createAssignment` Server Action handles all three types.
- **Tutor student-detail wiring**: each student's page now
  shows their active assignments with a shortcut to `/new`.

---

## What's left (Phase 3 tail)

Not blocking; can land as one-off commits or roll into Phase 4:

1. **Auto-set per-student `completed_at`**. Today it's never
   set: the student panel treats null completed_at as "not
   done", and the teacher's progress rollup likewise. For
   `questions` assignments, set `completed_at` when all
   question IDs have a corresponding attempt (could live on
   the Server Action that submits an answer, or a Postgres
   trigger). For `practice_test` it would fire when the
   attempt is marked `status='completed'`. Lessons: when
   the lesson player exists.
2. **Teacher archive/un-archive UI**. The column and RLS are
   in place; just needs a button on
   `/tutor/assignments/[id]` and the Server Action to flip
   it. One-shot.
3. **Student completed-assignment view**. Today completed
   assignments sink to the bottom of the list but there's no
   separate section. Nice-to-have.
4. **Legacy `question_assignments` / `lesson_assignments`
   are not touched yet**. They'll drop in Phase 6 along with
   the rest of the legacy tree. Until then, the legacy app
   continues to read/write them; v2 reads only. Future
   teacher-side creation flows in legacy should be
   considered frozen — if the legacy tree ever re-enables
   assignment creation, it should dual-write to v2 or we
   accept drift.

---

## Other pending items (not Phase 3)

- **Deploy to production**: Phase 2 RLS changes are parked.
  Deploy plan is in `docs/runbook.md` under "Deploying the
  Phase 2 step 9 branch (parked)." User will decide timing.
- **Performance page score distribution**: still reads from
  v1 `practice_test_attempts` (historical data). Will read
  from both v1 + v2 once v2 practice tests have completed
  attempts.

---

## Known limitations to flag for users

- **Practice-test launch for `ui_version='next'` users**
  still lives at `/practice-test` in the legacy tree. For
  users on the new tree, launching from an assignment hits
  the `[...slug]` catch-all. Internal testers only right
  now, so acceptable — but moving the practice-test flow to
  the new tree is a precondition for flipping more users to
  `next`.
- **Lesson player for `ui_version='next'` users** likewise
  lives at `/lessons/[id]` in the legacy tree — same
  caveat. Lessons aren't shipped yet so this is theoretical.

---

## Dev environment

- **Supabase dev project**: `ikzhizgsawzjpuuznfid` (studyworks-dev)
- **Access**: via Supabase MCP connector (NOT direct curl — the
  sandbox network allowlist blocks api.supabase.com)
- **Seed data**: 4 users (admin/teacher/student1/student2), 8
  questions_v2, 1 practice test v2, 6 attempts. Seed script at
  `scripts/dev-seed-practice-test-v2.sql`.
- **Auth credentials**: all `devseed123`. Emails:
  admin@test.studyworks, teacher@test.studyworks,
  student1@test.studyworks, student2@test.studyworks
- **Vercel preview**: pointed at dev DB. Redeploy triggers on push.
- **Known dev-DB quirk**: auth.users rows need token columns
  set to empty strings (not NULL) and auth.identities rows created
  manually. The seed script handles this but document it for
  anyone adding new test users.

---

## Key files

- `docs/architecture-plan.md` — master plan, Phase 3 in §4
- `docs/runbook.md` — operational, includes deploy plan
- `CLAUDE.md` — auto-loaded framing
- `supabase/migrations/20240101000014-000022` — Phases 2+3
- `scripts/dev-seed-practice-test-v2.sql` — dev DB seed
- `app/next/(admin)/admin/` — admin carve-outs
- `app/next/(student)/practice/` — v2-wired practice flow
- `app/next/(student)/assignments/` — student assignments UI (new)
- `app/next/(tutor)/tutor/` — tutor dashboard + student detail
- `app/next/(tutor)/tutor/assignments/` — teacher assignments UI (new)
- `lib/practice/` — shared practice components + actions

---

## Technique notes from this session

- **RLS test pattern**: impersonate a role in a transaction with
  `PERFORM set_config('request.jwt.claims', ...)` then
  `SET LOCAL ROLE authenticated`, run SELECTs, `ROLLBACK`.
  Useful for verifying RLS end-to-end without a real session.
  See the `BEGIN ... ROLLBACK` blocks in this session's
  transcripts for examples.
- **Schema-test pattern**: exercise a CHECK constraint by
  wrapping the INSERT in `BEGIN ... EXCEPTION WHEN
  check_violation THEN RAISE NOTICE ... END;` inside a DO
  block, then cleanup. See the partial-CHECK verification
  run after migration 000021.
- **Content-copy verification**: seed synthetic v1 rows in
  a transaction, run the copy INSERTs, SELECT the v2 shape,
  `ROLLBACK`. Validates the mapping without polluting dev.
