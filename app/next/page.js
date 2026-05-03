// Root of the rebuild tree. Mirrors app/page.js: an authenticated
// caller gets redirected to a real landing page based on role, so
// flipped users don't get parked on a dead-end placeholder when
// they hit `/`. Logged-out callers fall through to the placeholder
// copy below.

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';

export default async function NextTreeRoot() {
  let profile = null;
  try {
    ({ profile } = await requireUser());
  } catch {
    // No session — show the placeholder. The proxy already
    // bounces unauthenticated requests off subscription-required
    // paths, so reaching here without a session is rare.
  }

  if (profile) {
    const role = profile.role;
    const dest =
      role === 'practice' ? '/practice'
      : role === 'teacher' || role === 'manager' ? '/tutor'
      : '/dashboard';
    redirect(dest);
  }

  return (
    <main style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Studyworks (rebuild preview)</h1>
      <p>
        You are on the rebuild tree. If you reached this page by
        accident, an admin can flip your account back to the legacy
        tree.
      </p>
    </main>
  );
}
