-- =========================================================
-- get_student_coverage + predicted score band (§1.3)
-- =========================================================
-- Upgrade plan 2026-07 §1.3 + the Phase 1 acceptance predicted band.
-- Joins curriculum_units (§1.2) × latest skill_mastery_snapshots (§1.1)
-- × attempt counts → a per-unit coverage status, plus a first-pass
-- predicted score band via score_conversion.
--
-- All functions are SECURITY INVOKER: reads are governed by existing
-- RLS (skill_mastery_snapshots.can_view, attempts.can_view, questions_v2
-- public-read, curriculum_units authenticated-read), so a tutor reading
-- a visible student works and an unauthorized caller gets empty
-- student-specific data — matching get_student_dashboard_stats.

-- ── Coverage ───────────────────────────────────────────────────────
-- Status precedence (top wins), with the plan's undefined boundaries
-- pinned to documented, owner-tunable constants:
--   not_started : 0 practice attempts in the skill
--   mastered    : latest mastery >= curriculum_units.mastery_threshold
--   decayed     : dropped >= 15 pts from a peak that reached near the
--                 threshold (peak >= threshold - 10) — the retention
--                 signal Phase 3 SRS consumes
--   practiced   : >= 8 distinct questions attempted, not yet mastered
--   in_progress : 1..7 distinct questions attempted
-- (DECAY_DROP=15, PRACTICED_MIN=8 are first-pass; promote to
-- curriculum_units columns or a settings row if they need per-unit tuning.)

create or replace function public.get_student_coverage(
  p_student   uuid,
  p_test_type text default 'sat'
) returns table (
  domain_code         text,
  skill_code          text,
  title               text,
  sequence            integer,
  mastery             integer,
  peak_mastery        integer,
  mastery_4w_ago      integer,
  trend_4w            integer,
  attempts_count      integer,
  questions_available integer,
  mastery_threshold   integer,
  status              text
)
language sql
stable
set search_path = public, pg_temp
as $$
  with snaps as (
    select
      domain_code, skill_code, mastery,
      row_number() over (partition by domain_code, skill_code order by snapshot_date desc) as rn_latest,
      max(mastery) over (partition by domain_code, skill_code) as peak
    from public.skill_mastery_snapshots
    where student_id = p_student and test_type = p_test_type
  ),
  latest as (
    select domain_code, skill_code, mastery, peak from snaps where rn_latest = 1
  ),
  four_wk as (
    select distinct on (domain_code, skill_code)
      domain_code, skill_code, mastery as m4
    from public.skill_mastery_snapshots
    where student_id = p_student and test_type = p_test_type
      and snapshot_date <= current_date - 28
    order by domain_code, skill_code, snapshot_date desc
  ),
  attempts_per_skill as (
    select q.domain_code, q.skill_code, count(distinct a.question_id)::integer as n
    from public.attempts a
    join public.questions_v2 q on q.id = a.question_id
    where a.user_id = p_student and a.source = 'practice'
      and q.domain_code is not null and q.skill_code is not null
    group by q.domain_code, q.skill_code
  ),
  q_avail as (
    select domain_code, skill_code, count(*)::integer as n
    from public.questions_v2
    where is_published and not is_broken and deleted_at is null
      and domain_code is not null and skill_code is not null
    group by domain_code, skill_code
  )
  select
    cu.domain_code, cu.skill_code, cu.title, cu.sequence,
    l.mastery, l.peak, fw.m4,
    case when l.mastery is not null and fw.m4 is not null then l.mastery - fw.m4 end as trend_4w,
    coalesce(aps.n, 0) as attempts_count,
    coalesce(qa.n, 0)  as questions_available,
    cu.mastery_threshold,
    case
      when coalesce(aps.n, 0) = 0                                        then 'not_started'
      when l.mastery >= cu.mastery_threshold                            then 'mastered'
      when l.peak - coalesce(l.mastery, 0) >= 15
        and l.peak >= cu.mastery_threshold - 10                         then 'decayed'
      when coalesce(aps.n, 0) >= 8                                      then 'practiced'
      else 'in_progress'
    end as status
  from public.curriculum_units cu
  left join latest             l   on l.domain_code   = cu.domain_code and l.skill_code   = cu.skill_code
  left join four_wk            fw  on fw.domain_code  = cu.domain_code and fw.skill_code  = cu.skill_code
  left join attempts_per_skill aps on aps.domain_code = cu.domain_code and aps.skill_code = cu.skill_code
  left join q_avail            qa  on qa.domain_code  = cu.domain_code and qa.skill_code  = cu.skill_code
  where cu.test_type = p_test_type
  order by cu.sequence;
$$;

grant execute on function public.get_student_coverage(uuid, text) to authenticated;

-- ── Predicted score band (Phase 1 acceptance — FIRST PASS) ─────────
-- IMPORTANT: this is a deliberately simple first-pass, not the real
-- projection model. There is a genuine modelling gap between per-skill
-- mastery (0-100) and a scaled score: score_conversion maps raw
-- #-correct-per-module -> scaled score for specific test forms, with no
-- mastery bridge. This function instead projects the student's OBSERVED
-- first-attempt accuracy per section onto full-length section lengths
-- (R&W 54, Math 44), then reads an averaged score_conversion curve. It
-- returns a BAND (±3 raw questions), not false precision. Calibrate
-- before surfacing to students; a real model is Phase 2 work.

-- Averaged scaled score for the nearest available raw total in a section.
create or replace function public.sat_scaled_for_raw(
  p_section text,
  p_raw     integer
) returns integer
language sql
stable
set search_path = public, pg_temp
as $$
  select round(avg(scaled_score))::integer
  from public.score_conversion
  where section = p_section
    and (module1_correct + module2_correct) = (
      select (module1_correct + module2_correct)
      from public.score_conversion
      where section = p_section
      order by abs((module1_correct + module2_correct) - p_raw), (module1_correct + module2_correct)
      limit 1
    );
$$;

create or replace function public.get_predicted_score_band(
  p_student   uuid,
  p_test_type text default 'sat'
) returns table (
  rw_attempts   integer,
  rw_accuracy   numeric,
  rw_scaled     integer,
  math_attempts integer,
  math_accuracy numeric,
  math_scaled   integer,
  total_scaled  integer,
  total_low     integer,
  total_high    integer
)
language sql
stable
set search_path = public, pg_temp
as $$
  with fa as (
    select distinct on (a.question_id) a.question_id, a.is_correct
    from public.attempts a
    where a.user_id = p_student and a.source = 'practice'
    order by a.question_id, a.created_at asc
  ),
  est as (
    select
      case when q.domain_code in ('H','P','Q','S') then 'math' else 'reading_writing' end as section,
      count(*)::integer as n,
      (count(*) filter (where fa.is_correct))::numeric / nullif(count(*), 0) as acc,
      case when q.domain_code in ('H','P','Q','S') then 44 else 54 end as len
    from fa join public.questions_v2 q on q.id = fa.question_id
    where q.domain_code is not null and q.skill_code is not null
    group by 1, 3
  ),
  scaled as (
    select
      section, n, acc,
      public.sat_scaled_for_raw(section, round(acc * len)::integer)                          as mid,
      public.sat_scaled_for_raw(section, greatest(0,   round(acc * len)::integer - 3))        as lo,
      public.sat_scaled_for_raw(section, least(len,    round(acc * len)::integer + 3))        as hi
    from est
  )
  select
    (select n           from scaled where section = 'reading_writing'),
    (select round(acc,3) from scaled where section = 'reading_writing'),
    (select mid         from scaled where section = 'reading_writing'),
    (select n           from scaled where section = 'math'),
    (select round(acc,3) from scaled where section = 'math'),
    (select mid         from scaled where section = 'math'),
    ( (select mid from scaled where section = 'reading_writing')
      + (select mid from scaled where section = 'math') ),
    ( (select lo  from scaled where section = 'reading_writing')
      + (select lo  from scaled where section = 'math') ),
    ( (select hi  from scaled where section = 'reading_writing')
      + (select hi  from scaled where section = 'math') );
$$;

grant execute on function public.sat_scaled_for_raw(text, integer) to authenticated;
grant execute on function public.get_predicted_score_band(uuid, text) to authenticated;
