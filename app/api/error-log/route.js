import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';

// GET /api/error-log — fetch all questions with notes (error log entries)
export async function GET() {
  const supabase = createClient();
  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr || !auth?.user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const user = auth.user;

  // Fetch question_status rows that have non-empty notes
  const { data: statusRows, error } = await supabase
    .from('question_status')
    .select('question_id, notes, last_is_correct, attempts_count, correct_attempts_count, updated_at')
    .eq('user_id', user.id)
    .neq('notes', '')
    .not('notes', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!statusRows?.length) return NextResponse.json({ items: [] });

  // Fetch taxonomy
  const qids = statusRows.map(r => r.question_id);
  const taxMap = {};
  const { data: taxRows } = await supabase
    .from('question_taxonomy')
    .select('question_id, domain_code, domain_name, skill_code, skill_name, difficulty, score_band')
    .in('question_id', qids);
  for (const t of (taxRows || [])) taxMap[t.question_id] = t;

  const items = statusRows.map(row => {
    const tax = taxMap[row.question_id] || {};
    return {
      question_id: row.question_id,
      notes: row.notes,
      last_is_correct: row.last_is_correct,
      attempts_count: row.attempts_count,
      correct_attempts_count: row.correct_attempts_count,
      updated_at: row.updated_at,
      domain_code: tax.domain_code || null,
      domain_name: tax.domain_name || null,
      skill_code: tax.skill_code || null,
      skill_name: tax.skill_name || null,
      difficulty: tax.difficulty || null,
      score_band: tax.score_band || null,
    };
  });

  return NextResponse.json({ items });
}
