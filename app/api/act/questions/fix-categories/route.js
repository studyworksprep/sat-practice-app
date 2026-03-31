import { NextResponse } from 'next/server';
import { createServiceClient } from '../../../../../lib/supabase/server';

// POST /api/act/questions/fix-categories
// Fixes questions where a PHM subcategory name ended up in the category field.
// Moves the value to subcategory and sets category to "Preparing for Higher Math".
export async function POST(request) {
  const userId = request.headers.get('x-user-id');
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const admin = createServiceClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();
  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const SUBCAT_MAP = {
    'Algebra': { code: 'ALG', name: 'Algebra' },
    'Functions': { code: 'FUN', name: 'Functions' },
    'Geometry': { code: 'GEO', name: 'Geometry' },
    'Number & Quantity': { code: 'NQ', name: 'Number & Quantity' },
    'Statistics & Probability': { code: 'SP', name: 'Statistics & Probability' },
  };

  const body = await request.json().catch(() => ({}));
  const sourceTest = body.source_test;

  try {
    // Find questions where category is actually a subcategory name
    let query = admin
      .from('act_questions')
      .select('id, category, category_code, subcategory, subcategory_code, source_test')
      .in('category', Object.keys(SUBCAT_MAP));

    if (sourceTest) query = query.eq('source_test', sourceTest);

    const { data: rows, error } = await query;
    if (error) throw error;

    if (!rows || rows.length === 0) {
      return NextResponse.json({ ok: true, fixed: 0, message: 'No mismatched categories found' });
    }

    let fixed = 0;
    for (const row of rows) {
      const sub = SUBCAT_MAP[row.category];
      if (!sub) continue;

      const { error: updateError } = await admin
        .from('act_questions')
        .update({
          category: 'Preparing for Higher Math',
          category_code: 'PHM',
          subcategory: sub.name,
          subcategory_code: sub.code,
        })
        .eq('id', row.id);

      if (updateError) {
        console.error(`Failed to fix question ${row.id}:`, updateError.message);
        continue;
      }
      fixed++;
    }

    return NextResponse.json({ ok: true, fixed, total: rows.length });
  } catch (e) {
    console.error('fix-categories error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
