// GET/POST /api/cron/repace — the weekly re-pacing job (§2.5).
//
// Iterates every ACTIVE study plan and runs the shared re-pace
// orchestration (lib/plan/repace-runner.ts) per student:
//
//   - no meaningful drift → no-op (the common case)
//   - drifted + student has an assigned tutor → the regenerated plan is
//     left as a DRAFT on the tutor's Study Plan page for review (the
//     roster's Plan column flags it) — regeneration never bypasses the
//     tutor
//   - drifted + self-serve student → the draft is activated immediately
//     ("the app acting as the tutor"); the Today page tells the student
//     their plan was updated (system drafts carry created_by = null)
//
// Auth: Vercel Cron invokes GET with Authorization: Bearer CRON_SECRET
// (same contract as /api/admin/sync-lessonworks); an admin session may
// also trigger it manually (POST from a tool, or GET in the browser)
// and may pass ?threshold=N to override the drift threshold when
// testing. Schedule lives in vercel.json (Mondays 11:00 UTC).
//
// Service role: this is a system-context cron with no authenticated
// caller for the scheduled path, so it uses createServiceClient()
// directly (sanctioned pattern — docs/database.md "Safe service-role
// usage"); the structured service_role_bypass log below keeps audit
// parity with requireServiceRole.

import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/api/auth';
import { legacyApiRoute } from '@/lib/api/response';
import { logger } from '@/lib/api/logger';
import { createServiceClient } from '@/lib/supabase/server';
import { hasAssignedTutor } from '@/lib/api/hasAssignedTutor';
import { runRepaceForStudent } from '@/lib/plan/repace-runner';

export const dynamic = 'force-dynamic';

async function handleRepace(request: Request): Promise<NextResponse> {
  const cronSecret = request.headers.get('authorization')?.replace('Bearer ', '');
  const isCron = Boolean(cronSecret && cronSecret === process.env.CRON_SECRET);
  if (!isCron) {
    await requireRole(['admin']);
  }

  const url = new URL(request.url);
  const thresholdParam = url.searchParams.get('threshold');
  const driftThreshold =
    thresholdParam != null && Number.isFinite(Number(thresholdParam))
      ? Number(thresholdParam)
      : undefined;

  const svc = createServiceClient();
  logger.info(
    {
      event: 'service_role_bypass',
      reason: 'weekly plan re-pace cron',
      user_id: null,
      caller_role: isCron ? 'cron' : 'admin',
    },
    'service_role_bypass',
  );

  const { data: plans, error } = await svc
    .from('study_plans')
    .select('id, student_id, test_type')
    .eq('status', 'active');
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const results = [];
  let repaced = 0;
  let applied = 0;
  let failed = 0;

  // Serial on purpose: ~1 plan per active student at current scale, and
  // each run is a handful of queries — no need to parallelize, and the
  // generator work is trivial. Revisit if active plans reach the hundreds.
  for (const plan of plans ?? []) {
    const tutored = await hasAssignedTutor(svc, plan.student_id);
    const r = await runRepaceForStudent(svc, {
      studentId: plan.student_id,
      testType: plan.test_type as 'sat' | 'act',
      createdBy: null, // system-authored — the Today page keys off this
      autoApply: !tutored,
      today,
      driftThreshold,
    });
    if (!r.ok) failed++;
    if (r.repaced) repaced++;
    if (r.applied) applied++;
    results.push({
      studentId: plan.student_id,
      testType: plan.test_type,
      tutored,
      ok: r.ok,
      repaced: r.repaced,
      applied: r.applied ?? false,
      driftPoints: r.driftPoints,
      reason: r.reason,
    });
  }

  const summary = {
    checked: (plans ?? []).length,
    repaced,
    applied,
    draftsForReview: repaced - applied,
    failed,
    today,
    results,
  };
  logger.info({ event: 'plan_repace_cron', ...summary, results: undefined }, 'plan_repace_cron');
  return NextResponse.json(summary);
}

export const GET = legacyApiRoute(handleRepace);
export const POST = legacyApiRoute(handleRepace);
