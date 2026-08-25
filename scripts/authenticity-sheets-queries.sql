-- Derivation queries for docs/authenticity-sheets.md (plan step 2.7).
-- Run READ-ONLY against the SAT Question Bank (production) via the
-- Supabase MCP. The `recent` CTE defines the currency/weighting anchor
-- (PT9-11 per the owner decision of 2026-08-25) — update the code list
-- as newer practice tests land, re-run all five, and rebuild the doc.

-- ── 1. Composition & weighting ──────────────────────────────────────
with recent as (
  select distinct mi.question_id
  from practice_test_module_items_v2 mi
  join practice_test_modules_v2 m on m.id = mi.practice_test_module_id
  join practice_tests_v2 t on t.id = m.practice_test_id
  where t.code in ('PT9','PT10','PT11')
)
select q.domain_name as d, q.skill_name as s,
  count(*) as bank_n,
  count(*) filter (where q.question_type = 'spr') as bank_spr,
  count(*) filter (where r.question_id is not null) as rec_n,
  count(*) filter (where r.question_id is not null and q.question_type = 'spr') as rec_spr,
  count(*) filter (where q.stimulus_html is not null and length(q.stimulus_html) > 10) as with_stim
from questions_v2 q
left join recent r on r.question_id = q.id
where q.deleted_at is null
group by 1, 2 order by 1, 2;

-- ── 2. Stem length percentiles (stimulus + stem, plain-text words) ──
with recent as (
  select distinct mi.question_id
  from practice_test_module_items_v2 mi
  join practice_test_modules_v2 m on m.id = mi.practice_test_module_id
  join practice_tests_v2 t on t.id = m.practice_test_id
  where t.code in ('PT9','PT10','PT11')
),
base as (
  select q.skill_name as s, (r.question_id is not null) as rec,
    array_length(regexp_split_to_array(trim(regexp_replace(coalesce(q.stimulus_html, '') || ' ' || q.stem_html, '<[^>]+>', ' ', 'g')), '\s+'), 1) as words
  from questions_v2 q
  left join recent r on r.question_id = q.id
  where q.deleted_at is null
)
select s, rec, count(*) as n,
  (percentile_cont(0.25) within group (order by words))::int as p25,
  (percentile_cont(0.5) within group (order by words))::int as p50,
  (percentile_cont(0.75) within group (order by words))::int as p75,
  (percentile_cont(0.9) within group (order by words))::int as p90
from base group by 1, 2 order by 1, 2;

-- ── 3. Stem templates (trailing question, numbers → '#', top 6) ─────
with recent as (
  select distinct mi.question_id
  from practice_test_module_items_v2 mi
  join practice_test_modules_v2 m on m.id = mi.practice_test_module_id
  join practice_tests_v2 t on t.id = m.practice_test_id
  where t.code in ('PT9','PT10','PT11')
),
base as (
  select q.skill_name as s, (r.question_id is not null) as rec,
    lower(regexp_replace(regexp_replace(
      coalesce((regexp_match(regexp_replace(q.stem_html, '<[^>]+>', ' ', 'g'), '([^.?!]{5,200}\?)\s*$'))[1], '(no trailing question)'),
      '[0-9]+([.,][0-9]+)?', '#', 'g'), '\s+', ' ', 'g')) as tq
  from questions_v2 q
  left join recent r on r.question_id = q.id
  where q.deleted_at is null
),
counted as (
  select s, tq, count(*) as bank_n, count(*) filter (where rec) as rec_n,
    row_number() over (partition by s order by count(*) desc) as rn
  from base group by 1, 2
)
select s, tq, bank_n, rec_n from counted where rn <= 6 and bank_n >= 4 order by s, bank_n desc;

-- ── 4. Choice formats (MCQ) ─────────────────────────────────────────
with recent as (
  select distinct mi.question_id
  from practice_test_module_items_v2 mi
  join practice_test_modules_v2 m on m.id = mi.practice_test_module_id
  join practice_tests_v2 t on t.id = m.practice_test_id
  where t.code in ('PT9','PT10','PT11')
),
opts as (
  select q.skill_name as s, (r.question_id is not null) as rec,
    (select avg(array_length(regexp_split_to_array(trim(regexp_replace(o->>'content_html', '<[^>]+>', ' ', 'g')), '\s+'), 1))
       from jsonb_array_elements(q.options) o) as opt_words,
    (select bool_and(regexp_replace(o->>'content_html', '<[^>]+>|&[a-z]+;', ' ', 'g') ~ '^[\s0-9.,:%/()+\-]*$')
       from jsonb_array_elements(q.options) o) as all_num
  from questions_v2 q
  left join recent r on r.question_id = q.id
  where q.deleted_at is null and q.question_type = 'mcq' and jsonb_typeof(q.options) = 'array'
)
select s, rec, count(*) as n,
  round((percentile_cont(0.5) within group (order by opt_words))::numeric, 1) as ow_p50,
  round((percentile_cont(0.9) within group (order by opt_words))::numeric, 1) as ow_p90,
  round(100.0 * count(*) filter (where all_num) / count(*), 0) as pct_num
from opts group by 1, 2 order by 1, 2;

-- ── 5. Difficulty profile + exemplars ───────────────────────────────
with recent as (
  select distinct mi.question_id
  from practice_test_module_items_v2 mi
  join practice_test_modules_v2 m on m.id = mi.practice_test_module_id
  join practice_tests_v2 t on t.id = m.practice_test_id
  where t.code in ('PT9','PT10','PT11')
),
base as (
  select q.skill_name as s, (r.question_id is not null) as rec, q.display_code,
    case when q.score_band <= 3 then 'easy' when q.score_band <= 5 then 'medium' else 'hard' end as band,
    array_length(regexp_split_to_array(trim(regexp_replace(coalesce(q.stimulus_html, '') || ' ' || q.stem_html, '<[^>]+>', ' ', 'g')), '\s+'), 1) as words
  from questions_v2 q
  left join recent r on r.question_id = q.id
  where q.deleted_at is null and q.score_band is not null
)
select s, band, count(*) as bank_n, count(*) filter (where rec) as rec_n,
  (percentile_cont(0.5) within group (order by words))::int as p50_words,
  (array_agg(display_code order by rec desc, display_code))[1:2] as exemplars
from base group by 1, 2
order by 1, case band when 'easy' then 1 when 'medium' then 2 else 3 end;
