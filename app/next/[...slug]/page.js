// Catch-all for the rebuild tree. The middleware rewrites every
// non-API URL for ui_version='next' users to /next/<path>; if
// the new tree has no concrete page at that path, the request
// resolves here instead of 404'ing.
//
// Behavior:
//   - Logged-in user → redirect to /dashboard. The new-tree
//     dashboard exists, has a working AppNav, and gives the user
//     a way home. Without this redirect, the catchall is the only
//     /next page that mounts no route-group layout, so it
//     renders with zero nav (the legacy NavBar above is gated to
//     ui_version='legacy' as of the dual-nav fix, and the
//     (student) / (tutor) / (admin) layouts only fire on their
//     own subtrees). Internal testers who explicitly want to see
//     the placeholder copy can read this file in source.
//   - Logged-out user → render the placeholder copy below. They
//     should never reach here in practice (the proxy redirects
//     unauthenticated requests off subscription-required paths
//     before this point), but the message stays as a fallback.
//
// Phase 6 (legacy retirement) deletes this file along with the
// rest of the parallel-build infrastructure.

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';

export default async function NextTreeCatchAllPlaceholder({ params }) {
  const resolvedParams = await params;
  const path = Array.isArray(resolvedParams?.slug)
    ? '/' + resolvedParams.slug.join('/')
    : '/';

  let user = null;
  try {
    ({ user } = await requireUser());
  } catch {
    // requireUser throws ApiError when there's no session — fall
    // through to the placeholder rather than surfacing a 401.
  }

  if (user) {
    redirect('/dashboard');
  }

  return (
    <main style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Rebuild tree — not yet wired up</h1>
      <p>
        Requested path: <code>{path}</code>
      </p>
      <p>
        This URL has no implementation in the rebuild tree yet. Sign
        in to land on the dashboard, or an admin can flip your
        account back to <code>ui_version=&apos;legacy&apos;</code> to
        reach the current product.
      </p>
    </main>
  );
}
