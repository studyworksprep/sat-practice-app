// Practice session start page. See docs/architecture-plan.md §3.7.
//
// Lightweight filter form that hands off to createSession Server
// Action. The action builds a practice_sessions row with a random-
// ordered slice of matching question ids, then redirects the user to
// /practice/s/[sessionId]/0 — the opaque session-position URL
// pattern from §3.7. URL manipulation after that point reveals
// nothing; the server maps (sessionId, position) → questionId.

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { createSession } from './actions';
import { StartInteractive } from './StartInteractive';

export const dynamic = 'force-dynamic';

export default async function PracticeStartPage() {
  const { user, profile, supabase } = await requireUser();

  if (profile.role === 'admin') redirect('/admin');
  if (profile.role === 'teacher' || profile.role === 'manager') redirect('/tutor/dashboard');
  if (profile.role === 'practice') redirect('/subscribe');

  // Fetch the filter options inline — domain list, difficulty options.
  // Small catalog data; RLS on question_taxonomy allows student reads.
  const { data: taxonomyRows } = await supabase
    .from('question_taxonomy')
    .select('domain_name, skill_name, difficulty')
    .eq('program', 'SAT')
    .not('domain_name', 'is', null)
    .limit(5000);

  // Build { domain: Set<skill> } and difficulty options from the rows.
  const domainMap = {};
  for (const row of taxonomyRows ?? []) {
    if (!row.domain_name) continue;
    if (!domainMap[row.domain_name]) domainMap[row.domain_name] = new Set();
    if (row.skill_name) domainMap[row.domain_name].add(row.skill_name);
  }
  const domains = Object.keys(domainMap)
    .sort()
    .map((name) => ({ name, skills: Array.from(domainMap[name]).sort() }));

  // Is there an active session we can offer to resume?
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
      createSessionAction={createSession}
    />
  );
}
