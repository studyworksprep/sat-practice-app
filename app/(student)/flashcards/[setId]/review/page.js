// Flashcards review flow — full-page review session for one
// set. Server pre-loads every card in the set; the client island
// owns the pick / flip / self-rate state.
//
// Selection is due-date-first (§3.1 spaced repetition): cards whose
// review_queue schedule says they're due come up first, oldest due
// first. Cards with no due entry fall back to the legacy weighted-
// random pick (weight = 6 - mastery), which also covers never-rated
// cards — a card enters the schedule the first time it's rated.
//
// URL: /flashcards/[setId]/review

import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { FlashcardReviewInteractive } from './FlashcardReviewInteractive';

export const dynamic = 'force-dynamic';

export default async function FlashcardReviewPage({ params }) {
  const { setId } = await params;
  const { user, profile, supabase } = await requireUser();

  if (profile.role === 'practice') redirect('/subscribe');

  const { data: set } = await supabase
    .from('flashcard_sets')
    .select('id, name')
    .eq('id', setId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!set) notFound();

  // Pull the entire set up front. Even with a generous 500-card
  // library this is well under 100 KB; running the picker
  // client-side avoids a per-card round trip on every "next".
  const { data: cards } = await supabase
    .from('flashcards')
    .select('id, front, back, mastery')
    .eq('set_id', setId);

  // Due schedule for this set's cards (§3.1) — the client shows due
  // cards first, oldest due first. item_ref is text, so compare
  // against stringified card ids.
  const cardIds = (cards ?? []).map((c) => String(c.id));
  let dueCardIds = [];
  if (cardIds.length > 0) {
    const { data: queueRows } = await supabase
      .from('review_queue')
      .select('item_ref, due_at')
      .eq('student_id', user.id)
      .eq('item_type', 'flashcard')
      .in('item_ref', cardIds)
      .lte('due_at', new Date().toISOString())
      .order('due_at', { ascending: true });
    dueCardIds = (queueRows ?? []).map((r) => r.item_ref);
  }

  return (
    <FlashcardReviewInteractive
      setId={set.id}
      setName={set.name}
      initialCards={cards ?? []}
      dueCardIds={dueCardIds}
    />
  );
}
