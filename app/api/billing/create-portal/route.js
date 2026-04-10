import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '../../../../lib/supabase/server';

let _stripe;
function getStripe() {
  if (!_stripe) _stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  return _stripe;
}

// POST /api/billing/create-portal
// Creates a Stripe Customer Portal session for subscription management.
export async function POST(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Get the user's stripe customer ID
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!sub?.stripe_customer_id) {
    return NextResponse.json({ error: 'No subscription found' }, { status: 404 });
  }

  const origin = request.headers.get('origin') || process.env.NEXT_PUBLIC_SITE_URL || 'https://studyworks.io';

  const session = await getStripe().billingPortal.sessions.create({
    customer: sub.stripe_customer_id,
    return_url: `${origin}/dashboard`,
  });

  return NextResponse.json({ url: session.url });
}
