// End-of-lesson practice selection (lesson-improvement plan 5.2).
//
// "Practice this now" on the completion banner drills the thing the
// lesson just taught. The selection deliberately differs from the
// Review page's drills:
//
//   weak queue  — questions the student has already MISSED. Empty for
//                 a just-taught topic, which is the common case here.
//   this module — the lesson's own skill, narrowed to the techniques
//                 the lesson teaches, least-recently-attempted first,
//                 so never-attempted questions come first and a fresh
//                 topic yields a full drill.
//
// Techniques narrow, never exclude (docs/foundations-and-question-
// patterns.md §8): questions matching the lesson's techniques — tagged
// to them, or in one of their default skills — are ranked first, and
// the rest of the skill fills the drill when they run short. A lesson
// with no techniques resolves through skill_code alone.

import type { TypedSupabaseClient } from '@/lib/supabase/server';
import { rankLeastRecentlyAttempted } from '@/lib/practice/rank-by-attempt.mjs';
import { partitionByTechnique } from '@/lib/practice/technique-match';

/** Questions in an end-of-lesson drill. Shorter than a review session:
 *  it is a "try it now" pass, not a study block. */
export const LESSON_PRACTICE_SIZE = 8;

/** How many candidates to pull before ranking. */
const CANDIDATE_LIMIT = 60;

export interface LessonPracticeScope {
  skillCode: string | null;
  /** The techniques the lesson teaches (lesson_techniques). */
  techniqueIds: string[];
}

/**
 * The skill (and techniques) an end-of-lesson drill should target. A
 * lesson can carry several topic rows; the first with a skill wins.
 */
export async function getLessonPracticeScope(
  supabase: TypedSupabaseClient,
  lessonId: string,
): Promise<LessonPracticeScope> {
  const [{ data: topics }, { data: techniques }] = await Promise.all([
    supabase.from('lesson_topics').select('skill_code').eq('lesson_id', lessonId),
    supabase.from('lesson_techniques').select('technique_id').eq('lesson_id', lessonId),
  ]);
  return {
    skillCode: (topics ?? []).find((r) => r.skill_code)?.skill_code ?? null,
    techniqueIds: (techniques ?? []).map((r) => r.technique_id),
  };
}

/** Whether this lesson can offer a practice drill at all. */
export function hasPracticeScope(scope: LessonPracticeScope): boolean {
  return Boolean(scope.skillCode);
}

/**
 * Question ids for the lesson's practice drill: technique-matching
 * questions first, each group least-recently-attempted first. Returns
 * [] when the lesson has no skill or the bank has nothing published
 * for it — the caller surfaces that as a message rather than starting
 * an empty session.
 */
export async function selectLessonPracticeQuestionIds(
  supabase: TypedSupabaseClient,
  userId: string,
  lessonId: string,
  size: number = LESSON_PRACTICE_SIZE,
): Promise<string[]> {
  const scope = await getLessonPracticeScope(supabase, lessonId);
  if (!hasPracticeScope(scope)) return [];

  const { data: candidates } = await supabase
    .from('questions_v2')
    .select('id, skill_code')
    .eq('is_published', true)
    .eq('is_broken', false)
    .is('deleted_at', null)
    // Opt-in import batches never reach a filter-driven selector.
    .eq('pool', 'standard')
    .eq('skill_code', scope.skillCode as string)
    .order('display_code', { ascending: true })
    .limit(CANDIDATE_LIMIT);
  const rows = candidates ?? [];
  if (rows.length === 0) return [];
  const candidateIds = rows.map((r) => r.id);

  let matching: string[] = [];
  let rest: string[] = candidateIds;
  if (scope.techniqueIds.length > 0) {
    const [{ data: tagged }, { data: defaults }] = await Promise.all([
      supabase
        .from('question_techniques')
        .select('question_id, technique_id')
        .in('technique_id', scope.techniqueIds)
        .in('question_id', candidateIds),
      supabase.from('technique_skills').select('technique_id, skill_code').in('technique_id', scope.techniqueIds),
    ]);
    const split = partitionByTechnique(rows, {
      techniqueIds: scope.techniqueIds,
      tagged: tagged ?? [],
      defaults: defaults ?? [],
    });
    matching = split.matching.map((r) => r.id);
    rest = split.rest.map((r) => r.id);
  }

  const { data: attempts } = await supabase
    .from('attempts')
    .select('question_id, created_at')
    .eq('user_id', userId)
    .in('question_id', candidateIds);
  const history = attempts ?? [];

  return [
    ...rankLeastRecentlyAttempted(matching, history),
    ...rankLeastRecentlyAttempted(rest, history),
  ].slice(0, size);
}
