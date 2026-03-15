import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '../../../../lib/supabase/server';

// POST /api/teacher/score-conversion
// Allows teachers to upload score conversion data (same as admin endpoint).
// Body: { test_id, test_name, entries: [{ section, module1_correct, module2_correct, scaled_score }] }
export async function POST(request) {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.role !== 'teacher' && profile?.role !== 'manager' && profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const { test_id, test_name, entries } = body;

  if (!test_id || !test_name || !entries?.length) {
    return NextResponse.json({ error: 'test_id, test_name, and entries are required' }, { status: 400 });
  }

  const service = createServiceClient();
  const rows = entries.map((e) => ({
    test_id,
    test_name,
    section: e.section,
    module1_correct: e.module1_correct,
    module2_correct: e.module2_correct,
    scaled_score: e.scaled_score,
  }));

  const { data, error } = await service
    .from('score_conversion')
    .upsert(rows, { onConflict: 'test_id,section,module1_correct,module2_correct' })
    .select();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ saved: data.length });
}
