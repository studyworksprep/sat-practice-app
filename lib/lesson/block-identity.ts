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
//      text block's html), or
//   3. failing both, the same text. Compiler-generated positional ids
//      (text_7, raw_12) never count as a stable key: an insertion
//      above such a block renumbers it without changing the block.
// Each tier runs over the whole list before the next, and matching is
// one-to-one in lesson order, so two identical checks still map to two
// distinct rows. Anything unmatched is a new row;
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

function textFingerprint(type: string, content: Record<string, unknown>): string {
  switch (type) {
    case 'check':
      return normalizeText(content.prompt);
    case 'desmos_interactive':
      return normalizeText(content.title) || normalizeText(content.instructions_html);
    case 'text':
      return normalizeText(content.html);
    case 'video':
      return normalizeText(content.url ?? content.src);
    case 'question_link':
      return normalizeText(content.question_id);
    default:
      return '';
  }
}

/** The text-only key: what a block says, ignoring any id. Used as the
 *  second matching tier so a block whose generated id shifted (the
 *  compiler numbers id-less text blocks by position: text_7 → text_8
 *  after an insertion above it) is still recognised by its content. */
export function textBlockKey(block: {
  block_type?: string | null;
  content?: Record<string, unknown> | null;
}): string | null {
  const type = block?.block_type ? String(block.block_type) : '';
  if (!type) return null;
  if (type === 'lesson_complete') return `${type}|singleton`;
  const fingerprint = textFingerprint(type, block?.content ?? {});
  return fingerprint ? `${type}|text:${fingerprint}` : null;
}

function normalizeText(value: unknown): string {
  if (value == null) return '';
  return String(value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Ids the spec compiler mints by position when the author gave none
 *  (`text_7`, `raw_12`, `graph_workflow_3_step2`, plus `_2` collision
 *  suffixes). They shift whenever a block is inserted above, so they
 *  identify a position, not a block, and must not outrank the text. */
const GENERATED_ID =
  /^(?:text|raw|desmos_enter|graph_workflow|slider_workflow|branching_question)_\d+(?:_[a-z0-9]+)*$/i;

export function isGeneratedContentId(id: unknown): boolean {
  return id != null && GENERATED_ID.test(String(id).trim());
}

/** The key two blocks must share to be treated as the same block:
 *  an author-set content.id, else the block's own text. Null when the
 *  block has nothing stable to key on. */
export function stableBlockKey(block: {
  block_type?: string | null;
  content?: Record<string, unknown> | null;
}): string | null {
  const type = block?.block_type ? String(block.block_type) : '';
  if (!type) return null;
  const content = block?.content ?? {};
  const contentId = content.id;
  if (contentId != null && String(contentId).trim() !== '' && !isGeneratedContentId(contentId)) {
    return `${type}|id:${String(contentId).trim()}`;
  }
  return textBlockKey(block);
}

export function reconcileBlockRows(
  existingRows: StoredBlockRow[],
  nextBlocks: IncomingBlock[],
): BlockReconcilePlan {
  const existing = [...(existingRows ?? [])].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
  );
  const byId = new Map<string, StoredBlockRow>();
  const byStableKey = new Map<string, StoredBlockRow[]>();
  const byTextKey = new Map<string, StoredBlockRow[]>();
  const enqueue = (map: Map<string, StoredBlockRow[]>, key: string | null, row: StoredBlockRow) => {
    if (!key) return;
    const queue = map.get(key) ?? [];
    queue.push(row);
    map.set(key, queue);
  };
  for (const row of existing) {
    byId.set(String(row.id), row);
    enqueue(byStableKey, stableBlockKey(row), row);
    enqueue(byTextKey, textBlockKey(row), row);
  }

  const used = new Set<string>();
  const claimFrom = (map: Map<string, StoredBlockRow[]>, key: string | null): StoredBlockRow | null => {
    const queue = key ? map.get(key) : undefined;
    while (queue && queue.length > 0) {
      const candidate = queue.shift() as StoredBlockRow;
      if (!used.has(String(candidate.id))) return candidate;
    }
    return null;
  };

  // Three tiers, each run over the whole list before the next so a
  // strong match is never pre-empted by a weaker one further up:
  //   1. the incoming block carries a stored uuid;
  //   2. stable key (content.id when set, else text);
  //   3. text alone, for blocks whose generated content.id shifted.
  const incoming = nextBlocks ?? [];
  const matches: Array<StoredBlockRow | null> = incoming.map(() => null);
  incoming.forEach((block, i) => {
    const directId = block?.id != null ? String(block.id) : '';
    if (directId && byId.has(directId) && !used.has(directId)) {
      matches[i] = byId.get(directId) ?? null;
      used.add(directId);
    }
  });
  incoming.forEach((block, i) => {
    if (matches[i]) return;
    const match = claimFrom(byStableKey, stableBlockKey(block));
    if (match) {
      matches[i] = match;
      used.add(String(match.id));
    }
  });
  incoming.forEach((block, i) => {
    if (matches[i]) return;
    const match = claimFrom(byTextKey, textBlockKey(block));
    if (match) {
      matches[i] = match;
      used.add(String(match.id));
    }
  });

  const rows: PlannedBlockRow[] = incoming.map((block, index) => {
    const match = matches[index];
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
