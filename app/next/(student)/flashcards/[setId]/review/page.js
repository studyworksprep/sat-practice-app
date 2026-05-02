// Flashcards review flow — full-page review session for one
// set. Server pre-loads every card in the set; the client island
// owns the random-pick / flip / self-rate state.
//
// Random selection is weighted by mastery: weight = 6 - mastery,
// so a never-rated card (mastery 0) is six times as likely as a
// fully-mastered card (mastery 5). Same algorithm the legacy
// /review page used; kept here verbatim so users get the same
// pacing they're used to.
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
  // library this is well under 100 KB; running the weighted picker
  // client-side avoids a per-card round trip on every "next".
  const { data: cards } = await supabase
    .from('flashcards')
    .select('id, front, back, mastery')
    .eq('set_id', setId);

  return (
    <FlashcardReviewInteractive
      setId={set.id}
      setName={set.name}
      initialCards={cards ?? []}
    />
  );
}
