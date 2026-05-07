// Admin · Lesson preview.
//
// Renders the lesson the same way a student will see it, using
// the shared LessonSlideshow runtime, but without writing to
// lesson_progress and without exposing the practice-runner deep
// link on question_link blocks. Side effects are intentionally
// omitted: progress lives in client memory only, so admins can
// step through a lesson, branch on knowledge checks, and verify
// Desmos validation behaves correctly without leaving artefacts
// in the database.

import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { LessonSlideshow } from '@/lib/ui/LessonSlideshow';
import a from '../../../../admin.module.css';

export const dynamic = 'force-dynamic';

export default async function AdminLessonPreviewPage({ params, searchParams }) {
  const { lessonId } = await params;
  const sp = (await searchParams) ?? {};
  const debug = sp.debug === '1';

  const { profile, supabase } = await requireUser();

  if (profile.role !== 'admin') {
    if (profile.role === 'teacher' || profile.role === 'manager') redirect('/tutor/dashboard');
    if (profile.role === 'student') redirect('/dashboard');
    redirect('/');
  }

  const [{ data: lesson }, { data: blocks }] = await Promise.all([
    supabase
      .from('lessons')
      .select('id, title, description, status, visibility')
      .eq('id', lessonId)
      .maybeSingle(),
    supabase
      .from('lesson_blocks')
      .select('id, sort_order, block_type, content')
      .eq('lesson_id', lessonId)
      .order('sort_order'),
  ]);

  if (!lesson) notFound();

  return (
    <main className={a.container}>
      <nav className={a.breadcrumb}>
        <a href={`/admin/lessons/${lessonId}`}>← Editor</a>
      </nav>

      <header className={a.header}>
        <div className={a.eyebrow}>Admin · Preview</div>
        <h1 className={a.h1}>{lesson.title || 'Untitled lesson'}</h1>
        <p className={a.sub}>
          Read-only playthrough. Progress is held in memory only; nothing
          is written to <code>lesson_progress</code>.{' '}
          {debug ? (
            <a href={`/admin/lessons/${lessonId}/preview`} className={a.link}>
              Hide debug
            </a>
          ) : (
            <a
              href={`/admin/lessons/${lessonId}/preview?debug=1`}
              className={a.link}
            >
              Show debug
            </a>
          )}
        </p>
      </header>

      <section className={a.section}>
        <LessonSlideshow
          blocks={blocks ?? []}
          questionLinkHref={null}
          showCompleteButton={false}
          debugMode={debug}
        />
      </section>
    </main>
  );
}
