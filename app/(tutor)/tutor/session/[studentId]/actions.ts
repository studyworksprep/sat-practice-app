// Server Actions for the session workspace (§4.1).
//
// addTutorNote — the "note" quick action. A tutor_notes row is both
// the note and the session log: its session_at anchors the prep
// card's "since last session" window on the next visit. RLS is the
// real gate (is_teacher + can_view + author = auth.uid()); the
// requireRole call here just turns a role miss into a clean error
// instead of a silent empty insert.
//
// deleteTutorNote — author-only (RLS: author or admin); the
// workspace only renders the button for the author's own notes.

'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/api/auth';
import { actionFail, actionOk, ApiError } from '@/lib/api/response';
import type { ActionResult } from '@/lib/types';

const MAX_NOTE_LENGTH = 8000;

export async function addTutorNote(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  let ctx;
  try {
    ctx = await requireRole(['teacher', 'manager', 'admin']);
  } catch (e) {
    if (e instanceof ApiError) return e.toActionResult();
    return actionFail('Unexpected error');
  }

  const studentId = formData.get('student_id');
  const body = String(formData.get('body') ?? '').trim();
  if (!studentId || typeof studentId !== 'string') return actionFail('studentId required');
  if (!body) return actionFail('Write the note first');
  if (body.length > MAX_NOTE_LENGTH) {
    return actionFail(`Notes cap at ${MAX_NOTE_LENGTH} characters`);
  }

  const { error } = await ctx.supabase.from('tutor_notes').insert({
    student_id: studentId,
    author_id: ctx.user.id,
    body,
  });
  // An RLS rejection surfaces as an insert error (not-my-student).
  if (error) return actionFail('Could not save the note');

  revalidatePath(`/tutor/session/${studentId}`);
  return actionOk();
}

export async function deleteTutorNote(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  let ctx;
  try {
    ctx = await requireRole(['teacher', 'manager', 'admin']);
  } catch (e) {
    if (e instanceof ApiError) return e.toActionResult();
    return actionFail('Unexpected error');
  }

  const noteId = formData.get('note_id');
  const studentId = formData.get('student_id');
  if (!noteId || typeof noteId !== 'string') return actionFail('noteId required');

  const { error } = await ctx.supabase.from('tutor_notes').delete().eq('id', noteId);
  if (error) return actionFail('Could not delete the note');

  if (typeof studentId === 'string' && studentId) {
    revalidatePath(`/tutor/session/${studentId}`);
  }
  return actionOk();
}
