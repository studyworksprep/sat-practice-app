// Admin · Import JSON into an existing lesson.
//
// Lets an admin paste a LessonTemplateSpec and replace or append this
// lesson's blocks, using the same compiler/validator as everything else.

import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { ImportIntoLessonClient } from './ImportIntoLessonClient';
import a from '../../../../admin.module.css';

export const dynamic = 'force-dynamic';

export default async function AdminLessonImportPage({ params }) {
  const { lessonId } = await params;

  const { profile, supabase } = await requireUser();
  if (profile.role !== 'admin') {
    if (profile.role === 'teacher' || profile.role === 'manager') redirect('/tutor/dashboard');
    if (profile.role === 'student') redirect('/dashboard');
    redirect('/');
  }

  const [{ data: lesson }, { data: blocks }] = await Promise.all([
    supabase.from('lessons').select('id, title').eq('id', lessonId).maybeSingle(),
    supabase.from('lesson_blocks').select('id').eq('lesson_id', lessonId),
  ]);

  if (!lesson) notFound();

  return (
    <main className={a.container}>
      <nav className={a.breadcrumb}>
        <a href={`/admin/lessons/${lesson.id}`}>← Editor</a>
      </nav>

      <header className={a.header}>
        <div className={a.eyebrow}>Admin · Import JSON</div>
        <h1 className={a.h1}>{lesson.title || 'Untitled lesson'}</h1>
        <p className={a.sub}>
          Paste a LessonTemplateSpec to replace or append this lesson&rsquo;s blocks.
          The document is re-validated on the server before anything is written.
        </p>
      </header>

      <section className={a.section}>
        <ImportIntoLessonClient lessonId={lesson.id} currentBlockCount={(blocks ?? []).length} />
      </section>
    </main>
  );
}
