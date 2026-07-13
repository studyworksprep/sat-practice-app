# Studyworks database operations

> **Status: Living document.** Last verified against code: 2026-07-12.

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
`class_enrollments`, `class_invites` tables, the unused
`profile_cards` view, and the 11 `stg_*` staging tables.

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

**Entitlements switchover (`entitlements`, §1.5).** The licensing
resolver `has_plan()`/`effective_plan()` is built and parity-verified
against today's access, but the live enforcement path (`proxy.js`,
`lib/subscription.js`) is NOT switched onto it yet — that's gated by the
`feature_flags` row `entitlements_gate` (currently `off`). Flipping it to
`on` activates the resolver (and the owner-chosen live-derived sponsored
policy: roster removal revokes access immediately). Flip only after
re-verifying parity and running the e2e auth specs.

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
