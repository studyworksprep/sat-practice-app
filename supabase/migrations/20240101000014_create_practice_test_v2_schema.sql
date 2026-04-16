-- Phase 2 — v2 practice test schema.
--
-- New parallel tables to replace the practice_test_* set. The legacy
-- tables stay in service for the legacy app tree; the new tree will
-- use these. When the legacy tree retires, the old tables drop.
--
-- Key changes from v1:
--   - module_items references questions_v2 directly (no more
--     question_versions FK to the v1 question schema)
--   - The routing-rules table is gone. Adaptive thresholds live as
--     two int columns on practice_tests_v2 ({rw,math}_route_threshold).
--     The "above threshold → hard, else → easy" comparison lives in
--     code as a constant.
--   - Both `metadata jsonb` columns are dropped. The one durably
--     useful field (source = 'app' | 'bluebook_upload') becomes a
--     CHECK-constrained column on practice_test_attempts_v2.
--     uploaded_by uuid carries the bluebook uploader for that case.
--   - practice_tests_v2 gets deleted_at for soft-delete.
--   - route_code on modules gets a CHECK constraint covering the
--     known values (easy / hard / std).
--   - RLS is on, with policies mirroring the patterns established
--     in migrations 000011–000012. Grants to authenticated included.

-- ============================================================
-- 1. practice_tests_v2 (content)
-- ============================================================
create table if not exists public.practice_tests_v2 (
  id                   uuid primary key default gen_random_uuid(),
  code                 text not null unique,
  name                 text not null,
  is_published         boolean not null default false,
  is_adaptive          boolean not null default false,
  is_frozen            boolean not null default false,
  adaptive_version     text,
  rw_route_threshold   integer,
  math_route_threshold integer,
  deleted_at           timestamptz,
  created_at           timestamptz not null default now()
);

alter table public.practice_tests_v2 enable row level security;
grant select, insert, update, delete on public.practice_tests_v2 to authenticated;

drop policy if exists "ptv2_select"     on public.practice_tests_v2;
drop policy if exists "ptv2_admin_all"  on public.practice_tests_v2;

create policy "ptv2_select" on public.practice_tests_v2
  for select to authenticated using (true);

create policy "ptv2_admin_all" on public.practice_tests_v2
  for all to public using (is_admin()) with check (is_admin());

-- ============================================================
-- 2. practice_test_modules_v2 (content)
-- ============================================================
create table if not exists public.practice_test_modules_v2 (
  id                  uuid primary key default gen_random_uuid(),
  practice_test_id    uuid not null references public.practice_tests_v2(id) on delete cascade,
  subject_code        text not null check (subject_code in ('RW', 'MATH')),
  module_number       integer not null check (module_number between 1 and 10),
  route_code          text not null check (route_code in ('easy', 'hard', 'std')),
  time_limit_seconds  integer not null check (time_limit_seconds > 0),
  created_at          timestamptz not null default now(),
  unique (practice_test_id, subject_code, module_number, route_code)
);

create index if not exists idx_ptm_v2_test on public.practice_test_modules_v2 (practice_test_id);

alter table public.practice_test_modules_v2 enable row level security;
grant select, insert, update, delete on public.practice_test_modules_v2 to authenticated;

drop policy if exists "ptmv2_select"    on public.practice_test_modules_v2;
drop policy if exists "ptmv2_admin_all" on public.practice_test_modules_v2;

create policy "ptmv2_select" on public.practice_test_modules_v2
  for select to authenticated using (true);

create policy "ptmv2_admin_all" on public.practice_test_modules_v2
  for all to public using (is_admin()) with check (is_admin());

-- ============================================================
-- 3. practice_test_module_items_v2 (content)
--    NB: question reference is questions_v2(id), not question_versions.
-- ============================================================
create table if not exists public.practice_test_module_items_v2 (
  id                       uuid primary key default gen_random_uuid(),
  practice_test_module_id  uuid not null references public.practice_test_modules_v2(id) on delete cascade,
  question_id              uuid not null references public.questions_v2(id),
  ordinal                  integer not null check (ordinal >= 0),
  created_at               timestamptz not null default now(),
  unique (practice_test_module_id, ordinal)
);

create index if not exists idx_ptmi_v2_module   on public.practice_test_module_items_v2 (practice_test_module_id);
create index if not exists idx_ptmi_v2_question on public.practice_test_module_items_v2 (question_id);

alter table public.practice_test_module_items_v2 enable row level security;
grant select, insert, update, delete on public.practice_test_module_items_v2 to authenticated;

drop policy if exists "ptmiv2_select"    on public.practice_test_module_items_v2;
drop policy if exists "ptmiv2_admin_all" on public.practice_test_module_items_v2;

create policy "ptmiv2_select" on public.practice_test_module_items_v2
  for select to authenticated using (true);

create policy "ptmiv2_admin_all" on public.practice_test_module_items_v2
  for all to public using (is_admin()) with check (is_admin());

-- ============================================================
-- 4. practice_test_attempts_v2 (user data)
--    `metadata jsonb` from v1 is gone. The one durable field —
--    'source' — is a CHECK column. uploaded_by carries the bluebook
--    uploader's profile id for the upload case (NULL for live).
-- ============================================================
create table if not exists public.practice_test_attempts_v2 (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null,
  practice_test_id  uuid not null references public.practice_tests_v2(id),
  adaptive_version  text,
  started_at        timestamptz not null default now(),
  finished_at       timestamptz,
  status            text not null check (status in ('in_progress', 'completed', 'abandoned')),
  source            text not null default 'app' check (source in ('app', 'bluebook_upload')),
  uploaded_by       uuid,
  composite_score   integer check (composite_score is null or composite_score between 400 and 1600),
  rw_scaled         integer check (rw_scaled is null or rw_scaled between 200 and 800),
  math_scaled       integer check (math_scaled is null or math_scaled between 200 and 800)
);

create index if not exists idx_pta_v2_user on public.practice_test_attempts_v2 (user_id);
create index if not exists idx_pta_v2_test on public.practice_test_attempts_v2 (practice_test_id);

alter table public.practice_test_attempts_v2 enable row level security;
grant select, insert, update, delete on public.practice_test_attempts_v2 to authenticated;

drop policy if exists "ptav2_select"      on public.practice_test_attempts_v2;
drop policy if exists "ptav2_insert_self" on public.practice_test_attempts_v2;
drop policy if exists "ptav2_update_self" on public.practice_test_attempts_v2;
drop policy if exists "ptav2_admin_delete" on public.practice_test_attempts_v2;

create policy "ptav2_select" on public.practice_test_attempts_v2
  for select to public using (can_view(user_id));

create policy "ptav2_insert_self" on public.practice_test_attempts_v2
  for insert to public with check (user_id = auth.uid() or is_admin());

create policy "ptav2_update_self" on public.practice_test_attempts_v2
  for update to public
  using (user_id = auth.uid() or is_admin())
  with check (user_id = auth.uid() or is_admin());

create policy "ptav2_admin_delete" on public.practice_test_attempts_v2
  for delete to public using (is_admin());

-- ============================================================
-- 5. practice_test_module_attempts_v2 (user data)
--    metadata jsonb dropped (the only field there was source, which
--    now lives one level up on the attempt).
-- ============================================================
create table if not exists public.practice_test_module_attempts_v2 (
  id                          uuid primary key default gen_random_uuid(),
  practice_test_attempt_id    uuid not null references public.practice_test_attempts_v2(id) on delete cascade,
  practice_test_module_id     uuid not null references public.practice_test_modules_v2(id),
  started_at                  timestamptz not null default now(),
  finished_at                 timestamptz,
  correct_count               integer,
  raw_score                   integer
);

create index if not exists idx_ptma_v2_attempt on public.practice_test_module_attempts_v2 (practice_test_attempt_id);
create index if not exists idx_ptma_v2_module  on public.practice_test_module_attempts_v2 (practice_test_module_id);

alter table public.practice_test_module_attempts_v2 enable row level security;
grant select, insert, update, delete on public.practice_test_module_attempts_v2 to authenticated;

drop policy if exists "ptmav2_select"      on public.practice_test_module_attempts_v2;
drop policy if exists "ptmav2_insert_self" on public.practice_test_module_attempts_v2;
drop policy if exists "ptmav2_update_self" on public.practice_test_module_attempts_v2;

create policy "ptmav2_select" on public.practice_test_module_attempts_v2
  for select to public using (
    exists (
      select 1 from public.practice_test_attempts_v2 pta
      where pta.id = practice_test_attempt_id
        and can_view(pta.user_id)
    )
  );

create policy "ptmav2_insert_self" on public.practice_test_module_attempts_v2
  for insert to public with check (
    exists (
      select 1 from public.practice_test_attempts_v2 pta
      where pta.id = practice_test_attempt_id
        and (pta.user_id = auth.uid() or is_admin())
    )
  );

create policy "ptmav2_update_self" on public.practice_test_module_attempts_v2
  for update to public
  using (
    exists (
      select 1 from public.practice_test_attempts_v2 pta
      where pta.id = practice_test_attempt_id
        and (pta.user_id = auth.uid() or is_admin())
    )
  )
  with check (
    exists (
      select 1 from public.practice_test_attempts_v2 pta
      where pta.id = practice_test_attempt_id
        and (pta.user_id = auth.uid() or is_admin())
    )
  );

-- ============================================================
-- 6. practice_test_item_attempts_v2 (user data)
--    Structurally unchanged from v1: it's the linker between a
--    module attempt, a module item, and the per-question record
--    in the shared `attempts` table.
-- ============================================================
create table if not exists public.practice_test_item_attempts_v2 (
  id                              uuid primary key default gen_random_uuid(),
  practice_test_module_attempt_id uuid not null references public.practice_test_module_attempts_v2(id) on delete cascade,
  practice_test_module_item_id    uuid not null references public.practice_test_module_items_v2(id),
  attempt_id                      uuid not null references public.attempts(id),
  unique (practice_test_module_attempt_id, practice_test_module_item_id)
);

create index if not exists idx_ptia_v2_module_attempt on public.practice_test_item_attempts_v2 (practice_test_module_attempt_id);
create index if not exists idx_ptia_v2_module_item   on public.practice_test_item_attempts_v2 (practice_test_module_item_id);
create index if not exists idx_ptia_v2_attempt      on public.practice_test_item_attempts_v2 (attempt_id);

alter table public.practice_test_item_attempts_v2 enable row level security;
grant select, insert, update, delete on public.practice_test_item_attempts_v2 to authenticated;

drop policy if exists "ptiav2_select"      on public.practice_test_item_attempts_v2;
drop policy if exists "ptiav2_insert_self" on public.practice_test_item_attempts_v2;
drop policy if exists "ptiav2_update_self" on public.practice_test_item_attempts_v2;

create policy "ptiav2_select" on public.practice_test_item_attempts_v2
  for select to public using (
    exists (
      select 1 from public.practice_test_module_attempts_v2 ma
      join public.practice_test_attempts_v2 pta on pta.id = ma.practice_test_attempt_id
      where ma.id = practice_test_module_attempt_id
        and can_view(pta.user_id)
    )
  );

create policy "ptiav2_insert_self" on public.practice_test_item_attempts_v2
  for insert to public with check (
    exists (
      select 1 from public.practice_test_module_attempts_v2 ma
      join public.practice_test_attempts_v2 pta on pta.id = ma.practice_test_attempt_id
      where ma.id = practice_test_module_attempt_id
        and (pta.user_id = auth.uid() or is_admin())
    )
  );

create policy "ptiav2_update_self" on public.practice_test_item_attempts_v2
  for update to public
  using (
    exists (
      select 1 from public.practice_test_module_attempts_v2 ma
      join public.practice_test_attempts_v2 pta on pta.id = ma.practice_test_attempt_id
      where ma.id = practice_test_module_attempt_id
        and (pta.user_id = auth.uid() or is_admin())
    )
  )
  with check (
    exists (
      select 1 from public.practice_test_module_attempts_v2 ma
      join public.practice_test_attempts_v2 pta on pta.id = ma.practice_test_attempt_id
      where ma.id = practice_test_module_attempt_id
        and (pta.user_id = auth.uid() or is_admin())
    )
  );

-- ============================================================
-- 7. profiles.practice_test_v2_imported_at — per-student import flag
--    Set when the per-student import Server Action runs against this
--    user. NULL means their v1 history hasn't been migrated yet.
-- ============================================================
alter table public.profiles
  add column if not exists practice_test_v2_imported_at timestamptz;
