-- =========================================================
-- ACT multi-section test mode (ACT parity Phase 3)
--   act_forms                    — per-form format: classic vs enhanced
--   act_practice_test_attempts   — section plan, format snapshot,
--                                  time multiplier, 'abandoned' status
-- =========================================================
-- Until now an ACT practice test was one practice_sessions row
-- holding every question of the form with a single deadline, and
-- the act_practice_test_attempts row was written only at the end.
-- Phase 3 makes the attempt the unit of work: it is created when
-- the student starts the form, carries the ordered section plan
-- (question ids, time limit, break after the section, per-section
-- status/timestamps/raw score), and each section runs as its own
-- practice_sessions row in the shared runner. See
-- lib/practice/act-test-plan.ts and lib/practice-test/act-attempt.ts.
--
-- Timing is keyed by form format:
--   classic   English 75q/45m, Math 60q/60m, Reading 40q/35m,
--             Science 40q/35m, 10-minute break after Math,
--             composite = mean of all four.
--   enhanced  English 50q/35m, Math 45q/50m, Reading 36q/40m,
--             Science 40q/40m (optional), break after Math,
--             composite = mean of English/Math/Reading.
-- Forms without an act_forms row are treated as classic.

create table if not exists public.act_forms (
  source_test text primary key,
  format      text not null default 'classic'
    check (format in ('classic', 'enhanced')),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users (id) on delete set null
);

comment on table public.act_forms is
  'Per-form settings for ACT practice tests. format keys the section timings, break and composite rule (lib/practice/act-test-plan.ts). Forms with no row run as classic.';

alter table public.act_forms enable row level security;

drop policy if exists act_forms_read on public.act_forms;
create policy act_forms_read on public.act_forms
  for select to authenticated using (true);

drop policy if exists act_forms_admin_write on public.act_forms;
create policy act_forms_admin_write on public.act_forms
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update, delete on public.act_forms to authenticated;

-- Known forms. Both spellings of the two renamed forms are listed
-- so this migration is correct whether it runs before or after
-- 20261012100000_act_source_test_rename; the exists() guard keeps
-- rows for forms that are actually in the bank.
insert into public.act_forms (source_test, format)
select v.source_test, v.format
  from (values
    ('ACT-2022-April-E25',     'classic'),
    ('ACT-2024-Sep',           'classic'),
    ('2024-Sep',               'classic'),
    ('ACT-2025-Oct',           'enhanced'),
    ('2025-Oct',               'enhanced'),
    ('ACT-2026-April-FormJ01', 'enhanced'),
    ('ACT-25MC1',              'enhanced'),
    ('ACT-25MC5',              'enhanced')
  ) as v(source_test, format)
 where exists (select 1 from public.act_questions q where q.source_test = v.source_test)
on conflict (source_test) do nothing;

-- Attempt row: plan + snapshot + accommodation.
alter table public.act_practice_test_attempts
  add column if not exists format text not null default 'classic'
    check (format in ('classic', 'enhanced')),
  add column if not exists time_multiplier numeric(3,2) not null default 1
    check (time_multiplier in (1, 1.5, 2)),
  add column if not exists sections jsonb not null default '[]'::jsonb,
  add column if not exists current_section_index int not null default 0;

-- 'abandoned' joins the status set: a student can give up on an
-- in-progress test from the hub instead of leaving it open forever.
do $$
declare
  c text;
begin
  select conname into c
    from pg_constraint
   where conrelid = 'public.act_practice_test_attempts'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) like '%status%';
  if c is not null then
    execute format('alter table public.act_practice_test_attempts drop constraint %I', c);
  end if;
end $$;

alter table public.act_practice_test_attempts
  add constraint act_practice_test_attempts_status_check
  check (status in ('in_progress', 'completed', 'abandoned'));

create index if not exists act_practice_test_attempts_user_open_idx
  on public.act_practice_test_attempts (user_id, source_test)
  where status = 'in_progress';

comment on column public.act_practice_test_attempts.sections is
  'Ordered section plan: [{index, section, question_ids, question_count, time_limit_ms, break_after_ms, status, session_id, started_at, deadline_at, finished_at, raw_correct, raw_total}]. Legacy single-session attempts have [] and keep practice_session_id.';
comment on column public.act_practice_test_attempts.format is
  'Form format snapshot at start (act_forms.format): classic | enhanced.';
comment on column public.act_practice_test_attempts.time_multiplier is
  'Extended-time accommodation applied to every section limit: 1, 1.5 or 2.';
