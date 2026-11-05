// Data loader for the tutor student page. Every read rides the
// caller's RLS-scoped client (can_view), so a student the caller
// can't see comes back as `notFound` and the page 404s.
//
// One Promise.all for everything student-shaped, then two small
// dependent reads: the report session behind each assignment, and the
// names of whoever marked foundation lessons covered.

import type { TypedSupabaseClient } from '@/lib/supabase/server';
import type { ViewRow } from '@/lib/types';
import { loadStudentPlanState } from '@/lib/plan/load-plan-state';
import { loadDashboardAggregate } from '@/lib/practice/load-dashboard-aggregate';
import { loadDashboardAggregateAct } from '@/lib/practice/load-dashboard-aggregate-act';
import { resolveDetoursEnabled } from '@/lib/practice/detour-preference.mjs';
import { parseTimeAccommodation } from '@/lib/practice/time-accommodation';
import { buildArchiveSummary } from '@/lib/practice/superscore';
import { loadActFormNamer } from '@/lib/practice/act-form-names';
import {
  buildFoundationRows,
  foundationSyllabusTitle,
  loadFoundationLessons,
  summarizeFoundations,
} from '@/lib/lesson/foundations';
import type { FoundationCardGroup } from './FoundationsCard';

const RECENT_SESSIONS_LIMIT = 10;
const RECENT_TESTS_LIMIT = 10;

export type StudentAssignment = {
  id: string;
  assignment_type: string;
  title: string | null;
  due_date: string | null;
  archived_at: string | null;
  deleted_at: string | null;
  created_at: string | null;
  question_ids: unknown;
  test_type: string | null;
  lesson: { title: string | null } | null;
  practice_test: { name: string | null } | null;
  completed_at: string | null;
};

export type TestRow =
  | {
      kind: 'sat'; id: string; status: string; timestamp: string | null; composite: number | null;
      rwScaled: number | null; mathScaled: number | null; sectionsOnly: string | null;
      testName: string; testCode: string;
    }
  | {
      kind: 'act'; id: string; status: string; timestamp: string | null; composite: number | null;
      sections: Array<[string, number | null]>; sectionsOnly: null; testName: string; testCode: string;
    };

export type OfficialScore = {
  id: string; test_date: string; rw_score: number; math_score: number;
  composite_score: number; test_type: string | null;
  domain_ini: number | null; domain_cas: number | null;
  domain_eoi: number | null; domain_sec: number | null;
  domain_alg: number | null; domain_atm: number | null;
  domain_pam: number | null; domain_geo: number | null;
};

export async function loadStudentDetail(supabase: TypedSupabaseClient, studentId: string, viewerId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const [
    { data: studentRows, error: rpcErr },
    { data: profileRow },
    { data: assignmentJunctions },
    { data: testAttemptRows },
    { data: completedTestRowsForScore },
    { data: actTestAttemptRows },
    { data: sessionRows },
    { data: registrations },
    { data: officialScores },
    { data: publishedTests },
    aggregate,
    aggregateAct,
    planState,
    { data: coverageRows },
    { data: tutorLinks },
    foundationLessons,
    { data: foundationProgressRows },
    { data: noteRows },
    actFormNameOf,
  ] = await Promise.all([
    supabase.from('student_practice_stats').select('*').eq('user_id', studentId),
    supabase.from('profiles')
      .select('created_at, start_date, practice_detours_enabled, time_accommodation')
      .eq('id', studentId).maybeSingle(),
    // SAT and ACT assignments; each row carries its own test_type.
    supabase.from('assignment_students_v2')
      .select(`
        completed_at,
        assignment:assignments_v2 (
          id, assignment_type, title, due_date, archived_at, deleted_at, created_at,
          question_ids, test_type,
          lesson:lessons (title),
          practice_test:practice_tests_v2 (name)
        )
      `)
      .eq('student_id', studentId)
      .in('test_type', ['sat', 'act']),
    supabase.from('practice_test_attempts_v2')
      .select(`
        id, status, started_at, finished_at,
        composite_score, rw_scaled, math_scaled, sections_only,
        practice_test:practice_tests_v2(name, code)
      `)
      .eq('user_id', studentId)
      .order('started_at', { ascending: false })
      .limit(RECENT_TESTS_LIMIT),
    // Every completed SAT practice test (no limit) for the starting /
    // final score math; the list above is capped for display.
    supabase.from('practice_test_attempts_v2')
      .select('started_at, finished_at, composite_score, rw_scaled, math_scaled')
      .eq('user_id', studentId).eq('status', 'completed'),
    supabase.from('act_practice_test_attempts')
      .select(`
        id, status, source_test, started_at, finished_at,
        english_scaled, math_scaled, reading_scaled, science_scaled, composite_score
      `)
      .eq('user_id', studentId).eq('status', 'completed')
      .order('finished_at', { ascending: false })
      .limit(RECENT_TESTS_LIMIT),
    // Self-guided sessions (drills included). Assignment-linked
    // sessions are left out: they surface through their assignment.
    supabase.from('practice_sessions')
      .select('id, created_at, question_ids, current_position, status, test_type')
      .eq('user_id', studentId)
      .in('mode', ['practice', 'review'])
      .in('test_type', ['sat', 'act'])
      .neq('status', 'abandoned')
      .is('filter_criteria->>assignment_id', null)
      .order('created_at', { ascending: false })
      .limit(RECENT_SESSIONS_LIMIT),
    supabase.from('sat_test_registrations')
      .select('id, test_date, created_at')
      .eq('student_id', studentId)
      .order('test_date', { ascending: true }),
    supabase.from('sat_official_scores')
      .select(`
        id, test_date, rw_score, math_score, composite_score, created_at, test_type,
        domain_ini, domain_cas, domain_eoi, domain_sec,
        domain_alg, domain_atm, domain_pam, domain_geo
      `)
      .eq('student_id', studentId)
      .order('test_date', { ascending: false }),
    supabase.from('practice_tests_v2')
      .select('id, name, code')
      .eq('is_published', true).is('deleted_at', null)
      .order('code', { ascending: true }),
    loadDashboardAggregate(studentId),
    loadDashboardAggregateAct(studentId),
    loadStudentPlanState(supabase, studentId, today),
    supabase.rpc('get_student_coverage', { p_student: studentId }),
    // Whether the student has a tutor at all decides the unset default
    // of the step-back switch (managers and admins reach this page for
    // unassigned students too).
    supabase.from('teacher_student_assignments').select('teacher_id').eq('student_id', studentId).limit(1),
    loadFoundationLessons(supabase, 'sat'),
    supabase.from('lesson_progress')
      .select('lesson_id, completed_at, covered_by, covered_at')
      .eq('student_id', studentId),
    // Latest session note (the session workspace writes them).
    supabase.from('tutor_notes')
      .select('body, session_at')
      .eq('student_id', studentId)
      .order('session_at', { ascending: false })
      .limit(1),
    // ACT form names: the admin's display_name, else the derived default.
    loadActFormNamer(supabase),
  ]);

  if (rpcErr) return { kind: 'error' as const, message: `Failed to load student: ${rpcErr.message}` };
  if (!studentRows || studentRows.length === 0) return { kind: 'notFound' as const };

  const row = studentRows[0] as ViewRow<'student_practice_stats'>;
  const total = Number(row.total_attempts ?? 0);
  const correct = Number(row.correct_attempts ?? 0);
  const studentProfile = profileRow as {
    start_date?: string | null;
    created_at?: string | null;
    practice_detours_enabled?: boolean | null;
    time_accommodation?: number | string | null;
  } | null;
  const startDate = studentProfile?.start_date ?? null;
  // Effective start date falls back to the signup timestamp.
  const effectiveStartDate = startDate ?? studentProfile?.created_at ?? null;

  const detourPreference = studentProfile?.practice_detours_enabled ?? null;
  const hasAssignedTutor = (tutorLinks ?? []).length > 0;

  const student = {
    id: row.user_id ?? studentId,
    name: [row.first_name, row.last_name].filter(Boolean).join(' ') || row.email || 'Unknown',
    email: row.email,
    targetScore: row.target_sat_score,
    highSchool: row.high_school,
    graduationYear: row.graduation_year,
    satTestDate: row.sat_test_date,
    startDate,
    effectiveStartDate,
    totalAttempts: total,
    correctAttempts: correct,
    weekAttempts: Number(row.week_attempts ?? 0),
    accuracy: total > 0 ? Math.round((correct / total) * 100) : null,
    lastActivityAt: row.last_activity_at,
  };

  // Starting / final / impact / reach — the roster's past-students
  // math, computed live. superscore.js is untyped at the seam.
  type CompletedTestRow = {
    started_at: string | null; finished_at: string | null; composite_score: number | null;
    rw_scaled: number | null; math_scaled: number | null;
  };
  const scoreSummary: {
    startingScore: number | null; finalScore: number | null; impact: number | null; targetReachPct: number | null;
  } = buildArchiveSummary({
    officialScores: officialScores ?? [],
    practiceTests: ((completedTestRowsForScore ?? []) as CompletedTestRow[]).map((r) => ({
      finished_at: r.finished_at, started_at: r.started_at, composite_score: r.composite_score,
      rw_score: r.rw_scaled, math_score: r.math_scaled,
    })),
    startDate: effectiveStartDate,
    targetScore: student.targetScore,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

  const satTests: TestRow[] = (testAttemptRows ?? []).map((r) => ({
    kind: 'sat' as const,
    id: r.id,
    status: r.status,
    timestamp: r.finished_at ?? r.started_at,
    composite: r.composite_score,
    rwScaled: r.rw_scaled,
    mathScaled: r.math_scaled,
    sectionsOnly: r.sections_only ?? null,
    testName: (r.practice_test as { name?: string } | null)?.name ?? 'Practice test',
    testCode: (r.practice_test as { code?: string } | null)?.code ?? '',
  }));
  const actTests: TestRow[] = (actTestAttemptRows ?? []).map((r) => ({
    kind: 'act' as const,
    id: r.id,
    status: r.status,
    timestamp: r.finished_at ?? r.started_at,
    composite: r.composite_score,
    sections: [
      ['English', r.english_scaled], ['Math', r.math_scaled],
      ['Reading', r.reading_scaled], ['Science', r.science_scaled],
    ] as Array<[string, number | null]>,
    sectionsOnly: null,
    testName: actFormNameOf(r.source_test),
    testCode: 'ACT',
  }));
  const testRows = [...satTests, ...actTests]
    .sort((a, b) => (b.timestamp ?? '').localeCompare(a.timestamp ?? ''))
    .slice(0, RECENT_TESTS_LIMIT);

  const sessions = (sessionRows ?? [])
    .filter((r) => Array.isArray(r.question_ids) && (r.question_ids as unknown[]).length > 0)
    .map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      total: (r.question_ids as unknown[]).length,
      completed: r.status === 'completed',
      testType: (r.test_type ?? 'sat') as string,
    }));

  // Newest-assigned first. PostgREST types the one-to-one embed as an
  // array; the response is a single object.
  const assignments = (
    (assignmentJunctions ?? []) as unknown as { completed_at: string | null; assignment: StudentAssignment }[]
  )
    .map((j) => ({ ...j.assignment, completed_at: j.completed_at }))
    .filter((a) => a && a.id && !a.deleted_at && !a.archived_at)
    .sort((a, b) => (b.created_at ? Date.parse(b.created_at) : 0) - (a.created_at ? Date.parse(a.created_at) : 0));

  // Best session per assignment for the report link: completed >
  // in_progress > other. The assignment's own completed_at decides
  // whether the work is done.
  const reportSessionByAssignment = new Map<string, string>();
  if (assignments.length > 0) {
    const { data: linked } = await supabase
      .from('practice_sessions')
      .select('id, status, created_at, filter_criteria')
      .eq('user_id', studentId)
      .in('test_type', ['sat', 'act'])
      .in('filter_criteria->>assignment_id', assignments.map((a) => a.id))
      .order('created_at', { ascending: false });
    const rank = (st: string | null | undefined) => (st === 'completed' ? 0 : st === 'in_progress' ? 1 : 2);
    const best = new Map<string, string>();
    for (const r of linked ?? []) {
      const aid = (r.filter_criteria as { assignment_id?: string } | null)?.assignment_id;
      if (typeof aid !== 'string') continue;
      const prev = best.get(aid);
      if (prev === undefined || rank(r.status) < rank(prev)) {
        reportSessionByAssignment.set(aid, r.id);
        best.set(aid, r.status);
      }
    }
  }

  const coverage = { total: 0, started: 0, mastered: 0, decayed: 0 };
  for (const c of coverageRows ?? []) {
    coverage.total++;
    if (c.status !== 'not_started') coverage.started++;
    if (c.status === 'mastered') coverage.mastered++;
    if (c.status === 'decayed') coverage.decayed++;
  }

  // Foundations: who marked a lesson covered comes from profile_cards,
  // so a co-instructor's name shows only to someone who can see them.
  const foundationRows = buildFoundationRows(foundationLessons, foundationProgressRows ?? []);
  const foundationSummary = summarizeFoundations(foundationLessons, foundationProgressRows ?? []);
  const coveredByIds = [...new Set(foundationRows.map((r) => r.coveredBy).filter((id): id is string => Boolean(id)))];
  const coveredByNames = new Map<string, string>();
  if (coveredByIds.length > 0) {
    const { data: cards } = await supabase
      .from('profile_cards').select('id, first_name, last_name, tutor_name').in('id', coveredByIds);
    for (const c of cards ?? []) {
      const name = (c.tutor_name ?? '').trim() || [c.first_name, c.last_name].filter(Boolean).join(' ').trim();
      if (c.id && name) coveredByNames.set(c.id, name);
    }
  }
  const foundationGroups: FoundationCardGroup[] = (['math', 'reading_writing'] as const)
    .map((section) => ({
      section,
      title: foundationSyllabusTitle(section),
      rows: foundationRows
        .filter((r) => r.section === section)
        .map((r) => ({
          lessonId: r.lessonId,
          title: r.title,
          status: r.status,
          completedAt: r.completedAt,
          coveredAt: r.coveredAt,
          coveredByName: r.coveredBy ? (coveredByNames.get(r.coveredBy) ?? null) : null,
          coveredByMe: r.coveredBy === viewerId,
        })),
    }))
    .filter((g) => g.rows.length > 0);

  return {
    kind: 'ok' as const,
    student,
    scoreSummary,
    testRows,
    sessions,
    assignments,
    reportSessionByAssignment,
    registrations: (registrations ?? []).map((r) => ({ id: r.id as string, test_date: r.test_date as string })),
    officialScores: (officialScores ?? []) as unknown as OfficialScore[],
    publishedTests: (publishedTests ?? []) as Array<{ id: string; name: string; code: string | null }>,
    aggregate,
    aggregateAct,
    planState,
    coverage,
    foundations: {
      enabled: foundationLessons.length > 0,
      groups: foundationGroups,
      covered: foundationSummary.covered,
      total: foundationSummary.total,
    },
    settings: {
      detoursEnabled: resolveDetoursEnabled({ preference: detourPreference, hasAssignedTutor }),
      detourIsExplicit: typeof detourPreference === 'boolean',
      hasAssignedTutor,
      timeAccommodation: parseTimeAccommodation(studentProfile?.time_accommodation),
    },
    latestNote: (noteRows ?? [])[0] ?? null,
  };
}

export type StudentDetail = Extract<Awaited<ReturnType<typeof loadStudentDetail>>, { kind: 'ok' }>;
