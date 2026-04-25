import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/api/auth';
import { legacyApiRoute } from '@/lib/api/response';

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
//   q           — substring match on source_id / source_external_id / display_code
//   approved    — 'unapproved' (default), 'approved', or 'all'. Filters
//                 by the approved_at column (phase 5 audit field).
export const GET = legacyApiRoute(async (req) => {
  const { supabase } = await requireRole(['admin']);

  const url = new URL(req.url);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '20', 10) || 20, 1), 100);
  const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10) || 0, 0);
  const type = url.searchParams.get('type');
  const domain = url.searchParams.get('domain');
  const q = (url.searchParams.get('q') || '').trim();
  const approvedParam = url.searchParams.get('approved') || 'unapproved';

  let query = supabase
    .from('questions_v2')
    .select(
      `id, display_code, question_type, stem_html, stimulus_html, rationale_html,
       options, correct_answer,
       domain_code, domain_name, skill_code, skill_name, difficulty, score_band,
       source, source_id, source_external_id, is_published, is_broken,
       attempt_count, correct_count, created_at, last_fixed_at, last_fixed_by,
       approved_at, approved_by`,
      { count: 'exact' }
    )
    // Sort by display_code so the list follows the human-friendly
    // section-ordinal numbering (M-00001, M-00002, …, RW-00001, …)
    // and gaps in the index are easy to spot. display_code is unique,
    // so this is also a deterministic total order — without this,
    // rows tied on created_at would shuffle on every re-fetch (e.g.
    // after saving a Claude fix). created_at + id are kept as
    // tiebreakers for rows whose display_code is still null.
    .order('display_code', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .range(offset, offset + limit - 1);

  if (type === 'mcq' || type === 'spr') query = query.eq('question_type', type);
  if (domain) query = query.eq('domain_code', domain);
  if (q) {
    // Escape PostgREST `or` reserved characters in user input
    const safe = q.replace(/[,()]/g, ' ');
    query = query.or(`source_id.ilike.%${safe}%,source_external_id.ilike.%${safe}%,display_code.ilike.%${safe}%`);
  }
  if (approvedParam === 'unapproved') {
    query = query.is('approved_at', null);
  } else if (approvedParam === 'approved') {
    query = query.not('approved_at', 'is', null);
  }
  // approvedParam === 'all' → no filter

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Separate approved + unapproved counters so the UI can show
  // "X unapproved • Y approved" regardless of the active filter.
  // These counts ignore the type/domain/q filters on purpose — they
  // represent the global review backlog, not the current page's
  // filtered slice.
  const [{ count: approvedCount }, { count: unapprovedCount }] = await Promise.all([
    supabase
      .from('questions_v2')
      .select('id', { count: 'exact', head: true })
      .not('approved_at', 'is', null),
    supabase
      .from('questions_v2')
      .select('id', { count: 'exact', head: true })
      .is('approved_at', null),
  ]);

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
    approvedCount: approvedCount ?? 0,
    unapprovedCount: unapprovedCount ?? 0,
    limit,
    offset,
    domains,
  });
});
