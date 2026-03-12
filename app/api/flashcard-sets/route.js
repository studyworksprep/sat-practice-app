import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';
import { getSATVocabularyCards } from '../../../lib/satVocabulary';

const DEFAULT_SETS = ['My Math', 'My Reading', 'Common SAT Words'];
const SAT_WORDS_SUBSET_COUNT = 10;

// Ensure the three default sets exist for this user
// For "Common SAT Words", also ensure 10 sub-sets exist
async function ensureDefaults(supabase, userId) {
  const { data: existing } = await supabase
    .from('flashcard_sets')
    .select('id, name, parent_set_id')
    .eq('user_id', userId)
    .eq('is_default', true);

  const existingNames = new Set((existing || []).map(s => s.name));
  const missing = DEFAULT_SETS.filter(n => !existingNames.has(n));

  if (missing.length) {
    await supabase.from('flashcard_sets').insert(
      missing.map(name => ({ user_id: userId, name, is_default: true }))
    );
  }

  // Ensure "Common SAT Words" has 10 sub-sets
  const { data: allSets } = await supabase
    .from('flashcard_sets')
    .select('id, name, parent_set_id')
    .eq('user_id', userId)
    .eq('is_default', true);

  const satWordsParent = (allSets || []).find(s => s.name === 'Common SAT Words' && !s.parent_set_id);
  if (satWordsParent) {
    const childSets = (allSets || []).filter(s => s.parent_set_id === satWordsParent.id);
    if (childSets.length < SAT_WORDS_SUBSET_COUNT) {
      const existingNums = new Set(childSets.map(s => {
        const match = s.name.match(/Set (\d+)$/);
        return match ? parseInt(match[1]) : 0;
      }));
      const toCreate = [];
      for (let i = 1; i <= SAT_WORDS_SUBSET_COUNT; i++) {
        if (!existingNums.has(i)) {
          toCreate.push({
            user_id: userId,
            name: `Common SAT Words - Set ${i}`,
            is_default: true,
            parent_set_id: satWordsParent.id,
          });
        }
      }
      if (toCreate.length) {
        await supabase.from('flashcard_sets').insert(toCreate);
      }
    }

    // Auto-populate vocabulary cards into sub-sets if they're empty
    // Re-fetch children to include any just-created sets
    const { data: allChildren } = await supabase
      .from('flashcard_sets')
      .select('id, name')
      .eq('parent_set_id', satWordsParent.id)
      .order('name', { ascending: true });

    if (allChildren && allChildren.length > 0) {
      const childIds = allChildren.map(c => c.id);
      const { count: existingCards } = await supabase
        .from('flashcards')
        .select('id', { count: 'exact', head: true })
        .in('set_id', childIds);

      if (!existingCards || existingCards === 0) {
        // Seed vocabulary cards
        const cards = getSATVocabularyCards();
        const perSet = Math.ceil(cards.length / allChildren.length);

        for (let i = 0; i < allChildren.length; i++) {
          const subset = allChildren[i];
          const batch = cards.slice(i * perSet, Math.min((i + 1) * perSet, cards.length));
          if (batch.length === 0) continue;

          const rows = batch.map(c => ({
            set_id: subset.id,
            front: c.front,
            back: c.back,
          }));

          // Insert in batches of 100
          for (let j = 0; j < rows.length; j += 100) {
            await supabase.from('flashcards').insert(rows.slice(j, j + 100));
          }
        }
      }
    }
  }
}

// GET /api/flashcard-sets — list all sets with card counts and mastery averages
export async function GET() {
  const supabase = createClient();
  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr || !auth?.user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  await ensureDefaults(supabase, auth.user.id);

  const { data: sets, error } = await supabase
    .from('flashcard_sets')
    .select('id, name, is_default, parent_set_id, created_at')
    .eq('user_id', auth.user.id)
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

  // For parent sets, compute aggregate mastery across all children
  for (const s of setsWithData) {
    const children = setsWithData.filter(c => c.parent_set_id === s.id);
    if (children.length > 0) {
      const totalCards = children.reduce((sum, c) => sum + c.card_count, 0) + s.card_count;
      const totalMasterySum = children.reduce((sum, c) => {
        const cCount = countMap[c.id] || 0;
        return sum + (masterySum[c.id] || 0);
      }, masterySum[s.id] || 0);
      s.total_card_count = totalCards;
      s.total_avg_mastery = totalCards > 0 ? Math.round((totalMasterySum / (totalCards * 5)) * 100) : null;
    }
  }

  return NextResponse.json({ sets: setsWithData });
}

// POST /api/flashcard-sets — create a new custom set
export async function POST(req) {
  const supabase = createClient();
  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr || !auth?.user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { name, parent_set_id } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

  const insertData = { user_id: auth.user.id, name: name.trim(), is_default: false };
  if (parent_set_id) insertData.parent_set_id = parent_set_id;

  const { data, error } = await supabase
    .from('flashcard_sets')
    .insert(insertData)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ set: data });
}
