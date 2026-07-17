/**
 * Check whether a user has active access to the platform.
 *
 * With the §1.5 entitlements_gate OFF (the default), access is the
 * legacy trio:
 *   1. User role is admin or manager (staff)
 *   2. User has subscription_exempt = true (Studyworks tutors + the
 *      students they sponsor)
 *   3. User has an active or trialing subscription
 *
 * With the gate ON, the ACCESS VERDICT comes from the has_plan() SQL
 * resolver instead (the same one proxy.js consults — the two must
 * agree, or a user the proxy bounced to /subscribe could be bounced
 * straight back by this page's redirect-away, looping). The
 * `reason`/`plan` fields still derive from the legacy checks because
 * the account + billing UIs render provenance off them (exempt pill,
 * admin pill, Stripe details); access granted by the resolver alone
 * (e.g. a sponsored roster edge or a manual grant) reports reason
 * 'entitlement'. A resolver ERROR falls back to the legacy verdict —
 * a failed query must never change who gets in.
 *
 * @param {Object} supabase — Supabase client (the caller's RLS-scoped one)
 * @param {string} userId
 * @returns {Promise<{ hasAccess: boolean, reason: string, plan?: string }>}
 */
import { entitlementsGateEnabled } from './flags';
import { getFlag } from './flags-server';

export async function userHasAccess(supabase, userId) {
  let gateVerdict = null; // null = gate off or resolver unavailable

  if (entitlementsGateEnabled(await getFlag('entitlements_gate'))) {
    const { data: hasFull, error } = await supabase.rpc('has_plan', {
      p_user: userId,
      p_min_plan: 'full',
    });
    if (!error) gateVerdict = Boolean(hasFull);
  }

  if (gateVerdict === false) {
    // Same reason string the legacy path uses for "needs to subscribe"
    // so the subscribe/billing surfaces don't need a new branch.
    return { hasAccess: false, reason: 'no_subscription' };
  }

  // Legacy checks — the verdict when the gate is off, and the
  // provenance when the gate granted access.
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, subscription_exempt')
    .eq('id', userId)
    .maybeSingle();

  if (!profile) {
    return gateVerdict === true
      ? { hasAccess: true, reason: 'entitlement' }
      : { hasAccess: false, reason: 'no_profile' };
  }

  if (['admin', 'manager'].includes(profile.role)) {
    return { hasAccess: true, reason: 'role' };
  }

  if (profile.subscription_exempt) {
    return { hasAccess: true, reason: 'exempt' };
  }

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('status, plan, current_period_end, trial_end')
    .eq('user_id', userId)
    .in('status', ['active', 'trialing'])
    .maybeSingle();

  if (sub) {
    return { hasAccess: true, reason: 'subscription', plan: sub.plan };
  }

  return gateVerdict === true
    ? { hasAccess: true, reason: 'entitlement' }
    : { hasAccess: false, reason: 'no_subscription' };
}
