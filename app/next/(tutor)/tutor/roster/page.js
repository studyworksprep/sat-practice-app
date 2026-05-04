// Tutor → Roster. Management surface for the tutor's student
// cohort. Distinct from /tutor/dashboard, which is a "find a
// student" landing surface; this page is "manage them" — search,
// filter (active / inactive), sort, quick-edit profile fields
// without leaving the list.
//
// Server Component for the data load (RLS-scoped profiles read);
// the search / filter / sort / quick-edit affordances live in
// RosterInteractive (client island). Per-student detail link
// goes to /tutor/students/[id].

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { RosterInteractive } from './RosterInteractive';
import s from './Roster.module.css';

export const dynamic = 'force-dynamic';

export default async function TutorRosterPage() {
  const { profile, supabase } = await requireUser();

  if (profile.role === 'student' || profile.role === 'practice') redirect('/dashboard');
  if (!['teacher', 'manager', 'admin'].includes(profile.role)) redirect('/');

  // Profiles read is RLS-scoped via can_view, so we get exactly
  // the tutor's roster without any extra filter here.
  const { data: rows } = await supabase
    .from('profiles')
    .select(
      'id, email, first_name, last_name, high_school, graduation_year, target_sat_score, sat_test_date, start_date, is_active',
    )
    .eq('role', 'student')
    .order('last_name', { ascending: true, nullsFirst: false })
    .order('first_name', { ascending: true, nullsFirst: false });

  const students = (rows ?? []).map((p) => ({
    id: p.id,
    email: p.email,
    firstName: p.first_name,
    lastName: p.last_name,
    highSchool: p.high_school,
    graduationYear: p.graduation_year,
    targetScore: p.target_sat_score,
    satTestDate: p.sat_test_date,
    startDate: p.start_date,
    isActive: p.is_active !== false, // null → treat as active
  }));

  return (
    <main className={s.container}>
      <header className={s.header}>
        <div className={s.eyebrow}>Tutor · Roster</div>
        <h1 className={s.h1}>Roster</h1>
        <p className={s.sub}>
          {students.length} student{students.length === 1 ? '' : 's'} ·
          {' '}{students.filter((st) => st.isActive).length} active.
          Use Quick edit to update profile fields without leaving
          this page.
        </p>
      </header>
      <RosterInteractive students={students} canEdit={['teacher', 'manager', 'admin'].includes(profile.role)} />
    </main>
  );
}
