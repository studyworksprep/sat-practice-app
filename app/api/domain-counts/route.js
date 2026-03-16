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
  const undone_only  = searchParams.get('undone_only')  === 'true';
  const hide_broken  = searchParams.get('hide_broken')  === 'true';
  const only_broken  = searchParams.get('only_broken')  === 'true';

  const supabase = createClient();

  // Run auth + all restriction queries + first taxonomy page in parallel
  const restrictionQueries = [
    // 0: auth
    supabase.auth.getUser(),
    // 1: first taxonomy page (always needed)
    (() => {
      let q = supabase
        .from('question_taxonomy')
        .select('question_id, domain_name, skill_name, skill_code')
        .range(0, 999);
      if (difficulties.length > 0) q = q.in('difficulty', difficulties);
      if (score_bands.length > 0)  q = q.in('score_band', score_bands);
      return q;
    })(),
  ];

  // 2: broken IDs (if needed for hide_broken or only_broken)
  if (hide_broken || only_broken) {
    restrictionQueries.push(
      supabase.from('questions').select('id').eq('is_broken', true).limit(10000)
    );
  }

  const results = await Promise.all(restrictionQueries);

  const { data: auth } = results[0];
  const userId = auth?.user?.id ?? null;

  // Now run user-specific queries in parallel (need userId)
  const userQueries = [];
  if (marked_only && userId) {
    userQueries.push(
      supabase.from('question_status').select('question_id')
        .eq('user_id', userId).eq('marked_for_review', true).limit(10000)
    );
  }
  if (wrong_only && userId) {
    userQueries.push(
      supabase.from('question_status').select('question_id')
        .eq('user_id', userId).eq('is_done', true).eq('last_is_correct', false).limit(10000)
    );
  }
  if (undone_only && userId) {
    userQueries.push(
      supabase.from('question_status').select('question_id')
        .eq('user_id', userId).eq('is_done', true).limit(50000)
    );
  }

  if ((marked_only || wrong_only || undone_only) && !userId) return NextResponse.json({});

  const userResults = userQueries.length > 0 ? await Promise.all(userQueries) : [];

  // Build restriction set
  let restrictIds = null;
  let excludeBrokenIds = null;
  let userIdx = 0;

  if (marked_only && userId) {
    const ids = (userResults[userIdx++]?.data || []).map((r) => r.question_id).filter(Boolean);
    restrictIds = intersect(restrictIds, ids);
    if (restrictIds.length === 0) return NextResponse.json({});
  }

  if (wrong_only && userId) {
    const ids = (userResults[userIdx++]?.data || []).map((r) => r.question_id).filter(Boolean);
    restrictIds = intersect(restrictIds, ids);
    if (restrictIds.length === 0) return NextResponse.json({});
  }

  // undone_only: exclude questions already done by the current user
  let excludeDoneIds = null;
  if (undone_only && userId) {
    const doneIds = (userResults[userIdx++]?.data || []).map((r) => r.question_id).filter(Boolean);
    if (doneIds.length > 0) {
      if (restrictIds) {
        const doneSet = new Set(doneIds);
        restrictIds = restrictIds.filter((id) => !doneSet.has(id));
        if (restrictIds.length === 0) return NextResponse.json({});
      } else {
        excludeDoneIds = new Set(doneIds);
      }
    }
  }

  if (only_broken) {
    const brokenIds = (results[2]?.data || []).map((r) => r.id).filter(Boolean);
    restrictIds = intersect(restrictIds, brokenIds);
    if (restrictIds.length === 0) return NextResponse.json({});
  } else if (hide_broken) {
    const brokenIds = new Set((results[2]?.data || []).map((r) => r.id).filter(Boolean));
    if (brokenIds.size > 0) {
      if (restrictIds) {
        restrictIds = restrictIds.filter((id) => !brokenIds.has(id));
        if (restrictIds.length === 0) return NextResponse.json({});
      } else {
        excludeBrokenIds = brokenIds;
      }
    }
  }

  // Process first taxonomy page (already fetched in parallel)
  const firstTaxResult = results[1];
  if (firstTaxResult.error) return NextResponse.json({ error: firstTaxResult.error.message }, { status: 400 });

  let allTax = firstTaxResult.data || [];

  // Continue paginating if first page was full
  if (allTax.length >= 1000) {
    let from = 1000;
    while (true) {
      let q = supabase
        .from('question_taxonomy')
        .select('question_id, domain_name, skill_name, skill_code')
        .range(from, from + 999);
      if (difficulties.length > 0) q = q.in('difficulty', difficulties);
      if (score_bands.length > 0)  q = q.in('score_band', score_bands);

      const { data, error } = await q;
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });

      allTax = allTax.concat(data || []);
      if (!data || data.length < 1000) break;
      from += 1000;
    }
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

  // Exclude done questions
  if (excludeDoneIds) {
    allTax = allTax.filter((r) => !excludeDoneIds.has(r.question_id));
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
