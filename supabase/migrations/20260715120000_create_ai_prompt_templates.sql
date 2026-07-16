-- ai_prompt_templates — admin-editable prompt overrides for AI
-- generation features. One row per feature, keyed by unique name
-- (v1: 'lesson_generation'). The code-side default template is the
-- fallback whenever no row exists, so "reset to default" simply
-- deletes the row and can never drift from the code default.

create table if not exists public.ai_prompt_templates (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  template   text not null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.ai_prompt_templates is
  'Admin-edited prompt template overrides for AI generation features. Absence of a row means the code-side default applies.';

drop trigger if exists trg_ai_prompt_templates_updated_at on public.ai_prompt_templates;
create trigger trg_ai_prompt_templates_updated_at
  before update on public.ai_prompt_templates
  for each row execute function public.set_updated_at();

alter table public.ai_prompt_templates enable row level security;

drop policy if exists ai_prompt_templates_admin_all on public.ai_prompt_templates;
create policy ai_prompt_templates_admin_all on public.ai_prompt_templates
  for all to public
  using (public.is_admin())
  with check (public.is_admin());
