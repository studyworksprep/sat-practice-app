# Subscription Model Transition Plan

> **Status: Living — shipped.** This plan was implemented and, with the
> as-built annotations below, describes the current billing model
> (last verified against code 2026-07-12). Phases 1–8 are live; the
> main deltas from the original spec are flagged inline. The next
> evolution of this system (a first-class `entitlements` gate replacing
> the ad-hoc checks in `proxy.js`) is planned in
> `docs/upgrade-plan-2026-07.md` §1.5.

## Goal

Charge a monthly subscription for new public users while keeping the service **free for your own tutors and their students**.

---

## Key Concepts

### Who Pays vs. Who Doesn't

| User Type | Pays? | How They're Identified |
|-----------|-------|------------------------|
| **Your tutors** (registered with a teacher code) | No | `role = 'teacher'` + registered via `teacher_codes` table. *As built: only codes with `teacher_codes.exempt = true` grant free access (all pre-existing codes were marked exempt — `add_exempt_flag_to_teacher_codes.sql`)* |
| **Your tutors' students** (joined via teacher invite code) | No | *As built: exemption is inherited from the teacher — signup with an exempt teacher's invite code, or a DB trigger when later assigned to an exempt teacher via `teacher_student_assignments`* |
| **Managers/Admins** | No | `role IN ('manager', 'admin')` |
| **New public students** (sign up independently, no teacher code) | Yes | `user_type = 'student'` or `'exploring'` with no teacher assignment. *As built: `exploring` signups are not sent to checkout at signup (`needsSubscription` is false for them), but the `proxy.js` gate still requires a subscription or exemption to reach protected routes* |
| **New public teachers** (independent tutors) | Yes | Teachers without an exempt `teacher_code` (shipped — no longer a future flow) |

### Subscription Tiers (Suggested)

*As built (2026-07): Student **$12.99/mo**, Teacher **$29.99/mo**, both
with a 7-day Stripe trial (`trial_period_days: 7` in
`app/api/billing/create-checkout/route.js`). There is no free
limited-questions tier — after the trial lapses, protected routes
redirect to `/subscribe`. No School/Org tier was built (the schema's
`plan` CHECK allows `'school'`, but no checkout path exists).*

| Tier | Price | Access |
|------|-------|--------|
| **Free Trial** | $0 for 7 days | Full access; *as built: then blocked from protected routes (no limited free tier)* |
| **Student** | $12.99/mo *(planned ~$10–15)* | Full question bank, practice tests, smart review, vocabulary |
| **Teacher** | $29.99/mo *(planned ~$25–30)* | Everything in Student + class management, assignments, analytics |
| **School/Org** | Custom | Bulk teacher + student seats, invoicing — *not built* |

---

## Changes Required

### 1. Database: New Tables & Columns

> **Shipped 2026-07** as
> `supabase/migrations/20230101000014_add_subscription_system.sql`
> (table + indexes + RLS + `subscription_exempt` + grandfathering +
> `handle_new_user()` update + auto-exempt trigger), plus
> `add_subscriptions_user_id_unique.sql` (unique constraint on
> `user_id` for webhook upserts) and
> `add_exempt_flag_to_teacher_codes.sql`.

#### A. `subscriptions` table (new)

```sql
CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  stripe_customer_id text NOT NULL,
  stripe_subscription_id text UNIQUE,
  plan text NOT NULL DEFAULT 'free',          -- 'free', 'student', 'teacher', 'school'
  status text NOT NULL DEFAULT 'trialing',    -- 'trialing', 'active', 'past_due', 'canceled', 'unpaid'
  current_period_start timestamptz,
  current_period_end timestamptz,
  trial_end timestamptz,
  cancel_at_period_end boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT valid_plan CHECK (plan IN ('free', 'student', 'teacher', 'school')),
  CONSTRAINT valid_status CHECK (status IN ('trialing', 'active', 'past_due', 'canceled', 'unpaid'))
);

CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_stripe_customer_id ON subscriptions(stripe_customer_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
```

*Shipped as written, plus `subscriptions_user_id_unique UNIQUE (user_id)`.*

#### B. `profiles` table changes

```sql
-- Add a column to mark users who are exempt from billing
ALTER TABLE profiles ADD COLUMN subscription_exempt boolean DEFAULT false;
```

- Set `subscription_exempt = true` for all existing users (grandfathered) — *shipped*
- The `handle_new_user()` trigger sets it to `true` when a student signs up with a valid teacher invite code — *shipped (via a `subscription_exempt` flag in signup metadata; the student inherits exemption only if the inviting teacher is exempt)*
- Teachers registered via `teacher_codes` also get `subscription_exempt = true` — *shipped, gated on `teacher_codes.exempt = true`*
- Admins/managers are always exempt (checked by role) — *shipped*

#### C. RLS policies for `subscriptions`

```sql
-- Users can read their own subscription
CREATE POLICY "Users can view own subscription"
  ON subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- Only service role (webhook handler) can insert/update
-- No direct user writes needed
```

*Shipped (policy name as built: `subscriptions_select_own`; writes are
service-role only via the webhook handler).*

---

### 2. Stripe Integration

#### A. New dependencies

```bash
npm install stripe
```

*Shipped (`stripe` ^22 in package.json; lazy-init client in `lib/stripe.js`).*

#### B. Environment variables

```env
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_STUDENT_PRICE_ID=price_...
STRIPE_TEACHER_PRICE_ID=price_...
```

*As built: `STRIPE_PUBLISHABLE_KEY` is unused — the hosted Checkout
redirect flow needs no client-side key. The other four are in use.*

#### C. New API routes

| Route | Purpose | As built |
|-------|---------|----------|
| `POST /api/billing/create-checkout` | Creates a Stripe Checkout session for the user's chosen plan | Shipped |
| `POST /api/billing/create-portal` | Creates a Stripe Customer Portal session (manage/cancel subscription) | Shipped |
| `POST /api/webhooks/stripe` | Handles Stripe webhook events (subscription lifecycle) | Shipped |
| `GET /api/billing/status` | Returns current user's subscription status (used by frontend) | **Not built** — status is read server-side instead (`lib/subscription.js` on the billing page; inline query in `proxy.js`). Note: `tests/e2e/helpers/fixtures.ts` still lists this nonexistent route |

#### D. Stripe webhook events to handle

| Event | Action | As built |
|-------|--------|----------|
| `checkout.session.completed` | Create `subscriptions` row, link Stripe customer ID to profile | Shipped |
| `customer.subscription.created` | Update subscription status to `active` or `trialing` | Shipped |
| `customer.subscription.updated` | Update plan, status, period dates | Shipped |
| `customer.subscription.deleted` | Mark status as `canceled` | Shipped |
| `invoice.payment_failed` | Mark status as `past_due`, trigger email notification | Partially shipped — sets `past_due`; **no email notification is sent** |
| `customer.subscription.trial_will_end` | (Optional) Send trial-ending reminder email | Not built |

---

### 3. Access Control Changes

#### A. New helper function: `user_has_access()`

> **Shipped 2026-07** as `lib/subscription.js` — `userHasAccess()`
> matches the sketch below (with `.maybeSingle()` on the profile read
> and a `no_profile` failure reason added).

Create a server-side utility (`lib/subscription.js`) that determines if a user has active access:

```javascript
export async function userHasAccess(supabase, userId) {
  // 1. Check role — admin/manager always have access
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, subscription_exempt')
    .eq('id', userId)
    .single();

  if (['admin', 'manager'].includes(profile.role)) return { hasAccess: true, reason: 'role' };

  // 2. Check exemption flag (your tutors + their students)
  if (profile.subscription_exempt) return { hasAccess: true, reason: 'exempt' };

  // 3. Check active subscription
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('status, plan, current_period_end, trial_end')
    .eq('user_id', userId)
    .in('status', ['active', 'trialing'])
    .maybeSingle();

  if (sub) return { hasAccess: true, reason: 'subscription', plan: sub.plan };

  // 4. No access
  return { hasAccess: false, reason: 'no_subscription' };
}
```

#### B. Middleware changes (`middleware.js`)

> **Shipped 2026-07 in `proxy.js`** (Next 16's replacement for
> `middleware.js`). The gate is an inline query there (same logic as
> `userHasAccess`, not a call to it), with a grace window: the check is
> skipped when `?checkout=success` is present, since the webhook may
> not have landed yet. The planned short-lived cookie/header cache of
> the result was **not** built — protected navigations query the DB.

Extend the existing middleware to check subscription status for non-exempt users:

- After the existing role check, call `userHasAccess()`
- If `hasAccess === false`, redirect to `/subscribe` (new pricing/checkout page)
- Cache the result in a short-lived cookie or header to avoid hitting the DB on every request *(not built)*

**Protected routes** (require subscription or exemption) — *as built in
`proxy.js` `SUBSCRIPTION_REQUIRED`*:
- `/practice`, `/practice/*` (practice tests now live under `/practice/tests`, so this prefix covers them)
- `/review`, `/review/*`
- `/dashboard`
- `/tutor`, `/tutor/*`

**Always accessible** (no subscription needed) — *as built in
`ALWAYS_ACCESSIBLE` plus prefix skips*:
- `/`, `/login`, `/subscribe`, `/features`, `/account`, `/auth`; and `/api/*` is excluded from the subscription gate (`/api/public/*`, `/api/external/*`, `/api/webhooks/*` skip session auth entirely and carry their own key + rate-limit checks)

#### C. API route protection

> **Not built as specified — superseded by architecture.** The premium
> data surface moved from API routes to Server Actions behind
> authenticated pages, and the page-level gate in `proxy.js` fronts
> them. The routes listed below (`/api/questions`, `/api/attempts`,
> etc.) no longer exist. There is no `lib/withSubscription.js`; note
> that server actions are gated by auth + the page gate rather than a
> per-action subscription check.

Add a subscription check wrapper for API routes that serve premium content:

```javascript
// lib/withSubscription.js
export function withSubscription(handler) {
  return async (request) => {
    const userId = request.headers.get('x-user-id');
    const access = await userHasAccess(supabase, userId);
    if (!access.hasAccess) {
      return NextResponse.json({ error: 'Subscription required' }, { status: 403 });
    }
    return handler(request);
  };
}
```

Apply to: `/api/questions`, `/api/attempts`, `/api/practice-tests/*`, `/api/progress`, `/api/smart-review`, etc. *(routes retired; see note above)*

---

### 4. Signup Flow Changes

> **Shipped 2026-07** in `app/api/signup/route.js` (which is also
> rate-limited per IP).

#### A. Updated signup logic (`/api/signup/route.js`)

After creating the user:

- **If student signed up with a teacher invite code** → set `subscription_exempt = true` *(as built: only when the inviting teacher is themselves exempt)*
- **If teacher signed up with a teacher registration code** → set `subscription_exempt = true` *(as built: only when the code has `exempt = true`)*
- **If exploring/independent signup** → `subscription_exempt = false` → redirect to `/subscribe` after login *(as built: the signup response returns `needsSubscription`, which is `false` for `exploring` users — they aren't pushed to checkout at signup, but the proxy gate still blocks protected routes)*

#### B. Post-signup redirect

- Exempt users → existing flow (straight to `/practice` or `/dashboard`)
- Non-exempt users → `/subscribe` page (pricing + Stripe Checkout)

---

### 5. New Frontend Pages

#### A. `/subscribe` — Pricing Page

*Shipped (`app/subscribe/page.js` + `SubscribeClient.jsx`): plan tiers
at $12.99/$29.99, trial highlighted, checkout via
`/api/billing/create-checkout`; already-exempt/subscribed users are
redirected away.*

- Shows plan tiers (Student / Teacher)
- Highlights free trial
- "Start Free Trial" button → calls `/api/billing/create-checkout` → redirects to Stripe Checkout
- If user is already exempt, redirect them away from this page

#### B. `/account/billing` — Subscription Management

*Shipped (`app/account/billing/page.js` + `ManagePortalButton.jsx`),
reading status server-side via `userHasAccess()`.*

- Shows current plan, next billing date, payment method
- "Manage Subscription" button → calls `/api/billing/create-portal` → redirects to Stripe Customer Portal
- Cancel / upgrade / downgrade all handled by Stripe Portal
- Only shown to paying users (hide for exempt users)

#### C. Paywall Banner Component

*Not built as a component — the `proxy.js` redirect to `/subscribe`
serves this purpose (an expired user can't reach protected pages at
all, so there is no in-app banner state).*

- Shown when a user's trial has expired or subscription is inactive
- "Your trial has ended. Subscribe to continue practicing."
- CTA button → `/subscribe`

---

### 6. Grandfathering Existing Users

> **Shipped 2026-07** inside
> `20230101000014_add_subscription_system.sql` (single
> `UPDATE profiles SET subscription_exempt = true`; the
> teacher-assignment case is handled by the trigger in §7 rather than a
> second UPDATE).

Run a one-time migration to exempt all current users:

```sql
-- Grandfather all existing users
UPDATE profiles SET subscription_exempt = true;

-- Ensure all teacher-assigned students are exempt
UPDATE profiles SET subscription_exempt = true
WHERE id IN (SELECT student_id FROM teacher_student_assignments);
```

Going forward, the signup flow handles exemption automatically based on whether a teacher code or invite code was provided.

---

### 7. Ongoing Exemption Logic

> **Shipped 2026-07** as the
> `trg_exempt_student_on_assignment` AFTER INSERT trigger on
> `teacher_student_assignments`
> (`exempt_student_on_teacher_assignment()`), which checks that the
> teacher is exempt before exempting the student. The removal policy
> implemented is the recommended one: exemption is kept (no revocation
> logic exists).

When a student is **later assigned** to one of your teachers (not at signup), they should also become exempt:

- Add a database trigger or API-level logic on `teacher_student_assignments` INSERT:
  - Check if the teacher is one of your exempt teachers
  - If so, set the student's `subscription_exempt = true`

When a teacher **removes** a student, decide policy:
  - **Recommended**: Keep exemption (don't revoke mid-use) — *implemented*
  - Alternative: Revoke and require subscription

---

## Implementation Order

| Phase | Work | Effort | Status |
|-------|------|--------|--------|
| **Phase 1: Database** | Add `subscriptions` table, `subscription_exempt` column, RLS policies, grandfather migration | Small | Shipped |
| **Phase 2: Stripe Setup** | Create Stripe account/products/prices, add env vars, install `stripe` package | Small | Shipped |
| **Phase 3: Webhook Handler** | Build `/api/webhooks/stripe` to sync subscription state | Medium | Shipped |
| **Phase 4: Billing API** | Build checkout session + portal session endpoints, `/api/billing/status` | Medium | Shipped, except `/api/billing/status` (server-side reads instead) |
| **Phase 5: Access Control** | Add `userHasAccess()` helper, update middleware + API routes | Medium | Shipped (`lib/subscription.js` + `proxy.js`; no per-route API wrapper — see §3C) |
| **Phase 6: Signup Flow** | Update signup to set exemption flag, add post-signup redirect logic | Small | Shipped |
| **Phase 7: Frontend** | Build `/subscribe` page, `/account/billing` page, paywall banner | Medium | Shipped, except paywall banner (proxy redirect instead) |
| **Phase 8: Grandfathering** | Run migration to exempt existing users, add trigger for future teacher-student links | Small | Shipped |
| **Phase 9: Testing** | End-to-end testing of all flows (exempt signup, paid signup, trial expiry, webhook handling) | Medium | Gap: no dedicated billing e2e specs exist (`tests/e2e/` covers auth/parity only) |

---

## Files That Need Changes

| File | Change | As built |
|------|--------|----------|
| `supabase/migrations/` | New migration for `subscriptions` table + `subscription_exempt` column | Shipped (`20230101000014_add_subscription_system.sql`, `add_subscriptions_user_id_unique.sql`, `add_exempt_flag_to_teacher_codes.sql`) |
| `package.json` | Add `stripe` dependency | Shipped |
| `.env.local` | Add Stripe environment variables | Shipped (`STRIPE_PUBLISHABLE_KEY` unused) |
| `middleware.js` | Add subscription check for non-exempt users | Shipped in `proxy.js` (Next 16 rename) |
| `app/api/signup/route.js` | Set `subscription_exempt` based on teacher code presence | Shipped |
| `app/api/billing/create-checkout/route.js` | **New** — Stripe Checkout session | Shipped |
| `app/api/billing/create-portal/route.js` | **New** — Stripe Customer Portal session | Shipped |
| `app/api/billing/status/route.js` | **New** — Current subscription status | Not built (server-side reads instead) |
| `app/api/webhooks/stripe/route.js` | **New** — Stripe webhook handler | Shipped |
| `lib/subscription.js` | **New** — `userHasAccess()` helper | Shipped |
| `app/subscribe/page.js` | **New** — Pricing/checkout page | Shipped |
| `app/account/billing/page.js` | **New** — Subscription management page | Shipped |
| `app/components/PaywallBanner.js` | **New** — Trial expired / subscribe CTA | Not built (proxy redirect to `/subscribe` instead) |
| `app/components/NavBar.js` (or equivalent) | Add billing/account link for paying users | Not built — no billing link in `lib/ui/nav-links.js`; `/account/billing` is linked from Help content and the welcome email |

---

## Cost Impact

*Plan-level costs below were assumptions when written (current
Supabase/Vercel plan levels unverified 2026-07-12). Revenue rows are
projections; production as of July 2026 is 66 students / 7 teachers /
2 managers, predominantly exempt.*

| Item | Cost |
|------|------|
| Supabase Pro (recommended at scale) | $25/mo |
| Vercel Pro (recommended at scale) | $20/mo |
| Stripe fees | 2.9% + $0.30 per transaction |
| **Total fixed overhead** | **~$45/mo** |
| **Revenue at 100 students × $10/mo** | **$1,000/mo** *(as-built price is $12.99)* |
| **Revenue at 500 students × $10/mo** | **$5,000/mo** *(as-built price is $12.99)* |
