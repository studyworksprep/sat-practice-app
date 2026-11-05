// Tutor-tree shared shell. Mirrors the student layout's role —
// mounts the app chrome on every tutor-facing new-tree page
// (dashboard, student detail, assignments, training) and keeps the
// role gate in one place so individual page.js files don't need to
// re-check it.
//
// Chrome: the sidebar_shell feature flag decides between the legacy
// top AppNav and the Phase 6.1 AppShell sidebar (lib/flags-server).
// Live runner surfaces (the tutor training runner) render bare — the
// suppression check lives INSIDE AppShell (client-side pathname),
// because layouts don't re-render on soft navigation.
//
// Admins land here too: they need to see their teachers' and
// managers' views during test drives, so the layout accepts
// teacher / manager / admin. Students / practice-only users
// bounce to their own tree. For role === 'admin' the nav comes
// out as the unified Operate · Teach · Train union (same union
// (admin)/layout.js renders) so the top bar doesn't switch
// identity when the admin moves between subtrees.

import { redirect } from 'next/navigation';
import { requireUserPage } from '@/lib/api/auth';
import { sidebarEnabledFor } from '@/lib/flags-server';
import { AppNav } from '@/lib/ui/AppNav';
import { AppShell } from '@/lib/ui/AppSidebar';
import { tutorLinksForRole, tutorSectionsForRole } from '@/lib/ui/nav-links';
import { DashboardHistory } from '@/lib/tutor/DashboardHistory';
import { loadTutorNavBadges } from '@/lib/tutor/nav-badges';

export default async function TutorTreeLayout({ children }) {
  const { user, profile, supabase } = await requireUserPage();

  if (profile.role === 'student' || profile.role === 'practice') redirect('/dashboard');
  if (!['teacher', 'manager', 'admin'].includes(profile.role)) redirect('/');

  const navUser = {
    email: user.email,
    role: profile.role,
    firstName: profile.first_name ?? null,
  };

  // "N behind" on Roster, "N late" on Assignments (teachers and
  // managers only; see lib/tutor/nav-badges). Loaded alongside the
  // flag read so the counts don't add a round trip to every page.
  const [sidebarOn, badges] = await Promise.all([
    sidebarEnabledFor(profile.role),
    loadTutorNavBadges(supabase, user.id, profile.role),
  ]);

  if (sidebarOn) {
    return (
      <AppShell user={navUser} sections={tutorSectionsForRole(profile.role)} badges={badges}>
        <DashboardHistory key={user.id} userId={user.id}>{children}</DashboardHistory>
      </AppShell>
    );
  }

  return (
    <>
      <AppNav user={navUser} links={tutorLinksForRole(profile.role)} />
      <DashboardHistory key={user.id} userId={user.id}>{children}</DashboardHistory>
    </>
  );
}
