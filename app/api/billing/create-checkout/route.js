import { teacherCheckoutItem } from '@/lib/billing/teacher-pricing.mjs';
import { studentCheckoutItem } from '@/lib/billing/student-pricing.mjs';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { requireUser } from '@/lib/api/auth';
import { legacyApiRoute } from '@/lib/api/response';
import { userHasAccess } from '@/lib/subscription';

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
export const POST = legacyApiRoute(async (request) => {
  const { user, supabase } = await requireUser();

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

  // Refuse only a user who already has access (staff, a Studyworks
  // tutor, a sponsored student, an entitlement). This used to test
  // profiles.subscription_exempt, which the one-way roster trigger left
  // set on students whose sponsorship had ended — so they could neither
  // get in nor pay.
  const access = await userHasAccess(supabase, user.id);
  if (access.hasAccess) {
    return NextResponse.json({ error: 'Your account has full access. No subscription needed.' }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('email')
    .eq('id', user.id)
    .maybeSingle();

  const origin = request.headers.get('origin') || process.env.NEXT_PUBLIC_SITE_URL || 'https://studyworks.io';

  const session = await getStripe().checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    customer_email: profile?.email || user.email,
    line_items: [plan === 'student'
      ? studentCheckoutItem(priceId, user.created_at)
      : teacherCheckoutItem(priceId, user.created_at)],
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
});
