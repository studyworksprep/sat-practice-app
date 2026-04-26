import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api/auth';
import { legacyApiRoute } from '@/lib/api/response';

// POST /api/practice-tests/start
// Body: { practice_test_id, sections? }
// sections: 'both' (default), 'rw', 'math'
// Creates a new in_progress attempt and returns { attempt_id }
export const POST = legacyApiRoute(async (request) => {
  const { user, supabase } = await requireUser();

  const { practice_test_id, sections } = await request.json();
  if (!practice_test_id) {
    return NextResponse.json({ error: 'practice_test_id required' }, { status: 400 });
  }

  // Verify test exists and is published
  const { data: test, error: testErr } = await supabase
    .from('practice_tests')
    .select('id')
    .eq('id', practice_test_id)
    .eq('is_published', true)
    .single();

  if (testErr || !test) {
    return NextResponse.json({ error: 'Test not found' }, { status: 404 });
  }

  // Store sections in metadata so the attempt flow knows which subjects to include
  const metadata = {};
  if (sections && sections !== 'both') {
    metadata.sections = sections; // 'rw' or 'math'
  }

  const { data: attempt, error: insertErr } = await supabase
    .from('practice_test_attempts')
    .insert({
      practice_test_id,
      user_id: user.id,
      status: 'in_progress',
      started_at: new Date().toISOString(),
      metadata: Object.keys(metadata).length > 0 ? metadata : {},
    })
    .select('id')
    .single();

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 400 });

  return NextResponse.json({ attempt_id: attempt.id });
});
