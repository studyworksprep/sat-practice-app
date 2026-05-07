-- Translate v1 question ids carried into assignments_v2 by the
-- legacy sync trigger.
--
-- The legacy POST /api/teacher/question-assignments route inserts
-- into public.question_assignments using v1 question ids (sourced
-- from the v1 questions table). The continuous sync trigger
-- sync_question_assignment_to_v2 (added in
-- 20240101000032_continuous_assignment_sync.sql) copied those ids
-- verbatim into assignments_v2.question_ids without translating
-- through question_id_map. When a student's profiles.ui_version
-- flips to 'next', the runner queries questions_v2 by id and finds
-- nothing, so every question in the assignment lands in the soft
-- "This question was removed" state.
--
-- Two-part fix:
--   1. Rewrite the trigger to translate ids at write time.
--   2. Backfill the rows that already inherited v1 ids — the
--      affected assignments_v2 rows and any in-progress
--      practice_sessions started from one of them (their
--      question_ids array was copied straight from the assignment
--      via startAssignmentPractice).
--
-- The v1 tree is unchanged: question_assignments.question_ids
-- still holds v1 ids for the legacy UI to read.

-- ──────────────────────────────────────────────────────────────
-- 1. Trigger: translate at write time
-- ──────────────────────────────────────────────────────────────

create or replace function public.sync_question_assignment_to_v2()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_practice_test boolean;
  v_practice_test_id uuid;
  v_translated_qids uuid[];
begin
  if (TG_OP = 'DELETE') then
    update public.assignments_v2
    set deleted_at = now()
    where id = OLD.id and deleted_at is null;
    return OLD;
  end if;

  v_is_practice_test := (NEW.filter_criteria->>'type' = 'practice_test');
  if v_is_practice_test then
    -- Same defensive cast as the original; a malformed v1 row
    -- shouldn't fail the legacy INSERT.
    begin
      v_practice_test_id := (NEW.filter_criteria->>'practice_test_id')::uuid;
    exception when others then
      v_practice_test_id := null;
    end;
  else
    v_practice_test_id := null;
  end if;

  -- Translate ids: keep ids already in questions_v2; map v1 ids
  -- forward via question_id_map; pass orphans through (they would
  -- have shown as "removed" without this step too — same fate).
  if not v_is_practice_test and NEW.question_ids is not null then
    select array_agg(
      case
        when exists (select 1 from public.questions_v2 q where q.id = t.qid)
          then t.qid
        else coalesce(m.new_question_id, t.qid)
      end
      order by t.ord
    )
    into v_translated_qids
    from unnest(NEW.question_ids) with ordinality as t(qid, ord)
    left join public.question_id_map m on m.old_question_id = t.qid;
  else
    v_translated_qids := null;
  end if;

  insert into public.assignments_v2 (
    id, teacher_id, assignment_type, title, description,
    due_date, archived_at, question_ids, filter_criteria,
    practice_test_id, created_at
  )
  values (
    NEW.id,
    NEW.teacher_id,
    case when v_is_practice_test then 'practice_test' else 'questions' end,
    NEW.title,
    NEW.description,
    NEW.due_date,
    NEW.completed_at,
    case when v_is_practice_test then null
         else nullif(v_translated_qids, '{}')
    end,
    NEW.filter_criteria,
    v_practice_test_id,
    NEW.created_at
  )
  on conflict (id) do update set
    teacher_id       = excluded.teacher_id,
    assignment_type  = excluded.assignment_type,
    title            = excluded.title,
    description      = excluded.description,
    due_date         = excluded.due_date,
    archived_at      = excluded.archived_at,
    question_ids     = excluded.question_ids,
    filter_criteria  = excluded.filter_criteria,
    practice_test_id = excluded.practice_test_id,
    deleted_at       = null;

  return NEW;
end;
$$;

-- ──────────────────────────────────────────────────────────────
-- 2. Backfill assignments_v2.question_ids
-- ──────────────────────────────────────────────────────────────

with translated as (
  select a.id,
         (
           select array_agg(
             case
               when exists (select 1 from public.questions_v2 q where q.id = t.qid)
                 then t.qid
               else coalesce(m.new_question_id, t.qid)
             end
             order by t.ord
           )
           from unnest(a.question_ids) with ordinality as t(qid, ord)
           left join public.question_id_map m on m.old_question_id = t.qid
         ) as qids
  from public.assignments_v2 a
  where a.assignment_type = 'questions'
    and a.question_ids is not null
    and exists (
      select 1 from unnest(a.question_ids) qid
      where not exists (select 1 from public.questions_v2 q where q.id = qid)
    )
)
update public.assignments_v2 a
set question_ids = t.qids
from translated t
where a.id = t.id
  and t.qids is not null
  and t.qids is distinct from a.question_ids;

-- ──────────────────────────────────────────────────────────────
-- 3. Backfill practice_sessions.question_ids (jsonb of uuid strings)
--    Only sessions tied to an assignment — those are the ones
--    that copied the array from a v1-id assignment. Standalone
--    practice sessions get their question_ids from the v2
--    pool already.
-- ──────────────────────────────────────────────────────────────

with translated as (
  select ps.id,
         (
           select jsonb_agg(
             case
               when exists (select 1 from public.questions_v2 q where q.id = t.qid::uuid)
                 then to_jsonb(t.qid::uuid)
               else to_jsonb(coalesce(m.new_question_id, t.qid::uuid))
             end
             order by t.ord
           )
           from jsonb_array_elements_text(ps.question_ids) with ordinality as t(qid, ord)
           left join public.question_id_map m on m.old_question_id = t.qid::uuid
         ) as qids
  from public.practice_sessions ps
  where ps.filter_criteria ? 'assignment_id'
    and exists (
      select 1 from jsonb_array_elements_text(ps.question_ids) qid
      where not exists (select 1 from public.questions_v2 q where q.id = qid::uuid)
    )
)
update public.practice_sessions ps
set question_ids = t.qids
from translated t
where ps.id = t.id
  and t.qids is not null
  and t.qids is distinct from ps.question_ids;
