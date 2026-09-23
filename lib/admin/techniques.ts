// Technique authoring contract (docs/foundations-and-question-patterns.md
// §8): field validation for the Techniques catalog form and the inline
// "new technique" form in the curriculum editor, shared with their
// Server Actions so a technique the server would reject never looks
// valid in a form.
//
// A technique is HOW a question is solved (graphing to x-intercepts,
// regression, plugging in answers, Good Cop Bad Cop). It cuts across
// skills: default applicability is a list of skill codes where every
// question counts, and questions can be tagged individually on top.
//
// Pure module — no Supabase, no React.

import { SAT_TAXONOMY } from '../practice/sat-taxonomy.ts';

export const TECHNIQUE_NAME_MAX = 120;
export const TECHNIQUE_DESCRIPTION_MAX = 600;
export const TECHNIQUE_PROCESS_MAX = 2000;

export type TechniqueSection = 'math' | 'reading_writing';

/** Raw form input. Strings throughout so the same validator serves the
 *  catalog form and the inline create. */
export interface TechniqueInput {
  name: string;
  /** "When to use it" — the sentence a student matches before solving. */
  description: string;
  processSummary?: string | null;
  /** 'math' | 'reading_writing' | '' (applies in both sections). */
  section?: string | null;
  /** Default applicability: skill codes where every question counts. */
  skillCodes?: readonly string[] | null;
  /** Blank = append after the existing techniques in the section. */
  sequence?: string | number | null;
}

export interface NormalizedTechnique {
  name: string;
  description: string;
  processSummary: string | null;
  section: TechniqueSection | null;
  skillCodes: string[];
  sequence: number | null;
}

const SKILL_CODES_BY_SECTION: Record<TechniqueSection, string[]> = {
  math: SAT_TAXONOMY.filter((d) => d.subjectCode === 'math').flatMap((d) => d.skills.map((s) => s.code)),
  reading_writing: SAT_TAXONOMY.filter((d) => d.subjectCode !== 'math').flatMap((d) => d.skills.map((s) => s.code)),
};

const SECTION_OF_SKILL = new Map<string, TechniqueSection>([
  ...SKILL_CODES_BY_SECTION.math.map((c) => [c, 'math'] as const),
  ...SKILL_CODES_BY_SECTION.reading_writing.map((c) => [c, 'reading_writing'] as const),
]);

const SKILL_NAME = new Map(SAT_TAXONOMY.flatMap((d) => d.skills.map((s) => [s.code, s.name] as const)));

/** Every skill code in a section — the "all Math" / "all R&W" shortcuts. */
export function skillCodesForSection(section: TechniqueSection): string[] {
  return [...SKILL_CODES_BY_SECTION[section]];
}

export function sectionOfSkill(skillCode: string): TechniqueSection | null {
  return SECTION_OF_SKILL.get(skillCode) ?? null;
}

/** The one section a skill list lives in, or null when it spans both
 *  (or is empty). */
export function sectionOfSkills(skillCodes: readonly string[]): TechniqueSection | null {
  let found: TechniqueSection | null = null;
  for (const code of skillCodes) {
    const section = sectionOfSkill(code);
    if (!section) continue;
    if (found && found !== section) return null;
    found = section;
  }
  return found;
}

export function skillNameOf(skillCode: string): string {
  return SKILL_NAME.get(skillCode) ?? skillCode;
}

export function sectionLabel(section: TechniqueSection | null | undefined): string {
  if (section === 'math') return 'Math';
  if (section === 'reading_writing') return 'Reading & Writing';
  return 'Math and Reading & Writing';
}

/** Plain-words summary of where a technique applies by default, for
 *  catalog rows and pickers ("Every Math question", "6 skills: …"). */
export function describeDefaultSkills(skillCodes: readonly string[]): string {
  if (skillCodes.length === 0) return 'Only questions tagged to it';
  for (const section of ['math', 'reading_writing'] as const) {
    const all = SKILL_CODES_BY_SECTION[section];
    if (skillCodes.length === all.length && all.every((c) => skillCodes.includes(c))) {
      return section === 'math' ? 'Every Math question' : 'Every Reading & Writing question';
    }
  }
  const names = skillCodes.map(skillNameOf);
  if (names.length <= 3) return `Every question in ${names.join(', ')}`;
  return `Every question in ${names.length} skills: ${names.slice(0, 3).join(', ')}, …`;
}

export function normalizeTechniqueInput(
  input: TechniqueInput,
): { ok: true; value: NormalizedTechnique } | { ok: false; error: string } {
  const name = (input.name ?? '').trim();
  const description = (input.description ?? '').trim();
  const processSummary = (input.processSummary ?? '').trim();
  const sectionRaw = (input.section ?? '').trim();

  if (!name) return { ok: false, error: 'Give the technique a name.' };
  if (name.length > TECHNIQUE_NAME_MAX) {
    return { ok: false, error: `The name is over ${TECHNIQUE_NAME_MAX} characters.` };
  }
  if (!description) return { ok: false, error: 'Say when to use it — the sentence a student matches before solving.' };
  if (description.length > TECHNIQUE_DESCRIPTION_MAX) {
    return { ok: false, error: `"When to use it" is over ${TECHNIQUE_DESCRIPTION_MAX} characters.` };
  }
  if (processSummary.length > TECHNIQUE_PROCESS_MAX) {
    return { ok: false, error: `The process is over ${TECHNIQUE_PROCESS_MAX} characters.` };
  }

  let section: TechniqueSection | null = null;
  if (sectionRaw === 'math' || sectionRaw === 'reading_writing') section = sectionRaw;
  else if (sectionRaw) return { ok: false, error: 'Section must be Math, Reading & Writing, or both.' };

  const skillCodes: string[] = [];
  for (const raw of input.skillCodes ?? []) {
    const code = String(raw ?? '').trim().toUpperCase();
    if (!code || skillCodes.includes(code)) continue;
    if (!SECTION_OF_SKILL.has(code)) return { ok: false, error: `Unknown skill "${code}".` };
    skillCodes.push(code);
  }
  // A section pin narrows the catalog view; default skills outside it
  // would silently never show. Catch it at the form.
  if (section) {
    const outside = skillCodes.filter((c) => sectionOfSkill(c) !== section);
    if (outside.length > 0) {
      return {
        ok: false,
        error: `${skillNameOf(outside[0])} is not a ${sectionLabel(section)} skill — pick "both sections" or drop it.`,
      };
    }
  }

  let sequence: number | null = null;
  const seqRaw = input.sequence == null ? '' : String(input.sequence).trim();
  if (seqRaw) {
    const parsed = Number(seqRaw);
    if (!Number.isInteger(parsed) || parsed < 1) {
      return { ok: false, error: 'Order must be a whole number of 1 or more.' };
    }
    sequence = parsed;
  }

  return {
    ok: true,
    value: { name, description, processSummary: processSummary || null, section, skillCodes, sequence },
  };
}
