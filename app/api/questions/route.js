import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';

// GET /api/questions
// Params: difficulties=1,2,3 | score_bands=1,2 | domains=Algebra,... | topics=Linear+Functions,...
//         wrong_only | marked_only | hide_broken | q | limit | offset
export async function GET(request) {
  const { searchParams } = new URL(request.url);

  // Multi-value difficulty (replaces single 'difficulty')
  const difficulties = (searchParams.get('difficulties') || '')
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n));

  const score_bands_raw = searchParams.get('score_bands');
  const score_bands = (score_bands_raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n));

  // Multi-value domain / topic filters
  const domainList = (searchParams.get('domains') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const topicList = (searchParams.get('topics') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const wrong_only = searchParams.get('wrong_only') === 'true';
  const marked_only = searchParams.get('marked_only') === 'true';
  const hide_broken = searchParams.get('hide_broken') === 'true';
  const qText = (searchParams.get('q') || '').trim();

  const limit = Math.min(parseInt(searchParams.get('limit') || '25', 10), 5000);
  const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10), 0);

  const supabase = createClient();

  // Step 1: Auth + all non-user-dependent restriction queries in parallel
  const step1 = [supabase.auth.getUser()];

  // Search queries (don't need userId)
  if (qText) {
    const safe = qText.replace(/[%_]/g, '\\$&');
    const pattern = `%${safe}%`;
    step1.push(
      supabase.from('questions').select('id, question_id').ilike('question_id', pattern).limit(2000),
      supabase.from('question_versions').select('question_id, stem_html, stimulus_html')
        .eq('is_current', true).or(`stem_html.ilike.${pattern},stimulus_html.ilike.${pattern}`).limit(2000),
    );
  }

  // Domain/topic queries (don't need userId)
  if (domainList.length > 0) {
    step1.push(supabase.from('question_taxonomy').select('question_id').in('domain_name', domainList));
  }
  if (topicList.length > 0) {
    step1.push(supabase.from('question_taxonomy').select('question_id').in('skill_code', topicList));
  }

  const step1Results = await Promise.all(step1);

  const { data: auth, error: authErr } = step1Results[0];
  if (authErr) return NextResponse.json({ error: authErr.message }, { status: 400 });
  const user = auth?.user ?? null;
  const userId = user?.id ?? null;

  // Build restriction set from step 1 results
  let restrictIds = null;
  let s1idx = 1;

  // Search results
  if (qText) {
    const ids = new Set();
    const { data: qrows, error: qErr } = step1Results[s1idx++];
    if (qErr) return NextResponse.json({ error: qErr.message }, { status: 400 });
    (qrows || []).forEach((r) => r?.id && ids.add(r.id));

    const { data: vrows, error: vErr } = step1Results[s1idx++];
    if (vErr) return NextResponse.json({ error: vErr.message }, { status: 400 });
    (vrows || []).forEach((r) => r?.question_id && ids.add(r.question_id));

    restrictIds = Array.from(ids);
    if (restrictIds.length === 0) return NextResponse.json({ items: [], totalCount: 0 });
  }

  // Domain/topic results
  if (domainList.length > 0 || topicList.length > 0) {
    const matchingIds = new Set();

    if (domainList.length > 0) {
      const { data: drows, error: dErr } = step1Results[s1idx++];
      if (dErr) return NextResponse.json({ error: dErr.message }, { status: 400 });
      (drows || []).forEach((r) => r.question_id && matchingIds.add(r.question_id));
    }
    if (topicList.length > 0) {
      const { data: trows, error: tErr } = step1Results[s1idx++];
      if (tErr) return NextResponse.json({ error: tErr.message }, { status: 400 });
      (trows || []).forEach((r) => r.question_id && matchingIds.add(r.question_id));
    }

    const taxIds = Array.from(matchingIds);
    restrictIds = intersect(restrictIds, taxIds);
    if (!restrictIds || restrictIds.length === 0) return NextResponse.json({ items: [], totalCount: 0 });
  }

  // Step 2: User-specific restrictions in parallel (need userId)
  if ((marked_only || wrong_only) && !userId) {
    return NextResponse.json({ items: [], totalCount: 0 });
  }

  const step2 = [];
  const step2Keys = [];
  if (marked_only && userId) {
    step2Keys.push('marked');
    step2.push(
      supabase.from('question_status').select('question_id')
        .eq('user_id', userId).eq('marked_for_review', true).limit(10000)
    );
  }
  if (wrong_only && userId) {
    step2Keys.push('wrong');
    step2.push(
      supabase.from('question_status').select('question_id')
        .eq('user_id', userId).eq('is_done', true).eq('last_is_correct', false).limit(10000)
    );
  }

  if (step2.length > 0) {
    const step2Results = await Promise.all(step2);
    for (let i = 0; i < step2Results.length; i++) {
      const { data: rows, error: err } = step2Results[i];
      if (err) return NextResponse.json({ error: err.message }, { status: 400 });
      const ids = (rows || []).map((r) => r.question_id).filter(Boolean);
      restrictIds = intersect(restrictIds, ids);
      if (!restrictIds || restrictIds.length === 0) return NextResponse.json({ items: [], totalCount: 0 });
    }
  }

  // hide_broken — handled in the main query via .eq('is_broken', false)

  // Main query
  let q = supabase
    .from('questions')
    .select(
      `
      id,
      question_id,
      is_broken,
      question_taxonomy!inner (
        question_id,
        domain_code,
        domain_name,
        skill_code,
        skill_name,
        difficulty,
        score_band
      ),
     question_status!left (
        user_id,
        question_id,
        is_done,
        marked_for_review,
        attempts_count,
        correct_attempts_count,
        last_is_correct
      )
    `,
      { count: 'exact' }
    )
    .order('created_at', { ascending: false })
    .order('question_id', { ascending: true });

  if (restrictIds) q = q.in('id', restrictIds);

  if (difficulties.length > 0) q = q.in('question_taxonomy.difficulty', difficulties);
  if (score_bands.length > 0) q = q.in('question_taxonomy.score_band', score_bands);
  if (hide_broken) q = q.eq('is_broken', false);

  q = q.range(offset, offset + limit - 1);

  const { data, error, count } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const items = (data || [])
    .map((row) => {
      const tax = row.question_taxonomy?.[0] ?? row.question_taxonomy ?? null;

      const stArr = Array.isArray(row.question_status)
        ? row.question_status
        : row.question_status
        ? [row.question_status]
        : [];

      const st = userId ? stArr.find((s) => s?.user_id === userId) : stArr[0];

      if (!tax) return null;

      return {
        question_id: row.id,
        question_key: row.question_id || null,

        domain_code: tax.domain_code,
        domain_name: tax.domain_name,
        skill_code: tax.skill_code,
        skill_name: tax.skill_name,
        difficulty: tax.difficulty,
        score_band: tax.score_band,

        is_done: st?.is_done ?? false,
        marked_for_review: st?.marked_for_review ?? false,
        is_broken: row.is_broken ?? false,
        attempts_count: st?.attempts_count ?? 0,
        correct_attempts_count: st?.correct_attempts_count ?? 0,
        last_is_correct: st?.last_is_correct ?? null,
      };
    })
    .filter(Boolean);

  const totalCount = typeof count === 'number' ? count : 0;

  return NextResponse.json({ items, totalCount });
}

// Intersect an existing restriction set with a new list.
// If existing is null (no restriction yet), the new list becomes the restriction.
function intersect(existing, incoming) {
  if (existing === null) return incoming;
  const set = new Set(existing);
  return incoming.filter((id) => set.has(id));
}
