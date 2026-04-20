// ESLint flat config. Replaces the legacy `next lint` step removed in
// Next 16. See docs/upgrades/nextjs-16-upgrade-guide.md.
//
// Severity choices match the effective behavior of `next lint` on this
// codebase before the upgrade — most of the rules below were warnings
// or disabled entirely under the legacy config, and the rebuild plan
// (docs/architecture-plan.md) addresses the underlying issues in later
// phases:
//
// - @next/next/no-img-element: pre-existing <img> usage, addressed in
//   Phase 4 frontend simplification (shared <Image>-based components).
// - @next/next/no-html-link-for-pages: a few raw <a> tags in the
//   marketing pages; harmless, addressed in Phase 4.
// - @typescript-eslint/no-unused-vars: warning is enough; we don't have
//   TypeScript yet, so unused vars are dev-loop noise rather than
//   correctness issues.
// - @typescript-eslint/no-require-imports: scripts/ is plain Node.js
//   CommonJS and stays that way; ignored entirely.

import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      // Plain Node.js scripts; CommonJS by design.
      "scripts/**",
      // Captured upstream documentation; not our code.
      "docs/upgrades/**",
    ],
  },
  {
    rules: {
      // Pre-existing patterns the rebuild plan addresses in later phases.
      // Downgraded to warnings so CI doesn't block on them.
      "@next/next/no-img-element": "warn",
      "@next/next/no-html-link-for-pages": "warn",
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-unused-expressions": "warn",
      // We're a JS codebase; require() is allowed where it appears.
      "@typescript-eslint/no-require-imports": "off",
      // Cosmetic — apostrophes in JSX text. Not a runtime issue.
      "react/no-unescaped-entities": "off",

      // ── React Compiler diagnostics from eslint-plugin-react-hooks v6 ──
      // These are NEW rules that surface compiler issues in legacy code.
      // The build still succeeds — the compiler just falls back to not
      // memoizing the affected components — so these are downgraded to
      // warnings rather than blocking errors. Phase 4 of the rebuild
      // (frontend simplification + file decomposition) is the natural
      // place to address them. See docs/architecture-plan.md §3.9 and
      // the architecture-plan Phase 4 section.
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/set-state-in-render": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/static-components": "warn",
      "react-hooks/gating": "warn",
      "react-hooks/globals": "warn",
      "react-hooks/use-memo": "warn",
      "react-hooks/component-hook-factories": "warn",
      "react-hooks/error-boundaries": "warn",
      "react-hooks/incompatible-library": "warn",
      "react-hooks/unsupported-syntax": "warn",
    },
  },
];

export default eslintConfig;
