# Studyworks — SAT / ACT practice platform

Next.js (App Router) + Supabase + Vercel. Students practice questions,
take full adaptive practice tests, review weak areas, and study
lessons; tutors build assignments, review work in live sessions, and
track roster performance; managers oversee and train tutors.

> This README was rewritten 2026-07 — the previous version described
> the original v1 scaffold (retired tables, anon-key-only setup) and
> predated the v2 rebuild.

## Orientation

- `CLAUDE.md` — current operating state + rules for new work. Read
  this first.
- `docs/architecture-plan.md` — the v1→v2 rebuild design (historical
  record; the rebuild is substantively complete).
- `docs/upgrade-plan-2026-07.md` — the current, verified upgrade
  roadmap.
- `docs/runbook.md` — operational runbook.
- `docs/database.md` — schema operations + safe service-role usage.
- `supabase/migrations/README.md` — **read before any `supabase db`
  command**; the directory is a historical record, not a replayable
  chain, pending a baseline reset.

## App structure

- `app/(student)/*` — dashboard, practice sets, practice tests,
  assignments, review/drills, lessons, notes/flashcards, help.
- `app/(tutor)/tutor/*` — roster, student detail + stats, assignment
  builder + reports, cohort performance, tutor training; managers get
  the extra Teachers surface.
- `app/(admin)/admin/*` — question bank + AI-assisted authoring
  drafts, lesson builder, assessment config, users/relationships.
- `lib/api/*` — shared primitives: `auth.js` (`requireUser`,
  `requireRole`, `requireServiceRole`), `response.ts`
  (`ok`/`fail`/`actionOk`/`actionFail`), `paginate.js`, `rateLimit.js`.
- `lib/practice/*`, `lib/practice-test/*` — session/test runners,
  loaders, weak-queue drill logic, mastery model.
- Data lives in the v2 schema (`questions_v2`, `assignments_v2`,
  `practice_test_*_v2`, `attempts`, `practice_sessions`, …). The v1
  schema is archived under `_legacy` — never read it from app code.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in values — see the file's comments
npm run dev                  # http://localhost:3000
```

Useful scripts:

```bash
npm run lint          # eslint
npm run typecheck     # tsc --noEmit (CI-enforced)
npm run test:unit     # lib/lesson unit suites (CI-enforced)
npm run test:e2e      # Playwright (needs a seeded dev project; see
                      # playwright.config.ts header for the dev users)
npm run validate-lessons
```

## Deployment

Vercel (functions pinned to `pdx1`, colocated with the production
Supabase project in us-west-2). Environment variables are configured
in Vercel project settings; see `.env.example` for the client-side
set. Webhooks: Stripe (`app/api/webhooks/stripe`, signature-verified).
External integrations authenticate via `x-api-key` against the
rate-limited `app/api/external/*` / `app/api/public/*` routes.

## Security model

Supabase RLS is the authoritative authorization layer (`can_view()`
+ per-table policies). Server code uses the shared auth primitives;
service-role access goes through `requireServiceRole('reason')` (or
logs the same `service_role_bypass` audit event where the wrapper
can't apply — cron, demo-tour read paths). Demo accounts
(`profiles.is_demo`) are read-only, enforced at the DB layer.
