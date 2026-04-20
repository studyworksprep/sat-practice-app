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

export const dynamic = 'force-dynamic';

export default async function NewAssignmentPage() {
  const { profile, supabase } = await requireUser();

  if (profile.role === 'student' || profile.role === 'practice') {
    redirect('/dashboard');
  }
  if (!['teacher', 'manager', 'admin'].includes(profile.role)) {
    redirect('/');
  }

  const [
    { data: studentsRaw },
    { data: questionRows },
    { data: practiceTests },
    { data: lessons },
  ] = await Promise.all([
    // The teacher's visible students via the unified view. RLS uses
    // can_view() on the underlying tables — same pattern as the
    // dashboard — so managers see their tutors' students too.
    supabase
      .from('student_practice_stats')
      .select('user_id, first_name, last_name, email')
      .order('last_name', { ascending: true, nullsFirst: false }),
    // Taxonomy + difficulty/score-band distribution for the filter form.
    supabase
      .from('questions_v2')
      .select('domain_name, skill_name, difficulty, score_band')
      .eq('is_published', true)
      .eq('is_broken', false)
      .not('domain_name', 'is', null)
      .limit(5000),
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
  ]);

  // Shape the students list for the picker.
  const students = (studentsRaw ?? [])
    .map((s) => ({
      id: s.user_id,
      name:
        [s.first_name, s.last_name].filter(Boolean).join(' ') || s.email || 'Student',
      email: s.email,
    }));

  // Taxonomy: { domain: [skills] }; difficulties + score-bands seen.
  const domainMap = {};
  const difficultiesSet = new Set();
  const scoreBandsSet = new Set();
  for (const row of questionRows ?? []) {
    if (!row.domain_name) continue;
    if (!domainMap[row.domain_name]) domainMap[row.domain_name] = new Set();
    if (row.skill_name) domainMap[row.domain_name].add(row.skill_name);
    if (row.difficulty != null) difficultiesSet.add(row.difficulty);
    if (row.score_band != null) scoreBandsSet.add(row.score_band);
  }
  const domains = Object.keys(domainMap)
    .sort()
    .map((name) => ({ name, skills: Array.from(domainMap[name]).sort() }));
  const difficulties = Array.from(difficultiesSet).sort((a, b) => a - b);
  const scoreBands = Array.from(scoreBandsSet).sort((a, b) => a - b);

  return (
    <main style={{ maxWidth: 880, margin: '2rem auto', padding: '0 1.5rem', fontFamily: 'system-ui, sans-serif' }}>
      <nav style={{ marginBottom: '1rem' }}>
        <a href="/tutor/assignments" style={{ color: '#2563eb', textDecoration: 'none', fontSize: '0.9rem' }}>
          ← Your assignments
        </a>
      </nav>
      <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.25rem' }}>
        New assignment
      </h1>
      <p style={{ color: '#4b5563', marginTop: 0 }}>
        Give your students a question set, a practice test, or a lesson.
      </p>

      <NewAssignmentInteractive
        students={students}
        domains={domains}
        difficulties={difficulties}
        scoreBands={scoreBands}
        practiceTests={(practiceTests ?? []).map((pt) => ({ id: pt.id, label: pt.name ?? pt.code ?? pt.id }))}
        lessons={(lessons ?? []).map((l) => ({ id: l.id, title: l.title ?? 'Lesson' }))}
        createAction={createAssignment}
      />
    </main>
  );
}
