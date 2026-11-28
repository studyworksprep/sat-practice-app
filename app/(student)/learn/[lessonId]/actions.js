// Lesson progress writes. Mirror /api/lessons/[lessonId]/progress
// from the legacy tree but as Server Actions so the next-tree
// viewer doesn't have to fetch them from the client. Each action
// upserts the row, applies a single delta (block-complete /
// check-answer / lesson-complete), and returns the fresh progress
// row so the runtime can update its local state.
//
// All actions are role-agnostic — anyone signed in can mutate
// their own progress row. RLS on lesson_progress is keyed on
// student_id = auth.uid(), so a write attempting to modify
// someone else's row is rejected at the DB layer regardless of
// what's passed in.

'use server';

import { after } from 'next/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { requireUser } from '@/lib/api/auth';
import { actionFail, ApiError } from '@/lib/api/response';
import { rateLimit } from '@/lib/api/rateLimit';
import { selectLessonPracticeQuestionIds } from '@/lib/lesson/practice-drill';
import { markLessonAssignmentsComplete } from '@/lib/lesson/assignment-completion';
import { enqueueLessonRetrieval } from '@/lib/review/queue';
import { parsePlanTaskId } from '@/lib/plan/student-task';

async function loadOrCreateProgress(supabase, lessonId, userId) {
  const { data: existing } = await supabase
    .from('lesson_progress')
    .select('*')
    .eq('lesson_id', lessonId)
    .eq('student_id', userId)
    .maybeSingle();
  if (existing) return existing;
  const { data: created, error } = await supabase
    .from('lesson_progress')
    .insert({
      lesson_id: lessonId,
      student_id: userId,
      completed_blocks: [],
      check_answers: {},
    })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return created;
}

async function applyUpdates(supabase, lessonId, userId, updates) {
  if (Object.keys(updates).length === 0) return;
  const { error } = await supabase
    .from('lesson_progress')
    .update(updates)
    .eq('lesson_id', lessonId)
    .eq('student_id', userId);
  if (error) throw new Error(error.message);
}

async function loadProgress(supabase, lessonId, userId) {
  const { data } = await supabase
    .from('lesson_progress')
    .select('*')
    .eq('lesson_id', lessonId)
    .eq('student_id', userId)
    .maybeSingle();
  return data ?? null;
}

export async function markBlockComplete(lessonId, blockId) {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc('record_lesson_step', {
    p_lesson_id: lessonId, p_block_id: blockId, p_complete: true,
  });
  if (error) throw new Error(error.message);
}

export async function markLessonComplete(lessonId, planTaskId = null) {
  const { user, supabase } = await requireUser();
  const completedAt = new Date().toISOString();
  const taskId = parsePlanTaskId(planTaskId);
  if (taskId) {
    const { error } = await supabase.rpc('complete_study_plan_lesson', {
      p_task_id: taskId,
      p_lesson_id: lessonId,
    });
    if (error) throw new Error(error.message);
    revalidatePath('/dashboard');
    revalidatePath('/plan');
  } else {
    await loadOrCreateProgress(supabase, lessonId, user.id);
    await applyUpdates(supabase, lessonId, user.id, { completed_at: completedAt });
  }
  // Any open assignment of this lesson is now complete too. Awaited
  // rather than deferred so the student's assignments page reflects it
  // on their very next navigation; wrapped so a stamping failure can
  // never undo or block the completion that just landed.
  try {
    await markLessonAssignmentsComplete(supabase, user.id, lessonId, completedAt);
  } catch (err) {
    console.error('lesson assignment completion stamp failed', lessonId, err);
  }
  // Delayed retrieval (plan 5.3): the lesson comes back in ~2 days as
  // a micro-drill on its skill. Deferred and swallowed — the same
  // best-effort contract the rest of the review-queue intake uses, so
  // queue bookkeeping can never fail the completion that triggered it.
  after(async () => {
    try {
      await enqueueLessonRetrieval(supabase, user.id, lessonId, completedAt);
    } catch {
      // Queue intake is best-effort; the completion already landed.
    }
  });
  return loadProgress(supabase, lessonId, user.id);
}

// Practice at the end (plan 5.2). Starts a session over the lesson's
// authored drill questions and redirects into the runner — the same
// practice_sessions shape the Review page's drills create, so the
// runner and its completion flow need no special case.
//
// mode is 'practice', not 'review': a review session bounces back to
// /review on completion, which would strand a student who arrived
// from a lesson.
// Bound with lessonId, then invoked by useActionState as
// (prevState, formData); neither is needed, so neither is declared.
export async function createLessonPracticeDrill(lessonId) {
  let ctx;
  try {
    ctx = await requireUser();
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error loading user');
  }
  const { user, supabase } = ctx;

  const rl = await rateLimit(`lesson-practice:${user.id}`, {
    limit: 20,
    windowMs: 60_000,
  });
  if (!rl.ok) {
    return actionFail('Too many practice sessions started. Please wait a moment.');
  }

  let questionIds;
  try {
    questionIds = await selectLessonPracticeQuestionIds(supabase, user.id, lessonId);
  } catch {
    return actionFail('Could not load the lesson’s drill questions. Please try again.');
  }
  if (questionIds.length === 0) {
    return actionFail('No practice questions are available for this lesson yet.');
  }

  const { data: session, error } = await supabase
    .from('practice_sessions')
    .insert({
      user_id: user.id,
      test_type: 'sat',
      mode: 'practice',
      question_ids: questionIds,
      current_position: 0,
      filter_criteria: { kind: 'lesson_practice', lesson_id: lessonId, size: questionIds.length },
    })
    .select('id')
    .single();
  if (error || !session) {
    return actionFail(`Failed to start practice: ${error?.message ?? 'unknown'}`);
  }
  redirect(`/practice/s/${session.id}/0`);
}
