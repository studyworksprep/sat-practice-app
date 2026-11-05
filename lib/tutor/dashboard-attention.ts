// Tutor dashboard — who needs attention this week, and the four count
// tiles. Pure (unit-tested in dashboard.test.mjs); the loader in
// lib/practice/load-tutor-dashboard.ts gathers the per-student signals.
//
// A student lands on "Needs your attention" for a problem, never for
// context alone:
//   - their active SAT plan is behind (the roster's Plan rule),
//   - they have assignments from this tutor that are past due and
//     unfinished (the sidebar's "late" rule), or
//   - they haven't practiced in a week or more.
// "No study plan" and "test in N days" ride along as context: tutored
// students skip the intake by design, so a missing plan alone is not
// a problem worth a row.

export const IDLE_DAYS = 7;
export const TEST_SOON_DAYS = 30;
/** The practice-sessions read looks back this far; older is "60+ days". */
export const ACTIVITY_LOOKBACK_DAYS = 60;

const DAY_MS = 86_400_000;

export interface StudentSignals {
  id: string;
  name: string;
  /** Latest practice-session activity inside the lookback window. */
  lastActiveAt: string | null;
  /** Any active study plan (SAT or ACT). */
  hasPlan: boolean;
  /** Active SAT plan behind schedule (computeAdherence 'behind'). */
  planBehind: boolean;
  /** Overdue plan tasks on that plan; 0 when not behind. */
  overdueTasks: number;
  /** This tutor's assignments past due that the student hasn't finished. */
  overdueAssignments: number;
  /** This tutor's open assignments the student hasn't finished, overdue included. */
  openAssignments: number;
  /** Plan test date, else the profile's SAT date (yyyy-mm-dd). */
  testDate: string | null;
  /** Latest completed SAT practice-test total, if any. */
  latestScore: number | null;
  goalScore: number | null;
}

export type ReasonTone = 'alert' | 'warn' | 'info';

export interface AttentionRow {
  student: StudentSignals;
  reasons: Array<{ label: string; tone: ReasonTone }>;
  /** Higher sorts first. */
  weight: number;
}

export function daysSince(iso: string | null, nowMs: number): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((nowMs - t) / DAY_MS));
}

/** Whole days from today (UTC date of nowMs) to a yyyy-mm-dd date. */
export function daysUntil(date: string | null, nowMs: number): number | null {
  if (!date) return null;
  const target = Date.parse(`${date.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(target)) return null;
  const now = new Date(nowMs);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((target - today) / DAY_MS);
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function buildAttention(students: readonly StudentSignals[], nowMs: number): AttentionRow[] {
  const rows: AttentionRow[] = [];
  for (const st of students) {
    const reasons: AttentionRow['reasons'] = [];
    let weight = 0;

    if (st.planBehind) {
      reasons.push({
        label: st.overdueTasks > 0 ? `${plural(st.overdueTasks, 'plan task')} overdue` : 'Plan behind',
        tone: 'alert',
      });
      weight += 30 + Math.min(st.overdueTasks, 20);
    }
    if (st.overdueAssignments > 0) {
      reasons.push({ label: `${plural(st.overdueAssignments, 'assignment')} overdue`, tone: 'alert' });
      weight += 30 + Math.min(st.overdueAssignments, 20);
    }
    const idle = daysSince(st.lastActiveAt, nowMs);
    if (idle == null) {
      reasons.push({ label: `No practice in ${ACTIVITY_LOOKBACK_DAYS}+ days`, tone: 'warn' });
      weight += 20 + ACTIVITY_LOOKBACK_DAYS / 3;
    } else if (idle >= IDLE_DAYS) {
      reasons.push({ label: `No practice in ${idle} days`, tone: 'warn' });
      weight += 20 + Math.min(idle, ACTIVITY_LOOKBACK_DAYS) / 3;
    }
    if (weight === 0) continue;

    // Context, never a trigger on its own.
    const untilTest = daysUntil(st.testDate, nowMs);
    if (untilTest != null && untilTest >= 0 && untilTest <= TEST_SOON_DAYS) {
      reasons.push({ label: untilTest === 0 ? 'Test today' : `Test in ${plural(untilTest, 'day')}`, tone: 'info' });
      weight += 10; // a near test makes the same gap more urgent
    }
    if (!st.hasPlan) reasons.push({ label: 'No study plan', tone: 'info' });

    rows.push({ student: st, reasons, weight });
  }
  return rows.sort((a, b) => b.weight - a.weight || a.student.name.localeCompare(b.student.name));
}

export interface DashboardTiles {
  total: number;
  practicedThisWeek: number;
  behind: number;
  lateAssignments: number;
  testsSoon: number;
}

export function buildDashboardTiles(
  students: readonly StudentSignals[],
  lateAssignments: number,
  nowMs: number,
): DashboardTiles {
  let practicedThisWeek = 0;
  let behind = 0;
  let testsSoon = 0;
  for (const st of students) {
    const idle = daysSince(st.lastActiveAt, nowMs);
    if (idle != null && idle < IDLE_DAYS) practicedThisWeek += 1;
    if (st.planBehind) behind += 1;
    const until = daysUntil(st.testDate, nowMs);
    if (until != null && until >= 0 && until <= TEST_SOON_DAYS) testsSoon += 1;
  }
  return { total: students.length, practicedThisWeek, behind, lateAssignments, testsSoon };
}

/** "3 students on your roster. 2 need you this week." `needing: null`
 *  (signals unavailable) gives the roster sentence alone. */
export function dashboardSummary(total: number, needing: number | null): string {
  if (total === 0) return 'No students assigned yet.';
  const roster = `${plural(total, 'student')} on your roster.`;
  if (needing == null) return roster;
  if (needing === 0) return `${roster} Everyone is on track this week.`;
  return `${roster} ${needing === total && total > 1 ? 'All of them need' : needing === 1 ? 'One needs' : `${needing} need`} you this week.`;
}
