// Server-side loaders for the student notes surface. Called from
// the page Server Components so the rendered HTML arrives with data
// already in place — no client-side fetch on mount.
//
// All three loaders rely on RLS for owner-only filtering: the
// supabase client passed in is the request-scoped one from
// requireUser(), which already includes the user's auth cookie.

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  StudentNote,
  StudentNoteSummary,
  NoteDoc,
} from '@/lib/types';
import { docToSnippetHtml } from '@/lib/notes/render';

interface NoteRow {
  id: string;
  user_id: string;
  question_id: string | null;
  title: string | null;
  body_json: NoteDoc;
  body_text: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

interface SummaryRow {
  id: string;
  question_id: string | null;
  title: string | null;
  body_json: NoteDoc | null;
  body_text: string;
  tags: string[];
  updated_at: string;
}

const PREVIEW_LEN = 200;

function toSummary(row: SummaryRow): StudentNoteSummary {
  const collapsed = (row.body_text ?? '').replace(/\s+/g, ' ').trim();
  const preview = collapsed.length > PREVIEW_LEN
    ? `${collapsed.slice(0, PREVIEW_LEN - 1)}…`
    : collapsed;
  // Server-render the snippet HTML once. body_json on a freshly
  // saved note shape may be null; fall back to the plain preview
  // so the card isn't blank.
  const previewHtml = row.body_json
    ? docToSnippetHtml(row.body_json, PREVIEW_LEN)
    : '';
  return {
    id: row.id,
    questionId: row.question_id,
    title: row.title,
    preview,
    previewHtml,
    tags: row.tags ?? [],
    updatedAt: row.updated_at,
  };
}

function toNote(row: NoteRow): StudentNote {
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

interface IndexFilters {
  search?: string | null;
  tag?: string | null;
}

/** List the caller's notes, most-recent first, with optional
 *  full-text search and a single-tag filter. */
export async function loadNotesIndex(
  supabase: SupabaseClient,
  filters: IndexFilters = {},
): Promise<{ notes: StudentNoteSummary[]; allTags: string[] }> {
  let query = supabase
    .from('student_notes')
    .select('id, question_id, title, body_json, body_text, tags, updated_at')
    .order('updated_at', { ascending: false })
    .limit(200);

  const term = filters.search?.trim();
  if (term) {
    // Phrase-style websearch over the existing GIN index. ilike on
    // title is OR'd in so a typed title still hits even if the body
    // hasn't been indexed yet.
    query = query.or(
      `title.ilike.%${term.replace(/[%_]/g, '\\$&')}%,body_text.ilike.%${term.replace(/[%_]/g, '\\$&')}%`,
    );
  }

  const tag = filters.tag?.trim().toLowerCase();
  if (tag) query = query.contains('tags', [tag]);

  const { data, error } = await query;
  if (error) {
    // Logged for the server console; the page treats absence of data
    // as "no notes" rather than crashing the route.
    // eslint-disable-next-line no-console
    console.error('loadNotesIndex error', error);
    return { notes: [], allTags: [] };
  }

  const rows = (data ?? []) as SummaryRow[];

  // Compute the tag list from the same set so the filter chip row
  // only shows tags the student actually has.
  const tagSet = new Set<string>();
  for (const r of rows) for (const t of r.tags ?? []) tagSet.add(t);

  return {
    notes: rows.map(toSummary),
    allTags: [...tagSet].sort(),
  };
}

/** Load one note by id. Returns null when missing or not the
 *  caller's (RLS hides the row, so a wrong-user request is
 *  indistinguishable from a missing one — that's fine here). */
export async function loadNote(
  supabase: SupabaseClient,
  id: string,
): Promise<StudentNote | null> {
  const { data, error } = await supabase
    .from('student_notes')
    .select(
      'id, user_id, question_id, title, body_json, body_text, tags, created_at, updated_at',
    )
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null;
  return toNote(data as NoteRow);
}

/** Load the caller's note for a specific question (if any). The
 *  per-question popover treats >1 row as "show the most recent" —
 *  the upsert action enforces one-per-(user,question) on the write
 *  path, so this branch is defensive only. */
export async function loadNoteForQuestion(
  supabase: SupabaseClient,
  questionId: string,
): Promise<StudentNote | null> {
  const { data, error } = await supabase
    .from('student_notes')
    .select(
      'id, user_id, question_id, title, body_json, body_text, tags, created_at, updated_at',
    )
    .eq('question_id', questionId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return toNote(data as NoteRow);
}

/** Batch variant for review surfaces that render many questions in
 *  one page (session review, practice-test module review, results).
 *  Returns a Map keyed by question_id with the most recent note per
 *  question — the loader picks the freshest by `updated_at` so a
 *  legacy (pre-uniqueness-enforcement) duplicate doesn't cause
 *  double rendering. */
export async function loadStudentNotesByQuestion(
  supabase: SupabaseClient,
  questionIds: string[],
): Promise<Map<string, { id: string; bodyJson: unknown; bodyText: string; updatedAt: string }>> {
  const out = new Map<string, { id: string; bodyJson: unknown; bodyText: string; updatedAt: string }>();
  if (!questionIds || questionIds.length === 0) return out;

  const { data, error } = await supabase
    .from('student_notes')
    .select('id, question_id, body_json, body_text, updated_at')
    .in('question_id', questionIds)
    .not('question_id', 'is', null)
    .order('updated_at', { ascending: false });
  if (error || !data) return out;

  for (const row of data as Array<{
    id: string;
    question_id: string;
    body_json: unknown;
    body_text: string;
    updated_at: string;
  }>) {
    if (out.has(row.question_id)) continue; // first wins; rows are pre-sorted desc
    out.set(row.question_id, {
      id: row.id,
      bodyJson: row.body_json,
      bodyText: row.body_text,
      updatedAt: row.updated_at,
    });
  }
  return out;
}
