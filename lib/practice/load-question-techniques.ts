// Server-side loaders for the per-question technique tags
// (docs/foundations-and-question-patterns.md §8).
//
// Mirrors load-concept-tags.js: a Server Component preloads what the
// island needs and passes it as props, so the client never
// useEffect+fetches on mount.
//
// Two entry points because the hosts come in two shapes:
//   - loadTechniqueCatalog + loadQuestionTechniqueIds: review surfaces
//     that render many questions (assignment reports, session review,
//     test results). They load the catalog once and each row carries
//     its own technique ids, exactly how the concept-tag catalog +
//     per-row tag ids are plumbed.
//   - loadQuestionTechniques: single-question hosts (QuestionReviewPage).
//
// RLS: techniques, technique_skills and question_techniques are
// select-for-all (their create migration), so reading needs no role.
// The role gate here is about who may WRITE — there is no point
// shipping a picker to someone whose save set_question_techniques()
// will refuse.

import { createClient } from '@/lib/supabase/server';

/** Matches the is_manager() bar enforced inside set_question_techniques(). */
export const TECHNIQUE_TAG_ROLES: ReadonlySet<string> = new Set(['manager', 'admin']);

export interface TechniqueOption {
  id: string;
  name: string;
  /** "When to use it." */
  description: string;
  section: 'math' | 'reading_writing' | null;
  sequence: number;
  /** Default applicability: every question in these skills counts. */
  skillCodes: string[];
}

const TECHNIQUE_SELECT = 'id, name, description, section, sequence, technique_skills(skill_code)';
const CHUNK = 100;

export function canTagTechniques(role: string | null | undefined): boolean {
  return TECHNIQUE_TAG_ROLES.has(role ?? '');
}

interface TechniqueRow {
  id: string;
  name: string;
  description: string;
  section: string | null;
  sequence: number;
  technique_skills: Array<{ skill_code: string }> | { skill_code: string } | null;
}

function toOption(row: TechniqueRow): TechniqueOption {
  const skills = Array.isArray(row.technique_skills)
    ? row.technique_skills
    : row.technique_skills
      ? [row.technique_skills]
      : [];
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    section: row.section === 'math' || row.section === 'reading_writing' ? row.section : null,
    sequence: row.sequence,
    skillCodes: skills.map((s) => s.skill_code),
  };
}

/**
 * The whole catalog with default skills, in catalog order, for any
 * authenticated reader (techniques are select-for-all): lesson editors
 * pick from it whatever their role. Techniques cut across skills, so
 * there is no per-skill scoping here — pickers put the ones that apply
 * to a question's or unit's section first.
 */
export async function loadAllTechniques(): Promise<TechniqueOption[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('techniques')
    .select(TECHNIQUE_SELECT)
    .eq('test_type', 'sat')
    .order('section', { ascending: true, nullsFirst: true })
    .order('sequence', { ascending: true })
    .order('name', { ascending: true });
  return ((data ?? []) as unknown as TechniqueRow[]).map(toOption);
}

/**
 * The catalog for a tagging surface. Returns null when the caller
 * cannot tag, which hosts use as the "don't render the picker at all"
 * signal (same convention as conceptTagsCatalog).
 */
export async function loadTechniqueCatalog({
  role,
}: {
  role: string | null | undefined;
}): Promise<TechniqueOption[] | null> {
  if (!canTagTechniques(role)) return null;
  return loadAllTechniques();
}

/** question id → explicitly tagged technique ids, for a page's questions. */
export async function loadQuestionTechniqueIds({
  questionIds,
}: {
  questionIds: readonly string[];
}): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  const ids = [...new Set(questionIds.filter(Boolean))];
  if (ids.length === 0) return out;
  const supabase = await createClient();
  // Chunked so the PostgREST `in` URL stays short on big reports.
  const results = await Promise.all(
    Array.from({ length: Math.ceil(ids.length / CHUNK) }, (_, i) =>
      supabase
        .from('question_techniques')
        .select('question_id, technique_id')
        .in('question_id', ids.slice(i * CHUNK, (i + 1) * CHUNK)),
    ),
  );
  for (const r of results) {
    for (const row of r.data ?? []) {
      const list = out.get(row.question_id) ?? [];
      if (!list.includes(row.technique_id)) list.push(row.technique_id);
      out.set(row.question_id, list);
    }
  }
  return out;
}

/**
 * Catalog + current tags for one question. Returns skillCode too so
 * the host doesn't need it in its own select — the single-question
 * review page carries skill_name but not skill_code.
 */
export async function loadQuestionTechniques({
  questionId,
  role,
}: {
  questionId: string;
  role: string | null | undefined;
}): Promise<{
  techniques: TechniqueOption[];
  techniqueIds: string[];
  skillCode: string | null;
  canTag: boolean;
}> {
  const canTag = canTagTechniques(role);
  if (!canTag || !questionId) {
    return { techniques: [], techniqueIds: [], skillCode: null, canTag: false };
  }
  const supabase = await createClient();
  const [{ data: question }, techniques, tagged] = await Promise.all([
    supabase.from('questions_v2').select('skill_code').eq('id', questionId).maybeSingle(),
    loadTechniqueCatalog({ role }),
    loadQuestionTechniqueIds({ questionIds: [questionId] }),
  ]);
  return {
    techniques: techniques ?? [],
    techniqueIds: tagged.get(questionId) ?? [],
    skillCode: question?.skill_code ?? null,
    canTag,
  };
}
