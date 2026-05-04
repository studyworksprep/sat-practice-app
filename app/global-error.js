// Last-resort error boundary that catches errors in the root layout
// itself. Below this, segment-specific error.js files (under
// app/next/{tree}/error.js, etc.) catch their own subtree first.
//
// global-error must include its own <html>/<body> because it
// replaces the entire document when it renders.

'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

export default function GlobalError({ error }) {
  useEffect(() => {
    Sentry.captureException(error, {
      tags: { layer: 'global_error' },
      extra: { digest: error?.digest },
    });
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          fontFamily: 'system-ui, sans-serif',
          maxWidth: 640,
          margin: '4rem auto',
          padding: '0 1.5rem',
          color: '#1f2937',
        }}
      >
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>
          Something went wrong
        </h1>
        <p>
          The page failed to load. Please refresh; if the problem keeps
          happening, contact support and reference the digest below.
        </p>
        {error?.digest && (
          <p>
            Reference: <code>{error.digest}</code>
          </p>
        )}
      </body>
    </html>
  );
}
