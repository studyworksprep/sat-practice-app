// Pure helpers behind the Performance page's tabs and its
// "Work on these next" list (lib/practice/StudentStatsView.tsx).
//
// The focus list is the weakest few skills (or ACT categories) with
// enough answers to trust the number; everything thinner is counted
// separately so the page can say "practice these before we rank them"
// instead of letting a 0/1 top the list.

export const STATS_TABS = [
  { id: 'overview',   label: 'Overview' },
  { id: 'skills',     label: 'All skills' },
  { id: 'trend',      label: 'Weekly trend' },
  { id: 'activity',   label: 'Daily activity' },
  { id: 'difficulty', label: 'By difficulty' },
] as const;

export type StatsTab = (typeof STATS_TABS)[number]['id'];

/** Unknown or missing → the overview. */
export function parseStatsTab(value: unknown): StatsTab {
  const v = Array.isArray(value) ? value[0] : value;
  return STATS_TABS.some((t) => t.id === v) ? (v as StatsTab) : 'overview';
}

/** Fewer answers than this and a skill's accuracy is noise. */
export const FOCUS_MIN_SAMPLE = 5;
export const FOCUS_LIMIT = 3;

export interface FocusInput {
  name: string;
  /** Domain (SAT) or section (ACT) the skill sits under. */
  group: string;
  correct: number;
  total: number;
}

export interface FocusItem extends FocusInput {
  pct: number;
}

export interface FocusPick {
  /** Weakest first, at most `limit`. */
  focus: FocusItem[];
  /** Practiced skills still under the sample floor, most-answered first. */
  thin: FocusInput[];
}

export function pickFocusSkills(
  skills: readonly FocusInput[],
  { limit = FOCUS_LIMIT, minSample = FOCUS_MIN_SAMPLE } = {},
): FocusPick {
  const ranked: FocusItem[] = [];
  const thin: FocusInput[] = [];
  for (const sk of skills) {
    if (sk.total <= 0) continue;
    if (sk.total < minSample) thin.push(sk);
    else ranked.push({ ...sk, pct: Math.round((sk.correct / sk.total) * 100) });
  }
  ranked.sort((a, b) => a.correct / a.total - b.correct / b.total || b.total - a.total);
  thin.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  return { focus: ranked.slice(0, limit), thin };
}
