import { NextResponse } from 'next/server';
import { createClient } from '../../../../lib/supabase/server';

// GET /api/admin/broken-questions
// Returns all questions flagged as broken, with who flagged them and taxonomy info.
export async function GET() {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: rows, error } = await supabase
    .from('questions')
    .select(`
      id,
      question_id,
      is_broken,
      broken_by,
      broken_at
    `)
    .eq('is_broken', true)
    .order('broken_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!rows || rows.length === 0) return NextResponse.json({ questions: [] });

  // Fetch taxonomy for each broken question
  const qIds = rows.map(r => r.id);
  const { data: taxRows } = await supabase
    .from('question_taxonomy')
    .select('question_id, domain_code, domain_name, skill_name, difficulty')
    .in('question_id', qIds);

  const taxMap = {};
  for (const t of taxRows || []) taxMap[t.question_id] = t;

  // Fetch profiles of users who flagged
  const flaggers = [...new Set(rows.map(r => r.broken_by).filter(Boolean))];
  const profileMap = {};
  if (flaggers.length > 0) {
    for (let i = 0; i < flaggers.length; i += 200) {
      const chunk = flaggers.slice(i, i + 200);
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email, role')
        .in('id', chunk);
      for (const p of profs || []) profileMap[p.id] = p;
    }
  }

  const questions = rows.map(r => {
    const tax = taxMap[r.id] || {};
    const flagger = profileMap[r.broken_by] || null;
    const flaggedByName = flagger
      ? [flagger.first_name, flagger.last_name].filter(Boolean).join(' ') || flagger.email
      : null;

    return {
      question_id: r.question_id || r.id,
      broken_at: r.broken_at,
      flagged_by: flaggedByName,
      flagged_by_role: flagger?.role || null,
      domain_name: tax.domain_name || null,
      skill_name: tax.skill_name || null,
      difficulty: tax.difficulty ?? null,
    };
  });

  return NextResponse.json({ questions });
}
