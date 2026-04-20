import { NextResponse } from 'next/server';
import { createClient } from '../../../../lib/supabase/server';

// GET /api/flashcards/next?set_id=xxx&exclude_id=yyy
// Returns a single card, weighted inversely by mastery (lower mastery = more likely).
// exclude_id prevents showing the same card twice in a row.
export async function GET(req) {
  const supabase = await createClient();
  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr || !auth?.user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const setId = req.nextUrl.searchParams.get('set_id');
  const excludeId = req.nextUrl.searchParams.get('exclude_id');
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
    .select('id, front, back, mastery')
    .eq('set_id', setId);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!cards?.length) return NextResponse.json({ card: null });

  // Filter out excluded card (unless it's the only one)
  let pool = cards.length > 1 && excludeId
    ? cards.filter(c => c.id !== excludeId)
    : cards;

  // Weighted random: weight = 6 - mastery (mastery 0 → weight 6, mastery 5 → weight 1)
  const totalWeight = pool.reduce((sum, c) => sum + (6 - c.mastery), 0);
  let r = Math.random() * totalWeight;
  let chosen = pool[0];
  for (const card of pool) {
    r -= (6 - card.mastery);
    if (r <= 0) { chosen = card; break; }
  }

  return NextResponse.json({ card: chosen });
}
