// Unit syllabi loader (docs/foundations-and-question-patterns.md §5).
//
// One home for "give the generator its syllabi": reads the
// `unit_syllabus` feature flag and, when it's on, the ordered steps of
// every curriculum unit for a test type plus the lessons the student has
// completed. Every generator caller — generateStudyPlan, the re-pace
// runner (interactive and cron), and the tutor editor's week
// regeneration — goes through loadSyllabusInputs so a plan is composed
// the same way whichever path regenerates it.
//
// Takes the caller's client (RLS-scoped or service) rather than
// lib/flags-server's cookie-bound reader: the weekly cron has no
// request cookies, and feature_flags is readable by any authenticated
// user either way.
//
// Lesson steps whose lesson is not published are dropped here, so the
// generator never pins a task to a lesson a student can't open.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import type { DrillRole, UnitStep, UnitSyllabi } from './generate-plan';

export const UNIT_SYLLABUS_FLAG = 'unit_syllabus';

type AnyClient = SupabaseClient<Database>;

export interface SyllabusInputs {
  unitSteps: UnitSyllabi;
  completedLessonIds: string[];
}

/** Is the syllabus walk switched on? Any read failure counts as off, so
 *  a flag hiccup degrades to the pre-syllabus generator, never an error. */
export async function unitSyllabusEnabled(supabase: AnyClient): Promise<boolean> {
  try {
    const { data } = await supabase
      .from('feature_flags')
      .select('value')
      .eq('key', UNIT_SYLLABUS_FLAG)
      .maybeSingle();
    return data?.value === 'on';
  } catch {
    return false;
  }
}

/** The shape one syllabus row comes back in (joined to its unit and
 *  lesson). Exported so the pure grouping below is unit-testable. */
export interface UnitStepRow {
  id: string;
  position: number;
  kind: string;
  lesson_id: string | null;
  role: string | null;
  skill_codes: string[] | null;
  technique_ids: string[] | null;
  question_count: number | null;
  minutes: number | null;
  skip_if_completed: boolean;
  unit: { skill_code: string } | { skill_code: string }[] | null;
  lesson: { title: string; status: string } | { title: string; status: string }[] | null;
}

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

/** Group rows into per-skill ordered step lists, dropping lesson steps
 *  whose lesson isn't published. Pure. */
export function buildSyllabi(rows: readonly UnitStepRow[]): UnitSyllabi {
  const out: Record<string, UnitStep[]> = {};
  for (const r of rows) {
    const unit = one(r.unit);
    if (!unit?.skill_code) continue;
    const lesson = one(r.lesson);
    if (r.kind === 'lesson') {
      if (!r.lesson_id || lesson?.status !== 'published') continue;
    } else if (r.kind !== 'drill') {
      continue;
    }
    const step: UnitStep = {
      id: r.id,
      position: r.position,
      kind: r.kind,
      lessonId: r.kind === 'lesson' ? r.lesson_id : null,
      lessonTitle: r.kind === 'lesson' ? (lesson?.title ?? null) : null,
      role: r.kind === 'drill' ? ((r.role as DrillRole | null) ?? 'practice') : null,
      skillCodes: r.skill_codes && r.skill_codes.length > 0 ? r.skill_codes : null,
      techniqueIds: r.technique_ids && r.technique_ids.length > 0 ? r.technique_ids : null,
      questionCount: r.question_count,
      minutes: r.minutes,
      skipIfCompleted: r.skip_if_completed,
    };
    (out[unit.skill_code] ??= []).push(step);
  }
  for (const steps of Object.values(out)) steps.sort((a, b) => a.position - b.position);
  return out;
}

/** Syllabi + completed lessons for a student, or null when the flag is
 *  off (callers then pass nothing and the generator behaves as before). */
export async function loadSyllabusInputs(
  supabase: AnyClient,
  studentId: string,
  testType: 'sat' | 'act',
): Promise<SyllabusInputs | null> {
  if (!(await unitSyllabusEnabled(supabase))) return null;

  const [{ data: rows }, { data: done }] = await Promise.all([
    supabase
      .from('curriculum_unit_steps')
      .select(
        'id, position, kind, lesson_id, role, skill_codes, technique_ids, question_count, minutes, skip_if_completed, ' +
          'unit:curriculum_units!inner(skill_code, test_type), lesson:lessons(title, status)',
      )
      .eq('unit.test_type', testType)
      .order('position', { ascending: true }),
    supabase
      .from('lesson_progress')
      .select('lesson_id')
      .eq('student_id', studentId)
      .not('completed_at', 'is', null),
  ]);

  return {
    unitSteps: buildSyllabi((rows ?? []) as unknown as UnitStepRow[]),
    completedLessonIds: (done ?? []).map((r) => r.lesson_id),
  };
}
