# Session handoff — Phase 3 schema simplification

**For:** the next Claude Code session continuing this work.
**From:** the session that completed Phase 2 and started Phase 3.
**Delete this file** when Phase 3 is complete.

---

## TL;DR

Phase 2 is done. The new `app/next/` tree is fully wired to v2
tables. Phase 3 (schema simplification) is in progress — indexes,
audit columns, and tag-table cleanup are landed. The big remaining
item is assignment-model unification.

---

## Branch

`claude/continue-architecture-migration-BETbL` — 24 commits, all
pushed. Everything builds and deploys via Vercel preview.

---

## What's done in Phase 3

- **Indexes**: `profiles(role)`, `attempts(user_id, question_id)`,
  `question_status(question_id)` — migration 000019
- **Audit columns**: `created_by`, `updated_by`, `deleted_at`,
  `updated_at` (with auto-trigger) on `practice_tests_v2`,
  `practice_test_modules_v2`, `practice_test_module_items_v2`,
  `questions_v2` — migration 000019
- **`question_availability`**: marked for Phase 6 deletion (one
  legacy route uses it; new tree doesn't need it)
- **`answer_choice_tags` + `option_answer_choice_tags`**: dropped
  entirely (migration 000020). ~5 rows in prod, none useful.
- **Options normalization** (`questions_v2.options` → child table):
  explicitly skipped. Options are small (4-5 per question), bounded,
  always read with the parent, never queried independently. The
  JSONB-inline approach stays. Documented in commit message.
- **Grants parity**: migration 000018 grants CRUD on all public
  tables to `authenticated` + sets `ALTER DEFAULT PRIVILEGES` so
  future tables are automatically covered.

## What's next — assignment unification

### The decision (confirmed by user)

The user wants a **type-discriminated unified assignments table**.
The product reasoning:

> "The panel that says 'Assignments' on a student's dashboard should
> feel consistent: that's where the assignment appears. It would be
> cleaner if the panel just queries one table, identifies the type,
> and renders whatever visual element belongs to that assignment type."

Assignment types to support from day one:
- `questions` — a set of question IDs (replaces `question_assignments`)
- `lesson` — a single lesson (replaces `lesson_assignments`, not yet
  implemented in the app but the schema exists)
- `practice_test` — a practice test to take (currently supported in
  the legacy system)

### Current schema (v1)

**question_assignments:**
- id, teacher_id, title, description, due_date, filter_criteria
  (jsonb), question_ids (text[]), created_at, completed_at

**question_assignment_students:**
- assignment_id, student_id, created_at

**lesson_assignments:**
- id, teacher_id, lesson_id (FK → lessons), due_date, created_at

**lesson_assignment_students:**
- assignment_id, student_id, created_at

### Proposed v2 schema (needs user confirmation)

```sql
assignments_v2 (
  id              uuid PK default gen_random_uuid(),
  teacher_id      uuid NOT NULL,
  assignment_type text NOT NULL CHECK (assignment_type IN
                    ('questions', 'lesson', 'practice_test')),
  title           text,
  description     text,
  due_date        timestamptz,
  completed_at    timestamptz,

  -- Type-specific (nullable, only relevant for their type):
  question_ids    uuid[],          -- for 'questions'
  filter_criteria jsonb,           -- for 'questions'
  lesson_id       uuid,            -- for 'lesson' (FK → lessons)
  practice_test_id uuid,           -- for 'practice_test' (FK → practice_tests_v2)

  -- Audit:
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid,
  updated_by      uuid,
  deleted_at      timestamptz
);

assignment_students_v2 (
  assignment_id   uuid NOT NULL FK → assignments_v2 ON DELETE CASCADE,
  student_id      uuid NOT NULL,
  completed_at    timestamptz,     -- per-student completion tracking
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (assignment_id, student_id)
);
```

RLS pattern: same as other v2 tables.
- SELECT: `can_view()` on the teacher_id (teachers see their own;
  managers see their teachers'; admins see all) + students see
  assignments they're in via the child table
- INSERT/UPDATE: `is_teacher()` + `teacher_id = auth.uid()`
- DELETE: admin only

### Work items for the assignment unification

1. Schema migration (create tables + RLS + grants + indexes)
2. Content copy from `question_assignments` → `assignments_v2`
3. Build the unified student assignments panel in the new tree
4. Build the teacher assignment-creation flow (Server Actions)
5. Wire the tutor student-detail page to show assignments

### Design questions still open

- Should `question_ids` be `uuid[]` (matching questions_v2.id) or
  keep the v1 `text[]` shape? Recommend `uuid[]` for consistency.
- Should `completed_at` live on the parent (whole assignment done)
  AND on assignment_students (per-student completion)? The legacy
  schema has it on the parent only. Per-student is more useful for
  "3 of 5 students have completed this."
- The lesson assignment system isn't implemented yet (lessons are
  being crafted). Should the v2 schema include the `lesson` type
  from day one (just the column, no UI yet)?

---

## Other pending items (not Phase 3)

- **Practice flow state-carry-over fix**: a `key` prop fix was
  pushed (commit 57dd0ac) but user hadn't confirmed it resolved
  the "all questions show answered" bug. Ask for status.
- **Deploy to production**: Phase 2 RLS changes are parked. Deploy
  plan is in `docs/runbook.md` under "Deploying the Phase 2 step 9
  branch (parked)." User will decide timing.
- **Performance page score distribution**: still reads from v1
  `practice_test_attempts` (historical data). Will read from both
  v1 + v2 once v2 practice tests have completed attempts.

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
- **Vercel preview**: pointed at dev DB (user switched env vars
  to Preview scope). Redeploy triggers on push.
- **Known dev-DB quirk**: auth.users rows need token columns
  set to empty strings (not NULL) and auth.identities rows created
  manually. The seed script handles this but document it for
  anyone adding new test users.

---

## Key files

- `docs/architecture-plan.md` — master plan, Phase 3 in §4
- `docs/runbook.md` — operational, includes deploy plan
- `CLAUDE.md` — auto-loaded framing (updated this session)
- `supabase/migrations/20240101000014-000020` — this session's migrations
- `scripts/dev-seed-practice-test-v2.sql` — dev DB seed
- `app/next/(admin)/admin/` — all admin carve-outs
- `app/next/(student)/practice/` — v2-wired practice flow
- `app/next/(tutor)/tutor/` — tutor dashboard + student detail
- `lib/practice/` — shared practice components + actions
