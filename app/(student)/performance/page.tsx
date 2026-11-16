// Student → Performance: the full statistics. Thin auth wrapper around
// the shared StudentStatsView server component — the same view a tutor
// sees at /tutor/students/[id]/stats, bound to the authenticated
// student's own user.id and to the sidebar's SAT/ACT choice. The
// dashboard's Progress box is the reduced version and links here.
//
// On SAT, the page also loads the student's official test dates and
// scores for the student-only "Test dates & scores" tab (TestsPanel).

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { hasAssignedTutor } from '@/lib/api/hasAssignedTutor';
import { StudentStatsView } from '@/lib/practice/StudentStatsView';
import { parseStatsTab } from '@/lib/practice/stats-focus';
import { resolveTestType } from '@/lib/practice/test-type-server';
import {
  addDays,
  calendarDay,
  isSelfReported,
  parseTestType,
  resolveTestDate,
  soonestUpcoming,
} from '@/lib/practice/official-tests';
import type { AuthContext } from '@/lib/types';
import { TestsPanel, type TestsPanelProps } from './TestsPanel';

export const dynamic = 'force-dynamic';

/** How far back a past test date still prompts "Got your scores?". */
const AWAITING_SCORES_DAYS = 120;

interface PageProps {
  searchParams: Promise<{ tab?: string | string[]; test?: string | string[] }>;
}

export default async function StudentPerformancePage({ searchParams }: PageProps) {
  const ctx = await requireUser();
  const { user, profile } = ctx;

  // Role gate. The (student) layout enforces this too; the
  // belt-and-suspenders guard here keeps direct-URL hits safe
  // if the layout is ever bypassed.
  if (profile.role === 'admin') redirect('/admin');
  if (profile.role === 'teacher' || profile.role === 'manager') {
    redirect('/tutor/dashboard');
  }
  if (profile.role === 'practice') redirect('/subscribe');

  const sp = await searchParams;
  const testParam = Array.isArray(sp.test) ? sp.test[0] : sp.test;
  const testType = await resolveTestType(testParam);
  const tests = testType === 'sat' ? await loadTestsPanel(ctx) : null;

  return (
    <StudentStatsView
      userId={user.id}
      basePath="/performance"
      keepQuery={testParam === 'sat' || testParam === 'act' ? { test: testParam } : undefined}
      tab={parseStatsTab(sp.tab)}
      focus={testType}
      drill
      eyebrow={`Performance · ${testType.toUpperCase()}`}
      h1="How you're doing"
      subtitle="The same numbers your tutor sees, with what to work on first at the top."
      testDate={tests?.countdownDate}
      testsPanel={tests ? <TestsPanel {...tests.props} /> : undefined}
    />
  );
}

async function loadTestsPanel(
  { user, supabase }: AuthContext,
): Promise<{ props: TestsPanelProps; countdownDate: string | null }> {
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: regRows }, { data: scoreRows }, { data: profileRow }, { data: plan }, hasTutor] =
    await Promise.all([
      supabase
        .from('sat_test_registrations')
        .select('id, student_id, test_date, created_by')
        .eq('student_id', user.id)
        .order('test_date', { ascending: true }),
      supabase
        .from('sat_official_scores')
        .select('id, student_id, test_date, test_type, rw_score, math_score, composite_score, created_by')
        .eq('student_id', user.id)
        .order('test_date', { ascending: false }),
      supabase.from('profiles').select('sat_test_date').eq('id', user.id).maybeSingle(),
      supabase
        .from('study_plans')
        .select('test_date')
        .eq('student_id', user.id)
        .eq('test_type', 'sat')
        .eq('status', 'active')
        .limit(1)
        .maybeSingle(),
      hasAssignedTutor(supabase, user.id) as Promise<boolean>,
    ]);

  const registrations = (regRows ?? []).map((r) => ({
    id: r.id,
    test_date: String(r.test_date),
    mine: isSelfReported(r),
  }));
  const scores = (scoreRows ?? []).map((r) => ({
    id: r.id,
    test_date: String(r.test_date),
    test_type: parseTestType(r.test_type),
    rw_score: r.rw_score,
    math_score: r.math_score,
    composite_score: r.composite_score,
    mine: isSelfReported(r),
  }));

  // The date they chose: the plan's, else the profile's; upcoming only.
  const chosen = calendarDay(plan?.test_date) ?? calendarDay(profileRow?.sat_test_date);
  const studyingFor = chosen && chosen >= today ? chosen : null;

  const scoredDates = new Set(scores.map((sc) => sc.test_date));
  const cutoff = addDays(today, -AWAITING_SCORES_DAYS);
  const awaitingScores = registrations
    .map((r) => r.test_date)
    .filter((d) => d < today && d >= cutoff && !scoredDates.has(d))
    .reverse();

  return {
    props: {
      today,
      studyingFor,
      hasPlan: Boolean(plan),
      hasTutor,
      registrations,
      scores,
      awaitingScores,
    },
    countdownDate: resolveTestDate({
      planDate: plan?.test_date,
      profileDate: profileRow?.sat_test_date,
      nextRegistration: soonestUpcoming(registrations.map((r) => r.test_date), today),
      today,
    }),
  };
}
