// Teacher assignment-creation page. Server Component loads the data
// the form needs (the teacher's students, the taxonomy for the
// question filters, the practice tests, published lessons, lesson
// packs, and the teacher's saved templates) and hands it to the
// client island that renders the form.
//
// All four assignment types live in one form. The client island
// toggles which field group is shown based on the selected type;
// the Server Action validates per-type on submit.
//
// One-click authoring (§4.3) enters through search params, resolved
// server-side into a `prefill` prop:
//   ?from_student=<id> — "Assign from weaknesses": the student's
//     low-accuracy skills from the last 30 days land in the picker,
//     weighted heavier the more they were missed. Implies ?student=.
//   ?template=<id>     — apply a saved template's filter snapshot.

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { createAssignment } from './actions';
import { deleteAssignmentTemplate } from './template-actions';
import { NewAssignmentInteractive } from './NewAssignmentInteractive';
import styles from './NewAssignmentInteractive.module.css';

export const dynamic = 'force-dynamic';

// Same floors the session workspace's prep card uses for one
// student; window matches the performance page's 30 days.
const WEAKNESS_WINDOW_DAYS = 30;
const WEAKNESS_MIN_SKILL_ATTEMPTS = 3;
const WEAKNESS_MIN_STUDENT_ATTEMPTS = 3;
const WEAKNESS_ACCURACY_BELOW = 0.6;
const WEAKNESS_MAX_SKILLS = 6;

export default async function NewAssignmentPage({ searchParams }) {
  const { user, profile, supabase } = await requireUser();
  const params = (await searchParams) ?? {};

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
    { data: lessonRows },
    { data: templateRows },
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
    // Published lessons for the lesson assignment type (§4.3). The
    // student viewer only lists published lessons, so drafts never
    // appear here either.
    supabase
      .from('lessons')
      .select('id, title')
      .eq('status', 'published')
      .eq('visibility', 'shared')
      .order('title', { ascending: true }),
    // The teacher's template shelf. RLS is owner-scoped, but the
    // explicit filter keeps admins from seeing a cross-tutor menu.
    supabase
      .from('assignment_templates')
      .select('id, name, assignment_type, filter_criteria')
      .eq('teacher_id', user.id)
      .order('created_at', { ascending: false }),
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

  // ── One-click prefill (§4.3) ──────────────────────────────────
  // Resolved server-side so deep links stay short and the weak-skill
  // computation reuses the same RPC the session workspace trusts.
  // The client rehydrates availableBands/availableCount from the
  // taxonomy and silently drops skills that no longer exist.
  let prefill = null;

  const templateParam = typeof params.template === 'string' ? params.template : null;
  const fromStudentParam =
    typeof params.from_student === 'string' ? params.from_student : null;

  if (templateParam) {
    const t = (templateRows ?? []).find((row) => row.id === templateParam);
    const fc = t?.filter_criteria;
    if (t && fc && Array.isArray(fc.skillSelections)) {
      prefill = {
        label: `Template · ${t.name}`,
        skills: fc.skillSelections,
        difficulties: Array.isArray(fc.difficulties) ? fc.difficulties : [],
        size: typeof fc.size === 'number' ? fc.size : null,
        unansweredOnly: fc.unansweredOnly === true,
      };
    }
  } else if (fromStudentParam) {
    const since = new Date(
      Date.now() - WEAKNESS_WINDOW_DAYS * 86_400_000,
    ).toISOString();
    const { data: perfRows } = await supabase.rpc('get_roster_skill_performance', {
      p_roster: [fromStudentParam],
      p_since: since,
      p_min_skill_attempts: WEAKNESS_MIN_SKILL_ATTEMPTS,
      p_min_student_attempts: WEAKNESS_MIN_STUDENT_ATTEMPTS,
      p_struggling_threshold: WEAKNESS_ACCURACY_BELOW,
    });
    const weak = (perfRows ?? [])
      .filter((r) => r.attempts > 0 && r.accuracy < WEAKNESS_ACCURACY_BELOW)
      .sort((a, b) => b.missed - a.missed || a.accuracy - b.accuracy)
      .slice(0, WEAKNESS_MAX_SKILLS);
    if (weak.length > 0) {
      const studentRow = students.find((s) => s.id === fromStudentParam);
      prefill = {
        label: studentRow
          ? `${studentRow.name}'s weak skills, last ${WEAKNESS_WINDOW_DAYS} days`
          : `Weak skills, last ${WEAKNESS_WINDOW_DAYS} days`,
        // Heaviest-missed skills get more of the set: 2× / 1.5× / 1×.
        skills: weak.map((r, i) => ({
          domain: r.domain_name,
          skill: r.skill_name,
          scoreBands: [],
          weight: i === 0 ? 2 : i === 1 ? 1.5 : 1,
        })),
        difficulties: [],
        size: null,
        unansweredOnly: false,
      };
    }
  }

  const templates = (templateRows ?? []).map((t) => ({ id: t.id, name: t.name }));
  const lessons = (lessonRows ?? []).map((l) => ({ id: l.id, title: l.title ?? 'Untitled lesson' }));

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
        // The island seeds selection state in lazy useState
        // initializers, which don't re-run on a same-route
        // client-side navigation (e.g. picking a template). Keying
        // by the prefill source forces a remount whenever the
        // recipe changes.
        key={templateParam ?? fromStudentParam ?? 'blank'}
        students={students}
        teachers={teachers}
        domains={domains}
        difficulties={difficulties}
        practiceTests={(practiceTests ?? []).map((pt) => ({ id: pt.id, label: pt.name ?? pt.code ?? pt.id }))}
        lessonPacks={lessonPacks}
        lessons={lessons}
        templates={templates}
        prefill={prefill}
        createAction={createAssignment}
        deleteTemplateAction={deleteAssignmentTemplate}
      />
    </main>
  );
}
