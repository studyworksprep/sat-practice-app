import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/api/auth';
import { legacyApiRoute } from '@/lib/api/response';

// GET /api/admin/platform-stats
// Returns active-user counts, practice volume trends, and feature adoption data.
export const GET = legacyApiRoute(async () => {
  const { supabase } = await requireRole(['admin']);

  const now = new Date();
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const d7 = new Date(now); d7.setDate(d7.getDate() - 7);
  const d30 = new Date(now); d30.setDate(d30.getDate() - 30);

  // ── 1) Active Users ─────────────────────────────────────────────
  // "Active" = has at least one attempt in the period. Counting
  // distinct user_ids requires either an RPC (fast) or paging through
  // every attempt row (slow, needs careful pagination).
  //
  // Root cause of the bug this replaces:
  // The old code ran `.from('attempts').select(...).gte(...).limit(50000)`
  // with NO `.order()` clause. Supabase hosted projects set PostgREST's
  // `db-max-rows` to 1000 by default, so the `.limit(50000)` was silently
  // capped at 1000 rows. Without an order clause PostgREST returned
  // those 1000 rows in physical insertion order — effectively the
  // OLDEST 1000 attempts in the queried window — and every attempt
  // newer than that disappeared from the stats. This is why 294+340+366
  // = exactly 1000 on the Practice Volume chart: the oldest 1000 rows
  // spanned the first three weeks and the other 5 weeks came up empty.
  const [au1, au7, au30] = await Promise.all([
    supabase.rpc('count_distinct_users_since', { since: todayStart.toISOString() }),
    supabase.rpc('count_distinct_users_since', { since: d7.toISOString() }),
    supabase.rpc('count_distinct_users_since', { since: d30.toISOString() }),
  ]);

  let activeToday = au1?.error ? null : au1?.data ?? null;
  let active7d    = au7?.error ? null : au7?.data ?? null;
  let active30d   = au30?.error ? null : au30?.data ?? null;

  // Fallback: RPC is missing or errored. Page through attempts ordered
  // by created_at DESC using `.range()` so we can walk past the
  // db-max-rows cap one page at a time. Page size is deliberately set
  // below 1000 so we stay under the default cap even if a self-hosted
  // instance has tightened it further. We keep paging while we're
  // getting full pages; a short page means we've reached the end.
  if (activeToday === null || active7d === null || active30d === null) {
    const PAGE = 500;
    const MAX_PAGES = 200; // 100k rows max; plenty for a single month
    const users1 = new Set();
    const users7 = new Set();
    const users30 = new Set();
    let page = 0;
    let done = false;
    while (!done && page < MAX_PAGES) {
      const from = page * PAGE;
      const { data: rows, error } = await supabase
        .from('attempts')
        .select('user_id, created_at')
        .gte('created_at', d30.toISOString())
        .order('created_at', { ascending: false })
        .range(from, from + PAGE - 1);
      if (error || !rows || rows.length === 0) break;
      for (const a of rows) {
        const t = new Date(a.created_at);
        users30.add(a.user_id);
        if (t >= d7) users7.add(a.user_id);
        if (t >= todayStart) users1.add(a.user_id);
      }
      if (rows.length < PAGE) done = true;
      page++;
    }
    activeToday = users1.size;
    active7d = users7.size;
    active30d = users30.size;
  }

  // Active users by role (last 30 days). Same ordered `.range()`
  // pagination so we don't hit the db-max-rows cap and silently drop
  // recent users the way the previous `.limit(50000)` without
  // `.order()` did.
  const activeByRole = { student: 0, teacher: 0, manager: 0, admin: 0, practice: 0 };
  {
    const PAGE = 500;
    const MAX_PAGES = 200;
    const userIds = new Set();
    let page = 0;
    let done = false;
    while (!done && page < MAX_PAGES) {
      const from = page * PAGE;
      const { data: rows, error } = await supabase
        .from('attempts')
        .select('user_id')
        .gte('created_at', d30.toISOString())
        .order('created_at', { ascending: false })
        .range(from, from + PAGE - 1);
      if (error || !rows || rows.length === 0) break;
      for (const r of rows) if (r.user_id) userIds.add(r.user_id);
      if (rows.length < PAGE) done = true;
      page++;
    }

    const activeUserIds30 = [...userIds];
    if (activeUserIds30.length > 0) {
      for (let i = 0; i < activeUserIds30.length; i += 200) {
        const chunk = activeUserIds30.slice(i, i + 200);
        const { data: profs } = await supabase
          .from('profiles')
          .select('role')
          .in('id', chunk);
        for (const p of profs || []) {
          if (activeByRole[p.role] !== undefined) activeByRole[p.role]++;
        }
      }
    }
  }

  // ── 2) Practice Volume (weekly, last 8 weeks) ──────────────────
  // Previous version did `.select('created_at, source').gte(...).limit(50000)`
  // without an `.order()` clause, then bucketed the returned rows in
  // JS. The `.limit(50000)` was silently capped at PostgREST's
  // `db-max-rows` (1000 on Supabase hosted), and since there was no
  // order clause the 1000 rows were the OLDEST in the window. Once
  // attempts_in_window crossed 1000 rows, everything after the first
  // ~1000 vanished from the chart. The symptom: 294+340+366=1000
  // questions across the first three weeks and zero across the other
  // five, regardless of actual attempt volume.
  //
  // The replacement runs one `count: 'exact', head: true` query per
  // week. Count queries are HEAD requests that return a single integer
  // via the Content-Range header — no row data, so db-max-rows doesn't
  // apply. 24 cheap HEAD requests (3 per week × 8 weeks) fire in
  // parallel, and the database does all the aggregation.
  const weeks = [];
  for (let i = 7; i >= 0; i--) {
    const wStart = new Date(now);
    wStart.setDate(wStart.getDate() - (i + 1) * 7);
    wStart.setHours(0, 0, 0, 0);
    const wEnd = new Date(now);
    wEnd.setDate(wEnd.getDate() - i * 7);
    wEnd.setHours(0, 0, 0, 0);
    weeks.push({
      label: wStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      start: wStart,
      end: wEnd,
    });
  }

  // For each week, fire three parallel count queries:
  //   - total attempts
  //   - attempts from a practice test
  //   - completed practice tests finished in that week
  // All use `count: 'exact', head: true` so only the count is
  // transferred, no row data.
  const weekCountPromises = weeks.flatMap((w) => {
    const startIso = w.start.toISOString();
    const endIso = w.end.toISOString();
    return [
      supabase
        .from('attempts')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', startIso)
        .lt('created_at', endIso),
      supabase
        .from('attempts')
        .select('id', { count: 'exact', head: true })
        .eq('source', 'practice_test')
        .gte('created_at', startIso)
        .lt('created_at', endIso),
      supabase
        .from('practice_test_attempts')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'completed')
        .gte('finished_at', startIso)
        .lt('finished_at', endIso),
    ];
  });

  const weekCountResults = await Promise.all(weekCountPromises);

  const volumeWeeks = weeks.map((w, i) => {
    const [totalRes, testQRes, testsRes] = weekCountResults.slice(i * 3, i * 3 + 3);
    return {
      label: w.label,
      questions: totalRes?.count ?? 0,
      testQuestions: testQRes?.count ?? 0,
      testsCompleted: testsRes?.count ?? 0,
    };
  });

  // ── 3) Feature Adoption (last 30 days) ─────────────────────────
  // Count distinct users who used each feature, separated by role.
  // First get role lookup for all users to filter correctly.
  const { data: allProfiles } = await supabase
    .from('profiles')
    .select('id, role');
  const roleById = {};
  for (const p of allProfiles || []) roleById[p.id] = p.role;

  const isStudentRole = (uid) => ['student', 'practice'].includes(roleById[uid]);
  const isTeacherRole = (uid) => ['teacher', 'manager', 'admin'].includes(roleById[uid]);

  const [
    flashcardRes,
    vocabRes,
    lessonProgressRes,
    bugRes,
    practiceTestRes,
    desmosRes,
    assignmentRes,
    notesRes,
    lessonAssignRes,
    registrationRes,
    officialScoreRes,
  ] = await Promise.all([
    // Student features
    supabase.from('flashcard_sets').select('user_id').gte('created_at', d30.toISOString()).limit(10000),
    supabase.from('sat_vocabulary_progress').select('user_id').gte('updated_at', d30.toISOString()).limit(10000),
    supabase.from('lesson_progress').select('user_id').gte('updated_at', d30.toISOString()).limit(10000),
    supabase.from('bug_reports').select('created_by').gte('created_at', d30.toISOString()).limit(10000),
    supabase.from('practice_test_attempts').select('user_id').eq('status', 'completed').gte('finished_at', d30.toISOString()).limit(10000),
    supabase.from('desmos_saved_states').select('saved_by').gte('created_at', d30.toISOString()).limit(10000),
    // Teacher features
    supabase.from('question_assignments').select('teacher_id').gte('created_at', d30.toISOString()).limit(10000),
    supabase.from('question_notes').select('author_id').gte('created_at', d30.toISOString()).limit(10000),
    supabase.from('lesson_assignments').select('teacher_id').gte('created_at', d30.toISOString()).limit(10000),
    supabase.from('sat_test_registrations').select('created_by').gte('created_at', d30.toISOString()).limit(10000),
    supabase.from('sat_official_scores').select('created_by').gte('created_at', d30.toISOString()).limit(10000),
  ]);

  // Count distinct users filtered by role
  const distinctByRole = (rows, field, roleFn) =>
    new Set((rows || []).map(r => r[field]).filter(uid => uid && roleFn(uid))).size;

  const studentAdoption = [
    { feature: 'Practice Tests', users: distinctByRole(practiceTestRes.data, 'user_id', isStudentRole) },
    { feature: 'Flashcards', users: distinctByRole(flashcardRes.data, 'user_id', isStudentRole) },
    { feature: 'SAT Vocabulary', users: distinctByRole(vocabRes.data, 'user_id', isStudentRole) },
    { feature: 'Lessons', users: distinctByRole(lessonProgressRes.data, 'user_id', isStudentRole) },
    { feature: 'Desmos Calculator', users: distinctByRole(desmosRes.data, 'saved_by', isTeacherRole) },
    { feature: 'Bug Reports', users: distinctByRole(bugRes.data, 'created_by', isStudentRole) },
  ];

  const teacherAdoption = [
    { feature: 'Assignments', users: distinctByRole(assignmentRes.data, 'teacher_id', isTeacherRole) },
    { feature: 'Question Notes', users: distinctByRole(notesRes.data, 'author_id', isTeacherRole) },
    { feature: 'Lesson Assignments', users: distinctByRole(lessonAssignRes.data, 'teacher_id', isTeacherRole) },
    { feature: 'Test Registrations', users: distinctByRole(registrationRes.data, 'created_by', isTeacherRole) },
    { feature: 'Official Scores', users: distinctByRole(officialScoreRes.data, 'created_by', isTeacherRole) },
  ];

  // Total counts by role for adoption percentages
  const [{ count: totalStudents }, { count: totalTeachers }] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }).in('role', ['student', 'practice']),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).in('role', ['teacher', 'manager', 'admin']),
  ]);

  return NextResponse.json({
    activeUsers: { today: activeToday, d7: active7d, d30: active30d, byRole: activeByRole },
    volumeWeeks,
    studentAdoption,
    teacherAdoption,
    totalStudents: totalStudents || 0,
    totalTeachers: totalTeachers || 0,
  });
});
