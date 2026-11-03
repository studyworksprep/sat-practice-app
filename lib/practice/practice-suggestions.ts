// "Suggested for you" on the SAT practice builder — up to three ready-made
// filter sets, so a student can start without working the filter form.
//
// PURE: inputs are the launcher's question-bank taxonomy and the
// student's per-skill stats (the 90-day `get_student_dashboard_stats`
// rollup the dashboard already reads). A suggestion only PREFILLS the
// form; the student still sees the live match count and presses Start.
//
//   most-missed — the weakest skill with enough answers to trust the
//                 number (MIN_SAMPLE), below WEAK_ACCURACY.
//   not-tried   — the bank skill with the most questions the student has
//                 never answered, filtered to unattempted questions.
//   warm-up     — every skill in the weaker section (Math by default),
//                 easy → hard.

export type SuggestionOrder = 'display_code' | 'easy_first' | 'hard_first' | 'random';

export interface BankDomain {
  name: string;
  section: 'math' | 'rw' | string;
  skills: ReadonlyArray<{ name: string; count: number }>;
}

export interface SkillStat {
  name: string;
  correct: number;
  total: number;
}

export interface PracticeSuggestion {
  id: 'most-missed' | 'not-tried' | 'warm-up';
  kicker: string;
  title: string;
  detail: string;
  filters: {
    skills: string[];
    difficulties: number[];
    unansweredOnly: boolean;
    order: SuggestionOrder;
  };
}

/** Fewer answers than this and a skill's accuracy is noise. */
export const MIN_SAMPLE = 5;
/** Below this accuracy a skill counts as "missed". */
export const WEAK_ACCURACY = 0.7;

const SECTION_LABEL: Record<string, string> = { math: 'Math', rw: 'Reading & Writing' };

export function buildPracticeSuggestions(
  domains: readonly BankDomain[],
  stats: readonly SkillStat[],
): PracticeSuggestion[] {
  const statByName = new Map(stats.map((st) => [st.name, st]));
  const bankSkills = domains.flatMap((d) =>
    d.skills.filter((sk) => sk.count > 0).map((sk) => ({ ...sk, domain: d.name, section: d.section })),
  );
  if (bankSkills.length === 0) return [];

  const out: PracticeSuggestion[] = [];

  // most-missed
  const weak = bankSkills
    .map((sk) => ({ sk, st: statByName.get(sk.name) }))
    .filter((x): x is { sk: typeof x.sk; st: SkillStat } =>
      x.st != null && x.st.total >= MIN_SAMPLE && x.st.correct / x.st.total < WEAK_ACCURACY)
    .sort((a, b) => a.st.correct / a.st.total - b.st.correct / b.st.total || b.st.total - a.st.total);
  if (weak[0]) {
    const { sk, st } = weak[0];
    out.push({
      id: 'most-missed',
      kicker: 'Most missed',
      title: sk.name,
      detail: `${sk.domain} · ${st.correct} of ${st.total} right in the last 90 days`,
      filters: { skills: [sk.name], difficulties: [], unansweredOnly: false, order: 'easy_first' },
    });
  }

  // not-tried
  const untried = bankSkills
    .filter((sk) => (statByName.get(sk.name)?.total ?? 0) === 0)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  if (untried[0]) {
    const sk = untried[0];
    out.push({
      id: 'not-tried',
      kicker: 'Not tried yet',
      title: sk.name,
      detail: `${sk.domain} · ${sk.count.toLocaleString('en-US')} question${sk.count === 1 ? '' : 's'} to explore`,
      filters: { skills: [sk.name], difficulties: [], unansweredOnly: true, order: 'easy_first' },
    });
  }

  // warm-up — the weaker section by 90-day accuracy, Math when tied/unknown.
  const sectionAcc = (section: string) => {
    let c = 0;
    let t = 0;
    for (const sk of bankSkills) {
      if (sk.section !== section) continue;
      const st = statByName.get(sk.name);
      if (st) { c += st.correct; t += st.total; }
    }
    return t > 0 ? c / t : null;
  };
  const math = sectionAcc('math');
  const rw = sectionAcc('rw');
  const section = math != null && rw != null && rw < math ? 'rw' : 'math';
  const sectionSkills = bankSkills.filter((sk) => sk.section === section).map((sk) => sk.name);
  if (sectionSkills.length > 0) {
    out.push({
      id: 'warm-up',
      kicker: 'Warm-up',
      title: `Mixed ${SECTION_LABEL[section] ?? section}, easy → hard`,
      detail: 'Every topic in the section, building up in difficulty',
      filters: { skills: sectionSkills, difficulties: [], unansweredOnly: false, order: 'easy_first' },
    });
  }

  return out;
}
