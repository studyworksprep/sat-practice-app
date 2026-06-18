// Student · Learn. Lesson library + entry point to the Getting
// Started tutorial. Server Component — lessons, topics, progress,
// and the "assigned to me" filter all resolve server-side; the
// legacy version fetched /api/lessons three times from a useEffect.
//
// Filters drive off URL query params (?tab=assigned|library,
// ?q=search, ?domain=X). The tiny filter form is a client island
// that submits via <form method="GET">; everything else stays
// on the server.

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { Card } from '@/lib/ui/Card';
import { LearnFilter } from './LearnFilter';
import s from './Learn.module.css';

export const dynamic = 'force-dynamic';

const LESSON_LIST_LIMIT = 500;

export default async function StudentLearnPage({ searchParams }) {
  const sp = (await searchParams) ?? {};
  const tab = sp.tab === 'library' ? 'library' : 'assigned';
  const query = typeof sp.q === 'string' ? sp.q.trim() : '';
  const domainFilter = typeof sp.domain === 'string' ? sp.domain : '';

  const { user, profile, supabase } = await requireUser();

  if (profile.role === 'admin') redirect('/admin');
  if (profile.role === 'teacher' || profile.role === 'manager') {
    redirect('/tutor/dashboard');
  }
  if (profile.role === 'practice') redirect('/subscribe');

  // Pull the full library and the student's assignment list in
  // parallel. The list size is bounded by LESSON_LIST_LIMIT
  // because every row carries a small payload and the page filters
  // in memory afterwards — once the library outgrows that bound,
  // shift to keyset pagination.
  const [lessonsRes, assignmentRows, allTopicsRes, domainListRes] = await Promise.all([
    supabase
      .from('lessons')
      .select('id, title, description, author_id, status, visibility, created_at, updated_at')
      .order('updated_at', { ascending: false })
      .limit(LESSON_LIST_LIMIT),
    fetchAssignedLessonIds(supabase, user.id),
    supabase
      .from('lesson_topics')
      .select('lesson_id, domain_name, skill_code'),
    // Domain dropdown options. Cheap distinct-list via the same
    // lesson_topics table; we de-dupe in memory because PostgREST
    // doesn't expose DISTINCT directly.
    supabase
      .from('lesson_topics')
      .select('domain_name'),
  ]);

  const lessons = (lessonsRes.data ?? []).filter((l) => l.status === 'published');
  const lessonIds = lessons.map((l) => l.id);

  const topicsByLesson = new Map();
  for (const row of allTopicsRes.data ?? []) {
    if (!topicsByLesson.has(row.lesson_id)) topicsByLesson.set(row.lesson_id, []);
    topicsByLesson.get(row.lesson_id).push({
      domain_name: row.domain_name,
      skill_code: row.skill_code,
    });
  }

  // Authors and progress, fetched only for the rows we'll actually
  // render. Both lookups are batched via .in().
  const [authorMap, progressMap] = await Promise.all([
    fetchAuthorMap(supabase, lessons),
    fetchProgressMap(supabase, user.id, lessonIds),
  ]);

  const assignedIds = new Set(assignmentRows);
  const domains = Array.from(new Set(
    (domainListRes.data ?? []).map((r) => r.domain_name).filter(Boolean),
  )).sort();

  const enriched = lessons.map((l) => ({
    ...l,
    author_name: authorMap.get(l.author_id) ?? 'Unknown',
    topics: topicsByLesson.get(l.id) ?? [],
    progress: progressMap.get(l.id) ?? null,
    assigned: assignedIds.has(l.id),
  }));

  const visibleByTab = tab === 'assigned'
    ? enriched.filter((l) => l.assigned)
    : enriched;

  const filtered = visibleByTab.filter((l) => {
    if (query) {
      const q = query.toLowerCase();
      const inTitle = (l.title ?? '').toLowerCase().includes(q);
      const inDesc = (l.description ?? '').toLowerCase().includes(q);
      if (!inTitle && !inDesc) return false;
    }
    if (domainFilter) {
      if (!l.topics.some((t) => t.domain_name === domainFilter)) return false;
    }
    return true;
  });

  const assignedCount = enriched.filter((l) => l.assigned).length;
  const libraryCount = enriched.length;

  return (
    <main className={s.page}>
      <header className={s.header}>
        <h1 className={s.h1}>Learn</h1>
      </header>

      <a href="/learn/getting-started" className={s.gettingStartedLink}>
        <Card tone="info" className={s.gettingStartedCard}>
          <span className={s.gettingStartedIcon} aria-hidden="true">📖</span>
          <div className={s.gettingStartedBody}>
            <div className={s.gettingStartedTitle}>
              Getting Started: Your Guide to SAT Practice
            </div>
            <p className={s.gettingStartedSub}>
              New here? Learn how to use the Question Bank, Practice Tests,
              Flashcards, Smart Review, and more.
            </p>
          </div>
          <span className={s.gettingStartedArrow} aria-hidden="true">→</span>
        </Card>
      </a>

      <nav className={s.tabs}>
        <a
          href={buildHref({ tab: 'assigned', q: query, domain: domainFilter })}
          className={tab === 'assigned' ? `${s.tab} ${s.tabActive}` : s.tab}
        >
          Assigned to me ({assignedCount})
        </a>
        <a
          href={buildHref({ tab: 'library', q: query, domain: domainFilter })}
          className={tab === 'library' ? `${s.tab} ${s.tabActive}` : s.tab}
        >
          All content ({libraryCount})
        </a>
      </nav>

      <LearnFilter tab={tab} currentQuery={query} currentDomain={domainFilter} domains={domains} />

      {filtered.length === 0 ? (
        <Card className={s.emptyCard}>
          <p className={s.emptyText}>
            {tab === 'assigned'
              ? 'No lessons assigned to you yet.'
              : 'No lessons match those filters.'}
          </p>
        </Card>
      ) : (
        <div className={s.lessonList}>
          {filtered.map((lesson) => (
            <a
              key={lesson.id}
              href={`/learn/${lesson.id}`}
              className={s.lessonCardLink}
            >
              <Card className={s.lessonCard}>
                <div className={s.lessonCardBody}>
                  <div className={s.lessonCardHeader}>
                    <span className={s.lessonTitle}>{lesson.title}</span>
                    {lesson.progress && (
                      <span
                        className={
                          lesson.progress === 'completed'
                            ? `${s.lessonBadge} ${s.lessonBadgeDone}`
                            : `${s.lessonBadge} ${s.lessonBadgeProgress}`
                        }
                      >
                        {lesson.progress === 'completed' ? 'Completed' : 'In progress'}
                      </span>
                    )}
                  </div>
                  {lesson.description && (
                    <p className={s.lessonDescription}>{lesson.description}</p>
                  )}
                  {lesson.topics.length > 0 && (
                    <div className={s.lessonTopics}>
                      {lesson.topics.map((t, i) => (
                        <span key={i} className={s.lessonTopic}>
                          {t.skill_code || t.domain_name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className={s.lessonAuthor}>by {lesson.author_name}</div>
              </Card>
            </a>
          ))}
        </div>
      )}
    </main>
  );
}

function buildHref({ tab, q, domain }) {
  const params = new URLSearchParams();
  if (tab && tab !== 'assigned') params.set('tab', tab);
  if (q) params.set('q', q);
  if (domain) params.set('domain', domain);
  const qs = params.toString();
  return qs ? `/learn?${qs}` : '/learn';
}

async function fetchAssignedLessonIds(supabase, userId) {
  const { data: myAssignments } = await supabase
    .from('lesson_assignment_students')
    .select('assignment_id')
    .eq('student_id', userId);
  if (!myAssignments || myAssignments.length === 0) return [];
  const ids = myAssignments.map((a) => a.assignment_id);
  const { data: assignmentRows } = await supabase
    .from('lesson_assignments')
    .select('lesson_id')
    .in('id', ids);
  return (assignmentRows ?? []).map((r) => r.lesson_id);
}

async function fetchAuthorMap(supabase, lessons) {
  const authorIds = [...new Set(lessons.map((l) => l.author_id).filter(Boolean))];
  const map = new Map();
  if (authorIds.length === 0) return map;
  const { data: authors } = await supabase
    .from('profiles')
    .select('id, first_name, last_name')
    .in('id', authorIds);
  for (const a of authors ?? []) {
    const name = [a.first_name, a.last_name].filter(Boolean).join(' ') || 'Unknown';
    map.set(a.id, name);
  }
  return map;
}

async function fetchProgressMap(supabase, userId, lessonIds) {
  const map = new Map();
  if (lessonIds.length === 0) return map;
  const { data: rows } = await supabase
    .from('lesson_progress')
    .select('lesson_id, completed_at')
    .eq('student_id', userId)
    .in('lesson_id', lessonIds);
  for (const p of rows ?? []) {
    map.set(p.lesson_id, p.completed_at ? 'completed' : 'in_progress');
  }
  return map;
}
