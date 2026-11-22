type MixedQuestion = {
  id: string;
  skill_code: string | null;
  difficulty: number | null;
};

// Offset the progression for each skill so even a short set can span levels.
const progression = [1, 2, 3, 2];

export function selectMixedQuestions(
  candidates: readonly MixedQuestion[],
  count: number,
  skills: readonly string[] | null,
  answered: ReadonlySet<string>,
  techniqueMatches: ReadonlySet<string>,
): string[] {
  const groups = new Map<string | null, MixedQuestion[]>(
    (skills ?? []).map(skill => [skill, []]),
  );
  for (const question of candidates) {
    const group = groups.get(question.skill_code);
    if (group) group.push(question);
    else groups.set(question.skill_code, [question]);
  }

  const available = [...groups.values()].filter(group => group.length);
  const selected: MixedQuestion[] = [];
  for (let round = 0; selected.length < count; round++) {
    const previousCount = selected.length;
    for (const [index, group] of available.entries()) {
      if (!group.length) continue;
      const target = progression[(round + index) % progression.length];
      // Inside each skill, prefer technique matches, then fresh questions,
      // then the nearest available level. The input order breaks ties.
      const distance = (q: MixedQuestion) =>
        q.difficulty == null ? Infinity : Math.abs(q.difficulty - target);
      const compare = (a: MixedQuestion, b: MixedQuestion) =>
        Number(techniqueMatches.has(b.id)) - Number(techniqueMatches.has(a.id))
        || Number(answered.has(a.id)) - Number(answered.has(b.id))
        || distance(a) - distance(b);
      let best = 0;
      for (let i = 1; i < group.length; i++) {
        if (compare(group[i], group[best]) < 0) best = i;
      }
      selected.push(group.splice(best, 1)[0]);
      if (selected.length === count) break;
    }
    if (selected.length === previousCount) break;
  }
  return selected.sort((a, b) => (a.difficulty ?? 4) - (b.difficulty ?? 4)).map(q => q.id);
}
