// Route-parity regression for the Phase 6 decommission prep.
//
// The /features/* marketing tour used to live only in the legacy
// tree (proxy.js kept it tree-agnostic). Decommissioning the legacy
// tree would have deleted it. Stage A of docs/decommission-plan.md
// ports the decks into app/next/features/* and drops /features from
// the proxy's TREE_AGNOSTIC_PREFIXES so next-default users get the
// new-tree copy.
//
// This spec is the guard: every /features/* URL must render its
// real content, NOT the app/next/[...slug] catch-all placeholder
// ("Rebuild tree — not yet wired up"). It runs anonymously — the
// marketing tour has no auth gate — so it needs no dev seed and is
// safe as a standing CI check.
//
// If this spec fails after the legacy tree is deleted, a marketing
// page was lost in the cut.

import { test, expect } from '@playwright/test';

const ROUTES: Array<{ path: string; marker: RegExp }> = [
  { path: '/features/students',                     marker: /SAT Practice That Actually/i },
  { path: '/features/teachers',                     marker: /The SAT Platform Built/i },
  { path: '/features/tutor-managers',               marker: /Train Your Tutors/i },
  { path: '/features/tutor-managers/demo/team-roster',    marker: /Team Roster/i },
  { path: '/features/tutor-managers/demo/cohort-reports', marker: /Tutor Team/i },
  { path: '/features/tutor-managers/demo/tutor-activity',  marker: /Tutor Training Activity/i },
];

test.describe('Marketing /features/* — next-tree parity', () => {
  for (const { path, marker } of ROUTES) {
    test(`GET ${path} renders the ported page`, async ({ page }) => {
      const res = await page.goto(path);
      expect(res?.status(), `${path} should respond 200`).toBe(200);

      // The real page content is present...
      await expect(page.getByText(marker).first()).toBeVisible();

      // ...and we did NOT fall through to the rebuild-tree catch-all,
      // which would mean the next-tree port is missing for this path.
      await expect(page.getByText(/rebuild tree/i)).toHaveCount(0);
    });
  }
});
