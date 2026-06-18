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

import { requireUser } from '@/lib/api/auth';

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
  const { user, supabase } = await requireUser();
  const progress = await loadOrCreateProgress(supabase, lessonId, user.id);
  const completedSet = new Set(progress.completed_blocks || []);
  if (!completedSet.has(blockId)) {
    completedSet.add(blockId);
    await applyUpdates(supabase, lessonId, user.id, {
      completed_blocks: [...completedSet],
    });
  }
  return loadProgress(supabase, lessonId, user.id);
}

export async function submitCheckAnswer(lessonId, blockId, selected, correct) {
  const { user, supabase } = await requireUser();
  const progress = await loadOrCreateProgress(supabase, lessonId, user.id);
  const completedSet = new Set(progress.completed_blocks || []);
  completedSet.add(blockId);
  const answers = { ...(progress.check_answers || {}) };
  answers[blockId] = { selected, correct };
  await applyUpdates(supabase, lessonId, user.id, {
    completed_blocks: [...completedSet],
    check_answers: answers,
  });
  return loadProgress(supabase, lessonId, user.id);
}

export async function submitDesmosResult(lessonId, blockId, correct) {
  const { user, supabase } = await requireUser();
  const progress = await loadOrCreateProgress(supabase, lessonId, user.id);
  const completedSet = new Set(progress.completed_blocks || []);
  completedSet.add(blockId);
  const answers = { ...(progress.check_answers || {}) };
  answers[blockId] = { selected: null, correct, type: 'desmos_interactive' };
  await applyUpdates(supabase, lessonId, user.id, {
    completed_blocks: [...completedSet],
    check_answers: answers,
  });
  return loadProgress(supabase, lessonId, user.id);
}

export async function markLessonComplete(lessonId) {
  const { user, supabase } = await requireUser();
  await loadOrCreateProgress(supabase, lessonId, user.id);
  await applyUpdates(supabase, lessonId, user.id, {
    completed_at: new Date().toISOString(),
  });
  return loadProgress(supabase, lessonId, user.id);
}
