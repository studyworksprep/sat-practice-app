// Unit syllabi loader (docs/foundations-and-question-patterns.md §7).
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
// generator never pins a task to a lesson a student can't open. Each
// lesson step carries the techniques its lesson teaches
// (lesson_techniques) and the skills those techniques apply to, which
// the practice drill after it narrows to by default (§8.5 step C);
// drill steps carry their technique_source and, for explicit narrowing,
// their own technique ids.
//
// The same table holds the two section foundation syllabi ("Before
// Math", "Before Reading & Writing"; rows with a section instead of a
// unit — §8.5 step D). buildSectionSyllabi groups those; buildSyllabi
// ignores them.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import type { DrillRole, PlanSection, SectionSyllabi, TechniqueSource, UnitStep, UnitSyllabi } from './generate-plan';

export const UNIT_SYLLABUS_FLAG = 'unit_syllabus';

type AnyClient = SupabaseClient<Database>;

export interface SyllabusInputs {
  unitSteps: UnitSyllabi;
  sectionSteps: SectionSyllabi;
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

/** The columns every syllabus reader selects (the generator, the tutor
 *  editor's "add unit syllabus", the admin editor's preview). */
export const UNIT_STEP_SELECT =
  'id, position, kind, section, test_type, lesson_id, role, skill_codes, technique_ids, technique_source, question_count, minutes, skip_if_completed, ' +
  'unit:curriculum_units(skill_code, test_type), ' +
  'lesson:lessons(title, status, lesson_techniques(technique_id, technique:techniques(name, technique_skills(skill_code))))';

interface LessonTechniqueEmbed {
  technique_id: string;
  technique:
    | { name: string; technique_skills?: Array<{ skill_code: string }> | null }
    | Array<{ name: string; technique_skills?: Array<{ skill_code: string }> | null }>
    | null;
}

interface LessonEmbed {
  title: string;
  status: string;
  lesson_techniques?: LessonTechniqueEmbed[] | null;
}

/** The shape one syllabus row comes back in (joined to its unit and
 *  lesson). Exported so the pure grouping below is unit-testable. */
export interface UnitStepRow {
  id: string;
  position: number;
  kind: string;
  /** Section foundation rows carry a section and no unit. */
  section?: string | null;
  test_type?: string | null;
  lesson_id: string | null;
  role: string | null;
  skill_codes: string[] | null;
  technique_ids: string[] | null;
  technique_source?: string | null;
  question_count: number | null;
  minutes: number | null;
  skip_if_completed: boolean;
  unit: { skill_code: string } | { skill_code: string }[] | null;
  lesson: LessonEmbed | LessonEmbed[] | null;
}

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

function asSource(v: string | null | undefined): TechniqueSource {
  return v === 'none' || v === 'explicit' ? v : 'lesson';
}

/** One row → one UnitStep, or null when it is not a usable step (an
 *  unknown kind, or a lesson step whose lesson is not published). */
function toStep(r: UnitStepRow, techniqueNames: ReadonlyMap<string, string>): UnitStep | null {
  const lesson = one(r.lesson);
  if (r.kind === 'lesson') {
    if (!r.lesson_id || lesson?.status !== 'published') return null;
  } else if (r.kind !== 'drill') {
    return null;
  }
  const isLesson = r.kind === 'lesson';
  const lessonTechniques = isLesson ? (lesson?.lesson_techniques ?? []) : [];
  const techniqueIds = isLesson
    ? lessonTechniques.map((t) => t.technique_id)
    : r.technique_ids && r.technique_ids.length > 0
      ? r.technique_ids
      : null;
  const names = isLesson
    ? lessonTechniques.map((t) => one(t.technique)?.name ?? techniqueNames.get(t.technique_id) ?? '')
    : (techniqueIds ?? []).map((id) => techniqueNames.get(id) ?? '');
  // The skills the lesson's techniques apply to by default — a
  // foundation's practice step draws across them.
  const techniqueSkillCodes = isLesson
    ? [...new Set(lessonTechniques.flatMap((t) => (one(t.technique)?.technique_skills ?? []).map((s) => s.skill_code)))]
    : [];
  return {
    id: r.id,
    position: r.position,
    kind: r.kind,
    lessonId: isLesson ? r.lesson_id : null,
    lessonTitle: isLesson ? (lesson?.title ?? null) : null,
    role: r.kind === 'drill' ? ((r.role as DrillRole | null) ?? 'practice') : null,
    skillCodes: r.skill_codes && r.skill_codes.length > 0 ? r.skill_codes : null,
    techniqueIds: techniqueIds && techniqueIds.length > 0 ? techniqueIds : null,
    techniqueNames: techniqueIds && techniqueIds.length > 0 && names.every(Boolean) ? names : null,
    techniqueSkillCodes: techniqueSkillCodes.length > 0 ? techniqueSkillCodes : null,
    techniqueSource: isLesson ? null : asSource(r.technique_source),
    questionCount: r.question_count,
    minutes: r.minutes,
    skipIfCompleted: r.skip_if_completed,
  };
}

/** Group unit rows into per-skill ordered step lists, dropping lesson
 *  steps whose lesson isn't published and every section row. Pure.
 *  `techniqueNames` resolves the names of explicit drill narrowing
 *  (lesson techniques carry their own names through the embed). */
export function buildSyllabi(
  rows: readonly UnitStepRow[],
  techniqueNames: ReadonlyMap<string, string> = new Map(),
): UnitSyllabi {
  const out: Record<string, UnitStep[]> = {};
  for (const r of rows) {
    const unit = one(r.unit);
    if (!unit?.skill_code || r.section) continue;
    const step = toStep(r, techniqueNames);
    if (step) (out[unit.skill_code] ??= []).push(step);
  }
  for (const steps of Object.values(out)) steps.sort((a, b) => a.position - b.position);
  return out;
}

/** Group section rows into the two foundation syllabi. Pure. */
export function buildSectionSyllabi(
  rows: readonly UnitStepRow[],
  techniqueNames: ReadonlyMap<string, string> = new Map(),
): SectionSyllabi {
  const out: Partial<Record<PlanSection, UnitStep[]>> = {};
  for (const r of rows) {
    if (r.section !== 'math' && r.section !== 'reading_writing') continue;
    const step = toStep(r, techniqueNames);
    if (step) (out[r.section] ??= []).push(step);
  }
  for (const steps of Object.values(out)) steps.sort((a, b) => a.position - b.position);
  return out;
}

/** id → name for the whole technique catalog (names for explicit
 *  narrowing on drill steps). */
export async function loadTechniqueNameMap(supabase: AnyClient): Promise<Map<string, string>> {
  const { data } = await supabase.from('techniques').select('id, name');
  return new Map((data ?? []).map((t) => [t.id, t.name]));
}

/** Syllabi + completed lessons for a student, or null when the flag is
 *  off (callers then pass nothing and the generator behaves as before). */
export async function loadSyllabusInputs(
  supabase: AnyClient,
  studentId: string,
  testType: 'sat' | 'act',
): Promise<SyllabusInputs | null> {
  if (!(await unitSyllabusEnabled(supabase))) return null;

  const [{ data: rows }, { data: done }, techniqueNames] = await Promise.all([
    supabase
      .from('curriculum_unit_steps')
      .select(UNIT_STEP_SELECT)
      .eq('test_type', testType)
      .order('position', { ascending: true }),
    supabase
      .from('lesson_progress')
      .select('lesson_id')
      .eq('student_id', studentId)
      .not('completed_at', 'is', null),
    loadTechniqueNameMap(supabase),
  ]);

  const stepRows = (rows ?? []) as unknown as UnitStepRow[];
  return {
    unitSteps: buildSyllabi(stepRows, techniqueNames),
    sectionSteps: buildSectionSyllabi(stepRows, techniqueNames),
    completedLessonIds: (done ?? []).map((r) => r.lesson_id),
  };
}
