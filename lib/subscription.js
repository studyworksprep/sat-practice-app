/**
 * Check whether a user has active access to the platform.
 *
 * With the §1.5 entitlements_gate OFF (the rollback lever), access is
 * the legacy set:
 *   1. User role is admin or manager (staff)
 *   2. A Studyworks tutor (role teacher + subscription_exempt)
 *   3. A sponsored student (is_sponsored_student(): a sponsored roster
 *      link to a still-exempt tutor — migration 20261114011641)
 *   4. An active or trialing subscription
 *   5. Legacy only: any profile still carrying subscription_exempt
 *      (pre-2026-11 students had it set by a one-way roster trigger;
 *      with the gate ON it never grants anything)
 *
 * With the gate ON, the ACCESS VERDICT comes from the has_plan() SQL
 * resolver instead (the same one proxy.js consults — the two must
 * agree, or a user the proxy bounced to /subscribe could be bounced
 * straight back by this page's redirect-away, looping). The
 * `reason`/`plan` fields still derive from the legacy checks because
 * the account + billing UIs render provenance off them (exempt pill,
 * admin pill, Stripe details); access granted by the resolver alone
 * (e.g. a manual grant) reports reason 'entitlement'. A resolver ERROR
 * falls back to the legacy verdict —
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

  // 'exempt' is the provenance the account/billing pages render as
  // "full access at no cost through Studyworks Prep" — true for a
  // Studyworks tutor and for a sponsored student alike.
  if (profile.role === 'teacher' && profile.subscription_exempt) {
    return { hasAccess: true, reason: 'exempt' };
  }

  const { data: sponsored } = await supabase.rpc('is_sponsored_student', { p_user: userId });
  if (sponsored === true) {
    return { hasAccess: true, reason: 'exempt' };
  }

  // Before the stale student flag, so a formerly sponsored student who
  // now pays sees their subscription (and the portal button).
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('status, plan, current_period_end, trial_end')
    .eq('user_id', userId)
    .in('status', ['active', 'trialing'])
    .maybeSingle();

  if (sub) {
    return { hasAccess: true, reason: 'subscription', plan: sub.plan };
  }

  if (gateVerdict === null && profile.subscription_exempt) {
    return { hasAccess: true, reason: 'exempt' };
  }

  return gateVerdict === true
    ? { hasAccess: true, reason: 'entitlement' }
    : { hasAccess: false, reason: 'no_subscription' };
}
