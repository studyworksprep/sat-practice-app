import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';

// GET /api/review
export async function GET() {
  const supabase = createClient();
  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr || !auth?.user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const user = auth.user;

  // Pull marked question_status and join to taxonomy
  const { data, error } = await supabase
    .from('question_status')
    .select(`
      question_id,
      marked_for_review,
      attempts_count,
      correct_attempts_count,
      question_taxonomy:question_taxonomy!inner(domain_code,domain_name,skill_code,skill_name,difficulty,score_band)
    `)
    .eq('user_id', user.id)
    .eq('marked_for_review', true)
    .order('updated_at', { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const items = (data || []).map(row => ({
    question_id: row.question_id,
    attempts_count: row.attempts_count,
    correct_attempts_count: row.correct_attempts_count,
    domain_code: row.question_taxonomy?.domain_code,
    domain_name: row.question_taxonomy?.domain_name,
    skill_code: row.question_taxonomy?.skill_code,
    skill_name: row.question_taxonomy?.skill_name,
    difficulty: row.question_taxonomy?.difficulty,
    score_band: row.question_taxonomy?.score_band,
  }));

  return NextResponse.json({ items });
}
