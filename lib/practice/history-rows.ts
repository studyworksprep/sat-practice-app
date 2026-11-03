// Pure helpers behind /practice/history: one summary per
// practice_sessions row, a human label for what the session was, and
// day grouping in the report time zone.
//
// Labels come from the session's own filter_criteria, written by
// whichever surface created it:
//   - builder sets        → { skills: [...] } (SAT) / { sections, categories } (ACT)
//   - question search     → { explicit: true }
//   - assignments         → { assignment_id }
//   - review drills       → { kind: 'weak_queue' | 'srs_due' | 'skill', skill? }
//   - lesson practice     → { kind: 'lesson_practice' }
// The label's `group` is what the Topic filter matches on.

import { REPORT_TIME_ZONE, reportDay } from './report-dates.ts';

export interface HistorySession {
  id: string;
  created_at: string;
  question_ids: unknown;
  current_position: number | null;
  status: string | null;
  filter_criteria: unknown;
}

export interface HistoryAttempt {
  question_id: string;
  is_correct: boolean | null;
  created_at: string;
}

export interface SessionLabel {
  /** What the row says, e.g. "Linear functions" or "Algebra". */
  title: string;
  /** Filter bucket: a domain / ACT section name, or a kind like "Assignments". */
  group: string;
}

export interface HistoryRow {
  id: string;
  createdAt: string;
  total: number;
  attempted: number;
  correct: number;
  completed: boolean;
  accuracyPct: number | null;
  resumePosition: number;
  label: SessionLabel;
}

type Criteria = Record<string, unknown>;

function criteria(raw: unknown): Criteria {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Criteria) : {};
}

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0) : [];
}

export const GROUP_ASSIGNMENTS = 'Assignments';
export const GROUP_REVIEW = 'Review drills';
export const GROUP_PICKED = 'Hand-picked';
export const GROUP_LESSONS = 'Lesson practice';
export const GROUP_MIXED = 'Mixed';

export interface LabelContext {
  /** SAT skill name → its domain, from published_question_taxonomy. */
  domainOfSkill: ReadonlyMap<string, string>;
  /** assignment id → title. */
  assignmentTitles: ReadonlyMap<string, string>;
  /** ACT section code → display label. */
  actSectionLabel?: (code: string) => string;
}

export function labelSession(rawCriteria: unknown, ctx: LabelContext): SessionLabel {
  const fc = criteria(rawCriteria);

  if (typeof fc.assignment_id === 'string') {
    const title = ctx.assignmentTitles.get(fc.assignment_id);
    return { title: title ? `Assignment: ${title}` : 'Assignment', group: GROUP_ASSIGNMENTS };
  }
  switch (fc.kind) {
    case 'weak_queue':
      return { title: 'Weak questions drill', group: GROUP_REVIEW };
    case 'srs_due':
      return { title: 'Review queue', group: GROUP_REVIEW };
    case 'skill':
      return {
        title: typeof fc.skill === 'string' && fc.skill ? `Review: ${fc.skill}` : 'Skill review',
        group: GROUP_REVIEW,
      };
    case 'lesson_practice':
      return { title: 'Lesson practice', group: GROUP_LESSONS };
  }
  if (fc.explicit === true) return { title: 'Hand-picked questions', group: GROUP_PICKED };

  // SAT builder set: name the skill, else the one domain, else "mixed".
  const skills = strings(fc.skills);
  if (skills.length > 0) {
    const domains = [...new Set(skills.map((sk) => ctx.domainOfSkill.get(sk)).filter((d): d is string => !!d))];
    if (skills.length === 1) return { title: skills[0], group: domains[0] ?? GROUP_MIXED };
    if (domains.length === 1) return { title: domains[0], group: domains[0] };
    if (domains.length > 1) {
      return { title: `${domains[0]} + ${domains.length - 1} more`, group: GROUP_MIXED };
    }
    return { title: `${skills.length} skills`, group: GROUP_MIXED };
  }

  // ACT builder set: categories within one section, else the sections.
  const sections = strings(fc.sections);
  const categories = strings(fc.categories);
  const sectionName = (code: string) => ctx.actSectionLabel?.(code) ?? code;
  if (categories.length === 1) {
    return { title: categories[0], group: sections.length === 1 ? sectionName(sections[0]) : GROUP_MIXED };
  }
  if (sections.length === 1) return { title: sectionName(sections[0]), group: sectionName(sections[0]) };
  if (sections.length > 1) {
    return { title: sections.map(sectionName).join(' + '), group: GROUP_MIXED };
  }

  return { title: 'Mixed practice', group: GROUP_MIXED };
}

export function buildHistoryRow(
  session: HistorySession,
  attempts: readonly HistoryAttempt[],
  label: SessionLabel,
): HistoryRow {
  const questionIds = strings(session.question_ids);
  const total = questionIds.length;
  const qidSet = new Set(questionIds);

  // Attempts that belong to one of this session's questions AND were
  // created on or after the session. Earliest wins per question
  // ("initial answer"); callers pass attempts oldest first.
  const firstByQid = new Map<string, HistoryAttempt>();
  for (const a of attempts) {
    if (!qidSet.has(a.question_id)) continue;
    if (a.created_at < session.created_at) continue;
    if (!firstByQid.has(a.question_id)) firstByQid.set(a.question_id, a);
  }
  const attempted = firstByQid.size;
  let correct = 0;
  for (const a of firstByQid.values()) if (a.is_correct) correct += 1;

  return {
    id: session.id,
    createdAt: session.created_at,
    total,
    attempted,
    correct,
    // Completion is the status column, flipped by Submit Set (or the
    // runner walking off the end) — submitted sets may have skips.
    completed: session.status === 'completed',
    accuracyPct: attempted > 0 ? Math.round((correct / attempted) * 100) : null,
    // Clamped so a wonky cursor can't 404 the runner.
    resumePosition: Math.min(
      Math.max(session.current_position ?? 0, 0),
      Math.max(total - 1, 0),
    ),
    label,
  };
}

export interface DayGroup {
  /** YYYY-MM-DD in the report time zone. */
  day: string;
  /** "Today", "Yesterday", or e.g. "Mon, Oct 27". */
  heading: string;
  rows: HistoryRow[];
  attempted: number;
  correct: number;
}

/** Rows (newest first) → day groups, newest day first. */
export function groupRowsByDay(rows: readonly HistoryRow[], now: Date): DayGroup[] {
  const today = reportDay(now.toISOString());
  const yesterday = reportDay(new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString());
  const groups: DayGroup[] = [];
  for (const r of rows) {
    const day = reportDay(r.createdAt);
    let g = groups[groups.length - 1];
    if (!g || g.day !== day) {
      g = { day, heading: dayHeading(day, r.createdAt, today, yesterday), rows: [], attempted: 0, correct: 0 };
      groups.push(g);
    }
    g.rows.push(r);
    g.attempted += r.attempted;
    g.correct += r.correct;
  }
  return groups;
}

function dayHeading(day: string, iso: string, today: string, yesterday: string): string {
  if (day === today) return 'Today';
  if (day === yesterday) return 'Yesterday';
  const sameYear = day.slice(0, 4) === today.slice(0, 4);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: REPORT_TIME_ZONE,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(new Date(iso));
}

export function formatRowTime(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: REPORT_TIME_ZONE, hour: 'numeric', minute: '2-digit',
  }).format(new Date(iso));
}
