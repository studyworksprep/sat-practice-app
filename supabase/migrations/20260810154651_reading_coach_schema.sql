-- Reading Coach content + session schema.
-- PR 1 of docs/reading-coach-implementation-plan.md (see its Data
-- model and Authorization sections for the design rationale).
--
-- Six tables: items (stable identity + publication pointer),
-- item_versions (immutable published content), choices (deterministic
-- authored answers), sessions (one student run of one item version),
-- turns (one student response + its evaluation), turn_reviews
-- (admin QA labels, PR 2 writes these).
--
-- Notes on deliberate choices:
--  - unique NULLS NOT DISTINCT on turns(session_id, stage, unit_key,
--    attempt_number): unit_key is NULL for the task/passage/preanswer
--    stages, and default NULL semantics would let duplicate attempt
--    rows through for those stages (flagged in the 2026-08-10 plan
--    assessment). PG17 in both projects supports the clause.
--  - A CHECK ties unit_key presence to stage = 'processing_unit'.
--  - Composite FK (session_id, user_id) -> sessions(id, user_id)
--    makes turn ownership provable at the constraint level.
--  - No anon grants at all (the plan forbids them; Supabase default
--    privileges would otherwise grant anon everything, as on older
--    tables). No delete grants: content archives, nothing deletes.
--  - Demo accounts get the repo's standard restrictive read-only
--    policies (mirrors 20260511000000_demo_readonly_foundation), so
--    "demo accounts cannot create sessions" holds by the same
--    invariant as every other table.
--  - Applied to studyworks-dev ONLY in PR 1. Production application
--    happens at launch (PR 4) with explicit owner authorization.
--
-- Applied via the Supabase MCP apply_migration tool; this file is the
-- audit record per supabase/migrations/README.md. Regenerate
-- lib/types/database.ts after applying.

-- ── content: items ───────────────────────────────────────────────

create table public.reading_coach_items (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  genre text not null
    check (genre in ('literature', 'history', 'social_science', 'science')),
  difficulty smallint not null check (difficulty between 1 and 3),
  source_metadata jsonb not null default '{}'::jsonb,
  current_version_id uuid,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── content: immutable versions ──────────────────────────────────

create table public.reading_coach_item_versions (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.reading_coach_items(id) on delete cascade,
  version_number integer not null check (version_number >= 1),
  question_stem_html text not null,
  passage_html text not null,
  task_type text not null
    check (task_type in ('main_idea', 'detail', 'function', 'inference')),
  processing_mode text not null
    check (processing_mode in ('whole_passage', 'sentence_chunks', 'adaptive')),
  rubric jsonb not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique (item_id, version_number)
);

alter table public.reading_coach_items
  add constraint reading_coach_items_current_version_fk
  foreign key (current_version_id)
  references public.reading_coach_item_versions(id);

-- ── content: choices ─────────────────────────────────────────────

create table public.reading_coach_choices (
  id uuid primary key default gen_random_uuid(),
  item_version_id uuid not null
    references public.reading_coach_item_versions(id) on delete cascade,
  label text not null check (label in ('A', 'B', 'C', 'D')),
  sort_order smallint not null,
  choice_html text not null,
  is_correct boolean not null,
  rationale_html text not null,
  error_code text,
  unique (item_version_id, label),
  unique (item_version_id, sort_order)
);

-- ── student: sessions ────────────────────────────────────────────

create table public.reading_coach_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  item_version_id uuid not null references public.reading_coach_item_versions(id),
  status text not null default 'in_progress'
    check (status in ('in_progress', 'completed', 'abandoned')),
  completion_mode text
    check (completion_mode in ('independent', 'scaffolded')),
  selected_choice_id uuid references public.reading_coach_choices(id),
  choice_correct boolean,
  source text not null default 'self_guided'
    check (source in ('self_guided', 'lesson')),
  source_id uuid,
  started_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (id, user_id)
);

-- ── student: turns ───────────────────────────────────────────────

create table public.reading_coach_turns (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  user_id uuid not null references public.profiles(id),
  client_request_id uuid not null,
  stage text not null
    check (stage in ('task', 'processing_unit', 'passage', 'preanswer')),
  unit_key text,
  attempt_number smallint not null check (attempt_number >= 1),
  student_text text not null,
  status text not null default 'pending'
    check (status in ('pending', 'completed', 'failed')),
  verdict text check (verdict in ('pass', 'revise', 'uncertain')),
  error_code text,
  feedback_text text,
  evidence jsonb,
  evaluation_json jsonb,
  model_id text,
  prompt_version text,
  input_tokens integer,
  output_tokens integer,
  cache_read_tokens integer,
  latency_ms integer,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint reading_coach_turns_unit_key_stage
    check ((stage = 'processing_unit') = (unit_key is not null)),
  unique (user_id, client_request_id),
  unique nulls not distinct (session_id, stage, unit_key, attempt_number),
  foreign key (session_id, user_id)
    references public.reading_coach_sessions(id, user_id) on delete cascade
);

-- ── QA: turn reviews (written by PR 2's QA lab) ──────────────────

create table public.reading_coach_turn_reviews (
  turn_id uuid primary key
    references public.reading_coach_turns(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id),
  disposition text not null
    check (disposition in ('agree', 'false_accept', 'false_reject',
                           'wrong_error', 'feedback_issue', 'unclear')),
  notes text,
  reviewed_at timestamptz not null default now()
);

-- ── indexes (RLS predicates + FK columns not already leading one) ─

create index reading_coach_items_created_by_idx
  on public.reading_coach_items (created_by);
create index reading_coach_items_current_version_idx
  on public.reading_coach_items (current_version_id);
create index reading_coach_item_versions_created_by_idx
  on public.reading_coach_item_versions (created_by);
create index reading_coach_sessions_user_idx
  on public.reading_coach_sessions (user_id, started_at desc);
create index reading_coach_sessions_item_version_idx
  on public.reading_coach_sessions (item_version_id);
create index reading_coach_sessions_selected_choice_idx
  on public.reading_coach_sessions (selected_choice_id);
-- (user_id, created_at) also serves the persistent daily AI-call cap.
create index reading_coach_turns_user_created_idx
  on public.reading_coach_turns (user_id, created_at desc);
create index reading_coach_turn_reviews_reviewer_idx
  on public.reading_coach_turn_reviews (reviewer_id);

-- ── grants: no anon, no delete ───────────────────────────────────

revoke all on public.reading_coach_items from anon;
revoke all on public.reading_coach_item_versions from anon;
revoke all on public.reading_coach_choices from anon;
revoke all on public.reading_coach_sessions from anon;
revoke all on public.reading_coach_turns from anon;
revoke all on public.reading_coach_turn_reviews from anon;

revoke all on public.reading_coach_items from authenticated;
revoke all on public.reading_coach_item_versions from authenticated;
revoke all on public.reading_coach_choices from authenticated;
revoke all on public.reading_coach_sessions from authenticated;
revoke all on public.reading_coach_turns from authenticated;
revoke all on public.reading_coach_turn_reviews from authenticated;

grant select, insert, update on public.reading_coach_items to authenticated;
grant select, insert, update on public.reading_coach_item_versions to authenticated;
grant select, insert, update on public.reading_coach_choices to authenticated;
grant select, insert, update on public.reading_coach_sessions to authenticated;
grant select, insert, update on public.reading_coach_turns to authenticated;
grant select, insert, update on public.reading_coach_turn_reviews to authenticated;

-- ── RLS ──────────────────────────────────────────────────────────

alter table public.reading_coach_items enable row level security;
alter table public.reading_coach_item_versions enable row level security;
alter table public.reading_coach_choices enable row level security;
alter table public.reading_coach_sessions enable row level security;
alter table public.reading_coach_turns enable row level security;
alter table public.reading_coach_turn_reviews enable row level security;

-- content: any authenticated user reads published; admins do everything
create policy reading_coach_items_select on public.reading_coach_items
  for select to authenticated
  using (status = 'published' or public.is_admin());

create policy reading_coach_items_admin_write on public.reading_coach_items
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy reading_coach_item_versions_select on public.reading_coach_item_versions
  for select to authenticated
  using (published_at is not null or public.is_admin());

create policy reading_coach_item_versions_admin_write on public.reading_coach_item_versions
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy reading_coach_choices_select on public.reading_coach_choices
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.reading_coach_item_versions v
      where v.id = item_version_id and v.published_at is not null
    )
  );

create policy reading_coach_choices_admin_write on public.reading_coach_choices
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- sessions/turns: owner full CRUD-minus-delete; staff read via can_view
create policy reading_coach_sessions_select on public.reading_coach_sessions
  for select to authenticated
  using (user_id = (select auth.uid()) or public.can_view(user_id));

create policy reading_coach_sessions_insert on public.reading_coach_sessions
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy reading_coach_sessions_update on public.reading_coach_sessions
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy reading_coach_turns_select on public.reading_coach_turns
  for select to authenticated
  using (user_id = (select auth.uid()) or public.can_view(user_id));

create policy reading_coach_turns_insert on public.reading_coach_turns
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy reading_coach_turns_update on public.reading_coach_turns
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- QA reviews: admin only
create policy reading_coach_turn_reviews_admin_all on public.reading_coach_turn_reviews
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ── demo read-only lockdown (repo invariant) ─────────────────────

do $$
declare
  rec record;
begin
  for rec in
    select unnest(array[
      'reading_coach_items',
      'reading_coach_item_versions',
      'reading_coach_choices',
      'reading_coach_sessions',
      'reading_coach_turns',
      'reading_coach_turn_reviews'
    ]) as tablename
  loop
    execute format($f$
      create policy demo_readonly_insert on public.%I
        as restrictive for insert
        to authenticated
        with check (not public.is_demo());

      create policy demo_readonly_update on public.%I
        as restrictive for update
        to authenticated
        using      (not public.is_demo())
        with check (not public.is_demo());

      create policy demo_readonly_delete on public.%I
        as restrictive for delete
        to authenticated
        using (not public.is_demo());
    $f$,
      rec.tablename, rec.tablename, rec.tablename
    );
  end loop;
end;
$$;
