/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // React Compiler (stable in Next 16) — automatic memoization across the
  // whole app. Reduces unnecessary re-renders without manual useMemo /
  // useCallback / React.memo. See docs/architecture-plan.md §3.9.
  // Build times can be higher with this enabled (uses Babel); keep an
  // eye on CI build duration and disable if the hit becomes severe.
  reactCompiler: true,
};
module.exports = nextConfig;
