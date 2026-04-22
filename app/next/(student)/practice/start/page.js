// Practice session start page.
//
// Server-side: load the domain/skill lookup and the distinct
// score_band values from questions_v2 so the filter form can
// offer them. Hand control to StartInteractive (client island)
// for the form itself + live count + submission.
//
// The practice page downstream of this one never sees filters —
// it reads question_ids[position] from the practice_sessions row
// and renders. That separation is the whole point of the
// fixed-list redesign: dumb viewer, smart generator.

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { createSession, countAvailable } from './actions';
import { StartInteractive } from '@/lib/practice/StartInteractive';

export const dynamic = 'force-dynamic';

export default async function PracticeStartPage() {
  const { user, profile, supabase } = await requireUser();

  if (profile.role === 'admin') redirect('/admin');
  if (profile.role === 'teacher' || profile.role === 'manager') redirect('/tutor/dashboard');
  if (profile.role === 'practice') redirect('/subscribe');

  // Domain / skill lookup. v2 has taxonomy inline on questions_v2
  // so no separate taxonomy table join; one SELECT covers all the
  // filter UI needs.
  const { data: questionRows } = await supabase
    .from('questions_v2')
    .select('domain_name, skill_name, score_band')
    .eq('is_published', true)
    .eq('is_broken', false)
    .is('deleted_at', null)
    .not('domain_name', 'is', null)
    .limit(5000);

  const domainMap = new Map();
  const scoreBandSet = new Set();
  for (const row of questionRows ?? []) {
    if (row.domain_name) {
      if (!domainMap.has(row.domain_name)) domainMap.set(row.domain_name, new Set());
      if (row.skill_name) domainMap.get(row.domain_name).add(row.skill_name);
    }
    if (row.score_band != null) scoreBandSet.add(row.score_band);
  }
  const domains = Array.from(domainMap.keys())
    .sort()
    .map((name) => ({ name, skills: Array.from(domainMap.get(name)).sort() }));
  const scoreBands = Array.from(scoreBandSet).sort((a, b) => a - b);

  // Active practice-mode session to offer resume. Filter to
  // mode='practice' so tutor training sessions don't bleed in.
  const { data: activeSession } = await supabase
    .from('practice_sessions')
    .select('id, current_position, question_ids, last_activity_at')
    .eq('user_id', user.id)
    .eq('mode', 'practice')
    .gt('expires_at', new Date().toISOString())
    .order('last_activity_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const resumeInfo = activeSession
    ? {
        sessionId: activeSession.id,
        position:  activeSession.current_position,
        total:     Array.isArray(activeSession.question_ids)
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
      createSessionAction={createSession}
      countAvailableAction={countAvailable}
      basePath="/practice"
    />
  );
}
