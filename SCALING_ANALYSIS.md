# Scaling Analysis: 500–1,000 Users with Subscriptions

> **Status: Historical analysis** (point-in-time; last annotated 2026-07-12).
> For current plans see `docs/upgrade-plan-2026-07.md`. Much of what this
> document recommended has since shipped (Stripe billing, rate limiting,
> Sentry, indexes); annotations below mark what changed.

## Current Architecture Snapshot

*(Snapshot was accurate when written; "2026-07" notes mark what has changed since.)*

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | Next.js 14 (App Router) + React 18 | Hosted on Vercel. **2026-07: now Next.js 16 + React 19; Vercel functions pinned to `pdx1` (vercel.json), colocated with the us-west-2 Supabase DB** |
| Backend | Supabase (PostgreSQL + Auth + RLS) | No separate API server |
| API | 26+ Next.js API routes | Thin wrappers around Supabase queries. **2026-07: down to 12 API route files; most logic moved to Server Actions** |
| Auth | Supabase email/password + JWT | 5 roles: practice, student, teacher, manager, admin |
| Caching | None (app-level) | localStorage with TTL for client-side only. **2026-07: `React.cache()` now dedups auth/profile lookups per request (`lib/api/auth.ts`); still no cross-request data cache. The submit path and report loaders were parallelized (`lib/practice/session-actions.ts`, `lib/practice/build-session-review.js`, `lib/practice-test/load-test-results.js`)** |
| Payment | **None** | **Shipped 2026-07: Stripe Checkout + Customer Portal, `subscriptions` table, webhook handler — see SUBSCRIPTION_PLAN.md** |
| Dependencies | 8 total | Extremely lean. **2026-07: now 26 (Stripe, Resend, Sentry, TipTap, Excalidraw, etc.)** |
| Rate Limiting | None | Relies on Supabase's built-in quotas. **Shipped 2026-07: `lib/api/rateLimit.js` (Upstash Redis with in-memory fallback) on server actions and the public HTTP surface (`app/api/public/*`, `app/api/external/*`, `app/api/signup`)** |

## Feasibility Verdict: Very Feasible

Scaling to 500–1,000 users is well within reach for the current stack.
Supabase's free tier supports 500 concurrent connections (unverified
2026-07-12), and the Pro plan ($25/mo) handles far more. Vercel's
free/Pro tiers can easily serve this traffic. The app is lean (8 deps
when written — 26 as of 2026-07 — no heavy state management), which
works in its favor.

*2026-07 note: production is at 66 students / 7 teachers / 2 managers,
so the 500–1,000-user scenario remains prospective.*

## What Needs to Happen (Priority Order)

### 1. Payment & Subscription System (Critical)

> **Shipped 2026-07.** The `subscriptions` table
> (`supabase/migrations/20230101000014_add_subscription_system.sql`)
> matches the suggested schema below (plus `trial_end`, plan/status CHECK
> constraints, and a later unique constraint on `user_id`). Stripe
> Checkout + Customer Portal live at `app/api/billing/create-checkout`
> and `app/api/billing/create-portal`; the webhook handler is
> `app/api/webhooks/stripe/route.js`; gating is done in `proxy.js`
> (app-level, not RLS). Details in SUBSCRIPTION_PLAN.md.

This is the biggest gap. Required:

- **Stripe integration** — the standard for SaaS billing:
  - A `subscriptions` table tracking plan, status, Stripe customer ID, and period dates
  - Stripe Checkout for sign-up, Customer Portal for management
  - Webhook handler (`/api/webhooks/stripe`) for subscription lifecycle events (created, updated, canceled, payment failed)
  - Middleware or RLS policies gating premium features by subscription status

- **Suggested schema addition:**
  ```sql
  CREATE TABLE public.subscriptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES profiles(id),
    stripe_customer_id text NOT NULL,
    stripe_subscription_id text UNIQUE,
    plan text NOT NULL DEFAULT 'free',
    status text NOT NULL DEFAULT 'active',
    current_period_start timestamptz,
    current_period_end timestamptz,
    cancel_at_period_end boolean DEFAULT false,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
  );
  ```

- **Tier structure to consider:** Free (limited questions/day) → Student ($X/mo, full access) → Teacher ($Y/mo, class management) → School/Org (bulk pricing)
  - *As built (2026-07): Student $12.99/mo and Teacher $29.99/mo with a
    7-day Stripe trial; no free-limited tier and no School/Org tier
    (the schema allows a `school` plan but no checkout path exists).
    A further entitlements refactor is planned — see
    `docs/upgrade-plan-2026-07.md` §1.5.*

### 2. Caching Layer (Important for UX & Cost)

> **Partially superseded — see `docs/upgrade-plan-2026-07.md` (P0.3,
> P0.4, 6.3b).** React Query/SWR was not adopted; the app moved to
> Server Components for initial data instead (`useEffect+fetch` is a
> retired pattern per CLAUDE.md). Per-request dedup of auth/profile
> shipped via `React.cache()` in `lib/api/auth.ts`, and the hot paths
> were parallelized (Shipped 2026-07). There is still no cross-request
> data cache, HTTP cache headers, or KV/edge cache.

Currently every page load hits Supabase directly with no caching. At 1,000 users:

- **Add React Query or SWR** for client-side data fetching — gives stale-while-revalidate, deduplication, and background refreshes *(superseded by the Server Components architecture)*
- **Add HTTP cache headers** on API routes for static-ish data (questions, taxonomy, score conversion tables) *(still open)*
- **Consider Vercel KV or edge caching** for the question catalog and practice test definitions (read-heavy, rarely mutate) *(still open; upgrade plan P0.4 proposes `unstable_cache` + tags instead)*

### 3. Rate Limiting & Abuse Prevention (Important)

> **Shipped 2026-07.** `lib/api/rateLimit.js` (Upstash REST with
> in-memory dev fallback) is wired onto server actions (practice,
> review, assignments, training) and the public HTTP surface:
> `app/api/signup` (per-IP), and `app/api/public/*` /
> `app/api/external/*` via `requireExternalApiAccess()` in
> `lib/externalAuth.js` (constant-time API-key check + per-IP limit).
> CAPTCHA was not added; per-IP signup throttling covers that need for
> now.

Currently zero app-level rate limiting. With paying users:

- Add rate limiting middleware (e.g., `upstash/ratelimit` with Vercel KV) on API routes, especially `/api/attempts`, `/api/questions`, and auth endpoints *(shipped, via the in-house `lib/api/rateLimit.js` + Upstash REST rather than the `@upstash/ratelimit` package; the named `/api/attempts` and `/api/questions` routes no longer exist — that traffic goes through rate-limited server actions)*
- Add CAPTCHA or throttling on sign-up/login to prevent credential stuffing *(throttling shipped on signup; CAPTCHA not added)*
- Ensure RLS policies are airtight since `NEXT_PUBLIC_SUPABASE_ANON_KEY` is exposed client-side by design *(ongoing practice)*

### 4. Database Optimization (Moderate)

Schema is solid, but review for scale:

- **Indexes**: Ensure composite indexes exist on hot query paths:
  - `attempts(user_id, created_at)` — progress/analytics queries *(shipped: `attempts_user_created_idx`, plus `attempts_user_source_idx`, `idx_attempts_user_question`)*
  - `question_status(user_id, is_done, last_attempt_at)` — practice filtering *(obsolete: `question_status` is a retired v1 table, archived to `_legacy`)*
  - `practice_test_attempts(user_id, status)` — test history *(table replaced by `practice_test_attempts_v2`, which has `idx_pta_v2_user`)*
- **The `attempts` table will grow fastest** — at 1,000 users doing ~50 questions/day, that's 50K rows/day (~18M/year). Partition or archive strategy worth planning *(still open; actual volume as of 2026-07 is ~21.5k attempts total, far below the projection)*
- **Connection pooling**: Supabase Pro uses PgBouncer by default — ensure pooled connection string is in use *(unverified 2026-07-12)*

### 5. Observability & Error Tracking (Important for Paid Product)

When users pay, visibility into issues is essential:

- Add **Sentry** or similar for error tracking (frontend + API routes) *(Shipped 2026-07: `@sentry/nextjs` with `instrumentation-client.ts`; upgrade plan adds spans on submit/report/plan paths)*
- Add **basic analytics** for business metrics: active users, questions answered, subscription churn *(partially: `@vercel/analytics` added; no business-metrics dashboards)*
- Existing `lib/analytics.js` is client-side only — add server-side event logging *(still true; `lib/analytics.js` remains client-side)*

### 6. Email & Notifications (Needed for Subscriptions)

> **Partially shipped 2026-07.** Resend is the transactional provider
> (`lib/email/client.js`); welcome and signup-notification emails exist
> (`lib/email/welcomeStudent.js`, `lib/email/signupNotifications.js`).
> Payment-failure and trial-expiry emails are NOT implemented — the
> webhook marks `past_due` without notifying, and
> `customer.subscription.trial_will_end` is unhandled.

Currently one email template (teacher invites). For subscriptions:

- Welcome / onboarding emails *(shipped)*
- Payment receipts (Stripe handles most of this)
- Payment failure notifications *(not built)*
- Subscription expiry warnings *(not built)*
- Consider **Resend** or **Supabase's built-in email** for transactional emails *(Resend adopted)*

### 7. Vercel & Supabase Plan Considerations

*(Current plan levels below were assumptions when written and remain
unverified 2026-07-12.)*

| Service | Current (assumed) | Recommended at 1K users |
|---------|-------------------|------------------------|
| Supabase | Free | Pro ($25/mo) — 8GB DB, 250K auth users, daily backups |
| Vercel | Free/Hobby | Pro ($20/mo) — better limits on serverless functions, analytics |
| Stripe | N/A | Standard (2.9% + 30¢ per transaction) |
| **Total infra cost** | ~$0/mo | **~$45/mo + Stripe fees** |

At even $10/mo × 500 users = $5,000/mo revenue vs ~$50/mo infra cost, the margins are excellent.

## What's Already Good (No Changes Needed)

- **Lean dependency tree** — 8 packages means minimal supply chain risk and fast builds *(2026-07: 26 packages, still modest)*
- **RLS policies** — already implemented across all major tables with JWT-based role checks, avoiding the common Supabase recursion pitfall
- **Parallel query execution** — API routes already use `Promise.all()` for concurrent queries
- **Precomputed aggregates** — `question_availability`, cached scores on `practice_test_attempts`, accuracy counters on `question_versions` *(2026-07: `practice_test_attempts` → `practice_test_attempts_v2`; `question_versions` is a retired v1 table in `_legacy` — its accuracy counters no longer exist on the live surface)*
- **Role system** — 5 roles already in place, maps well to subscription tiers
- **Migration history** — 33 versioned migrations means schema changes are tracked *(2026-07: 151 migration files; note that ordering/tracking drift exists and a baseline reset is planned — see `docs/upgrade-plan-2026-07.md` P0.7)*

## Recommended Implementation Order

1. **Stripe + subscriptions table** (unlocks revenue) — *Shipped 2026-07*
2. **Rate limiting middleware** (protects the service) — *Shipped 2026-07*
3. **React Query for data fetching** (reduces Supabase load, improves UX) — *Superseded: Server Components architecture instead; see docs/upgrade-plan-2026-07.md*
4. **Error tracking (Sentry)** (required for a paid product) — *Shipped 2026-07*
5. **Database indexes audit** (prevents slow queries at scale) — *Largely shipped (attempts + v2 test-attempt indexes in migrations)*
6. **HTTP caching on static data** (cost optimization) — *Still open; superseded by docs/upgrade-plan-2026-07.md P0.4*
7. **Transactional email setup** (subscription lifecycle) — *Partially shipped (Resend + welcome emails); billing lifecycle emails not built*

## Bottom Line

The app is architecturally well-positioned for this scale. The main gap
was **no payment system** — that was the bulk of the work, and it has
since shipped (see SUBSCRIPTION_PLAN.md). The database, auth, and
hosting layers are all capable of handling 1,000 users with minimal
changes (upgrade to Supabase Pro, add a few indexes). The total
infrastructure cost at scale would be ~$45/mo, making this a very
profitable operation even at modest subscription prices.
