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

const DEFAULT_SETS = ['My Math', 'My Reading'];
const MAX_PAGE_SIZE = 100;

/**
 * Ensure the student has the default "My Math" / "My Reading"
 * sets. Idempotent — only inserts the missing ones.
 */
async function ensureDefaults(supabase, userId) {
  const { data: existing } = await supabase
    .from('flashcard_sets')
    .select('id, name')
    .eq('user_id', userId)
    .eq('is_default', true);

  const existingNames = new Set((existing ?? []).map((s) => s.name));
  const missing = DEFAULT_SETS.filter((n) => !existingNames.has(n));

  if (missing.length === 0) return;
  await supabase.from('flashcard_sets').insert(
    missing.map((name) => ({ user_id: userId, name, is_default: true })),
  );
}

/**
 * List the caller's flashcard sets with per-set card counts.
 * Mirrors GET /api/flashcard-sets but skips avg_mastery (the modal
 * doesn't display it — that's a /flashcards page feature).
 */
export async function listFlashcardSets() {
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

  const setIds = (sets ?? []).map((s) => s.id);
  const counts = {};
  if (setIds.length > 0) {
    const { data: cards } = await supabase
      .from('flashcards')
      .select('set_id')
      .in('set_id', setIds);
    for (const c of cards ?? []) {
      counts[c.set_id] = (counts[c.set_id] ?? 0) + 1;
    }
  }

  return actionOk({
    sets: (sets ?? []).map((s) => ({ ...s, card_count: counts[s.id] ?? 0 })),
  });
}

/**
 * List a page of cards in a set the caller owns. Mirrors
 * GET /api/flashcards?set_id&page&page_size.
 *
 * @param {object} args
 * @param {string} args.setId
 * @param {number} [args.page=1]
 * @param {number} [args.pageSize=25]
 */
export async function listFlashcards({ setId, page = 1, pageSize = 25 }) {
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
  const safeSize = Number.isFinite(pageSize) && pageSize > 0
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
    cards: cards ?? [],
    total: count ?? 0,
    page: safePage,
    pageSize: safeSize,
  });
}

/**
 * Create a flashcard in a set the caller owns. Mirrors
 * POST /api/flashcards.
 *
 * @param {object} args
 * @param {string} args.setId
 * @param {string} args.front
 * @param {string} args.back
 */
export async function createFlashcard({ setId, front, back }) {
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

  return actionOk({ card });
}
