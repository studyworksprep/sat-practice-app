import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api/auth';
import { legacyApiRoute } from '@/lib/api/response';

// GET /api/flashcards?set_id=xxx&page=1&page_size=25 — list cards in a set
//
// Paginated. If page/page_size are omitted, defaults are page=1,
// page_size=25. page_size is clamped to a max of 100 so a misbehaving
// client can't ask for 10,000 cards at once. Returns { cards, total,
// page, pageSize, hasMore } so the caller can render a paginator.
export const GET = legacyApiRoute(async (req) => {
  const { user, supabase } = await requireUser();

  const setId = req.nextUrl.searchParams.get('set_id');
  if (!setId) return NextResponse.json({ error: 'set_id required' }, { status: 400 });

  // Parse + clamp pagination params
  const rawPage = Number(req.nextUrl.searchParams.get('page'));
  const rawSize = Number(req.nextUrl.searchParams.get('page_size'));
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
  const pageSize = Number.isFinite(rawSize) && rawSize > 0
    ? Math.min(100, Math.floor(rawSize))
    : 25;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  // Verify ownership
  const { data: set } = await supabase
    .from('flashcard_sets')
    .select('id')
    .eq('id', setId)
    .eq('user_id', user.id)
    .single();
  if (!set) return NextResponse.json({ error: 'Set not found' }, { status: 404 });

  const { data: cards, error, count } = await supabase
    .from('flashcards')
    .select('id, front, back, mastery, created_at, reviewed_at', { count: 'exact' })
    .eq('set_id', setId)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const total = count ?? 0;
  return NextResponse.json({
    cards: cards || [],
    total,
    page,
    pageSize,
    hasMore: from + (cards?.length || 0) < total,
  });
});

// POST /api/flashcards — create a new flashcard
export const POST = legacyApiRoute(async (req) => {
  const { user, supabase } = await requireUser();

  const { set_id, front, back } = await req.json();
  if (!set_id || !front?.trim() || !back?.trim()) {
    return NextResponse.json({ error: 'set_id, front, and back are required' }, { status: 400 });
  }

  // Verify ownership
  const { data: set } = await supabase
    .from('flashcard_sets')
    .select('id')
    .eq('id', set_id)
    .eq('user_id', user.id)
    .single();
  if (!set) return NextResponse.json({ error: 'Set not found' }, { status: 404 });

  const { data, error } = await supabase
    .from('flashcards')
    .insert({ set_id, front: front.trim(), back: back.trim() })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ card: data });
});

// PATCH /api/flashcards — update mastery rating and/or front/back text
export const PATCH = legacyApiRoute(async (req) => {
  const { user, supabase } = await requireUser();

  const body = await req.json();
  const { card_id, mastery, front, back } = body;
  if (!card_id) {
    return NextResponse.json({ error: 'card_id required' }, { status: 400 });
  }

  // Build update payload
  const updates = {};
  if (mastery != null) {
    if (mastery < 0 || mastery > 5) return NextResponse.json({ error: 'mastery must be 0-5' }, { status: 400 });
    updates.mastery = mastery;
    updates.reviewed_at = new Date().toISOString();
  }
  if (front !== undefined) {
    if (!front?.trim()) return NextResponse.json({ error: 'front cannot be empty' }, { status: 400 });
    updates.front = front.trim();
  }
  if (back !== undefined) {
    if (!back?.trim()) return NextResponse.json({ error: 'back cannot be empty' }, { status: 400 });
    updates.back = back.trim();
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  // Verify ownership through set
  const { data: card } = await supabase
    .from('flashcards')
    .select('id, set_id')
    .eq('id', card_id)
    .single();
  if (!card) return NextResponse.json({ error: 'Card not found' }, { status: 404 });

  const { data: set } = await supabase
    .from('flashcard_sets')
    .select('id')
    .eq('id', card.set_id)
    .eq('user_id', user.id)
    .single();
  if (!set) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const { data: updated, error } = await supabase
    .from('flashcards')
    .update(updates)
    .eq('id', card_id)
    .select('id, front, back, mastery, created_at, reviewed_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, card: updated });
});

// DELETE /api/flashcards — delete a card
export const DELETE = legacyApiRoute(async (req) => {
  const { user, supabase } = await requireUser();

  const cardId = req.nextUrl.searchParams.get('card_id');
  if (!cardId) return NextResponse.json({ error: 'card_id required' }, { status: 400 });

  // Verify ownership
  const { data: card } = await supabase
    .from('flashcards')
    .select('id, set_id')
    .eq('id', cardId)
    .single();
  if (!card) return NextResponse.json({ error: 'Card not found' }, { status: 404 });

  const { data: set } = await supabase
    .from('flashcard_sets')
    .select('id')
    .eq('id', card.set_id)
    .eq('user_id', user.id)
    .single();
  if (!set) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const { error } = await supabase.from('flashcards').delete().eq('id', cardId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
});
