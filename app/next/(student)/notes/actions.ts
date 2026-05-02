// Server Actions for the student-private notes feature.
//
// Storage: public.student_notes (one row per note). Owner-only RLS,
// see migration 20240101000040_student_notes.sql. The TipTap editor
// is the source of truth for body_json; body_text is a plain-text
// projection the editor passes alongside on save so we don't need to
// walk the doc on the server.
//
// Mirrors lib/practice/error-notes-actions.ts in shape: requireUser
// up front, plain-object ActionResult returns, no service-role bypass.

'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/api/auth';
import { actionFail, actionOk, ApiError } from '@/lib/api/response';
import type { ActionResult, NoteDoc, StudentNote } from '@/lib/types';
import type { SupabaseClient } from '@supabase/supabase-js';

const MAX_BODY_TEXT_LEN = 50_000;
const MAX_TITLE_LEN     = 200;
const MAX_TAGS          = 20;
const MAX_TAG_LEN       = 40;

interface CreateInput {
  title?: string | null;
  bodyJson: NoteDoc;
  bodyText: string;
  tags?: string[];
  questionId?: string | null;
}

interface UpdateInput extends CreateInput {
  id: string;
}

interface UpsertForQuestionInput {
  questionId: string;
  bodyJson: NoteDoc;
  bodyText: string;
  title?: string | null;
}

function rowToNote(row: {
  id: string;
  user_id: string;
  question_id: string | null;
  title: string | null;
  body_json: NoteDoc;
  body_text: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}): StudentNote {
  return {
    id: row.id,
    userId: row.user_id,
    questionId: row.question_id,
    title: row.title,
    bodyJson: row.body_json,
    bodyText: row.body_text,
    tags: row.tags ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function sanitizeTags(input: string[] | undefined): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== 'string') continue;
    const tag = raw.trim().toLowerCase().slice(0, MAX_TAG_LEN);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

function validatePayload(p: CreateInput): string | null {
  if (typeof p.bodyText !== 'string') return 'bodyText required';
  if (p.bodyText.length > MAX_BODY_TEXT_LEN) {
    return `Note is too long (max ${MAX_BODY_TEXT_LEN} characters)`;
  }
  if (p.title != null && typeof p.title !== 'string') return 'title must be a string';
  if (p.title && p.title.length > MAX_TITLE_LEN) {
    return `Title is too long (max ${MAX_TITLE_LEN} characters)`;
  }
  if (p.bodyJson == null || typeof p.bodyJson !== 'object') {
    return 'bodyJson required';
  }
  return null;
}

async function getCtx() {
  try {
    return await requireUser();
  } catch (e) {
    if (e instanceof ApiError) return { error: e.message };
    return { error: 'Unexpected error loading user' };
  }
}

function revalidateNotes() {
  // Hits the index, the per-note page, and any practice page that
  // mounts the per-question popover with a server-loaded snapshot.
  revalidatePath('/notes', 'layout');
  revalidatePath('/practice', 'layout');
}

/** Create a new note. Returns the freshly persisted row. */
export async function createNote(
  input: CreateInput,
): Promise<ActionResult<{ data: { note: StudentNote } }>> {
  const validation = validatePayload(input);
  if (validation) return actionFail(validation);

  const ctx = await getCtx();
  if ('error' in ctx) return actionFail(ctx.error);
  const { user, supabase } = ctx as { user: { id: string }; supabase: SupabaseClient };

  const payload = {
    user_id: user.id,
    question_id: input.questionId ?? null,
    title: input.title?.trim() || null,
    body_json: input.bodyJson,
    body_text: input.bodyText,
    tags: sanitizeTags(input.tags),
  };

  const { data, error } = await supabase
    .from('student_notes')
    .insert(payload)
    .select(
      'id, user_id, question_id, title, body_json, body_text, tags, created_at, updated_at',
    )
    .single();
  if (error) return actionFail(`Could not create note: ${error.message}`);

  revalidateNotes();
  return actionOk({ note: rowToNote(data) });
}

/** Update an existing note. RLS enforces ownership; we re-check the
 *  row count so a wrong-id reaches the user as a clear failure. */
export async function updateNote(
  input: UpdateInput,
): Promise<ActionResult<{ data: { note: StudentNote } }>> {
  if (!input.id) return actionFail('id required');
  const validation = validatePayload(input);
  if (validation) return actionFail(validation);

  const ctx = await getCtx();
  if ('error' in ctx) return actionFail(ctx.error);
  const { user, supabase } = ctx as { user: { id: string }; supabase: SupabaseClient };

  const patch = {
    title: input.title?.trim() || null,
    body_json: input.bodyJson,
    body_text: input.bodyText,
    tags: sanitizeTags(input.tags),
    question_id: input.questionId ?? null,
  };

  const { data, error } = await supabase
    .from('student_notes')
    .update(patch)
    .eq('id', input.id)
    .eq('user_id', user.id)
    .select(
      'id, user_id, question_id, title, body_json, body_text, tags, created_at, updated_at',
    )
    .maybeSingle();
  if (error) return actionFail(`Could not save note: ${error.message}`);
  if (!data) return actionFail('Note not found');

  revalidateNotes();
  return actionOk({ note: rowToNote(data) });
}

/** Delete a note. RLS enforces ownership. */
export async function deleteNote(
  id: string,
): Promise<ActionResult<{ data: { id: string } }>> {
  if (!id) return actionFail('id required');

  const ctx = await getCtx();
  if ('error' in ctx) return actionFail(ctx.error);
  const { user, supabase } = ctx as { user: { id: string }; supabase: SupabaseClient };

  const { error } = await supabase
    .from('student_notes')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);
  if (error) return actionFail(`Could not delete note: ${error.message}`);

  revalidateNotes();
  return actionOk({ id });
}

/** Per-question popover save: at most one student-authored note per
 *  (user, question). On a hit, update; otherwise insert. Empty body
 *  with an existing row deletes it so the student can clear a stale
 *  draft without an extra call. */
export async function upsertNoteForQuestion(
  input: UpsertForQuestionInput,
): Promise<ActionResult<{ data: { note: StudentNote | null } }>> {
  // eslint-disable-next-line no-console
  console.log('[action] upsertNoteForQuestion input.bodyJson', JSON.stringify(input.bodyJson));
  if (!input.questionId) return actionFail('questionId required');
  const validation = validatePayload(input);
  if (validation) return actionFail(validation);

  const ctx = await getCtx();
  if ('error' in ctx) return actionFail(ctx.error);
  const { user, supabase } = ctx as { user: { id: string }; supabase: SupabaseClient };

  const { data: existing } = await supabase
    .from('student_notes')
    .select('id')
    .eq('user_id', user.id)
    .eq('question_id', input.questionId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Empty body → delete if anything exists, otherwise no-op.
  if (input.bodyText.trim() === '') {
    if (existing) {
      const { error } = await supabase
        .from('student_notes')
        .delete()
        .eq('id', existing.id)
        .eq('user_id', user.id);
      if (error) return actionFail(`Could not clear note: ${error.message}`);
    }
    revalidateNotes();
    return actionOk({ note: null });
  }

  if (existing) {
    const sentJson = JSON.stringify(input.bodyJson);
    // eslint-disable-next-line no-console
    console.log('[action] upsert UPDATE branch, sending body_json', sentJson);
    const { data, error } = await supabase
      .from('student_notes')
      .update({
        title: input.title?.trim() || null,
        body_json: input.bodyJson,
        body_text: input.bodyText,
      })
      .eq('id', existing.id)
      .eq('user_id', user.id)
      .select(
        'id, user_id, question_id, title, body_json, body_text, tags, created_at, updated_at',
      )
      .single();
    if (error) return actionFail(`Could not save note: ${error.message}`);
    const returnedJson = JSON.stringify(data?.body_json);
    // eslint-disable-next-line no-console
    console.log('[action] upsert UPDATE returned body_json', returnedJson);
    revalidateNotes();
    return actionOk({
      note: rowToNote(data),
      __debug: { sentJson, returnedJson },
    });
  }

  const sentJson = JSON.stringify(input.bodyJson);
  // eslint-disable-next-line no-console
  console.log('[action] upsert INSERT branch, sending body_json', sentJson);
  const { data, error } = await supabase
    .from('student_notes')
    .insert({
      user_id: user.id,
      question_id: input.questionId,
      title: input.title?.trim() || null,
      body_json: input.bodyJson,
      body_text: input.bodyText,
      tags: [],
    })
    .select(
      'id, user_id, question_id, title, body_json, body_text, tags, created_at, updated_at',
    )
    .single();
  if (error) return actionFail(`Could not save note: ${error.message}`);
  const returnedJson = JSON.stringify(data?.body_json);
  // eslint-disable-next-line no-console
  console.log('[action] upsert INSERT returned body_json', returnedJson);

  revalidateNotes();
  return actionOk({
    note: rowToNote(data),
    __debug: { sentJson, returnedJson },
  });
}
