import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';

// GET /api/questions?difficulty=&score_bands=1,2,3&domain=&topic=&marked_only=&q=&limit=&offset=
export async function GET(request) {
  const { searchParams } = new URL(request.url);

  const difficulty = searchParams.get('difficulty');
  const score_bands_raw = searchParams.get('score_bands'); // comma-separated
  const domain = searchParams.get('domain'); // domain_name
  const topic = searchParams.get('topic'); // skill_name
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

  const score_bands = (score_bands_raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n));

  // Build an ID restriction set as we apply q and marked_only.
  // This is always question UUIDs (questions.id).
  let restrictIds = null;

  // 1) q search restriction (question_id text OR current stem/stimulus)
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

  // 2) marked_only restriction (must be per-user)
  if (marked_only) {
    if (!userId) {
      // If not signed in, user can't have per-user marks.
      return NextResponse.json({ items: [], totalCount: 0 });
    }

    const { data: markedRows, error: markedErr } = await supabase
      .from('question_status')
      .select('question_id')
      .eq('user_id', userId)
      .eq('marked_for_review', true)
      .limit(10000);

    if (markedErr) return NextResponse.json({ error: markedErr.message }, { status: 400 });

    const markedIds = (markedRows || []).map((r) => r.question_id).filter(Boolean);

    if (restrictIds) {
      const setRestrict = new Set(restrictIds);
      restrictIds = markedIds.filter((id) => setRestrict.has(id));
    } else {
      restrictIds = markedIds;
    }

    if (!restrictIds || restrictIds.length === 0) {
      return NextResponse.json({ items: [], totalCount: 0 });
    }
  }

  // 3) broken_only restriction (must be per-user)
  if (broken_only) {
    if (!userId) {
      return NextResponse.json({ items: [], totalCount: 0 });
    }

    const { data: brokenRows, error: brokenErr } = await supabase
      .from('question_status')
      .select('question_id')
      .eq('user_id', userId)
      .eq('is_broken', true)
      .limit(10000);

    if (brokenErr) return NextResponse.json({ error: brokenErr.message }, { status: 400 });

    const brokenIds = (brokenRows || []).map((r) => r.question_id).filter(Boolean);

    if (restrictIds) {
      const setRestrict = new Set(restrictIds);
      restrictIds = brokenIds.filter((id) => setRestrict.has(id));
    } else {
      restrictIds = brokenIds;
    }

    if (!restrictIds || restrictIds.length === 0) {
      return NextResponse.json({ items: [], totalCount: 0 });
    }
  }

  // Main query with count
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

  if (difficulty) q = q.eq('question_taxonomy.difficulty', Number(difficulty));
  if (score_bands.length > 0) q = q.in('question_taxonomy.score_band', score_bands);
  if (domain) q = q.eq('question_taxonomy.domain_name', domain);
  if (topic) q = q.eq('question_taxonomy.skill_name', topic);

  q = q.range(offset, offset + limit - 1);

  const { data, error, count } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const items = (data || [])
    .map((row) => {
      const tax = row.question_taxonomy?.[0] ?? row.question_taxonomy ?? null;

      // pick status row for this user if present
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
