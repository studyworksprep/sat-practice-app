import { NextResponse } from 'next/server';
import { createClient } from '../../../../lib/supabase/server';

// POST /api/practice-tests/start
// Body: { practice_test_id }
// Creates a new in_progress attempt and returns { attempt_id }
export async function POST(request) {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { practice_test_id } = await request.json();
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

  const { data: attempt, error: insertErr } = await supabase
    .from('practice_test_attempts')
    .insert({
      practice_test_id,
      user_id: user.id,
      status: 'in_progress',
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 400 });

  return NextResponse.json({ attempt_id: attempt.id });
}
