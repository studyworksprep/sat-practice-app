-- Bluebook contributions — Phase 1 schema.
-- Plan: docs/bluebook-contributions-plan-2026-08.md
--
-- Lets tutors (and, later, outside contributors) submit official
-- Bluebook practice-test results to grow the score-calibration dataset
-- without tying the submission to an enrolled student record.
--
-- Shape notes worth keeping in front of you:
--
--   * Submissions are NOT practice_test_attempts_v2 rows. Nothing in
--     the product pipeline (item_stats, mastery snapshots, review queue)
--     keys off this table, and it must stay that way — a contribution is
--     calibration evidence, not a student's work.
--   * No student PII. The only free-text field describing a test taker
--     is `subject_label`, a contributor-private pseudonym ("Student A"),
--     capped short and documented as such.
--   * Contributors never write score_conversion. Only the promotion
--     path does, stamping submission_id. That guarantee is what Phase 0
--     (RLS on score_conversion) made real.
--   * Contributors are append-only: they INSERT and SELECT their own
--     rows and have no UPDATE policy at all.

-- ─────────────────────────────────────────────────────────────────
-- 1. The contributor role
-- ─────────────────────────────────────────────────────────────────
-- `contributor` is the base role for an OUTSIDE contributor — someone
-- with no roster, no students, and no subscription, who exists only to
-- submit calibration data.
--
-- It is deliberately NOT the mechanism by which tutors contribute.
-- profiles.role is single-valued, so making `contributor` a role a
-- tutor has to switch into would cost them their roster — and flow B
-- (submission linked to an attempt the tutor's own student took
-- in-app) requires the contributor to still be that student's tutor.
-- So contribution is a *capability*, can_contribute(), which staff hold
-- implicitly and outside contributors hold via the role.

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role = any (array[
    'practice'::text, 'student'::text, 'teacher'::text,
    'manager'::text, 'admin'::text, 'contributor'::text
  ]));

-- JWT-based, matching is_admin() / is_teacher() exactly. Reading the
-- JWT rather than the profiles row is what keeps these helpers usable
-- inside RLS policies without recursing through profiles' own policies.
create or replace function public.is_contributor()
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'contributor';
$$;

comment on function public.is_contributor() is
  'True when the calling session''s base role is the outside-contributor role. For "may this session submit Bluebook data?" use can_contribute(), which also covers staff.';

create or replace function public.can_contribute()
returns boolean
language sql
stable
set search_path = public
as $$
  select public.is_teacher() or public.is_contributor();
$$;

comment on function public.can_contribute() is
  'True when the session may create bluebook_submissions rows: any staff role (teacher/manager/admin, via is_teacher()) or the dedicated outside-contributor role. Capability, not identity — a tutor contributes without giving up their roster.';

-- ─────────────────────────────────────────────────────────────────
-- 2. contributor_codes — invite-only intake
-- ─────────────────────────────────────────────────────────────────
-- Mirrors teacher_codes: admin-managed rows, redeemed server-side at
-- signup through the service role. No anonymous intake (plan §7).

create table if not exists public.contributor_codes (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  note        text,
  created_by  uuid references public.profiles(id) on delete set null,
  used_by     uuid references public.profiles(id) on delete set null,
  used_at     timestamptz,
  expires_at  timestamptz,
  created_at  timestamptz not null default now()
);

comment on table public.contributor_codes is
  'Invite codes that grant the `contributor` role at signup. Admin-managed; redemption runs server-side via the service role (mirrors teacher_codes).';
comment on column public.contributor_codes.note is
  'Admin-facing note about who the code was issued to (an organisation or a tutor). Not student data.';

create index if not exists contributor_codes_unused_idx
  on public.contributor_codes(created_at desc) where used_by is null;

alter table public.contributor_codes enable row level security;

drop policy if exists contributor_codes_admin_all on public.contributor_codes;
create policy contributor_codes_admin_all on public.contributor_codes
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ─────────────────────────────────────────────────────────────────
-- 3. bluebook_submissions
-- ─────────────────────────────────────────────────────────────────

create table if not exists public.bluebook_submissions (
  id               uuid primary key default gen_random_uuid(),
  contributor_id   uuid not null references public.profiles(id) on delete cascade,
  practice_test_id uuid not null references public.practice_tests_v2(id) on delete restrict,
  entry_method     text not null
                     check (entry_method in ('html_upload', 'attempt_link', 'manual_grid')),

  -- Flow B only: the in-app attempt this submission corroborates.
  -- ON DELETE SET NULL, not CASCADE — the calibration evidence outlives
  -- the attempt it happened to come from.
  attempt_id       uuid references public.practice_test_attempts_v2(id) on delete set null,

  -- Per-section raw counts + official scaled scores. All nullable: a
  -- submission may cover Reading & Writing only, Math only, or both.
  -- Scaled scores are 200–800 in steps of 10 (College Board's grid).
  rw_m1_correct    integer check (rw_m1_correct >= 0),
  rw_m2_correct    integer check (rw_m2_correct >= 0),
  rw_m2_route      text    check (rw_m2_route in ('easy', 'hard')),
  rw_scaled        integer check (rw_scaled between 200 and 800 and rw_scaled % 10 = 0),

  math_m1_correct  integer check (math_m1_correct >= 0),
  math_m2_correct  integer check (math_m2_correct >= 0),
  math_m2_route    text    check (math_m2_route in ('easy', 'hard')),
  math_scaled      integer check (math_scaled between 200 and 800 and math_scaled % 10 = 0),

  -- module key -> ordinal -> {correct: bool, chosen?: text}
  -- Module keys are 'RW1' | 'RW2' | 'MATH1' | 'MATH2'. `chosen` is the
  -- distractor the taker picked (or the literal 'omitted'); optional
  -- everywhere, since flow C offers it but never requires it.
  responses        jsonb not null default '{}'::jsonb,

  subject_label    text check (subject_label is null or length(subject_label) <= 40),
  report_date      date,
  html_artifact_path text,

  status           text not null default 'pending'
                     check (status in ('pending', 'verified', 'promoted', 'rejected')),

  -- Derived by the validation trigger; never client-supplied.
  validation_flags jsonb not null default '[]'::jsonb,

  reviewed_by      uuid references public.profiles(id) on delete set null,
  reviewed_at      timestamptz,
  review_note      text,
  promoted_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint bluebook_submissions_attempt_link_needs_attempt
    check (entry_method <> 'attempt_link' or attempt_id is not null),
  constraint bluebook_submissions_needs_a_section
    check (rw_scaled is not null or math_scaled is not null)
);

comment on table public.bluebook_submissions is
  'Contributed official Bluebook practice-test results, used to grow the score_conversion calibration dataset. Deliberately decoupled from practice_test_attempts_v2 and from student records: nothing in the product pipeline (item_stats, mastery snapshots, review queue) may key off this table.';

comment on column public.bluebook_submissions.subject_label is
  'Contributor-private pseudonym for the test taker ("Student A"). NEVER a real name — no student PII belongs in this schema. Capped at 40 chars to discourage anything narrative.';

comment on column public.bluebook_submissions.responses is
  'module key -> ordinal -> {correct: bool, chosen?: text}. Module keys: RW1, RW2, MATH1, MATH2. The validation trigger enforces the shape and cross-checks the per-module correct counts against the declared m1/m2 columns.';

comment on column public.bluebook_submissions.validation_flags is
  'Soft findings from the validation trigger (routing inconsistency, score_conversion conflict). Derived — the trigger overwrites whatever the client sent. Hard violations raise instead of landing here.';

comment on column public.bluebook_submissions.html_artifact_path is
  'Path in the private `bluebook-reports` storage bucket holding the raw uploaded score-report HTML. The audit artifact: never rendered, re-parseable when College Board changes the report format.';

comment on column public.bluebook_submissions.rw_m2_route is
  'Which module-2 form the taker saw (easy|hard). Optional. When present the trigger cross-checks it against the test threshold — a mismatch means the m1 count and the module 2 actually served disagree.';

create index if not exists bluebook_submissions_contributor_idx
  on public.bluebook_submissions(contributor_id, created_at desc);
create index if not exists bluebook_submissions_review_queue_idx
  on public.bluebook_submissions(created_at) where status = 'pending';
create index if not exists bluebook_submissions_test_idx
  on public.bluebook_submissions(practice_test_id);
create index if not exists bluebook_submissions_attempt_idx
  on public.bluebook_submissions(attempt_id) where attempt_id is not null;

-- ─────────────────────────────────────────────────────────────────
-- 4. score_conversion provenance + conflict flag
-- ─────────────────────────────────────────────────────────────────

alter table public.score_conversion
  add column if not exists submission_id uuid
    references public.bluebook_submissions(id) on delete set null;

alter table public.score_conversion
  add column if not exists flagged_at timestamptz;

comment on column public.score_conversion.submission_id is
  'The bluebook_submissions row this conversion was promoted from. Together with attempt_id this is the ONLY admissible provenance — never infer provenance from a count+score coincidence (a conversion row predating an app-scored attempt may be the row the estimator itself read).';

comment on column public.score_conversion.flagged_at is
  'Set when an incoming submission reported a different scaled score for this exact (test, section, m1, m2) key. A disagreement to resolve, not an error: the existing row is never overwritten automatically.';

create index if not exists score_conversion_submission_idx
  on public.score_conversion(submission_id) where submission_id is not null;
create index if not exists score_conversion_flagged_idx
  on public.score_conversion(flagged_at) where flagged_at is not null;

-- ─────────────────────────────────────────────────────────────────
-- 5. Validation trigger
-- ─────────────────────────────────────────────────────────────────
-- Hard violations (raise): malformed response vector, checksum
-- mismatch between the vector and the declared counts, a count that
-- exceeds the module's item count, illegal status transitions.
--
-- Soft findings (recorded in validation_flags, never blocking):
-- module-2 routing inconsistency, and a conflict with an existing
-- score_conversion row. Per the plan these flag for review — they do
-- not block the submission and never overwrite the existing curve.
--
-- SECURITY DEFINER because the conflict path stamps
-- score_conversion.flagged_at, which is admin-only under the Phase 0
-- policies. That write is a system action, not the contributor's.

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

  -- ── Response vector: shape + checksum (HARD) ──────────────────
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

  -- ── Declared counts vs the module's actual item count (HARD) ──
  -- Module 2 exists twice (easy/hard) with the same module_number, so
  -- take the largest of the routes as the ceiling.
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

  -- ── Per-section soft checks ───────────────────────────────────
  for sec in
    select *
    from (values
      ('reading_writing', new.rw_m1_correct,   new.rw_m2_correct,   new.rw_scaled,   new.rw_m2_route,   v_test.rw_route_threshold),
      ('math',            new.math_m1_correct, new.math_m2_correct, new.math_scaled, new.math_m2_route, v_test.math_route_threshold)
    ) as t(section, m1, m2, scaled, route, threshold)
  loop
    -- Module-2 routing consistency. The app routes on
    -- m1_correct >= threshold -> 'hard' (lib/practice-test/adaptive-routing.js).
    -- When the test has no threshold we record that we skipped rather
    -- than duplicating that module's DEFAULT_THRESHOLDS here, where
    -- the two copies would silently drift apart.
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

    -- Conflict with the existing calibration curve. Flag both sides;
    -- never overwrite, never block.
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

  -- ── Lifecycle guards (HARD) ───────────────────────────────────
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.status = 'promoted' and old.status <> 'verified' then
      raise exception 'bluebook_submissions: cannot promote from status % — a submission must be verified first', old.status
        using errcode = '23514';
    end if;
    if new.status in ('verified', 'rejected') and new.reviewed_by is null then
      raise exception 'bluebook_submissions: moving to % requires reviewed_by', new.status
        using errcode = '23514';
    end if;
  end if;

  -- An HTML-backed submission's whole claim to trust is the stored
  -- artifact. No artifact, no verification.
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
  'BEFORE INSERT/UPDATE validation for bluebook_submissions. Raises on hard violations (malformed vector, checksum mismatch, over-capacity counts, illegal status transitions); records soft findings in validation_flags and stamps score_conversion.flagged_at on a curve conflict.';

drop trigger if exists bluebook_submissions_validate on public.bluebook_submissions;
create trigger bluebook_submissions_validate
  before insert or update on public.bluebook_submissions
  for each row execute function public.tg_bluebook_submission_validate();

-- ─────────────────────────────────────────────────────────────────
-- 6. RLS
-- ─────────────────────────────────────────────────────────────────

alter table public.bluebook_submissions enable row level security;

-- Contributors: append-only. INSERT their own rows, SELECT their own
-- rows, and deliberately NO update policy — a submission is evidence,
-- and evidence you can edit after review isn't evidence.
drop policy if exists bluebook_submissions_insert_own on public.bluebook_submissions;
create policy bluebook_submissions_insert_own on public.bluebook_submissions
  for insert to authenticated
  with check (
    contributor_id = auth.uid()
    and public.can_contribute()
    and status = 'pending'
  );

drop policy if exists bluebook_submissions_select_own on public.bluebook_submissions;
create policy bluebook_submissions_select_own on public.bluebook_submissions
  for select to authenticated
  using (contributor_id = auth.uid());

-- Staff: read everything, review everything except their own
-- submissions. A tutor is both a contributor and staff, so without the
-- self-exclusion the review gate would be a formality — you could
-- verify and promote your own data.
drop policy if exists bluebook_submissions_staff_select on public.bluebook_submissions;
create policy bluebook_submissions_staff_select on public.bluebook_submissions
  for select to authenticated
  using (public.is_teacher());

drop policy if exists bluebook_submissions_staff_review on public.bluebook_submissions;
create policy bluebook_submissions_staff_review on public.bluebook_submissions
  for update to authenticated
  using (public.is_teacher() and contributor_id <> auth.uid())
  with check (public.is_teacher() and contributor_id <> auth.uid());

drop policy if exists bluebook_submissions_admin_delete on public.bluebook_submissions;
create policy bluebook_submissions_admin_delete on public.bluebook_submissions
  for delete to authenticated
  using (public.is_admin());

-- Demo lockdown, matching every other RLS-enabled public table.
do $$
declare
  rec record;
begin
  for rec in
    select unnest(array['bluebook_submissions', 'contributor_codes']) as tablename
  loop
    execute format($f$
      drop policy if exists demo_readonly_insert on public.%I;
      create policy demo_readonly_insert on public.%I
        as restrictive for insert
        to authenticated
        with check (not public.is_demo());

      drop policy if exists demo_readonly_update on public.%I;
      create policy demo_readonly_update on public.%I
        as restrictive for update
        to authenticated
        using      (not public.is_demo())
        with check (not public.is_demo());

      drop policy if exists demo_readonly_delete on public.%I;
      create policy demo_readonly_delete on public.%I
        as restrictive for delete
        to authenticated
        using (not public.is_demo());
    $f$,
      rec.tablename, rec.tablename,
      rec.tablename, rec.tablename,
      rec.tablename, rec.tablename
    );
  end loop;
end;
$$;

-- ─────────────────────────────────────────────────────────────────
-- 7. Storage: the raw report artifact
-- ─────────────────────────────────────────────────────────────────
-- Private bucket, mirroring `act-imports`. Objects live at
-- <contributor_id>/<submission_id>.html so the owner check is a
-- prefix compare. Uploaded HTML is hostile input: it is stored as an
-- audit artifact and parsed server-side, never served back to a
-- browser and never rendered.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('bluebook-reports', 'bluebook-reports', false, 10485760,
        array['text/html', 'text/plain', 'application/octet-stream'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists bluebook_reports_contributor_insert on storage.objects;
create policy bluebook_reports_contributor_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'bluebook-reports'
    and public.can_contribute()
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists bluebook_reports_contributor_read on storage.objects;
create policy bluebook_reports_contributor_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'bluebook-reports'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists bluebook_reports_staff_read on storage.objects;
create policy bluebook_reports_staff_read on storage.objects
  for select to authenticated
  using (bucket_id = 'bluebook-reports' and public.is_teacher());

drop policy if exists bluebook_reports_admin_delete on storage.objects;
create policy bluebook_reports_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'bluebook-reports' and public.is_admin());
