-- =========================================================
-- curriculum_units — a thin syllabus overlay on the taxonomy
-- =========================================================
-- Upgrade plan 2026-07 §1.2. The taxonomy (domain_code, skill_code)
-- already exists on questions_v2 and mirrors into lib/practice/
-- sat-taxonomy.ts. What's missing is the master tutor's syllabus:
-- sequence, expectation, prerequisite structure, and a per-unit
-- mastery bar. This table adds exactly that, one row per skill (a
-- "unit" == a skill; 29 SAT units).
--
-- SEEDED vs AUTHORED (important — the plan says "seed from the
-- taxonomy", but the taxonomy has no ordering/prereqs):
--   * SEEDED here (derivable): domain_code, skill_code, title
--     (clean values from sat-taxonomy.ts), and a deterministic default
--     `sequence` (domain-grouped taxonomy order).
--   * DEFAULTED (owner should refine): expected_minutes (flat 60),
--     mastery_threshold (global 80 on the §1.1 mastery scale).
--   * NOT authored (left empty, pending owner): prerequisite_unit_ids.
--     A real prerequisite graph (e.g. H.A. before H.D., P.A. before
--     P.C.) is net-new tutor knowledge and must not be guessed — empty
--     is the safe default (no false prerequisites).
--
-- learnability is intentionally NOT copied here: skill_learnability is
-- its own source of truth (an "improvability" 1-10 signal, NOT a
-- difficulty or a mastery cutoff — the plan conflated these). Phase 2's
-- generator joins skill_learnability when weighting; it also lacks rows
-- for Q.A./Q.F./Q.G. (26/29 skills rated), a separate content gap.
--
-- SAT-only (test_type default 'sat', matching §1.1). ACT units would
-- key on ACT's category_code/subcategory_code, a different shape —
-- forward-wired via test_type, not populated.

create table if not exists public.curriculum_units (
  id                    uuid primary key default gen_random_uuid(),
  test_type             text not null default 'sat' check (test_type in ('sat', 'act')),
  domain_code           text not null,
  skill_code            text not null,
  title                 text not null,
  sequence              integer not null,
  expected_minutes      integer not null default 60 check (expected_minutes > 0),
  mastery_threshold     integer not null default 80 check (mastery_threshold between 0 and 100),
  prerequisite_unit_ids uuid[] not null default '{}',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (test_type, domain_code, skill_code)
);

comment on table public.curriculum_units is
  'Syllabus overlay on the (domain_code, skill_code) taxonomy (§1.2): '
  'one unit per skill. sequence/expected_minutes/mastery_threshold are '
  'seeded defaults; prerequisite_unit_ids is owner-authored (empty until '
  'the real prerequisite graph is defined). mastery_threshold is on the '
  'skill_mastery_snapshots mastery scale (0-100).';

create index if not exists curriculum_units_seq_idx
  on public.curriculum_units (test_type, sequence);

-- Keep updated_at honest via the shared trigger fn (used by questions_v2).
drop trigger if exists trg_curriculum_units_updated_at on public.curriculum_units;
create trigger trg_curriculum_units_updated_at
  before update on public.curriculum_units
  for each row execute function public.set_updated_at();

-- RLS: reference data. Every authenticated user reads the curriculum
-- (students need it for their progress map, §1.3). Only admins write.
-- This is NOT the per-user can_view pattern — the rows aren't user-owned.
alter table public.curriculum_units enable row level security;

drop policy if exists curriculum_units_select       on public.curriculum_units;
drop policy if exists curriculum_units_admin_insert on public.curriculum_units;
drop policy if exists curriculum_units_admin_update on public.curriculum_units;
drop policy if exists curriculum_units_admin_delete on public.curriculum_units;

create policy curriculum_units_select on public.curriculum_units
  for select to authenticated using (true);
create policy curriculum_units_admin_insert on public.curriculum_units
  for insert to public with check (public.is_admin());
create policy curriculum_units_admin_update on public.curriculum_units
  for update to public using (public.is_admin()) with check (public.is_admin());
create policy curriculum_units_admin_delete on public.curriculum_units
  for delete to public using (public.is_admin());

-- ── Seed the 29 SAT units from sat-taxonomy.ts (clean titles) ──────
-- sequence follows the canonical taxonomy order (Math: H,P,Q,S; then
-- R&W: INI,CAS,EOI,SEC), skills in blueprint order within each domain.
-- Idempotent: re-running updates title/sequence but preserves any
-- owner-edited expected_minutes / mastery_threshold / prerequisites.
insert into public.curriculum_units (test_type, domain_code, skill_code, title, sequence) values
  ('sat', 'H',   'H.A.', 'Linear equations in one variable',                                      1),
  ('sat', 'H',   'H.B.', 'Linear functions',                                                      2),
  ('sat', 'H',   'H.C.', 'Linear equations in two variables',                                     3),
  ('sat', 'H',   'H.D.', 'Systems of two linear equations in two variables',                      4),
  ('sat', 'H',   'H.E.', 'Linear inequalities in one or two variables',                           5),
  ('sat', 'P',   'P.A.', 'Equivalent expressions',                                                6),
  ('sat', 'P',   'P.B.', 'Nonlinear equations in one variable and systems of equations in two variables', 7),
  ('sat', 'P',   'P.C.', 'Nonlinear functions',                                                   8),
  ('sat', 'Q',   'Q.A.', 'Ratios, rates, proportional relationships, and units',                  9),
  ('sat', 'Q',   'Q.B.', 'Percentages',                                                          10),
  ('sat', 'Q',   'Q.C.', 'One-variable data: Distributions and measures of center and spread',   11),
  ('sat', 'Q',   'Q.D.', 'Two-variable data: Models and scatterplots',                           12),
  ('sat', 'Q',   'Q.E.', 'Probability and conditional probability',                              13),
  ('sat', 'Q',   'Q.F.', 'Inference from sample statistics and margin of error',                 14),
  ('sat', 'Q',   'Q.G.', 'Evaluating statistical claims: Observational studies and experiments',  15),
  ('sat', 'S',   'S.A.', 'Area and volume',                                                       16),
  ('sat', 'S',   'S.B.', 'Lines, angles, and triangles',                                          17),
  ('sat', 'S',   'S.C.', 'Right triangles and trigonometry',                                      18),
  ('sat', 'S',   'S.D.', 'Circles',                                                               19),
  ('sat', 'INI', 'CID',  'Central Ideas and Details',                                             20),
  ('sat', 'INI', 'COE',  'Command of Evidence',                                                   21),
  ('sat', 'INI', 'INF',  'Inferences',                                                            22),
  ('sat', 'CAS', 'WIC',  'Words in Context',                                                      23),
  ('sat', 'CAS', 'TSP',  'Text Structure and Purpose',                                            24),
  ('sat', 'CAS', 'CTC',  'Cross-Text Connections',                                                25),
  ('sat', 'EOI', 'SYN',  'Rhetorical Synthesis',                                                  26),
  ('sat', 'EOI', 'TRA',  'Transitions',                                                           27),
  ('sat', 'SEC', 'BOU',  'Boundaries',                                                            28),
  ('sat', 'SEC', 'FSS',  'Form, Structure, and Sense',                                            29)
on conflict (test_type, domain_code, skill_code) do update set
  title = excluded.title,
  sequence = excluded.sequence,
  updated_at = now();
