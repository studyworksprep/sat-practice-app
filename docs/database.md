# Studyworks database operations

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

Every schema change is a committed file under `supabase/migrations/`.
Files are timestamped (`YYYYMMDDHHMMSS_description.sql`) so their order
of application is deterministic.

Reset a local database and replay every migration from scratch:

```
supabase db reset
```

Push pending migrations to the linked remote project:

```
supabase db push
```

Create a new migration scaffold:

```
supabase migration new <description-in-kebab-case>
```

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

None as of June 2026. The original drift items from Phase 1 are all
resolved:

- The seven `practice_test_*` tables are committed to migrations and
  the v1 originals are archived to `_legacy`; the live cluster
  (`practice_tests_v2`, `practice_test_modules_v2`,
  `practice_test_module_items_v2`, `practice_test_attempts_v2`,
  `practice_test_module_attempts_v2`,
  `practice_test_item_attempts_v2`, `practice_test_routing_rules`) is
  what production reads.
- The `get_question_neighbors` RPC was dropped as part of the v1
  function audit (unreachable from app code, referenced retired
  tables).
- `question_availability` is still in `public` with RLS enabled and
  no policies; pending the §3 Phase 3 review.

## Safe service-role usage

Every service-role client (`createServiceClient()` or the new
`requireServiceRole('reason')` helper in `lib/api/auth.js`) bypasses RLS.
Before using one, ask:

1. **Can this query run as the authenticated user against RLS?** If yes,
   do that instead. The RLS-scoped client is the default.
2. **If not, why?** The only valid reasons are: cross-user aggregation
   for admin analytics, webhook handlers that run as the system, and
   internal cleanup jobs. Document the reason inline.
3. **Does the route still gate on a role check?** If the service role
   is bypassing RLS *and* the route has no application-layer role
   check, any authed user can see any row. That's a data leak.

The Phase 2 refactor routes every bypass through `requireServiceRole('reason')`
so every call site is audit-greppable and every reason is logged.

## Back-test helpers

`scripts/can_view_backtest.mjs` compares the new `can_view(target)`
function against the current helper stack. Run it against a dev database
seeded from a prod snapshot before Phase 2 starts rewriting RLS policies.
Expected output is "zero diffs".
