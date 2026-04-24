// Tutor → assignments list. Same design-kit vocabulary as the
// student /assignments hub: eyebrow + serif H1, stats strip,
// active section, archived section.
//
// Per-row aggregates come from the assignment_students_v2 join
// (one query, fanned out in memory). The "average accuracy"
// stat across active assignments is computed from a single
// attempts read scoped to active question-type assignments —
// that lets the tutor see at a glance how the cohort is doing
// on what they've assigned.

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

  // Teacher's own rows. Managers/admins see these too via can_view
  // on the teacher_id; this page focuses on what the caller has
  // created.
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
  const active = allAssignments.filter((a) => !a.archived_at);
  const archived = allAssignments.filter((a) => a.archived_at);

  const assignmentIds = allAssignments.map((a) => a.id);
  const { data: junctionRows } = assignmentIds.length
    ? await supabase
        .from('assignment_students_v2')
        .select('assignment_id, completed_at')
        .in('assignment_id', assignmentIds)
    : { data: [] };

  const statsByAssignment = new Map();
  for (const r of junctionRows ?? []) {
    const t = statsByAssignment.get(r.assignment_id) ?? { total: 0, completed: 0 };
    t.total += 1;
    if (r.completed_at) t.completed += 1;
    statsByAssignment.set(r.assignment_id, t);
  }

  // Cohort-wide stats — flat numbers across the active set.
  const totalAssignedRows = (junctionRows ?? []).filter((r) =>
    active.some((a) => a.id === r.assignment_id),
  );
  const totalAssignments = totalAssignedRows.length;
  const totalCompletions = totalAssignedRows.filter((r) => r.completed_at).length;
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();
  const overdueCount = active.filter(
    (a) => a.due_date && Date.parse(a.due_date) < nowMs,
  ).length;

  return (
    <main className={s.container}>
      <header className={s.header}>
        <div className={s.headerLeft}>
          <div className={s.eyebrow}>Tutor · Assignments</div>
          <h1 className={s.h1}>Your assignments</h1>
          <p className={s.sub}>
            Everything you&apos;ve assigned, with progress across each
            student. Click an assignment for the per-student detail.
          </p>
        </div>
        <Link href="/tutor/assignments/new" className={s.newBtn}>
          + New assignment
        </Link>
      </header>

      <div className={s.statsStrip}>
        <StatTile
          label="Active assignments"
          value={active.length}
          sub={archived.length > 0 ? `${archived.length} archived` : 'Nothing archived'}
        />
        <StatTile
          label="Student assignments"
          value={totalAssignments}
          sub={
            totalAssignments === 0
              ? 'No active assignments yet'
              : `Across ${active.length} active assignment${active.length === 1 ? '' : 's'}`
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
            {active.length} open
          </span>
        </div>
        {active.length === 0 ? (
          <EmptyCard
            title="Nothing active right now."
            body="Click + New assignment to send your first one."
          />
        ) : (
          <ul className={s.cardList}>
            {active.map((a) => (
              <li key={a.id}>
                <AssignmentRow
                  row={a}
                  stats={statsByAssignment.get(a.id) ?? { total: 0, completed: 0 }}
                  nowMs={nowMs}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {archived.length > 0 && (
        <section className={s.section}>
          <div className={s.sectionHead}>
            <h2 className={s.sectionTitle}>Archived</h2>
            <span className={s.sectionCount}>
              {archived.length} stored
            </span>
          </div>
          <ul className={s.cardList}>
            {archived.map((a) => (
              <li key={a.id}>
                <AssignmentRow
                  row={a}
                  stats={statsByAssignment.get(a.id) ?? { total: 0, completed: 0 }}
                  nowMs={nowMs}
                  archived
                />
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

function AssignmentRow({ row, stats, nowMs, archived = false }) {
  const title = row.title
    ?? (row.assignment_type === 'lesson' ? row.lesson?.title : null)
    ?? (row.assignment_type === 'practice_test' ? row.practice_test?.name : null)
    ?? 'Assignment';
  const subtitle = displaySubtitle(row);
  const completionPct =
    stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : null;
  const isOverdue =
    !archived && row.due_date && Date.parse(row.due_date) < nowMs;

  return (
    <Link
      href={`/tutor/assignments/${row.id}`}
      className={`${s.assignCard} ${archived ? s.assignCardArchived : ''}`}
    >
      <div className={s.assignTop}>
        <AssignmentTypeBadge type={row.assignment_type} />
        <div className={s.assignTitle}>{title}</div>
        {row.due_date && (
          <span className={isOverdue ? s.dueOverdue : s.dueOn}>
            {isOverdue ? 'Overdue' : 'Due'} · {formatShortDate(row.due_date)}
          </span>
        )}
      </div>
      {subtitle && <div className={s.assignSub}>{subtitle}</div>}
      <div className={s.assignFooter}>
        <span className={s.completionText}>
          <strong>{stats.completed}</strong> of <strong>{stats.total}</strong> students completed
          {completionPct != null && ` · ${completionPct}%`}
        </span>
        {stats.total > 0 && (
          <div className={s.completionBar}>
            <div
              className={s.completionBarFill}
              style={{ width: `${completionPct ?? 0}%` }}
            />
          </div>
        )}
      </div>
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
