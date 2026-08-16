-- Question to pattern tagging
-- (docs/foundations-and-question-patterns.md §3.4 step 2)
--
-- The pattern catalog landed 2026-08-16 but nothing could classify a
-- question against it. Tutors reviewing assignments and tests are the
-- people best placed to do it opportunistically — they are already
-- looking at the question when the fit is obvious.
--
-- The obstacle is that questions_v2 has exactly one permissive write
-- policy, questions_v2_admin_all (is_admin()); the demo_readonly_*
-- policies are RESTRICTIVE guards, not grants. Widening that policy
-- so tutors could classify would also hand them stem_html,
-- is_published and is_broken — far more authority than the task
-- needs.
--
-- So this adds a narrow SECURITY DEFINER entry point that writes
-- pattern_id and its attribution columns and nothing else, gated on
-- is_manager() (manager + admin, matching the concept-tag write bar
-- in question_concept_tags). Same shape as merge_concept_tags(),
-- which exists for the same reason.

-- ── 1. Attribution ──────────────────────────────────────────────────
--
-- Opportunistic tagging spreads across many hands over time. Without
-- a record of who applied a tag and when, a classification that turns
-- out to be wrong cannot be traced back to a stale recognition cue,
-- and admins have no queue to spot-check. Both columns describe the
-- CURRENT tag: clearing pattern_id clears them too.

alter table public.questions_v2
  add column if not exists pattern_tagged_by uuid
    references public.profiles (id) on delete set null,
  add column if not exists pattern_tagged_at timestamptz;

comment on column public.questions_v2.pattern_tagged_by is
  'Who last set pattern_id through set_question_pattern(). Null when the question is unclassified.';
comment on column public.questions_v2.pattern_tagged_at is
  'When pattern_id was last set through set_question_pattern(). Null when the question is unclassified.';

-- Powers the admin "recently tagged" audit strip.
create index if not exists questions_v2_pattern_tagged_at_idx
  on public.questions_v2 (pattern_tagged_at desc)
  where pattern_id is not null;

-- ── 2. The write path ───────────────────────────────────────────────

create or replace function public.set_question_pattern(
  p_question_id uuid,
  p_pattern_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_question questions_v2%rowtype;
  v_pattern question_patterns%rowtype;
  v_actor uuid := auth.uid();
  v_name text;
  v_stamp timestamptz := now();
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

  -- Clearing is always allowed: an unclassified question is a normal
  -- state, and a tutor who realizes a tag is wrong should be able to
  -- take it off without hunting for the right one first.
  if p_pattern_id is null then
    update questions_v2
       set pattern_id = null,
           pattern_tagged_by = null,
           pattern_tagged_at = null
     where id = p_question_id;

    return jsonb_build_object(
      'question_id', p_question_id,
      'pattern_id', null,
      'pattern_name', null,
      'tagged_by', null,
      'tagged_by_name', null,
      'tagged_at', null
    );
  end if;

  select * into v_pattern from question_patterns where id = p_pattern_id;
  if not found then
    raise exception 'Pattern not found';
  end if;

  -- A pattern is one step inside a specific curriculum unit, so a
  -- question can only carry a pattern from its own skill. Without this
  -- check the bank quietly accumulates cross-skill tags that no
  -- recommendation path can ever act on.
  if v_question.domain_code is null or v_question.skill_code is null then
    raise exception 'Question has no domain/skill taxonomy to match a pattern against';
  end if;
  if v_pattern.domain_code is distinct from v_question.domain_code
     or v_pattern.skill_code is distinct from v_question.skill_code then
    raise exception 'Pattern "%" belongs to %/%, but this question is %/%',
      v_pattern.name,
      v_pattern.domain_code, v_pattern.skill_code,
      v_question.domain_code, v_question.skill_code;
  end if;

  update questions_v2
     set pattern_id = p_pattern_id,
         pattern_tagged_by = v_actor,
         pattern_tagged_at = v_stamp
   where id = p_question_id;

  select nullif(trim(coalesce(tutor_name, concat_ws(' ', first_name, last_name))), '')
    into v_name
    from profiles
   where id = v_actor;

  return jsonb_build_object(
    'question_id', p_question_id,
    'pattern_id', p_pattern_id,
    'pattern_name', v_pattern.name,
    'tagged_by', v_actor,
    'tagged_by_name', v_name,
    'tagged_at', v_stamp
  );
end;
$function$;

-- SECURITY DEFINER runs as the owner, so the grant is the only gate
-- besides the is_manager() check inside. Keep it off anon.
revoke all on function public.set_question_pattern(uuid, uuid) from public;
revoke all on function public.set_question_pattern(uuid, uuid) from anon;
grant execute on function public.set_question_pattern(uuid, uuid) to authenticated;

comment on function public.set_question_pattern(uuid, uuid) is
  'Classify a question against the question_patterns catalog. Manager/admin only. Writes pattern_id + attribution and nothing else, so questions_v2 UPDATE can stay admin-only.';
