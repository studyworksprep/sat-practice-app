// Server Action for the Recalculate Score dialog on the practice-
// test results page.
//
// A tutor (teacher / manager / admin) types in the corrected scaled
// scores from a real Bluebook submission, plus the per-module
// correct counts that should map to those scaled scores. We:
//
//   1. Update practice_test_attempts_v2 with the supplied scaled
//      scores + composite. The student's own runner result is
//      overwritten by the tutor's correction — that's the whole
//      point of this dialog. RLS on practice_test_attempts_v2
//      allows tutors to write attempts owned by their students,
//      but the legacy route used the service-role client because
//      the same dialog needs to work for managers/admins reviewing
//      arbitrary students. Match that here.
//
//   2. Upsert a row into score_conversion keyed by
//      (test_id, section, module1_correct, module2_correct). Future
//      attempts of the same test with the same per-module split
//      will hit the exact-match branch in scaleSectionScoreWithLookup
//      and reproduce the corrected scaled score verbatim.
//
// The dialog enforces (m1, m2) inputs explicitly so the tutor can
// correct the runner's count if it ever misreports. That's the
// "per-module, not per-section" intent: the score_conversion key
// has to be (m1, m2), not just the section total.

'use server';

import { compositeScore } from '@/lib/practice-test/scoring';
import { requireServiceRole } from '@/lib/api/auth';
import { actionFail, actionOk, ApiError } from '@/lib/api/response';
import type { ActionResult } from '@/lib/types';

export interface RecalculateScoreInput {
  attemptId: string;
  practiceTestId: string | null;
  rwScaled: number;
  mathScaled: number;
  rwM1Correct: number;
  rwM2Correct: number;
  mathM1Correct: number;
  mathM2Correct: number;
}

export interface RecalculateScoreResult {
  composite: number;
  rwScaled: number;
  mathScaled: number;
}

export async function recalculateScore(
  input: RecalculateScoreInput,
): Promise<ActionResult<{ data: RecalculateScoreResult | null }>> {
  const {
    attemptId,
    practiceTestId,
    rwScaled,
    mathScaled,
    rwM1Correct,
    rwM2Correct,
    mathM1Correct,
    mathM2Correct,
  } = input;

  if (!attemptId) return actionFail('attemptId required');

  for (const [name, value] of [
    ['Reading & Writing scaled score', rwScaled],
    ['Math scaled score', mathScaled],
  ] as const) {
    if (!Number.isFinite(value) || value < 200 || value > 800) {
      return actionFail(`${name} must be between 200 and 800`);
    }
  }

  for (const [name, value] of [
    ['RW module 1 correct', rwM1Correct],
    ['RW module 2 correct', rwM2Correct],
    ['Math module 1 correct', mathM1Correct],
    ['Math module 2 correct', mathM2Correct],
  ] as const) {
    if (!Number.isInteger(value) || value < 0) {
      return actionFail(`${name} must be a non-negative integer`);
    }
  }

  let svc;
  try {
    ({ service: svc } = await requireServiceRole(
      'tutor score recalculation — write to other users\' practice_test_attempts_v2',
      { allowedRoles: ['teacher', 'manager', 'admin'] },
    ));
  } catch (e) {
    if (e instanceof ApiError) return actionFail(e.message);
    throw e;
  }

  const composite = compositeScore({ rwScaled, mathScaled });
  if (composite == null) {
    return actionFail('Could not compute composite score');
  }

  const { error: updateErr } = await svc
    .from('practice_test_attempts_v2')
    .update({
      composite_score: composite,
      rw_scaled: rwScaled,
      math_scaled: mathScaled,
    })
    .eq('id', attemptId);
  if (updateErr) return actionFail(updateErr.message);

  // Fold the corrected (m1, m2 → scaled) mapping back into
  // score_conversion so the next recompute (or a fresh attempt of
  // the same test) hits the exact-match branch and reproduces this
  // tutor's correction without needing a second pass through the
  // dialog. Skipped when we don't know the test id (defensive).
  if (practiceTestId) {
    const { data: test } = await svc
      .from('practice_tests_v2')
      .select('name')
      .eq('id', practiceTestId)
      .maybeSingle();
    const testName = test?.name ?? 'Practice Test';

    const upserts = [
      {
        test_id: practiceTestId,
        test_name: testName,
        section: 'reading_writing',
        module1_correct: rwM1Correct,
        module2_correct: rwM2Correct,
        scaled_score: rwScaled,
      },
      {
        test_id: practiceTestId,
        test_name: testName,
        section: 'math',
        module1_correct: mathM1Correct,
        module2_correct: mathM2Correct,
        scaled_score: mathScaled,
      },
    ];
    const { error: convErr } = await svc
      .from('score_conversion')
      .upsert(upserts, {
        onConflict: 'test_id,section,module1_correct,module2_correct',
      });
    if (convErr) return actionFail(`Score saved, but lookup table upsert failed: ${convErr.message}`);
  }

  return actionOk({ composite, rwScaled, mathScaled });
}
