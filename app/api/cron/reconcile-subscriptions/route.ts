// GET/POST /api/cron/reconcile-subscriptions — nightly billing safety net.
//
// Access to the platform is decided by the status string in
// public.subscriptions, and that string only changes when a Stripe
// webhook arrives. A single missed delivery therefore meant indefinite
// free access with nothing to detect it — which is exactly what happened
// to a 2026-08-13 signup whose subscription.created event was dropped.
//
// This job re-reads every tracked subscription from Stripe (the source of
// truth) and corrects drift. Because a correction means a webhook was
// missed, the run also emails the admin: it is monitoring as much as
// repair. A clean run is silent.
//
// Auth: Vercel Cron invokes GET with Authorization: Bearer CRON_SECRET
// (same contract as /api/cron/repace); an admin session may also trigger
// it manually. Pass ?dryRun=1 to report drift without writing — worth
// doing on the first run after any billing change.
//
// Service role: a system-context cron with no authenticated caller for
// the scheduled path, so it uses createServiceClient() directly
// (sanctioned pattern — docs/database.md "Safe service-role usage"); the
// structured service_role_bypass log below keeps audit parity with
// requireServiceRole.
import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/api/auth';
import { legacyApiRoute } from '@/lib/api/response';
import { logger } from '@/lib/api/logger';
import { createServiceClient } from '@/lib/supabase/server';
import { getStripe } from '@/lib/stripe';
import { reconcileSubscriptions, type SubscriptionRowLike } from '@/lib/billing/reconcile';
import type { Update } from '@/lib/types';
import { sendReconciliationAlert } from '@/lib/email/reconciliationAlert';

export const dynamic = 'force-dynamic';

async function handleReconcile(request: Request): Promise<NextResponse> {
  const cronSecret = request.headers.get('authorization')?.replace('Bearer ', '');
  const isCron = Boolean(cronSecret && cronSecret === process.env.CRON_SECRET);
  if (!isCron) {
    await requireRole(['admin']);
  }

  const url = new URL(request.url);
  const dryRun = url.searchParams.get('dryRun') === '1';

  const svc = createServiceClient();
  logger.info(
    {
      event: 'service_role_bypass',
      reason: 'nightly subscription reconciliation',
      user_id: null,
      caller_role: isCron ? 'cron' : 'admin',
    },
    'service_role_bypass',
  );

  let readError: string | null = null;

  const summary = await reconcileSubscriptions(
    {
      async fetchRows(): Promise<SubscriptionRowLike[]> {
        const { data, error } = await svc
          .from('subscriptions')
          .select(
            'id, user_id, status, plan, stripe_customer_id, stripe_subscription_id, current_period_start, current_period_end, trial_end, cancel_at_period_end',
          );
        if (error) {
          readError = error.message;
          return [];
        }
        return (data ?? []) as SubscriptionRowLike[];
      },
      async applyCorrection(rowId: string, fields: Record<string, unknown>): Promise<void> {
        const { error } = await svc
          .from('subscriptions')
          .update(fields as Update<'subscriptions'>)
          .eq('id', rowId);
        if (error) throw new Error(`correction failed: ${error.message}`);
      },
    },
    getStripe(),
    { dryRun },
  );

  if (readError) {
    logger.error({ event: 'subscription_reconcile_cron', err: readError }, 'could not read subscriptions');
    return NextResponse.json({ error: readError }, { status: 500 });
  }

  // Awaited, not fired and forgotten: a floating promise dies when the
  // Vercel instance freezes at the end of the request.
  const alert = await sendReconciliationAlert(summary);

  logger.info(
    {
      event: 'subscription_reconcile_cron',
      checked: summary.checked,
      inSync: summary.inSync,
      corrected: summary.corrected,
      missingInStripe: summary.missingInStripe,
      skipped: summary.skipped,
      errors: summary.errors,
      accessLosses: summary.accessLosses,
      dryRun: summary.dryRun,
      alerted: alert.sent,
    },
    'subscription_reconcile_cron',
  );

  return NextResponse.json({ ...summary, alerted: alert.sent });
}

export const GET = legacyApiRoute(handleReconcile);
export const POST = legacyApiRoute(handleReconcile);
