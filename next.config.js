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
module.exports = nextConfig;
