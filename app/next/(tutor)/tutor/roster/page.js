// Tutor → Roster. Management surface for the tutor's student
// cohort. Distinct from /tutor/dashboard, which is a "find a
// student" landing surface; this page is "manage them" — search,
// filter (active / inactive), sort, quick-edit profile fields,
// archive / unarchive without leaving the list.
//
// Server Component for the data load (RLS-scoped profiles read +
// per-student score lookups for the archived view); the search,
// filter, sort, modal, and archive button live in RosterInteractive
// (client island). Per-student detail link goes to
// /tutor/students/[id].
//
// Archived students get a richer payload: starting score, final
// score, impact, and target reach %. Computed on the fly from
// their official scores + practice-test attempts so a recent
// addition surfaces without any "snapshot at archive time" step.
// See lib/practice/superscore.js for the math.

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { buildArchiveSummary } from '@/lib/practice/superscore';
import { RosterInteractive } from './RosterInteractive';
import s from './Roster.module.css';

export const dynamic = 'force-dynamic';

export default async function TutorRosterPage() {
  const { profile, supabase } = await requireUser();

  if (profile.role === 'student' || profile.role === 'practice') redirect('/dashboard');
  if (!['teacher', 'manager', 'admin'].includes(profile.role)) redirect('/');

  // Profiles read is RLS-scoped via can_view, so we get exactly
  // the tutor's roster without any extra filter here. created_at
  // is the signup timestamp — used as the start-date fallback for
  // students whose start_date hasn't been set explicitly.
  const { data: rows } = await supabase
    .from('profiles')
    .select(
      'id, email, first_name, last_name, high_school, graduation_year, target_sat_score, start_date, is_active, created_at',
    )
    .eq('role', 'student')
    .order('last_name', { ascending: true, nullsFirst: false })
    .order('first_name', { ascending: true, nullsFirst: false });

  const baseStudents = (rows ?? []).map((p) => {
    const startDate = p.start_date ?? null;
    return {
      id: p.id,
      email: p.email,
      firstName: p.first_name,
      lastName: p.last_name,
      highSchool: p.high_school,
      graduationYear: p.graduation_year,
      targetScore: p.target_sat_score,
      startDate,
      effectiveStartDate: startDate ?? p.created_at ?? null,
      isActive: p.is_active !== false, // null → treat as active
    };
  });

  // Score lookups for inactive students only — keep the active
  // path's row count unchanged. RLS still applies as the calling
  // user, so we only see what we're allowed to see.
  const inactiveIds = baseStudents.filter((st) => !st.isActive).map((st) => st.id);

  let officialByStudent = new Map();
  let practiceByStudent = new Map();

  if (inactiveIds.length > 0) {
    const [
      { data: officialRows },
      { data: practiceRows },
    ] = await Promise.all([
      supabase
        .from('sat_official_scores')
        .select('student_id, test_date, rw_score, math_score, composite_score')
        .in('student_id', inactiveIds),
      supabase
        .from('practice_test_attempts_v2')
        .select('user_id, finished_at, started_at, composite_score, rw_scaled, math_scaled, status')
        .in('user_id', inactiveIds)
        .eq('status', 'completed'),
    ]);

    for (const r of officialRows ?? []) {
      const arr = officialByStudent.get(r.student_id) ?? [];
      arr.push(r);
      officialByStudent.set(r.student_id, arr);
    }
    for (const r of practiceRows ?? []) {
      const arr = practiceByStudent.get(r.user_id) ?? [];
      arr.push({
        finished_at: r.finished_at,
        started_at: r.started_at,
        // For the practice-test fallback we use composite directly
        // (not superscored) — practice tests don't follow the
        // multi-sitting superscore convention.
        composite_score: r.composite_score,
        // RW + Math are passed too in case the superscore helper
        // ever wants them; today it only consumes them on official
        // rows.
        rw_score: r.rw_scaled,
        math_score: r.math_scaled,
      });
      practiceByStudent.set(r.user_id, arr);
    }
  }

  const students = baseStudents.map((st) => {
    if (st.isActive) return st;
    const summary = buildArchiveSummary({
      officialScores: officialByStudent.get(st.id) ?? [],
      practiceTests: practiceByStudent.get(st.id) ?? [],
      startDate: st.effectiveStartDate,
      targetScore: st.targetScore,
    });
    return { ...st, archive: summary };
  });

  return (
    <main className={s.container}>
      <header className={s.header}>
        <div className={s.eyebrow}>Tutor · Roster</div>
        <h1 className={s.h1}>Roster</h1>
        <p className={s.sub}>
          {students.length} student{students.length === 1 ? '' : 's'} ·
          {' '}{students.filter((st) => st.isActive).length} active.
          Archive a student to move them to the past-students view
          with their starting / final score summary.
        </p>
      </header>
      <RosterInteractive students={students} canEdit={['teacher', 'manager', 'admin'].includes(profile.role)} />
    </main>
  );
}
