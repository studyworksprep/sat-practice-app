// Admin-tree shared shell. Mirrors the (student) and (tutor)
// layouts: requireUser to gate role + populate the nav, plus
// AppNav at the top.
//
// Until this layout was added, the admin tree had no top-level
// chrome at all — admin pages rendered without an AppNav, which
// made navigation between sections impossible without typing
// URLs by hand.
//
// The nav itself comes from tutorLinksForRole('admin'), which
// returns the unified Operate · Teach · Train union. Same call
// is used by (tutor)/layout.js and the (student) shared-infra
// path so the admin sees the identical nav no matter which
// subtree the page lives under — clicking "Dashboard" always
// means the admin overview, not the tutor dashboard.

import { redirect } from 'next/navigation';
import { requireUserPage } from '@/lib/api/auth';
import { AppNav } from '@/lib/ui/AppNav';
import { tutorLinksForRole } from '@/lib/ui/nav-links';

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

  return (
    <>
      <AppNav user={navUser} links={tutorLinksForRole(profile.role)} />
      {children}
    </>
  );
}
