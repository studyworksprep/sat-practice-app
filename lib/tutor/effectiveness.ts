// Tutor-effectiveness rollups (§5.2) — pure computation, no I/O.
//
// The manager layer's per-tutor signals: mastery movement (from the
// get_tutor_mastery_movement RPC), assignment completion over the
// window, and roster adherence distribution. Deliberately framed as
// SIGNALS, not rankings — with 7 tutors, n is far too small to rank,
// and the UI copy must say so.
//
// Scale conventions (matching lib/tutor/prep.ts): mastery is 0–100;
// completion rate is 0–1 (null when nothing was assigned).

import type { AdherenceStatus } from '@/lib/plan/adherence';

export const EFFECTIVENESS_WINDOW_DAYS = 28;

/** One row of get_tutor_mastery_movement, camel-cased. */
export interface MasteryMovement {
  teacherId: string;
  studentsMeasured: number;
  skillsWorked: number;
  avgMasteryDelta: number;
  avgMasteryNow: number;
}

export interface CompletionRollup {
  assigned: number;
  completed: number;
  /** completed / assigned, or null when the tutor assigned nothing in the window. */
  rate: number | null;
}

export interface AdherenceRollup {
  onTrack: number;
  behind: number;
  ahead: number;
  notStarted: number;
  /** Rostered students with no active plan at all. */
  noPlan: number;
}

export interface TeacherEffectiveness {
  /** null when no rostered student practiced inside the window. */
  movement: MasteryMovement | null;
  completion: CompletionRollup;
  adherence: AdherenceRollup;
}

export interface CompletionRow {
  teacherId: string;
  completedAt: string | null;
}

/** Per-teacher completion rollup from flattened assignment_students rows. */
export function rollupCompletion(
  rows: readonly CompletionRow[],
): Map<string, CompletionRollup> {
  const byTeacher = new Map<string, CompletionRollup>();
  for (const row of rows) {
    let agg = byTeacher.get(row.teacherId);
    if (!agg) {
      agg = { assigned: 0, completed: 0, rate: null };
      byTeacher.set(row.teacherId, agg);
    }
    agg.assigned += 1;
    if (row.completedAt) agg.completed += 1;
  }
  for (const agg of byTeacher.values()) {
    agg.rate = agg.assigned > 0 ? agg.completed / agg.assigned : null;
  }
  return byTeacher;
}

export const EMPTY_COMPLETION: CompletionRollup = {
  assigned: 0,
  completed: 0,
  rate: null,
};

/**
 * Per-teacher adherence distribution. `rosterByTeacher` maps a teacher to
 * their rostered student ids; `statusByStudent` holds each student's
 * computed AdherenceStatus (absent = no active plan). A student on two
 * rosters counts toward both tutors, same as the movement RPC.
 */
export function rollupAdherence(
  rosterByTeacher: ReadonlyMap<string, readonly string[]>,
  statusByStudent: ReadonlyMap<string, AdherenceStatus>,
): Map<string, AdherenceRollup> {
  const byTeacher = new Map<string, AdherenceRollup>();
  for (const [teacherId, studentIds] of rosterByTeacher) {
    const agg: AdherenceRollup = {
      onTrack: 0,
      behind: 0,
      ahead: 0,
      notStarted: 0,
      noPlan: 0,
    };
    for (const studentId of studentIds) {
      const status = statusByStudent.get(studentId);
      if (!status) agg.noPlan += 1;
      else if (status === 'on_track') agg.onTrack += 1;
      else if (status === 'behind') agg.behind += 1;
      else if (status === 'ahead') agg.ahead += 1;
      else agg.notStarted += 1;
    }
    byTeacher.set(teacherId, agg);
  }
  return byTeacher;
}

/** Compose the three per-teacher maps into one effectiveness map. */
export function composeEffectiveness(
  teacherIds: readonly string[],
  movement: ReadonlyMap<string, MasteryMovement>,
  completion: ReadonlyMap<string, CompletionRollup>,
  adherence: ReadonlyMap<string, AdherenceRollup>,
): Map<string, TeacherEffectiveness> {
  const result = new Map<string, TeacherEffectiveness>();
  for (const teacherId of teacherIds) {
    result.set(teacherId, {
      movement: movement.get(teacherId) ?? null,
      completion: completion.get(teacherId) ?? { ...EMPTY_COMPLETION },
      adherence: adherence.get(teacherId) ?? {
        onTrack: 0,
        behind: 0,
        ahead: 0,
        notStarted: 0,
        noPlan: 0,
      },
    });
  }
  return result;
}
