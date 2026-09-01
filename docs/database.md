# Studyworks database operations

> **Status: Living document.** Last verified against code: 2026-07-12
> (question-bank write policies re-verified against production
> 2026-09-01).

Short runbook for anything that touches the Supabase database.

## Local dev

Start Supabase locally (first time takes a few minutes to pull Docker images):

```
supabase start
```

This boots Postgres, Auth, Storage, and Studio locally. The ports come from
`supabase/config.toml`:

- Postgres: `localhost:54322`
- Studio UI: `http://localhost:54323`
- Mailcatcher (Inbucket): `http://localhost:54324`

Point your `.env.local` at the local instance for dev:

```
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<printed by `supabase status`>
SUPABASE_SERVICE_ROLE_KEY=<printed by `supabase status`>
```

## Applying migrations

**Read `supabase/migrations/README.md` before touching this
workflow.** The directory is an accurate *historical record* of
schema changes, but it is NOT a replayable migration chain: 42 of the
files have no timestamp prefix (the CLI skips them), two filename
collisions exist, and production's migration-tracking table does not
correspond to the local filenames.

Every schema change is a committed file under `supabase/migrations/`.
New files are timestamped (`YYYYMMDDHHMMSS_description.sql`); the
file is the reviewable artifact, and the Supabase MCP
`apply_migration` call (which records its own version in the tracking
table) is the source of truth for what production has applied.

Reset a local database and replay the timestamped migrations (see the
README caveats — this is not guaranteed to reproduce production
schema):

```
supabase db reset
```

**Do NOT run `supabase db push` (or `migration up`) against
production.** The CLI would treat over a hundred already-applied
files as pending and attempt to re-apply years of DDL. A baseline
reset that fixes this is scheduled (see
`docs/upgrade-plan-2026-07.md` P0.7).

Create a new migration scaffold:

```
supabase migration new <description-in-kebab-case>
```

After applying any migration, regenerate `lib/types/database.ts` via
the Supabase MCP `generate_typescript_types` tool (or
`supabase gen types typescript`).

## Writing a migration

Every migration file should be:

- **Idempotent.** Use `create table if not exists`, `create or replace function`,
  `drop policy if exists` before `create policy`, etc., so replaying is safe.
- **RLS-conscious.** Any new table gets `alter table ... enable row level security`
  in the same migration, even if policies come in a follow-up.
- **Self-documenting.** A short header comment explaining what the migration
  does and why future-you will thank current-you.
- **v2 surface only.** Schema changes target the live tables
  (`questions_v2`, `assignments_v2`, the `practice_test_*_v2` cluster,
  etc.). Anything in the `_legacy` schema is historical artifact and
  should not be referenced by new code or migrations except for
  archival operations.

## Known drift

The original "schema in prod but not in migrations" drift items from
Phase 1 are resolved:

- The seven `practice_test_*` tables are committed to migrations and
  the v1 originals are archived to `_legacy`; the live cluster
  (`practice_tests_v2`, `practice_test_modules_v2`,
  `practice_test_module_items_v2`, `practice_test_attempts_v2`,
  `practice_test_module_attempts_v2`,
  `practice_test_item_attempts_v2`, `practice_test_routing_rules`) is
  what production reads.
- The `get_question_neighbors` RPC was dropped
  (`20240101000031_drop_get_question_neighbors.sql`).
- `question_availability` is still in `public` with RLS enabled and a
  permissive public-read SELECT policy (from
  `add_performance_optimizations.sql`); it has no app-code consumers
  and is pending review for retirement.

One structural drift mode remains, documented and scheduled for a
fix: the migrations directory does not correspond to production's
migration-tracking table (verified 2026-07-12 — see
`supabase/migrations/README.md`). Until the baseline reset lands,
treat the directory as an audit log, apply new migrations via the
MCP `apply_migration` tool, and never `db push` to production. Also
pending from that audit: dropping the vestigial `classes`,
`class_enrollments`, `class_invites` tables and the unused
`profile_cards` view. (The 11 `stg_*` staging tables and their
`stg_clear_practice_test` helper were dropped on dev + prod
2026-08-10 — `20260810131605_drop_stg_staging_tables.sql` — after
the owner confirmed they were no longer in use; they had RLS
disabled and were flagged by the security advisor.)

## Scheduled jobs

**Mastery snapshots (`skill_mastery_snapshots`, upgrade plan §1.1).**
The per-skill mastery time series is populated by
`public.snapshot_all_skill_mastery(current_date)` — one row per
(student, test_type, domain, skill) as of the given date. History was
seeded once via `public.backfill_skill_mastery_snapshots('sat')`
(activity-day resolution). The mastery formula lives in
`public.compute_mastery_score` (SQL) and `lib/mastery.ts`
(`masteryFromAggregates`), pinned to the shared vector
`lib/mastery.fixtures.json` — change all three together.

The nightly trigger is **not yet scheduled**: `pg_cron` is available
but not installed in the production project (verified 2026-07-13). To
enable, install the extension and schedule:

```sql
select cron.schedule('nightly-mastery', '15 7 * * *',
  $$ select public.snapshot_all_skill_mastery(current_date) $$);
```

(Alternatively, a Vercel cron can hit an authenticated endpoint that
calls the function via the service role.) Until then, run
`snapshot_all_skill_mastery(current_date)` on demand to refresh.

**Item statistics (`item_stats`, §1.7).** Empirical per-question stats
(p-value, distractor distribution, discrimination) are recomputed by
`public.refresh_item_stats()` — the denormalized
`questions_v2.attempt_count` is stale and must NOT be used for p-values.
Not scheduled; run on demand (or wire alongside the nightly mastery
job). The mis-key report is the view `public.item_miskey_audit`
(staff-only) — review before changing any answer key.

**Live per-question stats (`get_question_stats`, 2026-08-19).** The
staff "Stats" modal on the question review page
(`lib/practice/QuestionStatsButton.tsx`, fetched lazily on open via
`lib/practice/question-stats-actions.ts`) calls
`public.get_question_stats(question_id)` — SECURITY DEFINER, gated on
`is_teacher()`, aggregates only. It recomputes on demand for one
question over practice **and** test attempts (unlike `item_stats`,
which is a practice-only snapshot) and returns two cuts: `all`
(bank-wide — the reason it needs SECURITY DEFINER; the `attempts`
SELECT policy is roster-scoped so a manager querying directly would
silently get "my roster" numbers) and `roster` (restricted to
`list_visible_users()`, i.e. what the caller can already see under
RLS). ~60 ms on the most-attempted question in production. The app
gate (`QUESTION_STATS_ROLES` in `lib/practice/question-stats.ts`) is
teacher + manager + admin as of 2026-08-20, matching the SQL gate —
teachers see bank-wide aggregates their roster-scoped row access
doesn't grant, the same deliberate exposure as `item_stats`. Internal
helper `public.question_stats_cut(uuid, uuid[])` has execute revoked
from every app role.

**Hardest/easiest ranking (`question_accuracy_ranking`, 2026-08-19).**
`/admin/performance` ranks questions via
`public.question_accuracy_ranking(min_students)` — first-attempt
accuracy per published, non-broken question, SECURITY INVOKER (RLS on
`attempts` scopes it; the admin page sees the whole bank). ~170 ms
warm in production. It replaced the last reader of
`questions_v2.attempt_count` / `correct_count`; those columns are now
commented `LEGACY — unmaintained` and are slated to be dropped in the
Phase 3 `questions_v2` normalization. Do not read them.

**Entitlements switchover (`entitlements`, §1.5).** The licensing
resolver `has_plan()`/`effective_plan()` is **live**: the
`entitlements_gate` flag was flipped `on` in production 2026-07-17
(after re-verifying parity — 0 lose / 0 gain across 78 users — and a
33/33 e2e auth run against dev soaking `on`). The enforcement path
(`proxy.js`, `lib/subscription.js`) consults the resolver, which also
activates the owner-chosen live-derived sponsored policy: roster
removal revokes access immediately. Resolver errors fall back to the
legacy verdict. Rollback is `update feature_flags set value='off'
where key='entitlements_gate'` (propagates within the 30s cache).

## Who may write the question bank

`questions_v2` write policies, as of 2026-09-01:

| Policy | Command | Predicate |
| --- | --- | --- |
| `questions_v2_admin_all` | ALL | `is_admin()` — `app_metadata.role = 'admin'` |
| `questions_v2_manager_update` | UPDATE | `is_manager()` — role in (`manager`, `admin`) |
| `questions_v2_select_all` | SELECT | any authenticated user |
| `demo_readonly_*` | INSERT/UPDATE/DELETE | restrictive; `not is_demo()` |

So managers may **correct** existing questions but not create or
delete them; creating and deleting stays admin-only.

`questions_v2_manager_update`
(`20260901120000_questions_v2_manager_update_policy.sql`) closes a
gap that made the Broken panel's "Save corrections" a silent no-op
for managers: the app gated the action on
`requireRole(['manager', 'admin'])` while the DB granted writes only
to `is_admin()`, so a manager's UPDATE matched no policy and hit
zero rows. **Postgres does not raise on that, and PostgREST returns
204 with `error: null`** — the Server Action saw success and told
the manager the correction was saved.

The general lesson, for any app-layer role gate that fronts a write:
`.update()` alone cannot tell "wrote the row" from "RLS filtered it
away". Chain `.select('id')` and fail when the result is empty —
`lib/practice/broken-actions.js` does this on both of its writes.

## Safe service-role usage

Every service-role client (`createServiceClient()` from
`lib/supabase/server.ts`, or the `requireServiceRole('reason')` helper
in `lib/api/auth.ts`) bypasses RLS. Before using one, ask:

1. **Can this query run as the authenticated user against RLS?** If yes,
   do that instead. The RLS-scoped client is the default.
2. **If not, why?** The only valid reasons are: cross-user aggregation
   for admin analytics, webhook handlers that run as the system, and
   internal cleanup jobs. Document the reason inline.
3. **Does the route still gate on a role check?** If the service role
   is bypassing RLS *and* the route has no application-layer role
   check, any authed user can see any row. That's a data leak.

Authenticated routes go through `requireServiceRole('reason')`, which
logs a structured `service_role_bypass` event (with `reason`,
`user_id`, `caller_role`) on every call. A handful of system-context
call sites have no authenticated caller and use `createServiceClient()`
directly instead: the Stripe webhook, the signup route, the demo
auto-login route (`app/auth/demo/[persona]`), the lessonworks sync
cron, and the external/public API-key routes. Those API-key routes
(`app/api/external/*`, `app/api/public/*`) gate access via
`requireExternalApiAccess` in `lib/externalAuth.ts` — a rate limit
plus a constant-time (`timingSafeEqual`) API-key check — since the
proxy skips session auth for them. Either way, every call site is
audit-greppable.

## Question pools and import batches

Since 2026-08-23 (`20260823140000_question_batches_and_pool.sql`) the
question bank has two visibility pools:

- `questions_v2.pool = 'standard'` — the default bank. All
  pre-existing rows.
- `pool = 'opt_in'` — externally sourced import batches (e.g. the
  March 2026 SAT reconstruction set). Served to a student **only**
  when they select the batch in the practice launcher's "Extra
  practice sets" section, or through explicit by-id selection
  (quick-find click-through, lesson packs, admin surfaces).

`questions_v2.batch_id` → `question_batches`, which carries the
batch's provenance (`source`, `label`, `administration_date`) for
trend analysis across administrations. `published_question_batches`
is the launcher's rollup view; `published_question_taxonomy` counts
the standard pool only.

**Invariant for new code: every filter-driven `questions_v2`
selector (anything that picks questions by taxonomy/difficulty
rather than by explicit id list) must gate on `pool = 'standard'`
unless it deliberately implements batch opt-in.** Current gated
sites: the practice launcher, quick-find search, the welcome
diagnostic, Today drills, the review-queue skill leg, the
mid-session difficulty detour, tutor assignment generation, and
tutor training practice. Attempt-driven surfaces (weak-questions
drill, review-queue question leg) are deliberately unfiltered — they
only resurface questions the student already answered.

Import mechanics: importers stamp `source` + `source_external_id`
per question (now enforced unique where non-null, so a re-run
conflicts instead of silently duplicating — upsert on that pair),
point `batch_id` at the batch row, and copy the batch's `pool`. Promoting a batch into the standard bank means
updating `question_batches.pool` **and** its questions' `pool`.

## Back-test helpers (historical)

`scripts/can_view_backtest.mjs` compares the `can_view(target)`
function against the pre-refactor helper stack
(`teacher_can_view_student`, manager assignments, admin check, self
check). It was the precondition gate for the Phase 2 RLS rewrite,
which has since shipped — `can_view` landed in
`20240101000004_create_can_view_function.sql` and the visibility
policies switched onto it in
`20240101000012_replace_visibility_policies_with_can_view.sql`. The
script is read-only and kept for regression use; expected output is
"zero diffs".
