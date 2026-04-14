// Tutor training start page. See docs/architecture-plan.md §3.4.
//
// Tutors experience the exact same start-session UI as students —
// same filter form, same domain list, same resume banner — because
// the whole point of training mode is for tutors to see what their
// students see. The only differences from the student flow are:
//
//   - role gate allows teacher/manager/admin (not student/practice)
//   - createSession uses mode='training' so the rows can be
//     distinguished from real student practice sessions later
//   - resume link and post-create redirect point at /tutor/training
//     instead of /practice
//
// The shared StartInteractive client island handles both via the
// `basePath` prop. No UI divergence, no teacher-mode toggle, no
// client branching on role.

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { createTrainingSession } from './actions';
import { StartInteractive } from '@/lib/practice/StartInteractive';

export const dynamic = 'force-dynamic';

export default async function TutorTrainingStartPage() {
  const { user, profile, supabase } = await requireUser();

  // Role gate — inverse of the student practice page.
  if (profile.role === 'student' || profile.role === 'practice') {
    redirect('/practice/start');
  }
  if (!['teacher', 'manager', 'admin'].includes(profile.role)) {
    redirect('/');
  }

  // Same taxonomy query as the student start page.
  const { data: taxonomyRows } = await supabase
    .from('question_taxonomy')
    .select('domain_name, skill_name, difficulty')
    .eq('program', 'SAT')
    .not('domain_name', 'is', null)
    .limit(5000);

  const domainMap = {};
  for (const row of taxonomyRows ?? []) {
    if (!row.domain_name) continue;
    if (!domainMap[row.domain_name]) domainMap[row.domain_name] = new Set();
    if (row.skill_name) domainMap[row.domain_name].add(row.skill_name);
  }
  const domains = Object.keys(domainMap)
    .sort()
    .map((name) => ({ name, skills: Array.from(domainMap[name]).sort() }));

  // Active training session to resume? Filter by mode='training' so
  // the training flow never offers a lingering practice-mode session.
  const { data: activeSession } = await supabase
    .from('practice_sessions')
    .select('id, current_position, question_ids, last_activity_at')
    .eq('user_id', user.id)
    .eq('mode', 'training')
    .gt('expires_at', new Date().toISOString())
    .order('last_activity_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const resumeInfo = activeSession
    ? {
        sessionId: activeSession.id,
        position: activeSession.current_position,
        total: Array.isArray(activeSession.question_ids)
          ? activeSession.question_ids.length
          : 0,
        lastActivityAt: activeSession.last_activity_at,
      }
    : null;

  return (
    <StartInteractive
      domains={domains}
      resumeInfo={resumeInfo}
      createSessionAction={createTrainingSession}
      basePath="/tutor/training"
    />
  );
}
