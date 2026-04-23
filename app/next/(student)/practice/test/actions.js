// Server Actions for the Bluebook-style practice-test runner.
//
// Four actions, each invoked by the client islands below the
// runner:
//
//   startTestAttempt — creates practice_test_attempts_v2 +
//     the first practice_test_module_attempts_v2 (RW module 1,
//     std route). Returns the attempt id; the page.js entry
//     routes the student into it.
//
//   recordItemAnswer — upserts one answer for the current module.
//     Inserts the attempts row (grading happens here, server
//     side) and ties it to practice_test_item_attempts_v2.
//     Idempotent per (module_attempt, item): changing an answer
//     updates the existing attempts row rather than stacking new
//     rows.
//
//   toggleMarkForReview — toggles marked_for_review on the
//     practice_test_item_attempts_v2 row. Creates the row if the
//     student hasn't answered the question yet (so the flag
//     still persists).
//
//   finishModule — closes the current module (records correct
//     count + raw score + finished_at), then creates the next
//     module attempt based on the test's adaptive rules, or if
//     this was the last module, closes the test and scales its
//     score. The return value tells the client where to route.
//
// Timer policy. Clients run a countdown based on
// module_attempt.started_at + module.time_limit_seconds. This
// action trusts the module timestamp, not the wall clock sent by
// the client, so a client with a rewound clock can't extend time.
// A small grace period (15s) absorbs network delay on the last
// submit.

'use server';

import { requireUser } from '@/lib/api/auth';
import { actionFail, ApiError } from '@/lib/api/response';
import { rateLimit } from '@/lib/api/rateLimit';
import { gradeAnswer } from '@/lib/practice-test/grading';
import {
  chooseModule2Route,
  availableRoutes,
  resolveRoute,
} from '@/lib/practice-test/adaptive-routing';
import { scaleSectionScore, compositeScore } from '@/lib/practice-test/scoring';

const GRACE_SECONDS = 15;

// ──────────────────────────────────────────────────────────────
// startTestAttempt
// ──────────────────────────────────────────────────────────────

export async function startTestAttempt(_prev, formData) {
  let ctx;
  try { ctx = await requireUser(); }
  catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error');
  }
  const { user, supabase } = ctx;

  const testId = String(formData.get('testId') ?? '');
  if (!testId) return actionFail('testId required');

  // Rate limit: at most 10 test starts per hour. A student might
  // restart a test after a false start, but 10/hour is far above
  // any legitimate pattern.
  const rl = await rateLimit(`test-start:${user.id}`, { limit: 10, windowMs: 60 * 60_000 });
  if (!rl.ok) return actionFail('Too many test starts. Wait a few minutes.');

  // Validate the test exists and is published.
  const { data: test } = await supabase
    .from('practice_tests_v2')
    .select('id, is_published, deleted_at, is_adaptive')
    .eq('id', testId)
    .maybeSingle();
  if (!test || !test.is_published || test.deleted_at) {
    return actionFail('Test not available');
  }

  // Find the first module (RW, module 1, std route). This is the
  // entry point for every attempt — adaptive routing only affects
  // module 2 within each section.
  const { data: firstModule } = await supabase
    .from('practice_test_modules_v2')
    .select('id, subject_code, module_number, route_code, time_limit_seconds')
    .eq('practice_test_id', testId)
    .eq('subject_code', 'RW')
    .eq('module_number', 1)
    .eq('route_code', 'std')
    .maybeSingle();
  if (!firstModule) {
    return actionFail('This test is missing its first module. Contact support.');
  }

  // Abandon any other in-progress attempt for this user so the
  // state machine stays well-defined: at most one active test per
  // student.
  await supabase
    .from('practice_test_attempts_v2')
    .update({ status: 'abandoned', finished_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('status', 'in_progress');

  const { data: attempt, error: attemptErr } = await supabase
    .from('practice_test_attempts_v2')
    .insert({
      user_id: user.id,
      practice_test_id: testId,
      status: 'in_progress',
      source: 'app',
    })
    .select('id')
    .single();
  if (attemptErr || !attempt) return actionFail(`Start failed: ${attemptErr?.message}`);

  const { data: moduleAttempt, error: moduleErr } = await supabase
    .from('practice_test_module_attempts_v2')
    .insert({
      practice_test_attempt_id: attempt.id,
      practice_test_module_id: firstModule.id,
    })
    .select('id')
    .single();
  if (moduleErr || !moduleAttempt) return actionFail(`Start failed: ${moduleErr?.message}`);

  return {
    ok: true,
    attemptId: attempt.id,
    moduleAttemptId: moduleAttempt.id,
  };
}

// ──────────────────────────────────────────────────────────────
// recordItemAnswer
// ──────────────────────────────────────────────────────────────

export async function recordItemAnswer(_prev, formData) {
  let ctx;
  try { ctx = await requireUser(); }
  catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error');
  }
  const { user, supabase } = ctx;

  const moduleAttemptId = String(formData.get('moduleAttemptId') ?? '');
  const moduleItemId    = String(formData.get('moduleItemId') ?? '');
  const optionId        = formData.get('optionId');
  const responseText    = (formData.get('responseText') ?? '').toString().trim();
  if (!moduleAttemptId || !moduleItemId) return actionFail('Missing ids');

  const { data: moduleAttempt } = await supabase
    .from('practice_test_module_attempts_v2')
    .select(`
      id, finished_at, started_at,
      practice_test_attempt_id,
      practice_test_module:practice_test_modules_v2(time_limit_seconds),
      practice_test_attempt:practice_test_attempts_v2(user_id, status)
    `)
    .eq('id', moduleAttemptId)
    .maybeSingle();
  if (!moduleAttempt) return actionFail('Module not found');
  if (moduleAttempt.practice_test_attempt.user_id !== user.id) return actionFail('Not allowed');
  if (moduleAttempt.finished_at) return actionFail('Module already submitted');
  if (moduleAttempt.practice_test_attempt.status !== 'in_progress') {
    return actionFail('Test is not in progress');
  }

  // Timer check — reject writes past the grace period.
  const elapsed = (Date.now() - new Date(moduleAttempt.started_at).getTime()) / 1000;
  const limit   = moduleAttempt.practice_test_module.time_limit_seconds + GRACE_SECONDS;
  if (elapsed > limit) return actionFail('Time is up for this module');

  // Look up the question via the module-item row. The join gives
  // us the correct_answer we need to grade.
  const { data: moduleItem } = await supabase
    .from('practice_test_module_items_v2')
    .select('id, question:questions_v2(id, question_type, correct_answer)')
    .eq('id', moduleItemId)
    .maybeSingle();
  if (!moduleItem || !moduleItem.question) return actionFail('Question not found');

  const isCorrect = gradeAnswer(moduleItem.question, { optionId, responseText });

  // Check for an existing item-attempt so we can update in place
  // rather than stack new rows when the student changes their mind.
  const { data: existingItem } = await supabase
    .from('practice_test_item_attempts_v2')
    .select('id, attempt_id')
    .eq('practice_test_module_attempt_id', moduleAttemptId)
    .eq('practice_test_module_item_id', moduleItemId)
    .maybeSingle();

  const attemptPatch = {
    is_correct: isCorrect,
    selected_option_id: null,
    response_text: moduleItem.question.question_type === 'spr' ? responseText : (optionId ?? null),
    source: 'practice_test',
  };

  if (existingItem) {
    // Update the linked attempts row in place.
    await supabase
      .from('attempts')
      .update(attemptPatch)
      .eq('id', existingItem.attempt_id);
    return { ok: true, isCorrect, itemAttemptId: existingItem.id };
  }

  // Fresh answer — insert the attempts row, then link it.
  const { data: attemptRow, error: attemptInsertErr } = await supabase
    .from('attempts')
    .insert({
      ...attemptPatch,
      user_id: user.id,
      question_id: moduleItem.question.id,
    })
    .select('id')
    .single();
  if (attemptInsertErr || !attemptRow) return actionFail(`Record failed: ${attemptInsertErr?.message}`);

  const { data: itemRow, error: itemInsertErr } = await supabase
    .from('practice_test_item_attempts_v2')
    .insert({
      practice_test_module_attempt_id: moduleAttemptId,
      practice_test_module_item_id: moduleItemId,
      attempt_id: attemptRow.id,
    })
    .select('id')
    .single();
  if (itemInsertErr || !itemRow) return actionFail(`Record failed: ${itemInsertErr?.message}`);

  return { ok: true, isCorrect, itemAttemptId: itemRow.id };
}

// ──────────────────────────────────────────────────────────────
// toggleMarkForReview
// ──────────────────────────────────────────────────────────────

export async function toggleMarkForReview(_prev, formData) {
  let ctx;
  try { ctx = await requireUser(); }
  catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error');
  }
  const { user, supabase } = ctx;

  const moduleAttemptId = String(formData.get('moduleAttemptId') ?? '');
  const moduleItemId    = String(formData.get('moduleItemId') ?? '');
  if (!moduleAttemptId || !moduleItemId) return actionFail('Missing ids');

  // Verify ownership via the module attempt → test attempt chain.
  const { data: moduleAttempt } = await supabase
    .from('practice_test_module_attempts_v2')
    .select('id, finished_at, practice_test_attempt:practice_test_attempts_v2(user_id)')
    .eq('id', moduleAttemptId)
    .maybeSingle();
  if (!moduleAttempt) return actionFail('Module not found');
  if (moduleAttempt.practice_test_attempt.user_id !== user.id) return actionFail('Not allowed');
  if (moduleAttempt.finished_at) return actionFail('Module already submitted');

  const { data: existing } = await supabase
    .from('practice_test_item_attempts_v2')
    .select('id, marked_for_review, attempt_id')
    .eq('practice_test_module_attempt_id', moduleAttemptId)
    .eq('practice_test_module_item_id', moduleItemId)
    .maybeSingle();

  if (existing) {
    const next = !existing.marked_for_review;
    await supabase
      .from('practice_test_item_attempts_v2')
      .update({ marked_for_review: next })
      .eq('id', existing.id);
    return { ok: true, marked: next };
  }

  // No item row yet (student hasn't answered) — insert a placeholder
  // attempts row so we can link. The placeholder is an unanswered
  // attempt (response_text = null, is_correct = false). It gets
  // replaced when the student actually answers via recordItemAnswer.
  const { data: moduleItem } = await supabase
    .from('practice_test_module_items_v2')
    .select('question_id')
    .eq('id', moduleItemId)
    .maybeSingle();
  if (!moduleItem) return actionFail('Question not found');

  const { data: attemptRow } = await supabase
    .from('attempts')
    .insert({
      user_id: user.id,
      question_id: moduleItem.question_id,
      is_correct: false,
      selected_option_id: null,
      response_text: null,
      source: 'practice_test',
    })
    .select('id')
    .single();
  if (!attemptRow) return actionFail('Could not create flag placeholder');

  const { data: itemRow } = await supabase
    .from('practice_test_item_attempts_v2')
    .insert({
      practice_test_module_attempt_id: moduleAttemptId,
      practice_test_module_item_id: moduleItemId,
      attempt_id: attemptRow.id,
      marked_for_review: true,
    })
    .select('id')
    .single();
  return { ok: true, marked: true, itemAttemptId: itemRow?.id };
}

// ──────────────────────────────────────────────────────────────
// finishModule
// ──────────────────────────────────────────────────────────────

export async function finishModule(_prev, formData) {
  let ctx;
  try { ctx = await requireUser(); }
  catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error');
  }
  const { user, supabase } = ctx;

  const moduleAttemptId = String(formData.get('moduleAttemptId') ?? '');
  if (!moduleAttemptId) return actionFail('Missing moduleAttemptId');

  // Load the module attempt, the module itself, and the parent test
  // attempt + test in one round trip via embedded selects.
  const { data: moduleAttempt } = await supabase
    .from('practice_test_module_attempts_v2')
    .select(`
      id, finished_at,
      practice_test_attempt_id,
      practice_test_module:practice_test_modules_v2(
        id, subject_code, module_number, route_code, practice_test_id
      ),
      practice_test_attempt:practice_test_attempts_v2(
        id, user_id, status, practice_test_id,
        practice_test:practice_tests_v2(
          id, is_adaptive, rw_route_threshold, math_route_threshold
        )
      )
    `)
    .eq('id', moduleAttemptId)
    .maybeSingle();
  if (!moduleAttempt) return actionFail('Module not found');
  if (moduleAttempt.practice_test_attempt.user_id !== user.id) return actionFail('Not allowed');
  if (moduleAttempt.finished_at) {
    // Idempotent — if the student double-clicks submit, still return
    // the same routing answer we gave last time.
    return deriveFinishReturn(supabase, moduleAttempt);
  }
  if (moduleAttempt.practice_test_attempt.status !== 'in_progress') {
    return actionFail('Test is not in progress');
  }

  // Count this module's correct answers from practice_test_item_attempts_v2
  // joined with attempts. We use the embedded shape so PostgREST
  // does the join server-side.
  const { data: itemRows } = await supabase
    .from('practice_test_item_attempts_v2')
    .select('attempt:attempts(is_correct)')
    .eq('practice_test_module_attempt_id', moduleAttemptId);

  let correctCount = 0;
  for (const row of itemRows ?? []) {
    if (row.attempt?.is_correct) correctCount += 1;
  }

  // Close the current module.
  await supabase
    .from('practice_test_module_attempts_v2')
    .update({
      finished_at: new Date().toISOString(),
      correct_count: correctCount,
      raw_score: correctCount,
    })
    .eq('id', moduleAttemptId);

  // Decide what happens next.
  const currentModule = moduleAttempt.practice_test_module;
  const test          = moduleAttempt.practice_test_attempt.practice_test;
  const subject       = currentModule.subject_code;
  const moduleNumber  = currentModule.module_number;
  const testId        = test.id;

  // CASE A: module 1 of a section → route module 2 adaptively.
  if (moduleNumber === 1) {
    const threshold = subject === 'RW' ? test.rw_route_threshold : test.math_route_threshold;
    const preferred = chooseModule2Route({
      subject,
      module1CorrectCount: correctCount,
      threshold,
    });

    // Pick the available route for module 2 — fall back gracefully
    // if the test is missing its hard / easy module.
    const { data: module2Options } = await supabase
      .from('practice_test_modules_v2')
      .select('id, subject_code, module_number, route_code')
      .eq('practice_test_id', testId)
      .eq('subject_code', subject)
      .eq('module_number', 2);

    const routes = availableRoutes(module2Options ?? [], subject, 2);
    const resolved = resolveRoute(routes, preferred);
    if (!resolved) return actionFail(`Test is missing module 2 for ${subject}`);

    const nextModule = (module2Options ?? []).find((m) => m.route_code === resolved);
    const { data: nextAttempt } = await supabase
      .from('practice_test_module_attempts_v2')
      .insert({
        practice_test_attempt_id: moduleAttempt.practice_test_attempt_id,
        practice_test_module_id: nextModule.id,
      })
      .select('id')
      .single();

    return { ok: true, nextModuleAttemptId: nextAttempt.id, step: 'next-module' };
  }

  // CASE B: module 2 of RW → start Math module 1.
  if (subject === 'RW' && moduleNumber === 2) {
    const { data: mathModule1 } = await supabase
      .from('practice_test_modules_v2')
      .select('id')
      .eq('practice_test_id', testId)
      .eq('subject_code', 'MATH')
      .eq('module_number', 1)
      .eq('route_code', 'std')
      .maybeSingle();
    if (!mathModule1) return actionFail('Test is missing MATH module 1');

    const { data: nextAttempt } = await supabase
      .from('practice_test_module_attempts_v2')
      .insert({
        practice_test_attempt_id: moduleAttempt.practice_test_attempt_id,
        practice_test_module_id: mathModule1.id,
      })
      .select('id')
      .single();

    return { ok: true, nextModuleAttemptId: nextAttempt.id, step: 'section-break' };
  }

  // CASE C: module 2 of Math → test complete.
  if (subject === 'MATH' && moduleNumber === 2) {
    await closeTestAttempt(supabase, moduleAttempt.practice_test_attempt_id);
    return {
      ok: true,
      step: 'test-complete',
      attemptId: moduleAttempt.practice_test_attempt_id,
    };
  }

  return actionFail('Unexpected module state');
}

// Scores the full attempt and flips its status to 'completed'.
// Factored out so deriveFinishReturn (for the double-submit case)
// can reuse it if the test happened to be marked completed mid-
// flight on the initial finishModule.
async function closeTestAttempt(supabase, attemptId) {
  // Pull all module attempts for this test attempt plus the
  // module info we need for routing-aware scoring.
  const { data: moduleAttempts } = await supabase
    .from('practice_test_module_attempts_v2')
    .select(`
      correct_count,
      practice_test_module:practice_test_modules_v2(subject_code, module_number, route_code)
    `)
    .eq('practice_test_attempt_id', attemptId);

  // Aggregate per subject: total correct, total items, and whichever
  // route module 2 landed on (scoring uses the module-2 route for
  // the ceiling curve).
  const bySubject = { RW: { correct: 0, total: 0, route: 'std' },
                      MATH: { correct: 0, total: 0, route: 'std' } };

  for (const ma of moduleAttempts ?? []) {
    const m = ma.practice_test_module;
    if (!m) continue;
    bySubject[m.subject_code].correct += ma.correct_count ?? 0;
  }

  // Count items per subject (denominator for the scaling curve).
  // One IN query against module items keyed by every module id that
  // appeared above.
  const moduleIds = (moduleAttempts ?? [])
    .map((ma) => ma.practice_test_module?.module_number == null ? null : ma)
    .filter(Boolean)
    .map((ma) => ma.practice_test_module);
  // We actually need the module IDs, not the records — redo:
  const { data: moduleRows } = await supabase
    .from('practice_test_module_attempts_v2')
    .select(`
      practice_test_module:practice_test_modules_v2(id, subject_code, module_number, route_code)
    `)
    .eq('practice_test_attempt_id', attemptId);

  const moduleIdList = (moduleRows ?? []).map((r) => r.practice_test_module?.id).filter(Boolean);
  if (moduleIdList.length > 0) {
    const { data: itemsPerModule } = await supabase
      .from('practice_test_module_items_v2')
      .select('practice_test_module_id, practice_test_module:practice_test_modules_v2(subject_code)')
      .in('practice_test_module_id', moduleIdList);
    for (const it of itemsPerModule ?? []) {
      const subj = it.practice_test_module?.subject_code;
      if (subj) bySubject[subj].total += 1;
    }
  }

  // Route for scoring = module 2's route. Find it in the aggregated
  // moduleRows.
  for (const r of moduleRows ?? []) {
    const m = r.practice_test_module;
    if (!m) continue;
    if (m.module_number === 2) bySubject[m.subject_code].route = m.route_code;
  }

  const rwScaled = scaleSectionScore({
    subject: 'RW',
    rawCorrect: bySubject.RW.correct,
    totalItems: bySubject.RW.total,
    route: bySubject.RW.route,
  });
  const mathScaled = scaleSectionScore({
    subject: 'MATH',
    rawCorrect: bySubject.MATH.correct,
    totalItems: bySubject.MATH.total,
    route: bySubject.MATH.route,
  });
  const composite = compositeScore({ rwScaled, mathScaled });

  await supabase
    .from('practice_test_attempts_v2')
    .update({
      status: 'completed',
      finished_at: new Date().toISOString(),
      rw_scaled: rwScaled,
      math_scaled: mathScaled,
      composite_score: composite,
    })
    .eq('id', attemptId);
}

// If finishModule runs a second time against an already-closed
// module (double-click), this helper returns the same "where do I
// route next" answer so the client lands in the right place.
async function deriveFinishReturn(supabase, moduleAttempt) {
  const m = moduleAttempt.practice_test_module;
  if (m.module_number === 1) {
    const { data: nextRow } = await supabase
      .from('practice_test_module_attempts_v2')
      .select('id, practice_test_module:practice_test_modules_v2(subject_code, module_number)')
      .eq('practice_test_attempt_id', moduleAttempt.practice_test_attempt_id)
      .order('started_at', { ascending: true });
    const next = (nextRow ?? []).find((r) =>
      r.practice_test_module.subject_code === m.subject_code &&
      r.practice_test_module.module_number === 2,
    );
    return next
      ? { ok: true, nextModuleAttemptId: next.id, step: 'next-module' }
      : actionFail('Next module not created');
  }
  if (m.subject_code === 'RW' && m.module_number === 2) {
    const { data: nextRow } = await supabase
      .from('practice_test_module_attempts_v2')
      .select('id, practice_test_module:practice_test_modules_v2(subject_code, module_number)')
      .eq('practice_test_attempt_id', moduleAttempt.practice_test_attempt_id);
    const mathMod1 = (nextRow ?? []).find((r) =>
      r.practice_test_module.subject_code === 'MATH' &&
      r.practice_test_module.module_number === 1,
    );
    return mathMod1
      ? { ok: true, nextModuleAttemptId: mathMod1.id, step: 'section-break' }
      : actionFail('Math module 1 not created');
  }
  return {
    ok: true,
    step: 'test-complete',
    attemptId: moduleAttempt.practice_test_attempt_id,
  };
}
