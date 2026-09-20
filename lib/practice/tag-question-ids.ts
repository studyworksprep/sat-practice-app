// Concept-tag → question-id resolver, shared by every surface that
// narrows a question list by tag (the admin Questions browser, the
// student/tutor quick-find search, the lesson-pack builder).
//
// question_concept_tags.question_id is v2-keyed (FK to questions_v2),
// so each tag resolves directly to v2 question ids. Multiple tags are
// AND-combined: the result is the intersection of the per-tag id
// sets. PostgREST doesn't expose an intersect-style join for this
// shape, so the intersection happens here and the caller hands the
// resulting ids to its main query as a single `.in('id', …)`.
//
// Link rows are read through the typed fetchAll so a heavily used tag
// (thousands of links) isn't silently truncated at PostgREST's
// max-rows cap — a truncated set would make the filter quietly drop
// matching questions.
//
// Returns null on a query error, an empty Set when any tag has no
// links (the intersection is then empty by definition), otherwise the
// ids common to every requested tag.
//
// Imports are relative (not '@/…') so lib/practice/tag-question-ids.test.mjs
// can load this module under `node --test`.

import { fetchAll } from '../api/paginate.ts';
import type { TypedSupabaseClient } from '../supabase/server.ts';

// A handful of tags is the sane upper bound for an AND filter; anything
// beyond this is either a forged request or a UI bug.
export const MAX_TAG_FILTERS = 20;

/** Dedupe + clamp a raw list of tag ids from a form or URL. */
export function normalizeTagIds(raw: Iterable<unknown>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of raw) {
    const id = typeof value === 'string' ? value.trim() : '';
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= MAX_TAG_FILTERS) break;
  }
  return out;
}

export async function intersectTaggedQuestionIds(
  supabase: TypedSupabaseClient,
  tagIds: string[],
): Promise<Set<string> | null> {
  if (tagIds.length === 0) return new Set();

  let linkRows: Array<{ tag_id: string; question_id: string }>;
  try {
    linkRows = await fetchAll(
      () =>
        supabase
          .from('question_concept_tags')
          .select('tag_id, question_id')
          .in('tag_id', tagIds),
      { order: { column: 'id' } },
    );
  } catch {
    return null;
  }

  const idsByTag = new Map<string, Set<string>>();
  for (const row of linkRows) {
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
