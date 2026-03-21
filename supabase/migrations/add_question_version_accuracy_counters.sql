-- Add attempt tracking columns to question_versions
-- so per-question accuracy can be read without aggregating attempts.

alter table public.question_versions
  add column if not exists attempt_count  integer not null default 0,
  add column if not exists correct_count  integer not null default 0;

-- Atomic RPC to bump counters after a student submits an answer.
-- Accepts an array of version_id / is_correct pairs for bulk use.
create or replace function public.increment_version_accuracy(
  entries jsonb  -- array of { "version_id": uuid, "is_correct": bool }
) returns void language plpgsql security definer as $$
begin
  update public.question_versions qv
  set
    attempt_count = qv.attempt_count + 1,
    correct_count = qv.correct_count + (case when (e.val->>'is_correct')::boolean then 1 else 0 end)
  from jsonb_array_elements(entries) as e(val)
  where qv.id = (e.val->>'version_id')::uuid;
end;
$$;
