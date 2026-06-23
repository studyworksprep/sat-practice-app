// Server Actions for the lessons index.
//
//   createLesson — inserts a blank draft lesson owned by the current
//                  admin and redirects straight into the WYSIWYG
//                  editor. This is the manual "new lesson" path that
//                  the canvas editor builds on; the JSON-import path
//                  in import/actions.js still exists alongside it.

'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/api/auth';
import { actionFail, ApiError } from '@/lib/api/response';

export async function createLesson(_prev, formData) {
  let ctx;
  try {
    ctx = await requireRole(['admin']);
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error');
  }

  const titleInput = formData?.get('title');
  const title =
    typeof titleInput === 'string' && titleInput.trim()
      ? titleInput.trim()
      : 'Untitled lesson';

  const { data: lesson, error } = await ctx.supabase
    .from('lessons')
    .insert({
      author_id: ctx.user.id,
      title,
      description: null,
      visibility: 'shared',
      status: 'draft',
    })
    .select('id')
    .single();

  if (error || !lesson) {
    return actionFail(`Failed to create lesson: ${error?.message ?? 'unknown'}`);
  }

  revalidatePath('/admin/lessons');
  redirect(`/admin/lessons/${lesson.id}`);
}
