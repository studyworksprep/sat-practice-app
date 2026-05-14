// Per-section parser Server Actions for the ACT import pipeline.
//
// One action per parseable surface: english, math, reading,
// science, and scale (raw → scaled conversion). Each action
// flips the relevant *_status column to 'running' before
// calling Claude, writes drafts (or score-conversion rows) on
// success, and stamps the status back to 'completed' / 'failed'
// with a structured log entry on log_json.
//
// Re-running a section is a no-op when nothing changed and an
// incremental update otherwise — drafts upsert on the
// (import_job_id, section, source_ordinal) unique constraint, so
// a retry after a fixable parse error overwrites the previous
// attempt rather than appending duplicates.
//
// Notes on robustness:
//   - We tolerate Claude returning fewer questions than
//     expected. The parser writes whatever it returns; the
//     review UI (PR 10c) shows a missing-ordinals warning.
//   - The action does not catch out-of-memory / timeout itself
//     beyond `failed` stamping — Next's default Server Action
//     timeout (~300s on Vercel) is the upper bound. Heavier
//     sections may need a worker queue in PR 10c.

'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/api/auth';
import { actionFail, actionOk, ApiError } from '@/lib/api/response';
import type { ActionResult } from '@/lib/types';
import { parseSection } from '@/lib/act-import/parse-questions';
import { parseScale } from '@/lib/act-import/parse-scale';
import type { ActSection } from '@/lib/practice/act-taxonomy';

interface LogEntry {
  ts: string;
  section: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

async function getJob(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  jobId: string,
): Promise<{
  id: string;
  source_test: string;
  test_pdf_url: string | null;
  math_html_url: string | null;
  science_html_url: string | null;
  answer_key_url: string | null;
  scale_url: string | null;
  log_json: LogEntry[] | null;
} | null> {
  const { data } = await supabase
    .from('act_import_jobs')
    .select(
      'id, source_test, test_pdf_url, math_html_url, science_html_url, answer_key_url, scale_url, log_json',
    )
    .eq('id', jobId)
    .maybeSingle();
  return data ?? null;
}

async function appendLog(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  jobId: string,
  existing: LogEntry[] | null,
  entry: Omit<LogEntry, 'ts'>,
) {
  const next: LogEntry[] = [
    ...(existing ?? []),
    { ...entry, ts: new Date().toISOString() },
  ];
  await supabase.from('act_import_jobs').update({ log_json: next }).eq('id', jobId);
  return next;
}

async function setSectionStatus(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  jobId: string,
  section: ActSection | 'scale',
  status: 'running' | 'completed' | 'failed' | 'skipped',
) {
  const column = section === 'scale' ? 'scale_status' : `${section}_status`;
  const patch: Record<string, string> = { [column]: status };
  // Promote the top-level job status when any section starts/finishes.
  if (status === 'running') patch.status = 'parsing';
  await supabase.from('act_import_jobs').update(patch).eq('id', jobId);
}

async function maybePromoteJobStatus(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  jobId: string,
) {
  // After any section finishes, check whether every section is
  // done (completed or skipped). If so, bump job.status to
  // ready_for_review unless something failed.
  const { data: job } = await supabase
    .from('act_import_jobs')
    .select('english_status, math_status, reading_status, science_status, scale_status')
    .eq('id', jobId)
    .maybeSingle();
  if (!job) return;
  const statuses = [
    job.english_status,
    job.math_status,
    job.reading_status,
    job.science_status,
    job.scale_status,
  ];
  const anyFailed = statuses.includes('failed');
  const allDone = statuses.every((s) => s === 'completed' || s === 'skipped' || s === 'failed');
  if (anyFailed) {
    await supabase.from('act_import_jobs').update({ status: 'failed' }).eq('id', jobId);
  } else if (allDone) {
    await supabase.from('act_import_jobs').update({ status: 'ready_for_review' }).eq('id', jobId);
  }
}

async function parseSectionAction(
  section: ActSection,
  jobId: string,
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

  const job = await getJob(supabase, jobId);
  if (!job) return actionFail('Job not found');
  if (!job.test_pdf_url) {
    return actionFail('Cannot parse: the test PDF has not been uploaded for this job.');
  }

  await setSectionStatus(supabase, jobId, section, 'running');
  let log = await appendLog(supabase, jobId, job.log_json, {
    section,
    level: 'info',
    message: 'Parse started',
  });

  try {
    const { drafts, warnings } = await parseSection({
      supabase,
      jobId,
      sourceTest: job.source_test,
      section,
      testPdfPath: job.test_pdf_url,
      answerKeyPath: job.answer_key_url,
      mathHtmlPath: section === 'math' ? job.math_html_url : null,
      scienceHtmlPath: section === 'science' ? job.science_html_url : null,
    });

    if (drafts.length > 0) {
      // Wipe any prior drafts for this (job, section) before
      // re-inserting so a re-run doesn't accumulate duplicates
      // when the unique constraint somehow misses an ordinal.
      await supabase
        .from('act_question_drafts')
        .delete()
        .eq('import_job_id', jobId)
        .eq('section', section);

      const { error: insertErr } = await supabase
        .from('act_question_drafts')
        .insert(drafts);
      if (insertErr) throw new Error(`Insert drafts failed: ${insertErr.message}`);
    }

    await setSectionStatus(supabase, jobId, section, 'completed');
    log = await appendLog(supabase, jobId, log, {
      section,
      level: warnings.length > 0 ? 'warn' : 'info',
      message: `Parse completed: ${drafts.length} drafts${
        warnings.length > 0 ? ` · ${warnings.length} warnings (${warnings.slice(0, 3).join('; ')})` : ''
      }`,
    });
    await maybePromoteJobStatus(supabase, jobId);
    revalidatePath(`/admin/act/imports/${jobId}`);
    return actionOk({ drafts: drafts.length, warnings: warnings.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await setSectionStatus(supabase, jobId, section, 'failed');
    await appendLog(supabase, jobId, log, {
      section,
      level: 'error',
      message: `Parse failed: ${message}`,
    });
    await maybePromoteJobStatus(supabase, jobId);
    revalidatePath(`/admin/act/imports/${jobId}`);
    return actionFail(message);
  }
}

export async function parseEnglish(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return parseSectionAction('english', String(formData.get('job_id') ?? ''));
}
export async function parseMath(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return parseSectionAction('math', String(formData.get('job_id') ?? ''));
}
export async function parseReading(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return parseSectionAction('reading', String(formData.get('job_id') ?? ''));
}
export async function parseScience(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return parseSectionAction('science', String(formData.get('job_id') ?? ''));
}

export async function parseScaleAction(
  _: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const jobId = String(formData.get('job_id') ?? '');
  let ctx;
  try {
    ctx = await requireRole(['admin']);
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error');
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { supabase } = ctx as { supabase: any };

  const job = await getJob(supabase, jobId);
  if (!job) return actionFail('Job not found');
  if (!job.scale_url) {
    return actionFail('Cannot parse: no scale PDF uploaded for this job.');
  }

  await setSectionStatus(supabase, jobId, 'scale', 'running');
  let log = await appendLog(supabase, jobId, job.log_json, {
    section: 'scale',
    level: 'info',
    message: 'Parse started',
  });

  try {
    const { inserted, warnings } = await parseScale({
      supabase,
      scalePath: job.scale_url,
      sourceTest: job.source_test,
    });
    await setSectionStatus(supabase, jobId, 'scale', 'completed');
    log = await appendLog(supabase, jobId, log, {
      section: 'scale',
      level: warnings.length > 0 ? 'warn' : 'info',
      message: `Parse completed: ${inserted} rows upserted${
        warnings.length > 0 ? ` · ${warnings.length} warnings` : ''
      }`,
    });
    await maybePromoteJobStatus(supabase, jobId);
    revalidatePath(`/admin/act/imports/${jobId}`);
    return actionOk({ inserted, warnings: warnings.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await setSectionStatus(supabase, jobId, 'scale', 'failed');
    await appendLog(supabase, jobId, log, {
      section: 'scale',
      level: 'error',
      message: `Parse failed: ${message}`,
    });
    await maybePromoteJobStatus(supabase, jobId);
    revalidatePath(`/admin/act/imports/${jobId}`);
    return actionFail(message);
  }
}
