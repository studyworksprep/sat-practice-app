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

## Phase 2 step 9 branch deploy — DONE

The RLS-refactor branch (plus everything that accumulated on top:
Phase 3 assignment unification, Phase 4 primitives, profile_cards
view) was deployed to production on Monday. Migrations 000011
through 000024 are applied; `main` holds the merged code. The
`app/next/` parallel tree is live behind `ui_version`.

Post-deploy hotfixes, same day:
- **000015 route_code case mapping** — v1's `practice_test_modules`
  stores route codes as `EASY / HARD / BASE`; the original CASE in
  000015 compared against lowercase literals and collapsed every
  source row to `'std'`, colliding on the unique key. Fixed by
  lower-casing + explicit base→std mapping.
- **000024 restore question_status FK** — 000017 dropped
  `question_status_question_id_fkey` on the premise that the column
  might carry v2 UUIDs. In prod the column holds v1 UUIDs
  exclusively (3210/3210), so the drop was defensively over-eager
  and broke PostgREST's ability to resolve embedded
  `question_status!left(...)` selects in legacy routes. Restored
  the FK.

If you need to roll back any of these selectively, the kill switch
(`feature_flags.force_ui_version = 'legacy'`) pins everyone to
the legacy tree but does NOT undo schema changes — those need
targeted `drop policy` / `drop constraint` reverts.

Remaining parked-for-Phase-6 items (not part of this deploy):
- Enabling RLS on the legacy `practice_test_*` and v1 question
  tables. The plan is to let them retire with the rest of the
  legacy tree. See §3.6 parallel-build discipline extended to the
  schema layer.
- Retiring `question_status`, its restored FK, and the
  `upsert_question_status_after_attempt` RPC. All legacy-only.

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
