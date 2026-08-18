-- Stripe webhook idempotency + audit log (billing hardening, Phase 2).
--
-- WHY: the webhook handler had no record of what Stripe sent it. When a
-- 2026-08-13 signup landed with a NULL trial_end, reconstructing the cause
-- required cross-referencing Vercel runtime logs (short retention) against
-- row timestamps. One dropped event was invisible and unrecoverable.
--
-- This table is the durable record. Every delivery is written here BEFORE
-- it is handled, keyed by Stripe's own event id, so:
--   * a duplicate delivery is a primary-key conflict → skip, return 200
--   * a retry after a 5xx is safe (the row is claimed, not re-applied)
--   * an event that failed to apply is still on disk with its error
--
-- Retention is deliberate: payloads are small and rare (single-digit
-- events per day), and their value is forensic.

create table public.stripe_webhook_events (
  event_id          text primary key,
  event_type        text        not null,
  api_version       text,
  stripe_created_at timestamptz not null,
  payload           jsonb       not null,
  received_at       timestamptz not null default now(),
  processed_at      timestamptz,
  attempts          integer     not null default 0,
  error             text
);

comment on table public.stripe_webhook_events is
  'Every Stripe webhook delivery, keyed by Stripe event id. Insert-first '
  'gives idempotency (duplicate delivery = PK conflict) and a forensic '
  'audit trail. processed_at IS NULL means received but not successfully '
  'applied — that set is the alerting surface.';
comment on column public.stripe_webhook_events.stripe_created_at is
  'event.created from Stripe. Used to reject out-of-order replays against '
  'subscriptions.last_stripe_event_at.';
comment on column public.stripe_webhook_events.processed_at is
  'Set when the handler applied the event (or deliberately ignored an '
  'unhandled type). NULL with a non-null error = failed, Stripe retrying.';

-- The alerting surface: anything received but never applied.
create index stripe_webhook_events_unprocessed_idx
  on public.stripe_webhook_events (received_at desc)
  where processed_at is null;

create index stripe_webhook_events_type_idx
  on public.stripe_webhook_events (event_type, stripe_created_at desc);

-- RLS: no end user has any business reading raw billing payloads. The
-- handler uses the service role (which bypasses RLS); admins may read for
-- debugging. No policy grants insert/update to anyone else.
alter table public.stripe_webhook_events enable row level security;

drop policy if exists stripe_webhook_events_admin_read on public.stripe_webhook_events;
create policy stripe_webhook_events_admin_read on public.stripe_webhook_events
  for select to public using (public.is_admin());

-- Out-of-order guard. Stripe does not guarantee delivery order, so a
-- stale customer.subscription.updated can arrive after a newer one and
-- roll the row backwards. Handlers that write status/dates stamp this
-- column and refuse to apply an event older than it.
alter table public.subscriptions
  add column if not exists last_stripe_event_at timestamptz;

comment on column public.subscriptions.last_stripe_event_at is
  'event.created of the most recent Stripe event applied to this row. '
  'Handlers skip any event older than this (out-of-order delivery).';
