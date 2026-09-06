// Block identity across lesson saves.
//
// Student progress (lesson_progress.completed_blocks and the keys of
// check_answers) is keyed by lesson_blocks.id. Until 2026-09-06 both
// block writers — the JSON importer's replace mode and the in-app
// editor's Save — cleared the lesson's rows and inserted fresh ones,
// so every save minted new uuids and silently orphaned every
// student's progress on that lesson (the 2026-09-03 re-import of all
// 36 lessons left 33 of 34 progress rows in production pointing at
// ids that no longer exist).
//
// reconcileBlockRows() matches the incoming block list against the
// rows already stored and reuses the stored uuid wherever a block is
// recognisably "the same block":
//   1. the incoming block carries the stored row's uuid (the editor
//      round-trips ids), or
//   2. the two share a stable key — content.id when the author set
//      one (text blocks always have it, checks when the spec gives
//      them an id, Desmos templates), else a normalised fingerprint
//      of the block's own text (a check's prompt, a Desmos title, a
//      text block's html).
// Matching is one-to-one in lesson order, so two identical checks
// still map to two distinct rows. Anything unmatched is a new row;
// stored rows nothing claimed are deleted.

import type { TypedSupabaseClient } from '@/lib/supabase/server';

export interface StoredBlockRow {
  id: string;
  block_type: string;
  content: Record<string, unknown> | null;
  sort_order?: number | null;
}

export interface IncomingBlock {
  /** A stored uuid when the caller round-trips one; anything else is ignored. */
  id?: string | null;
  block_type: string;
  content?: Record<string, unknown> | null;
}

export interface PlannedBlockRow {
  /** Reused stored uuid, or null for a row the database will mint. */
  id: string | null;
  sort_order: number;
  block_type: string;
  content: Record<string, unknown>;
}

export interface BlockReconcilePlan {
  rows: PlannedBlockRow[];
  keepRows: PlannedBlockRow[];
  newRows: PlannedBlockRow[];
  deleteIds: string[];
  reusedCount: number;
}

function normalizeText(value: unknown): string {
  if (value == null) return '';
  return String(value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** The key two blocks must share to be treated as the same block.
 *  Null when the block has nothing stable to key on. */
export function stableBlockKey(block: {
  block_type?: string | null;
  content?: Record<string, unknown> | null;
}): string | null {
  const type = block?.block_type ? String(block.block_type) : '';
  if (!type) return null;
  const content = block?.content ?? {};
  const contentId = content.id;
  if (contentId != null && String(contentId).trim() !== '') {
    return `${type}|id:${String(contentId).trim()}`;
  }
  let fingerprint = '';
  switch (type) {
    case 'check':
      fingerprint = normalizeText(content.prompt);
      break;
    case 'desmos_interactive':
      fingerprint = normalizeText(content.title) || normalizeText(content.instructions_html);
      break;
    case 'text':
      fingerprint = normalizeText(content.html);
      break;
    case 'video':
      fingerprint = normalizeText(content.url ?? content.src);
      break;
    case 'question_link':
      fingerprint = normalizeText(content.question_id);
      break;
    case 'lesson_complete':
      // A lesson has at most one terminal block; it is the same one.
      return `${type}|singleton`;
    default:
      fingerprint = '';
  }
  return fingerprint ? `${type}|text:${fingerprint}` : null;
}

export function reconcileBlockRows(
  existingRows: StoredBlockRow[],
  nextBlocks: IncomingBlock[],
): BlockReconcilePlan {
  const existing = [...(existingRows ?? [])].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
  );
  const byId = new Map<string, StoredBlockRow>();
  const byKey = new Map<string, StoredBlockRow[]>();
  for (const row of existing) {
    byId.set(String(row.id), row);
    const key = stableBlockKey(row);
    if (!key) continue;
    const queue = byKey.get(key) ?? [];
    queue.push(row);
    byKey.set(key, queue);
  }

  const used = new Set<string>();
  const rows: PlannedBlockRow[] = (nextBlocks ?? []).map((block, index) => {
    let match: StoredBlockRow | null = null;
    const directId = block?.id != null ? String(block.id) : '';
    if (directId && byId.has(directId) && !used.has(directId)) {
      match = byId.get(directId) ?? null;
    }
    if (!match) {
      const key = stableBlockKey(block);
      const queue = key ? byKey.get(key) : undefined;
      while (queue && queue.length > 0) {
        const candidate = queue.shift() as StoredBlockRow;
        if (!used.has(String(candidate.id))) {
          match = candidate;
          break;
        }
      }
    }
    if (match) used.add(String(match.id));
    return {
      id: match ? String(match.id) : null,
      sort_order: index,
      block_type: String(block.block_type),
      content: (block.content ?? {}) as Record<string, unknown>,
    };
  });

  const deleteIds = existing
    .map((row) => String(row.id))
    .filter((id) => !used.has(id));

  return {
    rows,
    keepRows: rows.filter((r) => r.id != null),
    newRows: rows.filter((r) => r.id == null),
    deleteIds,
    reusedCount: used.size,
  };
}

/** Apply a plan to lesson_blocks: delete unclaimed rows, update kept
 *  rows in place (content / type / order), insert the new ones.
 *  Returns an error message or null. Three statements, not one
 *  transaction — a failure part-way leaves the lesson with its kept
 *  rows intact and is reported to the caller, which is strictly
 *  better than the old clear-then-insert (where a failed insert left
 *  an empty lesson). */
export async function persistReconciledBlocks(
  supabase: TypedSupabaseClient,
  lessonId: string,
  plan: BlockReconcilePlan,
): Promise<string | null> {
  if (plan.deleteIds.length > 0) {
    const { error } = await supabase
      .from('lesson_blocks')
      .delete()
      .eq('lesson_id', lessonId)
      .in('id', plan.deleteIds);
    if (error) return `Failed to remove blocks: ${error.message}`;
  }
  if (plan.keepRows.length > 0) {
    const { error } = await supabase
      .from('lesson_blocks')
      .upsert(
        plan.keepRows.map((r) => ({
          id: r.id as string,
          lesson_id: lessonId,
          sort_order: r.sort_order,
          block_type: r.block_type,
          content: r.content as never,
        })),
        { onConflict: 'id' },
      );
    if (error) return `Failed to update blocks: ${error.message}`;
  }
  if (plan.newRows.length > 0) {
    const { error } = await supabase
      .from('lesson_blocks')
      .insert(
        plan.newRows.map((r) => ({
          lesson_id: lessonId,
          sort_order: r.sort_order,
          block_type: r.block_type,
          content: r.content as never,
        })),
      );
    if (error) return `Failed to insert blocks: ${error.message}`;
  }
  return null;
}
