import { NextResponse } from 'next/server';
import { createClient } from '../../../../../lib/supabase/server';

export async function GET(req, { params }) {
  const supabase = createClient();

  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr || !auth?.user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const currentId = params?.questionId; // ✅ FIX HERE
  if (!currentId) {
    return NextResponse.json({ error: 'Missing question id' }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);

  const difficulty = searchParams.get('difficulty');
  const score_bands = searchParams.get('score_bands');
  const domain = searchParams.get('domain');
  const topic = searchParams.get('topic');
  const marked_only = searchParams.get('marked_only') === 'true';

  const userId = auth.user.id;

  const args = {
    current_question_id: currentId,
    p_user_id: userId,
    p_program: 'SAT',
    p_difficulty: difficulty ? Number(difficulty) : null,
    p_score_bands: score_bands
      ? score_bands.split(',').map((n) => Number(n)).filter(Number.isFinite)
      : null,
    p_domain_name: domain || null,
    p_skill_name: topic || null,
    p_marked_only: marked_only,
  };

  const { data, error } = await supabase.rpc('get_question_neighbors', args);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const row = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({
    prev_id: row?.prev_id ?? null,
    next_id: row?.next_id ?? null,
  });


}
