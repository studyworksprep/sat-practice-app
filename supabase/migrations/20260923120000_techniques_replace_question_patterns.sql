-- =========================================================
-- Techniques replace question patterns
-- (docs/foundations-and-question-patterns.md §8)
-- =========================================================
--
-- The curriculum has two axes. CONTENT is the 29 SAT skills: units,
-- mastery, coverage and plan phases stay keyed to it and nothing here
-- touches that spine. TECHNIQUE is how a question is solved — graphing
-- to x-intercepts, regression, Desmos lists, plugging in answers, Good
-- Cop Bad Cop — and it cuts across skills and domains: the SAT splits
-- linear and nonlinear content that share one method, word problems
-- and geometry questions end in "solve an equation", and one question
-- is solvable by several techniques.
--
-- The question-pattern layer (migrations 20260727190000 and
-- 20260816120000) could not carry that: a pattern was scoped to one
-- skill and a question held at most one. Its catalog was two rows with
-- nothing tagged, so it is replaced outright rather than kept beside
-- the new concept.
--
--   techniques           the catalog: name, when to use it, process
--   technique_skills     default applicability — every question in
--                        these skills counts as the technique
--   question_techniques  explicit per-question tags, many per question
--   lesson_techniques    the techniques a lesson teaches
--
-- A practice drill that follows a lesson draws the unit's skills
-- narrowed to that lesson's techniques (tagged or default-applicable
-- questions first, topped up from the skill when short).
-- curriculum_unit_steps.technique_ids is the optional explicit
-- narrowing for a drill step; it replaces pattern_id.
--
-- Everything pattern-shaped is retired: question_patterns,
-- questions_v2.pattern_id (+ pattern_tagged_by/at),
-- question_content_drafts.pattern_id, lesson_topics.pattern_id,
-- lesson_revision_topics.pattern_id, curriculum_unit_steps.pattern_id
-- and set_question_pattern(). The two live pattern rows carry over as
-- techniques (default skill = the pattern's skill) so nothing the owner
-- wrote is lost.

-- ── 1. techniques ───────────────────────────────────────────────────

create table if not exists public.techniques (
  id              uuid primary key default gen_random_uuid(),
  test_type       text not null default 'sat',
  name            text not null,
  -- "When to use it": the sentence a student matches against the
  -- question before solving. The highest-value field.
  description     text not null,
  -- The rehearsed procedure, one to three lines.
  process_summary text,
  -- Catalog grouping only; null = applies in both sections.
  section         text check (section is null or section in ('math', 'reading_writing')),
  sequence        integer not null default 1,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (test_type, name)
);

create index if not exists techniques_order_idx
  on public.techniques (test_type, section, sequence);

comment on table public.techniques is
  'How a question is solved (graphing to x-intercepts, regression, plugging in answers, …). Cuts across skills; a question may carry several. Admin-authored, readable by every authenticated user.';

alter table public.techniques enable row level security;

create policy techniques_select on public.techniques
  for select using (true);
create policy techniques_admin_insert on public.techniques
  for insert with check (is_admin());
create policy techniques_admin_update on public.techniques
  for update using (is_admin()) with check (is_admin());
create policy techniques_admin_delete on public.techniques
  for delete using (is_admin());

-- ── 2. technique_skills — default applicability ─────────────────────

create table if not exists public.technique_skills (
  technique_id uuid not null references public.techniques(id) on delete cascade,
  skill_code   text not null,
  primary key (technique_id, skill_code)
);

create index if not exists technique_skills_skill_idx
  on public.technique_skills (skill_code);

comment on table public.technique_skills is
  'Default applicability: every published question in skill_code counts as the technique, without a per-question tag (e.g. Good Cop Bad Cop = every R&W skill except Form, Structure, and Sense).';

alter table public.technique_skills enable row level security;

create policy technique_skills_select on public.technique_skills
  for select using (true);
create policy technique_skills_admin_insert on public.technique_skills
  for insert with check (is_admin());
create policy technique_skills_admin_update on public.technique_skills
  for update using (is_admin()) with check (is_admin());
create policy technique_skills_admin_delete on public.technique_skills
  for delete using (is_admin());

-- ── 3. question_techniques — explicit per-question tags ─────────────

create table if not exists public.question_techniques (
  question_id  uuid not null references public.questions_v2(id) on delete cascade,
  technique_id uuid not null references public.techniques(id) on delete cascade,
  tagged_by    uuid references public.profiles(id) on delete set null,
  tagged_at    timestamptz not null default now(),
  primary key (question_id, technique_id)
);

create index if not exists question_techniques_technique_idx
  on public.question_techniques (technique_id);
-- Powers the "recently tagged" audit strip on the techniques page.
create index if not exists question_techniques_tagged_at_idx
  on public.question_techniques (tagged_at desc);

comment on table public.question_techniques is
  'Explicit technique tags on a question, many per question, written through set_question_techniques() (manager + admin). Default applicability lives in technique_skills; there are no per-question exclusions.';

alter table public.question_techniques enable row level security;

-- Managers write through the SECURITY DEFINER function below (the
-- same reason set_question_pattern existed: questions_v2 UPDATE is
-- admin-only and should stay that way). Admins may also write
-- directly.
create policy question_techniques_select on public.question_techniques
  for select using (true);
create policy question_techniques_admin_insert on public.question_techniques
  for insert with check (is_admin());
create policy question_techniques_admin_update on public.question_techniques
  for update using (is_admin()) with check (is_admin());
create policy question_techniques_admin_delete on public.question_techniques
  for delete using (is_admin());

-- ── 4. lesson_techniques — what a lesson teaches ────────────────────

create table if not exists public.lesson_techniques (
  lesson_id    uuid not null references public.lessons(id) on delete cascade,
  technique_id uuid not null references public.techniques(id) on delete cascade,
  primary key (lesson_id, technique_id)
);

create index if not exists lesson_techniques_technique_idx
  on public.lesson_techniques (technique_id);

comment on table public.lesson_techniques is
  'The technique(s) a lesson teaches. The practice drill after a lesson narrows to these; a lesson reused in another unit drills that unit''s questions for the same technique.';

alter table public.lesson_techniques enable row level security;

create policy lesson_techniques_select on public.lesson_techniques
  for select using (true);
create policy lesson_techniques_admin_insert on public.lesson_techniques
  for insert with check (is_admin());
create policy lesson_techniques_admin_update on public.lesson_techniques
  for update using (is_admin()) with check (is_admin());
create policy lesson_techniques_admin_delete on public.lesson_techniques
  for delete using (is_admin());

-- ── 5. Carry the pattern catalog over ───────────────────────────────
--
-- Same ids, so anything written down elsewhere still resolves. A
-- pattern's recognition cue is the technique's "when to use it"; its
-- skill becomes the technique's one default skill. A name collision
-- across skills (none in production) keeps the first row.

insert into public.techniques (id, test_type, name, description, process_summary, section, sequence, created_at, updated_at)
select
  p.id, p.test_type, p.name, p.recognition_cue, p.process_summary,
  case when p.domain_code in ('H', 'P', 'Q', 'S') then 'math' else 'reading_writing' end,
  p.sequence,
  coalesce(p.created_at, now()), coalesce(p.updated_at, now())
from public.question_patterns p
order by p.created_at nulls last, p.id
on conflict (test_type, name) do nothing;

insert into public.technique_skills (technique_id, skill_code)
select p.id, p.skill_code
from public.question_patterns p
join public.techniques t on t.id = p.id
on conflict do nothing;

insert into public.question_techniques (question_id, technique_id, tagged_by, tagged_at)
select q.id, q.pattern_id, q.pattern_tagged_by, coalesce(q.pattern_tagged_at, now())
from public.questions_v2 q
join public.techniques t on t.id = q.pattern_id
where q.pattern_id is not null
on conflict do nothing;

insert into public.lesson_techniques (lesson_id, technique_id)
select lt.lesson_id, lt.pattern_id
from public.lesson_topics lt
join public.techniques t on t.id = lt.pattern_id
where lt.pattern_id is not null
on conflict do nothing;

-- Pattern-grain scope rows have no grain left once the column goes.
delete from public.lesson_topics where pattern_id is not null;
delete from public.lesson_revision_topics where pattern_id is not null;

-- ── 6. curriculum_unit_steps: pattern_id → technique_ids ────────────

alter table public.curriculum_unit_steps
  add column if not exists technique_ids uuid[];

update public.curriculum_unit_steps
   set technique_ids = array[pattern_id]
 where pattern_id is not null;

alter table public.curriculum_unit_steps
  drop constraint if exists curriculum_unit_steps_check;
alter table public.curriculum_unit_steps
  drop column if exists pattern_id;
alter table public.curriculum_unit_steps
  add constraint curriculum_unit_steps_check check (
    (kind = 'lesson' and lesson_id is not null and role is null and technique_ids is null)
    or
    (kind = 'drill' and lesson_id is null and role is not null)
  );

comment on column public.curriculum_unit_steps.technique_ids is
  'Drill steps only. Optional explicit narrowing: questions matching these techniques (tagged, or default-applicable by skill) are drawn first, topped up from the step''s skills when short. Null = no explicit narrowing.';

-- A uuid[] cannot carry a foreign key, so a deleted technique is
-- scrubbed out of every step that named it.
create or replace function public.tg_technique_deleted_scrub_steps()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  update public.curriculum_unit_steps
     set technique_ids = nullif(array_remove(technique_ids, old.id), '{}'::uuid[]),
         updated_at = now()
   where technique_ids @> array[old.id];
  return old;
end;
$function$;

drop trigger if exists techniques_scrub_steps on public.techniques;
create trigger techniques_scrub_steps
  after delete on public.techniques
  for each row execute function public.tg_technique_deleted_scrub_steps();

-- ── 7. lesson_topics / lesson_revision_topics lose the pattern grain ─
--
-- Three grains remain: section, domain, skill (docs §2). The
-- one-grain checks and unique indexes are rebuilt without pattern_id.

alter table public.lesson_topics drop constraint if exists lesson_topics_one_grain;
drop index if exists public.lesson_topics_unique_idx;
drop index if exists public.lesson_topics_pattern_idx;
alter table public.lesson_topics drop column if exists pattern_id;

alter table public.lesson_topics
  add constraint lesson_topics_one_grain check (
    (section is not null and domain_name is null and skill_code is null)
    or (domain_name is not null and section is null)
  );

create unique index lesson_topics_unique_idx on public.lesson_topics
  (lesson_id, coalesce(section, ''), coalesce(domain_name, ''), coalesce(skill_code, ''));

alter table public.lesson_revision_topics drop constraint if exists lesson_revision_topics_one_grain;
drop index if exists public.lesson_revision_topics_unique_idx;
drop index if exists public.lesson_revision_topics_pattern_idx;
alter table public.lesson_revision_topics drop column if exists pattern_id;

alter table public.lesson_revision_topics
  add constraint lesson_revision_topics_one_grain check (
    (section is not null and domain_name is null and skill_code is null)
    or (domain_name is not null and section is null)
  );

create unique index lesson_revision_topics_unique_idx on public.lesson_revision_topics
  (revision_id, coalesce(section, ''), coalesce(domain_name, ''), coalesce(skill_code, ''));

-- The revision workflow copies scope rows by column name in both
-- directions (migration 20260813125933); both functions are redefined
-- verbatim minus pattern_id.

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
    id, lesson_id, section, domain_name, skill_code
  )
  select coalesce(source_topic_id, id), v_lesson_id, section, domain_name, skill_code
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
$function$;

-- ── 8. questions_v2 / drafts: retire the pattern columns ────────────

drop function if exists public.set_question_pattern(uuid, uuid);

alter table public.questions_v2
  drop column if exists pattern_id,
  drop column if exists pattern_tagged_by,
  drop column if exists pattern_tagged_at;

alter table public.question_content_drafts
  drop column if exists pattern_id;

drop table if exists public.question_patterns;

-- ── 9. set_question_techniques() — the manager write path ───────────
--
-- Same shape as set_question_pattern(): SECURITY DEFINER, is_manager()
-- gate, touches question_techniques and nothing else, so questions_v2
-- UPDATE stays admin-only. Replaces the question's whole set — a
-- multi-select saves what it shows.

create or replace function public.set_question_techniques(
  p_question_id uuid,
  p_technique_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_question questions_v2%rowtype;
  v_actor uuid := auth.uid();
  v_stamp timestamptz := now();
  v_ids uuid[] := coalesce(p_technique_ids, '{}'::uuid[]);
  v_unknown integer;
  v_name text;
begin
  if not is_manager() then
    raise exception 'Manager or admin only';
  end if;
  if p_question_id is null then
    raise exception 'Question id is required';
  end if;

  -- Locked so two tutors tagging the same question from two review
  -- sessions serialize instead of interleaving.
  select * into v_question from questions_v2 where id = p_question_id for update;
  if not found then
    raise exception 'Question not found';
  end if;
  if v_question.deleted_at is not null then
    raise exception 'Question is deleted';
  end if;

  select count(*) into v_unknown
    from unnest(v_ids) as u(id)
   where not exists (select 1 from techniques t where t.id = u.id);
  if v_unknown > 0 then
    raise exception 'Unknown technique';
  end if;

  delete from question_techniques
   where question_id = p_question_id
     and not (technique_id = any (v_ids));

  insert into question_techniques (question_id, technique_id, tagged_by, tagged_at)
  select distinct p_question_id, u.id, v_actor, v_stamp
    from unnest(v_ids) as u(id)
  on conflict (question_id, technique_id) do nothing;

  select nullif(trim(coalesce(tutor_name, concat_ws(' ', first_name, last_name))), '')
    into v_name
    from profiles
   where id = v_actor;

  return jsonb_build_object(
    'question_id', p_question_id,
    'technique_ids', coalesce((
      select jsonb_agg(qt.technique_id order by t.sequence, t.name)
        from question_techniques qt
        join techniques t on t.id = qt.technique_id
       where qt.question_id = p_question_id
    ), '[]'::jsonb),
    'technique_names', coalesce((
      select jsonb_agg(t.name order by t.sequence, t.name)
        from question_techniques qt
        join techniques t on t.id = qt.technique_id
       where qt.question_id = p_question_id
    ), '[]'::jsonb),
    'tagged_by', v_actor,
    'tagged_by_name', v_name,
    'tagged_at', v_stamp
  );
end;
$function$;

revoke all on function public.set_question_techniques(uuid, uuid[]) from public;
revoke all on function public.set_question_techniques(uuid, uuid[]) from anon;
grant execute on function public.set_question_techniques(uuid, uuid[]) to authenticated;

comment on function public.set_question_techniques(uuid, uuid[]) is
  'Replace a question''s technique tags. Manager/admin only. Writes question_techniques and nothing else, so questions_v2 UPDATE can stay admin-only.';
