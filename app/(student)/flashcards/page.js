// /flashcards landing → /notes/flashcards. The flashcards landing
// page moved under /notes when the note system was unified into
// three categories (notes, error log, flashcards). Per-set routes
// like /flashcards/[setId] and /flashcards/[setId]/review stay
// where they are so existing bookmarks survive — only the bare
// landing redirects.

import { redirect } from 'next/navigation';

export default function FlashcardsRedirect() {
  redirect('/notes/flashcards');
}
