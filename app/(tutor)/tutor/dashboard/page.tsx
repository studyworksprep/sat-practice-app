// Tutor dashboard — the tutor's week at a glance.
//
//   PageHeader — greeting, "N students · M need you this week", the
//     student finder and New assignment.
//   Four count tiles — practiced this week, behind on their plan,
//     overdue assignments (the sidebar's "late" count), tests in the
//     next 30 days.
//   Left: Needs your attention (lib/tutor/dashboard-attention — plan
//     behind, overdue work, a week without practice; most urgent
//     first) above Recent work (the activity feed grouped by day).
//   Right: Your students — last active, test date, latest practice
//     test score against the goal.

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requireUser } from '@/lib/api/auth';
import { loadTutorDashboard } from '@/lib/practice/load-tutor-dashboard';
import { buildAttention, buildDashboardTiles, dashboardSummary } from '@/lib/tutor/dashboard-attention';
import { PageHeader } from '@/lib/ui/PageHeader';
import { RosterFinder } from './RosterFinder';
import { ActivityFeed } from './ActivityFeed';
import { AttentionCard, CountTiles, StudentsPanel } from './DashboardSections';
import s from './Dashboard.module.css';

export const dynamic = 'force-dynamic';

export default async function TutorDashboardPage() {
  const { user, profile } = await requireUser();

  // Role gate. The (tutor) layout already enforces this, but
  // belt-and-suspenders keeps this page correct if the layout
  // ever goes missing.
  if (profile.role === 'student' || profile.role === 'practice') redirect('/dashboard');
  if (!['teacher', 'manager', 'admin'].includes(profile.role)) redirect('/');

  const greeting = profile.first_name ? `Welcome back, ${profile.first_name}` : 'Welcome back';

  let payload;
  try {
    payload = await loadTutorDashboard(user.id);
  } catch (err) {
    return (
      <main className={s.container}>
        <PageHeader eyebrow="Teach · Dashboard" title={greeting} />
        <div className={s.errorCard} role="alert">
          Failed to load students: {err instanceof Error ? err.message : String(err)}
        </div>
      </main>
    );
  }

  const { rawStudents, activities, activityUnavailable, signals, lateAssignments, signalsUnavailable } = payload;
  const students = rawStudents.map((row) => ({
    id: row.user_id,
    name: [row.first_name, row.last_name].filter(Boolean).join(' ') || row.email || '—',
    email: row.email,
    highSchool: row.high_school,
  }));

  // eslint-disable-next-line react-hooks/purity -- a request-time snapshot, not render state
  const nowMs = Date.now();
  const attention = buildAttention(signals, nowMs);
  const tiles = buildDashboardTiles(signals, lateAssignments, nowMs);

  const actions = (
    <>
      {students.length > 0 && <RosterFinder students={students} />}
      <Link href="/tutor/assignments/new" className={s.btnPrimary}>New assignment</Link>
    </>
  );

  if (students.length === 0) {
    return (
      <main className={s.container}>
        <PageHeader eyebrow="Teach · Dashboard" title={greeting} description={dashboardSummary(0, 0)} actions={actions} />
        <section className={s.card}>
          <p className={s.empty}>
            You don&apos;t have any students assigned yet. Once an admin
            assigns them to you, they&apos;ll show up here.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className={s.container}>
      <PageHeader
        eyebrow="Teach · Dashboard"
        title={greeting}
        description={dashboardSummary(students.length, signalsUnavailable ? null : attention.length)}
        actions={actions}
      />

      {signalsUnavailable ? (
        <p role="alert" className={s.errorNote}>
          This week&apos;s student signals couldn&apos;t be loaded. Refresh to try again.
        </p>
      ) : (
        <CountTiles tiles={tiles} />
      )}

      <div className={s.layout}>
        <div className={s.mainCol}>
          {!signalsUnavailable && <AttentionCard rows={attention} />}
          <ActivityFeed activities={activities} students={students} unavailable={activityUnavailable} />
        </div>
        {!signalsUnavailable && <StudentsPanel students={signals} nowMs={nowMs} />}
      </div>
    </main>
  );
}
