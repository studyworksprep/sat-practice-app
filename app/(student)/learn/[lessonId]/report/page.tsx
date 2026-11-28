import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { formatDate } from '@/lib/formatters';
import { buildCheckReview } from '@/lib/lesson/check-review.mjs';
import { lessonHasPracticeQuestions } from '@/lib/lesson/practice-drill';
import { resolveLessonProgress } from '@/lib/lesson/progress-report.mjs';
import { LessonCheckReview } from '@/lib/ui/LessonCheckReview';
import { LessonPracticeButton } from '../LessonPracticeButton';
import { createLessonPracticeDrill } from '../actions';
import s from '../../Learn.module.css';

export default async function LessonReportPage({ params, searchParams }: {
  params: Promise<{lessonId: string}>;
  searchParams: Promise<{view?: string}>;
}) {
  const { lessonId } = await params;
  const { view } = await searchParams;
  const { supabase, user } = await requireUser();
  const [lesson, progress, blocks, canPractice] = await Promise.all([
    supabase.from('lessons').select('title').eq('id', lessonId).maybeSingle(),
    supabase.from('lesson_progress').select('completed_at, completed_blocks, check_answers')
      .eq('lesson_id', lessonId).eq('student_id', user.id).maybeSingle(),
    supabase.from('lesson_blocks').select('id, block_type, content').eq('lesson_id', lessonId).order('sort_order'),
    lessonHasPracticeQuestions(supabase, lessonId),
  ]);
  for (const result of [lesson, progress, blocks]) if (result.error) throw new Error(result.error.message);
  if (!lesson.data) notFound();
  const work = progress.data;
  const resolved = resolveLessonProgress(blocks.data ?? [], work);
  return <main className={s.viewerPage}>
    <nav className={s.breadcrumb}><Link href="/learn">← Back to Learn</Link></nav>
    <header className={s.viewerHeader}>
      <h1 className={s.viewerTitle}>{lesson.data.title}</h1>
      <p>{work?.completed_at ? 'Lesson report · Completed ' + formatDate(work.completed_at) : 'A lesson completion has not been recorded.'}</p>
      <Link href={'/learn/' + lessonId}>Open lesson</Link>
    </header>
    {work?.completed_at && <>
      {resolved.hasStale && <p>Some activity was recorded on an earlier version of this lesson. The summary uses the current steps.</p>}
      <LessonCheckReview review={buildCheckReview(blocks.data ?? [], work.check_answers || {})} startMissed={view === 'missed'} />
      {canPractice && <LessonPracticeButton action={createLessonPracticeDrill.bind(null, lessonId)} />}
    </>}
  </main>;
}
