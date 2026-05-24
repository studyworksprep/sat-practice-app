-- Track when the post-confirmation welcome email was sent to a
-- student, so the /auth/callback handler can stay idempotent.
--
-- The callback exchanges a code for a session every time it's hit
-- (the email-confirmation link is one-shot, but a misclick or a
-- Supabase retry could still land twice). Gating the send on
-- welcome_email_sent_at IS NULL means at most one email per user
-- without any extra bookkeeping.
--
-- Backfill: existing users are treated as "already sent" so the
-- migration doesn't cause a blast of welcome emails to everyone on
-- their next login.

alter table public.profiles
  add column if not exists welcome_email_sent_at timestamptz;

-- Mark everyone who already exists as having received it, so the
-- gate in the callback handler only fires for new signups going
-- forward. New rows default to NULL via the column default.
update public.profiles
  set welcome_email_sent_at = now()
  where welcome_email_sent_at is null;
