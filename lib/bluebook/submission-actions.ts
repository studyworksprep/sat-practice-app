// Server Actions for Bluebook contributions.
//
// Three ways in, one row out (docs/bluebook-contributions-plan-2026-08.md):
//
//   html_upload   the contributor uploads the saved score report; the
//                 server parses it and derives everything but the
//                 scaled scores, which the report's Details view
//                 doesn't carry.
//   attempt_link  the student took the test in Studyworks and the tutor
//                 keyed the same answers into Bluebook. The answer
//                 vector comes off the stored attempt — no re-entry —
//                 and an uploaded report is cross-checked against it
//                 question by question.
//   manual_grid   the exception-only grid. The contributor supplies the
//                 vector; the DB trigger checksums it against the
//                 declared per-module counts.
//
// Who may do what:
//   create   staff or the contributor role, writing as themselves. The
//            RLS INSERT policy pins contributor_id to auth.uid() and
//            forces status='pending', so a submission cannot be born
//            verified.
//   review   staff, and never on their own submission — the policy
//            carries contributor_id <> auth.uid().
//   promote  manager/admin only, through the service role, because
//            score_conversion is admin-write. This is the only path
//            that writes the calibration table; contributors never
//            touch it directly.

'use server';

import { randomUUID } from 'node:crypto';
import { requireRole, requireServiceRole } from '@/lib/api/auth';
import { actionOk, actionFail, ApiError } from '@/lib/api/response';
import type { ActionResult } from '@/lib/types';
import {
  parseBluebookReport,
  toResponseVector,
  BluebookParseError,
  type ResponseVector,
} from './parse-report.ts';
import { loadAttemptVector, diffResponseVectors, type VectorDiff } from './attempt-vector.ts';
import { tallyRecord, evaluateAutoVerify } from './contributor-trust.ts';

const ARTIFACT_BUCKET = 'bluebook-reports';

/** Mirrors the DB's can_contribute(): staff, or the contributor role. */
const CONTRIBUTOR_ROLES = ['teacher', 'manager', 'admin', 'contributor'] as const;
const STAFF_ROLES = ['teacher', 'manager', 'admin'] as const;
/** Promotion writes ground truth, so it sits a rung above review. */
const PROMOTER_ROLES = ['manager', 'admin'] as const;

export interface SectionScores {
  rwScaled?: number | null;
  mathScaled?: number | null;
}

export interface SubmissionMeta extends SectionScores {
  /** Contributor-private pseudonym. Never a real name — the UI says so
   *  and the column comment says so; there is no way to enforce it. */
  subjectLabel?: string | null;
  /** When the Bluebook test was taken. Used to spot format revisions. */
  reportDate?: string | null;
}

// ── shared validation ─────────────────────────────────────────────

function scaledScoreProblem(label: string, value: number | null | undefined): string | null {
  if (value == null) return null;
  if (!Number.isInteger(value) || value < 200 || value > 800) {
    return `${label} must be a whole number between 200 and 800`;
  }
  // College Board reports on a 10-point grid; anything else is a typo.
  if (value % 10 !== 0) return `${label} must be a multiple of 10`;
  return null;
}

function validateScores(meta: SectionScores): string | null {
  for (const [label, value] of [
    ['Reading & Writing scaled score', meta.rwScaled],
    ['Math scaled score', meta.mathScaled],
  ] as const) {
    const problem = scaledScoreProblem(label, value);
    if (problem) return problem;
  }
  if (meta.rwScaled == null && meta.mathScaled == null) {
    return 'Enter at least one section score — a submission with no official score has nothing to calibrate against';
  }
  return null;
}

function countCorrect(vector: ResponseVector, key: 'RW1' | 'RW2' | 'MATH1' | 'MATH2'): number | null {
  const entries = vector[key];
  if (!entries) return null;
  return Object.values(entries).filter((entry) => entry.correct).length;
}

/** Postgres errors from the validation trigger are already written for
 *  humans; the raw prefix is not. */
function tidyDbError(message: string): string {
  return message.replace(/^bluebook_submissions:\s*/, '');
}

// ── flow B: cross-check before submitting ─────────────────────────

export interface CrossCheckResult {
  diff: VectorDiff;
  testName: string;
  reportTestName: string;
  attemptCounts: { rw: { m1: number; m2: number }; math: { m1: number; m2: number } };
  reportCounts: { rw: { m1: number; m2: number }; math: { m1: number; m2: number } };
}

/**
 * Compare a Bluebook report against what the student actually did in the
 * app. Read-only — this is the "did the keying slip?" check the tutor
 * runs before committing to a submission.
 */
export async function crossCheckAttempt(input: {
  attemptId: string;
  html: string;
}): Promise<ActionResult<{ data: CrossCheckResult | null }>> {
  let ctx;
  try {
    ctx = await requireRole([...CONTRIBUTOR_ROLES]);
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error');
  }

  if (!input?.attemptId) return actionFail('attemptId required');
  if (typeof input.html !== 'string' || !input.html.trim()) {
    return actionFail('No report contents were sent');
  }

  // The user client, deliberately: RLS decides whether this caller may
  // see the attempt at all, so a contributor with no roster gets the
  // same answer as a nonexistent attempt.
  const attemptVector = await loadAttemptVector(ctx.supabase, input.attemptId);
  if (!attemptVector) return actionFail('Attempt not found');

  let parsed;
  try {
    parsed = parseBluebookReport(input.html);
  } catch (err) {
    if (err instanceof BluebookParseError) return actionFail(err.message);
    throw err;
  }

  const reportVector = toResponseVector(parsed);

  return actionOk({
    diff: diffResponseVectors(attemptVector.responses, reportVector),
    testName: attemptVector.testName,
    reportTestName: parsed.testName,
    attemptCounts: {
      rw: { m1: attemptVector.counts.rw.m1, m2: attemptVector.counts.rw.m2 },
      math: { m1: attemptVector.counts.math.m1, m2: attemptVector.counts.math.m2 },
    },
    reportCounts: {
      rw: { m1: parsed.correctCounts.rw.m1, m2: parsed.correctCounts.rw.m2 },
      math: { m1: parsed.correctCounts.math.m1, m2: parsed.correctCounts.math.m2 },
    },
  });
}

// ── flow B: the Bluebook entry view ───────────────────────────────

export interface AttemptEntryView {
  attemptId: string;
  testName: string;
  practiceTestId: string;
  finishedAt: string | null;
  counts: { rw: { m1: number; m2: number }; math: { m1: number; m2: number } };
  routes: { rw: 'easy' | 'hard' | null; math: 'easy' | 'hard' | null };
  modules: Array<{
    key: string;
    label: string;
    answers: Array<{ ordinal: number; response: string | null }>;
  }>;
}

const MODULE_LABELS: Record<string, string> = {
  RW1: 'Reading & Writing · Module 1',
  RW2: 'Reading & Writing · Module 2',
  MATH1: 'Math · Module 1',
  MATH2: 'Math · Module 2',
};

/**
 * The attempt's answers, ordered for transcription into Bluebook.
 *
 * This exists because the slow, error-prone part of flow B isn't the
 * software — it's a human copying 98 answers into another application.
 * Returning them grouped and in order, with correctness deliberately
 * left out, gives the tutor something to read straight down without
 * losing their place or being tempted to "fix" an answer on the way in.
 */
export async function loadAttemptEntryView(input: {
  attemptId: string;
}): Promise<ActionResult<{ data: AttemptEntryView | null }>> {
  let ctx;
  try {
    ctx = await requireRole([...CONTRIBUTOR_ROLES]);
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error');
  }

  if (!input?.attemptId) return actionFail('attemptId required');

  const vector = await loadAttemptVector(ctx.supabase, input.attemptId);
  if (!vector) return actionFail('Attempt not found');

  return actionOk({
    attemptId: vector.attemptId,
    testName: vector.testName,
    practiceTestId: vector.practiceTestId,
    finishedAt: vector.finishedAt,
    counts: {
      rw: { m1: vector.counts.rw.m1, m2: vector.counts.rw.m2 },
      math: { m1: vector.counts.math.m1, m2: vector.counts.math.m2 },
    },
    routes: vector.routes,
    modules: vector.modules.map((m) => ({
      key: m.key,
      label: MODULE_LABELS[m.key] ?? m.key,
      answers: m.items.map((i) => ({ ordinal: i.ordinal, response: i.response })),
    })),
  });
}

// ── create ────────────────────────────────────────────────────────

export interface CreatedSubmission {
  submissionId: string;
  status: string;
  validationFlags: unknown[];
  /** True when the trust rule accepted it without a reviewer. */
  autoVerified?: boolean;
}

interface SubmissionRow {
  id: string;
  contributor_id: string;
  practice_test_id: string;
  entry_method: 'html_upload' | 'attempt_link' | 'manual_grid';
  attempt_id: string | null;
  rw_m1_correct: number | null;
  rw_m2_correct: number | null;
  rw_m2_route: string | null;
  rw_scaled: number | null;
  math_m1_correct: number | null;
  math_m2_correct: number | null;
  math_m2_route: string | null;
  math_scaled: number | null;
  responses: ResponseVector;
  subject_label: string | null;
  report_date: string | null;
  html_artifact_path: string | null;
}

/**
 * Flow A — the contributor uploads the saved score report.
 *
 * The report is parsed here and stored in the private artifact bucket
 * before the row lands, so a verified submission always has the evidence
 * behind it. Scaled scores are typed: Bluebook's Details export shows
 * per-question results, not the 200–800 section scores.
 */
export async function createHtmlUploadSubmission(input: {
  practiceTestId: string;
  html: string;
  meta: SubmissionMeta;
}): Promise<ActionResult<{ data: CreatedSubmission | null }>> {
  let ctx;
  try {
    ctx = await requireRole([...CONTRIBUTOR_ROLES]);
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error');
  }

  if (!input?.practiceTestId) return actionFail('Select a practice test');
  if (typeof input.html !== 'string' || !input.html.trim()) {
    return actionFail('No report contents were sent');
  }
  const scoreProblem = validateScores(input.meta ?? {});
  if (scoreProblem) return actionFail(scoreProblem);

  let parsed;
  try {
    parsed = parseBluebookReport(input.html);
  } catch (err) {
    if (err instanceof BluebookParseError) return actionFail(err.message);
    throw err;
  }

  const responses = toResponseVector(parsed);
  const submissionId = randomUUID();
  const artifactPath = `${ctx.user.id}/${submissionId}.html`;

  // Artifact first. A row whose html_artifact_path points at nothing is
  // worse than an orphaned object: the trigger lets an html_upload reach
  // 'verified' only when the path is set, and that promise has to be
  // worth something.
  const { error: uploadErr } = await ctx.supabase.storage
    .from(ARTIFACT_BUCKET)
    .upload(artifactPath, new Blob([input.html], { type: 'text/html' }), {
      contentType: 'text/html',
      upsert: false,
    });
  if (uploadErr) return actionFail(`Could not store the report: ${uploadErr.message}`);

  const row: SubmissionRow = {
    id: submissionId,
    contributor_id: ctx.user.id,
    practice_test_id: input.practiceTestId,
    entry_method: 'html_upload',
    attempt_id: null,
    rw_m1_correct: countCorrect(responses, 'RW1'),
    rw_m2_correct: countCorrect(responses, 'RW2'),
    rw_m2_route: null,
    rw_scaled: input.meta.rwScaled ?? null,
    math_m1_correct: countCorrect(responses, 'MATH1'),
    math_m2_correct: countCorrect(responses, 'MATH2'),
    math_m2_route: null,
    math_scaled: input.meta.mathScaled ?? null,
    responses,
    subject_label: input.meta.subjectLabel?.trim() || null,
    report_date: input.meta.reportDate ?? parsed.reportDate ?? null,
    html_artifact_path: artifactPath,
  };

  const created = await insertSubmission(ctx.supabase, row);
  if (!created.ok) {
    // Roll the artifact back so a failed attempt doesn't leave evidence
    // for a submission that doesn't exist.
    await ctx.supabase.storage.from(ARTIFACT_BUCKET).remove([artifactPath]);
  }
  return created.result;
}

/**
 * Flow B — a submission that corroborates an in-app attempt.
 *
 * The answer vector is the attempt's; the contributor re-enters nothing.
 * The only new information is the official scaled scores, and optionally
 * the report itself.
 *
 * When a report is attached it must agree with the attempt question by
 * question. A disagreement is refused rather than recorded: it means the
 * answers keyed into Bluebook aren't the answers the student gave, so
 * the official scores describe a different test-taking than the one this
 * submission claims to be about. A contributor who trusts the report
 * over the app should submit it through flow A, where the report's own
 * vector is the one stored.
 */
export async function createAttemptLinkedSubmission(input: {
  attemptId: string;
  meta: SubmissionMeta;
  html?: string | null;
}): Promise<ActionResult<{ data: (CreatedSubmission & { diff?: VectorDiff }) | null }>> {
  let ctx;
  try {
    ctx = await requireRole([...CONTRIBUTOR_ROLES]);
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error');
  }

  if (!input?.attemptId) return actionFail('attemptId required');
  const scoreProblem = validateScores(input.meta ?? {});
  if (scoreProblem) return actionFail(scoreProblem);

  const attemptVector = await loadAttemptVector(ctx.supabase, input.attemptId);
  if (!attemptVector) return actionFail('Attempt not found');

  let artifactPath: string | null = null;
  const submissionId = randomUUID();
  const hasHtml = typeof input.html === 'string' && input.html.trim().length > 0;

  if (hasHtml) {
    let parsed;
    try {
      parsed = parseBluebookReport(input.html as string);
    } catch (err) {
      if (err instanceof BluebookParseError) return actionFail(err.message);
      throw err;
    }

    const diff = diffResponseVectors(attemptVector.responses, toResponseVector(parsed));
    if (!diff.matches) {
      const n = diff.disagreements.length;
      return actionFail(
        `The report disagrees with the in-app attempt on ${n} question${n === 1 ? '' : 's'}. ` +
        `That usually means an answer was mis-keyed into Bluebook. Fix the keying and re-export, ` +
        `or submit the report on its own if you believe it over the app.`,
      );
    }

    artifactPath = `${ctx.user.id}/${submissionId}.html`;
    const { error: uploadErr } = await ctx.supabase.storage
      .from(ARTIFACT_BUCKET)
      .upload(artifactPath, new Blob([input.html as string], { type: 'text/html' }), {
        contentType: 'text/html',
        upsert: false,
      });
    if (uploadErr) return actionFail(`Could not store the report: ${uploadErr.message}`);
  }

  const row: SubmissionRow = {
    id: submissionId,
    contributor_id: ctx.user.id,
    practice_test_id: attemptVector.practiceTestId,
    entry_method: 'attempt_link',
    attempt_id: attemptVector.attemptId,
    rw_m1_correct: countCorrect(attemptVector.responses, 'RW1'),
    rw_m2_correct: countCorrect(attemptVector.responses, 'RW2'),
    rw_m2_route: attemptVector.routes.rw,
    rw_scaled: input.meta.rwScaled ?? null,
    math_m1_correct: countCorrect(attemptVector.responses, 'MATH1'),
    math_m2_correct: countCorrect(attemptVector.responses, 'MATH2'),
    math_m2_route: attemptVector.routes.math,
    math_scaled: input.meta.mathScaled ?? null,
    responses: attemptVector.responses,
    subject_label: input.meta.subjectLabel?.trim() || null,
    report_date: input.meta.reportDate ?? null,
    html_artifact_path: artifactPath,
  };

  const created = await insertSubmission(ctx.supabase, row);
  if (!created.ok && artifactPath) {
    await ctx.supabase.storage.from(ARTIFACT_BUCKET).remove([artifactPath]);
  }
  return created.result;
}

/**
 * Flow C — the exception-only grid.
 *
 * The contributor declares the per-module correct counts from the score
 * report summary, then flips the wrong answers. The grid refuses to
 * submit until the flips match the counts, and the DB trigger checks the
 * same thing again: the client-side checksum is an affordance, the
 * trigger is the guarantee.
 */
export async function createManualGridSubmission(input: {
  practiceTestId: string;
  responses: ResponseVector;
  counts: {
    rwM1?: number | null;
    rwM2?: number | null;
    mathM1?: number | null;
    mathM2?: number | null;
  };
  routes?: { rw?: 'easy' | 'hard' | null; math?: 'easy' | 'hard' | null };
  meta: SubmissionMeta;
}): Promise<ActionResult<{ data: CreatedSubmission | null }>> {
  let ctx;
  try {
    ctx = await requireRole([...CONTRIBUTOR_ROLES]);
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error');
  }

  if (!input?.practiceTestId) return actionFail('Select a practice test');
  const scoreProblem = validateScores(input.meta ?? {});
  if (scoreProblem) return actionFail(scoreProblem);

  const responses = input.responses ?? {};
  if (!Object.keys(responses).length) {
    return actionFail('Mark the questions that were answered incorrectly before submitting');
  }

  const row: SubmissionRow = {
    id: randomUUID(),
    contributor_id: ctx.user.id,
    practice_test_id: input.practiceTestId,
    entry_method: 'manual_grid',
    attempt_id: null,
    rw_m1_correct: input.counts?.rwM1 ?? null,
    rw_m2_correct: input.counts?.rwM2 ?? null,
    rw_m2_route: input.routes?.rw ?? null,
    rw_scaled: input.meta.rwScaled ?? null,
    math_m1_correct: input.counts?.mathM1 ?? null,
    math_m2_correct: input.counts?.mathM2 ?? null,
    math_m2_route: input.routes?.math ?? null,
    math_scaled: input.meta.mathScaled ?? null,
    responses,
    subject_label: input.meta.subjectLabel?.trim() || null,
    report_date: input.meta.reportDate ?? null,
    html_artifact_path: null,
  };

  return (await insertSubmission(ctx.supabase, row)).result;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function insertSubmission(
  supabase: any,
  row: SubmissionRow,
): Promise<{ ok: boolean; result: ActionResult<{ data: CreatedSubmission | null }> }> {
  const { data, error } = await supabase
    .from('bluebook_submissions')
    .insert(row)
    .select('id, status, validation_flags')
    .single();

  if (error) {
    return { ok: false, result: actionFail(tidyDbError(error.message)) };
  }

  const validationFlags = (data.validation_flags ?? []) as unknown[];
  const autoVerified = await maybeAutoVerify({
    submissionId: data.id as string,
    contributorId: row.contributor_id,
    hasArtifact: Boolean(row.html_artifact_path),
    validationFlags,
  });

  return {
    ok: true,
    result: actionOk({
      submissionId: data.id as string,
      status: autoVerified ? 'verified' : (data.status as string),
      validationFlags,
      autoVerified,
    }),
  };
}

/**
 * Apply the trust rule to a freshly created submission.
 *
 * Runs after the insert rather than as part of it because the RLS INSERT
 * policy pins new rows to status='pending' — a submission cannot be born
 * verified, which is the property that makes "verified" mean anything.
 * Lifting it afterwards is a separate, auditable act.
 *
 * It needs the service role, and the reason is the point of the design:
 * a contributor has NO update policy on their own submissions. The only
 * UPDATE policy is the staff one, and it excludes your own rows. So the
 * caller's own client cannot perform this write — the update would
 * silently match zero rows — and that is correct. Nobody, including the
 * contributor, may move their own submission to verified. The rule can,
 * because the rule is not them.
 *
 * Any failure leaves the submission pending, which is the right way to
 * fail: a reviewer sees one more item and nothing has been trusted that
 * shouldn't have been.
 */
async function maybeAutoVerify(input: {
  submissionId: string;
  contributorId: string;
  hasArtifact: boolean;
  validationFlags: unknown[];
}): Promise<boolean> {
  // Cheapest disqualifier first: no artifact, no rule, no bypass.
  if (!input.hasArtifact) return false;

  let svc;
  try {
    ({ service: svc } = await requireServiceRole(
      'apply the Bluebook auto-verification rule — a contributor has no UPDATE policy on their own submissions, by design',
    ));
  } catch {
    return false;
  }

  const { data: history, error } = await svc
    .from('bluebook_submissions')
    .select('status')
    .eq('contributor_id', input.contributorId)
    .neq('id', input.submissionId);
  if (error) return false;

  const verdict = evaluateAutoVerify({
    hasArtifact: input.hasArtifact,
    validationFlags: input.validationFlags,
    record: tallyRecord((history ?? []) as Array<{ status: string }>),
  });
  if (!verdict.autoVerify) return false;

  // auto_verified_at is what lets the DB trigger accept a verified row
  // with no reviewer; without it this update is refused outright. The
  // status guard keeps a concurrent human review from being clobbered.
  const { data: updated } = await svc
    .from('bluebook_submissions')
    .update({ status: 'verified', auto_verified_at: new Date().toISOString() })
    .eq('id', input.submissionId)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();

  return Boolean(updated);
}

// ── review ────────────────────────────────────────────────────────

/**
 * Verify or reject a pending submission.
 *
 * Runs on the caller's own client so the RLS policy applies, which is
 * what stops a tutor rubber-stamping their own contribution — the policy
 * carries contributor_id <> auth.uid() and the update simply matches
 * zero rows.
 */
export async function reviewSubmission(input: {
  submissionId: string;
  decision: 'verified' | 'rejected';
  note?: string | null;
}): Promise<ActionResult<{ data: { status: string } | null }>> {
  let ctx;
  try {
    ctx = await requireRole([...STAFF_ROLES]);
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error');
  }

  if (!input?.submissionId) return actionFail('submissionId required');
  if (input.decision !== 'verified' && input.decision !== 'rejected') {
    return actionFail('decision must be "verified" or "rejected"');
  }

  const { data, error } = await ctx.supabase
    .from('bluebook_submissions')
    .update({
      status: input.decision,
      reviewed_by: ctx.user.id,
      reviewed_at: new Date().toISOString(),
      review_note: input.note?.trim() || null,
    })
    .eq('id', input.submissionId)
    .eq('status', 'pending')
    .select('id, status')
    .maybeSingle();

  if (error) return actionFail(tidyDbError(error.message));
  if (!data) {
    return actionFail(
      'Nothing to review — the submission has already been reviewed, or it is your own (reviewers cannot verify their own submissions)',
    );
  }

  return actionOk({ status: data.status as string });
}

/**
 * A short-lived link to a submission's stored report.
 *
 * Signed rather than public, and returned as a download rather than a
 * page: the artifact is untrusted HTML supplied by the contributor, so
 * the one thing a reviewer must not do is open it as a document in the
 * same origin as the app. Storage RLS still gates the request — this
 * only mints a URL for a file the caller could already read.
 */
export async function artifactDownloadUrl(input: {
  submissionId: string;
}): Promise<ActionResult<{ data: { url: string } | null }>> {
  let ctx;
  try {
    ctx = await requireRole([...STAFF_ROLES]);
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error');
  }

  if (!input?.submissionId) return actionFail('submissionId required');

  const { data: submission } = await ctx.supabase
    .from('bluebook_submissions')
    .select('id, html_artifact_path')
    .eq('id', input.submissionId)
    .maybeSingle();

  if (!submission?.html_artifact_path) {
    return actionFail('This submission has no stored report');
  }

  const { data, error } = await ctx.supabase.storage
    .from(ARTIFACT_BUCKET)
    .createSignedUrl(submission.html_artifact_path, 300, { download: true });

  if (error || !data?.signedUrl) {
    return actionFail(error?.message ?? 'Could not create a link to the report');
  }
  return actionOk({ url: data.signedUrl });
}

// ── promote ───────────────────────────────────────────────────────

export interface PromotionResult {
  conversionsWritten: number;
  conflictsSkipped: Array<{
    section: string;
    module1Correct: number;
    module2Correct: number;
    existingScaled: number;
    submittedScaled: number;
  }>;
}

/**
 * Write a verified submission's section curves into score_conversion.
 *
 * The only code path that writes calibration ground truth. Two rules it
 * will not bend:
 *
 *   * It never overwrites a conflicting curve. If a row already exists
 *     for this (test, section, m1, m2) at a different scaled score, that
 *     section is skipped and reported — two official reports disagreeing
 *     is a question for a human, and silently taking the newer one would
 *     destroy the evidence that they disagreed.
 *   * Every row it writes carries submission_id. A conversion row
 *     without provenance is indistinguishable from one the estimator
 *     produced, and a row that predates an app-scored attempt may be the
 *     row that estimator read — so matching counts prove nothing. Only
 *     the explicit link counts.
 */
export async function promoteSubmission(input: {
  submissionId: string;
}): Promise<ActionResult<{ data: PromotionResult | null }>> {
  let ctx;
  try {
    ctx = await requireServiceRole(
      'promote a verified Bluebook submission into score_conversion (admin-write table)',
      { allowedRoles: [...PROMOTER_ROLES] },
    );
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error');
  }

  if (!input?.submissionId) return actionFail('submissionId required');

  const { data: submission, error: loadErr } = await ctx.service
    .from('bluebook_submissions')
    .select(
      `id, contributor_id, status, practice_test_id,
       rw_m1_correct, rw_m2_correct, rw_scaled,
       math_m1_correct, math_m2_correct, math_scaled`,
    )
    .eq('id', input.submissionId)
    .maybeSingle();

  if (loadErr) return actionFail(loadErr.message);
  if (!submission) return actionFail('Submission not found');
  if (submission.status !== 'verified') {
    return actionFail(`Only a verified submission can be promoted (this one is ${submission.status})`);
  }
  // The service role bypasses the RLS self-review guard, so the same
  // rule is restated here. Promoting your own submission is exactly the
  // hole the review step exists to close.
  if (submission.contributor_id === ctx.user.id) {
    return actionFail('You cannot promote your own submission');
  }

  const { data: test } = await ctx.service
    .from('practice_tests_v2')
    .select('name')
    .eq('id', submission.practice_test_id)
    .maybeSingle();

  // A section is promotable only with all three of (m1, m2, scaled): the
  // conversion key is the pair of module counts, and a scaled score
  // without them has nothing to be keyed by.
  interface PromotableSection {
    section: 'reading_writing' | 'math';
    m1: number;
    m2: number;
    scaled: number;
  }
  const sections: PromotableSection[] = [];
  for (const candidate of [
    {
      section: 'reading_writing' as const,
      m1: submission.rw_m1_correct,
      m2: submission.rw_m2_correct,
      scaled: submission.rw_scaled,
    },
    {
      section: 'math' as const,
      m1: submission.math_m1_correct,
      m2: submission.math_m2_correct,
      scaled: submission.math_scaled,
    },
  ]) {
    if (candidate.m1 == null || candidate.m2 == null || candidate.scaled == null) continue;
    sections.push({
      section: candidate.section,
      m1: candidate.m1,
      m2: candidate.m2,
      scaled: candidate.scaled,
    });
  }

  if (!sections.length) {
    return actionFail(
      'This submission has no section with a complete (module 1, module 2, scaled score) triple to promote',
    );
  }

  const conflictsSkipped: PromotionResult['conflictsSkipped'] = [];
  let conversionsWritten = 0;

  for (const s of sections) {
    const { data: existing } = await ctx.service
      .from('score_conversion')
      .select('id, scaled_score')
      .eq('test_id', submission.practice_test_id)
      .eq('section', s.section)
      .eq('module1_correct', s.m1)
      .eq('module2_correct', s.m2)
      .maybeSingle();

    if (existing && existing.scaled_score !== s.scaled) {
      conflictsSkipped.push({
        section: s.section,
        module1Correct: s.m1,
        module2Correct: s.m2,
        existingScaled: existing.scaled_score as number,
        submittedScaled: s.scaled,
      });
      // Leave the flag the validation trigger set; it is what surfaces
      // this row in the admin queue.
      continue;
    }

    const { error: upsertErr } = await ctx.service.from('score_conversion').upsert(
      {
        test_id: submission.practice_test_id,
        test_name: test?.name ?? 'Practice Test',
        section: s.section,
        module1_correct: s.m1,
        module2_correct: s.m2,
        scaled_score: s.scaled,
        submission_id: submission.id,
      },
      { onConflict: 'test_id,section,module1_correct,module2_correct' },
    );
    if (upsertErr) return actionFail(`Could not write the conversion row: ${upsertErr.message}`);
    conversionsWritten += 1;
  }

  // Mark the submission promoted even when every section was a conflict:
  // it has been through review and acted on, and leaving it 'verified'
  // would park it in the queue forever. The skipped conflicts are
  // returned to the caller and stay flagged on score_conversion.
  const { error: statusErr } = await ctx.service
    .from('bluebook_submissions')
    .update({ status: 'promoted', promoted_at: new Date().toISOString() })
    .eq('id', submission.id)
    .eq('status', 'verified');
  if (statusErr) return actionFail(tidyDbError(statusErr.message));

  return actionOk({ conversionsWritten, conflictsSkipped });
}
