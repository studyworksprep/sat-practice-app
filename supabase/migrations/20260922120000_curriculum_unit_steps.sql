-- =========================================================
-- Unit syllabi: curriculum_unit_steps
-- =========================================================
--
-- The curriculum stays at skill grain (one curriculum_units row per SAT
-- skill — the foundations doc's guardrail), but a unit now carries an
-- ordered SYLLABUS: the lessons that teach it, in teaching order, each
-- followed by the drill that exercises it, and a mixed set at the end.
-- This is the owner's in-person sequence made data ("teach solving by
-- graphing → adapted examples → teach regression → examples → mixed
-- homework"), and it replaces the generator's built-in lesson-then-drill
-- pair, which could hold at most one lesson per skill and picked it
-- alphabetically at click time.
--
--   kind = 'lesson'  → lesson_id (a bank lesson; may appear in several
--                      units — a technique taught once is skipped or
--                      refreshed later via lesson_progress)
--   kind = 'drill'   → role 'practice' (the questions for the lesson just
--                      taught) or 'mixed' (homework across the unit so
--                      far); skill_codes widens the draw beyond the
--                      unit's own skill; pattern_id narrows it to one
--                      question format once catalogs exist.
--
-- Consumers: lib/plan/generate-plan.ts walks steps when the
-- `unit_syllabus` feature flag is on (lib/plan/unit-steps.ts loads them);
-- the dashboard's task launcher honors skill_codes / pattern_id. Every
-- SAT unit is backfilled with a default two-step syllabus that reproduces
-- today's output, so nothing changes until a real syllabus is authored.
-- syllabus_authored_at on the unit marks a human-authored one.

create table if not exists public.curriculum_unit_steps (
  id                uuid primary key default gen_random_uuid(),
  unit_id           uuid not null references public.curriculum_units(id) on delete cascade,
  position          integer not null check (position > 0),
  kind              text not null check (kind in ('lesson', 'drill')),
  lesson_id         uuid references public.lessons(id) on delete cascade,
  role              text check (role in ('practice', 'mixed')),
  skill_codes       text[],
  pattern_id        uuid references public.question_patterns(id) on delete set null,
  question_count    integer check (question_count is null or question_count between 1 and 50),
  minutes           integer check (minutes is null or minutes between 5 and 240),
  skip_if_completed boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (unit_id, position),
  -- Exactly one coherent shape per row.
  check (
    (kind = 'lesson' and lesson_id is not null and role is null and pattern_id is null)
    or
    (kind = 'drill' and lesson_id is null and role is not null)
  )
);

create index if not exists curriculum_unit_steps_unit_idx
  on public.curriculum_unit_steps (unit_id, position);
create index if not exists curriculum_unit_steps_lesson_idx
  on public.curriculum_unit_steps (lesson_id)
  where lesson_id is not null;

comment on table public.curriculum_unit_steps is
  'Ordered syllabus per curriculum unit: lessons in teaching order, each followed by its practice drill, plus mixed sets. Walked by the plan generator (flag unit_syllabus).';

alter table public.curriculum_unit_steps enable row level security;

-- Same shape as curriculum_units / question_patterns: reference data any
-- authenticated user can read, admin-authored.
create policy curriculum_unit_steps_select on public.curriculum_unit_steps
  for select using (true);
create policy curriculum_unit_steps_admin_insert on public.curriculum_unit_steps
  for insert with check (is_admin());
create policy curriculum_unit_steps_admin_update on public.curriculum_unit_steps
  for update using (is_admin()) with check (is_admin());
create policy curriculum_unit_steps_admin_delete on public.curriculum_unit_steps
  for delete using (is_admin());

-- Marks a unit whose syllabus a human authored (null = the backfilled
-- default below, which the editor will show as "not yet authored").
alter table public.curriculum_units
  add column if not exists syllabus_authored_at timestamptz;

-- ── Backfill: the default two-step syllabus ───────────────────────
--
-- Reproduces the generator's pre-syllabus output for every SAT unit:
-- the published skill-tagged lesson the launcher would have opened
-- (first by title, then id — the same order lib/lesson/recommend.ts
-- uses), then one 8-question practice drill. Units with no tagged
-- lesson get the drill alone. Idempotent: units that already have steps
-- are left untouched.

insert into public.curriculum_unit_steps (unit_id, position, kind, lesson_id)
select u.id, 1, 'lesson', l.lesson_id
from public.curriculum_units u
join lateral (
  select lt.lesson_id
    from public.lesson_topics lt
    join public.lessons ls on ls.id = lt.lesson_id
   where lt.skill_code = u.skill_code
     and ls.status = 'published'
   order by ls.title asc, ls.id asc
   limit 1
) l on true
where u.test_type = 'sat'
  and not exists (select 1 from public.curriculum_unit_steps s where s.unit_id = u.id);

insert into public.curriculum_unit_steps (unit_id, position, kind, role, question_count)
select
  u.id,
  coalesce((select max(s.position) from public.curriculum_unit_steps s where s.unit_id = u.id), 0) + 1,
  'drill', 'practice', 8
from public.curriculum_units u
where u.test_type = 'sat'
  and not exists (
    select 1 from public.curriculum_unit_steps s where s.unit_id = u.id and s.kind = 'drill'
  );

-- ── Feature flag: off until a real syllabus exists ────────────────

insert into public.feature_flags (key, value, description)
values (
  'unit_syllabus', 'off',
  'Plan generator walks curriculum_unit_steps (lessons in teaching order, drills tied to lessons) instead of the built-in lesson-then-drill pair. on | off.'
)
on conflict (key) do nothing;
