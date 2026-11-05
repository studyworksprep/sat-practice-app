import type { Json } from '@/lib/types/database';

export type ActivityKind = 'assignment' | 'practice' | 'test';
export type DashboardActivity = {
  id: string; studentId: string; kind: ActivityKind; title: string;
  status: string; detail: string; at: string; href: string; action: string;
  /** Practice sessions only: the set's size and whether it is still open. */
  questionCount?: number; open?: boolean;
};
export type ActivitySession = {
  id: string; user_id: string; test_type: string; status: string;
  last_activity_at: string; question_ids: Json; filter_criteria: Json;
};
export type ActivityAssignment = { id: string; title: string | null; assignment_type: string };
export type ActivityCompletion = {
  student_id: string; completed_at: string | null; assignment: ActivityAssignment | null;
};
export type ActivityTest = {
  id: string; user_id: string; finished_at: string | null; composite_score: number | null;
  math_scaled: number | null; rw_scaled?: number | null; english_scaled?: number | null;
  reading_scaled?: number | null; science_scaled?: number | null;
  testName: string; testType: 'sat' | 'act';
};

export function sessionAssignmentId(session: ActivitySession): string | null {
  const criteria = session.filter_criteria;
  return criteria && typeof criteria === 'object' && !Array.isArray(criteria)
    && typeof criteria.assignment_id === 'string' ? criteria.assignment_id : null;
}

/** A bounded feed, not cohort totals. Never equate question-set size with answers. */
export function buildDashboardActivity({ studentIds, sessions, completions, assignments, tests, since }: {
  studentIds: string[]; sessions: ActivitySession[]; completions: ActivityCompletion[];
  assignments: ActivityAssignment[]; tests: ActivityTest[]; since: string;
}): DashboardActivity[] {
  const roster = new Set(studentIds);
  const byAssignment = new Map(assignments.map(a => [a.id, a]));
  const events = new Map<string, DashboardActivity>();
  const completed = new Set<string>();
  function add(event: DashboardActivity) {
    if (!roster.has(event.studentId) || !Number.isFinite(Date.parse(event.at)) || event.at < since) return;
    const previous = events.get(event.id);
    if (!previous || previous.at < event.at) events.set(event.id, event);
  }
  for (const row of completions) {
    if (!row.assignment || !row.completed_at) continue;
    add({ id: `assignment:${row.assignment.id}:${row.student_id}`, studentId: row.student_id,
      kind: 'assignment', title: row.assignment.title ?? 'Assignment', status: 'Marked complete',
      detail: row.assignment.assignment_type === 'lesson' ? 'Lesson assignment' : 'Assignment',
      at: row.completed_at, href: `/tutor/dashboard/review/${row.assignment.id}/${row.student_id}`, action: 'Review work' });
    completed.add(`assignment:${row.assignment.id}:${row.student_id}`);
  }
  for (const session of sessions) {
    const criteria = session.filter_criteria;
    if (criteria && typeof criteria === 'object' && !Array.isArray(criteria)
      && (criteria.synthetic_on_behalf === true || criteria.kind === 'practice_test')) continue;
    const count = Array.isArray(session.question_ids) ? session.question_ids.length : 0;
    if (!count) continue;
    const assignmentId = sessionAssignmentId(session);
    const assignment = assignmentId ? byAssignment.get(assignmentId) : null;
    // Missing, deleted, archived, or no-longer-visible assignments stay out.
    if (assignmentId && !assignment) continue;
    const key = assignmentId ? `assignment:${assignmentId}:${session.user_id}` : `session:${session.id}`;
    // A membership completion is the authoritative assignment status.
    if (assignmentId && completed.has(key)) continue;
    add({ id: key, studentId: session.user_id, kind: assignmentId ? 'assignment' : 'practice',
      title: assignment?.title ?? `${session.test_type === 'act' ? 'ACT' : 'SAT'} practice`,
      status: session.status === 'completed' ? (assignmentId ? 'Session completed' : 'Completed') : 'In progress',
      detail: `${count}-question set`, at: session.last_activity_at,
      questionCount: count, open: session.status !== 'completed',
      href: assignmentId ? `/tutor/assignments/${assignmentId}/students/${session.user_id}` : `/tutor/sessions/${session.id}`,
      action: session.status === 'completed' ? 'Review work' : 'View progress' });
  }
  for (const test of tests) {
    if (!test.finished_at) continue;
    const sections = test.testType === 'sat'
      ? [['Reading & Writing', test.rw_scaled], ['Math', test.math_scaled]] as const
      : [['English', test.english_scaled], ['Math', test.math_scaled], ['Reading', test.reading_scaled], ['Science', test.science_scaled]] as const;
    const scores = sections.filter(([, value]) => value != null).map(([label, value]) => `${label} ${value}`);
    add({ id: `${test.testType}-test:${test.id}`, studentId: test.user_id, kind: 'test',
      title: test.testName, status: 'Completed',
      detail: [test.composite_score == null ? null : `${test.testType === 'sat' ? 'Total' : 'Composite'} ${test.composite_score}`, ...scores].filter(Boolean).join(' · ') || 'Score not available',
      at: test.finished_at, href: `/tutor/students/${test.user_id}/tests/${test.id}/results`, action: 'View results' });
  }
  return [...events.values()].sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id));
}

// ── Recent work, grouped ─────────────────────────────────────────
// The dashboard shows the feed by day ("Today", "Yesterday", "Mon, Nov
// 2"), and folds one student's self-guided practice sets on the same day
// into a single row ("4 practice sets · 3 finished, 1 still open").
// Assignments and tests stay one row each. `dayOf` maps a timestamp to
// the viewer's local day key (yyyy-mm-dd), so grouping runs in the
// browser, where the viewer's timezone is known.

export type RecentWorkRow = DashboardActivity & {
  /** Practice sets folded into this row (1 for an unfolded row). */
  sets: number;
};

export type RecentWorkDay = { day: string; rows: RecentWorkRow[] };

export function groupRecentWork(
  activities: readonly DashboardActivity[],
  dayOf: (iso: string) => string,
): RecentWorkDay[] {
  const days = new Map<string, RecentWorkRow[]>();
  const folded = new Map<string, RecentWorkRow & { parts: DashboardActivity[] }>();
  for (const row of activities) {
    const day = dayOf(row.at);
    let list = days.get(day);
    if (!list) { list = []; days.set(day, list); }
    if (row.kind !== 'practice') { list.push({ ...row, sets: 1 }); continue; }
    const key = `${day}|${row.studentId}`;
    const group = folded.get(key);
    if (!group) {
      const first = { ...row, sets: 1, parts: [row] };
      folded.set(key, first);
      list.push(first);
      continue;
    }
    group.parts.push(row);
    group.sets = group.parts.length;
    if (row.at > group.at) group.at = row.at;
  }
  for (const group of folded.values()) {
    if (group.parts.length < 2) continue;
    const open = group.parts.filter((p) => p.open).length;
    const questions = group.parts.reduce((n, p) => n + (p.questionCount ?? 0), 0);
    group.id = `practice-day:${group.studentId}:${dayOf(group.at)}`;
    group.title = `${group.parts.length} practice sets`;
    group.status = open === 0 ? 'All finished' : open === group.parts.length ? 'In progress' : `${group.parts.length - open} finished, ${open} still open`;
    group.detail = `${questions} questions in all`;
    group.href = `/tutor/students/${group.studentId}`;
    group.action = 'Open student';
  }
  const out: RecentWorkDay[] = [];
  for (const [day, rows] of days) {
    const clean = rows.map((r) => {
      const rest = { ...r } as RecentWorkRow & { parts?: unknown };
      delete rest.parts;
      return rest as RecentWorkRow;
    });
    clean.sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id));
    out.push({ day, rows: clean });
  }
  return out.sort((a, b) => b.day.localeCompare(a.day));
}
