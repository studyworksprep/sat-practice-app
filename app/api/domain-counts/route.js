import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';

// GET /api/domain-counts
// Params: difficulties, score_bands, wrong_only, marked_only, hide_broken
// Returns: { [domain_name]: { count: N, topics: { [skill_name]: M } } }
// Counts reflect non-domain/topic filters only, so callers can show how many
// questions exist in each domain/topic under the current filter settings.
export async function GET(request) {
  const { searchParams } = new URL(request.url);

  const difficulties = (searchParams.get('difficulties') || '')
    .split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => Number.isFinite(n));

  const score_bands = (searchParams.get('score_bands') || '')
    .split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n));

  const wrong_only   = searchParams.get('wrong_only')   === 'true';
  const marked_only  = searchParams.get('marked_only')  === 'true';
  const hide_broken  = searchParams.get('hide_broken')  === 'true';

  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id ?? null;

  // Build a set of question UUIDs that pass user-specific filters.
  // null means "no restriction".
  let restrictIds = null;
  let excludeBrokenIds = null;

  if (marked_only) {
    if (!userId) return NextResponse.json({});
    const { data } = await supabase
      .from('question_status')
      .select('question_id')
      .eq('user_id', userId)
      .eq('marked_for_review', true)
      .limit(10000);
    const ids = (data || []).map((r) => r.question_id).filter(Boolean);
    restrictIds = intersect(restrictIds, ids);
    if (restrictIds.length === 0) return NextResponse.json({});
  }

  if (hide_broken && userId) {
    const { data } = await supabase
      .from('question_status')
      .select('question_id')
      .eq('user_id', userId)
      .eq('is_broken', true)
      .limit(10000);
    const brokenIds = new Set((data || []).map((r) => r.question_id).filter(Boolean));
    if (brokenIds.size > 0) {
      if (restrictIds) {
        restrictIds = restrictIds.filter((id) => !brokenIds.has(id));
        if (restrictIds.length === 0) return NextResponse.json({});
      } else {
        excludeBrokenIds = brokenIds;
      }
    }
  }

  if (wrong_only) {
    if (!userId) return NextResponse.json({});
    const { data } = await supabase
      .from('question_status')
      .select('question_id')
      .eq('user_id', userId)
      .eq('is_done', true)
      .eq('last_is_correct', false)
      .limit(10000);
    const ids = (data || []).map((r) => r.question_id).filter(Boolean);
    restrictIds = intersect(restrictIds, ids);
    if (restrictIds.length === 0) return NextResponse.json({});
  }

  // Fetch all taxonomy rows matching difficulty/score_band filters (paginated).
  // restrictIds is then applied in JS to avoid large .in() arrays.
  const pageSize = 1000;
  let allTax = [];
  let from = 0;

  while (true) {
    let q = supabase
      .from('question_taxonomy')
      .select('question_id, domain_name, skill_name, skill_code')
      .range(from, from + pageSize - 1);

    if (difficulties.length > 0) q = q.in('difficulty', difficulties);
    if (score_bands.length > 0)  q = q.in('score_band', score_bands);

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    allTax = allTax.concat(data || []);
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }

  // Filter by user restriction set (if any)
  if (restrictIds !== null) {
    const rset = new Set(restrictIds);
    allTax = allTax.filter((r) => rset.has(r.question_id));
  }

  // Exclude broken questions
  if (excludeBrokenIds) {
    allTax = allTax.filter((r) => !excludeBrokenIds.has(r.question_id));
  }

  // Group by domain → topic, counting unique question_ids
  const byDomain = {};
  for (const row of allTax) {
    if (!row.domain_name) continue;
    if (!byDomain[row.domain_name]) byDomain[row.domain_name] = { ids: new Set(), topics: {} };
    byDomain[row.domain_name].ids.add(row.question_id);
    if (row.skill_name) {
      const topicKey = row.skill_code || row.skill_name;
      if (!byDomain[row.domain_name].topics[topicKey]) {
        byDomain[row.domain_name].topics[topicKey] = new Set();
      }
      byDomain[row.domain_name].topics[topicKey].add(row.question_id);
    }
  }

  const result = {};
  for (const [domain, { ids, topics }] of Object.entries(byDomain)) {
    result[domain] = {
      count: ids.size,
      topics: Object.fromEntries(
        Object.entries(topics).map(([skill, skillIds]) => [skill, skillIds.size])
      ),
    };
  }

  return NextResponse.json(result);
}

function intersect(existing, incoming) {
  if (existing === null) return incoming;
  const s = new Set(existing);
  return incoming.filter((id) => s.has(id));
}
