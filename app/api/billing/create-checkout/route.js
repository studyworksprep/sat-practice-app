import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '../../../../lib/supabase/server';

let _stripe;
function getStripe() {
  if (!_stripe) _stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  return _stripe;
}

const PRICE_IDS = {
  student: process.env.STRIPE_STUDENT_PRICE_ID,
  teacher: process.env.STRIPE_TEACHER_PRICE_ID,
};

// POST /api/billing/create-checkout
// Creates a Stripe Checkout session for the authenticated user.
// Body: { plan: 'student' | 'teacher' }
export async function POST(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const plan = body.plan || 'student';
  const priceId = PRICE_IDS[plan];

  if (!priceId) {
    return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
  }

  // Check if user already has an active subscription
  const { data: existing } = await supabase
    .from('subscriptions')
    .select('id, status')
    .eq('user_id', user.id)
    .in('status', ['active', 'trialing'])
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: 'You already have an active subscription. Manage it from your account settings.' }, { status: 400 });
  }

  // Check if user is exempt
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, subscription_exempt, email')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.subscription_exempt || ['admin', 'manager'].includes(profile?.role)) {
    return NextResponse.json({ error: 'Your account has full access. No subscription needed.' }, { status: 400 });
  }

  const origin = request.headers.get('origin') || process.env.NEXT_PUBLIC_SITE_URL || 'https://studyworks.io';

  const session = await getStripe().checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    customer_email: profile?.email || user.email,
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: {
      user_id: user.id,
      plan,
    },
    success_url: `${origin}/dashboard?checkout=success`,
    cancel_url: `${origin}/subscribe?checkout=canceled`,
    subscription_data: {
      metadata: {
        user_id: user.id,
        plan,
      },
      trial_period_days: 7,
    },
  });

  return NextResponse.json({ url: session.url });
}
