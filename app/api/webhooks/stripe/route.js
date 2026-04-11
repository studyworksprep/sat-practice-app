import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createServiceClient } from '../../../../lib/supabase/server';

let _stripe;
function getStripe() {
  if (!_stripe) _stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  return _stripe;
}

// Disable Next.js body parsing — Stripe needs the raw body for signature verification
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/webhooks/stripe
// Handles Stripe webhook events for the subscription lifecycle.
export async function POST(request) {
  const body = await request.text();
  const sig = request.headers.get('stripe-signature');

  let event;
  try {
    event = getStripe().webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err.message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const supabase = createServiceClient();

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.metadata?.user_id;
        const plan = session.metadata?.plan || 'student';

        if (!userId) break;

        // Create or update subscription row
        const { error } = await supabase
          .from('subscriptions')
          .upsert({
            user_id: userId,
            stripe_customer_id: session.customer,
            stripe_subscription_id: session.subscription,
            plan,
            status: 'active',
            current_period_start: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id' });

        if (error) console.error('Error creating subscription:', error.message);
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const customerId = subscription.customer;

        // Find user by stripe_customer_id
        const { data: existing } = await supabase
          .from('subscriptions')
          .select('id, user_id')
          .eq('stripe_customer_id', customerId)
          .maybeSingle();

        if (!existing) break;

        const status = mapStripeStatus(subscription.status);
        await supabase
          .from('subscriptions')
          .update({
            stripe_subscription_id: subscription.id,
            status,
            current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
            trial_end: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
            cancel_at_period_end: subscription.cancel_at_period_end || false,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);

        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const customerId = subscription.customer;

        await supabase
          .from('subscriptions')
          .update({
            status: 'canceled',
            cancel_at_period_end: false,
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_customer_id', customerId);

        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const customerId = invoice.customer;

        await supabase
          .from('subscriptions')
          .update({
            status: 'past_due',
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_customer_id', customerId);

        break;
      }

      default:
        // Unhandled event type — ignore
        break;
    }
  } catch (err) {
    console.error(`Error handling webhook event ${event.type}:`, err.message);
    return NextResponse.json({ error: 'Webhook handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

function mapStripeStatus(stripeStatus) {
  switch (stripeStatus) {
    case 'trialing': return 'trialing';
    case 'active': return 'active';
    case 'past_due': return 'past_due';
    case 'canceled':
    case 'unpaid': return 'canceled';
    default: return 'unpaid';
  }
}
