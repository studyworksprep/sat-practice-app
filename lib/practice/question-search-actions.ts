// Question-bank search Server Action shared by the student
// Practice start page and the tutor Training → Practice page.
//
// Mirrors the legacy /api/questions q-search but in v2 terms: hits
// questions_v2 directly (no v1 join), filters to published / non-
// broken / not-deleted, and returns the lightweight payload the
// search island renders. Result is capped to 25 — the search bar
// is a quick-find affordance, not a paginated browse, so once you
// see >25 matches the suggestion is "narrow your query."
//
// Privileged-role tag search (the legacy code's concept_tags
// branch) is intentionally omitted for now — v2 hasn't carried
// concept_tags forward, and the in-tree taxonomy already exposes
// domain/skill via the filter card. Add it later if a real need
// shows up.

'use server';

import { requireUser } from '@/lib/api/auth';
import { actionFail, ApiError } from '@/lib/api/response';

const MAX_RESULTS = 25;

export interface QuestionSearchHit {
  id: string;
  display_code: string | null;
  source_external_id: string | null;
  domain_name: string | null;
  skill_name: string | null;
  difficulty: number | null;
  score_band: number | null;
}

export interface QuestionSearchResult {
  ok: true;
  results: QuestionSearchHit[];
  truncated: boolean;
}

export async function searchQuestions(
  _prev: unknown,
  formData: FormData,
): Promise<QuestionSearchResult | { ok: false; error: string }> {
  const q = String(formData.get('q') ?? '').trim();
  if (!q) return { ok: true, results: [], truncated: false };

  let ctx;
  try {
    ctx = await requireUser();
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult() as { ok: false; error: string };
    return actionFail('Unexpected error loading user');
  }
  const { supabase } = ctx;

  // Escape postgres ilike wildcards so a query like "50%" doesn't
  // turn into a match-anything pattern. Commas would break the
  // PostgREST or() filter syntax — strip them; the search bar
  // doesn't need them and a stray comma shouldn't 500 the query.
  const safe = q.replace(/[%_\\]/g, '\\$&').replace(/,/g, '');
  const pattern = `%${safe}%`;

  // Search by external/display id and prose. options is a JSON
  // column; cast to text for a substring match against any
  // answer-choice content. options::text isn't indexable, but at
  // ~5k published rows it's still well under a second uncached.
  const { data, error } = await supabase
    .from('questions_v2')
    .select(
      'id, display_code, source_external_id, domain_name, skill_name, difficulty, score_band',
    )
    .eq('is_published', true)
    .eq('is_broken', false)
    .is('deleted_at', null)
    .or(
      [
        `display_code.ilike.${pattern}`,
        `source_external_id.ilike.${pattern}`,
        `stem_html.ilike.${pattern}`,
        `stimulus_html.ilike.${pattern}`,
      ].join(','),
    )
    .order('display_code', { ascending: true })
    .limit(MAX_RESULTS + 1);

  if (error) return actionFail(error.message);

  const rows = (data ?? []) as QuestionSearchHit[];
  const truncated = rows.length > MAX_RESULTS;
  return {
    ok: true,
    results: truncated ? rows.slice(0, MAX_RESULTS) : rows,
    truncated,
  };
}
