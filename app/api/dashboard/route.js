import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';

// GET /api/dashboard
export async function GET() {
  const supabase = createClient();
  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr || !auth?.user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const user = auth.user;

  const { data, error } = await supabase
    .from('question_status')
    .select(`
      question_id,
      last_is_correct,
      last_attempt_at,
      question_taxonomy:question_taxonomy!inner(domain_name, skill_name, difficulty)
    `)
    .eq('user_id', user.id)
    .eq('is_done', true)
    .order('last_attempt_at', { ascending: false })
    .limit(5000);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const rows = data || [];

  // Domain stats
  const domainMap = {};
  for (const row of rows) {
    const domain = row.question_taxonomy?.domain_name || 'Unknown';
    if (!domainMap[domain]) domainMap[domain] = { domain_name: domain, attempted: 0, correct: 0 };
    domainMap[domain].attempted++;
    if (row.last_is_correct) domainMap[domain].correct++;
  }
  const domainStats = Object.values(domainMap).sort((a, b) =>
    a.domain_name.localeCompare(b.domain_name)
  );

  // Topic stats
  const topicMap = {};
  for (const row of rows) {
    const domain = row.question_taxonomy?.domain_name || 'Unknown';
    const skill = row.question_taxonomy?.skill_name || 'Unknown';
    const key = `${domain}::${skill}`;
    if (!topicMap[key]) topicMap[key] = { domain_name: domain, skill_name: skill, attempted: 0, correct: 0 };
    topicMap[key].attempted++;
    if (row.last_is_correct) topicMap[key].correct++;
  }
  const topicStats = Object.values(topicMap).sort((a, b) =>
    a.skill_name.localeCompare(b.skill_name)
  );

  // Recent activity (last 10)
  const recentActivity = rows.slice(0, 10).map(row => ({
    question_id: row.question_id,
    domain_name: row.question_taxonomy?.domain_name || 'Unknown',
    skill_name: row.question_taxonomy?.skill_name || 'Unknown',
    difficulty: row.question_taxonomy?.difficulty ?? null,
    last_is_correct: row.last_is_correct,
    last_attempt_at: row.last_attempt_at,
  }));

  return NextResponse.json({
    domainStats,
    topicStats,
    recentActivity,
    totalAttempted: rows.length,
    totalCorrect: rows.filter(r => r.last_is_correct).length,
  });
}
