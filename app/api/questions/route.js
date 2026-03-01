import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';

// GET /api/questions
// Params: difficulties=1,2,3 | score_bands=1,2 | domains=Algebra,... | topics=Linear+Functions,...
//         wrong_only | marked_only | broken_only | q | limit | offset
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
  const broken_only = searchParams.get('broken_only') === 'true';
  const qText = (searchParams.get('q') || '').trim();

  const limit = Math.min(parseInt(searchParams.get('limit') || '25', 10), 100);
  const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10), 0);

  const supabase = createClient();
  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr) return NextResponse.json({ error: authErr.message }, { status: 400 });
  const user = auth?.user ?? null;
  const userId = user?.id ?? null;

  // Build an ID restriction set (questions.id UUIDs).
  let restrictIds = null;

  // 1) Full-text search restriction
  if (qText) {
    const safe = qText.replace(/[%_]/g, '\\$&');
    const pattern = `%${safe}%`;
    const ids = new Set();

    const { data: qrows, error: qErr } = await supabase
      .from('questions')
      .select('id, question_id')
      .ilike('question_id', pattern)
      .limit(2000);

    if (qErr) return NextResponse.json({ error: qErr.message }, { status: 400 });
    (qrows || []).forEach((r) => r?.id && ids.add(r.id));

    const { data: vrows, error: vErr } = await supabase
      .from('question_versions')
      .select('question_id, stem_html, stimulus_html')
      .eq('is_current', true)
      .or(`stem_html.ilike.${pattern},stimulus_html.ilike.${pattern}`)
      .limit(2000);

    if (vErr) return NextResponse.json({ error: vErr.message }, { status: 400 });
    (vrows || []).forEach((r) => r?.question_id && ids.add(r.question_id));

    restrictIds = Array.from(ids);
    if (restrictIds.length === 0) return NextResponse.json({ items: [], totalCount: 0 });
  }

  // 2) marked_only restriction
  if (marked_only) {
    if (!userId) return NextResponse.json({ items: [], totalCount: 0 });

    const { data: markedRows, error: markedErr } = await supabase
      .from('question_status')
      .select('question_id')
      .eq('user_id', userId)
      .eq('marked_for_review', true)
      .limit(10000);

    if (markedErr) return NextResponse.json({ error: markedErr.message }, { status: 400 });

    const markedIds = (markedRows || []).map((r) => r.question_id).filter(Boolean);
    restrictIds = intersect(restrictIds, markedIds);
    if (!restrictIds || restrictIds.length === 0) return NextResponse.json({ items: [], totalCount: 0 });
  }

  // 3) broken_only restriction
  if (broken_only) {
    if (!userId) return NextResponse.json({ items: [], totalCount: 0 });

    const { data: brokenRows, error: brokenErr } = await supabase
      .from('question_status')
      .select('question_id')
      .eq('user_id', userId)
      .eq('is_broken', true)
      .limit(10000);

    if (brokenErr) return NextResponse.json({ error: brokenErr.message }, { status: 400 });

    const brokenIds = (brokenRows || []).map((r) => r.question_id).filter(Boolean);
    restrictIds = intersect(restrictIds, brokenIds);
    if (!restrictIds || restrictIds.length === 0) return NextResponse.json({ items: [], totalCount: 0 });
  }

  // 4) wrong_only restriction (is_done=true AND last_is_correct=false)
  if (wrong_only) {
    if (!userId) return NextResponse.json({ items: [], totalCount: 0 });

    const { data: wrongRows, error: wrongErr } = await supabase
      .from('question_status')
      .select('question_id')
      .eq('user_id', userId)
      .eq('is_done', true)
      .eq('last_is_correct', false)
      .limit(10000);

    if (wrongErr) return NextResponse.json({ error: wrongErr.message }, { status: 400 });

    const wrongIds = (wrongRows || []).map((r) => r.question_id).filter(Boolean);
    restrictIds = intersect(restrictIds, wrongIds);
    if (!restrictIds || restrictIds.length === 0) return NextResponse.json({ items: [], totalCount: 0 });
  }

  // 5) Domain / topic restriction — pre-fetch taxonomy IDs so we can union domain+topic matches
  if (domainList.length > 0 || topicList.length > 0) {
    const matchingIds = new Set();

    if (domainList.length > 0) {
      const { data: drows, error: dErr } = await supabase
        .from('question_taxonomy')
        .select('question_id')
        .in('domain_name', domainList);
      if (dErr) return NextResponse.json({ error: dErr.message }, { status: 400 });
      (drows || []).forEach((r) => r.question_id && matchingIds.add(r.question_id));
    }

    if (topicList.length > 0) {
      const { data: trows, error: tErr } = await supabase
        .from('question_taxonomy')
        .select('question_id')
        .in('skill_name', topicList);
      if (tErr) return NextResponse.json({ error: tErr.message }, { status: 400 });
      (trows || []).forEach((r) => r.question_id && matchingIds.add(r.question_id));
    }

    const taxIds = Array.from(matchingIds);
    restrictIds = intersect(restrictIds, taxIds);
    if (!restrictIds || restrictIds.length === 0) return NextResponse.json({ items: [], totalCount: 0 });
  }

  // Main query
  let q = supabase
    .from('questions')
    .select(
      `
      id,
      question_id,
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
        is_broken,
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
        is_broken: st?.is_broken ?? false,
        attempts_count: st?.attempts_count ?? 0,
        correct_attempts_count: st?.correct_attempts_count ?? 0,
        last_is_correct: st?.last_is_correct ?? null,
      };
    })
    .filter(Boolean);

  return NextResponse.json({
    items,
    totalCount: typeof count === 'number' ? count : 0,
  });
}

// Intersect an existing restriction set with a new list.
// If existing is null (no restriction yet), the new list becomes the restriction.
function intersect(existing, incoming) {
  if (existing === null) return incoming;
  const set = new Set(existing);
  return incoming.filter((id) => set.has(id));
}
