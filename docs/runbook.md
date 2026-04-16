# Studyworks runbook

Short operational playbook. Expand as new scenarios come up.

## Parallel-build kill switch

See `docs/architecture-plan.md` §3.6. Two tiers of control over which
UI tree a user sees:

### Flip one user

```sql
-- Internal testing
update public.profiles set ui_version = 'next' where id = '<user-uuid>';

-- Rollback
update public.profiles set ui_version = 'legacy' where id = '<user-uuid>';
```

The JWT `app_metadata.ui_version` is synced automatically by a trigger.
The new value takes effect on the user's next auth-refresh round-trip
(usually within a minute; sign-out + sign-in applies it immediately).

### Force everyone one way (kill switch)

```sql
-- Pin every user to the old tree. Use in a rollback.
update public.feature_flags set value = 'legacy' where key = 'force_ui_version';

-- Pin every user to the new tree. Use during Phase 6 verification.
update public.feature_flags set value = 'next'   where key = 'force_ui_version';

-- Let the per-user flag decide. Default behavior.
update public.feature_flags set value = null     where key = 'force_ui_version';
```

The Next.js proxy (formerly middleware, renamed in Next 16) caches the
flag for ~5 seconds per function instance. Worst-case lag from a flip
to user-visible effect is ~5 seconds plus any cold-start time.

## Finding a bug report

A student reports an error. Steps, in order:

1. **Check Sentry** (Phase 1 deliverable) for the user id or request id
   they pasted. If the stack trace is there, you have everything.
2. **Check structured logs** (Phase 1 deliverable via `lib/api/logger.js`)
   for the request id.
3. **Check `profiles.ui_version`** for the user. If it's `next`, the bug
   may be in the rebuild tree. If it's `legacy`, the bug is in the
   current product.
4. **Try to reproduce on your own account** with the same `ui_version`.
5. **If you can't reproduce**, flip a copy of the user's role/permissions
   (never reuse their actual account) and retry.

## Rolling back a deploy

Vercel keeps the last N deployments. Promote the previous working
deployment back to production via the Vercel dashboard.

If the bug is content-related (a bad question, a broken rationale), the
fix is in the database, not the deploy. Don't roll back the build unless
the issue is code.

## Deploying the Phase 2 step 9 branch (parked)

The branch `claude/continue-architecture-migration-BETbL` carries five
commits' worth of RLS work from Phase 2 step 9. It's safe to merge but
has not been deployed yet pending a decision on rollout timing.

What's on it (all already applied to dev DB):

| Commit | Change | Risk |
|---|---|---|
| Type B | 30 role checks `profiles` → JWT helpers (`is_admin`/`is_manager`/`is_teacher`) | Low — no behavior change |
| Type A | 7 tables: visibility SELECT policies → `can_view()` | Low — expansion only, no one loses access |
| Bridge RPCs + stats view | Drops 3 RPCs, adds `student_practice_stats` view, reverts tutor pages to plain queries | Low — no callers for dropped RPCs |
| Temp cleanup | Deletes `scripts/tmp-dev-replay.sql` and `docs/session-handoff.md` | None |
| Dev-db-query cleanup | Deletes `scripts/dev-db-query.mjs` | None |

Not on this branch (intentionally deferred):
- Enabling RLS on the existing `practice_test_*` and v1 question tables.
  The plan is to create new v2 tables with RLS designed in, copy data,
  and let the legacy tree keep using the old tables until the whole
  legacy tree is retired. See the §3.6 parallel-build discipline
  extended to the schema layer.

Deploy mechanics:
- Migrations: `supabase db push` from a dev machine linked to prod.
- Frontend: Vercel auto-deploys on merge to `main`.
- CI: lint + build only; no RLS regression tests.

Service-role footprint shrinks the blast radius: 41 files use
`createServiceClient()` and bypass RLS entirely. The code paths that
actually feel RLS changes are the server components, the client-side
AdminDashboard, and 8 API routes that use the user-session client.

Recommended rollout when unparking:
1. Run `supabase db push` from a linked dev machine to apply migrations
   000011, 000012, 000013 to production.
2. Open a PR from `claude/continue-architecture-migration-BETbL` to
   `main`. CI runs (lint + build only).
3. Merge. Vercel deploys. Code finds the DB in the state it expects.
4. Spot-check: manager sees their teachers' students (intended
   expansion); student completes a practice test; admin dashboard
   loads.
5. If anything breaks, the kill switch above pins everyone to `legacy`
   and a targeted `drop policy`/`create policy` reverts the RLS bit.

## Applying a hotfix migration

Migrations should always land through a PR and replay on dev first.
If a production-only hotfix is unavoidable:

1. Write the migration file under `supabase/migrations/YYYYMMDDHHMMSS_*.sql`
   with a clear header comment.
2. Apply it manually via the Supabase SQL editor on production.
3. Commit the migration file in a PR with a comment that the migration
   was applied out-of-band.
4. Replay on dev (`supabase db reset`) to confirm it applies cleanly.

## Seeding a dev database

1. Start local Supabase: `supabase start`
2. Reset the schema: `supabase db reset`. This replays every migration
   from `supabase/migrations/` in order.
3. If you need realistic data, dump a sanitized snapshot from prod and
   `pg_restore` it into the local instance. The sanitization script is
   (TODO Phase 2 deliverable).

## Content protection incident response

If a scraper is detected (via Sentry alert from `lib/api/rateLimit.js`
or `lib/api/scraperSignals.js`):

1. Identify the offending user id from the alert payload.
2. Look up their account in the Supabase Studio / SQL editor:
   `select id, email, role, ui_version from profiles where id = '<id>';`
3. If the account is clearly a scraper (brand new, no real activity),
   deactivate: `update profiles set is_active = false where id = '<id>';`
4. If it might be a power user hitting a false positive, widen the
   rate-limit thresholds in `lib/api/rateLimit.js` first before taking
   action on the account.
5. File a Sentry-linked incident so the pattern is logged for future
   calibration.
