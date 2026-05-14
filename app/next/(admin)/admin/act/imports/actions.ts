// Server Actions for the ACT test-import pipeline.
//
// PR 10a's scope: create + delete jobs and upload source files
// into the act-imports private bucket. The per-section parser
// actions (Claude vision over the uploaded PDFs) land in PR 10b;
// the review + approve flow lands in PR 10c.
//
// Files are stored under act-imports/{jobId}/<original-name> so
// the bucket layout matches the job-id namespace and a cascade-
// delete on the job row can clean up storage in one pass. The
// admin uploads four files in the typical flow:
//   - test.pdf         the whole-test PDF
//   - math.html        Mathpix HTML export of the math section
//   - answer-key.pdf   answer key (per-section ABCD letters)
//   - scale.pdf        raw → scaled conversion table
// Any of them can be skipped; the per-section parser actions
// gate on URL presence so an admin who hasn't uploaded the
// Mathpix HTML can still parse English / Reading / Science from
// the test PDF alone.

'use server';

import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/api/auth';
import { actionFail, actionOk, ApiError } from '@/lib/api/response';
import type { ActionResult } from '@/lib/types';

const BUCKET = 'act-imports';

// Allowed inputs per file slot. The PDF slots stay strict so a
// stray image upload fails loudly; math_html_url accepts both
// .html and .htm.
const ALLOWED: Record<string, RegExp> = {
  test_pdf:     /\.pdf$/i,
  math_html:    /\.html?$/i,
  science_html: /\.html?$/i,
  answer_key:   /\.pdf$/i,
  scale:        /\.pdf$/i,
};

const SIZE_LIMIT = 50 * 1024 * 1024; // 50 MB per file — well above a typical ACT PDF.

/**
 * Create a new import job. Uploads any files present in the
 * form to the act-imports bucket and writes URL columns onto
 * the new job row. Returns the job id via redirect so the
 * admin lands on the status page.
 */
export async function createImportJob(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult | null> {
  let ctx;
  try {
    ctx = await requireRole(['admin']);
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error');
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { user, supabase } = ctx as { user: { id: string }; supabase: any };

  const sourceTest = String(formData.get('source_test') ?? '').trim();
  if (!sourceTest) return actionFail('Source test name required');

  // Validate every present file before doing any uploads so the
  // worst case is a single rejected form, not a half-uploaded job.
  const uploads: Array<{ slot: string; file: File }> = [];
  for (const slot of Object.keys(ALLOWED)) {
    const f = formData.get(slot);
    if (!(f instanceof File) || f.size === 0) continue; // missing slot
    if (!ALLOWED[slot].test(f.name)) {
      return actionFail(`${slot}: unexpected file extension (${f.name})`);
    }
    if (f.size > SIZE_LIMIT) {
      return actionFail(`${slot}: file too large (${Math.round(f.size / 1024 / 1024)} MB > 50 MB limit)`);
    }
    uploads.push({ slot, file: f });
  }

  if (uploads.length === 0) {
    return actionFail('Upload at least one file (test PDF, math HTML, answer key, or scale).');
  }

  // Insert the job row first so we have an id to scope storage
  // paths against. test_pdf_url etc. stay null until the
  // uploads land.
  const { data: job, error: insertErr } = await supabase
    .from('act_import_jobs')
    .insert({
      source_test: sourceTest,
      created_by: user.id,
    })
    .select('id')
    .single();
  if (insertErr || !job) {
    return actionFail(`Could not create job: ${insertErr?.message ?? 'unknown'}`);
  }
  const jobId = (job as { id: string }).id;

  // Upload each file. Store URL pointers back to the job row;
  // we use the bucket-relative path (not a public URL — the
  // bucket is private and reads go through getSignedUrl).
  const urlUpdates: Record<string, string> = {};
  const SLOT_TO_COLUMN: Record<string, string> = {
    test_pdf:     'test_pdf_url',
    math_html:    'math_html_url',
    science_html: 'science_html_url',
    answer_key:   'answer_key_url',
    scale:        'scale_url',
  };

  for (const { slot, file } of uploads) {
    const safeName = file.name.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const path = `${jobId}/${slot}-${safeName}`;
    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { upsert: true, contentType: file.type || undefined });
    if (uploadErr) {
      // Best-effort rollback. Cascade delete on the job removes
      // any uploaded files via the storage policy (admins still
      // need to manually clean orphans if the next call fails;
      // we delete the job row here to keep the listing clean).
      await supabase.from('act_import_jobs').delete().eq('id', jobId);
      return actionFail(`Upload failed (${slot}): ${uploadErr.message}`);
    }
    urlUpdates[SLOT_TO_COLUMN[slot]] = path;
  }

  const { error: updateErr } = await supabase
    .from('act_import_jobs')
    .update(urlUpdates)
    .eq('id', jobId);
  if (updateErr) {
    return actionFail(`Could not save file paths: ${updateErr.message}`);
  }

  redirect(`/admin/act/imports/${jobId}`);
}

/** Delete a job + its drafts + every storage object under its
 *  prefix. Used from the listing page's row action when an
 *  admin wants to clear a failed import without leaving the
 *  bucket cluttered. Drafts cascade-delete via the FK. */
export async function deleteImportJob(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  let ctx;
  try {
    ctx = await requireRole(['admin']);
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error');
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { supabase } = ctx as { supabase: any };

  const jobId = String(formData.get('job_id') ?? '').trim();
  if (!jobId) return actionFail('job_id required');

  // List + remove the bucket prefix. supabase-js list returns
  // the objects under the prefix; remove takes an array of paths.
  const { data: objects } = await supabase.storage.from(BUCKET).list(jobId);
  if (Array.isArray(objects) && objects.length > 0) {
    const paths = objects.map((o: { name: string }) => `${jobId}/${o.name}`);
    await supabase.storage.from(BUCKET).remove(paths);
  }

  const { error } = await supabase.from('act_import_jobs').delete().eq('id', jobId);
  if (error) return actionFail(`Delete failed: ${error.message}`);

  return actionOk();
}
