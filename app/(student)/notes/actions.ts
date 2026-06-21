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
import type {
  ActionResult,
  NoteDoc,
  NoteTaxonomy,
  StudentNote,
} from '@/lib/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { domainSection } from '@/lib/ui/question-layout';

const MAX_BODY_TEXT_LEN = 50_000;
const MAX_TITLE_LEN     = 200;
const MAX_TAGS          = 20;
const MAX_TAG_LEN       = 40;
const MAX_TAXONOMY_LEN  = 80;

interface TaxonomyOverride {
  subjectCode?: string | null;
  domainCode?: string | null;
  domainName?: string | null;
  skillCode?: string | null;
  skillName?: string | null;
}

interface CreateInput extends TaxonomyOverride {
  title?: string | null;
  // Stringified TipTap JSON document. Round-tripped as a string
  // because Next.js Server Action serialization (React Flight) has
  // a sharp edge with objects whose top-level key is `type` — it
  // strips peer keys like `attrs`, which is exactly the shape a
  // ProseMirror node uses (`{ type, attrs, content }`). Sending the
  // doc as an opaque string sidesteps the Flight encoder entirely.
  bodyJson: string;
  bodyText: string;
  tags?: string[];
  questionId?: string | null;
}

interface UpdateInput extends CreateInput {
  id: string;
}

interface UpsertForQuestionInput extends TaxonomyOverride {
  questionId: string;
  bodyJson: string;
  bodyText: string;
  title?: string | null;
}

function parseBodyJson(raw: string): NoteDoc | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed as NoteDoc;
    return null;
  } catch {
    return null;
  }
}

function rowToNote(row: {
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
}): StudentNote {
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

/** Trim + cap a taxonomy field; empty/whitespace becomes null so
 *  partial overrides don't push empty strings into the DB. */
function normTax(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (!v) return null;
  return v.slice(0, MAX_TAXONOMY_LEN);
}

/** Pull subject / domain / skill from a question, normalize, and
 *  derive subject_code from domain_code if the row doesn't have
 *  one. Used to seed a freshly-linked note's taxonomy. For ACT,
 *  reads from act_questions and treats `section` as both the
 *  subject and the domain (same mapping load-act-question.ts uses
 *  to feed the shared QuestionTaxonomy shape). */
async function taxonomyForQuestion(
  supabase: SupabaseClient,
  questionId: string,
  testType: 'sat' | 'act',
): Promise<NoteTaxonomy> {
  if (testType === 'act') {
    const { data } = await supabase
      .from('act_questions')
      .select('section, category, category_code')
      .eq('id', questionId)
      .maybeSingle();
    const section = normTax(data?.section);
    return {
      subjectCode: section,
      domainCode:  section,
      domainName:  section ? section.charAt(0).toUpperCase() + section.slice(1) : null,
      skillCode:   normTax(data?.category_code),
      skillName:   normTax(data?.category),
    };
  }
  const { data } = await supabase
    .from('questions_v2')
    .select('domain_code, domain_name, skill_code, skill_name')
    .eq('id', questionId)
    .maybeSingle();
  const domainCode = normTax(data?.domain_code);
  return {
    subjectCode: domainCode ? domainSection(domainCode) : null,
    domainCode,
    domainName:  normTax(data?.domain_name),
    skillCode:   normTax(data?.skill_code),
    skillName:   normTax(data?.skill_name),
  };
}

/** Resolve the taxonomy to write for a save:
 *   - explicit override values from the client win (sticky student edit)
 *   - otherwise keep what's already on the row (`existing`)
 *   - otherwise, if the note is linked to a question, copy from the
 *     question (first-save auto-populate)
 *   - otherwise null
 * `seedFromQuestion` is the question's taxonomy or null. */
function resolveTaxonomy(
  override: TaxonomyOverride,
  existing: NoteTaxonomy | null,
  seedFromQuestion: NoteTaxonomy | null,
): NoteTaxonomy {
  // `undefined` on the override means "no opinion, fall through".
  // `null` means "explicitly clear" — the student wiped the field.
  const pick = <K extends keyof NoteTaxonomy>(
    key: K,
    overrideKey: keyof TaxonomyOverride,
  ): string | null => {
    const ov = override[overrideKey];
    if (ov !== undefined) return normTax(ov);
    if (existing && existing[key] !== null) return existing[key];
    return seedFromQuestion ? seedFromQuestion[key] : null;
  };
  return {
    subjectCode: pick('subjectCode', 'subjectCode'),
    domainCode:  pick('domainCode',  'domainCode'),
    domainName:  pick('domainName',  'domainName'),
    skillCode:   pick('skillCode',   'skillCode'),
    skillName:   pick('skillName',   'skillName'),
  };
}

function taxonomyToColumns(tax: NoteTaxonomy) {
  return {
    subject_code: tax.subjectCode,
    domain_code:  tax.domainCode,
    domain_name:  tax.domainName,
    skill_code:   tax.skillCode,
    skill_name:   tax.skillName,
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
  if (typeof p.bodyJson !== 'string' || !p.bodyJson) {
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

/** Resolve a question id to its questions_v2 row id. student_notes
 *  carries an FK on questions_v2(id), so we verify before writing —
 *  if the id doesn't resolve (deleted question, bad input), the
 *  caller drops the link rather than reject the save. */
async function resolveQuestionV2Id(
  supabase: SupabaseClient,
  qid: string | null | undefined,
): Promise<string | null> {
  if (!qid) return null;
  const { data: v2 } = await supabase
    .from('questions_v2')
    .select('id')
    .eq('id', qid)
    .maybeSingle();
  return v2?.id ? (v2.id as string) : null;
}

/** Resolve a question id for the notes feature, returning both the
 *  resolved id and which question table the row belongs to. SAT
 *  questions are walked v1 → v2 through question_id_map (the
 *  existing behavior); ACT questions are looked up directly in
 *  act_questions. student_notes has no FK on question_id, so
 *  either id space stores fine — we just need to know which
 *  test_type to write alongside it. */
async function resolveQuestionForNotes(
  supabase: SupabaseClient,
  qid: string | null | undefined,
): Promise<{ id: string; testType: 'sat' | 'act' } | null> {
  if (!qid) return null;
  const v2Id = await resolveQuestionV2Id(supabase, qid);
  if (v2Id) return { id: v2Id, testType: 'sat' };
  const { data: act } = await supabase
    .from('act_questions')
    .select('id')
    .eq('id', qid)
    .maybeSingle();
  if (act?.id) return { id: act.id as string, testType: 'act' };
  return null;
}

/** Create a new note. Returns the freshly persisted row. */
export async function createNote(
  input: CreateInput,
): Promise<ActionResult<{ data: { note: StudentNote } }>> {
  const validation = validatePayload(input);
  if (validation) return actionFail(validation);
  const doc = parseBodyJson(input.bodyJson);
  if (!doc) return actionFail('bodyJson is not valid JSON');

  const ctx = await getCtx();
  if ('error' in ctx) return actionFail(ctx.error);
  const { user, supabase } = ctx as { user: { id: string }; supabase: SupabaseClient };

  // Walk a v1 question id forward to its v2 counterpart, OR resolve
  // an ACT question id, before the write. student_notes accepts
  // either id space — test_type tags which one.
  const resolved = await resolveQuestionForNotes(supabase, input.questionId);
  const resolvedQid = resolved?.id ?? null;
  const testType: 'sat' | 'act' = resolved?.testType ?? 'sat';

  const seed = resolved
    ? await taxonomyForQuestion(supabase, resolved.id, resolved.testType)
    : null;
  const tax = resolveTaxonomy(input, null, seed);

  const payload = {
    user_id: user.id,
    question_id: resolvedQid,
    title: input.title?.trim() || null,
    body_json: doc,
    body_text: input.bodyText,
    tags: sanitizeTags(input.tags),
    test_type: testType,
    ...taxonomyToColumns(tax),
  };

  const { data, error } = await supabase
    .from('student_notes')
    .insert(payload)
    .select(
      'id, user_id, question_id, title, body_json, body_text, tags, subject_code, domain_code, domain_name, skill_code, skill_name, created_at, updated_at',
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
  const doc = parseBodyJson(input.bodyJson);
  if (!doc) return actionFail('bodyJson is not valid JSON');

  const ctx = await getCtx();
  if ('error' in ctx) return actionFail(ctx.error);
  const { user, supabase } = ctx as { user: { id: string }; supabase: SupabaseClient };

  // Read the current taxonomy so sticky logic respects prior values.
  const { data: existing } = await supabase
    .from('student_notes')
    .select('subject_code, domain_code, domain_name, skill_code, skill_name')
    .eq('id', input.id)
    .eq('user_id', user.id)
    .maybeSingle();
  const existingTax: NoteTaxonomy | null = existing
    ? {
        subjectCode: existing.subject_code,
        domainCode:  existing.domain_code,
        domainName:  existing.domain_name,
        skillCode:   existing.skill_code,
        skillName:   existing.skill_name,
      }
    : null;
  // Same id translation as createNote — but here we also keep the
  // ACT id space intact so a student editing a note tied to an ACT
  // question doesn't have its question link silently dropped.
  const resolved = await resolveQuestionForNotes(supabase, input.questionId);
  const resolvedQid = resolved?.id ?? null;

  const seed = resolved
    ? await taxonomyForQuestion(supabase, resolved.id, resolved.testType)
    : null;
  const tax = resolveTaxonomy(input, existingTax, seed);

  const patch = {
    title: input.title?.trim() || null,
    body_json: doc,
    body_text: input.bodyText,
    tags: sanitizeTags(input.tags),
    question_id: resolvedQid,
    ...taxonomyToColumns(tax),
  };

  const { data, error } = await supabase
    .from('student_notes')
    .update(patch)
    .eq('id', input.id)
    .eq('user_id', user.id)
    .select(
      'id, user_id, question_id, title, body_json, body_text, tags, subject_code, domain_code, domain_name, skill_code, skill_name, created_at, updated_at',
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
  if (!input.questionId) return actionFail('questionId required');
  const validation = validatePayload(input);
  if (validation) return actionFail(validation);
  const doc = parseBodyJson(input.bodyJson);
  if (!doc) return actionFail('bodyJson is not valid JSON');

  const ctx = await getCtx();
  if ('error' in ctx) return actionFail(ctx.error);
  const { user, supabase } = ctx as { user: { id: string }; supabase: SupabaseClient };

  // Resolve the question id and figure out which test_type tag
  // belongs on the note. SAT questions walk through question_id_map;
  // ACT questions look up directly in act_questions.
  const resolved = await resolveQuestionForNotes(supabase, input.questionId);
  if (!resolved) {
    return actionFail('That question is no longer in the bank, so a per-question note can\'t be saved against it.');
  }
  const resolvedQid = resolved.id;
  const testType = resolved.testType;

  // Per-question existing-note lookup. test_type scopes the lookup
  // so a future SAT/ACT id collision (vanishingly unlikely with
  // UUIDs, but the schema permits it) doesn't cross-pollinate.
  const { data: existing } = await supabase
    .from('student_notes')
    .select(
      'id, subject_code, domain_code, domain_name, skill_code, skill_name',
    )
    .eq('user_id', user.id)
    .eq('question_id', resolvedQid)
    .eq('test_type', testType)
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

  const existingTax: NoteTaxonomy | null = existing
    ? {
        subjectCode: existing.subject_code,
        domainCode:  existing.domain_code,
        domainName:  existing.domain_name,
        skillCode:   existing.skill_code,
        skillName:   existing.skill_name,
      }
    : null;
  // Only seed from the question on first save (no existing row) — on
  // subsequent saves the existing row's stickiness wins per Option A.
  const seed = existing
    ? null
    : await taxonomyForQuestion(supabase, resolvedQid, testType);
  const tax = resolveTaxonomy(input, existingTax, seed);

  if (existing) {
    const { data, error } = await supabase
      .from('student_notes')
      .update({
        title: input.title?.trim() || null,
        body_json: doc,
        body_text: input.bodyText,
        ...taxonomyToColumns(tax),
      })
      .eq('id', existing.id)
      .eq('user_id', user.id)
      .select(
      'id, user_id, question_id, title, body_json, body_text, tags, subject_code, domain_code, domain_name, skill_code, skill_name, created_at, updated_at',
    )
      .single();
    if (error) return actionFail(`Could not save note: ${error.message}`);
    revalidateNotes();
    return actionOk({ note: rowToNote(data) });
  }

  const { data, error } = await supabase
    .from('student_notes')
    .insert({
      user_id: user.id,
      question_id: resolvedQid,
      title: input.title?.trim() || null,
      body_json: doc,
      body_text: input.bodyText,
      tags: [],
      test_type: testType,
      ...taxonomyToColumns(tax),
    })
    .select(
      'id, user_id, question_id, title, body_json, body_text, tags, subject_code, domain_code, domain_name, skill_code, skill_name, created_at, updated_at',
    )
    .single();
  if (error) return actionFail(`Could not save note: ${error.message}`);

  revalidateNotes();
  return actionOk({ note: rowToNote(data) });
}
