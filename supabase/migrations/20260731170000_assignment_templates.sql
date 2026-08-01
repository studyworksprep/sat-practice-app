-- =========================================================
-- assignment_templates — the tutor's snapshot library (§4.3)
-- =========================================================
-- A named, reusable snapshot of the new-assignment form. The
-- questions-type filter_criteria written at authoring time
-- ({skillSelections, difficulties, size, unansweredOnly}) is
-- already a lossless capture of the weighted skill picker, so a
-- template is just that JSON plus a name — creation re-samples
-- fresh questions from the same recipe each time it's applied.
--
-- Owner-scoped on purpose: a template is a personal authoring
-- shortcut, not shared curriculum (lesson packs already cover
-- "a fixed set of questions I curate"). assignment_type is kept
-- broad at the constraint level; the v1 UI only writes
-- 'questions' templates.

create table if not exists public.assignment_templates (
  id              uuid primary key default gen_random_uuid(),
  teacher_id      uuid not null references auth.users(id) on delete cascade,
  name            text not null check (char_length(name) between 1 and 120),
  assignment_type text not null default 'questions'
    check (assignment_type in ('questions', 'practice_test', 'lesson', 'lesson_pack')),
  filter_criteria jsonb not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.assignment_templates is
  'Named snapshots of the new-assignment form (§4.3). '
  'filter_criteria mirrors assignments_v2.filter_criteria for the '
  'type; applying a template re-samples questions from the recipe.';

create index if not exists assignment_templates_teacher_idx
  on public.assignment_templates (teacher_id, created_at desc);

drop trigger if exists trg_assignment_templates_updated_at on public.assignment_templates;
create trigger trg_assignment_templates_updated_at
  before update on public.assignment_templates
  for each row execute function public.set_updated_at();

-- ── RLS ────────────────────────────────────────────────────────────
-- Owner-only for every verb (admins ride the is_admin() escape
-- hatch for support). Staff-only by construction: students never
-- own templates because the insert path is a requireRole action,
-- and even a student-forged insert would only pollute their own
-- invisible shelf — but keep is_teacher() anyway for symmetry
-- with tutor_notes.

alter table public.assignment_templates enable row level security;
drop policy if exists assignment_templates_select on public.assignment_templates;
drop policy if exists assignment_templates_insert on public.assignment_templates;
drop policy if exists assignment_templates_update on public.assignment_templates;
drop policy if exists assignment_templates_delete on public.assignment_templates;

create policy assignment_templates_select on public.assignment_templates
  for select to authenticated
  using (is_admin() or (is_teacher() and teacher_id = auth.uid()));
create policy assignment_templates_insert on public.assignment_templates
  for insert to authenticated
  with check (is_teacher() and teacher_id = auth.uid());
create policy assignment_templates_update on public.assignment_templates
  for update to authenticated
  using (is_admin() or (is_teacher() and teacher_id = auth.uid()))
  with check (is_admin() or (is_teacher() and teacher_id = auth.uid()));
create policy assignment_templates_delete on public.assignment_templates
  for delete to authenticated
  using (is_admin() or (is_teacher() and teacher_id = auth.uid()));

grant select, insert, update, delete on public.assignment_templates to authenticated;
grant all on public.assignment_templates to service_role;
