'use client';

// Error boundary for the /dashboard route. Replaces the generic
// Next.js "Application error: a client-side exception has occurred"
// fallback with something that:
//
//   1. Tells the student what happened in plain English so they don't
//      think the platform is broken on their account
//   2. Surfaces the actual error message and stack trace in a
//      collapsible details block, so when a student reports an issue
//      we get something concrete to act on
//   3. Offers a Try Again button that triggers Next.js's reset() so
//      they don't have to refresh manually
//
// This file is automatically picked up by Next.js's app router as
// the error boundary for everything under /dashboard. No imports
// from app/dashboard/page.js or DashboardClient.js are required.

import { useEffect } from 'react';
import Link from 'next/link';

export default function DashboardError({ error, reset }) {
  // Log the error to the browser console with full stack so it's
  // visible in DevTools and any client-side error monitoring tools.
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('[dashboard] caught client error:', error);
  }, [error]);

  return (
    <main className="container" style={{ padding: '60px 20px', maxWidth: 720 }}>
      <div className="card" style={{ padding: '32px 36px' }}>
        <h1 className="h2" style={{ marginTop: 0, marginBottom: 12 }}>
          Something went wrong loading your dashboard
        </h1>
        <p className="muted" style={{ marginBottom: 20, lineHeight: 1.6 }}>
          The page hit a client-side error before it could finish rendering.
          This is almost always a bug we can fix quickly — try the button
          below first, and if it keeps happening, copy the technical
          details and send them along.
        </p>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
          <button type="button" className="btn primary" onClick={() => reset()}>
            Try Again
          </button>
          <Link href="/practice" className="btn secondary">
            Go to Practice
          </Link>
          <Link href="/" className="btn secondary">
            Home
          </Link>
        </div>

        <details style={{ marginTop: 8 }}>
          <summary
            style={{
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 13,
              color: 'var(--muted)',
              marginBottom: 8,
            }}
          >
            Technical details
          </summary>
          <div
            style={{
              marginTop: 12,
              padding: '12px 14px',
              background: 'var(--surface, #f8fafc)',
              border: '1px solid var(--border, #e2e8f0)',
              borderRadius: 8,
              fontSize: 12,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              color: 'var(--text)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              maxHeight: 320,
              overflow: 'auto',
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 6 }}>
              {error?.name || 'Error'}: {error?.message || 'Unknown error'}
            </div>
            {error?.digest && (
              <div style={{ marginBottom: 6, color: 'var(--muted)' }}>
                Digest: {error.digest}
              </div>
            )}
            {error?.stack && <div>{error.stack}</div>}
          </div>
        </details>
      </div>
    </main>
  );
}
