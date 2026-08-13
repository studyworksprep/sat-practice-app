import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { LessonSlideshow } from '@/lib/ui/LessonSlideshow';
import a from '@/app/(admin)/admin.module.css';

export const dynamic = 'force-dynamic';

export default async function TutorLessonPreviewPage({ params }) {
  const { lessonId } = await params;
  const { profile, supabase } = await requireUser();
  if (profile.role === 'admin') redirect(`/admin/lessons/${lessonId}/preview`);
  if (!['teacher', 'manager'].includes(profile.role)) redirect('/dashboard');

  const [{ data: lesson }, { data: blocks }] = await Promise.all([
    supabase
      .from('lessons')
      .select('id, title, description')
      .eq('id', lessonId)
      .eq('status', 'published')
      .eq('visibility', 'shared')
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
      <nav className={a.breadcrumb}><Link href="/tutor/lessons">← Lesson library</Link></nav>
      <header className={a.header}>
        <div className={a.eyebrow}>Tutor preview · Published lesson</div>
        <h1 className={a.h1}>{lesson.title}</h1>
        <p className={a.sub}>
          Read-only student-style preview. This does not write lesson progress.
        </p>
      </header>
      <LessonSlideshow
        blocks={blocks ?? []}
        questionLinkHref={null}
        showCompleteButton={false}
        calculatorStoragePrefix={`tutor-lesson-preview:${lessonId}`}
      />
    </main>
  );
}
