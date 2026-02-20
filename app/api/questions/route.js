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

  // Base from questions so we can embed BOTH taxonomy and status via real FKs.
  let q = supabase
    .from('questions')
    .select(`
      id,
      question_taxonomy (
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

  // Filter on embedded taxonomy fields
  if (difficulty) q = q.eq('question_taxonomy.difficulty', Number(difficulty));
  if (score_band) q = q.eq('question_taxonomy.score_band', Number(score_band));
  if (domain) q = q.ilike('question_taxonomy.domain_name', `%${domain}%`);
  if (skill) q = q.ilike('question_taxonomy.skill_name', `%${skill}%`);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const items = (data || [])
    .map((row) => {
      const tax = row.question_taxonomy?.[0] ?? row.question_taxonomy ?? null;

      // question_status is per-user; if you have RLS, it should already only return the current user's rows.
      const st = Array.isArray(row.question_status) ? row.question_status[0] : row.question_status;

      if (!tax) return null;

      return {
        question_id: row.id, // IMPORTANT: using questions.id as the question id throughout the app
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
