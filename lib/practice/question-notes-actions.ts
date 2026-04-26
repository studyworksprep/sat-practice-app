// Server Actions for the per-question tutor-notes surface.
// Replace the legacy fetch('/api/question-notes', ...) calls
// inside components/QuestionNotes.js so the new-tree island uses
// React 19's action machinery.
//
// Role gating mirrors the API route:
//   - Add (POST):    teacher / manager / admin
//   - Update (PATCH): the note's author OR admin
//   - Delete:        the note's author OR admin
//
// The shape returned by addQuestionNote includes the new note in
// the same view-model shape the loader returns, so the client
// island can drop the new note directly into its rendered list
// without an extra round-trip.

'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/api/auth';
import { actionFail, actionOk, ApiError } from '@/lib/api/response';
import type { ActionResult, UserRole } from '@/lib/types';

const TUTOR_ROLES: UserRole[] = ['teacher', 'manager', 'admin'];

interface QuestionNote {
  id: string;
  questionId: string;
  authorId: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  authorName: string;
  authorRole: UserRole | null;
}

interface QuestionNoteUpdate {
  id: string;
  content: string;
  updatedAt: string;
}

/** Add a tutor note to a question. */
export async function addQuestionNote({
  questionId,
  content,
}: {
  questionId: string;
  content: string;
}): Promise<ActionResult<{ data: { note: QuestionNote } }>> {
  if (!questionId) return actionFail('questionId required');
  const trimmed = (content ?? '').trim();
  if (!trimmed) return actionFail('content required');

  let supabase;
  let user;
  try {
    ({ supabase, user } = await requireRole(TUTOR_ROLES));
  } catch (e) {
    if (e instanceof ApiError) return actionFail(e.message);
    throw e;
  }

  // Author profile fetched here so the returned note carries the
  // display name + role the client renders next to it.
  const { data: authorProfile } = await supabase
    .from('profiles')
    .select('first_name, last_name, email, role')
    .eq('id', user.id)
    .maybeSingle();

  const { data, error } = await supabase
    .from('question_notes')
    .insert({ question_id: questionId, author_id: user.id, content: trimmed })
    .select('id, question_id, author_id, content, created_at, updated_at')
    .single();
  if (error) return actionFail(error.message);

  const note: QuestionNote = {
    id: data.id,
    questionId: data.question_id,
    authorId: data.author_id,
    content: data.content,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    authorName: authorProfile
      ? [authorProfile.first_name, authorProfile.last_name].filter(Boolean).join(' ')
        || authorProfile.email
        || 'Unknown'
      : 'You',
    authorRole: authorProfile?.role ?? null,
  };

  revalidatePath('/practice', 'layout');
  revalidatePath('/tutor', 'layout');
  return actionOk({ note });
}

/** Update an existing note's content. Author or admin only. */
export async function updateQuestionNote({
  noteId,
  content,
}: {
  noteId: string;
  content: string;
}): Promise<ActionResult<{ data: { note: QuestionNoteUpdate } }>> {
  if (!noteId) return actionFail('noteId required');
  const trimmed = (content ?? '').trim();
  if (!trimmed) return actionFail('content required');

  let supabase;
  let user;
  let profile;
  try {
    ({ supabase, user, profile } = await requireRole(TUTOR_ROLES));
  } catch (e) {
    if (e instanceof ApiError) return actionFail(e.message);
    throw e;
  }

  if (profile.role !== 'admin') {
    const { data: existing } = await supabase
      .from('question_notes')
      .select('author_id')
      .eq('id', noteId)
      .maybeSingle();
    if (!existing || existing.author_id !== user.id) {
      return actionFail('Forbidden');
    }
  }

  const { data, error } = await supabase
    .from('question_notes')
    .update({ content: trimmed, updated_at: new Date().toISOString() })
    .eq('id', noteId)
    .select('id, content, updated_at')
    .single();
  if (error) return actionFail(error.message);

  revalidatePath('/practice', 'layout');
  revalidatePath('/tutor', 'layout');
  return actionOk({
    note: { id: data.id, content: data.content, updatedAt: data.updated_at },
  });
}

/** Delete a note. Author or admin only. */
export async function deleteQuestionNote({
  noteId,
}: {
  noteId: string;
}): Promise<ActionResult> {
  if (!noteId) return actionFail('noteId required');

  let supabase;
  let user;
  let profile;
  try {
    ({ supabase, user, profile } = await requireRole(TUTOR_ROLES));
  } catch (e) {
    if (e instanceof ApiError) return actionFail(e.message);
    throw e;
  }

  if (profile.role !== 'admin') {
    const { data: existing } = await supabase
      .from('question_notes')
      .select('author_id')
      .eq('id', noteId)
      .maybeSingle();
    if (!existing || existing.author_id !== user.id) {
      return actionFail('Forbidden');
    }
  }

  const { error } = await supabase
    .from('question_notes')
    .delete()
    .eq('id', noteId);
  if (error) return actionFail(error.message);

  revalidatePath('/practice', 'layout');
  revalidatePath('/tutor', 'layout');
  return actionOk();
}
