// Foundation lessons and the tutor's "covered in session" record
// (docs/foundations-and-question-patterns.md §3.2 tutor roster, §4 step 5,
// §7.5 item 1).
//
// A foundation is a lesson step of a section syllabus — "Before Math",
// "Before Reading & Writing": curriculum_unit_steps rows with a section
// and no unit. The generator walks those before a section's first task
// and skips any lesson whose lesson_progress row is completed, so a
// tutor who taught a foundation live records it as covered
// (mark_lesson_covered, migration 20260924180000) and the plan never
// re-assigns it. This module is the one home for "which lessons are
// foundations" and "where does this student stand on them": the roster's
// per-student signal and the student page's Foundations card both build
// on it, and the pure parts are unit-tested.
//
// Reads run as the caller (RLS): a tutor sees published, shared lessons
// and the progress rows of the students they can view.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import type { PlanSection } from '../plan/generate-plan.ts';
import { sectionDisplayName } from '../plan/generate-plan.ts';

type AnyClient = SupabaseClient<Database>;

export interface FoundationLesson {
  lessonId: string;
  title: string;
  section: PlanSection;
  position: number;
}

/** The lesson_progress columns the status logic reads. */
export interface FoundationProgressRow {
  lesson_id: string;
  completed_at: string | null;
  covered_by?: string | null;
  covered_at?: string | null;
}

/**
 * not_started — no progress row; in_progress — opened in the app, not
 * finished; completed — finished in the app by the student; covered —
 * recorded as covered in a live session by a tutor (completed_at is set
 * either way, which is what the generator's skip rule reads).
 */
export type FoundationStatus = 'not_started' | 'in_progress' | 'completed' | 'covered';

export interface FoundationRow extends FoundationLesson {
  status: FoundationStatus;
  completedAt: string | null;
  coveredBy: string | null;
  coveredAt: string | null;
}

export interface FoundationSummary {
  /** Foundations the student has done — completed in the app or covered in session. */
  covered: number;
  total: number;
}

/** The syllabus a foundation belongs to, as the curriculum home names it. */
export function foundationSyllabusTitle(section: PlanSection): string {
  return `Before ${sectionDisplayName(section)}`;
}

export function foundationStatus(row: FoundationProgressRow | null | undefined): FoundationStatus {
  if (!row) return 'not_started';
  if (!row.completed_at) return 'in_progress';
  return row.covered_by ? 'covered' : 'completed';
}

/** How many of the foundations a student has done, either way. Pure. */
export function summarizeFoundations(
  foundations: readonly FoundationLesson[],
  rows: readonly FoundationProgressRow[],
): FoundationSummary {
  const done = new Set(rows.filter((r) => r.completed_at).map((r) => r.lesson_id));
  const covered = foundations.filter((f) => done.has(f.lessonId)).length;
  return { covered, total: foundations.length };
}

/** Each foundation with the student's standing on it, in syllabus order. Pure. */
export function buildFoundationRows(
  foundations: readonly FoundationLesson[],
  rows: readonly FoundationProgressRow[],
): FoundationRow[] {
  const byLesson = new Map(rows.map((r) => [r.lesson_id, r]));
  return foundations.map((f) => {
    const row = byLesson.get(f.lessonId) ?? null;
    return {
      ...f,
      status: foundationStatus(row),
      completedAt: row?.completed_at ?? null,
      coveredBy: row?.covered_by ?? null,
      coveredAt: row?.covered_at ?? null,
    };
  });
}

/** The shape a section-syllabus lesson step comes back in. Exported so
 *  the pure grouping below is unit-testable. */
export interface FoundationStepRow {
  position: number;
  section: string | null;
  lesson_id: string | null;
  lesson: { title: string; status: string } | { title: string; status: string }[] | null;
}

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

const SECTION_ORDER: Record<PlanSection, number> = { math: 0, reading_writing: 1 };

/** Section-syllabus lesson steps → foundation lessons: published lessons
 *  only (what the generator schedules), each lesson once, Math before
 *  Reading & Writing, in syllabus order. Pure. */
export function foundationsFromSteps(rows: readonly FoundationStepRow[]): FoundationLesson[] {
  const seen = new Set<string>();
  const out: FoundationLesson[] = [];
  const sorted = [...rows].sort((a, b) => {
    const sa = SECTION_ORDER[a.section as PlanSection] ?? 9;
    const sb = SECTION_ORDER[b.section as PlanSection] ?? 9;
    return sa - sb || a.position - b.position;
  });
  for (const r of sorted) {
    if (r.section !== 'math' && r.section !== 'reading_writing') continue;
    const lesson = one(r.lesson);
    if (!r.lesson_id || lesson?.status !== 'published') continue;
    if (seen.has(r.lesson_id)) continue;
    seen.add(r.lesson_id);
    out.push({ lessonId: r.lesson_id, title: lesson.title, section: r.section, position: r.position });
  }
  return out;
}

/** The foundation lessons of a test type, in syllabus order. Empty until
 *  a section syllabus with a published lesson exists. */
export async function loadFoundationLessons(
  supabase: AnyClient,
  testType: 'sat' | 'act' = 'sat',
): Promise<FoundationLesson[]> {
  const { data } = await supabase
    .from('curriculum_unit_steps')
    .select('position, section, lesson_id, lesson:lessons(title, status)')
    .eq('test_type', testType)
    .eq('kind', 'lesson')
    .not('section', 'is', null)
    .order('position', { ascending: true });
  return foundationsFromSteps((data ?? []) as unknown as FoundationStepRow[]);
}

/** A student's progress rows on the given lessons: completed_at plus the
 *  covered-in-session attribution. RLS scopes the read to students the
 *  caller can view. */
export async function loadFoundationProgress(
  supabase: AnyClient,
  lessonIds: readonly string[],
  studentIds?: readonly string[],
): Promise<Array<FoundationProgressRow & { student_id: string }>> {
  if (lessonIds.length === 0) return [];
  let query = supabase
    .from('lesson_progress')
    .select('student_id, lesson_id, completed_at, covered_by, covered_at')
    .in('lesson_id', [...lessonIds]);
  if (studentIds) {
    if (studentIds.length === 0) return [];
    query = query.in('student_id', [...studentIds]);
  }
  const { data } = await query;
  return data ?? [];
}
