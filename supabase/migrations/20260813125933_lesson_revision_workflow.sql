-- Tutor/manager lesson contribution workflow.
--
-- Canonical rows in lessons remain the student-facing library and are now
-- admin-write-only. Teaching staff work in private revision rows instead:
--   base_lesson_id set   -> proposed changes to an existing lesson
--   base_lesson_id null  -> proposed brand-new lesson
--
-- Only submitted revisions enter the admin review queue. Publishing is one
-- SECURITY DEFINER transaction that snapshots the current canonical lesson,
-- promotes the revision, and closes the review row.

create table public.lesson_revisions (
  id                     uuid primary key default gen_random_uuid(),
  base_lesson_id         uuid references public.lessons(id) on delete set null,
  published_lesson_id    uuid references public.lessons(id) on delete set null,
  owner_id               uuid not null references public.profiles(id) on delete cascade,
  state                  text not null default 'draft'
    check (state in ('draft', 'submitted', 'changes_requested', 'approved', 'rejected', 'withdrawn')),
  base_lesson_updated_at timestamptz,
  title                  text not null check (char_length(trim(title)) > 0),
  description            text,
  kind                   text not null default 'standard'
    check (kind in ('standard', 'foundation')),
  foundation_sequence    integer,
  change_summary         text,
  review_note            text,
  reviewer_id            uuid references public.profiles(id) on delete set null,
  submitted_at           timestamptz,
  reviewed_at            timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint lesson_revisions_foundation_sequence_check
    check (foundation_sequence is null or kind = 'foundation')
);

create index lesson_revisions_owner_idx
  on public.lesson_revisions(owner_id, updated_at desc);
create index lesson_revisions_review_queue_idx
  on public.lesson_revisions(state, submitted_at)
  where state = 'submitted';

-- One unfinished proposal per tutor per canonical lesson. New-lesson drafts
-- have no base id and are intentionally not constrained by this index.
create unique index lesson_revisions_one_active_per_owner_base_idx
  on public.lesson_revisions(owner_id, base_lesson_id)
  where base_lesson_id is not null
    and state in ('draft', 'submitted', 'changes_requested');

create trigger trg_lesson_revisions_updated_at
  before update on public.lesson_revisions
  for each row execute function public.set_updated_at();

-- RLS controls which rows a contributor may update. This trigger additionally
-- protects provenance/review columns and constrains the only two contributor
-- workflow transitions. Admin review actions are unaffected.
create or replace function public.guard_lesson_revision_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_admin() then return new; end if;

  new.owner_id := old.owner_id;
  new.base_lesson_id := old.base_lesson_id;
  new.published_lesson_id := old.published_lesson_id;
  new.base_lesson_updated_at := old.base_lesson_updated_at;
  new.reviewer_id := old.reviewer_id;
  new.reviewed_at := old.reviewed_at;
  new.review_note := old.review_note;
  new.submitted_at := old.submitted_at;

  if old.state = 'draft' and new.state not in ('draft', 'submitted') then
    raise exception 'Invalid lesson revision state transition';
  end if;
  if old.state = 'changes_requested' and new.state not in ('changes_requested', 'submitted') then
    raise exception 'Invalid lesson revision state transition';
  end if;
  if new.state = 'submitted' and old.state <> 'submitted' then
    new.submitted_at := now();
  end if;
  return new;
end;
$$;

create trigger trg_guard_lesson_revision_update
  before update on public.lesson_revisions
  for each row execute function public.guard_lesson_revision_update();

create table public.lesson_revision_blocks (
  id          uuid primary key default gen_random_uuid(),
  revision_id uuid not null references public.lesson_revisions(id) on delete cascade,
  -- Deliberately not an FK: the canonical block is replaced during
  -- publication, while this provenance must remain in the audit proposal.
  source_block_id uuid,
  sort_order  integer not null default 0,
  block_type  text not null check (block_type in (
    'text', 'video', 'check', 'question_link', 'desmos_interactive', 'lesson_complete'
  )),
  content     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index lesson_revision_blocks_revision_idx
  on public.lesson_revision_blocks(revision_id, sort_order);
create unique index lesson_revision_blocks_source_unique_idx
  on public.lesson_revision_blocks(revision_id, source_block_id)
  where source_block_id is not null;

create table public.lesson_revision_topics (
  id          uuid primary key default gen_random_uuid(),
  revision_id uuid not null references public.lesson_revisions(id) on delete cascade,
  source_topic_id uuid,
  section     text check (section is null or section in ('math', 'reading_writing')),
  domain_name text,
  skill_code  text,
  pattern_id  uuid references public.question_patterns(id) on delete cascade,
  constraint lesson_revision_topics_one_grain check (
    (section is not null and domain_name is null and skill_code is null and pattern_id is null)
    or (domain_name is not null and section is null and pattern_id is null)
    or (pattern_id is not null and section is null and domain_name is null and skill_code is null)
  )
);

create unique index lesson_revision_topics_unique_idx
  on public.lesson_revision_topics (
    revision_id,
    coalesce(section, ''),
    coalesce(domain_name, ''),
    coalesce(skill_code, ''),
    coalesce(pattern_id::text, '')
  );
create unique index lesson_revision_topics_source_unique_idx
  on public.lesson_revision_topics(revision_id, source_topic_id)
  where source_topic_id is not null;

-- Immutable audit snapshots created immediately before a revision is
-- promoted. This is intentionally admin-readable only; a future rollback UI
-- can restore one of these snapshots without changing the contribution model.
create table public.lesson_publication_history (
  id          uuid primary key default gen_random_uuid(),
  lesson_id   uuid not null references public.lessons(id) on delete cascade,
  revision_id uuid references public.lesson_revisions(id) on delete set null,
  snapshot    jsonb not null,
  created_by  uuid not null references public.profiles(id) on delete restrict,
  created_at  timestamptz not null default now()
);

create index lesson_publication_history_lesson_idx
  on public.lesson_publication_history(lesson_id, created_at desc);

alter table public.lesson_revisions enable row level security;
alter table public.lesson_revision_blocks enable row level security;
alter table public.lesson_revision_topics enable row level security;
alter table public.lesson_publication_history enable row level security;

-- Data API grants are explicit so this migration works on projects using
-- either the legacy permissive defaults or Supabase's newer opt-in defaults.
revoke all on public.lesson_revisions from anon;
revoke all on public.lesson_revision_blocks from anon;
revoke all on public.lesson_revision_topics from anon;
revoke all on public.lesson_publication_history from anon;
grant select, insert, update, delete on public.lesson_revisions to authenticated;
grant select, insert, update, delete on public.lesson_revision_blocks to authenticated;
grant select, insert, update, delete on public.lesson_revision_topics to authenticated;
grant select, insert, update, delete on public.lesson_publication_history to authenticated;

create or replace function public.can_view_lesson_revision(p_revision_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.lesson_revisions r
    where r.id = p_revision_id
      and (r.owner_id = auth.uid() or public.is_admin())
  );
$$;

create or replace function public.can_edit_lesson_revision(p_revision_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.lesson_revisions r
    where r.id = p_revision_id
      and r.owner_id = auth.uid()
      and r.state in ('draft', 'changes_requested')
      and public.is_teacher()
      and not public.is_demo()
  );
$$;

revoke execute on function public.guard_lesson_revision_update() from public, anon, authenticated;
revoke execute on function public.can_view_lesson_revision(uuid) from public, anon;
grant execute on function public.can_view_lesson_revision(uuid) to authenticated;
revoke execute on function public.can_edit_lesson_revision(uuid) from public, anon;
grant execute on function public.can_edit_lesson_revision(uuid) to authenticated;

create policy lesson_revisions_select on public.lesson_revisions
  for select to authenticated
  using (owner_id = auth.uid() or public.is_admin());

create policy lesson_revisions_insert on public.lesson_revisions
  for insert to authenticated
  with check (
    public.is_teacher() and not public.is_demo()
    and owner_id = auth.uid() and state = 'draft'
  );

create policy lesson_revisions_owner_update on public.lesson_revisions
  for update to authenticated
  using (
    owner_id = auth.uid() and state in ('draft', 'changes_requested')
    and public.is_teacher() and not public.is_demo()
  )
  with check (
    owner_id = auth.uid() and state in ('draft', 'changes_requested', 'submitted')
    and public.is_teacher() and not public.is_demo()
  );

create policy lesson_revisions_admin_update on public.lesson_revisions
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy lesson_revisions_delete on public.lesson_revisions
  for delete to authenticated
  using (
    public.is_admin()
    or (owner_id = auth.uid() and state in ('draft', 'changes_requested'))
  );

create policy lesson_revision_blocks_select on public.lesson_revision_blocks
  for select to authenticated using (public.can_view_lesson_revision(revision_id));
create policy lesson_revision_blocks_insert on public.lesson_revision_blocks
  for insert to authenticated with check (public.can_edit_lesson_revision(revision_id));
create policy lesson_revision_blocks_update on public.lesson_revision_blocks
  for update to authenticated
  using (public.can_edit_lesson_revision(revision_id))
  with check (public.can_edit_lesson_revision(revision_id));
create policy lesson_revision_blocks_delete on public.lesson_revision_blocks
  for delete to authenticated using (public.can_edit_lesson_revision(revision_id));

create policy lesson_revision_topics_select on public.lesson_revision_topics
  for select to authenticated using (public.can_view_lesson_revision(revision_id));
create policy lesson_revision_topics_insert on public.lesson_revision_topics
  for insert to authenticated with check (public.can_edit_lesson_revision(revision_id));
create policy lesson_revision_topics_update on public.lesson_revision_topics
  for update to authenticated
  using (public.can_edit_lesson_revision(revision_id))
  with check (public.can_edit_lesson_revision(revision_id));
create policy lesson_revision_topics_delete on public.lesson_revision_topics
  for delete to authenticated using (public.can_edit_lesson_revision(revision_id));

create policy lesson_publication_history_select on public.lesson_publication_history
  for select to authenticated using (public.is_admin());
create policy lesson_publication_history_insert on public.lesson_publication_history
  for insert to authenticated with check (public.is_admin());

-- Apply the standard demo-account database lockdown to the new writable
-- tables. The application also calls assertWriter(), but RLS is authoritative.
do $$
declare
  rec record;
begin
  for rec in
    select unnest(array[
      'lesson_revisions', 'lesson_revision_blocks',
      'lesson_revision_topics', 'lesson_publication_history'
    ]) as tablename
  loop
    execute format($f$
      create policy demo_readonly_insert on public.%I
        as restrictive for insert to authenticated
        with check (not public.is_demo());
      create policy demo_readonly_update on public.%I
        as restrictive for update to authenticated
        using (not public.is_demo()) with check (not public.is_demo());
      create policy demo_readonly_delete on public.%I
        as restrictive for delete to authenticated
        using (not public.is_demo());
    $f$,
      rec.tablename,
      rec.tablename,
      rec.tablename
    );
  end loop;
end;
$$;

-- Create a new proposal or return the caller's existing active proposal for
-- the same canonical lesson. Copying is atomic and preserves block/topic ids,
-- which lets promotion retain unchanged block ids used by student progress.
create or replace function public.create_lesson_revision(
  p_base_lesson_id uuid default null,
  p_title text default 'Untitled lesson'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
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
      revision_id, source_topic_id, section, domain_name, skill_code, pattern_id
    )
    select v_revision_id, id, section, domain_name, skill_code, pattern_id
    from public.lesson_topics where lesson_id = v_base.id;
  else
    insert into public.lesson_revisions (owner_id, title)
    values (auth.uid(), coalesce(nullif(trim(p_title), ''), 'Untitled lesson'))
    returning id into v_revision_id;
  end if;

  return v_revision_id;
end;
$$;

-- Admin-only atomic promotion. Existing-lesson proposals retain the canonical
-- lesson id; new-lesson proposals create one canonical published row. The
-- optimistic timestamp check prevents silently applying a proposal whose base
-- changed during review.
create or replace function public.publish_lesson_revision(
  p_revision_id uuid,
  p_force boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
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
    id, lesson_id, section, domain_name, skill_code, pattern_id
  )
  select coalesce(source_topic_id, id), v_lesson_id, section, domain_name, skill_code, pattern_id
  from public.lesson_revision_topics
  where revision_id = v_revision.id;

  update public.lesson_revisions set
    state = 'approved',
    published_lesson_id = v_lesson_id,
    reviewer_id = auth.uid(),
    reviewed_at = now()
  where id = v_revision.id;

  return v_lesson_id;
end;
$$;

revoke execute on function public.create_lesson_revision(uuid, text) from public, anon;
grant execute on function public.create_lesson_revision(uuid, text) to authenticated;
revoke execute on function public.publish_lesson_revision(uuid, boolean) from public, anon;
grant execute on function public.publish_lesson_revision(uuid, boolean) to authenticated;

-- Canonical lesson content is now admin-write-only. Attribution remains on
-- lessons.author_id, but authorship no longer grants mutation rights.
drop policy if exists lessons_select on public.lessons;
create policy lessons_select on public.lessons
  for select to authenticated using (
    (visibility = 'shared' and status = 'published') or public.is_admin()
  );

drop policy if exists lessons_insert on public.lessons;
create policy lessons_insert on public.lessons
  for insert to authenticated with check (public.is_admin());
drop policy if exists lessons_update on public.lessons;
create policy lessons_update on public.lessons
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists lessons_delete on public.lessons;
create policy lessons_delete on public.lessons
  for delete to authenticated using (public.is_admin());

create or replace function public.can_view_lesson(p_lesson_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.lessons
    where id = p_lesson_id
      and ((visibility = 'shared' and status = 'published') or public.is_admin())
  );
$$;

drop policy if exists lesson_blocks_insert on public.lesson_blocks;
create policy lesson_blocks_insert on public.lesson_blocks
  for insert to authenticated with check (public.is_admin());
drop policy if exists lesson_blocks_update on public.lesson_blocks;
create policy lesson_blocks_update on public.lesson_blocks
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists lesson_blocks_delete on public.lesson_blocks;
create policy lesson_blocks_delete on public.lesson_blocks
  for delete to authenticated using (public.is_admin());

drop policy if exists lesson_topics_insert on public.lesson_topics;
create policy lesson_topics_insert on public.lesson_topics
  for insert to authenticated with check (public.is_admin());
drop policy if exists lesson_topics_update on public.lesson_topics;
create policy lesson_topics_update on public.lesson_topics
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists lesson_topics_delete on public.lesson_topics;
create policy lesson_topics_delete on public.lesson_topics
  for delete to authenticated using (public.is_admin());
