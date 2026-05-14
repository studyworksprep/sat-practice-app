// Admin Server Actions for the act_score_conversion table.
//
// The table is keyed by (source_test, section, raw_score) with a
// scaled_score column. Filling it for a form unlocks the ACT
// practice-test results page's scaled scores (today the cached
// scaled fields are null and the page falls back to raw counts —
// see PR 7's act_practice_test_attempts finalize logic).
//
// Two write paths supported:
//   - upsertConversionRows: bulk upsert. The page sends either a
//     manually-edited table or a CSV-parsed array; the action is
//     the same. ON CONFLICT (source_test, section, raw_score) so
//     re-uploading replaces values in place.
//   - deleteConversionTable: wipes every row for one
//     (source_test, section). Lets an admin start over after a
//     bad upload.
//
// Admin-only via requireRole(['admin']) — anyone else returns
// actionFail('Forbidden') from ApiError.toActionResult().

'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/api/auth';
import { actionOk, actionFail, ApiError } from '@/lib/api/response';
import type { ActionResult } from '@/lib/types';

type Section = 'english' | 'math' | 'reading' | 'science';
const SECTIONS = new Set<Section>(['english', 'math', 'reading', 'science']);

async function adminCtx() {
  return requireRole(['admin']);
}

/**
 * Upsert a batch of (raw_score, scaled_score) rows for one
 * (source_test, section). Used by both the inline-table save and
 * the CSV-upload path; the page normalizes either into the same
 * { rows: [{ raw_score, scaled_score }, ...] } payload before
 * calling.
 */
export async function upsertConversionRows(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult<{ data: { upserted: number } }>> {
  let ctx;
  try {
    ctx = await adminCtx();
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error');
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { supabase } = ctx as { supabase: any };

  const sourceTest = String(formData.get('source_test') ?? '').trim();
  const section = String(formData.get('section') ?? '').trim() as Section;
  const rowsJson = String(formData.get('rows') ?? '').trim();

  if (!sourceTest) return actionFail('source_test required');
  if (!SECTIONS.has(section)) return actionFail('section must be english | math | reading | science');
  if (!rowsJson) return actionFail('rows payload required');

  let parsed: unknown;
  try {
    parsed = JSON.parse(rowsJson);
  } catch {
    return actionFail('rows must be valid JSON');
  }
  if (!Array.isArray(parsed)) return actionFail('rows must be a JSON array');

  // Validate + normalize. Anything malformed kills the whole batch
  // so the admin sees a clear error rather than partial writes.
  const rows: Array<{ source_test: string; section: Section; raw_score: number; scaled_score: number }> = [];
  for (const entry of parsed as Array<Record<string, unknown>>) {
    if (!entry || typeof entry !== 'object') {
      return actionFail('Each row must be an object');
    }
    const rawScore = Number(entry.raw_score);
    const scaledScore = Number(entry.scaled_score);
    if (!Number.isInteger(rawScore) || rawScore < 0 || rawScore > 100) {
      return actionFail(`raw_score out of range: ${entry.raw_score}`);
    }
    if (!Number.isInteger(scaledScore) || scaledScore < 1 || scaledScore > 36) {
      return actionFail(`scaled_score out of range: ${entry.scaled_score}`);
    }
    rows.push({
      source_test: sourceTest,
      section,
      raw_score: rawScore,
      scaled_score: scaledScore,
    });
  }

  if (rows.length === 0) {
    return actionFail('No rows to upsert.');
  }

  const { error } = await supabase
    .from('act_score_conversion')
    .upsert(rows, { onConflict: 'source_test,section,raw_score' });
  if (error) return actionFail(`Upsert failed: ${error.message}`);

  revalidatePath('/admin/act/score-conversion');
  return actionOk({ upserted: rows.length });
}

/**
 * Wipe every row for one (source_test, section). Lets an admin
 * start over after a bad upload — re-uploading the same form's
 * section without first clearing would leave stale rows for raw
 * scores not in the new payload.
 */
export async function deleteConversionTable(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  let ctx;
  try {
    ctx = await adminCtx();
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error');
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { supabase } = ctx as { supabase: any };

  const sourceTest = String(formData.get('source_test') ?? '').trim();
  const section = String(formData.get('section') ?? '').trim() as Section;
  if (!sourceTest) return actionFail('source_test required');
  if (!SECTIONS.has(section)) return actionFail('section invalid');

  const { error } = await supabase
    .from('act_score_conversion')
    .delete()
    .eq('source_test', sourceTest)
    .eq('section', section);
  if (error) return actionFail(`Delete failed: ${error.message}`);

  revalidatePath('/admin/act/score-conversion');
  return actionOk();
}

/** Permit creating a brand-new source_test entry by inserting a
 *  placeholder row (raw 0 → some scaled value the admin can edit
 *  in the table immediately). Lets the page show a new form in
 *  its picker before the admin has filled in real values. */
export async function createConversionForm(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  let ctx;
  try {
    ctx = await adminCtx();
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error');
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { supabase } = ctx as { supabase: any };

  const sourceTest = String(formData.get('source_test') ?? '').trim();
  if (!sourceTest) return actionFail('source_test required');

  // No-op if any row already exists for this form — the picker
  // would have surfaced it already; creating again is harmless.
  const { count } = await supabase
    .from('act_score_conversion')
    .select('source_test', { count: 'exact', head: true })
    .eq('source_test', sourceTest);
  if ((count ?? 0) > 0) {
    revalidatePath('/admin/act/score-conversion');
    return actionOk();
  }

  // Seed one row per section with raw 0 → scaled 1 (the ACT
  // floor). The admin overwrites these immediately in the table
  // editor; the seed exists only to make the form discoverable.
  const seed = (['english', 'math', 'reading', 'science'] as Section[]).map((section) => ({
    source_test: sourceTest,
    section,
    raw_score: 0,
    scaled_score: 1,
  }));
  const { error } = await supabase
    .from('act_score_conversion')
    .upsert(seed, { onConflict: 'source_test,section,raw_score' });
  if (error) return actionFail(`Could not create form: ${error.message}`);

  revalidatePath('/admin/act/score-conversion');
  return actionOk();
}
