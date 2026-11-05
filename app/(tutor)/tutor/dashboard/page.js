import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requireUser } from '@/lib/api/auth';
import { loadTutorDashboard } from '@/lib/practice/load-tutor-dashboard';
import { RosterFinder } from './RosterFinder';
import { ActivityFeed } from './ActivityFeed';
import { PageHeader } from '@/lib/ui/PageHeader';
import s from './Dashboard.module.css';

export const dynamic = 'force-dynamic';

export default async function TutorDashboardPage() {
  const { user, profile } = await requireUser();

  // Role gate. The (tutor) layout already enforces this, but
  // belt-and-suspenders keeps this page correct if the layout
  // ever goes missing.
  if (profile.role === 'student' || profile.role === 'practice') redirect('/dashboard');
  if (!['teacher', 'manager', 'admin'].includes(profile.role)) redirect('/');

  let payload;
  try {
    payload = await loadTutorDashboard(user.id);
  } catch (err) {
    return (
      <main className={s.container}>
        <PageHeader
          eyebrow="Teach · Dashboard"
          title={profile.first_name ? `Welcome back, ${profile.first_name}` : 'Welcome back'}
        />
        <div className={s.errorCard} role="alert">
          Failed to load students: {err?.message ?? String(err)}
        </div>
      </main>
    );
  }

  const { rawStudents, activities, activityUnavailable } = payload;
  const students = rawStudents.map((row) => ({
    id: row.user_id,
    name: [row.first_name, row.last_name].filter(Boolean).join(' ') || row.email || '—',
    email: row.email,
    targetScore: row.target_sat_score,
    highSchool: row.high_school,
    graduationYear: row.graduation_year,
  }));

  const cohort = {
    total: rawStudents.length,
    visible: students.length,
  };

  const greeting = profile.first_name
    ? `Welcome back, ${profile.first_name}`
    : 'Welcome back';

  return (
    <main className={s.container}>
      <PageHeader
        eyebrow="Teach · Dashboard"
        title={greeting}
        description={
          cohort.total === 0
            ? 'No students assigned yet.'
            : `${cohort.total} student${cohort.total === 1 ? '' : 's'} on your roster.`
        }
        actions={<Link href="/tutor/assignments/new" className={s.btnPrimary}>New assignment</Link>}
      />

      {/* ---------- Roster finder ---------- */}
      {cohort.total === 0 ? (
        <section className={s.card}>
          <div className={s.emptyHero}>
            <div className={s.empty}>
              You don&apos;t have any students assigned yet. Once an admin
              assigns them to you, they&apos;ll show up here.
            </div>
          </div>
        </section>
      ) : (
        <RosterFinder students={students} />
      )}

      {cohort.total > 0 && <ActivityFeed activities={activities} students={students} unavailable={activityUnavailable} />}
    </main>
  );
}
