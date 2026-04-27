import { NextResponse } from 'next/server';
import { requireServiceRole } from '@/lib/api/auth';
import { legacyApiRoute } from '@/lib/api/response';

// POST /api/teacher/score-conversion
// Allows teachers to upload score conversion data (same as admin endpoint).
// Body: { test_id, test_name, entries: [{ section, module1_correct, module2_correct, scaled_score }] }
export const POST = legacyApiRoute(async (request) => {
  const { service } = await requireServiceRole('teacher score-conversion upsert', {
    allowedRoles: ['teacher', 'manager', 'admin'],
  });

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

  const { data, error } = await service
    .from('score_conversion')
    .upsert(rows, { onConflict: 'test_id,section,module1_correct,module2_correct' })
    .select();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ saved: data.length });
});
