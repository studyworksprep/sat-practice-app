# Subscription Model Transition Plan

## Goal

Charge a monthly subscription for new public users while keeping the service **free for your own tutors and their students**.

---

## Key Concepts

### Who Pays vs. Who Doesn't

| User Type | Pays? | How They're Identified |
|-----------|-------|------------------------|
| **Your tutors** (registered with a teacher code) | No | `role = 'teacher'` + registered via `teacher_codes` table |
| **Your tutors' students** (joined via teacher invite code) | No | Has a row in `teacher_student_assignments` |
| **Managers/Admins** | No | `role IN ('manager', 'admin')` |
| **New public students** (sign up independently, no teacher code) | Yes | `user_type = 'student'` or `'exploring'` with no teacher assignment |
| **New public teachers** (independent tutors) | Yes | Teachers without an org-issued `teacher_code` (future flow) |

### Subscription Tiers (Suggested)

| Tier | Price | Access |
|------|-------|--------|
| **Free Trial** | $0 for 7 days | Full access, then locked to limited questions/day |
| **Student** | ~$10–15/mo | Full question bank, practice tests, smart review, vocabulary |
| **Teacher** | ~$25–30/mo | Everything in Student + class management, assignments, analytics |
| **School/Org** | Custom | Bulk teacher + student seats, invoicing |

---

## Changes Required

### 1. Database: New Tables & Columns

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

#### B. `profiles` table changes

```sql
-- Add a column to mark users who are exempt from billing
ALTER TABLE profiles ADD COLUMN subscription_exempt boolean DEFAULT false;
```

- Set `subscription_exempt = true` for all existing users (grandfathered)
- The `handle_new_user()` trigger sets it to `true` when a student signs up with a valid teacher invite code
- Teachers registered via `teacher_codes` also get `subscription_exempt = true`
- Admins/managers are always exempt (checked by role)

#### C. RLS policies for `subscriptions`

```sql
-- Users can read their own subscription
CREATE POLICY "Users can view own subscription"
  ON subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- Only service role (webhook handler) can insert/update
-- No direct user writes needed
```

---

### 2. Stripe Integration

#### A. New dependencies

```bash
npm install stripe
```

#### B. Environment variables

```env
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_STUDENT_PRICE_ID=price_...
STRIPE_TEACHER_PRICE_ID=price_...
```

#### C. New API routes

| Route | Purpose |
|-------|---------|
| `POST /api/billing/create-checkout` | Creates a Stripe Checkout session for the user's chosen plan |
| `POST /api/billing/create-portal` | Creates a Stripe Customer Portal session (manage/cancel subscription) |
| `POST /api/webhooks/stripe` | Handles Stripe webhook events (subscription lifecycle) |
| `GET /api/billing/status` | Returns current user's subscription status (used by frontend) |

#### D. Stripe webhook events to handle

| Event | Action |
|-------|--------|
| `checkout.session.completed` | Create `subscriptions` row, link Stripe customer ID to profile |
| `customer.subscription.created` | Update subscription status to `active` or `trialing` |
| `customer.subscription.updated` | Update plan, status, period dates |
| `customer.subscription.deleted` | Mark status as `canceled` |
| `invoice.payment_failed` | Mark status as `past_due`, trigger email notification |
| `customer.subscription.trial_will_end` | (Optional) Send trial-ending reminder email |

---

### 3. Access Control Changes

#### A. New helper function: `user_has_access()`

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

Extend the existing middleware to check subscription status for non-exempt users:

- After the existing role check, call `userHasAccess()`
- If `hasAccess === false`, redirect to `/subscribe` (new pricing/checkout page)
- Cache the result in a short-lived cookie or header to avoid hitting the DB on every request

**Protected routes** (require subscription or exemption):
- `/practice`, `/practice/*`
- `/practice-test`, `/practice-test/*`
- `/review`, `/review/*`
- `/dashboard`

**Always accessible** (no subscription needed):
- `/`, `/login`, `/subscribe`, `/api/billing/*`, `/api/webhooks/*`, `/api/me`

#### C. API route protection

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

Apply to: `/api/questions`, `/api/attempts`, `/api/practice-tests/*`, `/api/progress`, `/api/smart-review`, etc.

---

### 4. Signup Flow Changes

#### A. Updated signup logic (`/api/signup/route.js`)

After creating the user:

- **If student signed up with a teacher invite code** → set `subscription_exempt = true` (already linked to your tutor, so free)
- **If teacher signed up with a teacher registration code** → set `subscription_exempt = true`
- **If exploring/independent signup** → `subscription_exempt = false` → redirect to `/subscribe` after login

#### B. Post-signup redirect

- Exempt users → existing flow (straight to `/practice` or `/dashboard`)
- Non-exempt users → `/subscribe` page (pricing + Stripe Checkout)

---

### 5. New Frontend Pages

#### A. `/subscribe` — Pricing Page

- Shows plan tiers (Student / Teacher)
- Highlights free trial
- "Start Free Trial" button → calls `/api/billing/create-checkout` → redirects to Stripe Checkout
- If user is already exempt, redirect them away from this page

#### B. `/account/billing` — Subscription Management

- Shows current plan, next billing date, payment method
- "Manage Subscription" button → calls `/api/billing/create-portal` → redirects to Stripe Customer Portal
- Cancel / upgrade / downgrade all handled by Stripe Portal
- Only shown to paying users (hide for exempt users)

#### C. Paywall Banner Component

- Shown when a user's trial has expired or subscription is inactive
- "Your trial has ended. Subscribe to continue practicing."
- CTA button → `/subscribe`

---

### 6. Grandfathering Existing Users

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

When a student is **later assigned** to one of your teachers (not at signup), they should also become exempt:

- Add a database trigger or API-level logic on `teacher_student_assignments` INSERT:
  - Check if the teacher is one of your exempt teachers
  - If so, set the student's `subscription_exempt = true`

When a teacher **removes** a student, decide policy:
  - **Recommended**: Keep exemption (don't revoke mid-use)
  - Alternative: Revoke and require subscription

---

## Implementation Order

| Phase | Work | Effort |
|-------|------|--------|
| **Phase 1: Database** | Add `subscriptions` table, `subscription_exempt` column, RLS policies, grandfather migration | Small |
| **Phase 2: Stripe Setup** | Create Stripe account/products/prices, add env vars, install `stripe` package | Small |
| **Phase 3: Webhook Handler** | Build `/api/webhooks/stripe` to sync subscription state | Medium |
| **Phase 4: Billing API** | Build checkout session + portal session endpoints, `/api/billing/status` | Medium |
| **Phase 5: Access Control** | Add `userHasAccess()` helper, update middleware + API routes | Medium |
| **Phase 6: Signup Flow** | Update signup to set exemption flag, add post-signup redirect logic | Small |
| **Phase 7: Frontend** | Build `/subscribe` page, `/account/billing` page, paywall banner | Medium |
| **Phase 8: Grandfathering** | Run migration to exempt existing users, add trigger for future teacher-student links | Small |
| **Phase 9: Testing** | End-to-end testing of all flows (exempt signup, paid signup, trial expiry, webhook handling) | Medium |

---

## Files That Need Changes

| File | Change |
|------|--------|
| `supabase/migrations/` | New migration for `subscriptions` table + `subscription_exempt` column |
| `package.json` | Add `stripe` dependency |
| `.env.local` | Add Stripe environment variables |
| `middleware.js` | Add subscription check for non-exempt users |
| `app/api/signup/route.js` | Set `subscription_exempt` based on teacher code presence |
| `app/api/billing/create-checkout/route.js` | **New** — Stripe Checkout session |
| `app/api/billing/create-portal/route.js` | **New** — Stripe Customer Portal session |
| `app/api/billing/status/route.js` | **New** — Current subscription status |
| `app/api/webhooks/stripe/route.js` | **New** — Stripe webhook handler |
| `lib/subscription.js` | **New** — `userHasAccess()` helper |
| `app/subscribe/page.js` | **New** — Pricing/checkout page |
| `app/account/billing/page.js` | **New** — Subscription management page |
| `app/components/PaywallBanner.js` | **New** — Trial expired / subscribe CTA |
| `app/components/NavBar.js` (or equivalent) | Add billing/account link for paying users |

---

## Cost Impact

| Item | Cost |
|------|------|
| Supabase Pro (recommended at scale) | $25/mo |
| Vercel Pro (recommended at scale) | $20/mo |
| Stripe fees | 2.9% + $0.30 per transaction |
| **Total fixed overhead** | **~$45/mo** |
| **Revenue at 100 students × $10/mo** | **$1,000/mo** |
| **Revenue at 500 students × $10/mo** | **$5,000/mo** |
