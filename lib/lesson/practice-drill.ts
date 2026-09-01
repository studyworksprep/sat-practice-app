// End-of-lesson practice selection (lesson-improvement plan 5.2).
//
// "Practice this now" on the completion banner drills the thing the
// lesson just taught. The selection deliberately differs from the
// Review page's drills:
//
//   weak queue  — questions the student has already MISSED. Empty for
//                 a just-taught topic, which is the common case here.
//   this module — the lesson's own pattern/skill, least-recently-
//                 attempted first, so never-attempted questions come
//                 first and a fresh topic yields a full drill.
//
// Pattern before skill: plan 5.2 wants the pattern drill and falls
// back to the skill for skill-scoped lessons. questions_v2.pattern_id
// is unpopulated in production today (the 5.7 tutor classification has
// not landed), so in practice every drill resolves through skill_code —
// the pattern leg is live the moment tagging starts, with no code
// change.

import type { TypedSupabaseClient } from '@/lib/supabase/server';
import { rankLeastRecentlyAttempted } from '@/lib/practice/rank-by-attempt.mjs';

/** Questions in an end-of-lesson drill. Shorter than a review session:
 *  it is a "try it now" pass, not a study block. */
export const LESSON_PRACTICE_SIZE = 8;

/** How many candidates to pull before ranking. */
const CANDIDATE_LIMIT = 60;

export interface LessonPracticeScope {
  patternId: string | null;
  skillCode: string | null;
}

/**
 * The pattern / skill an end-of-lesson drill should target. A lesson
 * can carry several topic rows; the first with a usable key wins,
 * preferring a pattern over a skill.
 */
export async function getLessonPracticeScope(
  supabase: TypedSupabaseClient,
  lessonId: string,
): Promise<LessonPracticeScope> {
  const { data } = await supabase
    .from('lesson_topics')
    .select('pattern_id, skill_code')
    .eq('lesson_id', lessonId);
  const rows = data ?? [];
  return {
    patternId: rows.find((r) => r.pattern_id)?.pattern_id ?? null,
    skillCode: rows.find((r) => r.skill_code)?.skill_code ?? null,
  };
}

/** Whether this lesson can offer a practice drill at all. */
export function hasPracticeScope(scope: LessonPracticeScope): boolean {
  return Boolean(scope.patternId || scope.skillCode);
}

/**
 * Question ids for the lesson's practice drill, least-recently-
 * attempted first. Returns [] when the lesson has no pattern/skill or
 * the bank has nothing published for it — the caller surfaces that as
 * a message rather than starting an empty session.
 */
export async function selectLessonPracticeQuestionIds(
  supabase: TypedSupabaseClient,
  userId: string,
  lessonId: string,
  size: number = LESSON_PRACTICE_SIZE,
): Promise<string[]> {
  const scope = await getLessonPracticeScope(supabase, lessonId);
  if (!hasPracticeScope(scope)) return [];

  let query = supabase
    .from('questions_v2')
    .select('id')
    .eq('is_published', true)
    .eq('is_broken', false)
    .is('deleted_at', null)
    // Opt-in import batches never reach a filter-driven selector.
    .eq('pool', 'standard');
  query = scope.patternId
    ? query.eq('pattern_id', scope.patternId)
    : query.eq('skill_code', scope.skillCode as string);

  const { data: candidates } = await query
    .order('display_code', { ascending: true })
    .limit(CANDIDATE_LIMIT);
  const candidateIds = (candidates ?? []).map((r) => r.id);
  if (candidateIds.length === 0) return [];

  const { data: attempts } = await supabase
    .from('attempts')
    .select('question_id, created_at')
    .eq('user_id', userId)
    .in('question_id', candidateIds);

  return rankLeastRecentlyAttempted(candidateIds, attempts ?? []).slice(0, size);
}
