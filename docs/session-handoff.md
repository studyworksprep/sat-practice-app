# Session handoff — post-prod-deploy, continuing Phase 4

**For:** the next Claude Code session.
**From:** the session that shipped Phase 2 + Phase 3 + most of Phase 4
to production on Monday.
**Delete this file** when the "what's in flight" list below is
either done or re-scoped into a newer handoff.

---

## TL;DR

The parked Phase 2 branch landed on production this morning. Along
with it went everything that accumulated on the working branch
since — all of Phase 3 (assignment unification, auto-completion,
grants parity) and most of Phase 4 (primitives, QuestionRenderer,
error boundaries, profile_cards view). Two post-deploy hotfixes
landed same-day: migration 000015's route_code case-mapping bug and
migration 000024 restoring the question_status → questions FK that
000017 dropped. Prod is healthy and the owner has eyes on it.

Current branch: `claude/continue-architecture-migration-SikEX`.
Working tree clean. 25+ commits beyond what was on `main` at start
of the prior session; everything is now merged to main.

The near-term work target the user named: **question-rendering
quality upgrades** in the new tree (math rendering, two-column
reading layout, Desmos calculator). Groundwork is in place
(`<QuestionRenderer>` extracted); the missing pieces are porting /
upgrading the concrete render features.

---

## What's on prod after today's deploy

### Migrations applied (in order)
| # | What |
|---|---|
| 000011 | Role checks → JWT helpers (`is_admin`/`is_teacher`/`is_manager`) |
| 000012 | Visibility policies → `can_view()` on 7 tables |
| 000013 | Drop 3 bridge RPCs, add `student_practice_stats` view |
| 000014 | `practice_tests_v2` schema |
| 000015 | Copy v1 practice-test content → v2 (**fixed** post-deploy) |
| 000016 | Per-student v1→v2 history import RPC |
| 000017 | Drop v1 attempts FKs |
| 000018 | Grants parity for `authenticated` (no-op on prod) |
| 000019 | Phase 3 indexes + audit columns |
| 000020 | Drop `answer_choice_tags` + legacy UI that referenced them |
| 000021 | `assignments_v2` schema |
| 000022 | Copy v1 assignments → v2 |
| 000023 | `profile_cards` view + parameterized `can_view_from` |
| 000024 | Restore `question_status_question_id_fkey` (hotfix) |

### New-tree code now live (behind `ui_version='next'`)
- `app/next/` parallel tree — student, tutor, admin trees all wired
  to v2 tables.
- Phase 4 primitives: `lib/ui/{StatCard, AssignmentTypeBadge,
  Button, Card, Table, QuestionRenderer, ErrorScreen}`.
- Error boundaries at every top-level app/next segment.
- `/tutor/review/[questionId]` as the first consumer of
  `<QuestionRenderer mode="teacher">`.

### Verified on prod
- Migrations 000011–000013 policies resolved correctly
  (7 visibility policies use `can_view()`; 0 inline role subqueries
  left; 3 bridge RPCs dropped; `student_practice_stats` view exists).
- Manager profile visibility expanded via `can_view()` transitive
  path (000012 expansion).
- `profile_cards` view returns name + role with symmetric
  visibility (student ↔ teacher).

---

## What's in flight

### Immediate priority — question-rendering quality
The user's stated goal: match prod's quality for math/reading, with
two-column layout and Desmos minimize behavior. Current
`<QuestionRenderer>` renders stim/stem/options/rationale in a single
column with no math rendering.

Gap, ordered by impact:

**Tier 1 (real blockers):**
1. Math rendering. Prod uses client-side MathJax via
   `components/HtmlBlock.js`. Architectural upgrade worth pursuing:
   pre-render math with KaTeX at content-authoring time, store the
   rendered HTML on questions_v2 — zero client math bundle. See
   the §3.4 / Tier 3 discussion in the prior session's transcript.
2. Two-column reading layout (passage left, stem+options right)
   for domains `EOI / INI / CAS / SEC`.
3. Desmos panel on the left for math domains (`H / P / S / Q`).
   Port `DesmosPanel` from `app/practice/[questionId]/page.js` into
   its own `lib/ui/DesmosPanel.js` client island.

**Tier 2:** reference sheet modal, image max-width wrapper, concept
tag chips.

**Tier 3 (policy calls):** flashcards modal, question notes,
retry-until-correct semantics.

Architectural nudges from the prior conversation:
- Build `<RichContent html={...} />` in `lib/ui/` as the single
  primitive that handles HTML rendering + math + image sizing +
  (future) watermarking.
- Make two-column layout a shell component (`<QuestionLayout
  mode="reading|math|single">`) rather than embedded in
  QuestionRenderer. Keeps the renderer layout-neutral.
- Desmos stays its own client island — don't fold it into
  QuestionRenderer.

### Deferred but known

- **Manager access to 6 legacy `/api/teacher/student/[studentId]/*`
  routes returns Forbidden.** These pre-RLS access checks special-
  case teachers+managers and do a direct
  `teacher_student_assignments(teacher_id=me)` lookup that managers
  can never satisfy. Two fix options: replace with a `can_view` RPC
  call (~2 lines each, 6 files) OR move managers to
  `ui_version='next'` where the new-tree pages work. User said it's
  acceptable for a few days; flagged for cleanup.

- **Assignment archive toggle** (teacher-side "hide completed
  assignments") — schema has `archived_at`; UI to set it hasn't been
  built.

- **`upsert_question_status_after_attempt` RPC** — legacy-only,
  new tree doesn't call it, missing on dev. Remove when the legacy
  tree retires in Phase 6.

- **`question_status` as a legacy-only concept** — the FK restored
  in 000024 is load-bearing for legacy PostgREST embeds; the table
  and its FK retire in Phase 6. New tree reads per-question state
  from `attempts` directly. See the prior session's
  "Where will v2 store status info?" discussion — the long-term
  shape is: derived state from `attempts`; a new small
  `question_flags_v2` only for user-authored flags (marked-for-
  review, notes).

---

## Dev environment

- **Supabase dev project**: `ikzhizgsawzjpuuznfid` (studyworks-dev)
- **Supabase prod project**: `noqtadytxyslkoetchrs` (SAT Question Bank)
- **MCP access**: both projects are in the MCP list. For prod:
  read-only SELECTs only unless explicitly told otherwise; no
  `apply_migration`/INSERT/UPDATE without a specific green light.
  Data is real (students, teachers, their practice history).
- **Seed scripts**:
  - `scripts/dev-seed-practice-test-v2.sql` — base seed (users,
    questions, 1 practice test).
  - `scripts/dev-seed-ui-preview.sql` — Phase 4 preview content
    (5 students, 5 assignments, lesson, attempts, score conversion,
    learnability, teacher codes, flagged questions).
- **Auth credentials** (dev only): all passwords `devseed123`.
  Emails `{admin,teacher,student1..5}@test.studyworks`.
- **Vercel preview** points at dev DB; redeploys on push.
- **The kill switch**: `feature_flags.force_ui_version = 'legacy'`
  pins everyone to the legacy tree in ~5s. Does NOT undo schema
  changes; those need targeted policy/function reverts.

---

## Pattern reminders for the next session

These patterns came up repeatedly this session; next session can
start with them rather than re-deriving.

- **Inspecting prod under RLS**: impersonate a role in a dev
  transaction with `PERFORM set_config('request.jwt.claims', ...)`
  then `SET LOCAL ROLE authenticated`, run SELECTs, `ROLLBACK`. In
  prod, just set the JWT claims and read — no transaction wrapper
  needed for read-only checks.
- **Verifying a migration landed**: queries against `pg_policies`,
  `pg_proc`, `pg_constraint`, and `information_schema.columns`
  together catch ~all shapes of "did the policy/helper/view/FK
  actually land."
- **Content-copy verification**: seed synthetic v1 rows in a
  transaction, run the INSERT, SELECT the v2 shape, `ROLLBACK`.
  Validates the mapping without polluting the DB.
- **PostgREST nudge after schema change**: `NOTIFY pgrst, 'reload
  schema';` inside the migration. Supabase PostgREST listens.

---

## Key files

- `docs/architecture-plan.md` — master plan; §3.8 (visibility)
  and §4 (phase plan) are the hot paths.
- `docs/runbook.md` — operational; updated this session to reflect
  the Phase 2 branch deploy being done.
- `CLAUDE.md` — auto-loaded framing.
- `supabase/migrations/20240101000011…000024` — the deployed set.
- `scripts/dev-seed-*.sql` — dev seed scripts.
- `lib/ui/` — Phase 4 primitives.
- `lib/practice/PracticeInteractive.js` — session-shell that
  delegates rendering to QuestionRenderer.
- `app/next/(tutor)/tutor/review/[questionId]/page.js` — first
  QuestionRenderer teacher-mode consumer; pattern reference for
  future review/inspection pages.
