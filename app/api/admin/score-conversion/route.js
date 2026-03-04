import { NextResponse } from 'next/server';
import { createClient } from '../../../../lib/supabase/server';

// GET /api/admin/score-conversion?test_id=...
// Returns existing score_conversion rows for a given test
export async function GET(request) {
  const supabase = createClient();
  const { searchParams } = new URL(request.url);
  const testId = searchParams.get('test_id');

  if (!testId) return NextResponse.json({ error: 'test_id required' }, { status: 400 });

  const { data, error } = await supabase
    .from('score_conversion')
    .select('*')
    .eq('test_id', testId)
    .order('section')
    .order('module1_correct')
    .order('module2_correct');

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ rows: data });
}

// POST /api/admin/score-conversion
// Body: { test_id, test_name, entries: [{ section, module1_correct, module2_correct, scaled_score }] }
export async function POST(request) {
  const supabase = createClient();
  const body = await request.json();
  const { test_id, test_name, entries } = body;

  if (!test_id || !test_name || !entries?.length) {
    return NextResponse.json({ error: 'test_id, test_name, and entries are required' }, { status: 400 });
  }

  const rows = entries.map((e) => ({
    test_id,
    test_name,
    section: e.section,
    module1_correct: e.module1_correct,
    module2_correct: e.module2_correct,
    scaled_score: e.scaled_score,
  }));

  const { data, error } = await supabase
    .from('score_conversion')
    .upsert(rows, { onConflict: 'test_id,section,module1_correct,module2_correct' })
    .select();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ saved: data.length });
}
