// Student assignments hub. See docs/architecture-plan.md §3.4.
//
// Two sections (pending up top, completed below) with a stats strip
// above both — completion rate + overall accuracy + week's activity.
//
// For completed questions-type assignments, the tile carries an
// accuracy breakdown by difficulty (Easy / Medium / Hard) computed
// from attempts the student made on the assignment's question_ids.
// Clicking a completed tile goes to that assignment's report — the
// existing session-review page, which detects the assignment via
// session.filter_criteria.assignment_id and re-frames itself as an
// Assignment Report.
//
// Server-rendered end-to-end: one data pass in loadAssignmentsData,
// all downstream shapes are flat view-models.

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requireUser } from '@/lib/api/auth';
import { AssignmentTypeBadge } from '@/lib/ui/AssignmentTypeBadge';
import { formatDate } from '@/lib/formatters';
import s from './AssignmentsPage.module.css';

export const dynamic = 'force-dynamic';

export default async function StudentAssignmentsPage() {
  const { user, profile, supabase } = await requireUser();

  if (profile.role === 'admin') redirect('/admin');
  if (profile.role === 'teacher' || profile.role === 'manager') redirect('/tutor/dashboard');
  if (profile.role === 'practice') redirect('/subscribe');

  const { pending, completed, stats } = await loadAssignmentsData(supabase, user.id);

  return (
    <main className={s.container}>
      <header className={s.header}>
        <div className={s.eyebrow}>Assignments</div>
        <h1 className={s.h1}>Your assignments</h1>
        <p className={s.sub}>
          Everything your tutor has assigned you. Pending work at the top,
          finished work below with a quick look at how you did.
        </p>
      </header>

      <StatsStrip stats={stats} />

      <section className={s.section}>
        <div className={s.sectionHead}>
          <h2 className={s.sectionTitle}>Pending</h2>
          <span className={s.sectionCount}>
            {pending.length} open
          </span>
        </div>
        {pending.length === 0 ? (
          <EmptyCard
            title="Nothing pending — nice work."
            body="Your tutor may add more; come back later."
          />
        ) : (
          <ul className={s.cardList}>
            {pending.map((row) => (
              <li key={row.id}>
                <PendingCard row={row} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={s.section}>
        <div className={s.sectionHead}>
          <h2 className={s.sectionTitle}>Completed</h2>
          <span className={s.sectionCount}>
            {completed.length} finished
          </span>
        </div>
        {completed.length === 0 ? (
          <EmptyCard
            title="No finished assignments yet."
            body="Finish one above and it'll show up here with your stats."
          />
        ) : (
          <ul className={s.completedGrid}>
            {completed.map((row) => (
              <li key={row.id}>
                <CompletedCard row={row} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

// ──────────────────────────────────────────────────────────────
// Stats strip.
// ──────────────────────────────────────────────────────────────

function StatsStrip({ stats }) {
  return (
    <div className={s.statsStrip}>
      <StatTile
        label="Completion rate"
        value={stats.completionRate == null
          ? '—'
          : `${Math.round(stats.completionRate * 100)}%`}
        sub={`${stats.completed} of ${stats.total} assigned`}
        tone="neutral"
      />
      <StatTile
        label="Accuracy"
        value={stats.accuracy == null
          ? '—'
          : `${Math.round(stats.accuracy * 100)}%`}
        sub={stats.accuracy == null
          ? 'No answered questions yet'
          : `Across ${stats.attempted.toLocaleString()} attempts`}
        tone={toneFromPct(stats.accuracy)}
      />
      <StatTile
        label="This week"
        value={stats.finishedThisWeek}
        sub={stats.finishedThisWeek === 0
          ? 'Pick one and knock it out'
          : encouragement(stats.finishedThisWeek)}
        tone={stats.finishedThisWeek >= 3 ? 'good' : 'neutral'}
      />
      <StatTile
        label="Overdue"
        value={stats.overdue}
        sub={stats.overdue === 0
          ? "You're caught up"
          : stats.overdue === 1
            ? '1 past its due date'
            : `${stats.overdue} past their due date`}
        tone={stats.overdue > 0 ? 'warn' : 'neutral'}
      />
    </div>
  );
}

function StatTile({ label, value, sub, tone = 'neutral' }) {
  return (
    <div className={`${s.statTile} ${s[`statTile_${tone}`] ?? ''}`}>
      <div className={s.statLabel}>{label}</div>
      <div className={s.statValue}>{value}</div>
      {sub && <div className={s.statSub}>{sub}</div>}
    </div>
  );
}

function toneFromPct(pct) {
  if (pct == null) return 'neutral';
  if (pct >= 0.8) return 'good';
  if (pct >= 0.5) return 'ok';
  return 'warn';
}

function encouragement(n) {
  if (n >= 5) return 'On a roll this week!';
  if (n >= 3) return 'Keep it going!';
  return `Finished ${n} this week`;
}

// ──────────────────────────────────────────────────────────────
// Pending card — compact row with progress + due date.
// ──────────────────────────────────────────────────────────────

function PendingCard({ row }) {
  const title = displayTitle(row);
  const subtitle = displaySubtitle(row);
  const dueLabel = row.due_date ? formatDate(row.due_date) : null;
  const teacher = teacherName(row.teacher);
  const pct =
    row.assignment_type === 'questions' && row.total_count > 0
      ? row.done_count / row.total_count
      : null;

  return (
    <Link href={`/assignments/${row.id}`} className={s.pendingCard}>
      <div className={s.cardTop}>
        <AssignmentTypeBadge type={row.assignment_type} />
        <div className={s.cardTitle}>{title}</div>
        {dueLabel && (
          <span className={row.isOverdue ? s.dueOverdue : s.dueOn}>
            {row.isOverdue ? 'Overdue' : 'Due'} · {dueLabel}
          </span>
        )}
      </div>
      {subtitle && <div className={s.cardSub}>{subtitle}</div>}
      <div className={s.cardMetaRow}>
        {teacher && <span className={s.cardMeta}>Assigned by {teacher}</span>}
        {pct != null && (
          <span className={s.cardMeta}>
            {row.done_count} of {row.total_count} attempted
          </span>
        )}
      </div>
      {pct != null && (
        <div className={s.progress}>
          <div
            className={s.progressBar}
            style={{ width: `${Math.round(pct * 100)}%` }}
          />
        </div>
      )}
    </Link>
  );
}

// ──────────────────────────────────────────────────────────────
// Completed card — tile with accuracy-by-difficulty for
// questions-type, or a simple completion note for the other types.
// The click destination is the assignment report (review page with
// filter_criteria.assignment_id attached), if a session exists.
// Falls back to the assignment detail page otherwise.
// ──────────────────────────────────────────────────────────────

function CompletedCard({ row }) {
  const title = displayTitle(row);
  const teacher = teacherName(row.teacher);
  const finishedLabel = row.student_completed_at
    ? formatDate(row.student_completed_at)
    : null;
  const href = row.reportSessionId
    ? `/practice/review/${row.reportSessionId}`
    : `/assignments/${row.id}`;

  return (
    <Link href={href} className={s.completedCard}>
      <div className={s.completedTop}>
        <AssignmentTypeBadge type={row.assignment_type} />
        <span className={s.completedTag}>✓ Completed</span>
      </div>
      <div className={s.cardTitle}>{title}</div>
      <div className={s.completedMeta}>
        {teacher && <span>by {teacher}</span>}
        {finishedLabel && (
          <>
            {teacher && <span className={s.metaDot}>·</span>}
            <span>Finished {finishedLabel}</span>
          </>
        )}
      </div>
      {row.assignment_type === 'questions' && row.difficultyAccuracy && (
        <DifficultyBreakdown buckets={row.difficultyAccuracy} />
      )}
      {row.assignment_type === 'practice_test' && (
        <div className={s.completedNote}>Full-length practice test</div>
      )}
      {row.assignment_type === 'lesson' && (
        <div className={s.completedNote}>Lesson completed</div>
      )}
      <div className={s.completedFooter}>
        {row.reportSessionId ? 'View report →' : 'View assignment →'}
      </div>
    </Link>
  );
}

const DIFF_LABELS = { 1: 'Easy', 2: 'Medium', 3: 'Hard' };

function DifficultyBreakdown({ buckets }) {
  return (
    <div className={s.diffRow}>
      {[1, 2, 3].map((d) => {
        const b = buckets[d] ?? { correct: 0, total: 0 };
        const pct = b.total > 0 ? Math.round((b.correct / b.total) * 100) : null;
        return (
          <div key={d} className={s.diffTile}>
            <div className={s.diffLabel}>{DIFF_LABELS[d]}</div>
            <div className={s.diffValue}>
              {pct == null ? '—' : `${pct}%`}
            </div>
            <div className={s.diffSub}>
              {b.total === 0 ? 'none' : `${b.correct} / ${b.total}`}
            </div>
            <div className={s.diffBar}>
              <div
                className={`${s.diffBarFill} ${pctBarClass(pct, s)}`}
                style={{ width: `${pct ?? 0}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function pctBarClass(pct, styles) {
  if (pct == null) return '';
  if (pct >= 80) return styles.diffBarGood;
  if (pct >= 50) return styles.diffBarOk;
  return styles.diffBarBad;
}

// ──────────────────────────────────────────────────────────────

function EmptyCard({ title, body }) {
  return (
    <div className={s.emptyCard}>
      <div className={s.emptyTitle}>{title}</div>
      {body && <div className={s.emptyBody}>{body}</div>}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Data loader.
// ──────────────────────────────────────────────────────────────

async function loadAssignmentsData(supabase, userId) {
  const { data: junctionRows } = await supabase
    .from('assignment_students_v2')
    .select(`
      completed_at,
      assignment:assignments_v2 (
        id,
        teacher_id,
        assignment_type,
        title,
        description,
        due_date,
        archived_at,
        deleted_at,
        question_ids,
        lesson_id,
        practice_test_id,
        filter_criteria,
        lesson:lessons (title),
        practice_test:practice_tests_v2 (name, code)
      )
    `)
    .eq('student_id', userId);

  const rows = (junctionRows ?? [])
    .map((r) => ({ ...r.assignment, student_completed_at: r.completed_at }))
    .filter((a) => a && a.id && !a.deleted_at && !a.archived_at);

  const teacherIds = Array.from(
    new Set(rows.map((r) => r.teacher_id).filter(Boolean)),
  );
  const questionRows = rows.filter((r) => r.assignment_type === 'questions');
  const allQuestionIds = Array.from(
    new Set(
      questionRows.flatMap((r) =>
        Array.isArray(r.question_ids) ? r.question_ids : [],
      ),
    ),
  );
  const assignmentIds = rows.map((r) => r.id);

  // Three parallel follow-up queries:
  //  (1) teacher cards,
  //  (2) attempts on every assignment question (to compute
  //      per-question first-attempt correctness + done counts),
  //  (3) question difficulty lookup (for the difficulty breakdown
  //      on completed tiles),
  //  (4) practice sessions that carry filter_criteria.assignment_id
  //      for any of this student's assignments (to resolve the
  //      "View report" link per completed tile).
  const [teachersRes, attemptsRes, questionsRes, sessionsRes] = await Promise.all([
    teacherIds.length
      ? supabase
          .from('profile_cards')
          .select('id, first_name, last_name')
          .in('id', teacherIds)
      : Promise.resolve({ data: [] }),
    allQuestionIds.length
      ? supabase
          .from('attempts')
          .select('question_id, is_correct, created_at')
          .eq('user_id', userId)
          .in('question_id', allQuestionIds)
          .order('created_at', { ascending: true })
      : Promise.resolve({ data: [] }),
    allQuestionIds.length
      ? supabase
          .from('questions_v2')
          .select('id, difficulty')
          .in('id', allQuestionIds)
      : Promise.resolve({ data: [] }),
    assignmentIds.length
      ? supabase
          .from('practice_sessions')
          .select('id, created_at, filter_criteria')
          .eq('user_id', userId)
          .in(
            'filter_criteria->>assignment_id',
            assignmentIds,
          )
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);

  const teacherById = new Map((teachersRes.data ?? []).map((t) => [t.id, t]));
  const difficultyById = new Map(
    (questionsRes.data ?? []).map((q) => [q.id, q.difficulty]),
  );

  // First-attempt-per-question from the full attempts list (already
  // ordered asc). "First attempt wins" matches how the review page
  // treats session performance.
  const firstAttemptByQid = new Map();
  for (const a of attemptsRes.data ?? []) {
    if (!firstAttemptByQid.has(a.question_id)) {
      firstAttemptByQid.set(a.question_id, a);
    }
  }
  const attemptedSet = new Set(firstAttemptByQid.keys());

  // Latest session per assignment (sessions are ordered desc, so
  // the first one we see for an assignment_id is the latest).
  const latestSessionByAssignment = new Map();
  for (const sess of sessionsRes.data ?? []) {
    const aid = sess.filter_criteria?.assignment_id;
    if (!aid) continue;
    if (!latestSessionByAssignment.has(aid)) {
      latestSessionByAssignment.set(aid, sess.id);
    }
  }

  // Enrich each row with derived fields and the difficulty
  // breakdown (questions-type only). We compute "done_count"
  // consistently as "questions with at least one attempt".
  // `now` is captured once here so downstream components are
  // pure w.r.t. time (React 19 / compiler).
  const now = Date.now();
  let totalAttempted = 0;
  let totalCorrect = 0;

  for (const r of rows) {
    r.isOverdue = Boolean(
      r.due_date && !r.student_completed_at && Date.parse(r.due_date) < now,
    );
    r.teacher = teacherById.get(r.teacher_id) ?? null;

    if (r.assignment_type === 'questions') {
      const qs = Array.isArray(r.question_ids) ? r.question_ids : [];
      r.total_count = qs.length;
      r.done_count = qs.filter((qid) => attemptedSet.has(qid)).length;

      // Completed-row difficulty aggregation.
      const buckets = { 1: { correct: 0, total: 0 }, 2: { correct: 0, total: 0 }, 3: { correct: 0, total: 0 } };
      for (const qid of qs) {
        const attempt = firstAttemptByQid.get(qid);
        if (!attempt) continue;
        const d = difficultyById.get(qid);
        const key = d === 1 || d === 2 || d === 3 ? d : 3;  // treat 4/5 as Hard
        buckets[key].total += 1;
        if (attempt.is_correct) buckets[key].correct += 1;
        totalAttempted += 1;
        if (attempt.is_correct) totalCorrect += 1;
      }
      r.difficultyAccuracy = buckets;
    }

    r.reportSessionId = latestSessionByAssignment.get(r.id) ?? null;
  }

  // Split into pending / completed and sort.
  const pending = rows.filter((r) => !r.student_completed_at);
  const completed = rows.filter((r) => r.student_completed_at);

  pending.sort((a, b) => {
    // Overdue first, then by due date ascending (soonest first),
    // then undated at the bottom.
    const aDue = a.due_date ? Date.parse(a.due_date) : Number.POSITIVE_INFINITY;
    const bDue = b.due_date ? Date.parse(b.due_date) : Number.POSITIVE_INFINITY;
    return aDue - bDue;
  });
  completed.sort((a, b) => {
    const at = Date.parse(a.student_completed_at ?? 0);
    const bt = Date.parse(b.student_completed_at ?? 0);
    return bt - at;  // most recently finished first
  });

  // Stats strip. Reuses the single `now` snapshot captured above.
  const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const overdue = pending.filter((r) => r.isOverdue).length;
  const finishedThisWeek = completed.filter(
    (r) =>
      r.student_completed_at &&
      Date.parse(r.student_completed_at) >= oneWeekAgo,
  ).length;

  const stats = {
    total: rows.length,
    completed: completed.length,
    pending: pending.length,
    overdue,
    finishedThisWeek,
    completionRate: rows.length > 0 ? completed.length / rows.length : null,
    attempted: totalAttempted,
    accuracy: totalAttempted > 0 ? totalCorrect / totalAttempted : null,
  };

  return { pending, completed, stats };
}

// ──────────────────────────────────────────────────────────────
// Display helpers.
// ──────────────────────────────────────────────────────────────

function displayTitle(row) {
  if (row.title) return row.title;
  if (row.assignment_type === 'lesson') return row.lesson?.title ?? 'Lesson';
  if (row.assignment_type === 'practice_test') return row.practice_test?.name ?? 'Practice Test';
  return 'Assignment';
}

function displaySubtitle(row) {
  if (row.description) return row.description;
  if (row.assignment_type === 'questions') {
    const n = Array.isArray(row.question_ids) ? row.question_ids.length : 0;
    return n === 0 ? null : `${n} question${n === 1 ? '' : 's'}`;
  }
  if (row.assignment_type === 'practice_test') {
    const sections = row.filter_criteria?.sections;
    if (sections && sections !== 'both') return `${sections.toUpperCase()} only`;
    return null;
  }
  return null;
}

function teacherName(teacher) {
  if (!teacher) return null;
  return [teacher.first_name, teacher.last_name].filter(Boolean).join(' ') || null;
}
