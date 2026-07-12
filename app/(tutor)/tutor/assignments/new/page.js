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
    { data: lessonPacksRaw },
    { data: lessonPackQuestionRows },
    { data: teacherJunctions },
  ] = await Promise.all([
    // The picker needs names/emails only, so read profiles directly.
    // (This used to select from student_practice_stats, whose
    // profiles-LEFT JOIN-attempts GROUP BY forces a full attempts
    // aggregation on every page load just to list names.) RLS on
    // profiles applies the same can_view() visibility the
    // security_invoker view relied on.
    supabase
      .from('profiles')
      .select('id, first_name, last_name, email')
      .eq('role', 'student')
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
    // Lesson packs owned by this teacher. RLS on lesson_packs is
    // owner-only, so we don't need an explicit teacher_id filter,
    // but adding it lets admins (who can see every pack) still get
    // an empty list here rather than a cross-tutor menu.
    supabase
      .from('lesson_packs')
      .select('id, name, updated_at')
      .eq('teacher_id', user.id)
      .order('updated_at', { ascending: false }),
    // One bulk junction query so we can show each pack's question
    // count in the picker without N+1.
    supabase
      .from('lesson_pack_questions')
      .select('pack_id'),
    // Embed the teacher profile through the FK so the Trainees
    // picker fills from this one query instead of a junction read
    // followed by a second profiles IN-lookup.
    isManagerScope
      ? supabase
          .from('manager_teacher_assignments')
          .select('teacher:profiles!teacher_id(id, first_name, last_name, email)')
          .eq('manager_id', user.id)
      : Promise.resolve({ data: [] }),
  ]);

  // Bucket junction rows by pack id so the picker shows "12
  // questions" next to each option.
  const countByPack = new Map();
  for (const r of lessonPackQuestionRows ?? []) {
    countByPack.set(r.pack_id, (countByPack.get(r.pack_id) ?? 0) + 1);
  }
  const lessonPacks = (lessonPacksRaw ?? [])
    .map((p) => ({
      id: p.id,
      name: p.name,
      questionCount: countByPack.get(p.id) ?? 0,
    }))
    // Empty packs aren't assignable (server action would reject
    // them too), so drop them from the picker entirely rather than
    // letting a tutor pick one and bounce off a validation error.
    .filter((p) => p.questionCount > 0);

  // Teacher rows arrive embedded on the junction query. profiles
  // RLS via can_view(id) covers the manager → teacher path; the
  // picker uses email as a fallback when a teacher has no
  // first/last name.
  const teachers = (teacherJunctions ?? [])
    .map((r) => r.teacher)
    .filter(Boolean)
    .map((t) => ({
      id: t.id,
      name: [t.first_name, t.last_name].filter(Boolean).join(' ') || t.email || 'Teacher',
      email: t.email,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Shape the students list for the picker.
  const students = (studentsRaw ?? [])
    .map((s) => ({
      id: s.id,
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
          Give your students a question set, a practice test, or one of your lesson packs.
        </p>
      </header>

      <NewAssignmentInteractive
        students={students}
        teachers={teachers}
        domains={domains}
        difficulties={difficulties}
        practiceTests={(practiceTests ?? []).map((pt) => ({ id: pt.id, label: pt.name ?? pt.code ?? pt.id }))}
        lessonPacks={lessonPacks}
        createAction={createAssignment}
      />
    </main>
  );
}
