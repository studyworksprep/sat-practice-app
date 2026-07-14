// Deterministic study-plan generator (upgrade plan §2.2).
//
// PURE function: given a student's per-skill state + goal + timeframe, it
// returns a week-by-week list of tasks. No I/O, and `today` is an input
// (never Date.now()), so it is fully reproducible and unit-testable — the
// same pattern as lib/mastery.ts. The DB layer that assembles the inputs
// (from get_student_coverage §1.3 + curriculum_units §1.2) and writes
// study_plans / plan_tasks is a separate thin wrapper, built with the
// intake flow (§2.4).
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
  source: 'generated';
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

    // Spread the week's tasks across its 7 days.
    const n = weekTasks.length;
    weekTasks.forEach((t, idx) => {
      const dayOffset = n <= 1 ? 0 : Math.round((idx * 6) / (n - 1));
      tasks.push({ ...t, scheduledDate: addDays(weekStart, dayOffset) });
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
