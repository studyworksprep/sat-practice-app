-- Per-student practice history import: v1 attempt tables → v2.
--
-- Called from a tutor-page Server Action after the caller has been
-- authorized (admin or visible-via-can_view tutor of the student).
-- This function trusts its caller — it's SECURITY DEFINER and runs
-- without RLS. Authorization happens in the Server Action via a
-- can_view()-gated profile read before this is invoked.
--
-- Idempotent: returns immediately if profiles.practice_test_v2_imported_at
-- is already set. Sets the timestamp on success.
--
-- Returns a small jsonb summary so the UI can show counts.

create or replace function public.import_student_practice_history(p_student_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  attempts_copied        integer := 0;
  module_attempts_copied integer := 0;
  item_attempts_copied   integer := 0;
  already_imported       timestamptz;
begin
  select practice_test_v2_imported_at into already_imported
  from public.profiles where id = p_student_id;

  if already_imported is not null then
    return jsonb_build_object(
      'already_imported', true,
      'imported_at', already_imported
    );
  end if;

  -- 1. practice_test_attempts → practice_test_attempts_v2.
  --    Preserve UUID. Translate metadata.source → source column;
  --    metadata.uploaded_by → uploaded_by column. Anything else in
  --    metadata is discarded.
  with inserted as (
    insert into public.practice_test_attempts_v2 (
      id, user_id, practice_test_id, adaptive_version,
      started_at, finished_at, status,
      source, uploaded_by,
      composite_score, rw_scaled, math_scaled
    )
    select
      pta.id, pta.user_id, pta.practice_test_id, pta.adaptive_version,
      pta.started_at, pta.finished_at, pta.status,
      case
        when pta.metadata->>'source' = 'bluebook' then 'bluebook_upload'
        when pta.metadata->>'source' = 'bluebook_upload' then 'bluebook_upload'
        else 'app'
      end,
      case
        when pta.metadata ? 'uploaded_by' then (pta.metadata->>'uploaded_by')::uuid
        else null
      end,
      pta.composite_score, pta.rw_scaled, pta.math_scaled
    from public.practice_test_attempts pta
    where pta.user_id = p_student_id
    on conflict (id) do nothing
    returning 1
  )
  select count(*) into attempts_copied from inserted;

  -- 2. practice_test_module_attempts → practice_test_module_attempts_v2.
  --    Preserve UUID. metadata is dropped (the only field there was
  --    source, which now lives on the attempt above).
  with inserted as (
    insert into public.practice_test_module_attempts_v2 (
      id, practice_test_attempt_id, practice_test_module_id,
      started_at, finished_at, correct_count, raw_score
    )
    select
      ptma.id, ptma.practice_test_attempt_id, ptma.practice_test_module_id,
      ptma.started_at, ptma.finished_at, ptma.correct_count, ptma.raw_score
    from public.practice_test_module_attempts ptma
    join public.practice_test_attempts pta on pta.id = ptma.practice_test_attempt_id
    where pta.user_id = p_student_id
    on conflict (id) do nothing
    returning 1
  )
  select count(*) into module_attempts_copied from inserted;

  -- 3. practice_test_item_attempts → practice_test_item_attempts_v2.
  --    Preserve UUID. attempt_id FK still points at the shared
  --    public.attempts table — no translation needed.
  with inserted as (
    insert into public.practice_test_item_attempts_v2 (
      id, practice_test_module_attempt_id,
      practice_test_module_item_id, attempt_id
    )
    select
      ptia.id, ptia.practice_test_module_attempt_id,
      ptia.practice_test_module_item_id, ptia.attempt_id
    from public.practice_test_item_attempts ptia
    join public.practice_test_module_attempts ptma on ptma.id = ptia.practice_test_module_attempt_id
    join public.practice_test_attempts pta on pta.id = ptma.practice_test_attempt_id
    where pta.user_id = p_student_id
    on conflict (id) do nothing
    returning 1
  )
  select count(*) into item_attempts_copied from inserted;

  -- 4. Mark the student as imported.
  update public.profiles
  set practice_test_v2_imported_at = now()
  where id = p_student_id;

  return jsonb_build_object(
    'already_imported',       false,
    'attempts_copied',        attempts_copied,
    'module_attempts_copied', module_attempts_copied,
    'item_attempts_copied',   item_attempts_copied
  );
end $$;

-- Service-role only. The Server Action calls this via service-role
-- after gating the caller via can_view().
revoke all on function public.import_student_practice_history(uuid) from public;
revoke all on function public.import_student_practice_history(uuid) from anon;
revoke all on function public.import_student_practice_history(uuid) from authenticated;
