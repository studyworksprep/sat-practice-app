/**
 * Subscription reconciliation — the safety net under the webhook.
 *
 * WHY THIS EXISTS: access is decided by the status string in
 * public.subscriptions, and until now that string only ever changed when
 * a Stripe webhook arrived. A single missed delivery therefore meant
 * indefinite free access with nothing to detect it. Stripe is the source
 * of truth; this job re-reads it and corrects any row that drifted.
 *
 * Drift is not merely repaired, it is REPORTED: every correction means a
 * webhook was missed, so the summary doubles as monitoring. A run that
 * finds drift is a signal to go look at the endpoint, not a routine event.
 *
 * The pure diff is separated from the I/O so it can be unit-tested
 * without Stripe or a database (see reconcile.test.mjs).
 */
import {
  mapStripeStatus,
  normalizePlan,
  periodDatesOf,
  unixToIso,
  type StripeSubscriptionLike,
} from './stripe-mapping.ts';

export interface SubscriptionRowLike {
  id: string;
  user_id: string;
  status: string;
  plan: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  trial_end: string | null;
  cancel_at_period_end: boolean | null;
}

export interface FieldDrift {
  field: string;
  stored: string | null;
  actual: string | null;
}

export interface SubscriptionDiff {
  drifts: FieldDrift[];
  corrected: Record<string, unknown>;
}

/**
 * Compare a stored row against the live Stripe subscription.
 *
 * Timestamps are compared at second granularity: the database stores
 * sub-second precision (the old handler wrote `new Date()` for
 * current_period_start rather than Stripe's value) and Stripe deals in
 * whole seconds, so a naive string compare would report drift forever.
 *
 * NOTE: last_stripe_event_at is deliberately never written here.
 * Reconciliation is not an event; stamping it would let this job
 * suppress a legitimately newer webhook that simply arrived late.
 */
export function diffSubscription(
  row: SubscriptionRowLike,
  sub: StripeSubscriptionLike,
): SubscriptionDiff {
  const { periodStart, periodEnd } = periodDatesOf(sub);

  const expected: Record<string, string | boolean | null> = {
    status: mapStripeStatus(sub.status),
    plan: normalizePlan(sub.metadata?.plan ?? row.plan),
    stripe_subscription_id: sub.id,
    current_period_start: unixToIso(periodStart),
    current_period_end: unixToIso(periodEnd),
    trial_end: unixToIso(sub.trial_end),
    cancel_at_period_end: sub.cancel_at_period_end ?? false,
  };

  const stored: Record<string, string | boolean | null> = {
    status: row.status,
    plan: row.plan,
    stripe_subscription_id: row.stripe_subscription_id,
    current_period_start: row.current_period_start,
    current_period_end: row.current_period_end,
    trial_end: row.trial_end,
    cancel_at_period_end: row.cancel_at_period_end ?? false,
  };

  const TIMESTAMPS = new Set([
    'current_period_start',
    'current_period_end',
    'trial_end',
  ]);

  const drifts: FieldDrift[] = [];
  const corrected: Record<string, unknown> = {};

  for (const field of Object.keys(expected)) {
    const want = expected[field];
    const have = stored[field];
    const same = TIMESTAMPS.has(field)
      ? sameInstant(have as string | null, want as string | null)
      : have === want;

    if (!same) {
      drifts.push({ field, stored: display(have), actual: display(want) });
      corrected[field] = want;
    }
  }

  if (drifts.length > 0) corrected.updated_at = new Date().toISOString();

  return { drifts, corrected };
}

/** Equal to the second, tolerating null and differing string formats. */
function sameInstant(a: string | null, b: string | null): boolean {
  if (a === null || a === undefined) return b === null || b === undefined;
  if (b === null || b === undefined) return false;
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return false;
  return Math.floor(ta / 1000) === Math.floor(tb / 1000);
}

function display(v: string | boolean | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  return String(v);
}

/** Whether a status change takes access away from the user. */
const ACCESS_STATUSES = new Set(['active', 'trialing']);
export function isAccessLoss(fromStatus: string, toStatus: string): boolean {
  return ACCESS_STATUSES.has(fromStatus) && !ACCESS_STATUSES.has(toStatus);
}

export interface ReconcileRowResult {
  userId: string;
  subscriptionId: string | null;
  outcome:
    | 'in_sync'
    | 'corrected'
    | 'would_correct'
    | 'skipped_no_stripe_ref'
    | 'missing_in_stripe'
    | 'error';
  drifts?: FieldDrift[];
  accessLoss?: boolean;
  error?: string;
}

export interface ReconcileSummary {
  checked: number;
  inSync: number;
  corrected: number;
  missingInStripe: number;
  skipped: number;
  errors: number;
  accessLosses: number;
  dryRun: boolean;
  results: ReconcileRowResult[];
}

interface MinimalStripe {
  subscriptions: {
    retrieve(id: string): Promise<StripeSubscriptionLike>;
    list(params: { customer: string; status: 'all'; limit: number }): Promise<{ data: StripeSubscriptionLike[] }>;
  };
}

interface MinimalDb {
  fetchRows(): Promise<SubscriptionRowLike[]>;
  applyCorrection(rowId: string, fields: Record<string, unknown>): Promise<void>;
}

/**
 * Re-read every tracked subscription from Stripe and correct drift.
 *
 * Serial on purpose: single-digit subscriptions today, one Stripe call
 * each. Revisit if this reaches the hundreds.
 */
export async function reconcileSubscriptions(
  db: MinimalDb,
  stripe: MinimalStripe,
  opts: { dryRun?: boolean } = {},
): Promise<ReconcileSummary> {
  const dryRun = opts.dryRun ?? false;
  const rows = await db.fetchRows();

  const summary: ReconcileSummary = {
    checked: rows.length,
    inSync: 0,
    corrected: 0,
    missingInStripe: 0,
    skipped: 0,
    errors: 0,
    accessLosses: 0,
    dryRun,
    results: [],
  };

  for (const row of rows) {
    try {
      const sub = await resolveStripeSubscription(stripe, row);

      if (sub === 'no_reference') {
        summary.skipped++;
        summary.results.push({
          userId: row.user_id,
          subscriptionId: null,
          outcome: 'skipped_no_stripe_ref',
        });
        continue;
      }

      if (sub === 'missing') {
        // Stripe has no such subscription. Treat as canceled rather than
        // leaving a row that may still be granting access.
        summary.missingInStripe++;
        const accessLoss = isAccessLoss(row.status, 'canceled');
        if (accessLoss) summary.accessLosses++;
        if (!dryRun && row.status !== 'canceled') {
          await db.applyCorrection(row.id, {
            status: 'canceled',
            updated_at: new Date().toISOString(),
          });
        }
        summary.results.push({
          userId: row.user_id,
          subscriptionId: row.stripe_subscription_id,
          outcome: 'missing_in_stripe',
          accessLoss,
          drifts: [{ field: 'status', stored: row.status, actual: 'canceled' }],
        });
        continue;
      }

      const { drifts, corrected } = diffSubscription(row, sub);

      if (drifts.length === 0) {
        summary.inSync++;
        summary.results.push({
          userId: row.user_id,
          subscriptionId: sub.id,
          outcome: 'in_sync',
        });
        continue;
      }

      const statusDrift = drifts.find((d) => d.field === 'status');
      const accessLoss = statusDrift
        ? isAccessLoss(row.status, String(statusDrift.actual))
        : false;
      if (accessLoss) summary.accessLosses++;

      if (dryRun) {
        summary.results.push({
          userId: row.user_id,
          subscriptionId: sub.id,
          outcome: 'would_correct',
          drifts,
          accessLoss,
        });
        continue;
      }

      await db.applyCorrection(row.id, corrected);
      summary.corrected++;
      summary.results.push({
        userId: row.user_id,
        subscriptionId: sub.id,
        outcome: 'corrected',
        drifts,
        accessLoss,
      });
    } catch (err) {
      summary.errors++;
      summary.results.push({
        userId: row.user_id,
        subscriptionId: row.stripe_subscription_id,
        outcome: 'error',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return summary;
}

/**
 * Find the live subscription for a row. Falls back to listing by customer
 * for rows the old handler left without a subscription id.
 */
async function resolveStripeSubscription(
  stripe: MinimalStripe,
  row: SubscriptionRowLike,
): Promise<StripeSubscriptionLike | 'missing' | 'no_reference'> {
  if (row.stripe_subscription_id) {
    try {
      return await stripe.subscriptions.retrieve(row.stripe_subscription_id);
    } catch (err) {
      if (isResourceMissing(err)) return 'missing';
      throw err;
    }
  }

  if (row.stripe_customer_id) {
    const list = await stripe.subscriptions.list({
      customer: row.stripe_customer_id,
      status: 'all',
      limit: 1,
    });
    const found = list.data?.[0];
    return found ?? 'missing';
  }

  return 'no_reference';
}

function isResourceMissing(err: unknown): boolean {
  const e = err as { code?: string; statusCode?: number; type?: string } | null;
  return e?.code === 'resource_missing' || e?.statusCode === 404;
}
