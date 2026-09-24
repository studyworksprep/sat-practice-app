-- =========================================================
-- Techniques (step C): lessons carry techniques through the draft
-- workflow; practice steps say where their narrowing comes from
-- (docs/foundations-and-question-patterns.md §8.5 step C)
-- =========================================================
--
-- 1. curriculum_unit_steps.technique_source — a practice step draws the
--    unit's skill narrowed to techniques. Which techniques:
--      'lesson'   the techniques of the lesson step just before it
--                 (lesson_techniques) — the default, so "teach a tool,
--                 practise that tool" needs no per-step setup
--      'none'     no narrowing: the whole skill (or the chosen skills)
--      'explicit' the step's own technique_ids
--    Mixed sets never narrow (the launcher ignores techniques for them);
--    lesson steps carry the default and ignore it.
--
-- 2. lesson_revision_techniques — the tutor draft workflow keeps a
--    private copy of a lesson's scope (lesson_revision_topics); the
--    techniques a lesson teaches get the same treatment, copied in when
--    a revision is opened and written back when it is published.

-- ── 1. technique_source ─────────────────────────────────────────────

alter table public.curriculum_unit_steps
  add column if not exists technique_source text not null default 'lesson'
    check (technique_source in ('lesson', 'none', 'explicit'));

-- Existing explicit narrowing keeps its meaning; mixed sets never narrow.
update public.curriculum_unit_steps set technique_source = 'explicit' where technique_ids is not null;
update public.curriculum_unit_steps set technique_source = 'none'
 where kind = 'drill' and role = 'mixed' and technique_ids is null;

-- Explicit narrowing needs ids; the other sources carry none. (The
-- inline check above already took the <table>_<column>_check name.)
alter table public.curriculum_unit_steps
  add constraint curriculum_unit_steps_technique_ids_source_check
  check ((technique_source = 'explicit') = (technique_ids is not null));

comment on column public.curriculum_unit_steps.technique_source is
  'Practice drills: lesson = narrow to the preceding lesson step''s techniques (default), none = no narrowing, explicit = this row''s technique_ids. Ignored on lesson steps and mixed sets.';

-- ── 2. lesson_revision_techniques ───────────────────────────────────

create table if not exists public.lesson_revision_techniques (
  revision_id  uuid not null references public.lesson_revisions(id) on delete cascade,
  technique_id uuid not null references public.techniques(id) on delete cascade,
  primary key (revision_id, technique_id)
);

comment on table public.lesson_revision_techniques is
  'The techniques a lesson revision (tutor draft) teaches. Copied from lesson_techniques when a revision opens; written back on publish.';

alter table public.lesson_revision_techniques enable row level security;

-- Same shape as lesson_revision_topics: the revision''s viewer/editor
-- functions gate reads and writes, and the demo account is read-only.
create policy lesson_revision_techniques_select on public.lesson_revision_techniques
  for select to authenticated using (can_view_lesson_revision(revision_id));
create policy lesson_revision_techniques_insert on public.lesson_revision_techniques
  for insert to authenticated with check (can_edit_lesson_revision(revision_id));
create policy lesson_revision_techniques_delete on public.lesson_revision_techniques
  for delete to authenticated using (can_edit_lesson_revision(revision_id));
create policy demo_readonly_insert on public.lesson_revision_techniques
  as restrictive for insert to authenticated with check (not is_demo());
create policy demo_readonly_delete on public.lesson_revision_techniques
  as restrictive for delete to authenticated using (not is_demo());

-- ── 3. The revision workflow carries techniques both ways ───────────
--
-- Redefined verbatim from migration 20260923120000 plus the two copies.

create or replace function public.create_lesson_revision(p_base_lesson_id uuid default null::uuid, p_title text default 'Untitled lesson'::text)
returns uuid
language plpgsql
set search_path to 'public'
as $function$
declare
  v_revision_id uuid;
  v_base public.lessons%rowtype;
begin
  if not public.is_teacher() or public.is_demo() then
    raise exception 'Teaching staff only';
  end if;

  if p_base_lesson_id is not null then
    select id into v_revision_id
    from public.lesson_revisions
    where owner_id = auth.uid()
      and base_lesson_id = p_base_lesson_id
      and state in ('draft', 'submitted', 'changes_requested')
    limit 1;
    if v_revision_id is not null then
      return v_revision_id;
    end if;

    select * into v_base
    from public.lessons
    where id = p_base_lesson_id
      and status = 'published'
      and visibility = 'shared';
    if not found then
      raise exception 'Published lesson not found';
    end if;

    insert into public.lesson_revisions (
      base_lesson_id, owner_id, base_lesson_updated_at,
      title, description, kind, foundation_sequence
    ) values (
      v_base.id, auth.uid(), v_base.updated_at,
      v_base.title, v_base.description, v_base.kind, v_base.foundation_sequence
    ) returning id into v_revision_id;

    insert into public.lesson_revision_blocks (
      revision_id, source_block_id, sort_order, block_type, content, created_at
    )
    select v_revision_id, id, sort_order, block_type, content, coalesce(created_at, now())
    from public.lesson_blocks where lesson_id = v_base.id;

    insert into public.lesson_revision_topics (
      revision_id, source_topic_id, section, domain_name, skill_code
    )
    select v_revision_id, id, section, domain_name, skill_code
    from public.lesson_topics where lesson_id = v_base.id;

    insert into public.lesson_revision_techniques (revision_id, technique_id)
    select v_revision_id, technique_id
    from public.lesson_techniques where lesson_id = v_base.id
    on conflict do nothing;
  else
    insert into public.lesson_revisions (owner_id, title)
    values (auth.uid(), coalesce(nullif(trim(p_title), ''), 'Untitled lesson'))
    returning id into v_revision_id;
  end if;

  return v_revision_id;
end;
$function$;

create or replace function public.publish_lesson_revision(p_revision_id uuid, p_force boolean default false)
returns uuid
language plpgsql
set search_path to 'public'
as $function$
declare
  v_revision public.lesson_revisions%rowtype;
  v_lesson public.lessons%rowtype;
  v_lesson_id uuid;
  v_snapshot jsonb;
begin
  if not public.is_admin() or public.is_demo() then
    raise exception 'Admin only';
  end if;

  select * into v_revision
  from public.lesson_revisions
  where id = p_revision_id
  for update;
  if not found then raise exception 'Revision not found'; end if;
  if v_revision.state <> 'submitted' then
    raise exception 'Only submitted revisions can be published';
  end if;
  if not exists (
    select 1 from public.lesson_revision_blocks where revision_id = v_revision.id
  ) then
    raise exception 'A lesson needs at least one block';
  end if;

  if v_revision.base_lesson_id is not null then
    select * into v_lesson
    from public.lessons
    where id = v_revision.base_lesson_id
    for update;
    if not found then raise exception 'Base lesson no longer exists'; end if;
    if v_revision.base_lesson_updated_at is distinct from v_lesson.updated_at and not p_force then
      raise exception 'The source lesson changed after this proposal was created';
    end if;

    select jsonb_build_object(
      'lesson', to_jsonb(v_lesson),
      'blocks', coalesce((
        select jsonb_agg(to_jsonb(b) order by b.sort_order)
        from public.lesson_blocks b where b.lesson_id = v_lesson.id
      ), '[]'::jsonb),
      'topics', coalesce((
        select jsonb_agg(to_jsonb(t) order by t.id)
        from public.lesson_topics t where t.lesson_id = v_lesson.id
      ), '[]'::jsonb),
      'techniques', coalesce((
        select jsonb_agg(to_jsonb(x) order by x.technique_id)
        from public.lesson_techniques x where x.lesson_id = v_lesson.id
      ), '[]'::jsonb)
    ) into v_snapshot;

    insert into public.lesson_publication_history (
      lesson_id, revision_id, snapshot, created_by
    ) values (v_lesson.id, v_revision.id, v_snapshot, auth.uid());

    update public.lessons set
      title = v_revision.title,
      description = v_revision.description,
      kind = v_revision.kind,
      foundation_sequence = v_revision.foundation_sequence,
      status = 'published',
      visibility = 'shared',
      updated_at = now()
    where id = v_lesson.id;
    v_lesson_id := v_lesson.id;

    delete from public.lesson_blocks where lesson_id = v_lesson_id;
    delete from public.lesson_topics where lesson_id = v_lesson_id;
    delete from public.lesson_techniques where lesson_id = v_lesson_id;
  else
    insert into public.lessons (
      author_id, title, description, kind, foundation_sequence,
      status, visibility, created_at, updated_at
    ) values (
      v_revision.owner_id, v_revision.title, v_revision.description,
      v_revision.kind, v_revision.foundation_sequence,
      'published', 'shared', now(), now()
    ) returning id into v_lesson_id;
  end if;

  insert into public.lesson_blocks (
    id, lesson_id, sort_order, block_type, content, created_at
  )
  select coalesce(source_block_id, id), v_lesson_id, sort_order, block_type, content, created_at
  from public.lesson_revision_blocks
  where revision_id = v_revision.id
  order by sort_order;

  insert into public.lesson_topics (
    id, lesson_id, section, domain_name, skill_code
  )
  select coalesce(source_topic_id, id), v_lesson_id, section, domain_name, skill_code
  from public.lesson_revision_topics
  where revision_id = v_revision.id;

  insert into public.lesson_techniques (lesson_id, technique_id)
  select v_lesson_id, technique_id
  from public.lesson_revision_techniques
  where revision_id = v_revision.id
  on conflict do nothing;

  update public.lesson_revisions set
    state = 'approved',
    published_lesson_id = v_lesson_id,
    reviewer_id = auth.uid(),
    reviewed_at = now()
  where id = v_revision.id;

  return v_lesson_id;
end;
$function$;
