import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';

// GET /api/review
export async function GET() {
  const supabase = createClient();
  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr || !auth?.user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const user = auth.user;

  const { data, error } = await supabase
    .from('questions')
    .select(`
      id,
      question_taxonomy (
        domain_code,
        domain_name,
        skill_code,
        skill_name,
        difficulty,
        score_band
      ),
      question_status!inner (
        user_id,
        question_id,
        marked_for_review,
        attempts_count,
        correct_attempts_count,
        updated_at
      )
    `)
    .eq('question_status.user_id', user.id)
    .eq('question_status.marked_for_review', true)
    .order('question_status.updated_at', { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const items = (data || []).map((row) => {
    const tax = row.question_taxonomy?.[0] ?? row.question_taxonomy ?? null;
    const st = Array.isArray(row.question_status) ? row.question_status[0] : row.question_status;

    return {
      question_id: row.id,
      attempts_count: st?.attempts_count ?? 0,
      correct_attempts_count: st?.correct_attempts_count ?? 0,
      domain_code: tax?.domain_code,
      domain_name: tax?.domain_name,
      skill_code: tax?.skill_code,
      skill_name: tax?.skill_name,
      difficulty: tax?.difficulty,
      score_band: tax?.score_band,
    };
  });

  return NextResponse.json({ items });
}
