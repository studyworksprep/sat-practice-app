// Per-set flashcards page — full list of cards in the set with
// search, sort, edit, delete, and inline "+ Add card" form.
//
// URL: /flashcards/[setId]
//
// Data is loaded server-side (full set, no pagination — typical
// libraries are well under 500 cards) and handed to a client
// island that owns the table state. Editing / deleting goes
// through Server Actions; the island optimistically updates its
// own list so the UI doesn't flicker on every action.

import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { ensureDefaultSets } from '@/lib/practice/flashcards-helpers';
import { FlashcardSetInteractive } from './FlashcardSetInteractive';

export const dynamic = 'force-dynamic';

export default async function FlashcardSetPage({ params }) {
  const { setId } = await params;
  const { user, profile, supabase } = await requireUser();

  if (profile.role === 'practice') redirect('/subscribe');

  // Idempotent — keeps the default-set guarantee even if the user
  // landed here via a deep link before visiting /flashcards.
  await ensureDefaultSets(supabase, user.id);

  const { data: set } = await supabase
    .from('flashcard_sets')
    .select('id, name, is_default, created_at')
    .eq('id', setId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!set) notFound();

  const { data: cards } = await supabase
    .from('flashcards')
    .select('id, front, back, mastery, created_at, reviewed_at')
    .eq('set_id', setId)
    .order('created_at', { ascending: false });

  return (
    <FlashcardSetInteractive
      set={set}
      initialCards={cards ?? []}
    />
  );
}
