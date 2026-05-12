// Student · Lesson viewer. Server Component — loads lesson, blocks,
// topics, and the student's progress row in parallel, then hands
// the runtime over to LessonViewerInteractive (the shared
// LessonSlideshow primitive wrapped with server-action callbacks).
//
// First visit creates the progress row server-side so the
// slideshow renders against a real state row instead of nothing
// — the legacy viewer kicked off the create from a useEffect,
// which raced with the first markBlockComplete on fast clickers.

import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { LessonViewerInteractive } from './LessonViewerInteractive';
import s from '../Learn.module.css';

export const dynamic = 'force-dynamic';

export default async function StudentLessonViewerPage({ params, searchParams }) {
  const { lessonId } = await params;
  const sp = (await searchParams) ?? {};
  const debug =
    process.env.NODE_ENV !== 'production' && sp.debug === '1';

  const { user, profile, supabase } = await requireUser();

  // Defense-in-depth — the (student) layout already gates this,
  // but keep the page-level redirect so a direct hit stays safe
  // if the layout ever stops gating.
  if (profile.role === 'admin') redirect('/admin');
  if (profile.role === 'teacher' || profile.role === 'manager') {
    redirect('/tutor/dashboard');
  }
  if (profile.role === 'practice') redirect('/subscribe');

  const [lessonResult, blocksResult, topicsResult, progressResult] = await Promise.all([
    supabase
      .from('lessons')
      .select('id, title, description, author_id, status, visibility')
      .eq('id', lessonId)
      .maybeSingle(),
    supabase
      .from('lesson_blocks')
      .select('id, sort_order, block_type, content')
      .eq('lesson_id', lessonId)
      .order('sort_order'),
    supabase
      .from('lesson_topics')
      .select('domain_name, skill_code')
      .eq('lesson_id', lessonId),
    supabase
      .from('lesson_progress')
      .select('*')
      .eq('lesson_id', lessonId)
      .eq('student_id', user.id)
      .maybeSingle(),
  ]);

  const lesson = lessonResult.data;
  if (!lesson) notFound();

  const blocks = blocksResult.data ?? [];
  const topics = topicsResult.data ?? [];
  let progress = progressResult.data ?? null;

  // First visit — create the row server-side so the runtime has a
  // stable identity to write to. Failures here are non-fatal: the
  // viewer still renders and the first write from the client will
  // try again via loadOrCreateProgress in actions.js.
  if (!progress) {
    const { data: created } = await supabase
      .from('lesson_progress')
      .insert({
        lesson_id: lessonId,
        student_id: user.id,
        completed_blocks: [],
        check_answers: {},
      })
      .select('*')
      .single();
    progress = created ?? null;
  }

  // Author name — one extra round-trip, but the lessons table
  // doesn't denormalize this and the legacy /api/lessons/[id]
  // route does the same lookup.
  let authorName = 'Unknown';
  if (lesson.author_id) {
    const { data: author } = await supabase
      .from('profiles')
      .select('first_name, last_name')
      .eq('id', lesson.author_id)
      .maybeSingle();
    if (author) {
      authorName =
        [author.first_name, author.last_name].filter(Boolean).join(' ') || 'Unknown';
    }
  }

  return (
    <main className={s.viewerPage}>
      <nav className={s.breadcrumb}>
        <a href="/learn">← Back to Learn</a>
      </nav>

      <header className={s.viewerHeader}>
        <h1 className={s.viewerTitle}>{lesson.title}</h1>
        {lesson.description && (
          <p className={s.viewerDescription}>{lesson.description}</p>
        )}
        <div className={s.viewerMeta}>
          <span className={s.viewerByline}>by {authorName}</span>
          {topics.length > 0 && (
            <div className={s.viewerTopics}>
              {topics.map((t, i) => (
                <span key={i} className={s.viewerTopic}>
                  {t.skill_code || t.domain_name}
                </span>
              ))}
            </div>
          )}
        </div>
      </header>

      <LessonViewerInteractive
        lessonId={lessonId}
        blocks={blocks}
        initialCompletedBlockIds={progress?.completed_blocks ?? []}
        initialCheckAnswers={progress?.check_answers ?? {}}
        initialIsComplete={!!progress?.completed_at}
        debug={debug}
      />
    </main>
  );
}
