// Admin · Concept tags — catalog management for the freeform concept-
// tag vocabulary. The per-question chip strip (lib/practice/
// ConceptTags.jsx) lets managers add/remove tags one question at a
// time; this page is where an admin curates the catalog itself:
// rename a tag everywhere, delete strays, and merge duplicates that
// tag the same concept. Replaces the tag tab of the legacy
// AdminDashboard, which was the last home of these operations.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { fetchAll } from '@/lib/supabase/fetchAll';
import a from '../../admin.module.css';
import { ConceptTagsManager, type TagRow } from './ConceptTagsManager';

export const dynamic = 'force-dynamic';

export default async function AdminConceptTagsPage() {
  const { profile, supabase } = await requireUser();

  if (profile.role !== 'admin') {
    if (profile.role === 'teacher' || profile.role === 'manager') redirect('/tutor/dashboard');
    if (profile.role === 'student') redirect('/dashboard');
    redirect('/');
  }

  const [tagRows, linkRows] = await Promise.all([
    fetchAll(async (from, to) =>
      supabase
        .from('concept_tags')
        .select('id, name, created_at, updated_at')
        .order('name', { ascending: true })
        .range(from, to),
    ),
    fetchAll(async (from, to) =>
      supabase
        .from('question_concept_tags')
        .select('tag_id')
        .range(from, to),
    ),
  ]);

  const counts = new Map<string, number>();
  for (const link of linkRows) {
    counts.set(link.tag_id, (counts.get(link.tag_id) ?? 0) + 1);
  }

  const tags: TagRow[] = tagRows.map((t) => ({
    ...t,
    questionCount: counts.get(t.id) ?? 0,
  }));

  return (
    <main className={a.container}>
      <nav className={a.breadcrumb}>
        <Link href="/admin">← Admin</Link>
      </nav>

      <header className={a.header}>
        <div className={a.eyebrow}>Admin · Questions</div>
        <h1 className={a.h1}>Concept tags</h1>
        <p className={a.sub}>
          {tags.length.toLocaleString()} tags across{' '}
          {linkRows.length.toLocaleString()} question links. Rename a tag
          everywhere it appears, delete strays, or merge two tags that
          cover the same concept.
        </p>
      </header>

      <section className={a.section}>
        <ConceptTagsManager tags={tags} />
      </section>
    </main>
  );
}
