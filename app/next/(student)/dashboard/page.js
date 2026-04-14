// Student dashboard — reference implementation for the Phase 2
// Server-Component-first pattern. See docs/architecture-plan.md §3.4,
// §3.9, and Phase 2 in §4.
//
// Shape of every Phase 2 page:
//
//   page.js               — async Server Component; fetches data, renders
//   actions.js            — 'use server' module with Server Actions
//   <Name>Interactive.js  — small 'use client' island for interactivity
//
// The page component is a Server Component (no 'use client'). It runs
// on the server, reads from Supabase directly via the Phase 1 auth
// helper, and hands data + Server Action references to the client
// island as props. No HTTP round-trip. No /api/dashboard route. No
// useEffect + fetch.
//
// This page replaces the Phase 2 target of deleting /api/dashboard,
// /api/dashboard/stats, app/dashboard/page.js, and the 1,070-line
// app/dashboard/DashboardClient.js once the legacy tree is
// decommissioned in Phase 6. Until then, it only serves users with
// ui_version='next' via the proxy rewrite in proxy.js.

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { updateTargetScore } from './actions';
import { DashboardInteractive } from './DashboardInteractive';

// Explicit dynamic declaration — we read auth state on every render.
// Next 16's default is dynamic unless all fetches are cacheable, but
// per §1.5.6 we declare it explicitly to make the intent obvious.
export const dynamic = 'force-dynamic';

export default async function StudentDashboardPage() {
  const { user, profile, supabase } = await requireUser();

  // Route non-students to their own dashboards. Admins/teachers/
  // managers land here only if their ui_version flip raced ahead of
  // their role check — redirect them to the correct tree. Practice-
  // only users bounce to the subscribe flow.
  if (profile.role === 'admin') redirect('/admin');
  if (profile.role === 'teacher' || profile.role === 'manager') redirect('/tutor/dashboard');
  if (profile.role === 'practice') redirect('/subscribe');

  // Fetch the dashboard's data inline. Each query runs with the
  // caller's RLS context — no service-role bypass. Run in parallel
  // via Promise.all; the Server Component suspends until all resolve.
  const [
    { data: fullProfile },
    { count: totalAttempts },
    { count: correctAttempts },
    { data: lastActivity },
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('first_name, last_name, target_sat_score, high_school, graduation_year, sat_test_date')
      .eq('id', user.id)
      .maybeSingle(),
    supabase
      .from('attempts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('source', 'practice'),
    supabase
      .from('attempts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('source', 'practice')
      .eq('is_correct', true),
    supabase
      .from('attempts')
      .select('created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  // Derived view-model. Kept in the Server Component so the client
  // island receives something flat and immediately renderable.
  const accuracy =
    totalAttempts && totalAttempts > 0
      ? Math.round(((correctAttempts ?? 0) / totalAttempts) * 100)
      : null;

  const stats = {
    firstName: fullProfile?.first_name ?? null,
    targetScore: fullProfile?.target_sat_score ?? null,
    satTestDate: fullProfile?.sat_test_date ?? null,
    totalAttempts: totalAttempts ?? 0,
    correctAttempts: correctAttempts ?? 0,
    accuracy,
    lastActivityAt: lastActivity?.created_at ?? null,
  };

  return (
    <DashboardInteractive
      stats={stats}
      updateTargetScoreAction={updateTargetScore}
    />
  );
}
