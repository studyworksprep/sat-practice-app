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
import { StartInteractive } from '@/lib/practice/StartInteractive';

export const dynamic = 'force-dynamic';

export default async function PracticeStartPage() {
  const { user, profile, supabase } = await requireUser();

  if (profile.role === 'admin') redirect('/admin');
  if (profile.role === 'teacher' || profile.role === 'manager') redirect('/tutor/dashboard');
  if (profile.role === 'practice') redirect('/subscribe');

  // Fetch the filter options inline — domain list + skills per domain,
  // drawn from questions_v2 (the v2 schema has taxonomy inline, no
  // separate question_taxonomy join needed).
  const { data: questionRows } = await supabase
    .from('questions_v2')
    .select('domain_name, skill_name')
    .eq('is_published', true)
    .eq('is_broken', false)
    .not('domain_name', 'is', null)
    .limit(5000);

  // Build { domain: Set<skill> } from the rows.
  const domainMap = {};
  for (const row of questionRows ?? []) {
    if (!row.domain_name) continue;
    if (!domainMap[row.domain_name]) domainMap[row.domain_name] = new Set();
    if (row.skill_name) domainMap[row.domain_name].add(row.skill_name);
  }
  const domains = Object.keys(domainMap)
    .sort()
    .map((name) => ({ name, skills: Array.from(domainMap[name]).sort() }));

  // Is there an active practice-mode session we can offer to resume?
  // Tutors see their own training-mode session via /tutor/training;
  // this query is filtered to mode='practice' so the student flow
  // never offers to resume a tutor's training session and vice versa.
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
      basePath="/practice"
    />
  );
}
