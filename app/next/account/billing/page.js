// Subscription status surface. Server Component — resolves access
// from the database directly and only delegates to a client island
// for the "Manage Subscription" button (which has to POST to
// /api/billing/create-portal and follow the returned URL). The
// legacy page fetched /api/billing/status in a useEffect, flashing
// "Loading…" before the actual content rendered; this version
// renders the final state in the first paint.

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { userHasAccess } from '@/lib/subscription';
import { Button } from '@/lib/ui/Button';
import { Card } from '@/lib/ui/Card';
import { ManagePortalButton } from './ManagePortalButton';
import s from './Billing.module.css';

export const dynamic = 'force-dynamic';

export default async function BillingPage() {
  let ctx;
  try {
    ctx = await requireUser();
  } catch {
    redirect('/login?next=/account/billing');
  }
  const { user, supabase } = ctx;

  const access = await userHasAccess(supabase, user.id);

  let subscription = null;
  if (access.reason === 'subscription') {
    const { data } = await supabase
      .from('subscriptions')
      .select('plan, status, current_period_end, trial_end, cancel_at_period_end')
      .eq('user_id', user.id)
      .in('status', ['active', 'trialing'])
      .maybeSingle();
    subscription = data;
  }

  const formatDate = (iso) =>
    new Date(iso).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });

  return (
    <main className={s.page}>
      <div className={s.header}>
        <h1 className={s.h1}>Billing</h1>
        <Button href="/dashboard" variant="secondary" size="sm">Dashboard</Button>
      </div>

      <Card className={s.card}>
        <section className={s.statusBlock}>
          <div className={s.eyebrow}>Account status</div>
          {access.hasAccess ? (
            <div className={s.statusRow}>
              <span className={`${s.dot} ${s.dotActive}`} aria-hidden="true" />
              <span className={s.statusLabel}>Active</span>
              {access.reason === 'exempt' && (
                <span className={`${s.pill} ${s.pillExempt}`}>Exempt</span>
              )}
              {access.reason === 'role' && (
                <span className={`${s.pill} ${s.pillRole}`}>{access.plan || 'Admin'}</span>
              )}
              {access.reason === 'subscription' && (
                <span className={`${s.pill} ${s.pillSub}`}>
                  {subscription?.plan ?? 'Subscribed'}
                </span>
              )}
            </div>
          ) : (
            <div className={s.statusRow}>
              <span className={`${s.dot} ${s.dotInactive}`} aria-hidden="true" />
              <span className={s.statusLabel}>No active subscription</span>
            </div>
          )}
        </section>

        {subscription && (
          <section className={s.subDetails}>
            <Row label="Plan" value={subscription.plan} capitalize />
            <Row
              label="Status"
              value={subscription.status === 'trialing' ? 'Free Trial' : subscription.status}
              tone={
                subscription.status === 'active' ? 'good'
                : subscription.status === 'trialing' ? 'accent'
                : 'warn'
              }
              capitalize
            />
            {subscription.trial_end && subscription.status === 'trialing' && (
              <Row label="Trial ends" value={formatDate(subscription.trial_end)} />
            )}
            {subscription.current_period_end && (
              <Row
                label={subscription.cancel_at_period_end ? 'Access until' : 'Next billing date'}
                value={formatDate(subscription.current_period_end)}
              />
            )}
            {subscription.cancel_at_period_end && (
              <div className={s.cancelNote}>
                Your subscription will cancel at the end of the current period.
              </div>
            )}
          </section>
        )}

        {access.reason === 'exempt' && (
          <section className={s.exemptNote}>
            Your account has full platform access at no cost through Studyworks Prep. No
            subscription or payment is required.
          </section>
        )}

        <section className={s.actions}>
          {subscription && <ManagePortalButton />}
          {!access.hasAccess && (
            <Button href="/subscribe" variant="primary" size="sm">
              Choose a plan
            </Button>
          )}
        </section>
      </Card>
    </main>
  );
}

function Row({ label, value, tone, capitalize }) {
  const valueCls = [
    s.rowValue,
    tone === 'good' ? s.toneGood : '',
    tone === 'accent' ? s.toneAccent : '',
    tone === 'warn' ? s.toneWarn : '',
    capitalize ? s.capitalize : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={s.row}>
      <span className={s.rowLabel}>{label}</span>
      <span className={valueCls}>{value}</span>
    </div>
  );
}
