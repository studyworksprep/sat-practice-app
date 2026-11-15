// Official SAT/PSAT test dates and scores: the rules shared by the
// student's "Test dates & scores" tab, the tutor's student page, the
// tutor impact numbers (lib/practice/superscore.js) and the LessonWorks
// sync. Pure functions only, so they run in tests and on either side of
// the server/client line.
//
// Two tables hold this data. sat_test_registrations has one row per
// sitting a student is registered for. sat_official_scores has one row
// per score report. Either a tutor or (since migration 20261115210000)
// the student can add rows.
//
// Self-reported = the student entered the row (created_by = student_id).
// Self-reported scores are shown everywhere, marked as self-reported for
// tutors, and left out of anything that judges a tutor's impact or
// leaves the app (LessonWorks). A tutor-entered row is unchanged from
// before.

export type OfficialTestType = 'SAT' | 'PSAT';

/** Section score range per test. Both report in steps of 10. */
export const SECTION_RANGE: Record<OfficialTestType, { min: number; max: number }> = {
  SAT: { min: 200, max: 800 },
  PSAT: { min: 160, max: 760 },
};

/** Anything other than 'PSAT' is an SAT (the column's default). */
export function parseTestType(raw: unknown): OfficialTestType {
  return raw === 'PSAT' ? 'PSAT' : 'SAT';
}

/** An error message, or null when both section scores are valid. */
export function validateSectionScores(
  testType: OfficialTestType,
  rw: number,
  math: number,
): string | null {
  if (!Number.isFinite(rw) || !Number.isFinite(math)) return 'Scores must be numbers.';
  const { min, max } = SECTION_RANGE[testType];
  for (const [label, n] of [['Reading and Writing', rw], ['Math', math]] as const) {
    if (n < min || n > max) return `${label} must be between ${min} and ${max} on the ${testType}.`;
    if (n % 10 !== 0) return `${label} scores come in steps of 10.`;
  }
  return null;
}

interface AuthoredRow {
  student_id?: string | null;
  created_by?: string | null;
}

/** True when the student entered the row themselves. A row missing
 *  either id reads as tutor-entered: every row written before students
 *  could add their own carries a tutor's id. */
export function isSelfReported(row: AuthoredRow): boolean {
  return Boolean(row.created_by) && row.created_by === row.student_id;
}

/** The scores that count toward tutor impact numbers and external
 *  syncs: everything except self-reported rows. Callers must select
 *  student_id and created_by. */
export function countedOfficialScores<T extends AuthoredRow>(rows: readonly T[]): T[] {
  return rows.filter((r) => !isSelfReported(r));
}

/** Bare yyyy-mm-dd that is a real calendar day. */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** First 10 characters of a date or timestamp column, or null.
 *  profiles.sat_test_date is still a timestamptz. */
export function calendarDay(value: string | null | undefined): string | null {
  if (!value) return null;
  const day = String(value).slice(0, 10);
  return isIsoDate(day) ? day : null;
}

/** Soonest date on or after today, or null. */
export function soonestUpcoming(
  dates: readonly (string | null | undefined)[],
  today: string,
): string | null {
  let best: string | null = null;
  for (const raw of dates) {
    const d = calendarDay(raw);
    if (d && d >= today && (best == null || d < best)) best = d;
  }
  return best;
}

/** The test date a student's countdown and plan aim at:
 *    1. the active plan's date (the plan is what they are living);
 *    2. the date they chose to study for (profiles.sat_test_date),
 *       while it is still ahead;
 *    3. the soonest upcoming registration, for a student who never
 *       chose (a tutor registered them);
 *    4. a passed chosen date, so surfaces that showed it before still do.
 */
export function resolveTestDate(args: {
  planDate?: string | null;
  profileDate?: string | null;
  nextRegistration?: string | null;
  today: string;
}): string | null {
  const plan = calendarDay(args.planDate);
  if (plan) return plan;
  const chosen = calendarDay(args.profileDate);
  if (chosen && chosen >= args.today) return chosen;
  return calendarDay(args.nextRegistration) ?? chosen;
}

/** "an SAT" / "a PSAT". */
export function withArticle(testType: OfficialTestType): string {
  return testType === 'SAT' ? 'an SAT' : 'a PSAT';
}

/** Postgres unique_violation, raised by the one-row-per-sitting keys. */
export function isDuplicateError(error: { code?: string | null } | null | undefined): boolean {
  return error?.code === '23505';
}

/** Add `days` to a yyyy-mm-dd day. */
export function addDays(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** How far ahead a test date may be. College Board posts about a year
 *  of dates; two years leaves room without accepting typos like 2207. */
export const MAX_DAYS_AHEAD = 730;

/** Earliest score date accepted from a student: the SAT moved to the
 *  current 400-1600 scale in March 2016. Mostly a guard against typos. */
export const EARLIEST_SCORE_DATE = '2016-03-01';
