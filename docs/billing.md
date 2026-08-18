# Billing and subscription enforcement

> **Status: Living document.** Last verified against code + production: 2026-08-18.

How a Studyworks student gets access, how a trial ends, and what happens
when Stripe and the database disagree.

## The access rule

Access is decided by **one string**: `public.subscriptions.status`. A user
passes if it reads `active` or `trialing`.

With `entitlements_gate` **on** (its state in production), `proxy.js` and
`lib/subscription.js` both resolve through the `has_plan()` /
`effective_plan()` SQL resolver, whose Stripe candidate applies exactly
that status test. Verified against the live resolver:

| status | access |
| --- | --- |
| `trialing` | granted |
| `active` | granted |
| `past_due` | denied |
| `canceled` | denied |
| `unpaid` | denied |

`valid_status` permits only those five values. Stripe statuses outside the
set collapse to a non-access value in `lib/billing/stripe-mapping.ts`:
`incomplete_expired` → `canceled`; `incomplete` and `paused` → `unpaid`.
The bias is deliberate — deny a non-paying user rather than grant a lapsed
one.

`trial_end` and `current_period_end` are **display-only**. Nothing in the
enforcement path compares them to `now()`, so a trial ends only when a
webhook rewrites the status string. Adding a date guard to
`effective_plan()` is planned but not shipped; it must not land before
every live row has real period dates, or it will lock out paying students.

Gating is **page-level only**: `proxy.js` skips all `/api/` paths and no
API route calls `requirePlan`. Gated prefixes are `/practice`, `/review`,
`/dashboard`, `/tutor`, `/today`.

## The webhook contract

`app/api/webhooks/stripe/route.ts` is the only writer of access state.
Five rules hold it together; each exists because its absence caused a
real defect.

1. **Record before handling.** Every delivery is inserted into
   `stripe_webhook_events` keyed by Stripe's event id. A duplicate is a
   primary-key conflict and is skipped; a previously-failed event is
   re-attempted. The table is also the forensic log — without it, a
   dropped event is invisible once Vercel's log retention expires.
2. **Never drop silently.** An event that cannot be applied throws, the
   row keeps the error, and the handler returns **500** so Stripe retries.
   Returning 200 on an unhandled event is what lost a signup's trial data
   on 2026-08-13.
3. **`customer.subscription.*` owns status and dates.**
   `checkout.session.completed` only binds Stripe ids to a user. The two
   events race at signup with no ordering guarantee; because they no
   longer write overlapping fields, either order converges correctly.
4. **Resolve the user through a fallback chain**, starting at
   `subscription.metadata.user_id` (stamped by `create-checkout`), so a
   subscription event carries its own owner and can create the row itself.
5. **Match subscription-scoped events on `stripe_subscription_id`**, not
   the customer id — a customer who cancels and resubscribes keeps the
   same customer id, so a late `deleted` would otherwise cancel the new
   subscription.

`subscriptions.last_stripe_event_at` rejects out-of-order replays. Only
webhook handlers write it.

Required events on the Stripe endpoint: `checkout.session.completed`,
`customer.subscription.created`, `customer.subscription.updated`,
`customer.subscription.deleted`, `invoice.payment_failed`. The last of
these is the only thing that revokes access when a card fails at trial
end — if it is not enabled, a failed payment is invisible.

## Reconciliation

`/api/cron/reconcile-subscriptions` runs daily at 09:00 UTC
(`vercel.json`). It re-reads every tracked subscription from Stripe, the
source of truth, and corrects drift.

Drift is never routine: each corrected field means a webhook was missed,
so a run that changes anything emails `ADMIN_NOTIFICATION_EMAIL`. A clean
run is silent by design. Pass `?dryRun=1` to report without writing —
worth doing after any billing change.

Auth follows `/api/cron/repace`: `Authorization: Bearer CRON_SECRET`, or
an admin session for manual runs. It is a system-context cron and uses
`createServiceClient()` with a `service_role_bypass` audit log.

The job deliberately does **not** write `last_stripe_event_at`.
Reconciliation is not an event; stamping it would let this job suppress a
webhook that merely arrived late.

Logic lives in `lib/billing/reconcile.ts`, with the pure `diffSubscription`
separated from the I/O so it is unit-tested without Stripe
(`lib/billing/reconcile.test.mjs`). Status mapping is shared with the
webhook via `lib/billing/stripe-mapping.ts` — two writers of the same
column must not diverge.

## Operational notes

- Timestamps are compared at second granularity. The database carries
  sub-second precision and Stripe deals in whole seconds; an exact compare
  would report drift forever.
- A row whose subscription is missing from Stripe is set to `canceled`.
- A row with a customer id but no subscription id is repaired by listing
  the customer's subscriptions — this is the damage class the pre-2026-08
  handler produced.
- Trials are created by `create-checkout` with `trial_period_days: 7`,
  card collected up front.

## Not yet shipped

- Date guard in `effective_plan()` (see the caveat above).
- Student-facing trial UX and the `customer.subscription.trial_will_end`
  reminder email.
- Fixture tests driving the webhook route itself; today's coverage is the
  reconciliation logic plus schema-level checks.
