import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';

// GET /api/flashcards?set_id=xxx — list cards in a set
export async function GET(req) {
  const supabase = createClient();
  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr || !auth?.user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const setId = req.nextUrl.searchParams.get('set_id');
  if (!setId) return NextResponse.json({ error: 'set_id required' }, { status: 400 });

  // Verify ownership
  const { data: set } = await supabase
    .from('flashcard_sets')
    .select('id')
    .eq('id', setId)
    .eq('user_id', auth.user.id)
    .single();
  if (!set) return NextResponse.json({ error: 'Set not found' }, { status: 404 });

  const { data: cards, error } = await supabase
    .from('flashcards')
    .select('id, front, back, mastery, created_at, reviewed_at')
    .eq('set_id', setId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ cards: cards || [] });
}

// POST /api/flashcards — create a new flashcard
export async function POST(req) {
  const supabase = createClient();
  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr || !auth?.user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { set_id, front, back } = await req.json();
  if (!set_id || !front?.trim() || !back?.trim()) {
    return NextResponse.json({ error: 'set_id, front, and back are required' }, { status: 400 });
  }

  // Verify ownership
  const { data: set } = await supabase
    .from('flashcard_sets')
    .select('id')
    .eq('id', set_id)
    .eq('user_id', auth.user.id)
    .single();
  if (!set) return NextResponse.json({ error: 'Set not found' }, { status: 404 });

  const { data, error } = await supabase
    .from('flashcards')
    .insert({ set_id, front: front.trim(), back: back.trim() })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ card: data });
}

// PATCH /api/flashcards — update mastery rating and/or front/back text
export async function PATCH(req) {
  const supabase = createClient();
  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr || !auth?.user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

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
    .eq('user_id', auth.user.id)
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
}

// DELETE /api/flashcards — delete a card
export async function DELETE(req) {
  const supabase = createClient();
  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr || !auth?.user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

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
    .eq('user_id', auth.user.id)
    .single();
  if (!set) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const { error } = await supabase.from('flashcards').delete().eq('id', cardId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
