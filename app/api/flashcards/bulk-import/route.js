import { NextResponse } from 'next/server';
import { createClient } from '../../../../lib/supabase/server';

// POST /api/flashcards/bulk-import
// Body: { cards: [{ front, back }], set_id }
// Inserts multiple flashcards into a set at once
export async function POST(req) {
  const supabase = await createClient();
  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr || !auth?.user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { cards, set_id } = await req.json();
  if (!set_id) return NextResponse.json({ error: 'set_id required' }, { status: 400 });
  if (!Array.isArray(cards) || cards.length === 0) {
    return NextResponse.json({ error: 'cards array required and must not be empty' }, { status: 400 });
  }

  // Verify ownership
  const { data: set } = await supabase
    .from('flashcard_sets')
    .select('id')
    .eq('id', set_id)
    .eq('user_id', auth.user.id)
    .single();
  if (!set) return NextResponse.json({ error: 'Set not found' }, { status: 404 });

  // Prepare and insert cards
  const rows = cards.map(c => ({
    set_id,
    front: (c.front || '').trim(),
    back: (c.back || '').trim(),
  })).filter(c => c.front && c.back);

  if (rows.length === 0) {
    return NextResponse.json({ error: 'No valid cards to import' }, { status: 400 });
  }

  // Insert in batches of 100 to avoid payload limits
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    const { error } = await supabase.from('flashcards').insert(batch);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    inserted += batch.length;
  }

  return NextResponse.json({ ok: true, inserted });
}
