-- Phase 2 — copy practice-test content from v1 tables to v2.
--
-- One-shot migration. Copies the four content tables:
--   practice_tests        → practice_tests_v2
--   practice_test_modules → practice_test_modules_v2
--   practice_test_module_items → practice_test_module_items_v2
--
-- The legacy practice_test_routing_rules table doesn't have a v2
-- equivalent. Its rows are read to populate {rw,math}_route_threshold
-- on practice_tests_v2 (one int per subject per test).
--
-- UUIDs are preserved. The v2 row for a given v1 row has the same
-- id. This makes the per-student attempt-import (next commit) a
-- straight INSERT-SELECT — no ID translation needed.
--
-- Question references are translated v1 → v2 via question_id_map
-- (old_version_id → new_question_id). A pre-flight RAISE aborts if
-- any v1 module_item points at a question_version with no v2 entry.
--
-- Re-runnable: ON CONFLICT DO NOTHING throughout. Safe to apply
-- multiple times.

do $$
declare
  unmapped_count integer;
  unmapped_sample_ids text;
begin
  -- ----------------------------------------------------------
  -- Pre-flight: every module_item.question_version_id must have
  -- a corresponding row in question_id_map.
  -- ----------------------------------------------------------
  select
    count(*),
    string_agg(distinct ptmi.question_version_id::text, ', ') filter (where ptmi.question_version_id is not null)
  into unmapped_count, unmapped_sample_ids
  from public.practice_test_module_items ptmi
  left join public.question_id_map qm
    on qm.old_version_id = ptmi.question_version_id
  where qm.new_question_id is null;

  if unmapped_count > 0 then
    raise exception
      'practice_test_module_items has % rows whose question_version_id has no v2 mapping. Sample ids: %',
      unmapped_count,
      coalesce(left(unmapped_sample_ids, 500), '(none)');
  end if;

  -- ----------------------------------------------------------
  -- 1. practice_tests → practice_tests_v2
  --    Preserve UUIDs. Synthesize {rw,math}_route_threshold from
  --    the legacy routing_rules table by picking the threshold of
  --    the rule that routes to 'hard' with operator '>='.
  -- ----------------------------------------------------------
  insert into public.practice_tests_v2 (
    id, code, name, is_published, is_adaptive, is_frozen,
    adaptive_version, rw_route_threshold, math_route_threshold,
    created_at
  )
  select
    pt.id,
    pt.code,
    pt.name,
    pt.is_published,
    pt.is_adaptive,
    pt.is_frozen,
    pt.adaptive_version,
    (
      select threshold
      from public.practice_test_routing_rules r
      where r.practice_test_id = pt.id
        and upper(r.subject_code) = 'RW'
        and r.operator = '>='
        and r.to_route_code = 'hard'
      order by r.created_at
      limit 1
    ),
    (
      select threshold
      from public.practice_test_routing_rules r
      where r.practice_test_id = pt.id
        and upper(r.subject_code) = 'MATH'
        and r.operator = '>='
        and r.to_route_code = 'hard'
      order by r.created_at
      limit 1
    ),
    pt.created_at
  from public.practice_tests pt
  on conflict (id) do nothing;

  -- ----------------------------------------------------------
  -- 2. practice_test_modules → practice_test_modules_v2
  --    Preserve UUIDs. v1 stores route_code as uppercase tokens
  --    (EASY/HARD/BASE) with some lowercase variants mixed in; v2's
  --    CHECK constraint expects lowercase (easy/hard/std). Normalize
  --    case and map 'base' to 'std'; anything else falls through to
  --    'std' as a safe default.
  -- ----------------------------------------------------------
  insert into public.practice_test_modules_v2 (
    id, practice_test_id, subject_code, module_number,
    route_code, time_limit_seconds, created_at
  )
  select
    ptm.id,
    ptm.practice_test_id,
    ptm.subject_code,
    ptm.module_number,
    case lower(coalesce(ptm.route_code, ''))
      when 'easy' then 'easy'
      when 'hard' then 'hard'
      else 'std'
    end,
    ptm.time_limit_seconds,
    ptm.created_at
  from public.practice_test_modules ptm
  on conflict (id) do nothing;

  -- ----------------------------------------------------------
  -- 3. practice_test_module_items → practice_test_module_items_v2
  --    Preserve UUIDs. Translate question_version_id → questions_v2.id
  --    via question_id_map.
  -- ----------------------------------------------------------
  insert into public.practice_test_module_items_v2 (
    id, practice_test_module_id, question_id, ordinal, created_at
  )
  select
    ptmi.id,
    ptmi.practice_test_module_id,
    qm.new_question_id,
    ptmi.ordinal,
    ptmi.created_at
  from public.practice_test_module_items ptmi
  join public.question_id_map qm on qm.old_version_id = ptmi.question_version_id
  on conflict (id) do nothing;

  raise notice 'practice_tests_v2 content copy complete';
end $$;
