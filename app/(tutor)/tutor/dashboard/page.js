// Tutor dashboard. Server-loaded roster and completions, with browser-local
// student shortcuts and lightweight action tracking in client components.
//
// Data sources:
//   - profiles (RLS-scoped via can_view) for the roster — name +
//     static profile detail only. Per-student perf metrics
//     deliberately dropped: the per-student detail page is where
//     that data belongs, and aggregating across the whole attempts
//     table on this surface was the slowest thing on the page.
//   - assignment_students_v2 (limit 8) for the "Recent assignments
//     completed" panel. Most tutors operate through assignments,
//     and practice-test assignments now auto-complete their
//     junction row when the attempt finishes, so this panel
//     covers question, lesson, and practice-test completions in
//     one place. Self-directed practice + practice tests are
//     still reachable through the roster → student page.
//
// Layout: banner with roster size, primary content panel
// (RosterFinder), secondary panel (recent assignment completions).

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requireUser } from '@/lib/api/auth';
import { formatRelativeShort } from '@/lib/formatters';
import { ClipboardCheckIcon } from '@/lib/ui/icons';
import { IconTile } from '@/lib/ui/IconTile';
import { loadTutorDashboard } from '@/lib/practice/load-tutor-dashboard';
import { RosterFinder } from './RosterFinder';
import { ReportLink } from './ReportLink';
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
        <header className={s.header}>
          <div className={s.eyebrow}>Tutor</div>
          <h1 className={s.h1}>
            {profile.first_name ? `Hi, ${profile.first_name}` : 'Tutor dashboard'}
          </h1>
        </header>
        <div className={s.errorCard} role="alert">
          Failed to load students: {err?.message ?? String(err)}
        </div>
      </main>
    );
  }

  const { rawStudents, recentCompletions } = payload;
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

  const studentsById = new Map(students.map((st) => [st.id, st]));

  // Resolve the report only when opened, keeping this page's load inexpensive.
  const completionRows = (recentCompletions ?? [])
    .filter((r) => r.assignment != null)
    .map((r) => {
      const a = r.assignment;
      const title =
        a.title
        ?? (a.assignment_type === 'practice_test' ? a.practice_test?.name : null)
        ?? (a.assignment_type === 'lesson' ? a.lesson?.title : null)
        ?? 'Assignment';
      return {
        id: `${a.id}:${r.student_id}`,
        studentId: r.student_id,
        reportHref: `/tutor/dashboard/review/${a.id}/${r.student_id}`,
        studentName: studentsById.get(r.student_id)?.name ?? '—',
        title,
        assignmentType: a.assignment_type,
        completedAt: r.completed_at,
      };
    });

  const greeting = profile.first_name
    ? `Welcome back, ${profile.first_name}.`
    : 'Welcome back.';

  return (
    <main className={s.container}>
      {/* ---------- Banner ---------- */}
      <section className={s.banner}>
        <div className={s.bannerText}>
          <div className={s.bannerGreeting}>{greeting}</div>
          <div className={s.bannerSub}>
            {cohort.total === 0
              ? 'No students assigned yet.'
              : `${cohort.total} student${cohort.total === 1 ? '' : 's'} on your roster`}
          </div>
        </div>
        <div className={s.bannerActions}>
          <Link href="/tutor/assignments/new" className={s.btnPrimary}>New assignment</Link>
        </div>
      </section>

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

      {/* ---------- Recent assignments completed ---------- */}
      {completionRows.length > 0 && (
        <section className={s.card}>
          <div className={s.cardHeader}>
            <div className={s.sectionLabel}>
              <IconTile icon={ClipboardCheckIcon} palette="success" size="sm" />
              Recent assignments completed
            </div>
            <div className={s.cardHeaderHint}>
              Open completed work directly to review it with your student.
            </div>
          </div>
          <ul className={s.testList}>
            {completionRows.map((row) => (
              <li key={row.id}>
                <ReportLink
                  href={row.reportHref}
                  studentId={row.studentId}
                  assignmentType={row.assignmentType}
                  className={s.testRow}
                >
                  <div className={s.testRowLeft}>
                    <div className={s.testRowName}>{row.studentName}</div>
                    <div className={s.testRowMeta}>
                      <span className={s.assignmentTypePill}>
                        {assignmentTypeLabel(row.assignmentType)}
                      </span>
                      {' '}
                      {row.title}
                      {' · '}
                      {formatRelativeShort(row.completedAt) ?? '—'}
                    </div>
                  </div>
                  <span className={s.reviewAction}>Review results →</span>
                </ReportLink>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

// ──────────────────────────────────────────────────────────────

function assignmentTypeLabel(type) {
  if (type === 'practice_test') return 'Practice test';
  if (type === 'lesson') return 'Lesson';
  return 'Questions';
}
