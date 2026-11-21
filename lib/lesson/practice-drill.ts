import type { TypedSupabaseClient } from '@/lib/supabase/server';
import { lastAttemptByQuestion } from '../practice/rank-by-attempt.mjs';

export const LESSON_PRACTICE_SIZE = 8;

type DrillPhase = 'practice' | 'later_review';
type Candidate = {
  id: string;
  difficulty: number | null;
  drill_phase: string | null;
};

function publishedDrills(supabase: TypedSupabaseClient, lessonId: string) {
  return supabase.from('questions_v2')
    .select('id, difficulty, drill_phase')
    .eq('pool', 'lesson_drill')
    .eq('drill_lesson_id', lessonId)
    .eq('is_published', true)
    .eq('is_broken', false)
    .is('deleted_at', null);
}

export async function lessonHasPracticeQuestions(supabase: TypedSupabaseClient, lessonId: string) {
  const { data } = await publishedDrills(supabase, lessonId).limit(1);
  return Boolean(data?.length);
}

/** Keeps the incoming authoring order for ties. Pick fresh questions
 * from the intended phase first, then present the set easiest first. */
export function rankLessonDrill(
  candidates: readonly Candidate[],
  attempts: ReadonlyArray<{ question_id: string; created_at: string }>,
  size: number,
  phase: DrillPhase = 'practice',
): string[] {
  const lastAttempt = lastAttemptByQuestion(attempts);
  const byDifficulty = (a: Candidate, b: Candidate) =>
    (a.difficulty ?? 4) - (b.difficulty ?? 4);
  const byPhase = (a: Candidate, b: Candidate) =>
    Number(b.drill_phase === phase) - Number(a.drill_phase === phase);

  return [...candidates]
    .sort((a, b) => (lastAttempt.get(a.id) ?? '').localeCompare(lastAttempt.get(b.id) ?? '')
      || byPhase(a, b) || byDifficulty(a, b))
    .slice(0, size)
    .sort(byDifficulty)
    .map(({ id }) => id);
}

export async function selectLessonPracticeQuestionIds(
  supabase: TypedSupabaseClient,
  userId: string,
  lessonId: string,
  size: number = LESSON_PRACTICE_SIZE,
  phase: DrillPhase = 'practice',
  excluded: ReadonlySet<string> = new Set(),
): Promise<string[]> {
  const { data, error } = await publishedDrills(supabase, lessonId)
    .order('drill_sequence')
    .order('id');
  if (error) throw error;
  const candidates = (data ?? []).filter(({ id }) => !excluded.has(id));
  if (candidates.length === 0 || size <= 0) return [];

  const { data: attempts, error: attemptError } = await supabase.from('attempts')
    .select('question_id, created_at')
    .eq('user_id', userId)
    .in('question_id', candidates.map(({ id }) => id));
  if (attemptError) throw attemptError;
  return rankLessonDrill(candidates, attempts ?? [], size, phase);
}
