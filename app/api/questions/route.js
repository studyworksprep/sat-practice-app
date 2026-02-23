import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';

// GET /api/questions?difficulty=&score_bands=1,2,3&domain=&topic=&marked_only=&q=&limit=&offset=
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const difficulty = searchParams.get('difficulty');
  const score_bands_raw = searchParams.get('score_bands'); // comma-separated
  const domain = searchParams.get('domain');
  const topic = searchParams.get('topic');
  const marked_only = searchParams.get('marked_only') === 'true';
  const qText = (searchParams.get('q') || '').trim();
  const limit = Math.min(parseInt(searchParams.get('limit') || '25', 10), 100);
  const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10), 0);

  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user ?? null;

  const score_bands = (score_bands_raw || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => Number(s))
    .filter(n => Number.isFinite(n));

  // If q is provided, we try to match across multiple fields:
  // - questions.question_id (text identifier if present)
  // - question_versions (current) stem_html / stimulus_html
  // We gather matching question UUIDs, then apply as an .in('id', ...).
  let restrictIds = null;
  if (qText) {
    const safe = qText.replace(/[%_]/g, '\\$&'); // escape wildcards a bit
    const pattern = `%${safe}%`;

    const ids = new Set();

    // Match questions.question_id
    const { data: qrows } = await supabase
      .from('questions')
      .select('id, question_id')
      .ilike('question_id', pattern)
      .limit(500);
    (qrows || []).forEach(r => r?.id && ids.add(r.id));

    // Match current question_versions stem/stimulus
    const { data: vrows } = await supabase
      .from('question_versions')
      .select('question_id, stem_html, stimulus_html')
      .eq('is_current', true)
      .or(`stem_html.ilike.${pattern},stimulus_html.ilike.${pattern}`)
      .limit(500);
    (vrows || []).forEach(r => r?.question_id && ids.add(r.question_id));

    restrictIds = Array.from(ids);
    if (restrictIds.length === 0) {
      return NextResponse.json({ items: [] });
    }
  }

  let q = supabase
    .from('questions')
    .select(`
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
        attempts_count,
        correct_attempts_count
      )
    `)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (restrictIds) q = q.in('id', restrictIds);

  if (difficulty) q = q.eq('question_taxonomy.difficulty', Number(difficulty));
  if (score_bands.length > 0) q = q.in('question_taxonomy.score_band', score_bands);
  if (domain) q = q.eq('question_taxonomy.domain_name', domain);
  if (topic) q = q.eq('question_taxonomy.skill_name', topic);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const items = (data || [])
    .map((row) => {
      const tax = row.question_taxonomy?.[0] ?? row.question_taxonomy ?? null;
      const st = Array.isArray(row.question_status) ? row.question_status[0] : row.question_status;
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
        attempts_count: st?.attempts_count ?? 0,
        correct_attempts_count: st?.correct_attempts_count ?? 0,
      };
    })
    .filter(Boolean)
    .filter((item) => (marked_only ? item.marked_for_review : true));

  return NextResponse.json({ items });
}
