// Sidebar counts for the tutor shell: "N behind" on Roster and
// "N late" on Assignments. Same idea as the student shell's Review /
// Assignments counts: a small number on the link that says where the
// waiting work is, before the tutor opens the page.
//
// The counts reuse the definitions the pages themselves use, so the
// badge and the page never disagree:
//   - Roster "behind": an active student whose active SAT plan is
//     `behind` per computeAdherence (the roster's Plan column).
//   - Assignments "late": an active (not archived) assignment the
//     tutor sent, past its due date, that at least one student hasn't
//     finished (the assignments page's Overdue tile).
//
// The pure counting half lives here so it can be unit-tested without
// a database; loadTutorNavBadges is the I/O half. Every read is
// best-effort — a failed query drops that badge, never the page.

import type { TypedSupabaseClient } from '@/lib/supabase/server';
import { computeAdherence, type AdherenceTask } from '../plan/adherence.ts';
import { isPastDueDate } from '../formatters.js';

export interface NavBadgeCount {
  label: string;
  tone: 'alert' | 'neutral';
}

export interface PlanRow {
  student_id: string;
  plan_tasks: readonly { status: AdherenceTask['status']; scheduled_date: string | null }[] | null;
}

export interface AssignmentRow {
  due_date: string | null;
  archived_at: string | null;
  assignment_students_v2: readonly { completed_at: string | null }[] | null;
}

export const ROSTER_HREF = '/tutor/roster';
export const ASSIGNMENTS_HREF = '/tutor/assignments';

/** Active students whose active plan is behind schedule. */
export function countBehindStudents(
  plans: readonly PlanRow[],
  activeStudentIds: ReadonlySet<string>,
  today: string,
): number {
  const behind = new Set<string>();
  for (const plan of plans) {
    if (!activeStudentIds.has(plan.student_id)) continue;
    const summary = computeAdherence(
      (plan.plan_tasks ?? []).map((t) => ({ scheduledDate: t.scheduled_date, status: t.status })),
      today,
    );
    if (summary.status === 'behind') behind.add(plan.student_id);
  }
  return behind.size;
}

/** An assignment that is still open, past due, and not finished by everyone. */
export function isLateAssignment(row: AssignmentRow, nowMs: number): boolean {
  if (row.archived_at || !row.due_date) return false;
  if (!isPastDueDate(row.due_date, nowMs)) return false;
  const students = row.assignment_students_v2 ?? [];
  return students.some((st) => !st.completed_at);
}

export function countLateAssignments(rows: readonly AssignmentRow[], nowMs: number): number {
  return rows.filter((row) => isLateAssignment(row, nowMs)).length;
}

export function buildTutorNavBadges(
  { behind, late }: { behind: number; late: number },
): Record<string, NavBadgeCount> {
  const badges: Record<string, NavBadgeCount> = {};
  if (behind > 0) badges[ROSTER_HREF] = { label: `${behind} behind`, tone: 'neutral' };
  if (late > 0) badges[ASSIGNMENTS_HREF] = { label: `${late} late`, tone: 'alert' };
  return badges;
}

/** Roster + Assignments counts for a teacher or manager. Admins get none:
 *  their sidebar is the platform union, and their "roster" is everyone. */
export async function loadTutorNavBadges(
  supabase: TypedSupabaseClient,
  userId: string,
  role: string,
): Promise<Record<string, NavBadgeCount>> {
  if (role !== 'teacher' && role !== 'manager') return {};

  // Profiles and plans are RLS-scoped (can_view), the same reads the
  // roster page makes, so the count covers exactly the roster's students.
  const [students, plans, assignments] = await Promise.all([
    supabase.from('profiles').select('id, is_active').eq('role', 'student'),
    supabase.from('study_plans')
      .select('student_id, plan_tasks(status, scheduled_date)')
      .eq('status', 'active').eq('test_type', 'sat'),
    supabase.from('assignments_v2')
      .select('due_date, archived_at, assignment_students_v2(completed_at)')
      .eq('teacher_id', userId)
      .is('deleted_at', null)
      .is('archived_at', null)
      .not('due_date', 'is', null),
  ]);

  let behind = 0;
  if (!students.error && !plans.error) {
    const activeIds = new Set(
      (students.data ?? []).filter((p) => p.is_active !== false).map((p) => p.id),
    );
    const today = new Date().toISOString().slice(0, 10);
    behind = countBehindStudents((plans.data ?? []) as PlanRow[], activeIds, today);
  }

  const late = assignments.error
    ? 0
    : countLateAssignments((assignments.data ?? []) as AssignmentRow[], Date.now());

  return buildTutorNavBadges({ behind, late });
}
