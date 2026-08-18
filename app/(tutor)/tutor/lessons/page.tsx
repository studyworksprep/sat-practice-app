import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { Button } from '@/lib/ui/Button';
import { filterLessonCatalog, getLessonCatalogFacets } from '@/lib/lesson/catalog';
import { loadLessonCatalog } from '@/lib/lesson/catalog-server';
import { LessonCatalogFilterBar } from '@/lib/ui/LessonCatalogFilters';
import { LessonScopeChips } from '@/lib/ui/LessonScopeChips';
import { createNewLessonDraft, proposeLessonEdit } from './actions';
import s from './Lessons.module.css';

export const dynamic = 'force-dynamic';

const ACTIVE_STATES = new Set(['draft', 'submitted', 'changes_requested']);

type DirectFormAction = (formData: FormData) => void | Promise<void>;
const createDraftAction = createNewLessonDraft as unknown as DirectFormAction;
const proposeEditAction = proposeLessonEdit as unknown as DirectFormAction;

type Revision = {
  id: string;
  base_lesson_id: string | null;
  title: string;
  state: string;
  updated_at: string;
  submitted_at: string | null;
  review_note: string | null;
};

export default async function TutorLessonsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { user, profile, supabase } = await requireUser();
  if (profile.role === 'admin') redirect('/admin/lessons');
  if (!['teacher', 'manager'].includes(profile.role)) redirect('/dashboard');

  const sp = (await searchParams) ?? {};
  const catalogFilters = {
    q: stringParam(sp.q),
    section: stringParam(sp.section),
    domain: stringParam(sp.domain),
    kind: stringParam(sp.kind),
    sort: stringParam(sp.sort) || 'title',
  };

  const [lessonRows, { data: revisions }] = await Promise.all([
    loadLessonCatalog(supabase, { status: 'published', visibility: 'shared' }),
    supabase
      .from('lesson_revisions')
      .select('id, base_lesson_id, title, state, updated_at, submitted_at, review_note')
      .eq('owner_id', user.id)
      .order('updated_at', { ascending: false }),
  ]);
  const revisionRows = (revisions ?? []) as Revision[];
  const visibleLessons = filterLessonCatalog(lessonRows, catalogFilters);
  const catalogFacets = getLessonCatalogFacets(lessonRows);

  const activeByBase = new Map<string, Revision>();
  for (const revision of revisionRows) {
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
        <form action={createDraftAction} className={s.newForm}>
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
        {revisionRows.length === 0 ? (
          <p className={s.empty}>You have no lesson drafts yet.</p>
        ) : (
          <div className={s.draftGrid}>
            {revisionRows.map((revision) => (
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
            <p>
              {visibleLessons.length === lessonRows.length
                ? `${lessonRows.length} canonical lessons available to students.`
                : `${visibleLessons.length} of ${lessonRows.length} lessons match these filters.`}
            </p>
          </div>
        </div>
        <LessonCatalogFilterBar
          action="/tutor/lessons"
          filters={catalogFilters}
          facets={catalogFacets}
        />
        {lessonRows.length === 0 ? (
          <p className={s.empty}>No published lessons are available.</p>
        ) : visibleLessons.length === 0 ? (
          <p className={`${s.empty} ${s.filteredEmpty}`}>
            No lessons match these filters. <Link href="/tutor/lessons">Clear filters</Link>
          </p>
        ) : (
          <div className={s.lessonList}>
            {visibleLessons.map((lesson) => {
              const active = activeByBase.get(lesson.id);
              return (
                <article key={lesson.id} className={s.lessonRow}>
                  <div className={s.lessonBody}>
                    <div className={s.cardTop}>
                      <strong>{lesson.title}</strong>
                      {lesson.kind === 'foundation' && <span className={s.kindBadge}>Foundation</span>}
                    </div>
                    {lesson.description && <p>{lesson.description}</p>}
                    <LessonScopeChips lesson={lesson} />
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
                      <form action={proposeEditAction}>
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

function StateBadge({ state }: { state: string }) {
  const labels: Record<string, string> = {
    draft: 'Draft', submitted: 'In review', changes_requested: 'Changes requested',
    approved: 'Published', rejected: 'Rejected', withdrawn: 'Withdrawn',
  };
  return <span className={`${s.stateBadge} ${s[`state_${state}`] ?? ''}`}>{labels[state] ?? state}</span>;
}

function formatDate(value: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function stringParam(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : '';
}
