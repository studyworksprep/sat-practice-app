-- =========================================================
-- Shared trigger helpers
-- =========================================================
-- Generic utility functions referenced by multiple migrations.
-- Historically these lived in the production database without
-- ever being committed to the migration directory — one more
-- instance of the schema drift that Phase 1 item 1 was
-- designed to surface. This file backfills them.
--
-- Sorts with a 2022-01-01 prefix so it runs before every other
-- migration in the replay.
-- =========================================================

-- Standard "bump updated_at on every update" trigger function.
-- Referenced by 20230101000014_add_subscription_system.sql and
-- questions_v2_phase1_schema.sql (and probably others) as the
-- trigger body for their updated_at columns.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Generic BEFORE UPDATE trigger that bumps the row''s updated_at column to now(). Used by subscriptions, questions_v2, and other tables with an updated_at column.';
