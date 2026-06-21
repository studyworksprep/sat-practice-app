// Question-bank search Server Actions shared by the student
// Practice start page and the tutor Training → Practice page.
//
// Mirrors the legacy /api/questions q-search but in v2 terms: hits
// questions_v2 directly (no v1 join), filters to published / non-
// broken / not-deleted, and returns the lightweight payload the
// search island renders. Result is capped to 25 — the search bar
// is a quick-find affordance, not a paginated browse, so once you
// see >25 matches the suggestion is "narrow your query."
//
// Two ways to narrow:
//
//   - Free text (`q`) — substring match on display_code,
//     source_external_id, stem_html, stimulus_html.
//   - Concept tags (`tagIds[]`) — manager+admin only. AND-combined
//     with each other and with the text search. Tag links live on
//     question_concept_tags(question_id) keyed by v1 ids, so the
//     resolver translates each tag → v1 question_ids → v2
//     question_ids (via question_id_map) and intersects across
//     tags before handing the candidate set to the main query.
//
// listConceptTagsForSearch returns the full tag catalog so the
// QuestionSearch UI can render a searchable +Tag picker.

'use server';

import { requireUser } from '@/lib/api/auth';
import { actionFail, ApiError } from '@/lib/api/response';

const MAX_RESULTS = 25;
const TAG_SEARCH_ROLES = new Set(['manager', 'admin']);

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
  const tagIdsRaw = formData.getAll('tagIds').map((v) => String(v)).filter(Boolean);
  // Dedupe + clamp the tag list. A handful of tags is sane; an
  // unbounded list would bloat the AND-intersection loop.
  const tagIds = Array.from(new Set(tagIdsRaw)).slice(0, 20);

  if (!q && tagIds.length === 0) {
    return { ok: true, results: [], truncated: false };
  }

  let ctx;
  try {
    ctx = await requireUser();
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult() as { ok: false; error: string };
    return actionFail('Unexpected error loading user');
  }
  const { profile, supabase } = ctx;

  // Tag filtering is privileged — students don't see concept tags
  // anywhere in the UI, so don't let a forged form widen visibility
  // here either. The picker is gated client-side too; this is the
  // server-side enforcement.
  if (tagIds.length > 0 && !TAG_SEARCH_ROLES.has(profile.role)) {
    return actionFail('Tag filtering is not available for your role.');
  }

  // Resolve each tag → set of v2 question ids the tag is linked
  // to, then AND-intersect across tags. Done before the main query
  // so we can hand a single .in('id', ...) constraint downstream
  // and skip the query entirely on an empty intersection.
  let tagFilteredIds: string[] | null = null;
  if (tagIds.length > 0) {
    const intersection = await intersectTaggedQuestionIds(supabase, tagIds);
    if (intersection == null) return actionFail('Failed to resolve tag filters.');
    if (intersection.size === 0) {
      return { ok: true, results: [], truncated: false };
    }
    tagFilteredIds = Array.from(intersection);
  }

  // Escape postgres ilike wildcards so a query like "50%" doesn't
  // turn into a match-anything pattern. Commas would break the
  // PostgREST or() filter syntax — strip them; the search bar
  // doesn't need them and a stray comma shouldn't 500 the query.
  const safe = q.replace(/[%_\\]/g, '\\$&').replace(/,/g, '');
  const pattern = q ? `%${safe}%` : null;

  let query = supabase
    .from('questions_v2')
    .select(
      'id, display_code, source_external_id, domain_name, skill_name, difficulty, score_band',
    )
    .eq('is_published', true)
    .eq('is_broken', false)
    .is('deleted_at', null);

  if (tagFilteredIds) query = query.in('id', tagFilteredIds);
  if (pattern) {
    query = query.or(
      [
        `display_code.ilike.${pattern}`,
        `source_external_id.ilike.${pattern}`,
        `stem_html.ilike.${pattern}`,
        `stimulus_html.ilike.${pattern}`,
      ].join(','),
    );
  }

  const { data, error } = await query
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

// ──────────────────────────────────────────────────────────────
// listConceptTagsForSearch
//
// Returns the full concept_tags catalog (id + name, sorted) for
// the +Tag picker in QuestionSearch. Manager+admin only — students
// never see tags, so they get an empty list. The tag chips render
// only when this returns non-empty, so the +Tag button hides
// itself for unauthorized callers without any client-side branching.
// ──────────────────────────────────────────────────────────────

export interface ConceptTagListItem {
  id: string;
  name: string;
}

export interface ListConceptTagsResult {
  ok: true;
  tags: ConceptTagListItem[];
}

export async function listConceptTagsForSearch(): Promise<
  ListConceptTagsResult | { ok: false; error: string }
> {
  let ctx;
  try {
    ctx = await requireUser();
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult() as { ok: false; error: string };
    return actionFail('Unexpected error loading user');
  }
  const { profile, supabase } = ctx;
  if (!TAG_SEARCH_ROLES.has(profile.role)) {
    return { ok: true, tags: [] };
  }
  const { data, error } = await supabase
    .from('concept_tags')
    .select('id, name')
    .order('name', { ascending: true });
  if (error) return actionFail(error.message);
  return { ok: true, tags: (data ?? []) as ConceptTagListItem[] };
}

// ──────────────────────────────────────────────────────────────
// Internal: tag → question-id resolver (AND-intersection).
//
// question_concept_tags.question_id is v2-keyed (FK to questions_v2).
// AND across tags is an intersection of the per-tag id sets; no
// DB-side trick because PostgREST doesn't expose intersect-style
// joins in a clean way for our shape.
// ──────────────────────────────────────────────────────────────

type SupabaseFromCtx = Awaited<ReturnType<typeof requireUser>>['supabase'];

async function intersectTaggedQuestionIds(
  supabase: SupabaseFromCtx,
  tagIds: string[],
): Promise<Set<string> | null> {
  const { data: linkRows, error: linkErr } = await supabase
    .from('question_concept_tags')
    .select('tag_id, question_id')
    .in('tag_id', tagIds);
  if (linkErr) return null;

  const idsByTag = new Map<string, Set<string>>();
  for (const row of linkRows ?? []) {
    if (!row?.tag_id || !row?.question_id) continue;
    let bucket = idsByTag.get(row.tag_id);
    if (!bucket) {
      bucket = new Set();
      idsByTag.set(row.tag_id, bucket);
    }
    bucket.add(row.question_id);
  }

  // Any tag with no link rows yields an empty intersection.
  for (const tagId of tagIds) {
    if (!idsByTag.has(tagId)) return new Set();
  }

  const setsByTag = Array.from(idsByTag.values());
  if (setsByTag.length === 0) return new Set();
  // Start from the smallest set so the intersection loop is cheap.
  setsByTag.sort((a, b) => a.size - b.size);
  const out = new Set(setsByTag[0]);
  for (let i = 1; i < setsByTag.length; i += 1) {
    for (const id of out) {
      if (!setsByTag[i].has(id)) out.delete(id);
    }
  }
  return out;
}
