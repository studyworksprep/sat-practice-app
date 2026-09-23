// Technique matching for drill selection (docs/foundations-and-
// question-patterns.md §8).
//
// A question "matches" a technique when it is tagged to it explicitly
// (question_techniques) OR its skill is one of the technique's default
// skills (technique_skills — every question in that skill counts). A
// drill narrowed to techniques takes matching questions first and tops
// up from the rest of its skills when short, so a thin catalog never
// starves a drill.
//
// Pure: the launcher and the end-of-lesson drill pass the rows they
// loaded; this module only orders them.

export interface TechniqueCandidate {
  id: string;
  skill_code: string | null;
}

export interface TechniqueMatchInput {
  techniqueIds: readonly string[];
  /** question_techniques rows for the techniques in play. */
  tagged: ReadonlyArray<{ question_id: string; technique_id: string }>;
  /** technique_skills rows for the techniques in play. */
  defaults: ReadonlyArray<{ technique_id: string; skill_code: string }>;
}

export interface TechniqueMatchResult<T> {
  /** Candidates matching at least one technique, original order kept. */
  matching: T[];
  /** Everything else, original order kept. */
  rest: T[];
}

export function partitionByTechnique<T extends TechniqueCandidate>(
  candidates: readonly T[],
  input: TechniqueMatchInput,
): TechniqueMatchResult<T> {
  const wanted = new Set(input.techniqueIds);
  if (wanted.size === 0) return { matching: [], rest: [...candidates] };

  const taggedQuestions = new Set<string>();
  for (const row of input.tagged) {
    if (wanted.has(row.technique_id)) taggedQuestions.add(row.question_id);
  }
  const defaultSkills = new Set<string>();
  for (const row of input.defaults) {
    if (wanted.has(row.technique_id)) defaultSkills.add(row.skill_code);
  }

  const matching: T[] = [];
  const rest: T[] = [];
  for (const c of candidates) {
    const hit = taggedQuestions.has(c.id) || (c.skill_code != null && defaultSkills.has(c.skill_code));
    (hit ? matching : rest).push(c);
  }
  return { matching, rest };
}
