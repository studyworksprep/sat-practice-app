import { NextResponse } from 'next/server';
import { createClient } from '../../../../lib/supabase/server';
import { userHasAccess } from '../../../../lib/subscription';

// GET /api/billing/status
// Returns the current user's subscription/access status.
export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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
}
