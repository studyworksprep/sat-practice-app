import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';

const DEFAULT_SETS = ['My Math', 'My Reading', 'Common SAT Words'];

// Ensure the three default sets exist for this user
async function ensureDefaults(supabase, userId) {
  const { data: existing } = await supabase
    .from('flashcard_sets')
    .select('id, name')
    .eq('user_id', userId)
    .eq('is_default', true);

  const existingNames = new Set((existing || []).map(s => s.name));
  const missing = DEFAULT_SETS.filter(n => !existingNames.has(n));

  if (missing.length) {
    await supabase.from('flashcard_sets').insert(
      missing.map(name => ({ user_id: userId, name, is_default: true }))
    );
  }
}

// GET /api/flashcard-sets — list all sets with card counts
export async function GET() {
  const supabase = createClient();
  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr || !auth?.user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  await ensureDefaults(supabase, auth.user.id);

  const { data: sets, error } = await supabase
    .from('flashcard_sets')
    .select('id, name, is_default, created_at')
    .eq('user_id', auth.user.id)
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Get card counts per set
  const setIds = sets.map(s => s.id);
  let countMap = {};
  if (setIds.length) {
    const { data: cards } = await supabase
      .from('flashcards')
      .select('set_id')
      .in('set_id', setIds);
    for (const c of (cards || [])) {
      countMap[c.set_id] = (countMap[c.set_id] || 0) + 1;
    }
  }

  return NextResponse.json({
    sets: sets.map(s => ({ ...s, card_count: countMap[s.id] || 0 })),
  });
}

// POST /api/flashcard-sets — create a new custom set
export async function POST(req) {
  const supabase = createClient();
  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr || !auth?.user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { name } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

  const { data, error } = await supabase
    .from('flashcard_sets')
    .insert({ user_id: auth.user.id, name: name.trim(), is_default: false })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ set: data });
}
