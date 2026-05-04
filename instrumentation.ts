// Sentry instrumentation entry point. Next 16 calls `register()` once
// per runtime when the app boots; we re-route to runtime-specific
// init blocks because Sentry's nodejs and edge SDKs are different
// builds with different option sets.
//
// All three runtimes are no-ops when SENTRY_DSN is unset, which is
// the local-dev default. Set the DSN in the deploy environment to
// turn capture on.
//
// Capture surface, after this file is in place:
//
//   • Unhandled exceptions in Server Components, Server Actions,
//     route handlers, middleware (proxy.js).
//   • The ApiError throws inside lib/api/response.ts wrappers are
//     intentional 401/403/etc and are NOT forwarded to Sentry — only
//     unexpected exceptions are.
//   • onRequestError below adds full request context (method, route,
//     params) to every captured route-handler error.
//
// See docs/runbook.md "Observability" for env vars and the playbook
// for triaging an alert.

import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
      // Trace sampling. 10% in prod is enough to spot-check perf on
      // the hot routes without blowing out the Sentry budget. Bump
      // temporarily during incident triage; lower if it gets noisy.
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0,
      // Strip request bodies and headers that may carry PII or auth.
      sendDefaultPii: false,
      // Skip the SDK entirely when the DSN is unset so dev doesn't
      // pay the wrapper overhead.
      enabled: Boolean(process.env.SENTRY_DSN),
    });
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0,
      sendDefaultPii: false,
      enabled: Boolean(process.env.SENTRY_DSN),
    });
  }
}

// Next calls this on every uncaught route-handler / Server Component
// error. Forward to Sentry with the request metadata it gives us so
// the captured event has method + route attached automatically (no
// per-route boilerplate).
export const onRequestError = Sentry.captureRequestError;
