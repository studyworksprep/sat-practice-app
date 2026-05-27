// Tutor → lesson packs list. Sibling to /tutor/assignments. Same
// design-kit vocabulary as the assignments page (eyebrow + serif H1,
// stat tiles, sectioned list).
//
// Two surfaces on the page:
//
//   1. "New pack" form — name + optional description, posts to
//      createPack(); on success the server action redirects into
//      the builder so the tutor can immediately start adding
//      questions.
//
//   2. List of the tutor's existing packs — most-recently-edited
//      first, each row links into /tutor/lesson-packs/<id>. Per-row
//      delete button on the right.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { IconTile } from '@/lib/ui/IconTile';
import { InboxIcon } from '@/lib/ui/icons';
import { formatShortDate } from '@/lib/formatters';
import { NewPackForm } from './NewPackForm';
import { DeletePackButton } from './DeletePackButton';
import s from './LessonPacksList.module.css';

export const dynamic = 'force-dynamic';

export default async function TutorLessonPacksPage() {
  const { user, profile, supabase } = await requireUser();
  if (!['teacher', 'manager', 'admin'].includes(profile.role)) {
    redirect('/');
  }

  // Pull the packs + a count of questions per pack in two cheap
  // queries. The junction count is a single ranged select on
  // (pack_id) that we bucket client-side; one round-trip beats N+1.
  const { data: packs } = await supabase
    .from('lesson_packs')
    .select('id, name, description, created_at, updated_at')
    .eq('teacher_id', user.id)
    .order('updated_at', { ascending: false });

  const packIds = (packs ?? []).map((p) => p.id);
  const { data: junctionRows } = packIds.length
    ? await supabase
        .from('lesson_pack_questions')
        .select('pack_id')
        .in('pack_id', packIds)
    : { data: [] };

  const countByPack = new Map();
  for (const r of junctionRows ?? []) {
    countByPack.set(r.pack_id, (countByPack.get(r.pack_id) ?? 0) + 1);
  }

  const rows = (packs ?? []).map((p) => ({
    ...p,
    questionCount: countByPack.get(p.id) ?? 0,
  }));

  return (
    <main className={s.container}>
      <nav className={s.breadcrumb}>
        <Link href="/tutor/assignments">← Assignments</Link>
      </nav>

      <header className={s.header}>
        <div className={s.headerLeft}>
          <div className={s.eyebrow}>Tutor · Lesson packs</div>
          <h1 className={s.h1}>Your lesson packs</h1>
          <p className={s.sub}>
            Curate reusable question sets for your lessons. Each pack is private to you.
          </p>
        </div>
      </header>

      <NewPackForm />

      <section className={s.section}>
        <div className={s.sectionHead}>
          <h2 className={s.sectionTitle}>
            <IconTile icon={InboxIcon} palette="navy" size="md" />
            {rows.length === 0 ? 'No packs yet' : `${rows.length} pack${rows.length === 1 ? '' : 's'}`}
          </h2>
        </div>

        {rows.length === 0 ? (
          <div className={s.emptyCard}>
            <div className={s.emptyTitle}>Nothing here yet.</div>
            <div className={s.emptyBody}>
              Use the form above to create your first pack, then add questions to it.
            </div>
          </div>
        ) : (
          <ul className={s.cardList}>
            {rows.map((p) => (
              <li key={p.id} className={s.cardRow}>
                <Link href={`/tutor/lesson-packs/${p.id}`} className={s.packCard}>
                  <div className={s.packTop}>
                    <div className={s.packTitle}>{p.name}</div>
                    <span className={s.packCount}>
                      {p.questionCount} question{p.questionCount === 1 ? '' : 's'}
                    </span>
                  </div>
                  {p.description && <div className={s.packSub}>{p.description}</div>}
                  <div className={s.packMeta}>
                    Updated {formatShortDate(p.updated_at)} · Created {formatShortDate(p.created_at)}
                  </div>
                </Link>
                <DeletePackButton packId={p.id} packName={p.name} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
