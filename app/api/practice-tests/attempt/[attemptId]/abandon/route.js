import { NextResponse } from 'next/server';
import { createClient } from '../../../../../../lib/supabase/server';

// POST /api/practice-tests/attempt/[attemptId]/abandon
// Marks an in-progress attempt as abandoned.
export async function POST(_request, props) {
  const params = await props.params;
  const { attemptId } = params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: attempt, error: attErr } = await supabase
    .from('practice_test_attempts')
    .select('id, user_id, status')
    .eq('id', attemptId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (attErr) return NextResponse.json({ error: attErr.message }, { status: 500 });
  if (!attempt) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (attempt.status !== 'in_progress') {
    return NextResponse.json({ error: 'Only in-progress attempts can be abandoned' }, { status: 400 });
  }

  const { error: updateErr } = await supabase
    .from('practice_test_attempts')
    .update({ status: 'abandoned', finished_at: new Date().toISOString() })
    .eq('id', attemptId)
    .eq('user_id', user.id);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
