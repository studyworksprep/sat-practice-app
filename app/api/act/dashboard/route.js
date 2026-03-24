import { NextResponse } from 'next/server';
import { createClient } from '../../../../lib/supabase/server';

// GET /api/act/dashboard
// Returns ACT-specific dashboard data: section/category stats, recent accuracy, sessions, streak
export async function GET() {
  const supabase = createClient();
  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr || !auth?.user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const userId = auth.user.id;

  // Parallel batch: attempts + profile
  const [{ data: attempts, error: attErr }, { data: profile }] = await Promise.all([
    supabase
      .from('act_attempts')
      .select('id, question_id, is_correct, time_spent_ms, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5000),
    supabase
      .from('profiles')
      .select('first_name, last_name')
      .eq('id', userId)
      .maybeSingle(),
  ]);

  if (attErr) return NextResponse.json({ error: attErr.message }, { status: 400 });
  const allAttempts = attempts || [];

  if (allAttempts.length === 0) {
    return NextResponse.json({
      totalAttempted: 0, totalCorrect: 0,
      sectionStats: [], categoryStats: [],
      recentAccuracy: null, recentSessions: [],
      currentStreak: 0, practicedToday: false,
      strongest: null, weakest: null,
    });
  }

  // Fetch question metadata for all attempted questions
  const qIds = [...new Set(allAttempts.map(a => a.question_id))];
  const { data: questions, error: qErr } = await supabase
    .from('act_questions')
    .select('id, section, category_code, category, subcategory_code, subcategory, difficulty')
    .in('id', qIds);

  if (qErr) return NextResponse.json({ error: qErr.message }, { status: 400 });

  const qMap = {};
  for (const q of (questions || [])) qMap[q.id] = q;

  // Deduplicate: keep only first attempt per question
  const firstAttempts = {};
  // Iterate oldest-first for first-attempt dedup
  for (let i = allAttempts.length - 1; i >= 0; i--) {
    const a = allAttempts[i];
    if (!firstAttempts[a.question_id]) firstAttempts[a.question_id] = a;
  }
  const uniqueAttempts = Object.values(firstAttempts);

  // Section stats
  const sectionMap = {};
  const categoryMap = {};

  for (const att of uniqueAttempts) {
    const q = qMap[att.question_id];
    if (!q) continue;

    const sec = q.section || 'unknown';
    if (!sectionMap[sec]) sectionMap[sec] = { section: sec, attempted: 0, correct: 0 };
    sectionMap[sec].attempted++;
    if (att.is_correct) sectionMap[sec].correct++;

    const catKey = q.category_code || q.category || 'Unknown';
    const fullKey = `${sec}::${catKey}`;
    if (!categoryMap[fullKey]) {
      categoryMap[fullKey] = {
        section: sec,
        category_code: q.category_code,
        category: q.category || catKey,
        attempted: 0, correct: 0,
        subcategories: {},
      };
    }
    categoryMap[fullKey].attempted++;
    if (att.is_correct) categoryMap[fullKey].correct++;

    if (q.subcategory) {
      const subKey = q.subcategory_code || q.subcategory;
      if (!categoryMap[fullKey].subcategories[subKey]) {
        categoryMap[fullKey].subcategories[subKey] = {
          subcategory_code: q.subcategory_code,
          subcategory: q.subcategory,
          attempted: 0, correct: 0,
        };
      }
      categoryMap[fullKey].subcategories[subKey].attempted++;
      if (att.is_correct) categoryMap[fullKey].subcategories[subKey].correct++;
    }
  }

  const sectionStats = Object.values(sectionMap).sort((a, b) => a.section.localeCompare(b.section));
  const categoryStats = Object.values(categoryMap).map(c => ({
    ...c,
    subcategories: Object.values(c.subcategories),
  })).sort((a, b) => a.section.localeCompare(b.section) || a.category.localeCompare(b.category));

  // Total counts
  const totalAttempted = uniqueAttempts.length;
  const totalCorrect = uniqueAttempts.filter(a => a.is_correct).length;

  // Recent accuracy (last 50 first-attempts by date)
  const sortedUnique = [...uniqueAttempts].sort((a, b) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  const recent50 = sortedUnique.slice(0, 50);
  const recentCorrect = recent50.filter(a => a.is_correct).length;
  const recentAccuracy = recent50.length > 0 ? Math.round((recentCorrect / recent50.length) * 100) : null;

  // Strongest / weakest category (min 3 attempts)
  const catArr = Object.values(categoryMap)
    .filter(c => c.attempted >= 3)
    .map(c => ({
      category: c.category,
      section: c.section,
      pct: Math.round((c.correct / c.attempted) * 100),
      attempted: c.attempted,
    }))
    .sort((a, b) => b.pct - a.pct);
  const strongest = catArr[0] || null;
  const weakest = catArr.length > 1 ? catArr[catArr.length - 1] : null;

  // Recent practice sessions (group by 2-hour gap)
  const SESSION_GAP_MS = 2 * 60 * 60 * 1000;
  const sessions = [];
  let currentSession = null;

  for (const att of allAttempts) {
    const ts = new Date(att.created_at).getTime();
    if (!currentSession || (currentSession.lastTs - ts) > SESSION_GAP_MS) {
      currentSession = { startedAt: att.created_at, lastTs: ts, questions: [] };
      sessions.push(currentSession);
    }
    currentSession.lastTs = ts;
    const existing = currentSession.questions.find(q => q.question_id === att.question_id);
    if (!existing) {
      const q = qMap[att.question_id];
      currentSession.questions.push({
        question_id: att.question_id,
        is_correct: att.is_correct,
        section: q?.section || null,
        category: q?.category || null,
        difficulty: q?.difficulty ?? null,
      });
    } else {
      existing.is_correct = att.is_correct;
    }
  }

  for (const s of sessions) {
    s.questions.reverse();
    delete s.lastTs;
  }
  const recentSessions = sessions.slice(0, 5);

  // Streak calculation (from all attempts)
  const practiceDays = new Set();
  for (const att of allAttempts) {
    const d = new Date(att.created_at);
    practiceDays.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const practicedToday = practiceDays.has(todayStr);

  let currentStreak = 0;
  let checkDate = new Date(today);
  if (!practicedToday) checkDate.setDate(checkDate.getDate() - 1);
  for (let i = 0; i < 365; i++) {
    const dateStr = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, '0')}-${String(checkDate.getDate()).padStart(2, '0')}`;
    if (practiceDays.has(dateStr)) {
      currentStreak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }

  return NextResponse.json({
    totalAttempted,
    totalCorrect,
    sectionStats,
    categoryStats,
    recentAccuracy,
    recentSessions,
    currentStreak,
    practicedToday,
    strongest,
    weakest,
  });
}
