import { NextResponse } from 'next/server';
import { createClient } from '../../../../lib/supabase/server';

// GET /api/admin/questions-v2
//
// Admin-only. Returns a page of rows from the new questions_v2 table
// (built by supabase/migrations/questions_v2_phase1_schema.sql and
// populated via migrate_questions_batch()).  Used by the "Questions V2
// Preview" admin tab to verify the migration produced data that renders
// the same way as the main practice app.
//
// Query params:
//   limit       — page size (default 20, max 100)
//   offset      — row offset (default 0)
//   type        — filter by question_type ('mcq' | 'spr')
//   domain      — filter by domain_code
//   q           — substring match on source_id / source_external_id
export async function GET(req) {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(req.url);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '20', 10) || 20, 1), 100);
  const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10) || 0, 0);
  const type = url.searchParams.get('type');
  const domain = url.searchParams.get('domain');
  const q = (url.searchParams.get('q') || '').trim();

  let query = supabase
    .from('questions_v2')
    .select(
      `id, display_code, question_type, stem_html, stimulus_html, rationale_html,
       options, correct_answer,
       domain_code, domain_name, skill_code, skill_name, difficulty, score_band,
       source, source_id, source_external_id, is_published, is_broken,
       attempt_count, correct_count, created_at`,
      { count: 'exact' }
    )
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (type === 'mcq' || type === 'spr') query = query.eq('question_type', type);
  if (domain) query = query.eq('domain_code', domain);
  if (q) {
    // Escape PostgREST `or` reserved characters in user input
    const safe = q.replace(/[,()]/g, ' ');
    query = query.or(`source_id.ilike.%${safe}%,source_external_id.ilike.%${safe}%,display_code.ilike.%${safe}%`);
  }

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Also return the distinct domains so the UI can populate a filter dropdown.
  const { data: domainRows } = await supabase
    .from('questions_v2')
    .select('domain_code, domain_name')
    .not('domain_code', 'is', null)
    .limit(1000);

  const domainMap = new Map();
  for (const r of domainRows || []) {
    if (r.domain_code && !domainMap.has(r.domain_code)) {
      domainMap.set(r.domain_code, r.domain_name || r.domain_code);
    }
  }
  const domains = Array.from(domainMap, ([code, name]) => ({ code, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({
    questions: data || [],
    total: count ?? 0,
    limit,
    offset,
    domains,
  });
}
