-- Foundations & question patterns — schema step
-- (docs/foundations-and-question-patterns.md §3.1 / §3.4 step 1)
--
-- 1. question_patterns: curated sub-skill catalog (reference data in
--    the curriculum_units mold — readable by all authenticated users,
--    admin-authored). NOT concept_tags: that is a free-form staff
--    notebook with manager/admin-only RLS; this is a controlled,
--    student-readable vocabulary.
-- 2. lessons.kind ('standard' | 'foundation') + foundation_sequence.
-- 3. lesson_topics grows from two grains (domain, skill) to four
--    (section, domain, skill, pattern) — exactly one coherent grain
--    per row, enforced by check constraint.
-- 4. questions_v2.pattern_id + question_content_drafts.pattern_id —
--    one primary pattern per question (deliberate single-pattern
--    decision, doc §6); untyped questions are legal forever.
--
-- Guardrail (doc §3.3): get_plan_inputs.has_lesson matches
-- lesson_topics on skill_code only, so section-grain and
-- pattern-grain rows (skill_code null) cannot flip unit coverage —
-- no function change needed in this step. Pattern→skill roll-up for
-- coverage arrives with the consumer work (§3.4 step 3).

-- ── 1. question_patterns ────────────────────────────────────────────

create table if not exists public.question_patterns (
  id uuid primary key default gen_random_uuid(),
  test_type text not null default 'sat',
  domain_code text not null,
  skill_code text not null,
  name text not null,
  recognition_cue text not null,
  process_summary text,
  sequence integer not null default 1,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (test_type, domain_code, skill_code, name)
);

create index if not exists question_patterns_skill_idx
  on public.question_patterns (test_type, domain_code, skill_code, sequence);

alter table public.question_patterns enable row level security;

create policy question_patterns_select on public.question_patterns
  for select using (true);
create policy question_patterns_admin_insert on public.question_patterns
  for insert with check (is_admin());
create policy question_patterns_admin_update on public.question_patterns
  for update using (is_admin()) with check (is_admin());
create policy question_patterns_admin_delete on public.question_patterns
  for delete using (is_admin());

-- ── 2. lessons.kind + foundation_sequence ───────────────────────────

alter table public.lessons
  add column if not exists kind text not null default 'standard',
  add column if not exists foundation_sequence integer;

alter table public.lessons
  add constraint lessons_kind_check
  check (kind in ('standard', 'foundation'));

-- foundation_sequence orders foundations within their scope; it is
-- meaningless on standard lessons.
alter table public.lessons
  add constraint lessons_foundation_sequence_check
  check (foundation_sequence is null or kind = 'foundation');

-- ── 3. lesson_topics scope grains ───────────────────────────────────

alter table public.lesson_topics
  alter column domain_name drop not null;

alter table public.lesson_topics
  add column if not exists section text,
  add column if not exists pattern_id uuid
    references public.question_patterns (id) on delete cascade;

-- 'math' | 'reading_writing' matches get_plan_inputs' section values.
alter table public.lesson_topics
  add constraint lesson_topics_section_check
  check (section is null or section in ('math', 'reading_writing'));

-- Exactly one coherent grain per row:
--   section grain: section set, everything else null
--   domain grain:  domain_name set, skill_code null   (pre-existing)
--   skill grain:   domain_name + skill_code set       (pre-existing)
--   pattern grain: pattern_id set, everything else null
--     (the pattern's skill is derivable via question_patterns)
alter table public.lesson_topics
  add constraint lesson_topics_one_grain check (
    (section is not null and domain_name is null and skill_code is null and pattern_id is null)
    or (domain_name is not null and section is null and pattern_id is null)
    or (pattern_id is not null and section is null and domain_name is null and skill_code is null)
  );

-- The unique index extends across the new grains.
drop index if exists lesson_topics_unique_idx;
create unique index lesson_topics_unique_idx on public.lesson_topics
  (lesson_id,
   coalesce(section, ''),
   coalesce(domain_name, ''),
   coalesce(skill_code, ''),
   coalesce(pattern_id::text, ''));

create index if not exists lesson_topics_pattern_idx
  on public.lesson_topics (pattern_id) where pattern_id is not null;

-- ── 4. questions_v2.pattern_id (+ drafts) ───────────────────────────

-- Deleting a pattern unclassifies its questions (set null) but
-- removes its lesson tags (cascade above) — a tag row without its
-- pattern is meaningless, an unclassified question is normal.
alter table public.questions_v2
  add column if not exists pattern_id uuid
    references public.question_patterns (id) on delete set null;

create index if not exists questions_v2_pattern_idx
  on public.questions_v2 (pattern_id) where pattern_id is not null;

alter table public.question_content_drafts
  add column if not exists pattern_id uuid
    references public.question_patterns (id) on delete set null;
