// Server-side loader for the per-question pattern-tagging surface
// (docs/foundations-and-question-patterns.md §3.4 step 2).
//
// Mirrors load-concept-tags.js: a Server Component preloads what the
// island needs and passes it as props, so the client never
// useEffect+fetches on mount.
//
// Two entry points because the hosts come in two shapes:
//   - loadPatternCatalog: review surfaces that render many questions
//     (assignment reports, session review). They load the catalog once
//     and each row carries its own pattern_id, exactly how the concept
//     tags catalog + per-row tag ids are plumbed.
//   - loadQuestionPattern: single-question hosts (QuestionReviewPage).
//
// RLS: question_patterns is select-for-all (its create migration), so
// reading needs no role. The role gate here is about who may WRITE —
// there is no point shipping a picker to someone whose save will be
// refused by set_question_pattern().

import { createClient } from '@/lib/supabase/server';

/** Matches the is_manager() bar enforced inside set_question_pattern(). */
export const PATTERN_TAG_ROLES: ReadonlySet<string> = new Set(['manager', 'admin']);

export interface PatternOption {
  id: string;
  domain_code: string;
  skill_code: string;
  name: string;
  recognition_cue: string;
  sequence: number;
}

const PATTERN_SELECT = 'id, domain_code, skill_code, name, recognition_cue, sequence';

export function canTagPatterns(role: string | null | undefined): boolean {
  return PATTERN_TAG_ROLES.has(role ?? '');
}

/**
 * The catalog for a set of skills, ordered for display. Returns null
 * when the caller cannot tag, which hosts use as the "don't render the
 * picker at all" signal (same convention as conceptTagsCatalog).
 *
 * Pass skillCodes to load only the skills actually on the page; omit
 * it for the whole catalog.
 */
export async function loadPatternCatalog({
  role,
  skillCodes,
}: {
  role: string | null | undefined;
  skillCodes?: string[];
}): Promise<PatternOption[] | null> {
  if (!canTagPatterns(role)) return null;
  if (skillCodes && skillCodes.length === 0) return [];

  const supabase = await createClient();
  let query = supabase
    .from('question_patterns')
    .select(PATTERN_SELECT)
    .eq('test_type', 'sat')
    .order('domain_code', { ascending: true })
    .order('skill_code', { ascending: true })
    .order('sequence', { ascending: true });

  if (skillCodes) {
    query = query.in('skill_code', [...new Set(skillCodes)]);
  }

  const { data } = await query;
  return (data ?? []) as PatternOption[];
}

/**
 * Catalog + current tag for one question. Returns skillCode too so the
 * host doesn't need it in its own select — the single-question review
 * page carries skill_name but not skill_code.
 */
export async function loadQuestionPattern({
  questionId,
  role,
}: {
  questionId: string;
  role: string | null | undefined;
}): Promise<{
  patterns: PatternOption[];
  patternId: string | null;
  skillCode: string | null;
  canTag: boolean;
}> {
  const canTag = canTagPatterns(role);
  if (!canTag || !questionId) {
    return { patterns: [], patternId: null, skillCode: null, canTag: false };
  }

  const supabase = await createClient();
  const { data: question } = await supabase
    .from('questions_v2')
    .select('skill_code, pattern_id')
    .eq('id', questionId)
    .maybeSingle();

  const skillCode = question?.skill_code ?? null;
  if (!skillCode) {
    return { patterns: [], patternId: question?.pattern_id ?? null, skillCode: null, canTag };
  }

  const patterns = await loadPatternCatalog({ role, skillCodes: [skillCode] });
  return {
    patterns: patterns ?? [],
    patternId: question?.pattern_id ?? null,
    skillCode,
    canTag,
  };
}
