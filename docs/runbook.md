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

## Negative-test scaffold (Playwright)

The matrix-driven authorization tests live in `tests/e2e/` and run
via Playwright. Each spec is a representative slice of the
authorization-matrix categories; full coverage stays in
`docs/authorization-matrix.md` and grows incrementally as new
routes / actions land.

### Layout

```
playwright.config.ts           Project shape + auth setup wiring
tests/e2e/
  auth.setup.ts                Logs in admin / teacher / student;
                               saves storage state to tests/.auth/
  helpers/fixtures.ts          UUIDs + matrix anchors
  api-auth.anon.spec.ts        anonymous → 401
  api-auth.student.spec.ts     student → 403 on tutor + admin
  api-auth.teacher.spec.ts     teacher → 403 on admin + cross-roster
  page-auth.teacher.spec.ts    page-level redirects + 404s
```

### Required test users

The dev seed (`scripts/dev-seed-practice-test-v2.sql` +
`scripts/dev-seed-ui-preview.sql`) creates them. Password is
`devseed123` for all. The relationships matter — the cross-roster
tests assume student2 is NOT on the seeded teacher's roster:

| Email | Role | Roster |
|---|---|---|
| `admin@test.studyworks` | admin | sees all |
| `teacher@test.studyworks` | teacher | student1 only |
| `student1@test.studyworks` | student | on teacher's roster |
| `student2@test.studyworks` | student | NOT on teacher's roster |

### Running

First time on a machine:

```
npm install
npm run test:e2e:install   # downloads the chromium binary
```

Then any of:

```
npm run test:e2e                       # all projects
npm run test:e2e -- --project=anonymous
npm run test:e2e -- --project=teacher
npm run test:e2e:ui                    # interactive Playwright UI
```

Default target is `http://localhost:3000`; the config boots
`npm run dev` if nothing's listening. To run against a Vercel
preview instead, set `E2E_BASE_URL=<url>` and the config skips the
local server step.

### Adding a test

1. Add the rule to `docs/authorization-matrix.md` first.
2. Add an entry to `tests/e2e/helpers/fixtures.ts` if it's a route
   list, otherwise hardcode in the spec.
3. Pick the right project filename suffix:
   - `*.anon.spec.ts` for anonymous
   - `*.student.spec.ts` / `*.teacher.spec.ts` / `*.admin.spec.ts`
     for role-bound tests (storage state loads automatically)
4. Each project depends on `setup`, which runs `auth.setup.ts`
   once per CI invocation.

### Limits of the scaffold

- **Server Actions aren't covered yet.** Driving them via Playwright
  needs the Next-internal `$ACTION_REF` ID, which changes between
  builds. Coverage approach: drive Server Actions through their UI
  surfaces (e.g. submit the QuickEditModal as the wrong role and
  assert the error toast), not direct HTTP. Tracked in matrix §4.4.
- **Manager role isn't seeded.** Manager-specific tests need a
  manager test user + a `manager_teacher_assignments` row in the
  seed — both straightforward additions when we tackle that pass.
- **Test data assertions stay shallow.** The specs assert status
  codes, not response bodies, by design — bodies vary with seed
  state, status codes don't.

## Observability — Sentry

The app forwards unhandled exceptions to Sentry from four points:

1. **Server route handlers.** Every route wrapped in `apiRoute()` /
   `legacyApiRoute()` (`lib/api/response.ts`) reports unexpected
   throws to Sentry with a `request_id` tag and `layer: route`.
   `ApiError` throws (intentional 4xx) are NOT reported.
2. **Server Components, Server Actions, middleware.** Captured
   automatically by Sentry's Next.js integration via
   `instrumentation.ts` → `onRequestError`.
3. **Client error boundaries.** `lib/ui/ErrorScreen.js` calls
   `Sentry.captureException(error)` and shows the resulting event id
   to the user as "Reference: …" so a support ticket can be matched
   to a Sentry issue.
4. **Root layout.** `app/global-error.js` is the last-resort
   boundary for errors thrown in the root layout itself.

### Required env vars

| Var | Where | Purpose |
|---|---|---|
| `SENTRY_DSN` | server runtime | enables server-side capture; unset → no-op |
| `NEXT_PUBLIC_SENTRY_DSN` | client + server | enables client capture |
| `SENTRY_ORG` | build step | for source-map upload |
| `SENTRY_PROJECT` | build step | for source-map upload |
| `SENTRY_AUTH_TOKEN` | build step | source-map upload auth; only set on Vercel |

When `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` are unset, the SDK
no-ops everywhere. Local dev should leave them unset by default;
set both to point at the dev Sentry project to test capture
end-to-end.

### Sample rates

- `tracesSampleRate: 0.1` (server) / `0.05` (client) in production.
- `replaysSessionSampleRate: 0` and `replaysOnErrorSampleRate: 0`
  by default. Bump per-deploy when investigating a specific UX bug.

### Triaging an alert

1. Open the Sentry issue. The `request_id` tag groups every log
   line that came from the same request — search Vercel logs for
   that id to get the full server-side context.
2. The user-facing "Reference" code shown by `ErrorScreen` is the
   Sentry event id. A support ticket that quotes that code can be
   linked back to the issue directly.
3. The `caller_role` and `event=service_role_bypass` fields on
   `lib/api/auth.js`'s audit log (for `requireServiceRole` calls)
   live in the same Vercel log stream — use them to spot bypasses
   that shouldn't be happening.

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
