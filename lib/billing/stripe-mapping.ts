/**
 * Shared Stripe → database mapping.
 *
 * The webhook handler and the reconciliation cron both write
 * public.subscriptions. If they disagreed about what a Stripe status
 * means, the cron would fight the webhook and access would flap. They
 * import these functions rather than keeping private copies.
 */

/** Stripe sends either a bare id or an expanded object. */
export function idOf(ref: string | { id: string } | null | undefined): string | null {
  if (!ref) return null;
  return typeof ref === 'string' ? ref : ref.id;
}

/** Convert a Stripe Unix timestamp (seconds) to ISO, tolerating junk. */
export function unixToIso(unixSeconds: number | null | undefined): string | null {
  if (typeof unixSeconds !== 'number' || !Number.isFinite(unixSeconds)) return null;
  return new Date(unixSeconds * 1000).toISOString();
}

/** subscriptions.plan is CHECK-constrained to these four values. */
export function normalizePlan(plan: string | null | undefined): string {
  const allowed = ['free', 'student', 'teacher', 'school'];
  return plan && allowed.includes(plan) ? plan : 'student';
}

/**
 * Stripe status → the five values subscriptions.valid_status permits.
 *
 * Anything not clearly paid-up collapses to a non-access status.
 * 'incomplete' (card never cleared) and 'paused' (collection paused) both
 * deny deliberately — erring toward denying a non-paying user rather than
 * granting a lapsed one. Verified against effective_plan(): trialing and
 * active grant access; past_due, canceled and unpaid deny it.
 */
export function mapStripeStatus(stripeStatus: string): string {
  switch (stripeStatus) {
    case 'trialing':
      return 'trialing';
    case 'active':
      return 'active';
    case 'past_due':
      return 'past_due';
    case 'canceled':
    case 'incomplete_expired':
      return 'canceled';
    case 'unpaid':
    case 'incomplete':
    case 'paused':
      return 'unpaid';
    default:
      return 'unpaid';
  }
}

export interface StripeSubscriptionLike {
  id: string;
  status: string;
  trial_end?: number | null;
  cancel_at_period_end?: boolean | null;
  current_period_start?: number | null;
  current_period_end?: number | null;
  items?: { data?: Array<{ current_period_start?: number | null; current_period_end?: number | null }> } | null;
  metadata?: Record<string, string> | null;
  customer?: string | { id: string } | null;
}

/**
 * As of Stripe API version 2025-03-31.basil (the default for the
 * stripe-node v22 SDK this app pins), current_period_start/end were
 * removed from the top-level Subscription object and live on each
 * subscription item instead. Read the top level first, falling back to
 * the item, so this keeps working across API versions in either
 * direction.
 */
export function periodDatesOf(sub: StripeSubscriptionLike): {
  periodStart: number | null;
  periodEnd: number | null;
} {
  const item = sub.items?.data?.[0];
  return {
    periodStart: sub.current_period_start ?? item?.current_period_start ?? null,
    periodEnd: sub.current_period_end ?? item?.current_period_end ?? null,
  };
}
