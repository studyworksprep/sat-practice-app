// Server Actions for the per-student flashcards modal. Replace
// the legacy fetch('/api/flashcard-sets'), fetch('/api/flashcards'),
// and fetch('/api/flashcards', POST) calls inside
// components/FlashcardsModal.js so the new-tree island uses
// React 19's action machinery.
//
// Reads are also actions here (not Server-Component preloads)
// because the modal's data is loaded on user interaction (click
// the trigger button → modal opens → ensureDefaults + list sets;
// click "My Flashcards" tab → list cards). Pre-loading on every
// question Server Component would waste a couple of round-trips
// per question for a feature most students don't open.
//
// Each action requires a logged-in user via requireUser. The set-
// ownership check is handled by the API route's pattern (set_id
// → flashcard_sets row keyed to user_id) since RLS on flashcards
// flows through set_id.

'use server';

import { requireUser } from '@/lib/api/auth';
import { actionFail, actionOk, ApiError } from '@/lib/api/response';
import type { ActionResult } from '@/lib/types';

const DEFAULT_SETS = ['My Math', 'My Reading'];
const MAX_PAGE_SIZE = 100;

/** Confirm `cardId` belongs to a set owned by `userId`. Done as
 *  two separate reads instead of a flashcards → flashcard_sets
 *  inner join because Supabase's generated types treat the joined
 *  relationship as an array, which breaks ownership-check code
 *  paths that want a single parent row. Two cheap PK lookups are
 *  fine here — flashcards is a small per-user table. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ownsCard(supabase: any, userId: string, cardId: string): Promise<boolean> {
  const { data: card } = await supabase
    .from('flashcards')
    .select('id, set_id')
    .eq('id', cardId)
    .maybeSingle();
  if (!card) return false;
  const { data: set } = await supabase
    .from('flashcard_sets')
    .select('id')
    .eq('id', card.set_id)
    .eq('user_id', userId)
    .maybeSingle();
  return !!set;
}

interface FlashcardSet {
  id: string;
  name: string;
  is_default: boolean;
  created_at: string | null;
  card_count: number;
}

interface Flashcard {
  id: string;
  front: string;
  back: string;
  mastery: number | null;
  created_at: string;
  reviewed_at: string | null;
}

/** Ensure the student has the default "My Math" / "My Reading"
 *  sets. Idempotent — only inserts the missing ones.
 *  supabase / userId come from requireUser, which is .js — so
 *  we don't have a precise SupabaseClient<Database> type here yet. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ensureDefaults(supabase: any, userId: string): Promise<void> {
  const { data: existing } = await supabase
    .from('flashcard_sets')
    .select('id, name')
    .eq('user_id', userId)
    .eq('is_default', true);

  const existingNames = new Set(
    ((existing ?? []) as Array<{ name: string }>).map((s) => s.name),
  );
  const missing = DEFAULT_SETS.filter((n) => !existingNames.has(n));

  if (missing.length === 0) return;
  await supabase.from('flashcard_sets').insert(
    missing.map((name) => ({ user_id: userId, name, is_default: true })),
  );
}

/** List the caller's flashcard sets with per-set card counts.
 *  Mirrors GET /api/flashcard-sets but skips avg_mastery (the modal
 *  doesn't display it — that's a /flashcards page feature). */
export async function listFlashcardSets(): Promise<
  ActionResult<{ data: { sets: FlashcardSet[] } }>
> {
  let user;
  let supabase;
  try {
    ({ user, supabase } = await requireUser());
  } catch (e) {
    if (e instanceof ApiError) return actionFail(e.message);
    throw e;
  }

  await ensureDefaults(supabase, user.id);

  const { data: sets, error } = await supabase
    .from('flashcard_sets')
    .select('id, name, is_default, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true });
  if (error) return actionFail(error.message);

  const setRows: Array<Omit<FlashcardSet, 'card_count'>> = sets ?? [];
  const setIds = setRows.map((s) => s.id);
  const counts: Record<string, number> = {};
  if (setIds.length > 0) {
    const { data: cards } = await supabase
      .from('flashcards')
      .select('set_id')
      .in('set_id', setIds);
    for (const c of (cards ?? []) as Array<{ set_id: string }>) {
      counts[c.set_id] = (counts[c.set_id] ?? 0) + 1;
    }
  }

  return actionOk({
    sets: setRows.map((s) => ({ ...s, card_count: counts[s.id] ?? 0 })),
  });
}

/** List a page of cards in a set the caller owns. Mirrors
 *  GET /api/flashcards?set_id&page&page_size. */
export async function listFlashcards({
  setId,
  page = 1,
  pageSize = 25,
}: {
  setId: string;
  page?: number;
  pageSize?: number;
}): Promise<
  ActionResult<{
    data: {
      cards: Flashcard[];
      total: number;
      page: number;
      pageSize: number;
    };
  }>
> {
  if (!setId) return actionFail('setId required');

  let user;
  let supabase;
  try {
    ({ user, supabase } = await requireUser());
  } catch (e) {
    if (e instanceof ApiError) return actionFail(e.message);
    throw e;
  }

  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const safeSize =
    Number.isFinite(pageSize) && pageSize > 0
      ? Math.min(MAX_PAGE_SIZE, Math.floor(pageSize))
      : 25;
  const from = (safePage - 1) * safeSize;
  const to = from + safeSize - 1;

  const { data: set } = await supabase
    .from('flashcard_sets')
    .select('id')
    .eq('id', setId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!set) return actionFail('Set not found');

  const { data: cards, error, count } = await supabase
    .from('flashcards')
    .select('id, front, back, mastery, created_at, reviewed_at', { count: 'exact' })
    .eq('set_id', setId)
    .order('created_at', { ascending: false })
    .range(from, to);
  if (error) return actionFail(error.message);

  return actionOk({
    cards: (cards ?? []) as Flashcard[],
    total: count ?? 0,
    page: safePage,
    pageSize: safeSize,
  });
}

/** Create a flashcard in a set the caller owns. Mirrors
 *  POST /api/flashcards. */
export async function createFlashcard({
  setId,
  front,
  back,
}: {
  setId: string;
  front: string;
  back: string;
}): Promise<ActionResult<{ data: { card: Flashcard } }>> {
  if (!setId) return actionFail('setId required');
  const trimmedFront = (front ?? '').trim();
  const trimmedBack = (back ?? '').trim();
  if (!trimmedFront || !trimmedBack) {
    return actionFail('Front and back are required');
  }

  let user;
  let supabase;
  try {
    ({ user, supabase } = await requireUser());
  } catch (e) {
    if (e instanceof ApiError) return actionFail(e.message);
    throw e;
  }

  const { data: set } = await supabase
    .from('flashcard_sets')
    .select('id')
    .eq('id', setId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!set) return actionFail('Set not found');

  const { data: card, error } = await supabase
    .from('flashcards')
    .insert({ set_id: setId, front: trimmedFront, back: trimmedBack })
    .select('id, front, back, mastery, created_at, reviewed_at')
    .single();
  if (error) return actionFail(error.message);

  return actionOk({ card: card as Flashcard });
}

/** Update a flashcard the caller owns (front + back text).
 *  Set ownership is enforced by the join from flashcards.set_id
 *  to flashcard_sets.user_id. Mirrors PATCH /api/flashcards. */
export async function updateFlashcard({
  cardId,
  front,
  back,
}: {
  cardId: string;
  front?: string;
  back?: string;
}): Promise<ActionResult<{ data: { card: Flashcard } }>> {
  if (!cardId) return actionFail('cardId required');

  let user;
  let supabase;
  try {
    ({ user, supabase } = await requireUser());
  } catch (e) {
    if (e instanceof ApiError) return actionFail(e.message);
    throw e;
  }

  const patch: { front?: string; back?: string } = {};
  if (typeof front === 'string') {
    const t = front.trim();
    if (!t) return actionFail('Front cannot be empty');
    patch.front = t;
  }
  if (typeof back === 'string') {
    const t = back.trim();
    if (!t) return actionFail('Back cannot be empty');
    patch.back = t;
  }
  if (Object.keys(patch).length === 0) return actionFail('Nothing to update');

  if (!(await ownsCard(supabase, user.id, cardId))) {
    return actionFail('Card not found');
  }

  const { data: card, error } = await supabase
    .from('flashcards')
    .update(patch)
    .eq('id', cardId)
    .select('id, front, back, mastery, created_at, reviewed_at')
    .single();
  if (error) return actionFail(error.message);

  return actionOk({ card: card as Flashcard });
}

/** Delete a flashcard the caller owns. Mirrors
 *  DELETE /api/flashcards?card_id=. */
export async function deleteFlashcard({
  cardId,
}: {
  cardId: string;
}): Promise<ActionResult<{ data: { deletedId: string } }>> {
  if (!cardId) return actionFail('cardId required');

  let user;
  let supabase;
  try {
    ({ user, supabase } = await requireUser());
  } catch (e) {
    if (e instanceof ApiError) return actionFail(e.message);
    throw e;
  }

  if (!(await ownsCard(supabase, user.id, cardId))) {
    return actionFail('Card not found');
  }

  const { error } = await supabase
    .from('flashcards')
    .delete()
    .eq('id', cardId);
  if (error) return actionFail(error.message);

  return actionOk({ deletedId: cardId });
}

/** Update a flashcard's mastery (0..5) after a self-rating in
 *  the review flow. Stamps reviewed_at so the per-card "last
 *  reviewed" surface stays current. */
export async function rateFlashcard({
  cardId,
  mastery,
}: {
  cardId: string;
  mastery: number;
}): Promise<ActionResult<{ data: { card: Flashcard } }>> {
  if (!cardId) return actionFail('cardId required');
  if (!Number.isInteger(mastery) || mastery < 0 || mastery > 5) {
    return actionFail('mastery must be an integer 0..5');
  }

  let user;
  let supabase;
  try {
    ({ user, supabase } = await requireUser());
  } catch (e) {
    if (e instanceof ApiError) return actionFail(e.message);
    throw e;
  }

  if (!(await ownsCard(supabase, user.id, cardId))) {
    return actionFail('Card not found');
  }

  const { data: card, error } = await supabase
    .from('flashcards')
    .update({ mastery, reviewed_at: new Date().toISOString() })
    .eq('id', cardId)
    .select('id, front, back, mastery, created_at, reviewed_at')
    .single();
  if (error) return actionFail(error.message);

  return actionOk({ card: card as Flashcard });
}

/** Create a new (non-default) flashcard set under the caller. */
export async function createFlashcardSet({
  name,
}: {
  name: string;
}): Promise<ActionResult<{ data: { set: FlashcardSet } }>> {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return actionFail('Name is required');
  if (trimmed.length > 80) return actionFail('Name is too long (max 80 chars)');

  let user;
  let supabase;
  try {
    ({ user, supabase } = await requireUser());
  } catch (e) {
    if (e instanceof ApiError) return actionFail(e.message);
    throw e;
  }

  const { data, error } = await supabase
    .from('flashcard_sets')
    .insert({ user_id: user.id, name: trimmed, is_default: false })
    .select('id, name, is_default, created_at')
    .single();
  if (error) return actionFail(error.message);

  return actionOk({
    set: { ...(data as Omit<FlashcardSet, 'card_count'>), card_count: 0 },
  });
}
