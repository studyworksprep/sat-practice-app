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

export type PlanTaskType =
  | 'lesson'
  | 'drill'
  | 'review'
  | 'practice_set'
  | 'full_test'
  | 'vocab'
  | 'flashcards';

export type PlanSection = 'math' | 'reading_writing';

/** Who authored a task. The generator only emits 'generated'; re-pacing
 *  (§2.5) preserves 'tutor' tasks and a student can add 'student' ones. */
export type PlanTaskSource = 'generated' | 'tutor' | 'student';

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
}

export interface PlanTaskDraft {
  weekIndex: number;
  scheduledDate: string;           // ISO yyyy-mm-dd
  taskType: PlanTaskType;
  payload: Record<string, unknown>;
  source: PlanTaskSource;
}

export interface PlanDraft {
  weeks: number;
  tasks: PlanTaskDraft[];
  rationale: string;
}

// ── Tunable knobs (a tutor could adjust; kept explicit for transparency) ──
const AVG_TASK_MINUTES = 40;       // rough minutes per non-test task, for sizing the week
const DEFAULT_CADENCE_WEEKS = 3;   // a full practice test every N weeks
const DRILL_QUESTION_COUNT = 8;    // questions per skill drill
const FULL_TEST_MINUTES = 180;
const REVIEW_MINUTES = 20;
const MAX_WEEKS = 52;
const MIN_TASKS_PER_WEEK = 3;
const MAX_TASKS_PER_WEEK = 21;     // 3/day ceiling

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function daysBetween(aIso: string, bIso: string): number {
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
  if (s.coverageStatus === 'decayed') gap = Math.max(gap, 0.5);
  const learn = (s.learnability ?? 5) / 10; // 0.1 .. 1.0
  const leverage = 0.5 + 0.5 * (maxQInSection > 0 ? s.questionsAvailable / maxQInSection : 0);
  return gap * learn * leverage;
}

function whyForDrill(s: SkillState): string {
  if (s.coverageStatus === 'not_started') return 'Not started yet — build a base';
  if (s.coverageStatus === 'decayed') return 'Slipping — refresh before it fades';
  const headroom = s.mastery == null ? null : Math.max(0, s.masteryThreshold - s.mastery);
  return headroom ? `~${headroom} points of headroom to mastery` : 'Weak skill worth reinforcing';
}

export function generatePlan(input: PlanInput): PlanDraft {
  const cadence = input.practiceTestCadenceWeeks ?? DEFAULT_CADENCE_WEEKS;
  const totalDays = Math.max(1, daysBetween(input.today, input.testDate));
  const weeks = clamp(Math.ceil(totalDays / 7), 1, MAX_WEEKS);

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
  const ranked = [...practicable].sort((a, b) => {
    const diff = priority(b, maxQBySection[b.section]) - priority(a, maxQBySection[a.section]);
    if (diff !== 0) return diff;
    return a.sequence - b.sequence; // deterministic tiebreak
  });

  const tasksPerWeek = clamp(
    Math.round((input.weeklyHours * 60) / AVG_TASK_MINUTES),
    MIN_TASKS_PER_WEEK,
    MAX_TASKS_PER_WEEK,
  );

  const lessonsScheduled = new Set<string>();
  const tasks: PlanTaskDraft[] = [];
  let cursor = 0;

  for (let w = 0; w < weeks; w++) {
    const weekStart = addDays(input.today, w * 7);
    const inFinalMonth = weeks - w <= 4;
    // A full test every `cadence` weeks, always in the final week
    // (test-day rehearsal), and biweekly through the final month.
    const testThisWeek =
      (w > 0 && w % cadence === 0) ||
      w === weeks - 1 ||
      (inFinalMonth && w > 0 && w % 2 === 0);

    const weekTasks: Array<Omit<PlanTaskDraft, 'scheduledDate'>> = [];

    if (testThisWeek) {
      weekTasks.push({
        weekIndex: w,
        taskType: 'full_test',
        source: 'generated',
        payload: {
          title: 'Full-length practice test',
          minutes: FULL_TEST_MINUTES,
          why: inFinalMonth
            ? 'Test-day rehearsal — pacing under real timing'
            : 'Checkpoint to measure progress',
        },
      });
    }
    if (w > 0) {
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

    const slots = Math.max(1, tasksPerWeek - weekTasks.length);
    for (let i = 0; i < slots && ranked.length > 0; i++) {
      const s = ranked[cursor % ranked.length];
      cursor++;
      const label = `${s.domainCode}/${s.skillCode}`;
      if (s.hasLesson && isWeak(s) && !lessonsScheduled.has(s.skillCode)) {
        lessonsScheduled.add(s.skillCode);
        weekTasks.push({
          weekIndex: w,
          taskType: 'lesson',
          source: 'generated',
          payload: {
            domain_code: s.domainCode,
            skill_code: s.skillCode,
            title: `Lesson: ${label}`,
            minutes: s.expectedMinutes,
            why: 'Learn it first — weak but improvable',
          },
        });
      } else {
        weekTasks.push({
          weekIndex: w,
          taskType: 'drill',
          source: 'generated',
          payload: {
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
            minutes: Math.min(s.expectedMinutes, AVG_TASK_MINUTES),
            why: whyForDrill(s),
          },
        });
      }
    }

    // Spread the week's tasks across its 7 days. The horizon is rounded up
    // to whole weeks, so the final week can run a few days past the test
    // date — clamp to it so nothing is ever scheduled after test day.
    const n = weekTasks.length;
    weekTasks.forEach((t, idx) => {
      const dayOffset = n <= 1 ? 0 : Math.round((idx * 6) / (n - 1));
      const sched = addDays(weekStart, dayOffset);
      tasks.push({ ...t, scheduledDate: sched > input.testDate ? input.testDate : sched });
    });
  }

  const top = ranked.slice(0, 3).map((s) => `${s.domainCode}/${s.skillCode}`).join(', ');
  const gapText =
    input.startingScore != null
      ? `from ${input.startingScore} toward ${input.goalScore}`
      : `toward ${input.goalScore}`;
  const rationale =
    `${weeks}-week plan ${gapText}. Focus: ${top || 'balanced review'}. ` +
    `Full practice tests every ${cadence} weeks, tightening near test day.`;

  return { weeks, tasks, rationale };
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
  };
}
