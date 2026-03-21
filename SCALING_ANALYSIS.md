# Scaling Analysis: 500–1,000 Users with Subscriptions

## Current Architecture Snapshot

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | Next.js 14 (App Router) + React 18 | Hosted on Vercel |
| Backend | Supabase (PostgreSQL + Auth + RLS) | No separate API server |
| API | 26+ Next.js API routes | Thin wrappers around Supabase queries |
| Auth | Supabase email/password + JWT | 5 roles: practice, student, teacher, manager, admin |
| Caching | None (app-level) | localStorage with TTL for client-side only |
| Payment | **None** | No Stripe or subscription system |
| Dependencies | 8 total | Extremely lean |
| Rate Limiting | None | Relies on Supabase's built-in quotas |

## Feasibility Verdict: Very Feasible

Scaling to 500–1,000 users is well within reach for the current stack. Supabase's free tier supports 500 concurrent connections, and the Pro plan ($25/mo) handles far more. Vercel's free/Pro tiers can easily serve this traffic. The app is lean (8 deps, no heavy state management), which works in its favor.

## What Needs to Happen (Priority Order)

### 1. Payment & Subscription System (Critical)

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

### 2. Caching Layer (Important for UX & Cost)

Currently every page load hits Supabase directly with no caching. At 1,000 users:

- **Add React Query or SWR** for client-side data fetching — gives stale-while-revalidate, deduplication, and background refreshes
- **Add HTTP cache headers** on API routes for static-ish data (questions, taxonomy, score conversion tables)
- **Consider Vercel KV or edge caching** for the question catalog and practice test definitions (read-heavy, rarely mutate)

### 3. Rate Limiting & Abuse Prevention (Important)

Currently zero app-level rate limiting. With paying users:

- Add rate limiting middleware (e.g., `upstash/ratelimit` with Vercel KV) on API routes, especially `/api/attempts`, `/api/questions`, and auth endpoints
- Add CAPTCHA or throttling on sign-up/login to prevent credential stuffing
- Ensure RLS policies are airtight since `NEXT_PUBLIC_SUPABASE_ANON_KEY` is exposed client-side by design

### 4. Database Optimization (Moderate)

Schema is solid, but review for scale:

- **Indexes**: Ensure composite indexes exist on hot query paths:
  - `attempts(user_id, created_at)` — progress/analytics queries
  - `question_status(user_id, is_done, last_attempt_at)` — practice filtering
  - `practice_test_attempts(user_id, status)` — test history
- **The `attempts` table will grow fastest** — at 1,000 users doing ~50 questions/day, that's 50K rows/day (~18M/year). Partition or archive strategy worth planning
- **Connection pooling**: Supabase Pro uses PgBouncer by default — ensure pooled connection string is in use

### 5. Observability & Error Tracking (Important for Paid Product)

When users pay, visibility into issues is essential:

- Add **Sentry** or similar for error tracking (frontend + API routes)
- Add **basic analytics** for business metrics: active users, questions answered, subscription churn
- Existing `lib/analytics.js` is client-side only — add server-side event logging

### 6. Email & Notifications (Needed for Subscriptions)

Currently one email template (teacher invites). For subscriptions:

- Welcome / onboarding emails
- Payment receipts (Stripe handles most of this)
- Payment failure notifications
- Subscription expiry warnings
- Consider **Resend** or **Supabase's built-in email** for transactional emails

### 7. Vercel & Supabase Plan Considerations

| Service | Current (assumed) | Recommended at 1K users |
|---------|-------------------|------------------------|
| Supabase | Free | Pro ($25/mo) — 8GB DB, 250K auth users, daily backups |
| Vercel | Free/Hobby | Pro ($20/mo) — better limits on serverless functions, analytics |
| Stripe | N/A | Standard (2.9% + 30¢ per transaction) |
| **Total infra cost** | ~$0/mo | **~$45/mo + Stripe fees** |

At even $10/mo × 500 users = $5,000/mo revenue vs ~$50/mo infra cost, the margins are excellent.

## What's Already Good (No Changes Needed)

- **Lean dependency tree** — 8 packages means minimal supply chain risk and fast builds
- **RLS policies** — already implemented across all major tables with JWT-based role checks, avoiding the common Supabase recursion pitfall
- **Parallel query execution** — API routes already use `Promise.all()` for concurrent queries
- **Precomputed aggregates** — `question_availability`, cached scores on `practice_test_attempts`, accuracy counters on `question_versions`
- **Role system** — 5 roles already in place, maps well to subscription tiers
- **Migration history** — 33 versioned migrations means schema changes are tracked

## Recommended Implementation Order

1. **Stripe + subscriptions table** (unlocks revenue)
2. **Rate limiting middleware** (protects the service)
3. **React Query for data fetching** (reduces Supabase load, improves UX)
4. **Error tracking (Sentry)** (required for a paid product)
5. **Database indexes audit** (prevents slow queries at scale)
6. **HTTP caching on static data** (cost optimization)
7. **Transactional email setup** (subscription lifecycle)

## Bottom Line

The app is architecturally well-positioned for this scale. The main gap is **no payment system** — that's the bulk of the work. The database, auth, and hosting layers are all capable of handling 1,000 users with minimal changes (upgrade to Supabase Pro, add a few indexes). The total infrastructure cost at scale would be ~$45/mo, making this a very profitable operation even at modest subscription prices.
