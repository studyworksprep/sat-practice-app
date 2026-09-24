// Deterministic plan engine (upgrade plan §2.2 + §2.5).
//
// PURE functions: given a student's per-skill state + goal + timeframe,
// generatePlan() returns a week-by-week list of tasks, and repacePlan()
// decides whether an active plan has drifted enough to regenerate its
// remaining weeks (preserving the tutor's edits). No I/O, and `today` is
// an input (never Date.now()), so both are fully reproducible and
// unit-testable — the same pattern as lib/mastery.ts. The DB layer that
// assembles the inputs (from get_student_coverage §1.3 + curriculum_units
// §1.2) and writes study_plans / plan_tasks is a separate thin wrapper
// (lib/plan/plan-actions.ts), built with the intake flow (§2.4).
//
// "Deterministic first, model-assisted later" (§2.2): this is the
// deterministic v1 — transparent heuristics a tutor can reason about and
// tune. Every task carries a plain-language `why`, and the numeric knobs
// are the documented constants below.

// Phase composer (docs/student-onboarding-and-plan-redesign-2026-09.md
// §5): the generator no longer ranks every skill from day one. A plan
// is composed of PHASES — coverage (curriculum in sequence order),
// focus (rank by gap, evidence first), rehearsal (full tests + review),
// or targets (the student's own picks) — and the MODE decides which
// phases a plan gets and how long each runs.

import { domainDisplayName, skillDisplayName, renderDrillWhy, isSilentWhyCode } from './task-labels.ts';
import type { DrillWhyCode } from './task-labels.ts';
import { VOLUME_CURVE } from '../mastery.ts';

export type PlanTaskType =
  | 'lesson'
  | 'drill'
  | 'review'
  | 'practice_set'
  | 'full_test'
  | 'vocab'
  | 'flashcards';

export type PlanSection = 'math' | 'reading_writing';

/** How a plan is composed (§5.2). */
export type PlanMode = 'foundations' | 'targeted' | 'self_directed';

export type PlanPhaseType = 'coverage' | 'focus' | 'rehearsal' | 'targets';

/** A contiguous run of weeks with one job. Week indexes are inclusive
 *  and 0-based on the plan's own grid. */
export interface PlanPhase {
  type: PlanPhaseType;
  startWeek: number;
  endWeek: number;
  summary: string;
}

/** Who authored a task. The generator only emits 'generated'; re-pacing
 *  (§2.5) preserves 'tutor' tasks and a student can add 'student' ones. */
export type PlanTaskSource = 'generated' | 'tutor' | 'student';

// ── Unit syllabi (docs/foundations-and-question-patterns.md §5) ──────
//
// A curriculum unit (one per skill) may carry an ordered syllabus: the
// lessons that teach it, in teaching order, each followed by the drill
// that exercises it, and a mixed set at the end. When PlanInput.unitSteps
// is present (feature flag `unit_syllabus`, loaded by unit-steps.ts) the
// coverage and targets phases walk each unit's steps instead of the
// built-in lesson-then-drill pair, and focus draws its drills from the
// unit's syllabus. Absent = the pre-syllabus behavior, unchanged.

export type UnitStepKind = 'lesson' | 'drill';
/** practice = the questions for the lesson just taught; mixed = homework
 *  across the unit (and its domain's earlier units) so far. */
export type DrillRole = 'practice' | 'mixed';
/** Where a practice drill's technique narrowing comes from
 *  (curriculum_unit_steps.technique_source). */
export type TechniqueSource = 'lesson' | 'none' | 'explicit';

export interface UnitStep {
  /** curriculum_unit_steps.id; null for a synthesized default step. */
  id?: string | null;
  position: number;
  kind: UnitStepKind;
  /** kind = lesson. A null id is a placeholder the launcher resolves. */
  lessonId?: string | null;
  lessonTitle?: string | null;
  /** kind = drill */
  role?: DrillRole | null;
  /** Skill codes the drill draws from; null = the unit's own skill (or,
   *  for a mixed set, the domain's units walked so far). */
  skillCodes?: readonly string[] | null;
  /** kind = drill: explicit technique narrowing (techniqueSource =
   *  'explicit'). kind = lesson: the techniques the lesson teaches
   *  (lesson_techniques), which the practice step after it narrows to
   *  by default. Matching questions — tagged, or default-applicable by
   *  skill — are drawn first; the launcher tops up from the skills. */
  techniqueIds?: readonly string[] | null;
  /** Names for techniqueIds, same order, for titles and why-lines. */
  techniqueNames?: readonly string[] | null;
  /** kind = drill: 'lesson' (default) narrows a practice drill to the
   *  preceding lesson step's techniques; 'none' draws the whole skill;
   *  'explicit' uses this step's techniqueIds. Mixed sets never narrow. */
  techniqueSource?: TechniqueSource | null;
  questionCount?: number | null;
  minutes?: number | null;
  /** Lesson steps: skip when the student already completed the lesson
   *  (default true) — a technique taught in an earlier unit is not
   *  re-taught. */
  skipIfCompleted?: boolean;
}

/** Syllabi keyed by the unit's skill code. */
export type UnitSyllabi = Readonly<Record<string, readonly UnitStep[]>>;

/** One skill's current state — the shape get_student_coverage (§1.3)
 *  joined with curriculum_units (§1.2) + skill_learnability provides. */
export interface SkillState {
  domainCode: string;
  skillCode: string;
  section: PlanSection;
  mastery: number | null;          // 0-100 (null = no data yet)
  attemptsCount: number;           // distinct questions attempted
  coverageStatus: string;          // not_started | in_progress | practiced | mastered | decayed
  masteryThreshold: number;        // curriculum_units.mastery_threshold
  learnability: number | null;     // skill_learnability 1-10 (higher = easier to improve)
  expectedMinutes: number;         // curriculum_units.expected_minutes
  sequence: number;                // curriculum order (stable tiebreak)
  questionsAvailable: number;      // published questions in the skill
  hasLesson: boolean;              // lesson coverage exists
  /** Evidence prior (§5.4): 0–1, 1 = fully mastered, from intake
   *  self-assessment (Phase 1) or reported tests (Phase 3). Blended
   *  into the gap term while in-app attempts are few. */
  evidencePrior?: number | null;
  evidencePriorSource?: 'self_rating' | 'score_report' | null;
}

export interface PlanInput {
  goalScore: number;
  startingScore: number | null;
  testDate: string;                // ISO yyyy-mm-dd
  today: string;                   // ISO yyyy-mm-dd (as-of; passed in for purity)
  weeklyHours: number;             // student's declared budget
  testType: 'sat' | 'act';
  skills: SkillState[];
  practiceTestCadenceWeeks?: number; // default DEFAULT_CADENCE_WEEKS
  /** Composition mode (§5.2). Defaults to 'targeted', which is the
   *  pre-phase behavior (rank from day one) — so tutor-generated plans
   *  and existing tests are unchanged unless a mode is passed. */
  mode?: PlanMode;
  /** Weekdays the student can study, 0 = Sunday. Null/empty = all. */
  studyDays?: readonly number[] | null;
  /** Self-directed: the chosen skill codes. */
  targets?: readonly string[] | null;
  /** Include full-length practice tests (default true). */
  fullTests?: boolean;
  /** Weeks of the plan already elapsed before `today` — a re-pace
   *  regenerates the remaining horizon but phases are laid out over the
   *  ORIGINAL horizon, so a plan in its focus phase stays there. */
  elapsedWeeks?: number;
  /** Per-unit syllabi (flag `unit_syllabus`). See UnitStep. */
  unitSteps?: UnitSyllabi | null;
  /** Lessons the student has completed (lesson_progress.completed_at);
   *  their lesson steps are skipped wherever they appear. */
  completedLessonIds?: readonly string[] | null;
}

export interface PlanTaskDraft {
  weekIndex: number;
  scheduledDate: string;           // ISO yyyy-mm-dd
  taskType: PlanTaskType;
  payload: Record<string, unknown>;
  source: PlanTaskSource;
}

/** A task before its day is chosen. */
type SlotTask = Omit<PlanTaskDraft, 'scheduledDate'>;

export interface PlanDraft {
  weeks: number;
  tasks: PlanTaskDraft[];
  rationale: string;
  mode: PlanMode;
  phases: PlanPhase[];
}

// ── Tunable knobs (a tutor could adjust; kept explicit for transparency) ──
const AVG_TASK_MINUTES = 40;       // rough minutes per non-test task, for sizing the week
const DEFAULT_CADENCE_WEEKS = 3;   // a full practice test every N weeks
const DRILL_QUESTION_COUNT = 8;    // questions per skill drill
const MIXED_SET_QUESTION_COUNT = 10; // questions per mixed set (syllabus 'mixed' drill)
const MIXED_SET_MAX_SKILLS = 4;    // a mixed set spans at most this many skills
const FULL_TEST_MINUTES = 180;
const REVIEW_MINUTES = 20;
const MAX_WEEKS = 52;
const MIN_TASKS_PER_WEEK = 3;
const MAX_TASKS_PER_WEEK = 21;     // 3/day ceiling
/** Share of the non-rehearsal horizon a foundations plan spends on
 *  coverage (§5.2; open question 2 in the design doc). */
const COVERAGE_SHARE = 0.6;
/** An evidence prior at or above this counts as "strong": coverage
 *  drills the skill without the lesson first (§5.4). */
export const STRONG_PRIOR = 0.75;
/** At or below this the prior explains the drill ('self_rated_low'). */
const WEAK_PRIOR = 0.4;

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

// Exported for the plan-family modules (lib/plan/today.ts) so the
// date arithmetic has one home — same UTC-anchored day math everywhere.
export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(aIso: string, bIso: string): number {
  const a = new Date(`${aIso}T00:00:00Z`).getTime();
  const b = new Date(`${bIso}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** A skill still needs work: not mastered, and either an early coverage
 *  state or below its mastery threshold. */
function isWeak(s: SkillState): boolean {
  if (s.coverageStatus === 'mastered') return false;
  if (
    s.coverageStatus === 'not_started' ||
    s.coverageStatus === 'in_progress' ||
    s.coverageStatus === 'decayed'
  ) {
    return true;
  }
  return (s.mastery ?? 0) < s.masteryThreshold;
}

/** Priority = gap × learnability × leverage (§2.2). Higher = do sooner.
 *  Mastered skills return 0 (excluded). */
function priority(s: SkillState, maxQInSection: number): number {
  if (s.coverageStatus === 'mastered') return 0;
  // gap: how far below the mastery bar (unknown mastery → treat as a
  // meaningful-but-not-max gap; decayed skills get a floor so a slipped
  // skill isn't out-prioritized by a never-started one).
  let gap =
    s.mastery == null
      ? 0.6
      : Math.max(0, s.masteryThreshold - s.mastery) / Math.max(1, s.masteryThreshold);
  // Evidence prior (§5.3): while in-app attempts are few, the gap leans
  // on what the student told us (self-rating) or reported (a test);
  // the prior fades out linearly as real drills accumulate.
  if (s.evidencePrior != null && s.attemptsCount < LOW_EVIDENCE_ATTEMPTS) {
    const w = s.attemptsCount / LOW_EVIDENCE_ATTEMPTS;
    gap = (1 - w) * (1 - s.evidencePrior) + w * gap;
  }
  if (s.coverageStatus === 'decayed') gap = Math.max(gap, 0.5);
  const learn = (s.learnability ?? 5) / 10; // 0.1 .. 1.0
  const leverage = 0.5 + 0.5 * (maxQInSection > 0 ? s.questionsAvailable / maxQInSection : 0);
  return gap * learn * leverage;
}

/** Below this many attempts the mastery score is dominated by its volume
 *  factor rather than by how the student is actually doing: at 5
 *  attempts a flawless run still scores ~53 of 100. Under this bar the
 *  drill copy talks about evidence, not shortfall. */
export const LOW_EVIDENCE_ATTEMPTS = 8;

/** Implied weighted accuracy — the mastery score with its volume factor
 *  divided back out. Approximate (it ignores the ≤5% recency bonus, so
 *  it reads a touch high), which is fine for picking which sentence to
 *  show and is never surfaced as a number. Null when there's nothing to
 *  divide. */
function impliedAccuracy(mastery: number | null, attempts: number): number | null {
  if (mastery == null || attempts <= 0) return null;
  const volumeFactor = 1 - Math.exp(-VOLUME_CURVE * attempts);
  if (volumeFactor <= 0) return null;
  return Math.min(1, mastery / 100 / volumeFactor);
}

/** Why a drill is on the plan. The generator picks the CODE; the
 *  sentence lives in lib/plan/task-labels.ts so copy changes never
 *  require rewriting stored payloads. */
export interface DrillWhy {
  code: DrillWhyCode;
  /** Questions attempted so far — the low-evidence copy names it. */
  attempts: number;
}

function whyForDrill(s: SkillState): DrillWhy {
  const attempts = s.attemptsCount;
  if (s.coverageStatus === 'decayed') return { code: 'decayed', attempts };
  // A weak prior is the most honest reason while attempts are few —
  // it names what the student told us rather than a score they can't
  // see behind.
  if (
    s.evidencePrior != null &&
    s.evidencePrior <= WEAK_PRIOR &&
    attempts < LOW_EVIDENCE_ATTEMPTS
  ) {
    return {
      code: s.evidencePriorSource === 'score_report' ? 'prior_weak' : 'self_rated_low',
      attempts,
    };
  }
  if (s.coverageStatus === 'not_started') return { code: 'not_started', attempts };
  // Too few questions for the score to mean much yet — say that, rather
  // than reporting a gap the student would read as a verdict.
  if (attempts < LOW_EVIDENCE_ATTEMPTS) return { code: 'low_evidence', attempts };
  const accuracy = impliedAccuracy(s.mastery, attempts);
  if (accuracy == null) return { code: 'low_evidence', attempts };
  if (accuracy >= 0.85) return { code: 'near_threshold', attempts };
  if (accuracy >= 0.7) return { code: 'mixed', attempts };
  return { code: 'shaky', attempts };
}

// ── Task payload builders ─────────────────────────────────────────
//
// One home for the payload shapes, shared by the generator below and
// the tutor plan editor (§2.4 — manual adds and skill swaps go through
// these so an edited task is indistinguishable in shape from a
// generated one, and the runner/completion path treats both alike).

/** The minimal skill identity the payload builders need — a full
 *  SkillState qualifies, and the editor can supply a bare unit. */
export interface SkillRef {
  domainCode: string;
  skillCode: string;
  expectedMinutes?: number;
}

/** `why` takes either a hand-written sentence (tutor adds and skill
 *  swaps, which pass through verbatim forever) or a DrillWhy reason.
 *  A reason additionally stamps why_code / why_attempts, which the
 *  display layer prefers — the rendered sentence is still written so a
 *  raw payload stays self-describing. */
export function buildDrillPayload(s: SkillRef, why: string | DrillWhy): Record<string, unknown> {
  const label = skillDisplayName(s.domainCode, s.skillCode);
  const reason = typeof why === 'string' ? null : why;
  return {
    domain_code: s.domainCode,
    skill_code: s.skillCode,
    // Same shape practice_sessions.filter_criteria uses, so the
    // existing runner + completion path is reused (§2.1).
    filter_criteria: {
      domain_code: s.domainCode,
      skill_code: s.skillCode,
      count: DRILL_QUESTION_COUNT,
    },
    title: `Drill: ${label}`,
    minutes: Math.min(s.expectedMinutes ?? AVG_TASK_MINUTES, AVG_TASK_MINUTES),
    why: reason ? renderDrillWhy(reason.code, reason.attempts) : why,
    ...(reason ? { why_code: reason.code, why_attempts: reason.attempts } : {}),
  };
}

export function buildLessonPayload(s: SkillRef, why: string): Record<string, unknown> {
  const label = skillDisplayName(s.domainCode, s.skillCode);
  return {
    domain_code: s.domainCode,
    skill_code: s.skillCode,
    title: `Lesson: ${label}`,
    minutes: s.expectedMinutes ?? AVG_TASK_MINUTES,
    why,
  };
}

/** A syllabus lesson step. Carries the pinned lesson (id + its own
 *  title, so the task promises exactly what Start opens); a placeholder
 *  step (no lesson id) degrades to the skill-named lesson task. */
export function buildLessonStepPayload(
  s: SkillRef,
  step: UnitStep,
  why: string,
): Record<string, unknown> {
  const label = skillDisplayName(s.domainCode, s.skillCode);
  return {
    domain_code: s.domainCode,
    skill_code: s.skillCode,
    ...(step.lessonId ? { lesson_id: step.lessonId } : {}),
    ...(step.id ? { unit_step_id: step.id } : {}),
    ...(step.techniqueNames && step.techniqueNames.length > 0
      ? { technique_names: [...step.techniqueNames] }
      : {}),
    title: step.lessonTitle ? `Lesson: ${step.lessonTitle}` : `Lesson: ${label}`,
    minutes: step.minutes ?? s.expectedMinutes ?? AVG_TASK_MINUTES,
    why,
  };
}

/** "A and B", "A, B, and C". */
function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

/** The techniques a drill step narrows to: its own (explicit), the
 *  preceding lesson's (the default), or none. Mixed sets never narrow. */
export function resolveTechniqueNarrowing(
  step: UnitStep,
  lesson: UnitStep | null | undefined,
): { ids: string[]; names: string[] } {
  const role: DrillRole = step.role ?? 'practice';
  if (role === 'mixed') return { ids: [], names: [] };
  // A step that carries its own ids without saying so is explicit
  // (the same rule the editor's validator applies to blank input).
  const source: TechniqueSource =
    step.techniqueSource ?? (step.techniqueIds && step.techniqueIds.length > 0 ? 'explicit' : 'lesson');
  const from = source === 'explicit' ? step : source === 'lesson' ? lesson : null;
  const ids = [...(from?.techniqueIds ?? [])];
  if (ids.length === 0) return { ids: [], names: [] };
  const names = (from?.techniqueNames ?? []).filter((n): n is string => Boolean(n));
  return { ids, names: names.length === ids.length ? [...names] : [] };
}

/** The why-line for a narrowed drill: says what comes first and that
 *  the rest of the skill fills in (docs §8.1 decision 5). */
export function techniqueWhyLine(names: readonly string[], skillLabel: string): string {
  return names.length > 0
    ? `Questions solved by ${joinNames(names)} come first, then the rest of ${skillLabel}.`
    : `Questions for the lesson's techniques come first, then the rest of ${skillLabel}.`;
}

/** A syllabus drill step. `lesson` is the lesson step it follows (the
 *  practice drill exercises that lesson, the title says so, and by
 *  default the drill narrows to the techniques that lesson teaches);
 *  `mixedSkills` is the default draw for a mixed set. The
 *  filter_criteria shape extends the plain drill's with skill_codes and
 *  optional technique_ids, which the launcher honors (technique-matching
 *  questions first, topped up from the skills). */
export function buildDrillStepPayload(
  s: SkillRef,
  step: UnitStep,
  why: string | DrillWhy,
  opts: { lesson?: UnitStep | null; mixedSkills?: readonly string[] | null } = {},
): Record<string, unknown> {
  const label = skillDisplayName(s.domainCode, s.skillCode);
  const role: DrillRole = step.role ?? 'practice';
  const reason = typeof why === 'string' ? null : why;
  const skillCodes: string[] =
    step.skillCodes && step.skillCodes.length > 0
      ? [...step.skillCodes]
      : role === 'mixed' && opts.mixedSkills && opts.mixedSkills.length > 0
        ? [...opts.mixedSkills]
        : [s.skillCode];
  const count =
    step.questionCount ?? (role === 'mixed' ? MIXED_SET_QUESTION_COUNT : DRILL_QUESTION_COUNT);
  const title =
    role === 'mixed'
      ? `Mixed practice: ${domainDisplayName(s.domainCode)}`
      : opts.lesson?.lessonTitle
        ? `Practice: ${opts.lesson.lessonTitle}`
        : `Drill: ${label}`;
  const narrowing = resolveTechniqueNarrowing(step, opts.lesson);
  const narrowed = narrowing.ids.length > 0;
  const reasonText = reason ? renderDrillWhy(reason.code, reason.attempts) : why;
  // A narrowed drill says so in its why-line. A silent phase code
  // (coverage / targets) yields to the technique note; a real reason
  // precedes it. The code itself is dropped then — the rendered line
  // would otherwise take precedence and hide the note.
  const techniqueWhy = narrowed ? techniqueWhyLine(narrowing.names, label) : null;
  const leadIn = reason ? (isSilentWhyCode(reason.code) ? '' : reasonText) : why;
  return {
    domain_code: s.domainCode,
    skill_code: s.skillCode,
    skill_codes: skillCodes,
    filter_criteria: {
      domain_code: s.domainCode,
      skill_code: s.skillCode,
      skill_codes: skillCodes,
      count,
      ...(narrowed ? { technique_ids: narrowing.ids } : {}),
    },
    ...(narrowed && narrowing.names.length > 0 ? { technique_names: narrowing.names } : {}),
    title,
    minutes: step.minutes ?? Math.min(s.expectedMinutes ?? AVG_TASK_MINUTES, AVG_TASK_MINUTES),
    why: techniqueWhy ? [leadIn, techniqueWhy].filter(Boolean).join(' ') : reasonText,
    ...(reason && !techniqueWhy ? { why_code: reason.code, why_attempts: reason.attempts } : {}),
    drill_role: role,
    ...(step.id ? { unit_step_id: step.id } : {}),
    ...(opts.lesson?.lessonId ? { lesson_id: opts.lesson.lessonId } : {}),
  };
}

/** One unit's syllabus expanded into tasks, in order — the same rules
 *  the generator's walk applies (completed lessons skipped, a shared
 *  lesson once, a practice drill titled after the lesson before it, a
 *  mixed set unlinked). Used by the tutor editor's "add unit" and the
 *  admin editor's "student sees" preview, so both match the plan. */
export interface ExpandedSyllabusTask {
  taskType: 'lesson' | 'drill';
  payload: Record<string, unknown>;
}

export function expandUnitSyllabus(
  s: SkillRef,
  steps: readonly UnitStep[],
  opts: {
    completedLessonIds?: readonly string[] | null;
    why?: string;
    /** Default draw for a mixed set; the unit's own skill when omitted. */
    mixedSkills?: readonly string[] | null;
  } = {},
): ExpandedSyllabusTask[] {
  const completed = new Set(opts.completedLessonIds ?? []);
  const emitted = new Set<string>();
  const why = opts.why ?? '';
  const out: ExpandedSyllabusTask[] = [];
  let lastLesson: UnitStep | null = null;
  for (const step of steps) {
    if (step.kind === 'lesson') {
      // The practice drill after a skipped lesson still names it.
      lastLesson = step;
      const id = step.lessonId ?? null;
      if (id && ((step.skipIfCompleted ?? true) && completed.has(id) || emitted.has(id))) continue;
      if (id) emitted.add(id);
      out.push({ taskType: 'lesson', payload: buildLessonStepPayload(s, step, why) });
      continue;
    }
    out.push({
      taskType: 'drill',
      payload: buildDrillStepPayload(s, step, why, {
        lesson: step.role === 'mixed' ? null : lastLesson,
        mixedSkills: opts.mixedSkills ?? [s.skillCode],
      }),
    });
  }
  return out;
}

/** The built-in pair a unit falls back to when it has no syllabus rows:
 *  a (placeholder) lesson if the unit has lesson coverage, then a
 *  practice drill — the pre-syllabus behavior. */
export function defaultUnitSteps(s: SkillState): UnitStep[] {
  const steps: UnitStep[] = [];
  if (s.hasLesson) steps.push({ position: 1, kind: 'lesson' });
  steps.push({ position: steps.length + 1, kind: 'drill', role: 'practice' });
  return steps;
}

// ── Phase composition (§5.2) ──────────────────────────────────────

const PHASE_SUMMARY: Record<PlanPhaseType, string> = {
  coverage:
    'Cover every topic in order — its lessons, each with a short practice set — so the plan learns where you actually stand.',
  focus: 'Concentrate on the skills your work so far shows are weakest.',
  rehearsal: 'Full-length practice tests and targeted review — pacing and stamina for test day.',
  targets: 'Cycle through the skills you chose, with a lesson the first time a weak one comes up.',
};

/** Lay phases over a `weeks`-long horizon for a mode. Exported for the
 *  unit tests and for surfaces that explain a plan before it exists. */
export function composePhases(mode: PlanMode, weeks: number, fullTests = true): PlanPhase[] {
  const total = Math.max(1, weeks);
  const rehearsal = fullTests ? (total >= 6 ? 2 : total >= 3 ? 1 : 0) : 0;
  const rem = total - rehearsal;

  const out: PlanPhase[] = [];
  let cursor = 0;
  const push = (type: PlanPhaseType, n: number) => {
    if (n <= 0) return;
    out.push({ type, startWeek: cursor, endWeek: cursor + n - 1, summary: PHASE_SUMMARY[type] });
    cursor += n;
  };

  if (mode === 'foundations') {
    if (rem <= 2) {
      push('coverage', rem);
    } else {
      const coverage = clamp(Math.round(COVERAGE_SHARE * rem), 1, rem - 1);
      push('coverage', coverage);
      push('focus', rem - coverage);
    }
  } else if (mode === 'targeted') {
    push('focus', rem);
  } else {
    push('targets', rem);
  }
  push('rehearsal', rehearsal);
  return out;
}

function phaseAt(phases: readonly PlanPhase[], week: number): PlanPhase {
  return (
    phases.find((p) => week >= p.startWeek && week <= p.endWeek) ??
    phases[phases.length - 1]
  );
}

/** Weekday (0 = Sunday) of an ISO date, UTC-anchored like addDays. */
function weekdayOf(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

/** Day offsets (0–6) within a week starting on `weekStart` that fall on
 *  an allowed study day. Falls back to every day when nothing matches. */
function allowedOffsets(weekStart: string, studyDays: readonly number[] | null | undefined): number[] {
  const all = [0, 1, 2, 3, 4, 5, 6];
  if (!studyDays || studyDays.length === 0) return all;
  const set = new Set(studyDays);
  const allowed = all.filter((d) => set.has(weekdayOf(addDays(weekStart, d))));
  return allowed.length > 0 ? allowed : all;
}

/** A skill that still has evidence to build: coverage walks these. */
function isUncovered(s: SkillState): boolean {
  return s.coverageStatus !== 'practiced' && s.coverageStatus !== 'mastered';
}

/** A strong prior: the student (or a reported test) says this is already
 *  solid, so no lesson before the drill (§5.4). */
function isStrong(s: SkillState): boolean {
  return (s.evidencePrior ?? 0) >= STRONG_PRIOR;
}

function hasEvidence(s: SkillState): boolean {
  return s.attemptsCount >= LOW_EVIDENCE_ATTEMPTS || s.evidencePrior != null;
}

export function generatePlan(input: PlanInput): PlanDraft {
  const mode: PlanMode = input.mode ?? 'targeted';
  const fullTests = input.fullTests ?? true;
  const cadence = input.practiceTestCadenceWeeks ?? DEFAULT_CADENCE_WEEKS;
  const elapsed = Math.max(0, Math.floor(input.elapsedWeeks ?? 0));
  const totalDays = Math.max(1, daysBetween(input.today, input.testDate));
  const weeks = clamp(Math.ceil(totalDays / 7), 1, MAX_WEEKS);

  // Phases are laid over the ORIGINAL horizon (elapsed + remaining) and
  // then shifted onto this draft's 0-based grid; phases wholly in the
  // past are dropped so a re-paced plan resumes mid-course.
  const phases = composePhases(mode, elapsed + weeks, fullTests)
    .map((p) => ({ ...p, startWeek: p.startWeek - elapsed, endWeek: p.endWeek - elapsed }))
    .filter((p) => p.endWeek >= 0)
    .map((p) => ({ ...p, startWeek: Math.max(0, p.startWeek) }));

  // Only practicable skills: has questions, not already mastered.
  const practicable = input.skills.filter(
    (s) => s.questionsAvailable > 0 && s.coverageStatus !== 'mastered',
  );
  const maxQBySection: Record<PlanSection, number> = { math: 0, reading_writing: 0 };
  for (const s of practicable) {
    if (s.questionsAvailable > maxQBySection[s.section]) {
      maxQBySection[s.section] = s.questionsAvailable;
    }
  }
  // Focus ranking: skills with evidence first (that's what focus is
  // for), then the rest; priority desc within each; sequence tiebreak.
  const ranked = [...practicable].sort((a, b) => {
    const ea = hasEvidence(a) ? 0 : 1;
    const eb = hasEvidence(b) ? 0 : 1;
    if (ea !== eb) return ea - eb;
    const diff = priority(b, maxQBySection[b.section]) - priority(a, maxQBySection[a.section]);
    if (diff !== 0) return diff;
    return a.sequence - b.sequence;
  });
  // Coverage order: the curriculum, skipping skills that already carry
  // evidence (a re-paced plan resumes with what's still untouched).
  const curriculum = practicable.filter(isUncovered).sort((a, b) => a.sequence - b.sequence);
  // Targets: the student's picks, in curriculum order; empty → focus ranking.
  const targetSet = new Set(input.targets ?? []);
  const targetPool = practicable
    .filter((s) => targetSet.has(s.skillCode))
    .sort((a, b) => a.sequence - b.sequence);

  const tasksPerWeek = clamp(
    Math.round((input.weeklyHours * 60) / AVG_TASK_MINUTES),
    MIN_TASKS_PER_WEEK,
    MAX_TASKS_PER_WEEK,
  );

  const lessonsScheduled = new Set<string>();
  const tasks: PlanTaskDraft[] = [];
  const cursors: Record<PlanPhaseType, number> = { coverage: 0, focus: 0, rehearsal: 0, targets: 0 };

  const lessonTask = (w: number, s: SkillState, why: string): SlotTask => ({
    weekIndex: w,
    taskType: 'lesson',
    source: 'generated',
    payload: buildLessonPayload(s, why),
  });
  const drillTask = (w: number, s: SkillState, why: string | DrillWhy): SlotTask => ({
    weekIndex: w,
    taskType: 'drill',
    source: 'generated',
    payload: buildDrillPayload(s, why),
  });

  // ── Syllabus walk (unitSteps present) ─────────────────────────────
  const syllabi = input.unitSteps ?? null;
  const completedLessons = new Set(input.completedLessonIds ?? []);
  /** Lesson ids emitted in this draft — a lesson shared by several
   *  units is scheduled once. */
  const lessonsEmitted = new Set<string>();
  /** Where each pool's walk stands: which unit, which step within it.
   *  unit counts past the pool length, so pass = floor(unit / length). */
  const walks: Record<'coverage' | 'targets', { unit: number; step: number }> = {
    coverage: { unit: 0, step: 0 },
    targets: { unit: 0, step: 0 },
  };
  /** Skills walked so far per domain — the default draw for a mixed set. */
  const walkedByDomain = new Map<string, string[]>();
  const focusDrillCursor = new Map<string, number>();

  const noteWalked = (s: SkillState) => {
    const list = walkedByDomain.get(s.domainCode) ?? [];
    if (!list.includes(s.skillCode)) {
      list.push(s.skillCode);
      walkedByDomain.set(s.domainCode, list);
    }
  };
  const mixedSkillsFor = (s: SkillState): string[] => {
    const list = walkedByDomain.get(s.domainCode) ?? [];
    const codes = list.includes(s.skillCode) ? list : [...list, s.skillCode];
    return codes.slice(-MIXED_SET_MAX_SKILLS);
  };
  const stepsFor = (s: SkillState): readonly UnitStep[] =>
    syllabi?.[s.skillCode] ?? defaultUnitSteps(s);
  /** A later pass over a pool revisits only the unit's mixed sets (else
   *  its last drill) — the lessons were taught on the first pass. */
  const stepsForPass = (s: SkillState, pass: number): readonly UnitStep[] => {
    const steps = stepsFor(s);
    if (pass === 0) return steps;
    const drills = steps.filter((st) => st.kind === 'drill');
    const mixed = drills.filter((st) => st.role === 'mixed');
    if (mixed.length > 0) return mixed;
    return drills.length > 0 ? [drills[drills.length - 1]] : [];
  };
  const lessonBefore = (steps: readonly UnitStep[], index: number): UnitStep | null => {
    for (let i = index - 1; i >= 0; i--) if (steps[i].kind === 'lesson') return steps[i];
    return null;
  };
  const lessonStepTask = (w: number, s: SkillState, step: UnitStep, why: string): SlotTask => ({
    weekIndex: w,
    taskType: 'lesson',
    source: 'generated',
    payload: buildLessonStepPayload(s, step, why),
  });
  const drillStepTask = (
    w: number,
    s: SkillState,
    steps: readonly UnitStep[],
    step: UnitStep,
    why: string | DrillWhy,
  ): SlotTask => {
    const idx = steps.indexOf(step);
    // A practice drill exercises the lesson before it; a mixed set is
    // homework across the unit and links to no single lesson.
    const lesson = step.role !== 'mixed' && idx >= 0 ? lessonBefore(steps, idx) : null;
    return {
      weekIndex: w,
      taskType: 'drill',
      source: 'generated',
      payload: buildDrillStepPayload(s, step, why, { lesson, mixedSkills: mixedSkillsFor(s) }),
    };
  };
  /** Claim a lesson step: false when the lesson is already completed or
   *  already on this draft. A placeholder (no id) dedupes by skill. */
  const takeLessonStep = (s: SkillState, step: UnitStep): boolean => {
    const id = step.lessonId ?? null;
    if (id) {
      if ((step.skipIfCompleted ?? true) && completedLessons.has(id)) return false;
      if (lessonsEmitted.has(id)) return false;
      lessonsEmitted.add(id);
      return true;
    }
    if (lessonsScheduled.has(s.skillCode)) return false;
    lessonsScheduled.add(s.skillCode);
    return true;
  };
  /** The next task from walking a pool's syllabi in order, or null once
   *  every remaining step is skippable. */
  const nextFromWalk = (
    pool: readonly SkillState[],
    key: 'coverage' | 'targets',
    w: number,
    why: (s: SkillState) => string | DrillWhy,
  ): SlotTask | null => {
    if (pool.length === 0) return null;
    const st = walks[key];
    const maxSteps = Math.max(1, ...pool.map((s) => stepsFor(s).length));
    // One full pass over the pool is the most we need to look; the guard
    // keeps a pool whose every step is skippable finite.
    for (let guard = 0; guard < pool.length * (maxSteps + 1) + 1; guard++) {
      const pass = Math.floor(st.unit / pool.length);
      const s = pool[st.unit % pool.length];
      const steps = stepsForPass(s, pass);
      if (st.step >= steps.length) {
        st.unit++;
        st.step = 0;
        continue;
      }
      const step = steps[st.step++];
      if (step.kind === 'lesson') {
        if (!takeLessonStep(s, step)) continue;
        noteWalked(s);
        return lessonStepTask(w, s, step, '');
      }
      noteWalked(s);
      return drillStepTask(w, s, steps, step, why(s));
    }
    return null;
  };
  /** Focus/rehearsal pick with a syllabus: the first unclaimed lesson
   *  while the skill is weak, else cycle the unit's drills. */
  const focusPickFromSyllabus = (w: number, s: SkillState): SlotTask => {
    const steps = stepsFor(s);
    if (isWeak(s)) {
      const lessonStep = steps.find(
        (st) =>
          st.kind === 'lesson' &&
          (st.lessonId
            ? !completedLessons.has(st.lessonId) && !lessonsEmitted.has(st.lessonId)
            : !lessonsScheduled.has(s.skillCode)),
      );
      if (lessonStep && takeLessonStep(s, lessonStep)) {
        return lessonStepTask(w, s, lessonStep, 'Learn it first — weak but improvable');
      }
    }
    const drills = steps.filter((st) => st.kind === 'drill');
    if (drills.length === 0) return drillTask(w, s, whyForDrill(s));
    const idx = focusDrillCursor.get(s.skillCode) ?? 0;
    focusDrillCursor.set(s.skillCode, idx + 1);
    return drillStepTask(w, s, steps, drills[idx % drills.length], whyForDrill(s));
  };

  for (let w = 0; w < weeks; w++) {
    const weekStart = addDays(input.today, w * 7);
    const phase = phaseAt(phases, w);
    const inRehearsal = phase.type === 'rehearsal';
    // Full tests: weekly through rehearsal, always in the final week,
    // and every `cadence` weeks before that.
    const testThisWeek =
      fullTests && (inRehearsal || w === weeks - 1 || (w > 0 && w % cadence === 0));

    const weekTasks: SlotTask[] = [];

    if (testThisWeek) {
      weekTasks.push({
        weekIndex: w,
        taskType: 'full_test',
        source: 'generated',
        payload: {
          title: 'Full-length practice test',
          minutes: FULL_TEST_MINUTES,
          why: inRehearsal
            ? 'Test-day rehearsal — pacing under real timing'
            : 'Checkpoint to measure progress',
        },
      });
    }
    if (w + elapsed > 0) {
      weekTasks.push({
        weekIndex: w,
        taskType: 'review',
        source: 'generated',
        payload: {
          title: 'Spaced review',
          minutes: REVIEW_MINUTES,
          why: 'Revisit earlier weak skills so they stick',
        },
      });
    }

    let slots = Math.max(1, tasksPerWeek - weekTasks.length);
    // Rehearsal weeks are lighter on new skill work — the test is the work.
    if (inRehearsal) slots = Math.max(1, Math.floor(slots / 2));

    // One slot: coverage walk → targets pool → focus ranking. A syllabus
    // walk that runs dry falls through to the next source; the built-in
    // paths never run dry (they cycle).
    const pickSlot = (): SlotTask | null => {
      if (phase.type === 'coverage' && curriculum.length > 0) {
        if (syllabi) {
          const t = nextFromWalk(curriculum, 'coverage', w, (s) => ({
            code: 'coverage',
            attempts: s.attemptsCount,
          }));
          if (t) return t;
        } else {
          const s = curriculum[cursors.coverage % curriculum.length];
          if (s.hasLesson && !isStrong(s) && !lessonsScheduled.has(s.skillCode)) {
            // Lesson, then the drill for the same skill in the very next
            // slot — the cursor advances on the drill.
            lessonsScheduled.add(s.skillCode);
            return lessonTask(w, s, '');
          }
          cursors.coverage++;
          return drillTask(w, s, { code: 'coverage', attempts: s.attemptsCount });
        }
      }
      if ((phase.type === 'targets' || mode === 'self_directed') && targetPool.length > 0) {
        // Self-directed plans draw from the chosen skills in every phase,
        // rehearsal included.
        if (syllabi) {
          const t = nextFromWalk(targetPool, 'targets', w, (s) => ({
            code: 'targets',
            attempts: s.attemptsCount,
          }));
          if (t) return t;
        } else {
          const s = targetPool[cursors.targets % targetPool.length];
          cursors.targets++;
          if (s.hasLesson && isWeak(s) && !isStrong(s) && !lessonsScheduled.has(s.skillCode)) {
            lessonsScheduled.add(s.skillCode);
            return lessonTask(w, s, '');
          }
          return drillTask(w, s, { code: 'targets', attempts: s.attemptsCount });
        }
      }
      if (ranked.length > 0) {
        // focus, rehearsal, or a coverage/targets phase with nothing to draw.
        const s = ranked[cursors.focus % ranked.length];
        cursors.focus++;
        if (syllabi) return focusPickFromSyllabus(w, s);
        if (s.hasLesson && isWeak(s) && !isStrong(s) && !lessonsScheduled.has(s.skillCode)) {
          lessonsScheduled.add(s.skillCode);
          return lessonTask(w, s, 'Learn it first — weak but improvable');
        }
        return drillTask(w, s, whyForDrill(s));
      }
      return null;
    };

    for (let i = 0; i < slots; i++) {
      const t = pickSlot();
      if (!t) break;
      weekTasks.push(t);
    }

    // Spread the week's tasks across its allowed study days. The horizon
    // is rounded up to whole weeks, so the final week can run a few days
    // past the test date — clamp to it so nothing is scheduled after test
    // day. A full test takes the first allowed weekend day if there is
    // one, else the last allowed day; the rest spread over what's left.
    const offsets = allowedOffsets(weekStart, input.studyDays);
    const weekend = offsets.filter((d) => {
      const wd = weekdayOf(addDays(weekStart, d));
      return wd === 0 || wd === 6;
    });
    const testOffset = weekend[0] ?? offsets[offsets.length - 1];
    const others = weekTasks.filter((t) => t.taskType !== 'full_test');
    const n = others.length;
    const place = (t: SlotTask, dayOffset: number) => {
      const sched = addDays(weekStart, dayOffset);
      tasks.push({ ...t, scheduledDate: sched > input.testDate ? input.testDate : sched });
    };
    for (const t of weekTasks) {
      if (t.taskType === 'full_test') place(t, testOffset);
    }
    others.forEach((t, idx) => {
      const k = offsets.length;
      const pos = n <= 1 ? 0 : Math.round((idx * (k - 1)) / (n - 1));
      place(t, offsets[Math.min(k - 1, pos)]);
    });
  }

  const rationale = buildRationale({
    mode,
    weeks,
    elapsed,
    phases,
    goalScore: input.goalScore,
    startingScore: input.startingScore,
    cadence,
    fullTests,
    topSkills: ranked.slice(0, 3).map((s) => skillDisplayName(s.domainCode, s.skillCode)),
    targetCount: targetPool.length,
    syllabus: syllabi != null,
  });

  return { weeks, tasks, rationale, mode, phases };
}

function weekRange(p: PlanPhase, elapsed: number): string {
  const a = p.startWeek + elapsed + 1;
  const b = p.endWeek + elapsed + 1;
  return a === b ? `week ${a}` : `weeks ${a}–${b}`;
}

function buildRationale(args: {
  mode: PlanMode;
  weeks: number;
  elapsed: number;
  phases: PlanPhase[];
  goalScore: number;
  startingScore: number | null;
  cadence: number;
  fullTests: boolean;
  topSkills: string[];
  targetCount: number;
  /** Units were walked by syllabus (several lessons per unit) rather
   *  than the built-in lesson-then-drill pair. */
  syllabus?: boolean;
}): string {
  const total = args.weeks + args.elapsed;
  const gapText =
    args.startingScore != null
      ? `from ${args.startingScore} toward ${args.goalScore}`
      : `toward ${args.goalScore}`;
  const parts: string[] = [`${total}-week plan ${gapText}.`];

  for (const p of args.phases) {
    const range = weekRange(p, args.elapsed);
    if (p.type === 'coverage') {
      parts.push(
        args.syllabus
          ? `${cap(range)} cover every topic in order — each topic's lessons, with a short practice set after each — so the plan learns where you actually stand.`
          : `${cap(range)} cover every topic in order — a lesson, then a short drill for each — so the plan learns where you actually stand.`,
      );
    } else if (p.type === 'focus') {
      parts.push(
        `${cap(range)} focus on what the evidence shows is weakest` +
          (args.topSkills.length ? `, starting with ${args.topSkills.join(', ')}.` : '.'),
      );
    } else if (p.type === 'targets') {
      parts.push(`${cap(range)} cycle through the ${args.targetCount} skill${args.targetCount === 1 ? '' : 's'} you chose.`);
    } else {
      parts.push(`${cap(range)} are test rehearsal: a full-length test each week with targeted review.`);
    }
  }
  if (args.fullTests) {
    parts.push(`Full practice tests every ${args.cadence} weeks before that as checkpoints.`);
  } else {
    parts.push('No full-length tests were scheduled — add one any time from Practice tests.');
  }
  return parts.join(' ');
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── Re-pacing (§2.5) ──────────────────────────────────────────────
//
// repacePlan compares where the student ACTUALLY is (current predicted
// score) against where the active plan IMPLIED they'd be by now (a linear
// trajectory from the plan's starting score to its goal over its horizon).
// If the gap exceeds a threshold, it regenerates the REMAINING horizon
// (today → test date) from the student's current skill state — while
// preserving the tutor's manual edits so "regeneration never clobbers
// human judgment" (§2.4/§2.5). Routing (self-serve auto-apply vs. tutor
// approval queue) is a caller concern; this only decides IF re-pacing is
// warranted and, if so, produces the new task set.

/** Drift past this many scaled points (in either direction) warrants a
 *  re-pace. ~half an SAT section's worth of trajectory error. */
export const DEFAULT_DRIFT_THRESHOLD = 40;

/** An existing plan_tasks row, as the re-pacer needs to see it. */
export interface ExistingTask {
  weekIndex: number;
  scheduledDate: string | null;
  taskType: PlanTaskType;
  payload: Record<string, unknown>;
  source: PlanTaskSource;
  status: 'pending' | 'completed' | 'skipped';
}

export interface RepaceInput {
  today: string;                 // ISO yyyy-mm-dd (as-of)
  planStart: string;             // ISO — the plan's week-0 anchor
  testDate: string;              // ISO
  startingScore: number | null;  // baseline captured when the plan was made
  goalScore: number;
  currentScore: number | null;   // current predicted total (get_predicted_score_band)
  weeklyHours: number;
  testType: 'sat' | 'act';
  skills: SkillState[];          // current per-skill state (get_plan_inputs)
  existingTasks: ExistingTask[]; // the active plan's tasks (for tutor-edit preservation)
  driftThreshold?: number;       // default DEFAULT_DRIFT_THRESHOLD
  practiceTestCadenceWeeks?: number;
  /** Composition inputs recorded on the plan (§5.5). Omitted = the
   *  pre-phase default ('targeted', every day, full tests). */
  mode?: PlanMode;
  studyDays?: readonly number[] | null;
  targets?: readonly string[] | null;
  fullTests?: boolean;
  /** Unit syllabi + completed lessons (flag `unit_syllabus`); see PlanInput. */
  unitSteps?: UnitSyllabi | null;
  completedLessonIds?: readonly string[] | null;
}

export interface RepaceResult {
  shouldRepace: boolean;
  reason: string;
  /** expected − actual, in scaled points. Positive = behind schedule,
   *  negative = ahead. null when it can't be computed. */
  driftPoints: number | null;
  /** The regenerated task set (fresh 'generated' tasks over the remaining
   *  horizon + preserved 'tutor' tasks). null when no re-pace. */
  tasks: PlanTaskDraft[] | null;
  weeks: number | null;
  /** The regenerated draft's composition, for the writer to store. */
  phases?: PlanPhase[];
  rationale?: string;
  mode?: PlanMode;
}

function skillCodeOf(payload: Record<string, unknown>): string | null {
  const v = payload?.skill_code;
  return typeof v === 'string' ? v : null;
}

/** A tutor task worth carrying into the regenerated plan: hand-authored,
 *  still open, and not already past (a stale overdue tutor task is dropped
 *  rather than resurrected into week 0). Undated tutor tasks are kept. */
function isPreservableTutorTask(t: ExistingTask, today: string): boolean {
  if (t.source !== 'tutor') return false;
  if (t.status !== 'pending') return false;
  // A task mirrored from an assignment is owed until the assignment is
  // done or closed, overdue or not — dropping it would hide the
  // assignment from the plan while it stays open.
  if (typeof t.payload?.assignment_id === 'string') return true;
  if (t.scheduledDate && t.scheduledDate < today) return false;
  return true;
}

export function repacePlan(input: RepaceInput): RepaceResult {
  const threshold = input.driftThreshold ?? DEFAULT_DRIFT_THRESHOLD;

  const noRepace = (reason: string, driftPoints: number | null = null): RepaceResult => ({
    shouldRepace: false,
    reason,
    driftPoints,
    tasks: null,
    weeks: null,
  });

  // Guardrails: nothing to pace against.
  if (daysBetween(input.today, input.testDate) <= 0) {
    return noRepace('Test date has passed — no re-pacing.');
  }
  if (input.startingScore == null || input.currentScore == null) {
    return noRepace('Not enough score history to judge trajectory yet.');
  }

  // Implied trajectory: linear from starting → goal across the plan's full
  // horizon. Expected = where that line sits at today's elapsed fraction.
  const span = Math.max(1, daysBetween(input.planStart, input.testDate));
  const elapsed = clamp(daysBetween(input.planStart, input.today) / span, 0, 1);
  const expected = input.startingScore + elapsed * (input.goalScore - input.startingScore);
  const driftPoints = Math.round(expected - input.currentScore);

  if (Math.abs(driftPoints) < threshold) {
    return noRepace('On track — actual score is within tolerance of plan.', driftPoints);
  }

  // Re-pace warranted. Preserve the tutor's open, future edits and keep the
  // generator from re-scheduling any skill a tutor task already owns.
  const preserved = input.existingTasks.filter((t) => isPreservableTutorTask(t, input.today));
  const tutorOwnedSkills = new Set(
    preserved.map((t) => skillCodeOf(t.payload)).filter((c): c is string => Boolean(c)),
  );
  const skillsForGenerator = input.skills.filter((s) => !tutorOwnedSkills.has(s.skillCode));

  const regen = generatePlan({
    goalScore: input.goalScore,
    startingScore: input.currentScore, // regenerate from where the student IS now
    testDate: input.testDate,
    today: input.today,
    weeklyHours: input.weeklyHours,
    testType: input.testType,
    skills: skillsForGenerator,
    practiceTestCadenceWeeks: input.practiceTestCadenceWeeks,
    mode: input.mode,
    studyDays: input.studyDays,
    targets: input.targets,
    fullTests: input.fullTests,
    unitSteps: input.unitSteps,
    completedLessonIds: input.completedLessonIds,
    // Keep the plan in the phase it has reached: phases are laid over
    // the original horizon, this draft covers the remaining weeks.
    elapsedWeeks: Math.max(0, Math.floor(daysBetween(input.planStart, input.today) / 7)),
  });

  // Re-attach preserved tutor tasks, remapping their week index onto the
  // regenerated plan's numbering (week 0 = the week containing `today`).
  const preservedTasks: PlanTaskDraft[] = preserved.map((t) => {
    const dayOffset = t.scheduledDate ? daysBetween(input.today, t.scheduledDate) : 0;
    const weekIndex = clamp(Math.floor(Math.max(0, dayOffset) / 7), 0, Math.max(0, regen.weeks - 1));
    return {
      weekIndex,
      scheduledDate: t.scheduledDate ?? addDays(input.today, weekIndex * 7),
      taskType: t.taskType,
      payload: t.payload,
      source: 'tutor',
    };
  });

  const direction = driftPoints > 0 ? 'behind' : 'ahead of';
  return {
    shouldRepace: true,
    reason:
      `${Math.abs(driftPoints)} points ${direction} the plan's trajectory ` +
      `(expected ~${Math.round(expected)}, actual ${input.currentScore}). ` +
      `Regenerated the remaining ${regen.weeks} weeks` +
      (preservedTasks.length ? `, keeping ${preservedTasks.length} tutor task(s).` : '.'),
    driftPoints,
    tasks: [...regen.tasks, ...preservedTasks],
    weeks: regen.weeks,
    phases: regen.phases,
    rationale: regen.rationale,
    mode: regen.mode,
  };
}

// ── Single-week regeneration (§2.4 editor) ────────────────────────
//
// "Regenerate a week": re-runs the full generator on the student's
// CURRENT skill state over the plan's original grid (week 0 = the
// plan's start), then returns only the target week's fresh tasks. The
// caller replaces that week's still-pending GENERATED tasks with these;
// tutor-authored tasks and completed/skipped history stay untouched, so
// regeneration never clobbers human judgment (§2.4) or the record.
// Skills a kept task in that week already covers are excluded from the
// generator so the fresh tasks never duplicate them.

export interface RegenerateWeekInput {
  weekIndex: number;
  planStart: string;             // ISO — the plan's week-0 anchor
  testDate: string;              // ISO
  goalScore: number;
  startingScore: number | null;
  weeklyHours: number;
  testType: 'sat' | 'act';
  skills: SkillState[];          // current per-skill state (get_plan_inputs)
  /** The plan's current tasks (all weeks). */
  existingTasks: ExistingTask[];
  practiceTestCadenceWeeks?: number;
  mode?: PlanMode;
  studyDays?: readonly number[] | null;
  targets?: readonly string[] | null;
  fullTests?: boolean;
  /** Unit syllabi + completed lessons (flag `unit_syllabus`); see PlanInput. */
  unitSteps?: UnitSyllabi | null;
  completedLessonIds?: readonly string[] | null;
}

/** A task in the target week that survives regeneration: hand-authored,
 *  or already resolved (completed/skipped history is never rewritten). */
export function survivesWeekRegeneration(t: ExistingTask): boolean {
  return t.source !== 'generated' || t.status !== 'pending';
}

export function regenerateWeekTasks(input: RegenerateWeekInput): PlanTaskDraft[] {
  const weekTasks = input.existingTasks.filter((t) => t.weekIndex === input.weekIndex);
  const keptSkills = new Set(
    weekTasks
      .filter(survivesWeekRegeneration)
      .map((t) => skillCodeOf(t.payload))
      .filter((c): c is string => Boolean(c)),
  );

  const regen = generatePlan({
    goalScore: input.goalScore,
    startingScore: input.startingScore,
    testDate: input.testDate,
    today: input.planStart, // original grid, so week N stays week N
    weeklyHours: input.weeklyHours,
    testType: input.testType,
    skills: input.skills.filter((s) => !keptSkills.has(s.skillCode)),
    practiceTestCadenceWeeks: input.practiceTestCadenceWeeks,
    mode: input.mode,
    studyDays: input.studyDays,
    targets: input.targets,
    fullTests: input.fullTests,
    unitSteps: input.unitSteps,
    completedLessonIds: input.completedLessonIds,
  });

  return regen.tasks.filter((t) => t.weekIndex === input.weekIndex);
}
