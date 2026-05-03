// Review → Notes. Long-scrolling study view of every saved note.
// Same Subject / Domain / Skill sidebar + search box as the
// /notes manage page, but each entry renders the full note body
// inline (not a 200-char preview) and there's no edit / delete
// chrome — this surface is for re-reading, not editing.
//
// Filtering is server-driven via querystring: ?search, ?tag,
// ?subject, ?domain, ?skill. The client island re-uses the
// existing filter sidebar from the manage page so the two views
// behave identically when narrowing.

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requireUser } from '@/lib/api/auth';
import { loadNotesForReview } from '@/app/next/(student)/notes/loaders';
import { NotesReviewInteractive } from './NotesReviewInteractive';
import s from './ReviewNotes.module.css';

export const dynamic = 'force-dynamic';

export default async function ReviewNotesPage({ searchParams }) {
  const { profile, supabase } = await requireUser();

  if (profile.role === 'admin') redirect('/admin');
  if (profile.role === 'teacher' || profile.role === 'manager') redirect('/tutor/dashboard');
  if (profile.role === 'practice') redirect('/subscribe');

  const sp = (await searchParams) ?? {};
  const search  = typeof sp.search  === 'string' ? sp.search  : null;
  const tag     = typeof sp.tag     === 'string' ? sp.tag     : null;
  const subject = typeof sp.subject === 'string' ? sp.subject : null;
  const domain  = typeof sp.domain  === 'string' ? sp.domain  : null;
  const skill   = typeof sp.skill   === 'string' ? sp.skill   : null;

  const { notes, allTags, facets } = await loadNotesForReview(supabase, {
    search, tag, subject, domain, skill,
  });

  return (
    <main className={s.page}>
      <header className={s.pageHeader}>
        <Link href="/review" className={s.backLink}>← Back to Review</Link>
        <h1 className={s.pageTitle}>Review notes</h1>
        <p className={s.pageSubtitle}>
          Re-read everything you&apos;ve saved. Filter by subject,
          domain, or skill on the left; search by tag or text up top.
        </p>
      </header>

      <NotesReviewInteractive
        initialNotes={notes}
        allTags={allTags}
        facets={facets}
        initialSearch={search ?? ''}
        initialTag={tag ?? ''}
        initialSubject={subject ?? ''}
        initialDomain={domain ?? ''}
        initialSkill={skill ?? ''}
      />
    </main>
  );
}
