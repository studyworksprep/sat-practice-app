'use server';

import { redirect } from 'next/navigation';
import { assertWriter, requireRole } from '@/lib/api/auth';
import { actionFail, ApiError } from '@/lib/api/response';

async function tutorContext() {
  const ctx = await requireRole(['teacher', 'manager']);
  assertWriter(ctx);
  return ctx;
}

export async function createNewLessonDraft(formData: FormData) {
  let ctx;
  try {
    ctx = await tutorContext();
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unable to create a lesson draft.');
  }

  const title = String(formData.get('title') || '').trim() || 'Untitled lesson';
  const { data, error } = await ctx.supabase.rpc('create_lesson_revision', {
    p_base_lesson_id: null,
    p_title: title,
  });
  if (error || !data) return actionFail(error?.message ?? 'Draft was not created.');
  redirect(`/tutor/lessons/drafts/${data}`);
}

export async function proposeLessonEdit(formData: FormData) {
  let ctx;
  try {
    ctx = await tutorContext();
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unable to create a lesson proposal.');
  }

  const lessonId = String(formData.get('lesson_id') || '').trim();
  if (!lessonId) return actionFail('lesson_id required');

  const { data, error } = await ctx.supabase.rpc('create_lesson_revision', {
    p_base_lesson_id: lessonId,
    p_title: 'Untitled lesson',
  });
  if (error || !data) return actionFail(error?.message ?? 'Proposal was not created.');
  redirect(`/tutor/lessons/drafts/${data}`);
}
