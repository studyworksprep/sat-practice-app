import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api/auth';
import { legacyApiRoute } from '@/lib/api/response';

const DEFAULT_SETS = ['My Math', 'My Reading'];

// Ensure the default user-created sets exist
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

// GET /api/flashcard-sets — list all user-created sets with card counts and mastery averages
export const GET = legacyApiRoute(async () => {
  const { user, supabase } = await requireUser();

  await ensureDefaults(supabase, user.id);

  const { data: sets, error } = await supabase
    .from('flashcard_sets')
    .select('id, name, is_default, parent_set_id, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Get card counts and mastery sums per set
  const setIds = sets.map(s => s.id);
  let countMap = {};
  let masterySum = {};
  if (setIds.length) {
    const { data: cards } = await supabase
      .from('flashcards')
      .select('set_id, mastery')
      .in('set_id', setIds);
    for (const c of (cards || [])) {
      countMap[c.set_id] = (countMap[c.set_id] || 0) + 1;
      masterySum[c.set_id] = (masterySum[c.set_id] || 0) + (c.mastery || 0);
    }
  }

  // Build response: compute avg_mastery (0-5 scale → percentage 0-100)
  const setsWithData = sets.map(s => {
    const count = countMap[s.id] || 0;
    const sum = masterySum[s.id] || 0;
    const avg_mastery = count > 0 ? Math.round((sum / (count * 5)) * 100) : null;
    return { ...s, card_count: count, avg_mastery };
  });

  return NextResponse.json({ sets: setsWithData });
});

// POST /api/flashcard-sets — create a new custom set
export const POST = legacyApiRoute(async (req) => {
  const { user, supabase } = await requireUser();

  const { name, parent_set_id } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

  const insertData = { user_id: user.id, name: name.trim(), is_default: false };
  if (parent_set_id) insertData.parent_set_id = parent_set_id;

  const { data, error } = await supabase
    .from('flashcard_sets')
    .insert(insertData)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ set: data });
});
