// Shared error-boundary UI. Each app/next/**/error.js imports this
// and wires the reset callback that Next passes in.
//
// Next renders `error.js` when an error is thrown in the matching
// route segment (Server Component render, Server Action, or client
// component). The `error` and `reset` props are supplied by Next.
// `reset()` re-attempts rendering the same segment.
//
// In dev (NODE_ENV !== 'production') we show the error message so
// the developer sees what broke. In prod we stay generic — the
// error is still logged server-side by Next's default behavior.

'use client';

import { useEffect, useState } from 'react';
import * as Sentry from '@sentry/nextjs';
import { Button } from '@/lib/ui/Button';
import { Card } from '@/lib/ui/Card';

/**
 * @param {object} props
 * @param {Error}                  props.error   - from Next's error boundary
 * @param {() => void}             props.reset   - from Next's error boundary
 * @param {string}                 [props.title] - segment-specific heading
 * @param {string}                 [props.homeHref] - where the "back" link goes
 * @param {string}                 [props.homeLabel] - label for the "back" link
 */
export function ErrorScreen({
  error,
  reset,
  title = 'Something went wrong',
  homeHref = '/',
  homeLabel = 'Back',
}) {
  const showDetails = process.env.NODE_ENV !== 'production';

  // Forward to Sentry. Server-thrown errors carry an `error.digest`
  // that Next assigns; we also capture from the client side here so
  // hydration / interaction errors that the server never saw are
  // still reported. captureException returns an event id we can show
  // to the user for support correlation.
  const [eventId, setEventId] = useState(null);
  useEffect(() => {
    if (!error) return;
    const id = Sentry.captureException(error, {
      tags: { layer: 'react_error_boundary' },
      extra: { digest: error.digest },
    });
    setEventId(id);
  }, [error]);

  return (
    <main style={S.main}>
      <h1 style={S.h1}>{title}</h1>
      <Card tone="danger" style={S.card}>
        <p style={{ margin: 0 }}>
          The page ran into an error and couldn&apos;t finish rendering. You can
          try again; if it keeps failing, use the link below to go back and
          we&apos;ll look into it.
        </p>
        {(eventId || error?.digest) && (
          <p style={S.refLine}>
            Reference:{' '}
            <code style={S.code}>{eventId || error.digest}</code>
          </p>
        )}
        {showDetails && error?.message && (
          <pre style={S.pre}>
            {error.message}
            {error.digest && `\nDigest: ${error.digest}`}
          </pre>
        )}
      </Card>
      <div style={S.actions}>
        <Button onClick={reset}>Try again</Button>
        <Button variant="secondary" href={homeHref}>{homeLabel}</Button>
      </div>
    </main>
  );
}

const S = {
  main: {
    maxWidth: 720,
    margin: '3rem auto',
    padding: '0 1.5rem',
    fontFamily: 'system-ui, sans-serif',
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  h1: { fontSize: '1.5rem', fontWeight: 700, margin: 0 },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    fontSize: '0.95rem',
  },
  pre: {
    margin: 0,
    padding: '0.75rem',
    background: 'rgba(0,0,0,0.04)',
    border: '1px solid rgba(0,0,0,0.08)',
    borderRadius: 6,
    fontSize: '0.8rem',
    fontFamily: 'monospace',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  refLine: {
    margin: 0,
    fontSize: '0.85rem',
    color: 'var(--fg2, #555)',
  },
  code: {
    fontFamily: 'monospace',
    fontSize: '0.85rem',
    background: 'rgba(0,0,0,0.05)',
    padding: '1px 6px',
    borderRadius: 4,
  },
  actions: { display: 'flex', gap: '0.75rem' },
};
