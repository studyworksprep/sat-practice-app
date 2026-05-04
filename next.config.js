const { withSentryConfig } = require('@sentry/nextjs');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // React Compiler (stable in Next 16) — automatic memoization across the
  // whole app. Reduces unnecessary re-renders without manual useMemo /
  // useCallback / React.memo. See docs/architecture-plan.md §3.9.
  // Build times can be higher with this enabled (uses Babel); keep an
  // eye on CI build duration and disable if the hit becomes severe.
  reactCompiler: true,
  // mathjax-full ships Node-specific CommonJS with dynamic requires
  // (including a runtime package.json lookup). Turbopack's "collect
  // configuration" build phase executes the page module to read its
  // route exports, and bundling mathjax-full into that chunk relocates
  // those requires — the relocated paths no longer resolve and the
  // build fails with "Cannot find module
  // '/vercel/path0/.next/server/package.json'". Marking the package
  // as external keeps it in node_modules at runtime so its requires
  // resolve unchanged. Only the admin draft-preview Server Component
  // imports mathjax-full; other route chunks are unaffected.
  serverExternalPackages: ['mathjax-full'],
};

// Sentry source-map upload + auto-instrumentation. Activates only
// when SENTRY_AUTH_TOKEN is set (i.e. on Vercel deploys); local dev
// builds leave the upload step inert. See instrumentation.ts and
// instrumentation-client.ts for the runtime init.
module.exports = withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Quieter local dev. The wrapper still injects the runtime SDK
  // (which itself no-ops without a DSN) but skips upload-related
  // build steps when no auth token is present.
  silent: !process.env.SENTRY_AUTH_TOKEN,

  // Hide the source-map files from the public build output so
  // they're uploaded to Sentry but not served to the browser.
  hideSourceMaps: true,

  // Disable the bundle-size telemetry — we don't need yet another
  // outbound request from every build.
  telemetry: false,

  // Tunnel client errors through a same-origin /monitoring route to
  // sidestep ad-blockers swallowing Sentry envelopes from the
  // browser. Costs nothing if the DSN is unset (Sentry just no-ops).
  tunnelRoute: '/monitoring',
});
