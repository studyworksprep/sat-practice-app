# Studyworks runbook

> **Status: Living document.** Last verified against code: 2026-07-12.

Short operational playbook. Expand as new scenarios come up.

## Parallel-build kill switch — RETIRED

The dual-tree kill switch no longer exists. The `app/next/*` tree was
promoted to the route root in Stage C of the decommission
(`docs/decommission-plan.md`); the per-user UI-version column, its JWT sync,
and the `feature_flags` force-UI-version row were dropped by
migrations `20260620132818`
and `20260620154530` (re-cutover + legacy-table archival).
There is one app tree; there is nothing to flip. The `feature_flags`
table itself remains as infrastructure for future rollouts (no rows
are read by the proxy today).

## Finding a bug report

A student reports an error. Steps, in order:

1. **Check Sentry** for the user id or request id they pasted. If the
   stack trace is there, you have everything.
2. **Check structured logs** (emitted via `lib/api/logger.js`)
   for the request id.
3. **Try to reproduce on your own account** with the same role.
   (There is no per-user UI-version switch anymore — everyone is
   on the single app tree.)
4. **If you can't reproduce**, flip a copy of the user's role/permissions
   (never reuse their actual account) and retry.

## Rolling back a deploy

Vercel keeps the last N deployments. Promote the previous working
deployment back to production via the Vercel dashboard.

If the bug is content-related (a bad question, a broken rationale), the
fix is in the database, not the deploy. Don't roll back the build unless
the issue is code.

## Phase 2 step 9 branch deploy — DONE

Moved to `docs/history/2026-05-phase2-step9-deploy.md` (a record
from the parallel-build period; the mechanisms it describes are
retired).

## Applying a hotfix migration

**Read `supabase/migrations/README.md` first.** The migrations
directory is an audit log, not a replayable chain, and production's
migration-tracking table does not correspond to the local filenames.
**Never run `supabase db push` (or `migration up`) against
production** — it would attempt to re-apply years of already-applied
DDL.

Migrations should always land through a PR and be tested on a dev
database first. If a production-only hotfix is unavoidable:

1. Write the migration file under `supabase/migrations/YYYYMMDDHHMMSS_*.sql`
   with a clear header comment.
2. Apply it via the Supabase MCP `apply_migration` tool (which records
   its own version in the tracking table — that record is the source
   of truth; the file is the reviewable artifact).
3. Commit the migration file in a PR with a comment that the migration
   was applied out-of-band.
4. Regenerate `lib/types/database.ts` via the Supabase MCP
   `generate_typescript_types` tool.

## Seeding a dev database

1. Start local Supabase: `supabase start`
2. Reset the schema: `supabase db reset`. This replays the timestamped
   migrations from `supabase/migrations/`, but note the caveats in
   `supabase/migrations/README.md`: 42 files have no timestamp prefix
   (the CLI skips them) and there are two filename collisions, so a
   from-scratch reset is not guaranteed to reproduce the production
   schema. For a faithful dev copy, prefer a schema dump from prod.
3. If you need realistic data, dump a sanitized snapshot from prod and
   `pg_restore` it into the local instance. The sanitization script is
   (still TODO — no such script exists under `scripts/`).

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
  features-parity.anon.spec.ts /features/* marketing pages render
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

### Activating the e2e auth job (CI)

The `e2e-auth` job in `.github/workflows/ci.yml` is the enforced
"no access regressions" gate (see the plan's cross-cutting standards).
It is **secret-gated**: with no `E2E_SUPABASE_URL` secret it reports
itself *skipped* (not green), so a missing test environment is visible
rather than silently passing. To make it live:

1. **Pick/prepare an E2E Supabase project.** `studyworks-dev` (us-east-2)
   is the intended target and is currently **empty**. Load the schema
   into it. The migrations directory is not replayable (see
   `supabase/migrations/README.md`), so dump production's schema and
   apply it:

   ```
   supabase db dump --project-ref <prod-ref> --schema public -f e2e-schema.sql
   psql "$E2E_DB_URL" -f e2e-schema.sql
   ```

   (Once P0.7's baseline reset lands, use that baseline instead of a
   fresh dump.)

2. **Create the four dev users + seed data.** The specs log in through
   the real `/login` form, so the auth users must exist first. Create
   `admin@ / teacher@ / student1@ / student2@test.studyworks` (password
   `devseed123`) with the fixed UUIDs in `tests/e2e/helpers/fixtures.ts`
   via the Supabase Auth admin API, then run
   `scripts/dev-seed-practice-test-v2.sql` + `scripts/dev-seed-ui-preview.sql`
   (profiles, the teacher→student1 roster edge, and practice data).

3. **Add the three repo secrets** (Settings → Secrets → Actions):
   `E2E_SUPABASE_URL`, `E2E_SUPABASE_ANON_KEY`, `E2E_SERVICE_ROLE_KEY`
   pointing at that project. The job then runs `setup + anonymous +
   student + teacher + admin` on every PR.

The specs themselves (fixtures + `api-auth.*` / `page-auth.*`) were
rewritten against the generated matrix on 2026-07-13 and are ready;
only the seeded environment + secrets remain.

### Adding a test

1. Add the rule to `docs/authorization-matrix.md` first.
2. Add an entry to `tests/e2e/helpers/fixtures.ts` if it's a route
   list, otherwise hardcode in the spec.
3. Pick the right project filename suffix:
   - `*.anon.spec.ts` for anonymous
   - `*.student.spec.ts` / `*.teacher.spec.ts` / `*.admin.spec.ts`
     for role-bound tests (storage state loads automatically)
4. Each role-bound project (`student` / `teacher` / `admin`) depends
   on `setup`, which runs `auth.setup.ts` once per CI invocation.
   The `anonymous` project has no setup dependency.

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
2. **Server Components, Server Actions, the proxy (`proxy.js`,
   Next 16's middleware).** Captured automatically by Sentry's
   Next.js integration via `instrumentation.ts` → `onRequestError`.
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
   `lib/api/auth.ts`'s audit log (for `requireServiceRole` calls)
   live in the same Vercel log stream — use them to spot bypasses
   that shouldn't be happening.

## Content protection incident response

Scraper detection surfaces in the structured logs, not Sentry:
`lib/api/rateLimit.js` rejections show up as 429s at the call sites
that use it (the external/public API-key routes via
`lib/externalAuth.ts`, signup, and several practice actions), and
`lib/api/scraperSignals.js` emits `scraper_signal` log events.
Note that `scraperSignals` is still in shadow mode and currently has
no call sites wired up — cadence-based detection is aspirational
until a route calls `check()`. No Sentry alert is wired for either
module. If a scraper is detected (e.g. via log review or a rate-limit
spike):

1. Identify the offending user id from the log lines.
2. Look up their account in the Supabase Studio / SQL editor:
   `select id, email, role from profiles where id = '<id>';`
3. If the account is clearly a scraper (brand new, no real activity),
   deactivate: `update profiles set is_active = false where id = '<id>';`
4. If it might be a power user hitting a false positive, widen the
   rate-limit thresholds first before taking action on the account
   (defaults live in `lib/api/rateLimit.js`; per-route limits are
   passed by each call site).
5. File a Sentry-linked incident so the pattern is logged for future
   calibration.

## Demo accounts and marketing screenshots

The marketing slideshow at `/features/*` is driven by real product
pages screenshotted while signed in as one of two seeded accounts:

- `demo.student@studyworks.demo` — high-activity student profile
- `demo.tutor@studyworks.demo` — manager overseeing six demo students

Both carry `profiles.is_demo = true`. The DB-layer `demo_readonly_*`
restrictive policies (see `20260511000000_demo_readonly_foundation.sql`)
deny every INSERT / UPDATE / DELETE for sessions whose JWT carries
`app_metadata.is_demo = true`. The proxy (`proxy.js`) adds a second
gate that returns 403 on any non-GET/HEAD `/api/*` request from a
demo session, so REST writes fail fast with a clean JSON error
instead of a Postgres RLS error. Server Actions are deliberately NOT
gated at the proxy (it can't tell read actions from write actions);
demo writes through Server Actions still fail at the DB layer via
RLS.

### First-time setup per environment

1. Apply the migrations. The accounts and roster wiring land
   automatically via `20260511000001_create_demo_accounts.sql`.
2. Seed activity data once:
   ```
   SUPABASE_URL=…  SUPABASE_SERVICE_ROLE_KEY=…  npm run seed:demo
   ```
   The script is idempotent — re-running rebuilds the same data.

### Refreshing screenshots

After a UI change that affects a captured surface:

```
E2E_BASE_URL=https://<preview-url>  npm run screenshots
```

Playwright signs in via `/auth/demo/<persona>` and writes the
captured PNGs into `public/screenshots/`. Commit the regenerated
files together with the UI change.

### Adding a new captured surface

Append a tuple to `STUDENT_SHOTS` or `TUTOR_SHOTS` in
`tests/screenshots/marketing.spec.ts`, then reference the
filename from the relevant slide deck under `app/features/`.

### When a new public-schema table is added

The demo lockdown applies to existing tables at the time the
foundation migration ran. New tables MUST add three restrictive
policies before they can be considered demo-safe:

```sql
create policy demo_readonly_insert on public.<table>
  as restrictive for insert to authenticated
  with check (not public.is_demo());
create policy demo_readonly_update on public.<table>
  as restrictive for update to authenticated
  using (not public.is_demo()) with check (not public.is_demo());
create policy demo_readonly_delete on public.<table>
  as restrictive for delete to authenticated
  using (not public.is_demo());
```

The `demo-readonly.spec.ts` regression test runs in the screenshots
project; it catches the proxy gate breaking and spot-checks the DB
lockdown with a direct REST insert, but does not yet iterate every
public-schema table. A SQL-level test that does is on the follow-up
list (unverified 2026-07-12).

## Password reset flow

Recovery emails link to `/auth/confirm?token_hash=…&type=recovery&next=/auth/update-password`,
where a button POSTs the token to `/auth/confirm/verify`. That handler calls
`supabase.auth.verifyOtp({ type: 'recovery', token_hash })` server-side, mints
the session cookies, and forwards to `/auth/update-password`, which updates the
password and then revokes every other session for the account
(`signOut({ scope: 'others' })`).

Two design constraints, both learned the hard way (July 2026 incident — users
were locked out for weeks and the failure was invisible):

1. **No PKCE.** The previous flow (`resetPasswordForEmail` with a
   `redirectTo` through `/auth/callback` + `exchangeCodeForSession`) only
   worked when the emailed link was opened in the *same browser* that
   requested the reset, because the PKCE code-verifier lives in that
   browser's cookies. Phone-opens, webviews, and mail-scanner prefetches all
   dead-ended silently. `verifyOtp({ token_hash })` has no such coupling.
2. **Verify on POST, never on GET.** The token is single-use and mail
   filters (Outlook SafeLinks etc.) prefetch every link in an email. The
   `/auth/confirm` GET is inert; only the human-clicked form submission
   spends the token.

Failures now log (`password_reset_verify_failed`,
`auth_code_exchange_failed` — search Vercel logs) and land on
`/auth/update-password?error=invalid_link`, which shows the
"request a new link" state.

### Dashboard configuration (manual, per environment)

The hosted dashboard has no config-as-code, so after any change to the
canonical template at `supabase/templates/recovery.html`:

1. Supabase dashboard → **Authentication → Emails → Reset Password**.
2. Subject: `Reset your Studyworks password` (kept in `supabase/config.toml`
   under `[auth.email.template.recovery]`).
3. Body: paste the contents of `supabase/templates/recovery.html`
   (the HTML comment header can be omitted).
4. **Authentication → Sessions / Rate limits**: keep the email OTP expiry at
   30–60 minutes (default 1 hour is acceptable; shorter is better) and leave
   Supabase's built-in per-email rate limit on.

If the dashboard template ever reverts to `{{ .ConfirmationURL }}`, the
same-browser PKCE failure mode comes back. The signal that this happened:
`auth.flow_state` rows with `authentication_method = 'recovery'` piling up
with no matching sessions, and zero traffic on `/auth/update-password`.

Local dev needs no manual step — `supabase/config.toml` points the local
stack at the same template file, and Inbucket (port 54324) captures the
emails.
