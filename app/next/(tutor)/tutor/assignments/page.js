// Tutor → assignments list. Same design-kit vocabulary as the
// student /assignments hub: eyebrow + serif H1, stats strip,
// active section, archived section.
//
// Two row variants live on this list:
//
//   Single-student row (most common case in practice):
//     - The student's name lives on the tile.
//     - Per-question progress bar reflects THAT student's
//       attempted-vs-total + accuracy on the assignment's
//       question_ids.
//     - Click destination skips the cohort detail entirely:
//       complete → /practice/review/<session_id> (the report);
//       incomplete → /tutor/assignments/<id> (which carries the
//       Questions section, so the tutor can see what was assigned
//       and where the student is).
//
//   Group row (≥ 2 students):
//     - Cohort completion bar ("N of M students completed").
//     - Click goes to /tutor/assignments/<id> (the cohort report).
//
// Per-row aggregates come from one extra attempts query (scoped to
// just the question ids on single-student questions-type rows) +
// one practice_sessions query that maps each assignment id to its
// most recent linked session (for the report-link target).

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { AssignmentTypeBadge } from '@/lib/ui/AssignmentTypeBadge';
import { ClipboardCheckIcon, InboxIcon } from '@/lib/ui/icons';
import { IconTile } from '@/lib/ui/IconTile';
import { formatShortDate, isPastDueDate } from '@/lib/formatters';
import { ArchiveButton } from './ArchiveButton';
import { AssignmentsToolbar } from './AssignmentsToolbar';
import { filterAndSort, paginate } from './helpers';
import s from './AssignmentsList.module.css';

export const dynamic = 'force-dynamic';

export default async function TutorAssignmentsPage({ searchParams }) {
  const sp = (await searchParams) ?? {};
  const activeQ      = typeof sp.q     === 'string' ? sp.q     : '';
  const activeSort   = typeof sp.sort  === 'string' ? sp.sort  : 'newest';
  const activePage   = Number(sp.page) || 1;
  const archivedQ    = typeof sp.aq    === 'string' ? sp.aq    : '';
  const archivedSort = typeof sp.asort === 'string' ? sp.asort : 'newest';
  const archivedPage = Number(sp.apage) || 1;

  const { user, profile, supabase } = await requireUser();

  if (profile.role === 'student' || profile.role === 'practice') {
    redirect('/dashboard');
  }
  if (!['teacher', 'manager', 'admin'].includes(profile.role)) {
    redirect('/');
  }

  // SAT-only list of the tutor's outgoing assignments. ACT
  // assignments are forward-wired (§3.4) but no surface ships today.
  const { data: rows } = await supabase
    .from('assignments_v2')
    .select(`
      id, assignment_type, title, description, due_date,
      archived_at, deleted_at, created_at, question_ids,
      lesson:lessons (title),
      practice_test:practice_tests_v2 (name)
    `)
    .eq('teacher_id', user.id)
    .eq('test_type', 'sat')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  const allAssignments = rows ?? [];

  // Junction rows + student profiles for per-row student display.
  const assignmentIds = allAssignments.map((a) => a.id);
  const { data: junctionRows } = assignmentIds.length
    ? await supabase
        .from('assignment_students_v2')
        .select(`
          assignment_id, student_id, completed_at,
          student:profiles!assignment_students_v2_student_id_fkey (
            id, first_name, last_name, email
          )
        `)
        .in('assignment_id', assignmentIds)
    : { data: [] };

  // Group junction rows by assignment id.
  const byAssignment = new Map();
  for (const r of junctionRows ?? []) {
    if (!byAssignment.has(r.assignment_id)) byAssignment.set(r.assignment_id, []);
    byAssignment.get(r.assignment_id).push(r);
  }

  // Identify single-student questions-type assignments — these get
  // the per-student attempt query so the tile shows real progress.
  const singleStudentRows = allAssignments
    .filter((a) => (a.assignment_type === 'questions' || a.assignment_type === 'lesson_pack'))
    .map((a) => ({ a, junc: byAssignment.get(a.id) ?? [] }))
    .filter((p) => p.junc.length === 1);

  const allUserIds = Array.from(new Set(singleStudentRows.map((p) => p.junc[0].student_id)));

  // Per-student question pool — only the qids that show up on
  // assignments this particular student is on. The cross-product
  // (allUserIds × allQids) would balloon past PostgREST's 1000-row
  // db-max-rows cap on a busy manager and silently truncate the
  // attempts result, leaving most assignment tiles stuck at 0/N.
  const qidsByUser = new Map();
  for (const { a, junc } of singleStudentRows) {
    const uid = junc[0].student_id;
    const qids = Array.isArray(a.question_ids) ? a.question_ids : [];
    if (qids.length === 0) continue;
    const existing = qidsByUser.get(uid) ?? new Set();
    for (const q of qids) existing.add(q);
    qidsByUser.set(uid, existing);
  }

  // One attempts query per student, in parallel. Each stays small
  // (a few hundred rows) so none hits the truncation cap.
  const [perUserAttempts, { data: sessionRows }] = await Promise.all([
    Promise.all(
      allUserIds.map(async (uid) => {
        const qidSet = qidsByUser.get(uid);
        if (!qidSet || qidSet.size === 0) return [];
        const { data } = await supabase
          .from('attempts')
          .select('user_id, question_id, is_correct, created_at')
          .eq('user_id', uid)
          .in('question_id', Array.from(qidSet))
          .order('created_at', { ascending: false });
        return data ?? [];
      }),
    ),
    assignmentIds.length > 0
      ? supabase
          .from('practice_sessions')
          .select('id, created_at, filter_criteria, user_id')
          .eq('test_type', 'sat')
          .in('filter_criteria->>assignment_id', assignmentIds)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);
  const attemptsRaw = perUserAttempts.flat();

  // Attempt aggregation: for each (user, qid) pair we keep the
  // attempts in chronological order. When the assignment has its
  // own practice session, we pick the earliest attempt at-or-after
  // session.createdAt — same scoping rule the runner and per-
  // student report use, so a student's older attempt on the same
  // question doesn't get counted as in-assignment work. When no
  // session exists for the (assignment, student) pair (legacy
  // pre-cutover work, manual completion, etc.), we fall back to
  // the earliest attempt overall — same fallback that
  // submitAssignmentOnBehalf uses to synthesize a session.
  const attemptsAsc = (attemptsRaw ?? []).slice().reverse();
  const attemptsByPairAsc = new Map();
  for (const a of attemptsAsc) {
    const key = `${a.user_id}::${a.question_id}`;
    if (!attemptsByPairAsc.has(key)) attemptsByPairAsc.set(key, []);
    attemptsByPairAsc.get(key).push(a);
  }

  // Latest session per (assignment_id, user_id) pair. Tracks both
  // the id (for the click-through link on completed tiles) and the
  // created_at timestamp (for scoping the done/correct counts to
  // attempts that landed inside the session window).
  const sessionByAssignmentUser = new Map();
  for (const row of sessionRows ?? []) {
    const aid = row.filter_criteria?.assignment_id;
    if (!aid) continue;
    const key = `${aid}::${row.user_id}`;
    if (!sessionByAssignmentUser.has(key)) {
      sessionByAssignmentUser.set(key, { id: row.id, createdAt: row.created_at });
    }
  }

  // Per-assignment view-model.
  const enriched = allAssignments.map((a) => {
    const junc = byAssignment.get(a.id) ?? [];
    const studentCount = junc.length;
    const completedJunc = junc.filter((j) => j.completed_at);

    // Displayable name per student on the assignment, used by the
    // toolbar's search. Built for every row (single AND group) so a
    // tutor searching "Jane" finds her on cohort assignments too.
    const studentNames = junc
      .map(
        (j) =>
          [j.student?.first_name, j.student?.last_name].filter(Boolean).join(' ')
          || j.student?.email
          || '',
      )
      .filter(Boolean);

    let single = null;
    if (studentCount === 1) {
      const j = junc[0];
      const studentName =
        [j.student?.first_name, j.student?.last_name].filter(Boolean).join(' ')
        || j.student?.email
        || 'Student';

      let done = 0;
      let correct = 0;
      const total = Array.isArray(a.question_ids) ? a.question_ids.length : 0;
      const sessionInfo =
        sessionByAssignmentUser.get(`${a.id}::${j.student_id}`) ?? null;
      if ((a.assignment_type === 'questions' || a.assignment_type === 'lesson_pack') && total > 0) {
        for (const qid of a.question_ids) {
          const arr = attemptsByPairAsc.get(`${j.student_id}::${qid}`) ?? [];
          if (arr.length === 0) continue;
          const attempt = sessionInfo
            ? arr.find((att) => att.created_at >= sessionInfo.createdAt)
            : arr[0];
          if (attempt) {
            done += 1;
            if (attempt.is_correct) correct += 1;
          }
        }
      }
      const reportSessionId = sessionInfo?.id ?? null;

      single = {
        studentId: j.student_id,
        studentName,
        completedAt: j.completed_at,
        done,
        correct,
        total,
        reportSessionId,
      };
    }

    return {
      ...a,
      studentCount,
      completedCount: completedJunc.length,
      studentNames,
      single,
    };
  });
  const enrichedActive = enriched.filter((a) => !a.archived_at);
  const enrichedArchived = enriched.filter((a) => a.archived_at);

  // Cohort-wide stats — flat numbers across the active set. Stats
  // intentionally reflect the FULL active list, not the search-
  // filtered slice; a tutor wants to see "I have 6 overdue total"
  // even when they're filtering for one student.
  const totalAssignedRows = (junctionRows ?? []).filter((r) =>
    enrichedActive.some((a) => a.id === r.assignment_id),
  );
  const totalAssignments = totalAssignedRows.length;
  const totalCompletions = totalAssignedRows.filter((r) => r.completed_at).length;
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();
  const overdueCount = enrichedActive.filter(
    (a) => a.due_date && isPastDueDate(a.due_date, nowMs),
  ).length;

  // Apply search + sort + pagination to each section. Stats above
  // already snapshotted full counts.
  const activeFiltered = filterAndSort(enrichedActive, {
    q: activeQ, sort: activeSort, nowMs,
  });
  const activeView = paginate(activeFiltered, activePage);

  const archivedFiltered = filterAndSort(enrichedArchived, {
    q: archivedQ, sort: archivedSort, nowMs,
  });
  const archivedView = paginate(archivedFiltered, archivedPage);

  return (
    <main className={s.container}>
      <header className={s.header}>
        <div className={s.headerLeft}>
          <div className={s.eyebrow}>Tutor · Assignments</div>
          <h1 className={s.h1}>Your assignments</h1>
          <p className={s.sub}>
            Single-student assignments show that student&apos;s name + progress;
            group assignments roll up the cohort.
          </p>
        </div>
        <div className={s.headerActions}>
          <Link href="/tutor/lesson-packs" className={s.secondaryBtn}>
            Lesson packs
          </Link>
          <Link href="/tutor/assignments/new" className={s.newBtn}>
            + New assignment
          </Link>
        </div>
      </header>

      <div className={s.statsStrip}>
        <StatTile
          label="Active assignments"
          value={enrichedActive.length}
          sub={
            enrichedArchived.length > 0
              ? `${enrichedArchived.length} archived`
              : 'Nothing archived'
          }
        />
        <StatTile
          label="Student assignments"
          value={totalAssignments}
          sub={
            totalAssignments === 0
              ? 'No active assignments yet'
              : `Across ${enrichedActive.length} active assignment${enrichedActive.length === 1 ? '' : 's'}`
          }
        />
        <StatTile
          label="Completed"
          value={totalCompletions}
          sub={
            totalAssignments === 0
              ? 'Waiting on first completion'
              : `${Math.round((totalCompletions / totalAssignments) * 100)}% of assigned`
          }
          tone="good"
        />
        <StatTile
          label="Overdue"
          value={overdueCount}
          sub={overdueCount === 0 ? 'Cohort is on schedule' : 'Active, past due date'}
          tone={overdueCount > 0 ? 'warn' : 'neutral'}
        />
      </div>

      <section className={s.section} id="active-section">
        <div className={s.sectionHead}>
          <h2 className={s.sectionTitle}>
            <IconTile icon={InboxIcon} palette="navy" size="md" />
            Active
          </h2>
          <span className={s.sectionCount}>
            {enrichedActive.length} open
            {activeQ && ` · ${activeView.totalCount} match search`}
          </span>
        </div>
        {enrichedActive.length === 0 ? (
          <EmptyCard
            title="Nothing active right now."
            body="Click + New assignment to send your first one."
          />
        ) : (
          <>
            <AssignmentsToolbar
              qKey="q"
              sortKey="sort"
              pageKey="page"
              initialQ={activeQ}
              initialSort={activeSort}
              page={activeView.page}
              totalPages={activeView.totalPages}
              totalCount={activeView.totalCount}
              visibleCount={activeView.items.length}
              anchorId="active-section"
            />
            {activeView.items.length === 0 ? (
              <EmptyCard
                title="No matches."
                body="Try a different search term or clear the filter."
              />
            ) : (
              <ul className={s.cardList}>
                {activeView.items.map((a) => (
                  <li key={a.id} className={s.cardRow}>
                    <AssignmentRow row={a} nowMs={nowMs} />
                    <ArchiveButton assignmentId={a.id} archived={false} />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      {enrichedArchived.length > 0 && (
        <section className={s.section} id="archived-section">
          <div className={s.sectionHead}>
            <h2 className={s.sectionTitle}>
              <IconTile icon={ClipboardCheckIcon} palette="slate" size="md" />
              Archived
            </h2>
            <span className={s.sectionCount}>
              {enrichedArchived.length} stored
              {archivedQ && ` · ${archivedView.totalCount} match search`}
            </span>
          </div>
          <AssignmentsToolbar
            qKey="aq"
            sortKey="asort"
            pageKey="apage"
            initialQ={archivedQ}
            initialSort={archivedSort}
            page={archivedView.page}
            totalPages={archivedView.totalPages}
            totalCount={archivedView.totalCount}
            visibleCount={archivedView.items.length}
            anchorId="archived-section"
          />
          {archivedView.items.length === 0 ? (
            <EmptyCard
              title="No matches."
              body="Try a different search term or clear the filter."
            />
          ) : (
            <ul className={s.cardList}>
              {archivedView.items.map((a) => (
                <li key={a.id} className={s.cardRow}>
                  <AssignmentRow row={a} nowMs={nowMs} archived />
                  <ArchiveButton assignmentId={a.id} archived />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  );
}

// ──────────────────────────────────────────────────────────────

function StatTile({ label, value, sub, tone = 'neutral' }) {
  return (
    <div className={`${s.statTile} ${s[`statTile_${tone}`] ?? ''}`}>
      <div className={s.statLabel}>{label}</div>
      <div className={s.statValue}>{value}</div>
      {sub && <div className={s.statSub}>{sub}</div>}
    </div>
  );
}

function EmptyCard({ title, body }) {
  return (
    <div className={s.emptyCard}>
      <div className={s.emptyTitle}>{title}</div>
      {body && <div className={s.emptyBody}>{body}</div>}
    </div>
  );
}

function AssignmentRow({ row, nowMs, archived = false }) {
  const title = row.title
    ?? (row.assignment_type === 'lesson' ? row.lesson?.title : null)
    ?? (row.assignment_type === 'practice_test' ? row.practice_test?.name : null)
    ?? 'Assignment';
  const subtitle = displaySubtitle(row);
  const isOverdue =
    !archived && row.due_date && isPastDueDate(row.due_date, nowMs);
  const isSingle = row.studentCount === 1;
  const single = row.single;

  // Click target picks up the report when we have one. Group rows
  // and incomplete single-student rows fall back to the detail
  // page (which carries the per-student progress + question set).
  let href = `/tutor/assignments/${row.id}`;
  if (isSingle && single?.completedAt && single.reportSessionId) {
    href = `/tutor/sessions/${single.reportSessionId}`;
  }

  // Progress percent: for single-student questions-type, base on
  // attempted-vs-total. For everything else, base on the cohort
  // completion ratio.
  let progressPct = null;
  let progressText = null;
  if (isSingle && single) {
    if ((row.assignment_type === 'questions' || row.assignment_type === 'lesson_pack') && single.total > 0) {
      progressPct = Math.round((single.done / single.total) * 100);
      const accuracyPct =
        single.done > 0 ? Math.round((single.correct / single.done) * 100) : null;
      progressText = single.completedAt
        ? `Completed · ${single.correct} of ${single.total} correct${
            accuracyPct != null ? ` · ${accuracyPct}%` : ''
          }`
        : single.done === 0
          ? `Not started · ${single.total} questions`
          : `${single.done} of ${single.total} attempted${
              accuracyPct != null ? ` · ${accuracyPct}% so far` : ''
            }`;
    } else {
      progressText = single.completedAt ? 'Completed' : 'Not started';
    }
  } else if (row.studentCount > 0) {
    progressPct = Math.round((row.completedCount / row.studentCount) * 100);
    progressText = `${row.completedCount} of ${row.studentCount} students completed · ${progressPct}%`;
  }

  return (
    <Link
      href={href}
      className={`${s.assignCard} ${archived ? s.assignCardArchived : ''}`}
    >
      <div className={s.assignTop}>
        <AssignmentTypeBadge type={row.assignment_type} />
        <div className={s.assignTitle}>{title}</div>
        {isSingle && single ? (
          <span className={s.assignStudent}>
            <span className={s.assignStudentDot} aria-hidden="true">·</span>
            {single.studentName}
          </span>
        ) : (
          row.studentCount > 1 && (
            <span className={s.assignGroupTag}>
              {row.studentCount} students
            </span>
          )
        )}
        {row.due_date && (
          <span className={isOverdue ? s.dueOverdue : s.dueOn}>
            {isOverdue ? 'Overdue' : 'Due'} · {formatShortDate(row.due_date)}
          </span>
        )}
      </div>
      {subtitle && <div className={s.assignSub}>{subtitle}</div>}
      {progressText && (
        <div className={s.assignFooter}>
          <span className={s.completionText}>{progressText}</span>
          {progressPct != null && (
            <div className={s.completionBar}>
              <div
                className={`${s.completionBarFill} ${
                  isSingle && single?.completedAt ? s.completionBarFillDone : ''
                }`}
                style={{ width: `${progressPct}%` }}
              />
            </div>
          )}
        </div>
      )}
    </Link>
  );
}

function displaySubtitle(row) {
  if (row.description) return row.description;
  if ((row.assignment_type === 'questions' || row.assignment_type === 'lesson_pack')) {
    const n = Array.isArray(row.question_ids) ? row.question_ids.length : 0;
    return n === 0 ? null : `${n} question${n === 1 ? '' : 's'}`;
  }
  return null;
}
