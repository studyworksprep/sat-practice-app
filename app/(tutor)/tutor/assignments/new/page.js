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

  // Taxonomy for the question-filter form comes from the
  // published_question_taxonomy view — a DB-side GROUP BY over
  // questions_v2 that returns ~30 rows (one per skill) with the
  // score bands and difficulty list pre-aggregated. The old
  // fetchAll(questions_v2) shipped ~3,400 rows over 4 round-trips
  // and aggregated client-side; the view brings that down to one
  // round-trip and a ~3KB payload, which was the dominant cost in
  // the New Assignment page's initial load.
  const [
    { data: studentsRaw },
    { data: taxonomyRows },
    { data: practiceTests },
    { data: lessons },
    { data: teacherJunctions },
  ] = await Promise.all([
    supabase
      .from('student_practice_stats')
      .select('user_id, first_name, last_name, email')
      .order('last_name', { ascending: true, nullsFirst: false }),
    supabase
      .from('published_question_taxonomy')
      .select('domain_name, skill_name, question_count, score_bands, difficulties'),
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

  // Resolve the teacher rows once we know which ids. profile_cards
  // doesn't expose email; the picker uses email as a fallback when
  // a teacher has no first/last name. profiles_select via
  // can_view(id) covers the manager → teacher path that brings us
  // here.
  const teacherIds = (teacherJunctions ?? []).map((r) => r.teacher_id).filter(Boolean);
  const { data: teacherCards } = teacherIds.length > 0
    ? await supabase
        .from('profiles')
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

  // Reshape the pre-aggregated taxonomy rows (one per skill) into
  // the nested domain → skills[] structure the picker expects, and
  // collect the global difficulty list across skills. Difficulty
  // is applied assignment-wide, not per-skill, so the union across
  // skills is what the picker shows.
  const byDomain = new Map();
  const difficultiesSet = new Set();
  for (const r of taxonomyRows ?? []) {
    if (!byDomain.has(r.domain_name)) byDomain.set(r.domain_name, []);
    byDomain.get(r.domain_name).push({
      name: r.skill_name,
      scoreBands: [...(r.score_bands ?? [])].sort((a, b) => a - b),
      count: r.question_count ?? 0,
    });
    for (const d of r.difficulties ?? []) difficultiesSet.add(d);
  }
  const domains = Array.from(byDomain.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, skills]) => ({
      name,
      skills: skills.sort((a, b) => a.name.localeCompare(b.name)),
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
