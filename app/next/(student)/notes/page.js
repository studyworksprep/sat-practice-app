// Student notes index. Server Component — pre-loads the caller's
// notes (filtered by optional ?search and ?tag query params) and
// hands them to the client island that owns the search box, the tag
// filter chips, and the per-note delete confirmation.
//
// New-note creation is a separate route (/notes/new) that mounts the
// editor with an empty doc. The "+ New note" button is a plain link.

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requireUser } from '@/lib/api/auth';
import { loadNotesIndex } from './loaders';
import { NotesListInteractive } from './NotesListInteractive';
import { NotesNav } from './NotesNav';
import { deleteNote } from './actions';
import { HelpButton } from '../help/HelpButton';
import s from './Notes.module.css';

export const dynamic = 'force-dynamic';

export default async function StudentNotesIndex({ searchParams }) {
  const { profile, supabase } = await requireUser();

  if (profile.role === 'admin') redirect('/admin');
  if (profile.role === 'teacher' || profile.role === 'manager') redirect('/tutor/dashboard');
  if (profile.role === 'practice') redirect('/subscribe');

  const sp = (await searchParams) ?? {};
  const search = typeof sp.search === 'string' ? sp.search : null;
  const tag = typeof sp.tag === 'string' ? sp.tag : null;
  const subject = typeof sp.subject === 'string' ? sp.subject : null;
  const domain = typeof sp.domain === 'string' ? sp.domain : null;
  const skill = typeof sp.skill === 'string' ? sp.skill : null;

  const { notes, allTags, facets } = await loadNotesIndex(supabase, {
    search,
    tag,
    subject,
    domain,
    skill,
  });

  return (
    <main className={s.page}>
      <NotesNav />
      <header className={s.pageHeader}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 className={s.pageTitle}>My notes</h1>
            <HelpButton slug="notes" />
          </div>
          <p className={s.pageSubtitle}>
            Private to you. Nothing here is shared with tutors or other students.
          </p>
        </div>
        <Link href="/notes/new" className={s.btnPrimary}>
          + New note
        </Link>
      </header>

      <NotesListInteractive
        initialNotes={notes}
        allTags={allTags}
        facets={facets}
        initialSearch={search ?? ''}
        initialTag={tag ?? ''}
        initialSubject={subject ?? ''}
        initialDomain={domain ?? ''}
        initialSkill={skill ?? ''}
        deleteNoteAction={deleteNote}
      />
    </main>
  );
}
