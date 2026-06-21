// Next-tree /login. The marketing landing at /next (app/next/page.js)
// already renders HomeClient for unauthenticated visitors, but users
// who bookmark /login or land there from a post-logout redirect
// still need a working URL on the new tree. Behavior matches the
// root: if a session exists, bounce to the role-appropriate home;
// otherwise render the same HomeClient.

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { HomeClient } from '../HomeClient';

export const dynamic = 'force-dynamic';

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
      : role === 'practice' ? '/practice'
      : '/dashboard';
    redirect(dest);
  }

  return <HomeClient />;
}
