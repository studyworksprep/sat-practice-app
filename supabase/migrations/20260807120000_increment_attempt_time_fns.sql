-- Atomic per-question time accumulation for the practice and test
-- runners.
--
-- attempts.time_spent_ms / act_attempts.time_spent_ms are accumulated
-- from client-reported deltas by several writers (recordItemAnswer,
-- the practice-test time-ping beacon, submitAnswer, the practice
-- session time-ping beacon). PostgREST can't express
-- UPDATE ... SET x = x + n without an RPC, so the JS layer used to
-- read-then-write — a lost-update race whenever a beacon and an
-- answer save land together. These functions make the accumulate a
-- single atomic UPDATE.
--
-- SECURITY DEFINER, with the ownership check inlined:
--   * attempts has an update-own RLS policy, but act_attempts
--     deliberately has none (students must not be able to rewrite
--     is_correct via PostgREST). A definer function whose only write
--     is "add clamped ms to your own row" is a much narrower grant
--     than a new UPDATE policy over the whole row.
--   * Deltas are clamped to [0, 1h] here as well as in JS — the RPC
--     is callable with any integer by an authenticated user, so the
--     clamp can't live client-side only.
--   * is_demo() users stay read-only, matching the demo_readonly_*
--     policies the definer context would otherwise bypass.

create or replace function public.increment_attempt_time(
  p_attempt_id uuid,
  p_delta_ms integer
) returns void
language sql
security definer
set search_path = public
as $$
  update attempts
     set time_spent_ms = coalesce(time_spent_ms, 0)
                         + least(greatest(coalesce(p_delta_ms, 0), 0), 3600000)
   where id = p_attempt_id
     and user_id = auth.uid()
     and not is_demo();
$$;

create or replace function public.increment_act_attempt_time(
  p_attempt_id uuid,
  p_delta_ms integer
) returns void
language sql
security definer
set search_path = public
as $$
  update act_attempts
     set time_spent_ms = coalesce(time_spent_ms, 0)
                         + least(greatest(coalesce(p_delta_ms, 0), 0), 3600000)
   where id = p_attempt_id
     and user_id = auth.uid()
     and not is_demo();
$$;

revoke all on function public.increment_attempt_time(uuid, integer) from public, anon;
revoke all on function public.increment_act_attempt_time(uuid, integer) from public, anon;
grant execute on function public.increment_attempt_time(uuid, integer) to authenticated;
grant execute on function public.increment_act_attempt_time(uuid, integer) to authenticated;
