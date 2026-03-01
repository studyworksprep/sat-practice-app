import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';

// GET /api/dashboard
export async function GET() {
  const supabase = createClient();
  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr || !auth?.user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const user = auth.user;

  // Step 1: fetch completed question statuses for this user
  const { data: statusRows, error } = await supabase
    .from('question_status')
    .select('question_id, last_is_correct, last_attempt_at')
    .eq('user_id', user.id)
    .eq('is_done', true)
    .order('last_attempt_at', { ascending: false })
    .limit(5000);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const rows = statusRows || [];

  // Step 2: fetch taxonomy for all unique question IDs (avoids FK join issues)
  const taxMap = {};
  if (rows.length > 0) {
    const ids = [...new Set(rows.map(r => r.question_id))];
    const { data: taxRows, error: taxErr } = await supabase
      .from('question_taxonomy')
      .select('question_id, domain_name, skill_name, difficulty')
      .in('question_id', ids);

    if (taxErr) return NextResponse.json({ error: taxErr.message }, { status: 400 });

    for (const t of (taxRows || [])) taxMap[t.question_id] = t;
  }

  // Domain stats
  const domainMap = {};
  for (const row of rows) {
    const domain = taxMap[row.question_id]?.domain_name || 'Unknown';
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
    const domain = taxMap[row.question_id]?.domain_name || 'Unknown';
    const skill = taxMap[row.question_id]?.skill_name || 'Unknown';
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
    domain_name: taxMap[row.question_id]?.domain_name || 'Unknown',
    skill_name: taxMap[row.question_id]?.skill_name || 'Unknown',
    difficulty: taxMap[row.question_id]?.difficulty ?? null,
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
