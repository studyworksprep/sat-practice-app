// Single-note view + editor. Server Component — loads the note via
// the request-scoped supabase client (RLS handles ownership), then
// hands it to the client island that mounts the TipTap editor.
//
// The "/notes/new" path is handled by this same route via a
// reserved id. The dynamic param matches anything; we branch on
// id === 'new' before hitting the database.

import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { loadNote } from '../loaders';
import { createNote, updateNote, deleteNote } from '../actions';
import { NoteDetailInteractive } from './NoteDetailInteractive';
import { EMPTY_DOC } from '@/lib/notes/render';

export const dynamic = 'force-dynamic';

export default async function NoteDetailPage({ params }) {
  const { profile, supabase } = await requireUser();

  if (profile.role === 'admin') redirect('/admin');
  if (profile.role === 'teacher' || profile.role === 'manager') redirect('/tutor/dashboard');
  if (profile.role === 'practice') redirect('/subscribe');

  const { id } = await params;

  if (id === 'new') {
    return (
      <NoteDetailInteractive
        mode="new"
        initialNote={{
          id: '',
          userId: '',
          questionId: null,
          title: null,
          bodyJson: EMPTY_DOC,
          bodyText: '',
          tags: [],
          createdAt: '',
          updatedAt: '',
        }}
        createNoteAction={createNote}
        updateNoteAction={updateNote}
        deleteNoteAction={deleteNote}
      />
    );
  }

  const note = await loadNote(supabase, id);
  if (!note) notFound();

  return (
    <NoteDetailInteractive
      mode="edit"
      initialNote={note}
      createNoteAction={createNote}
      updateNoteAction={updateNote}
      deleteNoteAction={deleteNote}
    />
  );
}
