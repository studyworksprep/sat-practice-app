// Team-effectiveness loader (§5.2) — the I/O half of lib/tutor/effectiveness.ts.
//
// Loads the three per-tutor signals for a set of teachers in one
// Promise.all: mastery movement via the get_tutor_mastery_movement RPC
// (SECURITY INVOKER — a teacher the caller can't see contributes no
// rows), assignment completion from assignments_v2 authored in the
// window, and roster adherence from each student's active plan via
// computeAdherence (the same one home the roster and plan pages use).
//
// Every read is best-effort: a failed source degrades to "no signal"
// rather than failing the page, matching the performance loader's
// treatment of get_roster_skill_trend.

import type { TypedSupabaseClient } from '@/lib/supabase/server';
import { computeAdherence, type AdherenceStatus } from '@/lib/plan/adherence';
import {
  EFFECTIVENESS_WINDOW_DAYS,
  composeEffectiveness,
  rollupAdherence,
  rollupCompletion,
  type CompletionRow,
  type MasteryMovement,
  type TeacherEffectiveness,
} from './effectiveness';

export interface LoadTeamEffectivenessOptions {
  windowDays?: number;
  testType?: 'sat' | 'act';
}

export async function loadTeamEffectiveness(
  supabase: TypedSupabaseClient,
  rosterByTeacher: ReadonlyMap<string, readonly string[]>,
  options: LoadTeamEffectivenessOptions = {},
): Promise<Map<string, TeacherEffectiveness>> {
  const windowDays = options.windowDays ?? EFFECTIVENESS_WINDOW_DAYS;
  const testType = options.testType ?? 'sat';
  const teacherIds = [...rosterByTeacher.keys()];
  if (teacherIds.length === 0) return new Map();

  const allStudentIds = [...new Set([...rosterByTeacher.values()].flat())];
  const sinceIso = new Date(
    Date.now() - windowDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  const [movementRes, completionRes, planRes] = await Promise.all([
    supabase.rpc('get_tutor_mastery_movement', {
      p_teachers: teacherIds,
      p_days: windowDays,
      p_test_type: testType,
    }),
    supabase
      .from('assignments_v2')
      .select('teacher_id, assignment_students_v2(completed_at)')
      .in('teacher_id', teacherIds)
      .eq('test_type', testType)
      .gte('created_at', sinceIso)
      .is('deleted_at', null)
      .is('archived_at', null),
    allStudentIds.length > 0
      ? supabase
          .from('study_plans')
          .select('student_id, plan_tasks(status, scheduled_date)')
          .in('student_id', allStudentIds)
          .eq('status', 'active')
          .eq('test_type', testType)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const movementByTeacher = new Map<string, MasteryMovement>();
  for (const row of movementRes.data ?? []) {
    movementByTeacher.set(row.teacher_id, {
      teacherId: row.teacher_id,
      studentsMeasured: row.students_measured,
      skillsWorked: row.skills_worked,
      avgMasteryDelta: Number(row.avg_mastery_delta),
      avgMasteryNow: Number(row.avg_mastery_now),
    });
  }

  const completionRows: CompletionRow[] = (completionRes.data ?? []).flatMap(
    (assignment) =>
      (assignment.assignment_students_v2 ?? []).map((s) => ({
        teacherId: assignment.teacher_id,
        completedAt: s.completed_at,
      })),
  );

  const today = new Date().toISOString().slice(0, 10);
  const statusByStudent = new Map<string, AdherenceStatus>();
  for (const plan of planRes.data ?? []) {
    const summary = computeAdherence(
      (plan.plan_tasks ?? []).map((t) => ({
        scheduledDate: t.scheduled_date,
        status: t.status as 'pending' | 'completed' | 'skipped',
      })),
      today,
    );
    statusByStudent.set(plan.student_id, summary.status);
  }

  return composeEffectiveness(
    teacherIds,
    movementByTeacher,
    rollupCompletion(completionRows),
    rollupAdherence(rosterByTeacher, statusByStudent),
  );
}
