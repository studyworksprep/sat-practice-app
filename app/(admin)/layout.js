// Admin-tree shared shell. Mirrors the (student) and (tutor)
// layouts: requireUser to gate role + populate the nav, plus the
// app chrome at the top.
//
// Until this layout was added, the admin tree had no top-level
// chrome at all — admin pages rendered without an AppNav, which
// made navigation between sections impossible without typing
// URLs by hand.
//
// Chrome: the sidebar_shell feature flag decides between the legacy
// top AppNav and the Phase 6.1 AppShell sidebar (lib/flags-server).
// The nav config comes from tutorLinksForRole('admin') /
// tutorSectionsForRole('admin'), which return the unified
// Operate · Teach · Train union. The same call is used by
// (tutor)/layout.js and the (student) shared-infra path so the
// admin sees the identical nav no matter which subtree the page
// lives under — clicking "Dashboard"/"Overview" always means the
// admin overview, not the tutor dashboard.

import { redirect } from 'next/navigation';
import { requireUserPage } from '@/lib/api/auth';
import { sidebarEnabledFor } from '@/lib/flags-server';
import { AppNav } from '@/lib/ui/AppNav';
import { AppShell } from '@/lib/ui/AppSidebar';
import { tutorLinksForRole, tutorSectionsForRole } from '@/lib/ui/nav-links';

export default async function AdminTreeLayout({ children }) {
  const { user, profile } = await requireUserPage();

  // Admin-only. Other roles bounce to their natural landing page.
  if (profile.role !== 'admin') {
    if (profile.role === 'teacher' || profile.role === 'manager') {
      redirect('/tutor/dashboard');
    }
    if (profile.role === 'student') {
      redirect('/dashboard');
    }
    if (profile.role === 'practice') {
      redirect('/subscribe');
    }
    redirect('/');
  }

  const navUser = {
    email: user.email,
    role: profile.role,
    firstName: profile.first_name ?? null,
  };

  // No runner surfaces live under (admin), so no shell suppression
  // check here — admins reach runners through the (student) and
  // (tutor) trees, whose layouts handle it.
  if (await sidebarEnabledFor(profile.role)) {
    return (
      <AppShell user={navUser} sections={tutorSectionsForRole(profile.role)}>
        {children}
      </AppShell>
    );
  }

  return (
    <>
      <AppNav user={navUser} links={tutorLinksForRole(profile.role)} />
      {children}
    </>
  );
}
