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
import { domainSection } from '@/lib/ui/question-layout';

export const dynamic = 'force-dynamic';

export default async function PracticeStartPage() {
  const { user, profile, supabase } = await requireUser();

  if (profile.role === 'admin') redirect('/admin');
  if (profile.role === 'teacher' || profile.role === 'manager') redirect('/tutor/dashboard');
  if (profile.role === 'practice') redirect('/subscribe');

  // Domain / skill lookup. v2 has taxonomy inline on questions_v2
  // so no separate taxonomy table join; one SELECT covers all the
  // filter UI needs. domain_code is pulled alongside domain_name
  // so the client can split the 8 domains into the design kit's
  // Math / R&W columns (via domainSection).
  const { data: questionRows } = await supabase
    .from('questions_v2')
    .select('domain_name, domain_code, skill_name, score_band')
    .eq('is_published', true)
    .eq('is_broken', false)
    .is('deleted_at', null)
    .not('domain_name', 'is', null)
    .limit(5000);

  const domainMap = new Map();
  const scoreBandSet = new Set();
  for (const row of questionRows ?? []) {
    if (row.domain_name) {
      let entry = domainMap.get(row.domain_name);
      if (!entry) {
        entry = { code: row.domain_code ?? null, skills: new Set(), total: 0 };
        domainMap.set(row.domain_name, entry);
      }
      entry.total += 1;
      if (row.domain_code && !entry.code) entry.code = row.domain_code;
      if (row.skill_name) entry.skills.add(row.skill_name);
    }
    if (row.score_band != null) scoreBandSet.add(row.score_band);
  }
  const domains = Array.from(domainMap.entries())
    .map(([name, e]) => ({
      name,
      code: e.code,
      section: domainSection(e.code),
      skills: Array.from(e.skills).sort(),
      total: e.total,
    }))
    .sort((a, b) => {
      // Math section first, then alphabetical within each section.
      if (a.section !== b.section) return a.section === 'math' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
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
