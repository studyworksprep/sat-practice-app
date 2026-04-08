-- Add unique constraint on user_id for subscriptions table
-- Required for upsert operations in the webhook handler
ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_user_id_unique UNIQUE (user_id);
