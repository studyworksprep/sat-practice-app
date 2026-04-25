// Teacher assignment-creation page. Server Component loads the data
// the form needs (the teacher's students, the taxonomy for the
// question filters, the list of practice tests, the list of lessons)
// and hands it to the client island that renders the form.
//
// All three assignment types live in one form. The client island
// toggles which field group is shown based on the selected type;
// the Server Action validates per-type on submit.

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { fetchAll } from '@/lib/supabase/fetchAll';
import { createAssignment } from './actions';
import { NewAssignmentInteractive } from './NewAssignmentInteractive';
import styles from './NewAssignmentInteractive.module.css';

export const dynamic = 'force-dynamic';

export default async function NewAssignmentPage() {
  const { user, profile, supabase } = await requireUser();

  if (profile.role === 'student' || profile.role === 'practice') {
    redirect('/dashboard');
  }
  if (!['teacher', 'manager', 'admin'].includes(profile.role)) {
    redirect('/');
  }

  // For managers + admins, also load the teachers under them for
  // the Trainees target. Teachers (non-managers) skip this query
  // and the form's target toggle is hidden for them.
  const isManagerScope = profile.role === 'manager' || profile.role === 'admin';

  // Taxonomy + difficulty/score-band distribution for the filter
  // form. We paginate so per-skill counts are never truncated by
  // PostgREST's max-rows cap — the `.limit(5000)` we used before
  // was the "db-max-rows silent-truncation" pattern the
  // architecture plan explicitly flags (Finding #1).
  const [
    { data: studentsRaw },
    questionRows,
    { data: practiceTests },
    { data: lessons },
    { data: teacherJunctions },
  ] = await Promise.all([
    supabase
      .from('student_practice_stats')
      .select('user_id, first_name, last_name, email')
      .order('last_name', { ascending: true, nullsFirst: false }),
    fetchAll((from, to) =>
      supabase
        .from('questions_v2')
        .select('domain_name, skill_name, difficulty, score_band')
        .eq('is_published', true)
        .eq('is_broken', false)
        .not('domain_name', 'is', null)
        .range(from, to),
    ),
    supabase
      .from('practice_tests_v2')
      .select('id, code, name')
      .eq('is_published', true)
      .is('deleted_at', null)
      .order('name', { ascending: true }),
    supabase
      .from('lessons')
      .select('id, title, status')
      .eq('status', 'published')
      .order('title', { ascending: true }),
    isManagerScope
      ? supabase
          .from('manager_teacher_assignments')
          .select('teacher_id')
          .eq('manager_id', user.id)
      : Promise.resolve({ data: [] }),
  ]);

  // Resolve the teacher profile cards once we know which ids.
  const teacherIds = (teacherJunctions ?? []).map((r) => r.teacher_id).filter(Boolean);
  const { data: teacherCards } = teacherIds.length > 0
    ? await supabase
        .from('profile_cards')
        .select('id, first_name, last_name, email')
        .in('id', teacherIds)
    : { data: [] };
  const teachers = (teacherCards ?? [])
    .map((t) => ({
      id: t.id,
      name: [t.first_name, t.last_name].filter(Boolean).join(' ') || t.email || 'Teacher',
      email: t.email,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Shape the students list for the picker.
  const students = (studentsRaw ?? [])
    .map((s) => ({
      id: s.user_id,
      name:
        [s.first_name, s.last_name].filter(Boolean).join(' ') || s.email || 'Student',
      email: s.email,
    }));

  // Taxonomy aggregation. For each (domain, skill) pair we track
  // which score bands actually have published questions, so the
  // form can only show bands the tutor could realistically select.
  // Also a global difficulty list (difficulty is applied
  // assignment-wide, not per-skill).
  const skillMap = {};        // domain → skill → Set(scoreBands)
  const skillCount = {};      // domain → skill → questions count
  const difficultiesSet = new Set();
  for (const row of questionRows) {
    if (!row.domain_name || !row.skill_name) continue;
    if (!skillMap[row.domain_name]) {
      skillMap[row.domain_name] = {};
      skillCount[row.domain_name] = {};
    }
    if (!skillMap[row.domain_name][row.skill_name]) {
      skillMap[row.domain_name][row.skill_name] = new Set();
      skillCount[row.domain_name][row.skill_name] = 0;
    }
    if (row.score_band != null) {
      skillMap[row.domain_name][row.skill_name].add(row.score_band);
    }
    skillCount[row.domain_name][row.skill_name] += 1;
    if (row.difficulty != null) difficultiesSet.add(row.difficulty);
  }
  const domains = Object.keys(skillMap)
    .sort()
    .map((domain) => ({
      name: domain,
      skills: Object.keys(skillMap[domain])
        .sort()
        .map((skill) => ({
          name: skill,
          scoreBands: Array.from(skillMap[domain][skill]).sort((a, b) => a - b),
          count: skillCount[domain][skill],
        })),
    }));
  const difficulties = Array.from(difficultiesSet).sort((a, b) => a - b);

  return (
    <main className={styles.container}>
      <a href="/tutor/assignments" className={styles.breadcrumb}>
        ← Your assignments
      </a>
      <header className={styles.header}>
        <div className={styles.eyebrow}>Assignment · New</div>
        <h1 className={styles.h1}>New assignment</h1>
        <p className={styles.sub}>
          Give your students a question set, a practice test, or a lesson.
        </p>
      </header>

      <NewAssignmentInteractive
        students={students}
        teachers={teachers}
        domains={domains}
        difficulties={difficulties}
        practiceTests={(practiceTests ?? []).map((pt) => ({ id: pt.id, label: pt.name ?? pt.code ?? pt.id }))}
        lessons={(lessons ?? []).map((l) => ({ id: l.id, title: l.title ?? 'Lesson' }))}
        createAction={createAssignment}
      />
    </main>
  );
}
