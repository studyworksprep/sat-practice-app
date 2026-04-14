import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';

// GET /api/review
export async function GET() {
  const supabase = await createClient();
  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr || !auth?.user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const user = auth.user;

  // Pull marked question_status rows
  const { data: statusRows, error } = await supabase
    .from('question_status')
    .select('question_id, marked_for_review, attempts_count, correct_attempts_count, notes')
    .eq('user_id', user.id)
    .eq('marked_for_review', true)
    .order('updated_at', { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!statusRows?.length) return NextResponse.json({ items: [] });

  // Fetch taxonomy separately
  const qids = statusRows.map(r => r.question_id);
  const taxMap = {};
  const { data: taxRows } = await supabase
    .from('question_taxonomy')
    .select('question_id, domain_code, domain_name, skill_code, skill_name, difficulty, score_band')
    .in('question_id', qids);
  for (const t of (taxRows || [])) taxMap[t.question_id] = t;

  const items = statusRows
    .filter(row => taxMap[row.question_id])
    .map(row => {
      const tax = taxMap[row.question_id];
      return {
        question_id: row.question_id,
        attempts_count: row.attempts_count,
        correct_attempts_count: row.correct_attempts_count,
        domain_code: tax.domain_code,
        domain_name: tax.domain_name,
        skill_code: tax.skill_code,
        skill_name: tax.skill_name,
        difficulty: tax.difficulty,
        score_band: tax.score_band,
      };
    });

  return NextResponse.json({ items });
}
