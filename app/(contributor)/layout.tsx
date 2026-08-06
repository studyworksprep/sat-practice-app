// Contributor-tree shell.
//
// Its own route group because the audience is wider than any existing
// tree: tutors contribute (they hold the capability implicitly), and so
// do outside contributors, who have the `contributor` role, no roster,
// and no subscription. Putting /contribute under (tutor) would have
// locked the second group out at the layout.
//
// Chrome follows role. Staff keep the nav they already know so a trip
// to /contribute doesn't strand them; a contributor gets a nav with
// only the surfaces they can actually reach — everything else in the
// app would 403 or redirect, and a nav full of dead ends is worse than
// a short one.

import { redirect } from 'next/navigation';
import { requireUserPage } from '@/lib/api/auth';
import { sidebarEnabledFor } from '@/lib/flags-server';
import { AppNav } from '@/lib/ui/AppNav';
import { AppShell } from '@/lib/ui/AppSidebar';
import {
  tutorLinksForRole,
  tutorSectionsForRole,
  contributorLinks,
  contributorSections,
} from '@/lib/ui/nav-links';

export default async function ContributorTreeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, profile } = await requireUserPage();

  // The application-layer mirror of the DB's can_contribute().
  const isStaff = ['teacher', 'manager', 'admin'].includes(profile.role);
  const isContributor = profile.role === 'contributor';
  if (!isStaff && !isContributor) {
    if (profile.role === 'student') redirect('/dashboard');
    if (profile.role === 'practice') redirect('/practice/start');
    redirect('/');
  }

  // Supabase types user.email as optional (phone-only accounts exist);
  // this app is email-auth only, so the fallback is unreachable rather
  // than meaningful.
  const navUser = {
    email: user.email ?? '',
    role: profile.role,
    firstName: profile.first_name ?? null,
  };

  const sections = isStaff ? tutorSectionsForRole(profile.role) : contributorSections();
  const links = isStaff ? tutorLinksForRole(profile.role) : contributorLinks();

  if (await sidebarEnabledFor(profile.role)) {
    return (
      <AppShell user={navUser} sections={sections}>
        {children}
      </AppShell>
    );
  }

  return (
    <>
      <AppNav user={navUser} links={links} />
      {children}
    </>
  );
}
