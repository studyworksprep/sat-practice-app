-- Enable RLS + add policies to the practice_test_* tables and the
-- v1 question tables.
--
-- Why:
-- - The six practice_test_* tables (content + attempt tables) had
--   RLS disabled in production, meaning any authenticated user with
--   a PostgREST request could read and write every user's practice
--   test data. The dev DB had RLS enabled but no policies (locked
--   down). Both were wrong. This migration lands policies on both
--   sides so behavior converges on the correct state.
-- - The five v1 question tables (questions, question_versions,
--   answer_options, correct_answers, question_taxonomy) are being
--   phased out in favor of questions_v2. They just need to survive
--   as a working fallback. Minimal policies only.
--
-- The practice_test policies follow the same patterns established
-- in migrations 000011-000012:
--   - Content tables: SELECT for authenticated, admin-only write
--   - Attempt tables: SELECT via can_view(owner), INSERT/UPDATE self
--
-- The two downstream attempt tables (module_attempts, item_attempts)
-- don't have user_id directly. They walk up the reference chain
-- to practice_test_attempts.user_id to resolve ownership.

-- ============================================================
-- Enable RLS on all seven targets (no-op if already enabled)
-- ============================================================
alter table public.practice_tests                 enable row level security;
alter table public.practice_test_modules          enable row level security;
alter table public.practice_test_module_items     enable row level security;
alter table public.practice_test_routing_rules    enable row level security;
alter table public.practice_test_module_attempts  enable row level security;
alter table public.practice_test_item_attempts    enable row level security;

-- ============================================================
-- Table grants to authenticated role.
-- Without these, RLS policies can't fire: PostgREST returns
-- "permission denied" before reaching the policy layer. RLS then
-- narrows per row. This grant pattern is standard Supabase; the
-- dev DB was missing these grants because migrations never set
-- them, but production has them (acquired some other way).
-- ============================================================
grant select                         on public.practice_tests                to authenticated;
grant insert, update, delete         on public.practice_tests                to authenticated;
grant select                         on public.practice_test_modules         to authenticated;
grant insert, update, delete         on public.practice_test_modules         to authenticated;
grant select                         on public.practice_test_module_items    to authenticated;
grant insert, update, delete         on public.practice_test_module_items    to authenticated;
grant select                         on public.practice_test_routing_rules   to authenticated;
grant insert, update, delete         on public.practice_test_routing_rules   to authenticated;
grant select, insert, update, delete on public.practice_test_module_attempts to authenticated;
grant select, insert, update, delete on public.practice_test_item_attempts   to authenticated;

-- ============================================================
-- practice_tests (content — SELECT auth, write admin)
-- ============================================================
drop policy if exists "practice_tests_select" on public.practice_tests;
create policy "practice_tests_select" on public.practice_tests
  for select to authenticated using (true);

drop policy if exists "practice_tests_admin_write" on public.practice_tests;
create policy "practice_tests_admin_write" on public.practice_tests
  for all to public using (is_admin()) with check (is_admin());

-- ============================================================
-- practice_test_modules (content)
-- ============================================================
drop policy if exists "practice_test_modules_select" on public.practice_test_modules;
create policy "practice_test_modules_select" on public.practice_test_modules
  for select to authenticated using (true);

drop policy if exists "practice_test_modules_admin_write" on public.practice_test_modules;
create policy "practice_test_modules_admin_write" on public.practice_test_modules
  for all to public using (is_admin()) with check (is_admin());

-- ============================================================
-- practice_test_module_items (content)
-- ============================================================
drop policy if exists "practice_test_module_items_select" on public.practice_test_module_items;
create policy "practice_test_module_items_select" on public.practice_test_module_items
  for select to authenticated using (true);

drop policy if exists "practice_test_module_items_admin_write" on public.practice_test_module_items;
create policy "practice_test_module_items_admin_write" on public.practice_test_module_items
  for all to public using (is_admin()) with check (is_admin());

-- ============================================================
-- practice_test_routing_rules (content)
-- ============================================================
drop policy if exists "practice_test_routing_rules_select" on public.practice_test_routing_rules;
create policy "practice_test_routing_rules_select" on public.practice_test_routing_rules
  for select to authenticated using (true);

drop policy if exists "practice_test_routing_rules_admin_write" on public.practice_test_routing_rules;
create policy "practice_test_routing_rules_admin_write" on public.practice_test_routing_rules
  for all to public using (is_admin()) with check (is_admin());

-- ============================================================
-- practice_test_module_attempts (user data, 1 hop to owner)
-- ============================================================
drop policy if exists "ptma_select" on public.practice_test_module_attempts;
create policy "ptma_select" on public.practice_test_module_attempts
  for select to public using (
    exists (
      select 1
      from public.practice_test_attempts pta
      where pta.id = practice_test_attempt_id
        and can_view(pta.user_id)
    )
  );

drop policy if exists "ptma_insert_self" on public.practice_test_module_attempts;
create policy "ptma_insert_self" on public.practice_test_module_attempts
  for insert to public with check (
    exists (
      select 1
      from public.practice_test_attempts pta
      where pta.id = practice_test_attempt_id
        and (pta.user_id = auth.uid() or is_admin())
    )
  );

drop policy if exists "ptma_update_self" on public.practice_test_module_attempts;
create policy "ptma_update_self" on public.practice_test_module_attempts
  for update to public using (
    exists (
      select 1
      from public.practice_test_attempts pta
      where pta.id = practice_test_attempt_id
        and (pta.user_id = auth.uid() or is_admin())
    )
  ) with check (
    exists (
      select 1
      from public.practice_test_attempts pta
      where pta.id = practice_test_attempt_id
        and (pta.user_id = auth.uid() or is_admin())
    )
  );

-- ============================================================
-- practice_test_item_attempts (user data, 2 hops to owner)
-- ============================================================
drop policy if exists "ptia_select" on public.practice_test_item_attempts;
create policy "ptia_select" on public.practice_test_item_attempts
  for select to public using (
    exists (
      select 1
      from public.practice_test_module_attempts ma
      join public.practice_test_attempts pta on pta.id = ma.practice_test_attempt_id
      where ma.id = practice_test_module_attempt_id
        and can_view(pta.user_id)
    )
  );

drop policy if exists "ptia_insert_self" on public.practice_test_item_attempts;
create policy "ptia_insert_self" on public.practice_test_item_attempts
  for insert to public with check (
    exists (
      select 1
      from public.practice_test_module_attempts ma
      join public.practice_test_attempts pta on pta.id = ma.practice_test_attempt_id
      where ma.id = practice_test_module_attempt_id
        and (pta.user_id = auth.uid() or is_admin())
    )
  );

drop policy if exists "ptia_update_self" on public.practice_test_item_attempts;
create policy "ptia_update_self" on public.practice_test_item_attempts
  for update to public using (
    exists (
      select 1
      from public.practice_test_module_attempts ma
      join public.practice_test_attempts pta on pta.id = ma.practice_test_attempt_id
      where ma.id = practice_test_module_attempt_id
        and (pta.user_id = auth.uid() or is_admin())
    )
  ) with check (
    exists (
      select 1
      from public.practice_test_module_attempts ma
      join public.practice_test_attempts pta on pta.id = ma.practice_test_attempt_id
      where ma.id = practice_test_module_attempt_id
        and (pta.user_id = auth.uid() or is_admin())
    )
  );

-- ============================================================
-- v1 question tables (phased-out, minimal policies)
-- ============================================================
alter table public.questions          enable row level security;
alter table public.question_versions  enable row level security;
alter table public.answer_options     enable row level security;
alter table public.correct_answers    enable row level security;
alter table public.question_taxonomy  enable row level security;

grant select, insert, update, delete on public.questions         to authenticated;
grant select, insert, update, delete on public.question_versions to authenticated;
grant select, insert, update, delete on public.answer_options    to authenticated;
grant select, insert, update, delete on public.correct_answers   to authenticated;
grant select, insert, update, delete on public.question_taxonomy to authenticated;

drop policy if exists "questions_select" on public.questions;
create policy "questions_select" on public.questions
  for select to authenticated using (true);

drop policy if exists "questions_admin_write" on public.questions;
create policy "questions_admin_write" on public.questions
  for all to public using (is_admin()) with check (is_admin());

drop policy if exists "question_versions_select" on public.question_versions;
create policy "question_versions_select" on public.question_versions
  for select to authenticated using (true);

drop policy if exists "question_versions_admin_write" on public.question_versions;
create policy "question_versions_admin_write" on public.question_versions
  for all to public using (is_admin()) with check (is_admin());

drop policy if exists "answer_options_select" on public.answer_options;
create policy "answer_options_select" on public.answer_options
  for select to authenticated using (true);

drop policy if exists "answer_options_admin_write" on public.answer_options;
create policy "answer_options_admin_write" on public.answer_options
  for all to public using (is_admin()) with check (is_admin());

drop policy if exists "correct_answers_select" on public.correct_answers;
create policy "correct_answers_select" on public.correct_answers
  for select to authenticated using (true);

drop policy if exists "correct_answers_admin_write" on public.correct_answers;
create policy "correct_answers_admin_write" on public.correct_answers
  for all to public using (is_admin()) with check (is_admin());

drop policy if exists "question_taxonomy_select" on public.question_taxonomy;
create policy "question_taxonomy_select" on public.question_taxonomy
  for select to authenticated using (true);

drop policy if exists "question_taxonomy_admin_write" on public.question_taxonomy;
create policy "question_taxonomy_admin_write" on public.question_taxonomy
  for all to public using (is_admin()) with check (is_admin());
