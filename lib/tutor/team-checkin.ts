// Manager team view — which teachers are worth a check-in, and the
// one-line note that says why. Pure (unit-tested in
// team-checkin.test.mjs); app/(tutor)/tutor/teachers/page.js gathers
// the per-teacher numbers.
//
// These are signals for a conversation, not a ranking: rosters are
// small and start from different places, so the rule is deliberately
// coarse. A teacher is flagged when
//   - fewer than half of their roster practiced in the last 7 days, or
//   - more than CHECKIN_OVERDUE of their assignments are past due and
//     unfinished.

export const CHECKIN_OVERDUE = 5;
export const IDLE_STUDENT_DAYS = 7;

export interface TeamRow {
  id: string;
  name: string;
  students: number;
  /** Rostered students with any attempt in the last 7 days. */
  practicedThisWeek: number;
  /** Students whose active SAT plan is behind (effectiveness adherence). */
  plansBehind: number;
  /** This teacher's open assignments past due with someone unfinished. */
  overdue: number;
  /** The roster's longest-idle student, when idle a week or more. */
  idleStudent: { name: string; days: number } | null;
}

export function needsCheckIn(row: TeamRow): boolean {
  if (row.students > 0 && row.practicedThisWeek * 2 < row.students) return true;
  return row.overdue > CHECKIN_OVERDUE;
}

/** Sort key for "Needs a check-in first": flagged teachers, then the
 *  most overdue work, idle students and behind plans. */
export function checkInWeight(row: TeamRow): number {
  const idle = Math.max(0, row.students - row.practicedThisWeek);
  return (needsCheckIn(row) ? 1000 : 0) + row.overdue * 3 + idle * 5 + row.plansBehind * 2;
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "2 of 3 students are behind their plan and 7 assignments are past
 *  due. Stu Three hasn't practiced in 12 days." */
export function checkInNote(row: TeamRow): string {
  const parts: string[] = [];
  if (row.students > 0 && row.practicedThisWeek * 2 < row.students) {
    parts.push(row.practicedThisWeek === 0
      ? `none of ${plural(row.students, 'student')} practiced this week`
      : `only ${row.practicedThisWeek} of ${plural(row.students, 'student')} practiced this week`);
  }
  if (row.plansBehind > 0) {
    parts.push(`${row.plansBehind} of ${row.students} ${row.plansBehind === 1 ? 'is' : 'are'} behind their plan`);
  }
  if (row.overdue > 0) {
    parts.push(`${plural(row.overdue, 'assignment')} ${row.overdue === 1 ? 'is' : 'are'} past due`);
  }
  let note = parts.length > 0 ? `${capitalize(joinAnd(parts))}.` : '';
  if (row.idleStudent && row.idleStudent.days >= IDLE_STUDENT_DAYS) {
    note += `${note ? ' ' : ''}${row.idleStudent.name} hasn't practiced in ${row.idleStudent.days} days.`;
  }
  return note;
}

function joinAnd(parts: string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}
