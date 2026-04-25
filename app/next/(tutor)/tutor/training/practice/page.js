// Tutor → training practice. Filter form + live count + start
// button — same StartInteractive client island the student
// /practice/start page uses, just with training-mode actions.
//
// The shared island doesn't know about role; it just calls the
// actions it's handed. The training versions of countAvailable
// and createTrainingSession do the role-gate + mode='training'
// work.

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { domainSection } from '@/lib/ui/question-layout';
import { fetchAll } from '@/lib/supabase/fetchAll';
import { StartInteractive } from '@/lib/practice/StartInteractive';
import { countAvailable, createTrainingSession } from './actions';

export const dynamic = 'force-dynamic';

export default async function TutorTrainingPracticePage() {
  const { user, profile, supabase } = await requireUser();

  if (profile.role === 'student' || profile.role === 'practice') redirect('/practice/start');
  if (!['teacher', 'manager', 'admin'].includes(profile.role)) redirect('/');

  // Same paginated taxonomy load as the student start page —
  // counts can't be silently truncated by max-rows here either.
  const questionRows = await fetchAll((from, to) =>
    supabase
      .from('questions_v2')
      .select('domain_name, domain_code, skill_name, score_band')
      .eq('is_published', true)
      .eq('is_broken', false)
      .is('deleted_at', null)
      .not('domain_name', 'is', null)
      .range(from, to),
  );

  const domainMap = new Map();
  const scoreBandSet = new Set();
  for (const row of questionRows) {
    if (row.domain_name) {
      let entry = domainMap.get(row.domain_name);
      if (!entry) {
        entry = {
          code: row.domain_code ?? null,
          skills: new Map(),
          total: 0,
        };
        domainMap.set(row.domain_name, entry);
      }
      entry.total += 1;
      if (row.domain_code && !entry.code) entry.code = row.domain_code;
      if (row.skill_name) {
        entry.skills.set(
          row.skill_name,
          (entry.skills.get(row.skill_name) ?? 0) + 1,
        );
      }
    }
    if (row.score_band != null) scoreBandSet.add(row.score_band);
  }
  const domains = Array.from(domainMap.entries())
    .map(([name, e]) => ({
      name,
      code: e.code,
      section: domainSection(e.code),
      skills: Array.from(e.skills.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([skillName, count]) => ({ name: skillName, count })),
      total: e.total,
    }))
    .sort((a, b) => {
      if (a.section !== b.section) return a.section === 'math' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  const scoreBands = Array.from(scoreBandSet).sort((a, b) => a - b);

  // Active training session resumes via the banner on
  // StartInteractive. mode='training' filter keeps the resume
  // separate from any practice-mode session a teacher might
  // have started in another tree (training tree never offers a
  // resume of a non-training session).
  const { data: activeSession } = await supabase
    .from('practice_sessions')
    .select('id, current_position, question_ids, last_activity_at')
    .eq('user_id', user.id)
    .eq('mode', 'training')
    .eq('status', 'in_progress')
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
      scoreBands={scoreBands}
      resumeInfo={resumeInfo}
      createSessionAction={createTrainingSession}
      countAvailableAction={countAvailable}
      basePath="/tutor/training/practice"
    />
  );
}
