import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { Button } from '@/lib/ui/Button';
import { createNewLessonDraft, proposeLessonEdit } from './actions';
import s from './Lessons.module.css';

export const dynamic = 'force-dynamic';

const ACTIVE_STATES = new Set(['draft', 'submitted', 'changes_requested']);

export default async function TutorLessonsPage() {
  const { user, profile, supabase } = await requireUser();
  if (profile.role === 'admin') redirect('/admin/lessons');
  if (!['teacher', 'manager'].includes(profile.role)) redirect('/dashboard');

  const [{ data: lessons }, { data: revisions }, { data: topicRows }] = await Promise.all([
    supabase
      .from('lessons')
      .select('id, title, description, kind, updated_at')
      .eq('status', 'published')
      .eq('visibility', 'shared')
      .order('title'),
    supabase
      .from('lesson_revisions')
      .select('id, base_lesson_id, title, state, updated_at, submitted_at, review_note')
      .eq('owner_id', user.id)
      .order('updated_at', { ascending: false }),
    supabase
      .from('lesson_topics')
      .select('lesson_id, section, domain_name, skill_code'),
  ]);

  const topicsByLesson = new Map();
  for (const topic of topicRows ?? []) {
    if (!topicsByLesson.has(topic.lesson_id)) topicsByLesson.set(topic.lesson_id, []);
    topicsByLesson.get(topic.lesson_id).push(topic);
  }

  const activeByBase = new Map();
  for (const revision of revisions ?? []) {
    if (revision.base_lesson_id && ACTIVE_STATES.has(revision.state)) {
      activeByBase.set(revision.base_lesson_id, revision);
    }
  }

  return (
    <main className={s.container}>
      <header className={s.header}>
        <div>
          <div className={s.eyebrow}>Teach · Lessons</div>
          <h1 className={s.h1}>Lesson library</h1>
          <p className={s.sub}>
            Preview the published student experience, propose improvements without
            touching the live lesson, or draft something new for admin review.
          </p>
        </div>
        <form action={createNewLessonDraft} className={s.newForm}>
          <input name="title" aria-label="New lesson title" placeholder="New lesson title" />
          <Button type="submit">Create draft</Button>
        </form>
      </header>

      <section className={s.section}>
        <div className={s.sectionHead}>
          <div>
            <h2>My drafts</h2>
            <p>Private to you and admins; submitted work becomes read-only during review.</p>
          </div>
        </div>
        {(revisions ?? []).length === 0 ? (
          <p className={s.empty}>You have no lesson drafts yet.</p>
        ) : (
          <div className={s.draftGrid}>
            {(revisions ?? []).map((revision) => (
              <Link key={revision.id} href={`/tutor/lessons/drafts/${revision.id}`} className={s.draftCard}>
                <div className={s.cardTop}>
                  <strong>{revision.title}</strong>
                  <StateBadge state={revision.state} />
                </div>
                <span className={s.cardMeta}>
                  {revision.base_lesson_id ? 'Proposed update' : 'New lesson'} · Updated{' '}
                  {formatDate(revision.updated_at)}
                </span>
                {revision.review_note && (
                  <span className={s.reviewNote}>Admin note: {revision.review_note}</span>
                )}
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className={s.section}>
        <div className={s.sectionHead}>
          <div>
            <h2>Published lessons</h2>
            <p>{lessons?.length ?? 0} canonical lessons available to students.</p>
          </div>
        </div>
        {(lessons ?? []).length === 0 ? (
          <p className={s.empty}>No published lessons are available.</p>
        ) : (
          <div className={s.lessonList}>
            {(lessons ?? []).map((lesson) => {
              const active = activeByBase.get(lesson.id);
              const topics = topicsByLesson.get(lesson.id) ?? [];
              return (
                <article key={lesson.id} className={s.lessonRow}>
                  <div className={s.lessonBody}>
                    <div className={s.cardTop}>
                      <strong>{lesson.title}</strong>
                      {lesson.kind === 'foundation' && <span className={s.kindBadge}>Foundation</span>}
                    </div>
                    {lesson.description && <p>{lesson.description}</p>}
                    {topics.length > 0 && (
                      <div className={s.topics}>
                        {topics.map((topic, index) => (
                          <span key={index}>{topic.skill_code || topic.domain_name || sectionLabel(topic.section)}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className={s.actions}>
                    <Button href={`/tutor/lessons/${lesson.id}/preview`} variant="secondary">
                      Preview
                    </Button>
                    {active ? (
                      <Button href={`/tutor/lessons/drafts/${active.id}`}>
                        {active.state === 'submitted' ? 'View submission' : 'Resume draft'}
                      </Button>
                    ) : (
                      <form action={proposeLessonEdit}>
                        <input type="hidden" name="lesson_id" value={lesson.id} />
                        <Button type="submit">Propose changes</Button>
                      </form>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

function StateBadge({ state }) {
  const labels = {
    draft: 'Draft', submitted: 'In review', changes_requested: 'Changes requested',
    approved: 'Published', rejected: 'Rejected', withdrawn: 'Withdrawn',
  };
  return <span className={`${s.stateBadge} ${s[`state_${state}`] ?? ''}`}>{labels[state] ?? state}</span>;
}

function sectionLabel(section) {
  if (section === 'reading_writing') return 'Reading & Writing';
  if (section === 'math') return 'Math';
  return 'Lesson';
}

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
