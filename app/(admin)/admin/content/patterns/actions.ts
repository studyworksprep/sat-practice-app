// Server Actions for the question-pattern catalog
// (docs/foundations-and-question-patterns.md §3.4 step 2).
//
// The catalog is admin-authored reference data in the
// curriculum_units mold, so every mutation here is requireRole
// (['admin']) and rides the normal RLS-scoped client — the
// question_patterns policies from migration 20260727190000 already
// grant admins insert/update/delete. No service-role needed.
//
// Two authoring paths, one validator: the single-pattern form and the
// CSV import both go through lib/admin/questionPatternCsv, so a name
// the importer would reject is not quietly accepted by the form.

'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/api/auth';
import { actionOk, actionFail, ApiError } from '@/lib/api/response';
import { findDomain, findSkill } from '@/lib/practice/sat-taxonomy';
import {
  parsePatternCsv,
  planPatternImport,
  NAME_MAX,
  CUE_MAX,
  PROCESS_MAX,
  type ExistingPattern,
  type ImportMode,
  type PatternCsvIssue,
} from '@/lib/admin/questionPatternCsv';
import type { ActionResult, AuthContext } from '@/lib/types';

const PATTERN_SELECT = 'id, test_type, domain_code, skill_code, name, recognition_cue, process_summary, sequence';

export interface PatternInput {
  domainCode: string;
  skillCode: string;
  name: string;
  recognitionCue: string;
  processSummary: string;
  /** Empty string means "append to the end of this skill's list". */
  sequence: string;
}

export interface ImportSummary {
  created: number;
  updated: number;
  skipped: number;
  issues: PatternCsvIssue[];
}

async function adminCtx(): Promise<AuthContext> {
  return requireRole(['admin']);
}

// Pattern names surface on the lesson editor's scope tags and in the
// generate-page prefill, so a rename has to invalidate those too.
function revalidatePatternSurfaces() {
  revalidatePath('/admin/content/patterns');
  revalidatePath('/admin/content/units');
  revalidatePath('/admin/lessons', 'layout');
  revalidatePath('/tutor/lessons', 'layout');
}

interface NormalizedPattern {
  domainCode: string;
  skillCode: string;
  name: string;
  recognitionCue: string;
  processSummary: string | null;
  sequence: number | null;
}

/** Field validation for the single-pattern form, mirroring the CSV rules. */
function normalizeInput(input: PatternInput): { ok: true; value: NormalizedPattern } | { ok: false; error: string } {
  const domainCode = (input.domainCode ?? '').trim().toUpperCase();
  const skillCode = (input.skillCode ?? '').trim().toUpperCase();
  const name = (input.name ?? '').trim();
  const recognitionCue = (input.recognitionCue ?? '').trim();
  const processSummary = (input.processSummary ?? '').trim();
  const sequenceRaw = (input.sequence ?? '').trim();

  if (!domainCode) return { ok: false, error: 'Pick a domain.' };
  if (!skillCode) return { ok: false, error: 'Pick a skill.' };
  if (!name) return { ok: false, error: 'Name is required.' };
  if (!recognitionCue) return { ok: false, error: 'Recognition cue is required.' };
  if (name.length > NAME_MAX) return { ok: false, error: `Name is over ${NAME_MAX} characters.` };
  if (recognitionCue.length > CUE_MAX) {
    return { ok: false, error: `Recognition cue is over ${CUE_MAX} characters.` };
  }
  if (processSummary.length > PROCESS_MAX) {
    return { ok: false, error: `Process summary is over ${PROCESS_MAX} characters.` };
  }
  if (!findDomain(domainCode)) return { ok: false, error: `Unknown domain code "${domainCode}".` };
  if (!findSkill(domainCode, skillCode)) {
    return { ok: false, error: `Skill "${skillCode}" does not belong to domain ${domainCode}.` };
  }

  let sequence: number | null = null;
  if (sequenceRaw) {
    const parsed = Number(sequenceRaw);
    if (!Number.isInteger(parsed) || parsed < 1) {
      return { ok: false, error: 'Order must be a whole number of 1 or more.' };
    }
    sequence = parsed;
  }

  return {
    ok: true,
    value: { domainCode, skillCode, name, recognitionCue, processSummary: processSummary || null, sequence },
  };
}

/** Next teaching slot for a skill, so a blank order appends. */
async function nextSequence(
  supabase: AuthContext['supabase'],
  domainCode: string,
  skillCode: string,
): Promise<number> {
  const { data } = await supabase
    .from('question_patterns')
    .select('sequence')
    .eq('test_type', 'sat')
    .eq('domain_code', domainCode)
    .eq('skill_code', skillCode)
    .order('sequence', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.sequence ?? 0) + 1;
}

/** Create one pattern from the form. */
export async function createQuestionPattern(
  input: PatternInput,
): Promise<ActionResult<{ data: { id: string; name: string } }>> {
  const normalized = normalizeInput(input);
  if (!normalized.ok) return actionFail(normalized.error);
  const { domainCode, skillCode, name, recognitionCue, processSummary } = normalized.value;

  let ctx;
  try {
    ctx = await adminCtx();
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error');
  }
  const { supabase } = ctx;

  const sequence = normalized.value.sequence ?? (await nextSequence(supabase, domainCode, skillCode));

  const { data, error } = await supabase
    .from('question_patterns')
    .insert({
      test_type: 'sat',
      domain_code: domainCode,
      skill_code: skillCode,
      name,
      recognition_cue: recognitionCue,
      process_summary: processSummary,
      sequence,
    })
    .select('id, name')
    .maybeSingle();

  if (error) {
    if (error.code === '23505') {
      return actionFail(`"${name}" already exists for ${skillCode}.`);
    }
    return actionFail(error.message);
  }
  if (!data) return actionFail('Pattern was not created.');

  revalidatePatternSurfaces();
  return actionOk({ id: data.id, name: data.name });
}

/** Edit one pattern in place. Skill and domain are editable — a
 *  pattern filed under the wrong unit should be movable, not
 *  delete-and-retype (its question tags would be lost). */
export async function updateQuestionPattern(
  input: PatternInput & { patternId: string },
): Promise<ActionResult<{ data: { id: string; name: string } }>> {
  if (!input.patternId) return actionFail('patternId required');
  const normalized = normalizeInput(input);
  if (!normalized.ok) return actionFail(normalized.error);
  const { domainCode, skillCode, name, recognitionCue, processSummary } = normalized.value;

  let ctx;
  try {
    ctx = await adminCtx();
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error');
  }
  const { supabase } = ctx;

  const sequence = normalized.value.sequence ?? (await nextSequence(supabase, domainCode, skillCode));

  const { data, error } = await supabase
    .from('question_patterns')
    .update({
      domain_code: domainCode,
      skill_code: skillCode,
      name,
      recognition_cue: recognitionCue,
      process_summary: processSummary,
      sequence,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.patternId)
    .select('id, name')
    .maybeSingle();

  if (error) {
    if (error.code === '23505') {
      return actionFail(`"${name}" already exists for ${skillCode}.`);
    }
    return actionFail(error.message);
  }
  if (!data) return actionFail('Pattern not found.');

  revalidatePatternSurfaces();
  return actionOk({ id: data.id, name: data.name });
}

/**
 * Delete a pattern. The FKs do the rest, asymmetrically and on
 * purpose (migration 20260727190000): tagged questions fall back to
 * unclassified (set null), while lesson_topics rows pointing at it are
 * removed (cascade), because a scope tag without its pattern means
 * nothing. Counts are read first so the confirm dialog can say what
 * the delete will actually cost.
 */
export async function deleteQuestionPattern({
  patternId,
}: {
  patternId: string;
}): Promise<ActionResult<{ data: { name: string; questions: number; lessonTags: number } }>> {
  if (!patternId) return actionFail('patternId required');

  let ctx;
  try {
    ctx = await adminCtx();
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error');
  }
  const { supabase } = ctx;

  const [{ count: questions }, { count: lessonTags }] = await Promise.all([
    supabase
      .from('questions_v2')
      .select('id', { count: 'exact', head: true })
      .eq('pattern_id', patternId),
    supabase
      .from('lesson_topics')
      .select('id', { count: 'exact', head: true })
      .eq('pattern_id', patternId),
  ]);

  const { data, error } = await supabase
    .from('question_patterns')
    .delete()
    .eq('id', patternId)
    .select('name')
    .maybeSingle();

  if (error) return actionFail(error.message);
  if (!data) return actionFail('Pattern not found.');

  revalidatePatternSurfaces();
  return actionOk({ name: data.name, questions: questions ?? 0, lessonTags: lessonTags ?? 0 });
}

/**
 * Commit a CSV import.
 *
 * The client previewed the same text against the same planner, but
 * this re-parses and re-plans against rows read here: the preview can
 * be stale (someone else authored a pattern meanwhile) and a client
 * payload is never authoritative. Row-at-a-time writes rather than a
 * bulk insert, so one bad row reports its line instead of failing the
 * whole file.
 */
export async function importQuestionPatterns({
  csv,
  mode,
}: {
  csv: string;
  mode: ImportMode;
}): Promise<ActionResult<{ data: ImportSummary }>> {
  if (!csv || !csv.trim()) return actionFail('Paste or upload a CSV first.');
  if (mode !== 'skip' && mode !== 'update') return actionFail('Unknown import mode.');

  let ctx;
  try {
    ctx = await adminCtx();
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error');
  }
  const { supabase } = ctx;

  const parsed = parsePatternCsv(csv);
  if (parsed.rows.length === 0) {
    const first = parsed.issues[0];
    return actionFail(
      first
        ? `Nothing to import — ${first.line > 0 ? `line ${first.line}: ` : ''}${first.message}`
        : 'Nothing to import — no data rows found.',
    );
  }

  const { data: existingRows, error: readError } = await supabase
    .from('question_patterns')
    .select(PATTERN_SELECT);
  if (readError) return actionFail(readError.message);

  const plan = planPatternImport({
    parsed,
    existing: (existingRows ?? []) as ExistingPattern[],
    mode,
  });

  const issues = [...plan.issues];
  let created = 0;
  let updated = 0;

  for (const item of plan.creates) {
    const { error } = await supabase.from('question_patterns').insert({
      test_type: item.row.testType,
      domain_code: item.row.domainCode,
      skill_code: item.row.skillCode,
      name: item.row.name,
      recognition_cue: item.row.recognitionCue,
      process_summary: item.row.processSummary,
      sequence: item.sequence,
    });
    if (error) {
      issues.push({
        line: item.line,
        message:
          error.code === '23505'
            ? `"${item.row.name}" already exists for ${item.row.skillCode} — re-run with "Update existing" to overwrite it.`
            : error.message,
      });
      continue;
    }
    created += 1;
  }

  for (const item of plan.updates) {
    const { error } = await supabase
      .from('question_patterns')
      .update({
        name: item.row.name,
        recognition_cue: item.row.recognitionCue,
        process_summary: item.row.processSummary,
        sequence: item.sequence,
        updated_at: new Date().toISOString(),
      })
      .eq('id', item.id);
    if (error) {
      issues.push({ line: item.line, message: error.message });
      continue;
    }
    updated += 1;
  }

  if (created > 0 || updated > 0) revalidatePatternSurfaces();

  return actionOk({ created, updated, skipped: plan.skips.length, issues });
}

/** Bump a pattern up or down within its skill by swapping sequences
 *  with its neighbour — the catalog is a teaching order, and reordering
 *  by retyping numbers is how orders get corrupted. */
export async function moveQuestionPattern({
  patternId,
  direction,
}: {
  patternId: string;
  direction: 'up' | 'down';
}): Promise<ActionResult<{ data: { moved: boolean } }>> {
  if (!patternId) return actionFail('patternId required');
  if (direction !== 'up' && direction !== 'down') return actionFail('Unknown direction.');

  let ctx;
  try {
    ctx = await adminCtx();
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error');
  }
  const { supabase } = ctx;

  const { data: current, error: currentError } = await supabase
    .from('question_patterns')
    .select('id, test_type, domain_code, skill_code, sequence')
    .eq('id', patternId)
    .maybeSingle();
  if (currentError) return actionFail(currentError.message);
  if (!current) return actionFail('Pattern not found.');

  // The whole group, not just a neighbour window: a skill holds a
  // handful of patterns, and reading all of them is what makes the
  // renumber below exact. Sorting by (sequence, id) gives a total
  // order even when an import left two rows sharing a sequence — a
  // plain swap of sequence values would be a no-op on such a pair.
  const { data: groupRows, error: groupError } = await supabase
    .from('question_patterns')
    .select('id, sequence')
    .eq('test_type', current.test_type)
    .eq('domain_code', current.domain_code)
    .eq('skill_code', current.skill_code)
    .order('sequence', { ascending: true })
    .order('id', { ascending: true });
  if (groupError) return actionFail(groupError.message);

  const ordered = groupRows ?? [];
  const index = ordered.findIndex((row) => row.id === patternId);
  const swapWith = direction === 'up' ? index - 1 : index + 1;
  if (index === -1 || swapWith < 0 || swapWith >= ordered.length) {
    return actionOk({ moved: false });
  }

  [ordered[index], ordered[swapWith]] = [ordered[swapWith], ordered[index]];

  // Renumber the group 1..n from its new order. This also repairs
  // gaps and duplicate sequences an imported catalog may carry.
  const stamp = new Date().toISOString();
  const writes = ordered
    .map((row, i) => ({ row, position: i + 1 }))
    .filter(({ row, position }) => row.sequence !== position);

  for (const { row, position } of writes) {
    const { error } = await supabase
      .from('question_patterns')
      .update({ sequence: position, updated_at: stamp })
      .eq('id', row.id);
    if (error) return actionFail(error.message);
  }

  revalidatePatternSurfaces();
  return actionOk({ moved: true });
}
