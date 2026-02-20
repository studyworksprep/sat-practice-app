import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';

// GET /api/questions?difficulty=&score_band=&domain=&skill=&marked_only=&limit=&offset=
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const difficulty = searchParams.get('difficulty');
  const score_band = searchParams.get('score_band');
  const domain = searchParams.get('domain');
  const skill = searchParams.get('skill');
  const marked_only = searchParams.get('marked_only') === 'true';
  const limit = Math.min(parseInt(searchParams.get('limit') || '25', 10), 100);
  const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10), 0);

  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user ?? null;

  // We query taxonomy and join to question_status (left) to show per-user info.
  // Requires FK question_taxonomy.question_id -> questions.id and question_status.question_id -> questions.id.
  let q = supabase
    .from('question_taxonomy')
    .select(`
      question_id,
      domain_code,
      domain_name,
      skill_code,
      skill_name,
      difficulty,
      score_band,
      question_status!left(user_id,question_id,is_done,marked_for_review,attempts_count,correct_attempts_count)
    `)
    .order('difficulty', { ascending: true })
    .range(offset, offset + limit - 1);

  if (difficulty) q = q.eq('difficulty', Number(difficulty));
  if (score_band) q = q.eq('score_band', Number(score_band));
  if (domain) q = q.ilike('domain_name', `%${domain}%`);
  if (skill) q = q.ilike('skill_name', `%${skill}%`);

  // If you want marked-only, filter after we join; easiest is to fetch and filter in memory.
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const items = (data || []).map(row => {
    const st = Array.isArray(row.question_status) ? row.question_status[0] : row.question_status;
    return {
      question_id: row.question_id,
      domain_code: row.domain_code,
      domain_name: row.domain_name,
      skill_code: row.skill_code,
      skill_name: row.skill_name,
      difficulty: row.difficulty,
      score_band: row.score_band,
      is_done: st?.is_done ?? false,
      marked_for_review: st?.marked_for_review ?? false,
    };
  }).filter(item => marked_only ? item.marked_for_review : true);

  return NextResponse.json({ items });
}
