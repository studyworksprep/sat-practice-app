// Ordering + progress for the per-unit technique tagging screen
// (docs/foundations-and-question-patterns.md §8.5 step B).
//
// Pure: the screen freezes an order when it opens or when the editor
// switches modes, and walks it by index, so a question the editor just
// tagged does not jump out from under them (the live list only feeds
// the progress count). Explicit tags are what "tagged" means here —
// a technique that applies to the whole skill by default needs no
// per-question work, and the screen says so separately.

export interface TaggingListItem {
  id: string;
  displayCode: string | null;
  difficulty: number | null;
  /** Explicit question_techniques rows on this question. */
  techniqueIds: string[];
}

export type TaggingOrder = 'untagged_first' | 'code' | 'tagged_only';

export const TAGGING_ORDER_LABELS: Record<TaggingOrder, string> = {
  untagged_first: 'Untagged first',
  code: 'In question order',
  tagged_only: 'Tagged only (review)',
};

function byCode(a: TaggingListItem, b: TaggingListItem): number {
  return (a.displayCode ?? '').localeCompare(b.displayCode ?? '') || a.id.localeCompare(b.id);
}

/** The ids to walk, in order. Stable within each group. */
export function orderQuestionsForTagging(
  items: readonly TaggingListItem[],
  order: TaggingOrder,
): string[] {
  const sorted = [...items].sort(byCode);
  if (order === 'code') return sorted.map((q) => q.id);
  const tagged = sorted.filter((q) => q.techniqueIds.length > 0);
  const untagged = sorted.filter((q) => q.techniqueIds.length === 0);
  if (order === 'tagged_only') return tagged.map((q) => q.id);
  return [...untagged, ...tagged].map((q) => q.id);
}

export function taggingProgress(items: readonly TaggingListItem[]): { tagged: number; total: number } {
  return {
    tagged: items.filter((q) => q.techniqueIds.length > 0).length,
    total: items.length,
  };
}

/** Two id lists hold the same set (order-insensitive). */
export function sameIdSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}
