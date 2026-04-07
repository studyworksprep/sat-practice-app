/**
 * Check whether a user has active access to the platform.
 *
 * Access is granted if any of these are true:
 *   1. User role is admin or manager (always exempt)
 *   2. User has subscription_exempt = true (your tutors + their students)
 *   3. User has an active or trialing subscription
 *
 * @param {Object} supabase — Supabase client
 * @param {string} userId
 * @returns {{ hasAccess: boolean, reason: string, plan?: string }}
 */
export async function userHasAccess(supabase, userId) {
  // 1. Check role and exemption flag in one query
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, subscription_exempt')
    .eq('id', userId)
    .maybeSingle();

  if (!profile) return { hasAccess: false, reason: 'no_profile' };

  if (['admin', 'manager'].includes(profile.role)) {
    return { hasAccess: true, reason: 'role' };
  }

  if (profile.subscription_exempt) {
    return { hasAccess: true, reason: 'exempt' };
  }

  // 2. Check for active subscription
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('status, plan, current_period_end, trial_end')
    .eq('user_id', userId)
    .in('status', ['active', 'trialing'])
    .maybeSingle();

  if (sub) {
    return { hasAccess: true, reason: 'subscription', plan: sub.plan };
  }

  return { hasAccess: false, reason: 'no_subscription' };
}
