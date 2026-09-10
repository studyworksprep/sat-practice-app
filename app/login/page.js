// Next-tree /login. The marketing landing at /next (app/next/page.js)
// already renders HomeClient for unauthenticated visitors, but users
// who bookmark /login or land there from a post-logout redirect
// still need a working URL on the new tree. Behavior matches the
// root: if a session exists, bounce to the role-appropriate home;
// otherwise render the same HomeClient.

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { HomeClient } from '../HomeClient';
import { publicPageMetadata, siteDescription } from '@/lib/config/site';

export const dynamic = 'force-dynamic';

// Canonical points at `/`, not at `/login`. This route renders the
// identical HomeClient surface, so the two URLs are the same page as
// far as a crawler is concerned; folding them together stops the pair
// from splitting their own ranking signals. /login is kept out of
// app/sitemap.ts for the same reason.
export const metadata = publicPageMetadata({
  path: '/',
  title: 'Log in — Studyworks',
  description: siteDescription,
});

export default async function NextLoginPage() {
  let profile = null;
  try {
    ({ profile } = await requireUser());
  } catch {
    // No session — fall through to render the login surface.
  }

  if (profile) {
    const role = profile.role;
    const dest =
      role === 'admin' ? '/admin'
      : role === 'teacher' || role === 'manager' ? '/tutor/dashboard'
      : role === 'contributor' ? '/contribute'
      : role === 'practice' ? '/practice'
      : '/dashboard';
    redirect(dest);
  }

  return <HomeClient />;
}
