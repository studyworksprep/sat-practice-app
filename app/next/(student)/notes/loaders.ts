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
import { docToSnippetHtml, docToFullHtml } from '@/lib/notes/render';

interface NoteRow {
  id: string;
  user_id: string;
  question_id: string | null;
  title: string | null;
  body_json: NoteDoc;
  body_text: string;
  tags: string[];
  subject_code: string | null;
  domain_code: string | null;
  domain_name: string | null;
  skill_code: string | null;
  skill_name: string | null;
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
  subject_code: string | null;
  domain_code: string | null;
  domain_name: string | null;
  skill_code: string | null;
  skill_name: string | null;
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
    subjectCode: row.subject_code,
    domainCode: row.domain_code,
    domainName: row.domain_name,
    skillCode: row.skill_code,
    skillName: row.skill_name,
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
    subjectCode: row.subject_code,
    domainCode: row.domain_code,
    domainName: row.domain_name,
    skillCode: row.skill_code,
    skillName: row.skill_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

interface IndexFilters {
  search?: string | null;
  tag?: string | null;
  subject?: string | null;
  domain?: string | null;
  skill?: string | null;
}

/** Sidebar-facet shape for the notes index: the full set of subject /
 *  domain / skill values the caller has notes in, plus a count per
 *  bucket so the UI can render "Math · Algebra (3)". */
export interface NotesIndexFacets {
  subjects: { code: string; count: number }[];
  domains: {
    code: string;
    name: string | null;
    subjectCode: string | null;
    count: number;
  }[];
  skills: {
    code: string;
    name: string | null;
    subjectCode: string | null;
    domainCode: string | null;
    count: number;
  }[];
}

/** List the caller's notes, most-recent first, with optional
 *  full-text search, single-tag filter, and subject / domain / skill
 *  filters. The facet computation runs against a separate
 *  unfiltered-by-search query so the sidebar always reflects the
 *  caller's full taxonomy footprint regardless of the active text
 *  filter. */
export async function loadNotesIndex(
  supabase: SupabaseClient,
  filters: IndexFilters = {},
): Promise<{
  notes: StudentNoteSummary[];
  allTags: string[];
  facets: NotesIndexFacets;
}> {
  let query = supabase
    .from('student_notes')
    .select(
      'id, question_id, title, body_json, body_text, tags, subject_code, domain_code, domain_name, skill_code, skill_name, updated_at',
    )
    .order('updated_at', { ascending: false })
    .limit(200);

  const term = filters.search?.trim();
  if (term) {
    // Phrase-style websearch over the existing GIN index. ilike on
    // title / tags is OR'd in so a typed title or tag still hits
    // even if body hasn't been indexed yet.
    const escaped = term.replace(/[%_]/g, '\\$&');
    query = query.or(
      `title.ilike.%${escaped}%,body_text.ilike.%${escaped}%`,
    );
  }

  const tag = filters.tag?.trim().toLowerCase();
  if (tag) query = query.contains('tags', [tag]);

  const subject = filters.subject?.trim().toLowerCase();
  if (subject) query = query.eq('subject_code', subject);
  const domain = filters.domain?.trim();
  if (domain) query = query.eq('domain_code', domain);
  const skill = filters.skill?.trim();
  if (skill) query = query.eq('skill_code', skill);

  const { data, error } = await query;
  if (error) {
    // Logged for the server console; the page treats absence of data
    // as "no notes" rather than crashing the route.
    // eslint-disable-next-line no-console
    console.error('loadNotesIndex error', error);
    return { notes: [], allTags: [], facets: { subjects: [], domains: [], skills: [] } };
  }

  const rows = (data ?? []) as SummaryRow[];

  // Compute the tag list from the same set so the filter chip row
  // only shows tags the student actually has.
  const tagSet = new Set<string>();
  for (const r of rows) for (const t of r.tags ?? []) tagSet.add(t);

  const facets = await loadNotesIndexFacets(supabase);

  return {
    notes: rows.map(toSummary),
    allTags: [...tagSet].sort(),
    facets,
  };
}

/** Pull the unfiltered subject / domain / skill counts so the
 *  sidebar shows every bucket the user has notes in even when the
 *  active filter narrows the visible list to one. */
async function loadNotesIndexFacets(
  supabase: SupabaseClient,
): Promise<NotesIndexFacets> {
  const { data, error } = await supabase
    .from('student_notes')
    .select('subject_code, domain_code, domain_name, skill_code, skill_name')
    .limit(2000);
  if (error || !data) {
    return { subjects: [], domains: [], skills: [] };
  }

  const subjectCounts = new Map<string, number>();
  const domainAcc = new Map<
    string,
    { code: string; name: string | null; subjectCode: string | null; count: number }
  >();
  const skillAcc = new Map<
    string,
    { code: string; name: string | null; subjectCode: string | null; domainCode: string | null; count: number }
  >();

  for (const r of data as Array<Pick<
    SummaryRow,
    'subject_code' | 'domain_code' | 'domain_name' | 'skill_code' | 'skill_name'
  >>) {
    if (r.subject_code) {
      subjectCounts.set(r.subject_code, (subjectCounts.get(r.subject_code) ?? 0) + 1);
    }
    if (r.domain_code) {
      const k = r.domain_code;
      const existing = domainAcc.get(k);
      if (existing) existing.count += 1;
      else domainAcc.set(k, {
        code: k,
        name: r.domain_name,
        subjectCode: r.subject_code,
        count: 1,
      });
    }
    if (r.skill_code) {
      const k = `${r.domain_code ?? ''}/${r.skill_code}`;
      const existing = skillAcc.get(k);
      if (existing) existing.count += 1;
      else skillAcc.set(k, {
        code: r.skill_code,
        name: r.skill_name,
        subjectCode: r.subject_code,
        domainCode: r.domain_code,
        count: 1,
      });
    }
  }

  return {
    subjects: [...subjectCounts.entries()]
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => a.code.localeCompare(b.code)),
    domains: [...domainAcc.values()].sort((a, b) =>
      (a.name ?? a.code).localeCompare(b.name ?? b.code),
    ),
    skills: [...skillAcc.values()].sort((a, b) =>
      (a.name ?? a.code).localeCompare(b.name ?? b.code),
    ),
  };
}

// ──────────────────────────────────────────────────────────────
// Review (study) variant: same filters as loadNotesIndex, but
// returns notes with the full body_json rendered to HTML so the
// /review/notes long-scroll page can show every note inline.
// ──────────────────────────────────────────────────────────────

export interface NoteForReview {
  id: string;
  title: string | null;
  bodyHtml: string;
  bodyText: string;
  tags: string[];
  subjectCode: string | null;
  domainCode: string | null;
  domainName: string | null;
  skillCode: string | null;
  skillName: string | null;
  questionId: string | null;
  updatedAt: string;
}

/** Load notes for the /review/notes study page. Same filter shape
 *  and facets as the manage index, but body_json is rendered to
 *  full HTML once on the server (cards-page snippet rendering
 *  isn't reused — the study view wants the entire note). */
export async function loadNotesForReview(
  supabase: SupabaseClient,
  filters: IndexFilters = {},
): Promise<{
  notes: NoteForReview[];
  allTags: string[];
  facets: NotesIndexFacets;
}> {
  let query = supabase
    .from('student_notes')
    .select(
      'id, title, body_json, body_text, tags, subject_code, domain_code, domain_name, skill_code, skill_name, question_id, updated_at',
    )
    .order('updated_at', { ascending: false })
    .limit(200);

  const term = filters.search?.trim();
  if (term) {
    const escaped = term.replace(/[%_]/g, '\\$&');
    query = query.or(`title.ilike.%${escaped}%,body_text.ilike.%${escaped}%`);
  }

  const tag = filters.tag?.trim().toLowerCase();
  if (tag) query = query.contains('tags', [tag]);

  const subject = filters.subject?.trim().toLowerCase();
  if (subject) query = query.eq('subject_code', subject);
  const domain = filters.domain?.trim();
  if (domain) query = query.eq('domain_code', domain);
  const skill = filters.skill?.trim();
  if (skill) query = query.eq('skill_code', skill);

  const { data, error } = await query;
  if (error) {
    // eslint-disable-next-line no-console
    console.error('loadNotesForReview error', error);
    return { notes: [], allTags: [], facets: { subjects: [], domains: [], skills: [] } };
  }

  const rows = (data ?? []) as Array<{
    id: string;
    title: string | null;
    body_json: NoteDoc | null;
    body_text: string;
    tags: string[];
    subject_code: string | null;
    domain_code: string | null;
    domain_name: string | null;
    skill_code: string | null;
    skill_name: string | null;
    question_id: string | null;
    updated_at: string;
  }>;

  const tagSet = new Set<string>();
  for (const r of rows) for (const t of r.tags ?? []) tagSet.add(t);

  const facets = await loadNotesIndexFacets(supabase);

  return {
    notes: rows.map((r) => ({
      id: r.id,
      title: r.title,
      bodyHtml: r.body_json ? docToFullHtml(r.body_json) : '',
      bodyText: r.body_text,
      tags: r.tags ?? [],
      subjectCode: r.subject_code,
      domainCode: r.domain_code,
      domainName: r.domain_name,
      skillCode: r.skill_code,
      skillName: r.skill_name,
      questionId: r.question_id,
      updatedAt: r.updated_at,
    })),
    allTags: [...tagSet].sort(),
    facets,
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
      'id, user_id, question_id, title, body_json, body_text, tags, subject_code, domain_code, domain_name, skill_code, skill_name, created_at, updated_at',
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
      'id, user_id, question_id, title, body_json, body_text, tags, subject_code, domain_code, domain_name, skill_code, skill_name, created_at, updated_at',
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
interface BatchedStudentNote {
  id: string;
  title: string | null;
  bodyJson: unknown;
  bodyText: string;
  subjectCode: string | null;
  domainCode: string | null;
  domainName: string | null;
  skillCode: string | null;
  skillName: string | null;
  updatedAt: string;
}

export async function loadStudentNotesByQuestion(
  supabase: SupabaseClient,
  questionIds: string[],
): Promise<Map<string, BatchedStudentNote>> {
  const out = new Map<string, BatchedStudentNote>();
  if (!questionIds || questionIds.length === 0) return out;

  const { data, error } = await supabase
    .from('student_notes')
    .select(
      'id, question_id, title, body_json, body_text, subject_code, domain_code, domain_name, skill_code, skill_name, updated_at',
    )
    .in('question_id', questionIds)
    .not('question_id', 'is', null)
    .order('updated_at', { ascending: false });
  if (error || !data) return out;

  for (const row of data as Array<{
    id: string;
    question_id: string;
    title: string | null;
    body_json: unknown;
    body_text: string;
    subject_code: string | null;
    domain_code: string | null;
    domain_name: string | null;
    skill_code: string | null;
    skill_name: string | null;
    updated_at: string;
  }>) {
    if (out.has(row.question_id)) continue; // first wins; rows are pre-sorted desc
    out.set(row.question_id, {
      id: row.id,
      title: row.title,
      bodyJson: row.body_json,
      bodyText: row.body_text,
      subjectCode: row.subject_code,
      domainCode:  row.domain_code,
      domainName:  row.domain_name,
      skillCode:   row.skill_code,
      skillName:   row.skill_name,
      updatedAt: row.updated_at,
    });
  }
  return out;
}
