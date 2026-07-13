-- =========================================================
-- attempts.context_type / context_id — attempt attribution
-- =========================================================
-- Upgrade plan 2026-07 §1.6. attempts records WHAT was answered and
-- HOW (is_correct, source) but not the CONTEXT it was answered in —
-- which assignment / session / test drove it. Today that's inferred by
-- fragile session-window overlap (markAssignmentCompletedIfDone). These
-- two columns make attribution explicit, giving Phase 2 adherence and
-- Phase 3 lesson-embedded practice a real key.
--
-- context_type refines source (which is only practice / practice_test /
-- review). The high-value refinement is on source='practice', which
-- covers standalone practice, assignment work, weak-skill review, and
-- tutor training — indistinguishable today without joining
-- practice_sessions.filter_criteria. context_id points at the driving
-- entity (polymorphic across tables, so no FK):
--   assignment -> assignments_v2.id      (adherence key)
--   practice   -> practice_sessions.id
--   review     -> practice_sessions.id
--   training   -> practice_sessions.id
--   test       -> (unknown from attempts alone; type only)
--   lesson     -> forward-wired for Phase 3 (no producer yet)
--
-- NOTE on the plan's "replace the session-window inference in
-- markAssignmentCompletedIfDone with a direct query": verified that
-- doing so literally (dropping the created_at window, querying only by
-- context) REINTRODUCES the documented premature-completion bug on
-- assignment redos, and pre-context historical attempts have NULL
-- context. So the completion detector KEEPS its window guard; these
-- columns are the attribution key for the adherence layer, written
-- forward on every new practice attempt and backfilled best-effort.

alter table public.attempts
  add column if not exists context_type text,
  add column if not exists context_id   uuid;

alter table public.attempts drop constraint if exists attempts_context_type_check;
alter table public.attempts add constraint attempts_context_type_check
  check (context_type is null or context_type in
    ('practice', 'assignment', 'test', 'review', 'training', 'lesson'));

-- Adherence: "every attempt for this assignment" and general context scans.
create index if not exists attempts_assignment_ctx_idx
  on public.attempts (context_id, user_id)
  where context_type = 'assignment';
create index if not exists attempts_context_idx
  on public.attempts (context_type, context_id)
  where context_id is not null;

-- ── Best-effort historical backfill ────────────────────────────────
-- source='practice' attempts are attributed to the most recent
-- surviving practice_session whose question set contains the question
-- and whose active window [created_at, last_activity_at] covers the
-- attempt. practice_sessions expire at 30 days, so only ~4 of ~14
-- months of history is linkable — the rest keeps NULL context and
-- relies on forward writes. Ambiguity (an attempt matching multiple
-- sessions) is resolved to the latest candidate session.
with candidate as (
  select
    a.id as attempt_id,
    s.id as session_id,
    s.mode,
    s.filter_criteria,
    row_number() over (partition by a.id order by s.created_at desc) as rn
  from public.attempts a
  join public.practice_sessions s
    on s.user_id = a.user_id
   and a.created_at >= s.created_at
   and a.created_at <= coalesce(s.last_activity_at, s.expires_at, s.created_at + interval '2 days')
   and s.question_ids @> to_jsonb(a.question_id::text)
  where a.source = 'practice'
    and a.context_type is null
)
update public.attempts a
set
  context_type = case
    when c.filter_criteria ? 'assignment_id'            then 'assignment'
    when c.mode = 'training'                            then 'training'
    when c.mode = 'review'
      or c.filter_criteria->>'kind' = 'weak_queue'      then 'review'
    else 'practice' end,
  context_id = case
    when c.filter_criteria ? 'assignment_id'
      then (c.filter_criteria->>'assignment_id')::uuid
    else c.session_id end
from candidate c
where c.attempt_id = a.id and c.rn = 1;

-- Type-only attribution for the remaining sources (the specific test
-- attempt / legacy review session isn't recoverable from attempts alone).
update public.attempts set context_type = 'test'
  where source = 'practice_test' and context_type is null;
update public.attempts set context_type = 'review'
  where source = 'review' and context_type is null;
