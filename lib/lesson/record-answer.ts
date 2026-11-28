import 'server-only';
import type { Json } from '@/lib/types/database';
import type { ReviewQuestion } from './check-review.mjs';
import { requireUser } from '@/lib/api/auth';
import { applyCheckAttempt } from './runtime-progress.mjs';

type SubmitOptions = { id: string; markComplete: boolean; revealed?: boolean; expressions?: string[] };

export async function recordLessonAnswer(
  lessonId: string, blockId: string, question: ReviewQuestion, version: string,
  selected: number | string | null, correct: boolean, options: SubmitOptions,
) {
  const { user, supabase } = await requireUser();
  const attempt = {
    id: options.id, at: new Date().toISOString(), selected, correct, question, version,
    revealed: options.revealed === true,
    ...(question.kind === 'desmos' ? { type: 'desmos_interactive', expressions: options.expressions } : {}),
  };
  for (let retry = 0; retry < 4; retry++) {
    const { data, error: readError } = await supabase.from('lesson_progress')
      .select('entry:check_answers->' + blockId)
      .eq('student_id', user.id).eq('lesson_id', lessonId).maybeSingle().overrideTypes<{ entry: Json } | null, { merge: false }>();
    if (readError) throw new Error(readError.message);
    const prior = data?.entry ?? null;
    const next = applyCheckAttempt(prior, attempt);
    if (next === prior) return;
    const { data: saved, error } = await supabase.rpc('record_lesson_step', {
      p_lesson_id: lessonId, p_block_id: blockId, p_complete: options.markComplete !== false,
      p_expected: prior, p_entry: next,
    });
    if (error) throw new Error(error.message);
    if (saved) return;
  }
  throw new Error('This check was updated in another tab. Please try again.');
}
