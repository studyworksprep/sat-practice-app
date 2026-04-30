// Admin-tree shared shell. Mirrors the (student) and (tutor)
// layouts: requireUser to gate role + populate the nav, plus
// AppNav at the top.
//
// Until this layout was added, the admin tree had no top-level
// chrome at all — admin pages rendered without an AppNav, which
// made navigation between sections impossible without typing
// URLs by hand.

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { AppNav } from '@/lib/ui/AppNav';
import { ADMIN_LINKS } from '@/lib/ui/nav-links';

export default async function AdminTreeLayout({ children }) {
  const { user, profile } = await requireUser();

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
      <AppNav user={navUser} links={ADMIN_LINKS} />
      {children}
    </>
  );
}
