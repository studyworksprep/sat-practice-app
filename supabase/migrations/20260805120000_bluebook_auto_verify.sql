-- Bluebook contributions — Phase 4: auto-verification for trusted,
-- evidence-backed submissions.
--
-- The review queue is the bottleneck the trust tiers exist to relieve
-- (docs/bluebook-contributions-plan-2026-08.md §3). A contributor with a
-- track record, uploading a report the server parsed itself, is not
-- telling us anything a reviewer would meaningfully check — the file
-- already is the check.
--
-- What auto-verification does NOT do is put anything into
-- score_conversion. Promotion stays a deliberate manager/admin action.
-- The saving is one human step out of two, on the half of the pipeline
-- where the evidence speaks for itself; the step that actually writes
-- calibration ground truth still has a person behind it.
--
-- The trigger's existing rule — "verified requires reviewed_by" — is
-- what stops a submission from marking itself reviewed. Auto-verified
-- rows have no reviewer, so they need their own marker rather than a
-- relaxation: `auto_verified_at`. A row with neither is still refused,
-- and the two are mutually exclusive, so "who accepted this?" always
-- has exactly one answer.

alter table public.bluebook_submissions
  add column if not exists auto_verified_at timestamptz;

comment on column public.bluebook_submissions.auto_verified_at is
  'Set when the submission was verified by rule rather than by a person: an HTML-backed submission from a contributor with a track record and no severe validation flags. Mutually exclusive with reviewed_by. Promotion into score_conversion is unaffected and still requires a human.';

create index if not exists bluebook_submissions_auto_verified_idx
  on public.bluebook_submissions(auto_verified_at) where auto_verified_at is not null;

create or replace function public.tg_bluebook_submission_validate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_flags     jsonb := '[]'::jsonb;
  v_test      record;
  v_key       text;
  v_subject   text;
  v_modnum    integer;
  v_declared  integer;
  v_counted   integer;
  v_capacity  integer;
  sec         record;
  v_expected  text;
  v_existing  record;
begin
  select id, is_adaptive, rw_route_threshold, math_route_threshold
    into v_test
  from public.practice_tests_v2
  where id = new.practice_test_id;

  if not found then
    raise exception 'bluebook_submissions: practice test % does not exist', new.practice_test_id
      using errcode = '23503';
  end if;

  -- Response vector: shape + checksum (HARD)
  for v_key in select unnest(array['RW1', 'RW2', 'MATH1', 'MATH2'])
  loop
    continue when not jsonb_exists(new.responses, v_key);

    v_declared := case v_key
      when 'RW1'   then new.rw_m1_correct
      when 'RW2'   then new.rw_m2_correct
      when 'MATH1' then new.math_m1_correct
      else              new.math_m2_correct
    end;

    if jsonb_typeof(new.responses -> v_key) <> 'object' then
      raise exception 'bluebook_submissions: responses.% must be an object of ordinal -> {correct, chosen?}', v_key
        using errcode = '23514';
    end if;

    if v_declared is null then
      raise exception 'bluebook_submissions: responses include module % but its declared correct count is null', v_key
        using errcode = '23514';
    end if;

    if exists (
      select 1 from jsonb_each(new.responses -> v_key) e
      where jsonb_typeof(e.value) <> 'object'
         or jsonb_typeof(e.value -> 'correct') <> 'boolean'
         or e.key !~ '^[0-9]+$'
    ) then
      raise exception 'bluebook_submissions: module % has malformed entries — each key must be an ordinal and each value {"correct": bool, "chosen"?: text}', v_key
        using errcode = '23514';
    end if;

    select count(*) into v_counted
    from jsonb_each(new.responses -> v_key) e
    where (e.value ->> 'correct')::boolean;

    if v_counted <> v_declared then
      raise exception 'bluebook_submissions: module % checksum mismatch — response vector has % correct, submission declares %', v_key, v_counted, v_declared
        using errcode = '23514';
    end if;
  end loop;

  -- Declared counts vs the module's actual item count (HARD)
  for v_key in select unnest(array['RW1', 'RW2', 'MATH1', 'MATH2'])
  loop
    v_subject := case when v_key like 'RW%' then 'RW' else 'MATH' end;
    v_modnum  := case when right(v_key, 1) = '1' then 1 else 2 end;
    v_declared := case v_key
      when 'RW1'   then new.rw_m1_correct
      when 'RW2'   then new.rw_m2_correct
      when 'MATH1' then new.math_m1_correct
      else              new.math_m2_correct
    end;
    continue when v_declared is null;

    select max(cnt) into v_capacity from (
      select count(i.id) as cnt
      from public.practice_test_modules_v2 m
      left join public.practice_test_module_items_v2 i
        on i.practice_test_module_id = m.id
      where m.practice_test_id = new.practice_test_id
        and m.subject_code = v_subject
        and m.module_number = v_modnum
      group by m.id
    ) s;

    if coalesce(v_capacity, 0) > 0 and v_declared > v_capacity then
      raise exception 'bluebook_submissions: module % declares % correct but the module only has % items', v_key, v_declared, v_capacity
        using errcode = '23514';
    end if;
  end loop;

  -- Per-section soft checks
  for sec in
    select *
    from (values
      ('reading_writing', new.rw_m1_correct,   new.rw_m2_correct,   new.rw_scaled,   new.rw_m2_route,   v_test.rw_route_threshold),
      ('math',            new.math_m1_correct, new.math_m2_correct, new.math_scaled, new.math_m2_route, v_test.math_route_threshold)
    ) as t(section, m1, m2, scaled, route, threshold)
  loop
    if sec.route is not null and sec.m1 is not null then
      if sec.threshold is null then
        v_flags := v_flags || jsonb_build_object(
          'code', 'route_check_skipped',
          'section', sec.section,
          'detail', 'practice test has no route threshold for this section'
        );
      else
        v_expected := case when sec.m1 >= sec.threshold then 'hard' else 'easy' end;
        if v_expected <> sec.route then
          v_flags := v_flags || jsonb_build_object(
            'code', 'route_inconsistent',
            'section', sec.section,
            'module1_correct', sec.m1,
            'threshold', sec.threshold,
            'expected_route', v_expected,
            'reported_route', sec.route
          );
        end if;
      end if;
    end if;

    if sec.m1 is not null and sec.m2 is not null and sec.scaled is not null then
      select id, scaled_score into v_existing
      from public.score_conversion
      where test_id = new.practice_test_id::text
        and section = sec.section
        and module1_correct = sec.m1
        and module2_correct = sec.m2
      limit 1;

      if found and v_existing.scaled_score <> sec.scaled then
        v_flags := v_flags || jsonb_build_object(
          'code', 'conversion_conflict',
          'section', sec.section,
          'score_conversion_id', v_existing.id,
          'module1_correct', sec.m1,
          'module2_correct', sec.m2,
          'existing_scaled', v_existing.scaled_score,
          'submitted_scaled', sec.scaled
        );
        update public.score_conversion
        set flagged_at = now()
        where id = v_existing.id;
      end if;
    end if;
  end loop;

  -- Lifecycle guards (HARD)
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.status = 'promoted' and old.status <> 'verified' then
      raise exception 'bluebook_submissions: cannot promote from status % — a submission must be verified first', old.status
        using errcode = '23514';
    end if;
    -- A submission may not mark itself reviewed. Either a person
    -- accepted it (reviewed_by) or the auto-verification rule did
    -- (auto_verified_at) — never neither, and never both, so "who
    -- accepted this?" always has exactly one answer.
    if new.status in ('verified', 'rejected')
       and new.reviewed_by is null
       and new.auto_verified_at is null then
      raise exception 'bluebook_submissions: moving to % requires reviewed_by (or auto_verified_at for rule-based verification)', new.status
        using errcode = '23514';
    end if;
  end if;

  if new.auto_verified_at is not null and new.reviewed_by is not null then
    raise exception 'bluebook_submissions: a submission is either auto-verified or reviewed by a person, not both'
      using errcode = '23514';
  end if;

  -- Auto-verification is only ever a shortcut past a human READING the
  -- evidence — so there has to be evidence.
  if new.auto_verified_at is not null and new.html_artifact_path is null then
    raise exception 'bluebook_submissions: auto-verification requires a stored report'
      using errcode = '23514';
  end if;

  if new.status in ('verified', 'promoted')
     and new.entry_method = 'html_upload'
     and new.html_artifact_path is null then
    raise exception 'bluebook_submissions: an html_upload submission cannot reach status % without its stored artifact', new.status
      using errcode = '23514';
  end if;

  new.validation_flags := v_flags;
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.tg_bluebook_submission_validate() is
  'BEFORE INSERT/UPDATE validation for bluebook_submissions. Raises on hard violations (malformed vector, checksum mismatch, over-capacity counts, illegal status transitions, verification with no accepting party); records soft findings in validation_flags and stamps score_conversion.flagged_at on a curve conflict.';
