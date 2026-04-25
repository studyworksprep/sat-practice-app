import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api/auth';
import { legacyApiRoute } from '@/lib/api/response';
import { userHasAccess } from '../../../../lib/subscription';

// GET /api/billing/status
// Returns the current user's subscription/access status.
export const GET = legacyApiRoute(async () => {
  const { user, supabase } = await requireUser();

  const access = await userHasAccess(supabase, user.id);

  // Get subscription details if they have one
  let subscription = null;
  if (access.reason === 'subscription') {
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('plan, status, current_period_end, trial_end, cancel_at_period_end')
      .eq('user_id', user.id)
      .in('status', ['active', 'trialing'])
      .maybeSingle();
    subscription = sub;
  }

  return NextResponse.json({
    hasAccess: access.hasAccess,
    reason: access.reason,
    plan: access.plan || null,
    subscription,
  });
});
