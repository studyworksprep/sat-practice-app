import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '../../../../lib/supabase/server';

// PUT /api/admin/recalculate-score
// Body: { attempt_id, rw_scaled, math_scaled, practice_test_id,
//         rw_m1_correct, rw_m2_correct, math_m1_correct, math_m2_correct }
// Saves corrected section scores to practice_test_attempts and
// inserts corresponding score_conversion entries if not already present.
export async function PUT(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile || !['teacher', 'manager', 'admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const { attempt_id, rw_scaled, math_scaled, practice_test_id,
          rw_m1_correct, rw_m2_correct, math_m1_correct, math_m2_correct } = body;

  if (!attempt_id) return NextResponse.json({ error: 'attempt_id required' }, { status: 400 });

  const rwScore = parseInt(rw_scaled, 10);
  const mathScore = parseInt(math_scaled, 10);

  if (!Number.isFinite(rwScore) || !Number.isFinite(mathScore)) {
    return NextResponse.json({ error: 'Valid rw_scaled and math_scaled are required' }, { status: 400 });
  }

  const composite = rwScore + mathScore;
  const admin = createServiceClient();

  // Update the cached scores on the attempt
  const { error: updateErr } = await admin
    .from('practice_test_attempts')
    .update({
      composite_score: composite,
      rw_scaled: rwScore,
      math_scaled: mathScore,
    })
    .eq('id', attempt_id);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 400 });

  // Insert score_conversion entries if we have module correct counts and a test ID
  if (practice_test_id) {
    const testId = practice_test_id;

    // Fetch test name for the score_conversion entry
    const { data: test } = await admin
      .from('practice_tests')
      .select('name')
      .eq('id', testId)
      .maybeSingle();
    const testName = test?.name || 'Practice Test';

    // Insert RW entry if module counts provided
    if (Number.isFinite(parseInt(rw_m1_correct)) && Number.isFinite(parseInt(rw_m2_correct))) {
      const m1 = parseInt(rw_m1_correct);
      const m2 = parseInt(rw_m2_correct);

      await admin
        .from('score_conversion')
        .upsert({
          test_id: testId,
          test_name: testName,
          section: 'reading_writing',
          module1_correct: m1,
          module2_correct: m2,
          scaled_score: rwScore,
        }, { onConflict: 'test_id,section,module1_correct,module2_correct' });
    }

    // Insert Math entry if module counts provided
    if (Number.isFinite(parseInt(math_m1_correct)) && Number.isFinite(parseInt(math_m2_correct))) {
      const m1 = parseInt(math_m1_correct);
      const m2 = parseInt(math_m2_correct);

      await admin
        .from('score_conversion')
        .upsert({
          test_id: testId,
          test_name: testName,
          section: 'math',
          module1_correct: m1,
          module2_correct: m2,
          scaled_score: mathScore,
        }, { onConflict: 'test_id,section,module1_correct,module2_correct' });
    }
  }

  return NextResponse.json({ ok: true, composite, rw_scaled: rwScore, math_scaled: mathScore });
}
