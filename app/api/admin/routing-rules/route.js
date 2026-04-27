import { NextResponse } from 'next/server';
import { requireServiceRole } from '@/lib/api/auth';
import { legacyApiRoute } from '@/lib/api/response';

// GET /api/admin/routing-rules?practice_test_id=xxx
// Returns routing rules for a specific practice test
export const GET = legacyApiRoute(async (request) => {
  const { service: admin } = await requireServiceRole(
    'admin routing-rules read — RLS would scope to caller',
    { allowedRoles: ['admin'] },
  );

  const { searchParams } = new URL(request.url);
  const practiceTestId = searchParams.get('practice_test_id');
  if (!practiceTestId) {
    return NextResponse.json({ error: 'practice_test_id is required' }, { status: 400 });
  }

  // Fetch routing rules
  const { data: rules, error } = await admin
    .from('practice_test_routing_rules')
    .select('*')
    .eq('practice_test_id', practiceTestId)
    .order('subject_code')
    .order('threshold', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Also fetch modules for context (what route_codes exist)
  const { data: modules } = await admin
    .from('practice_test_modules')
    .select('id, subject_code, module_number, route_code')
    .eq('practice_test_id', practiceTestId)
    .order('subject_code')
    .order('module_number');

  return NextResponse.json({ rules: rules || [], modules: modules || [] });
});

// PUT /api/admin/routing-rules
// Replaces all routing rules for a practice test
// Body: { practice_test_id, rules: [...] }
export const PUT = legacyApiRoute(async (request) => {
  const { service: admin } = await requireServiceRole(
    'admin routing-rules write — RLS would scope to caller',
    { allowedRoles: ['admin'] },
  );

  const { practice_test_id, rules } = await request.json();
  if (!practice_test_id) {
    return NextResponse.json({ error: 'practice_test_id is required' }, { status: 400 });
  }
  if (!Array.isArray(rules)) {
    return NextResponse.json({ error: 'rules must be an array' }, { status: 400 });
  }

  // Delete existing rules for this test
  const { error: deleteError } = await admin
    .from('practice_test_routing_rules')
    .delete()
    .eq('practice_test_id', practice_test_id);

  if (deleteError) {
    return NextResponse.json({ error: `Delete failed: ${deleteError.message}` }, { status: 400 });
  }

  // Insert new rules (if any)
  if (rules.length > 0) {
    const rows = rules.map(r => ({
      practice_test_id,
      subject_code: r.subject_code,
      from_module_number: r.from_module_number || 1,
      metric: r.metric || 'correct_count',
      operator: r.operator,
      threshold: r.threshold,
      to_route_code: r.to_route_code,
    }));

    const { error: insertError } = await admin
      .from('practice_test_routing_rules')
      .insert(rows);

    if (insertError) {
      return NextResponse.json({ error: `Insert failed: ${insertError.message}` }, { status: 400 });
    }
  }

  return NextResponse.json({ ok: true, count: rules.length });
});
