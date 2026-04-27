import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api/auth';
import { legacyApiRoute } from '@/lib/api/response';

// GET /api/sat-vocabulary?set_number=1 — list vocabulary cards for a set, with user progress
export const GET = legacyApiRoute(async (req) => {
  const { user, supabase } = await requireUser();

  const setNumber = req.nextUrl.searchParams.get('set_number');

  if (setNumber) {
    // Fetch cards for a specific set with user's progress
    const { data: cards, error } = await supabase
      .from('sat_vocabulary')
      .select('id, word, definition, example')
      .eq('set_number', parseInt(setNumber))
      .order('word', { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    // Get user's progress for these cards
    const cardIds = (cards || []).map(c => c.id);
    let progressMap = {};
    if (cardIds.length) {
      const { data: progress } = await supabase
        .from('sat_vocabulary_progress')
        .select('vocabulary_id, mastery, last_reviewed_at')
        .eq('user_id', user.id)
        .in('vocabulary_id', cardIds);
      for (const p of (progress || [])) {
        progressMap[p.vocabulary_id] = p;
      }
    }

    const cardsWithProgress = (cards || []).map(c => ({
      id: c.id,
      front: `**${c.word}**`,
      back: c.definition + (c.example ? `\n\n*${c.example}*` : ''),
      mastery: progressMap[c.id]?.mastery || 0,
      reviewed_at: progressMap[c.id]?.last_reviewed_at || null,
    }));

    return NextResponse.json({ cards: cardsWithProgress });
  }

  // No set_number: return summary of all 10 sets (card counts + avg mastery)
  const { data: allCards, error } = await supabase
    .from('sat_vocabulary')
    .select('id, set_number');

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Get all user progress
  const allIds = (allCards || []).map(c => c.id);
  let progressMap = {};
  if (allIds.length) {
    const { data: progress } = await supabase
      .from('sat_vocabulary_progress')
      .select('vocabulary_id, mastery')
      .eq('user_id', user.id)
      .in('vocabulary_id', allIds);
    for (const p of (progress || [])) {
      progressMap[p.vocabulary_id] = p.mastery;
    }
  }

  // Build per-set summaries
  const setMap = {};
  for (let i = 1; i <= 10; i++) {
    setMap[i] = { set_number: i, card_count: 0, mastery_sum: 0, reviewed_count: 0 };
  }
  for (const c of (allCards || [])) {
    const s = setMap[c.set_number];
    if (!s) continue;
    s.card_count++;
    if (progressMap[c.id] !== undefined) {
      s.mastery_sum += progressMap[c.id];
      s.reviewed_count++;
    }
  }

  const sets = Object.values(setMap).map(s => ({
    set_number: s.set_number,
    name: `Common SAT Words - Set ${s.set_number}`,
    card_count: s.card_count,
    avg_mastery: s.card_count > 0
      ? Math.round((s.mastery_sum / (s.card_count * 5)) * 100)
      : null,
  }));

  const totalCards = sets.reduce((sum, s) => sum + s.card_count, 0);
  const totalMasterySum = Object.values(setMap).reduce((sum, s) => sum + s.mastery_sum, 0);
  const totalAvgMastery = totalCards > 0
    ? Math.round((totalMasterySum / (totalCards * 5)) * 100)
    : null;

  return NextResponse.json({ sets, totalCards, totalAvgMastery });
});

// PATCH /api/sat-vocabulary — update mastery for a vocabulary card
export const PATCH = legacyApiRoute(async (req) => {
  const { user, supabase } = await requireUser();

  const { vocabulary_id, mastery } = await req.json();
  if (!vocabulary_id || mastery == null || mastery < 0 || mastery > 5) {
    return NextResponse.json({ error: 'vocabulary_id and mastery (0-5) required' }, { status: 400 });
  }

  const { error } = await supabase
    .from('sat_vocabulary_progress')
    .upsert({
      user_id: user.id,
      vocabulary_id,
      mastery,
      last_reviewed_at: new Date().toISOString(),
    }, { onConflict: 'user_id,vocabulary_id' });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
});
