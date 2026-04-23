// Student dashboard. Server Component-first per
// docs/architecture-plan.md §3.4. Layout shape ported from the
// design-kit Dashboard:
//
//   1. Banner — greeting, target / days-to-test chips, Resume +
//      Start practice CTAs
//   2. Stats row — four tiles (attempts, accuracy, this week, days
//      to test) computed from the attempts table
//   3. Performance grid — per-domain accuracy bars split into
//      Math and Reading & Writing columns
//   4. Bottom row — Recent practice sessions + Assignments,
//      side-by-side
//   5. Target-score editor (small form, kept from the previous
//      version)
//
// Every block reads from the server in this single page; the
// client island just renders. No useEffect + fetch.

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { domainSection } from '@/lib/ui/question-layout';
import { updateTargetScore } from './actions';
import { DashboardInteractive } from './DashboardInteractive';

export const dynamic = 'force-dynamic';

const PERFORMANCE_LOOKBACK_DAYS = 90;
const RECENT_SESSIONS_CAP = 5;
const RECENT_SESSIONS_LOOKUP_LIMIT = 25;

export default async function StudentDashboardPage() {
  const { user, profile, supabase } = await requireUser();

  // Same role gate the layout already runs — keep it here too so
  // direct page hits are guarded if the layout ever stops gating.
  if (profile.role === 'admin') redirect('/admin');
  if (profile.role === 'teacher' || profile.role === 'manager') redirect('/tutor/dashboard');
  if (profile.role === 'practice') redirect('/subscribe');

  const sevenDaysAgo  = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const lookbackStart = new Date(Date.now() - PERFORMANCE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // Eight Promise.all queries — runs in parallel server-side. Most
  // are tiny aggregates; the performance one (with embedded join)
  // is the largest but bounded to the lookback window.
  const [
    { data: fullProfile },
    { count: totalAttempts },
    { count: correctAttempts },
    { count: weekAttempts },
    { data: perfRows },
    { data: recentSessions },
    { data: assignmentRows },
    { data: activeSession },
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('first_name, last_name, target_sat_score, high_school, graduation_year, sat_test_date')
      .eq('id', user.id)
      .maybeSingle(),
    supabase
      .from('attempts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('source', 'practice'),
    supabase
      .from('attempts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('source', 'practice')
      .eq('is_correct', true),
    supabase
      .from('attempts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('source', 'practice')
      .gte('created_at', sevenDaysAgo),
    // Per-domain accuracy via embedded join. The !inner join means
    // attempts on questions that were since deleted from v2 are
    // dropped from the aggregate, which is what we want — a
    // student's performance breakdown shouldn't include rows we
    // can no longer attribute to a domain.
    supabase
      .from('attempts')
      .select('is_correct, questions_v2!inner(domain_code, domain_name)')
      .eq('user_id', user.id)
      .eq('source', 'practice')
      .gte('created_at', lookbackStart)
      .limit(5000),
    // Recent practice sessions. We pull a few extra rows so we can
    // skip ones with empty question_ids (manual seed runs, etc.)
    // and still surface the requested cap.
    supabase
      .from('practice_sessions')
      .select('id, created_at, question_ids, current_position, mode')
      .eq('user_id', user.id)
      .eq('mode', 'practice')
      .order('created_at', { ascending: false })
      .limit(RECENT_SESSIONS_LOOKUP_LIMIT),
    // Assignments panel — same query the prior dashboard used.
    supabase
      .from('assignment_students_v2')
      .select(`
        completed_at,
        assignment:assignments_v2 (
          id, assignment_type, title, due_date, archived_at, deleted_at,
          question_ids,
          lesson:lessons (title),
          practice_test:practice_tests_v2 (name)
        )
      `)
      .eq('student_id', user.id),
    // Active session, if any, to power the Resume CTA.
    supabase
      .from('practice_sessions')
      .select('id, current_position, question_ids, last_activity_at')
      .eq('user_id', user.id)
      .eq('mode', 'practice')
      .gt('expires_at', new Date().toISOString())
      .order('last_activity_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const accuracy = totalAttempts && totalAttempts > 0
    ? Math.round(((correctAttempts ?? 0) / totalAttempts) * 100)
    : null;

  const stats = {
    firstName: fullProfile?.first_name ?? null,
    targetScore: fullProfile?.target_sat_score ?? null,
    satTestDate: fullProfile?.sat_test_date ?? null,
    totalAttempts: totalAttempts ?? 0,
    correctAttempts: correctAttempts ?? 0,
    weekAttempts: weekAttempts ?? 0,
    accuracy,
  };

  // Performance: bucket attempts by domain_name, splitting into
  // Math vs Reading & Writing via domainSection(domain_code).
  // Section accuracy is the weighted average across that section's
  // domains (i.e. correct/total across all attempts in section).
  const performance = aggregatePerformance(perfRows ?? []);

  // Resume info for the banner.
  const resumeInfo = activeSession && Array.isArray(activeSession.question_ids) && activeSession.question_ids.length > 0
    ? {
        sessionId: activeSession.id,
        position:  activeSession.current_position,
        total:     activeSession.question_ids.length,
        lastActivityAt: activeSession.last_activity_at,
      }
    : null;

  // Recent practice sessions for the bottom-row card. Each row
  // becomes a link to its review report. We pull attempt counts in
  // a follow-up batched query so the per-session "X of Y" text
  // shows real data; no separate accuracy because that needs the
  // attempts-by-qid windowed read the /practice/history page does.
  const sessionRows = (recentSessions ?? [])
    .filter((row) => Array.isArray(row.question_ids) && row.question_ids.length > 0)
    .slice(0, RECENT_SESSIONS_CAP)
    .map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      total: row.question_ids.length,
      currentPosition: row.current_position ?? 0,
    }));

  // Assignments panel — same shape the previous dashboard used.
  const assignments = (assignmentRows ?? [])
    .map((r) => ({ ...r.assignment, student_completed_at: r.completed_at }))
    .filter((a) => a && a.id && !a.deleted_at && !a.archived_at && a.student_completed_at == null)
    .sort((a, b) => {
      const aDue = a.due_date ? Date.parse(a.due_date) : Number.POSITIVE_INFINITY;
      const bDue = b.due_date ? Date.parse(b.due_date) : Number.POSITIVE_INFINITY;
      return aDue - bDue;
    })
    .slice(0, 5)
    .map((a) => ({
      id: a.id,
      assignment_type: a.assignment_type,
      title: a.title
        ?? (a.assignment_type === 'lesson' ? a.lesson?.title : null)
        ?? (a.assignment_type === 'practice_test' ? a.practice_test?.name : null)
        ?? 'Assignment',
      due_date: a.due_date,
      n_questions: Array.isArray(a.question_ids) ? a.question_ids.length : null,
    }));

  return (
    <DashboardInteractive
      stats={stats}
      performance={performance}
      recentSessions={sessionRows}
      assignments={assignments}
      resumeInfo={resumeInfo}
      updateTargetScoreAction={updateTargetScore}
    />
  );
}

// ──────────────────────────────────────────────────────────────
// Aggregation helpers.
// ──────────────────────────────────────────────────────────────

function aggregatePerformance(rows) {
  const byDomain = new Map();
  for (const r of rows) {
    const q = r.questions_v2;
    if (!q || !q.domain_name) continue;
    const key = q.domain_name;
    let entry = byDomain.get(key);
    if (!entry) {
      entry = {
        name: q.domain_name,
        code: q.domain_code,
        section: domainSection(q.domain_code),
        correct: 0,
        total: 0,
      };
      byDomain.set(key, entry);
    }
    entry.total += 1;
    if (r.is_correct) entry.correct += 1;
  }

  const all = Array.from(byDomain.values()).sort((a, b) => b.total - a.total);
  const math = all.filter((d) => d.section === 'math');
  const rw   = all.filter((d) => d.section === 'rw');

  return {
    math: {
      domains: math,
      ...sectionTotals(math),
    },
    rw: {
      domains: rw,
      ...sectionTotals(rw),
    },
  };
}

function sectionTotals(domains) {
  let correct = 0;
  let total = 0;
  for (const d of domains) {
    correct += d.correct;
    total += d.total;
  }
  return {
    correct,
    total,
    pct: total > 0 ? Math.round((correct / total) * 100) : null,
  };
}
