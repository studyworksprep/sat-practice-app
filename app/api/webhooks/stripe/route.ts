/**
 * Stripe webhook handler — the only writer of subscription access state.
 *
 * DESIGN (billing hardening, Phases 1–2). The rules below exist because
 * the previous handler silently lost events; each one is load-bearing.
 *
 * 1. EVERY delivery is recorded in stripe_webhook_events BEFORE it is
 *    handled, keyed by Stripe's event id. A duplicate delivery is a
 *    primary-key conflict → skip. A delivery that already failed is
 *    re-attempted. Nothing Stripe sends us is invisible any more.
 *
 * 2. NOTHING IS EVER SILENTLY DROPPED. The old handler bailed with
 *    `if (!existing) break;` and still returned 200, so Stripe never
 *    retried and the event vanished. Now an event we cannot apply throws,
 *    the row keeps the error, and we return 500 so Stripe retries.
 *
 * 3. customer.subscription.* IS THE SOLE WRITER OF status AND DATES.
 *    checkout.session.completed only binds Stripe ids to a user. The two
 *    events race at signup with no ordering guarantee; because they no
 *    longer write overlapping fields, either order converges to the same
 *    correct row. The old handler hardcoded status:'active' here, which
 *    is how a trialing student was recorded as a paying one.
 *
 * 4. USER RESOLUTION IS A FALLBACK CHAIN, not a single customer-id
 *    lookup. create-checkout stamps subscription_data.metadata.user_id,
 *    so a subscription event carries its own owner and can create the row
 *    itself even if it arrives first.
 *
 * 5. SUBSCRIPTION-SCOPED EVENTS MATCH ON stripe_subscription_id, not
 *    stripe_customer_id. A customer who cancels and resubscribes keeps
 *    the same customer id, so a late 'deleted' for the old subscription
 *    would otherwise cancel the new one.
 *
 * 6. OUT-OF-ORDER EVENTS ARE REJECTED via subscriptions.last_stripe_event_at.
 *    Stripe does not guarantee order; without this a stale 'updated' can
 *    roll a row backwards.
 */
import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getStripe } from '@/lib/stripe';
import { logger } from '@/lib/api/logger';
import { createServiceClient } from '@/lib/supabase/server';
import {
  idOf,
  mapStripeStatus,
  normalizePlan,
  periodDatesOf,
  unixToIso,
  type StripeSubscriptionLike,
} from '@/lib/billing/stripe-mapping';
import type { Json } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ServiceClient = ReturnType<typeof createServiceClient>;

const PG_UNIQUE_VIOLATION = '23505';

export async function POST(request: Request): Promise<NextResponse> {
  const body = await request.text();
  const sig = request.headers.get('stripe-signature');
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !secret) {
    logger.error(
      { event: 'stripe.webhook.misconfigured', hasSignature: Boolean(sig), hasSecret: Boolean(secret) },
      'stripe webhook missing signature or secret',
    );
    return NextResponse.json({ error: 'Not configured' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, sig, secret) as Stripe.Event;
  } catch (err) {
    // A bad signature is never retryable — 400 tells Stripe to stop.
    logger.warn({ event: 'stripe.webhook.bad_signature', err }, 'stripe webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const svc = createServiceClient();
  const claim = await claimEvent(svc, event);

  if (claim === 'duplicate') {
    logger.info(
      { event: 'stripe.webhook.duplicate', stripeEventId: event.id, stripeEventType: event.type },
      'stripe webhook already processed, skipping',
    );
    return NextResponse.json({ received: true, skipped: 'duplicate' });
  }

  if (claim === 'unrecordable') {
    // We could not even write the audit row. Refuse the delivery rather
    // than handle an event we cannot account for; Stripe will retry.
    logger.error(
      { event: 'stripe.webhook.claim_failed', stripeEventId: event.id, stripeEventType: event.type },
      'could not record stripe event',
    );
    return NextResponse.json({ error: 'Could not record event' }, { status: 500 });
  }

  try {
    const outcome = await handleEvent(svc, event);

    await svc
      .from('stripe_webhook_events')
      .update({ processed_at: new Date().toISOString(), error: null })
      .eq('event_id', event.id);

    logger.info(
      { event: 'stripe.webhook.processed', stripeEventId: event.id, stripeEventType: event.type, outcome },
      'stripe webhook processed',
    );
    return NextResponse.json({ received: true, outcome });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    await svc.from('stripe_webhook_events').update({ error: message }).eq('event_id', event.id);

    logger.error(
      { event: 'stripe.webhook.handler_error', stripeEventId: event.id, stripeEventType: event.type, err },
      'stripe webhook handler failed',
    );
    // 500 so Stripe retries. The unprocessed row is the alerting surface.
    return NextResponse.json({ error: 'Webhook handler error' }, { status: 500 });
  }
}

/**
 * Record the delivery. Returns 'claimed' to proceed, 'duplicate' if this
 * event was already applied, or 'unrecordable' if the audit write failed.
 *
 * A previously-FAILED event is re-claimed rather than skipped: that is
 * precisely the case Stripe's retry exists for.
 */
async function claimEvent(
  svc: ServiceClient,
  event: Stripe.Event,
): Promise<'claimed' | 'duplicate' | 'unrecordable'> {
  const { error } = await svc.from('stripe_webhook_events').insert({
    event_id: event.id,
    event_type: event.type,
    api_version: event.api_version ?? null,
    stripe_created_at: new Date(event.created * 1000).toISOString(),
    payload: event as unknown as Json,
    attempts: 1,
  });

  if (!error) return 'claimed';
  if (error.code !== PG_UNIQUE_VIOLATION) return 'unrecordable';

  const { data: prior, error: readErr } = await svc
    .from('stripe_webhook_events')
    .select('processed_at, attempts')
    .eq('event_id', event.id)
    .maybeSingle();

  if (readErr) return 'unrecordable';
  if (prior?.processed_at) return 'duplicate';

  await svc
    .from('stripe_webhook_events')
    .update({ attempts: (prior?.attempts ?? 1) + 1 })
    .eq('event_id', event.id);

  return 'claimed';
}

async function handleEvent(svc: ServiceClient, event: Stripe.Event): Promise<string> {
  switch (event.type) {
    case 'checkout.session.completed':
      return bindCheckoutSession(svc, event.data.object as Stripe.Checkout.Session);

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      return applySubscription(svc, event.data.object as Stripe.Subscription, event.created);

    case 'invoice.payment_failed':
      return applyPaymentFailure(svc, event.data.object as Stripe.Invoice, event.created);

    default:
      // Recorded in stripe_webhook_events and marked processed. If we ever
      // need it, the payload is already on disk.
      return 'ignored:unhandled_type';
  }
}

/**
 * checkout.session.completed — binds Stripe ids to the user and NOTHING
 * else. Status and dates belong to customer.subscription.*.
 *
 * On a first-time signup this may be the row's INSERT, which needs a
 * status because the column is NOT NULL. 'trialing' is honest rather than
 * a guess: create-checkout sets trial_period_days on every session, so a
 * completed checkout is by definition a trial. The subscription event
 * overwrites it with Stripe's truth moments later either way.
 */
async function bindCheckoutSession(svc: ServiceClient, session: Stripe.Checkout.Session): Promise<string> {
  if (session.mode !== 'subscription') return 'ignored:not_a_subscription';

  const customerId = idOf(session.customer);
  const subscriptionId = idOf(session.subscription);
  const plan = normalizePlan(session.metadata?.plan);

  const userId = await resolveUserId(svc, {
    metadataUserId: session.metadata?.user_id,
    subscriptionId,
    customerId,
  });

  if (!userId) {
    throw new Error(`checkout.session.completed: cannot resolve user (customer=${customerId ?? 'none'})`);
  }
  if (!customerId) {
    throw new Error('checkout.session.completed: session has no customer id');
  }

  const { data: existing } = await svc
    .from('subscriptions')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();

  if (existing) {
    const { error } = await svc
      .from('subscriptions')
      .update({
        stripe_customer_id: customerId,
        ...(subscriptionId ? { stripe_subscription_id: subscriptionId } : {}),
        plan,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);
    if (error) throw new Error(`checkout binding update failed: ${error.message}`);
    return 'bound:updated';
  }

  const { error } = await svc.from('subscriptions').insert({
    user_id: userId,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscriptionId,
    plan,
    status: 'trialing',
  });

  // The subscription event may have inserted the row between our read and
  // this write. That is a success, not a failure — it owns status anyway.
  if (error?.code === PG_UNIQUE_VIOLATION) return 'bound:raced_insert';
  if (error) throw new Error(`checkout binding insert failed: ${error.message}`);
  return 'bound:inserted';
}

/**
 * customer.subscription.created / updated / deleted — the sole writer of
 * status, plan dates and trial_end.
 */
async function applySubscription(
  svc: ServiceClient,
  subscription: Stripe.Subscription,
  eventCreated: number,
): Promise<string> {
  const customerId = idOf(subscription.customer);

  const userId = await resolveUserId(svc, {
    metadataUserId: subscription.metadata?.user_id,
    subscriptionId: subscription.id,
    customerId,
  });

  if (!userId) {
    throw new Error(`subscription event: cannot resolve user (subscription=${subscription.id})`);
  }

  const { data: existing } = await svc
    .from('subscriptions')
    .select('id, last_stripe_event_at, plan')
    .eq('user_id', userId)
    .maybeSingle();

  const eventAt = new Date(eventCreated * 1000);
  if (existing?.last_stripe_event_at && new Date(existing.last_stripe_event_at) > eventAt) {
    return 'skipped:out_of_order';
  }

  const { periodStart, periodEnd } = periodDatesOf(
    subscription as unknown as StripeSubscriptionLike,
  );

  const fields = {
    stripe_customer_id: customerId ?? undefined,
    stripe_subscription_id: subscription.id,
    status: mapStripeStatus(subscription.status),
    plan: normalizePlan(subscription.metadata?.plan ?? existing?.plan),
    current_period_start: unixToIso(periodStart),
    current_period_end: unixToIso(periodEnd),
    trial_end: unixToIso(subscription.trial_end),
    cancel_at_period_end: subscription.cancel_at_period_end ?? false,
    last_stripe_event_at: eventAt.toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    const { error } = await svc.from('subscriptions').update(fields).eq('id', existing.id);
    if (error) throw new Error(`subscription update failed: ${error.message}`);
    return `applied:${fields.status}`;
  }

  if (!customerId) {
    throw new Error(`subscription event: no customer id to insert (subscription=${subscription.id})`);
  }

  const { error } = await svc
    .from('subscriptions')
    .insert({ ...fields, user_id: userId, stripe_customer_id: customerId });
  if (error) throw new Error(`subscription insert failed: ${error.message}`);
  return `applied:${fields.status}:inserted`;
}

/**
 * invoice.payment_failed — the event that actually revokes access when a
 * card fails at trial end. Matches on the subscription id when the
 * payload carries one, falling back to the customer id.
 */
async function applyPaymentFailure(
  svc: ServiceClient,
  invoice: Stripe.Invoice,
  eventCreated: number,
): Promise<string> {
  const subscriptionId = invoiceSubscriptionId(invoice);
  const customerId = idOf(invoice.customer);

  let query = svc.from('subscriptions').select('id, last_stripe_event_at');
  if (subscriptionId) {
    query = query.eq('stripe_subscription_id', subscriptionId);
  } else if (customerId) {
    query = query.eq('stripe_customer_id', customerId);
  } else {
    throw new Error('invoice.payment_failed: no subscription or customer id on invoice');
  }

  const { data: existing, error: readErr } = await query.maybeSingle();
  if (readErr) throw new Error(`payment failure lookup failed: ${readErr.message}`);
  if (!existing) {
    throw new Error(
      `invoice.payment_failed: no subscription row (subscription=${subscriptionId ?? 'none'}, customer=${customerId ?? 'none'})`,
    );
  }

  const eventAt = new Date(eventCreated * 1000);
  if (existing.last_stripe_event_at && new Date(existing.last_stripe_event_at) > eventAt) {
    return 'skipped:out_of_order';
  }

  const { error } = await svc
    .from('subscriptions')
    .update({
      status: 'past_due',
      last_stripe_event_at: eventAt.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', existing.id);

  if (error) throw new Error(`payment failure update failed: ${error.message}`);
  return 'applied:past_due';
}

/**
 * Resolve the owning user. Ordered cheapest-and-most-authoritative first;
 * the Stripe email lookup is last because it costs an API call.
 */
async function resolveUserId(
  svc: ServiceClient,
  opts: { metadataUserId?: string | null; subscriptionId?: string | null; customerId?: string | null },
): Promise<string | null> {
  const { metadataUserId, subscriptionId, customerId } = opts;

  // 1. Stamped by create-checkout onto both the session and the
  //    subscription, so it survives whichever event arrives first.
  if (metadataUserId) {
    const { data } = await svc.from('profiles').select('id').eq('id', metadataUserId).maybeSingle();
    if (data?.id) return data.id;
  }

  // 2. An existing row for this exact subscription.
  if (subscriptionId) {
    const { data } = await svc
      .from('subscriptions')
      .select('user_id')
      .eq('stripe_subscription_id', subscriptionId)
      .maybeSingle();
    if (data?.user_id) return data.user_id;
  }

  // 3. An existing row for this customer.
  if (customerId) {
    const { data } = await svc
      .from('subscriptions')
      .select('user_id')
      .eq('stripe_customer_id', customerId)
      .maybeSingle();
    if (data?.user_id) return data.user_id;
  }

  // 4. Last resort: the customer's email against profiles.
  if (customerId) {
    try {
      const customer = await getStripe().customers.retrieve(customerId);
      const email = customer && !customer.deleted ? customer.email : null;
      if (email) {
        const { data } = await svc.from('profiles').select('id').ilike('email', email).maybeSingle();
        if (data?.id) return data.id;
      }
    } catch {
      // Fall through to null — the caller throws and Stripe retries.
    }
  }

  return null;
}

/**
 * The 2025-03-31.basil API version removed Invoice.subscription in favour
 * of invoice.parent.subscription_details.subscription. Read both so this
 * survives an API version bump in either direction.
 */
function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const shape = invoice as unknown as {
    subscription?: string | { id: string } | null;
    parent?: { subscription_details?: { subscription?: string | { id: string } | null } | null } | null;
  };
  return idOf(shape.subscription) ?? idOf(shape.parent?.subscription_details?.subscription);
}
