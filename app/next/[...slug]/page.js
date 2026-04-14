// Catch-all placeholder for the rebuild tree. Any URL that the
// middleware rewrites into app/next/* and doesn't yet have a concrete
// implementation lands here, so Phase 1 internal-account testers see an
// honest "under construction" page instead of a Next.js 404.
//
// Phase 2 fills in concrete pages under app/next/dashboard/,
// app/next/practice/, etc., and this catch-all recedes to covering only
// genuinely-missing routes. By Phase 6 it's deleted along with the rest
// of the parallel-build infrastructure.

export default async function NextTreeCatchAllPlaceholder({ params }) {
  // Forward-compatible: `await params` is a no-op on Next 14 (plain object)
  // and required on Next 16 (Promise). See docs/architecture-plan.md §1.5.6.
  const resolvedParams = await params;
  const path = Array.isArray(resolvedParams?.slug) ? '/' + resolvedParams.slug.join('/') : '/';
  return (
    <main style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Rebuild tree — not yet wired up</h1>
      <p>
        Requested path: <code>{path}</code>
      </p>
      <p>
        This URL has no implementation in the rebuild tree yet. It will
        land in a future phase of the migration. If you need to use this
        page today, an admin can flip your account back to{' '}
        <code>ui_version=&apos;legacy&apos;</code> and you&apos;ll return
        to the current product.
      </p>
    </main>
  );
}
