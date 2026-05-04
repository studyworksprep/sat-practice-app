// Sentry client-side instrumentation. Next 16 picks this file up
// automatically and runs its top-level Sentry.init before any other
// client code. No-ops when NEXT_PUBLIC_SENTRY_DSN is unset.
//
// Replays + tracing are intentionally off by default — student
// practice traffic is high-volume, so we'd burn through a budget
// quickly without thinking about retention. Turn on selectively
// when investigating a specific UX bug.

import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.05 : 0,
  // No replays, no PII by default. Each can be flipped on per-deploy
  // via env var if a particular incident benefits from them.
  replaysOnErrorSampleRate: 0,
  replaysSessionSampleRate: 0,
  sendDefaultPii: false,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
});

// Required by next/router so client-side navigations show up as
// continuations of the same trace as the server render.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
