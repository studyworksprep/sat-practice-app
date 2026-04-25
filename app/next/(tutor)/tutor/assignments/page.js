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
import { formatShortDate } from '@/lib/formatters';
import s from './AssignmentsList.module.css';

export const dynamic = 'force-dynamic';

export default async function TutorAssignmentsPage() {
  const { user, profile, supabase } = await requireUser();

  if (profile.role === 'student' || profile.role === 'practice') {
    redirect('/dashboard');
  }
  if (!['teacher', 'manager', 'admin'].includes(profile.role)) {
    redirect('/');
  }

  const { data: rows } = await supabase
    .from('assignments_v2')
    .select(`
      id, assignment_type, title, description, due_date,
      archived_at, deleted_at, created_at, question_ids,
      lesson:lessons (title),
      practice_test:practice_tests_v2 (name)
    `)
    .eq('teacher_id', user.id)
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
    .filter((a) => a.assignment_type === 'questions')
    .map((a) => ({ a, junc: byAssignment.get(a.id) ?? [] }))
    .filter((p) => p.junc.length === 1);

  const allUserIds = Array.from(new Set(singleStudentRows.map((p) => p.junc[0].student_id)));
  const allQids = Array.from(
    new Set(singleStudentRows.flatMap((p) =>
      Array.isArray(p.a.question_ids) ? p.a.question_ids : [],
    )),
  );

  // Two parallel follow-ups: the attempts the relevant single
  // students have made on the question ids in their assignments,
  // and the latest practice_sessions row per assignment id for
  // the click-through link on completed single-student tiles.
  const [{ data: attemptsRaw }, { data: sessionRows }] = await Promise.all([
    allUserIds.length > 0 && allQids.length > 0
      ? supabase
          .from('attempts')
          .select('user_id, question_id, is_correct, created_at')
          .in('user_id', allUserIds)
          .in('question_id', allQids)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] }),
    assignmentIds.length > 0
      ? supabase
          .from('practice_sessions')
          .select('id, created_at, filter_criteria, user_id')
          .in('filter_criteria->>assignment_id', assignmentIds)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);

  // Attempt aggregation: latest attempt per (user, question) pair
  // wins, mirroring the runner's first-attempt-wins rule on review.
  // attemptsRaw is ordered desc, so the first one we see is the
  // latest.
  const attemptByPair = new Map();
  for (const a of attemptsRaw ?? []) {
    const key = `${a.user_id}::${a.question_id}`;
    if (!attemptByPair.has(key)) attemptByPair.set(key, a);
  }

  // Latest session per (assignment_id, user_id) pair.
  const sessionByAssignmentUser = new Map();
  for (const row of sessionRows ?? []) {
    const aid = row.filter_criteria?.assignment_id;
    if (!aid) continue;
    const key = `${aid}::${row.user_id}`;
    if (!sessionByAssignmentUser.has(key)) sessionByAssignmentUser.set(key, row.id);
  }

  // Per-assignment view-model.
  const enriched = allAssignments.map((a) => {
    const junc = byAssignment.get(a.id) ?? [];
    const studentCount = junc.length;
    const completedJunc = junc.filter((j) => j.completed_at);

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
      if (a.assignment_type === 'questions' && total > 0) {
        for (const qid of a.question_ids) {
          const att = attemptByPair.get(`${j.student_id}::${qid}`);
          if (att) {
            done += 1;
            if (att.is_correct) correct += 1;
          }
        }
      }
      const reportSessionId =
        sessionByAssignmentUser.get(`${a.id}::${j.student_id}`) ?? null;

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
      single,
    };
  });
  const enrichedActive = enriched.filter((a) => !a.archived_at);
  const enrichedArchived = enriched.filter((a) => a.archived_at);

  // Cohort-wide stats — flat numbers across the active set.
  const totalAssignedRows = (junctionRows ?? []).filter((r) =>
    enrichedActive.some((a) => a.id === r.assignment_id),
  );
  const totalAssignments = totalAssignedRows.length;
  const totalCompletions = totalAssignedRows.filter((r) => r.completed_at).length;
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();
  const overdueCount = enrichedActive.filter(
    (a) => a.due_date && Date.parse(a.due_date) < nowMs,
  ).length;

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
        <Link href="/tutor/assignments/new" className={s.newBtn}>
          + New assignment
        </Link>
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

      <section className={s.section}>
        <div className={s.sectionHead}>
          <h2 className={s.sectionTitle}>Active</h2>
          <span className={s.sectionCount}>
            {enrichedActive.length} open
          </span>
        </div>
        {enrichedActive.length === 0 ? (
          <EmptyCard
            title="Nothing active right now."
            body="Click + New assignment to send your first one."
          />
        ) : (
          <ul className={s.cardList}>
            {enrichedActive.map((a) => (
              <li key={a.id}>
                <AssignmentRow row={a} nowMs={nowMs} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {enrichedArchived.length > 0 && (
        <section className={s.section}>
          <div className={s.sectionHead}>
            <h2 className={s.sectionTitle}>Archived</h2>
            <span className={s.sectionCount}>
              {enrichedArchived.length} stored
            </span>
          </div>
          <ul className={s.cardList}>
            {enrichedArchived.map((a) => (
              <li key={a.id}>
                <AssignmentRow row={a} nowMs={nowMs} archived />
              </li>
            ))}
          </ul>
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
    !archived && row.due_date && Date.parse(row.due_date) < nowMs;
  const isSingle = row.studentCount === 1;
  const single = row.single;

  // Click target picks up the report when we have one. Group rows
  // and incomplete single-student rows fall back to the detail
  // page (which carries the per-student progress + question set).
  let href = `/tutor/assignments/${row.id}`;
  if (isSingle && single?.completedAt && single.reportSessionId) {
    href = `/practice/review/${single.reportSessionId}`;
  }

  // Progress percent: for single-student questions-type, base on
  // attempted-vs-total. For everything else, base on the cohort
  // completion ratio.
  let progressPct = null;
  let progressText = null;
  if (isSingle && single) {
    if (row.assignment_type === 'questions' && single.total > 0) {
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
  if (row.assignment_type === 'questions') {
    const n = Array.isArray(row.question_ids) ? row.question_ids.length : 0;
    return n === 0 ? null : `${n} question${n === 1 ? '' : 's'}`;
  }
  return null;
}
