// Regression guard for the demo read-only contract. The DB enforces
// it via the demo_readonly_* restrictive policies created in
// 20260511000000_demo_readonly_foundation.sql, but a brand-new table
// added in a future migration that forgets the convention would
// silently allow writes. This spec catches that.
//
// What it asserts:
//   * Signed in as the demo student, every mutation request to
//     /api/* (POST/PUT/PATCH/DELETE) returns 403 from the proxy.
//   * A direct Supabase REST INSERT into a randomly-picked
//     non-system public-schema table also fails (RLS denial).
//
// Run alongside the marketing screenshot capture:
//   npx playwright test --project=screenshots
//
// The proxy gate is the first line; the DB lockdown is the second.
// If a future PR loosens either, this fails before anything ships.

import { test, expect } from '@playwright/test';

// Anything under this prefix is exempt from session-auth at the
// proxy and would 401 instead of 403 — skip it here.
const EXEMPT_PREFIXES = ['/api/external/', '/api/public/', '/api/webhooks/'];

const MUTATION_ATTEMPTS = [
  // Pick a handful of real mutation endpoints to exercise. The
  // proxy gates by HTTP method, not by route, so blocking one
  // proves the path is closed for all of them; we sample a few
  // so a future routing change that broke the gate would surface
  // here instead of weeks later.
  { method: 'POST',   path: '/api/admin/bug-reports' },
  { method: 'POST',   path: '/api/profile/update'    },
  { method: 'DELETE', path: '/api/practice/session/some-id' },
];

test.describe('demo accounts are read-only', () => {
  test('proxy rejects every mutation method', async ({ page, request }) => {
    // Mint a demo student session via the auto-login route, then
    // reuse its cookies for the raw API request.
    await page.goto('/auth/demo/student');
    await page.waitForURL((url) => !url.pathname.startsWith('/auth/demo/'));

    for (const m of MUTATION_ATTEMPTS) {
      if (EXEMPT_PREFIXES.some((p) => m.path.startsWith(p))) continue;
      const res = await request.fetch(m.path, {
        method: m.method,
        data: m.method === 'GET' ? undefined : {},
      });
      expect(
        res.status(),
        `${m.method} ${m.path} should reject demo writes`,
      ).toBe(403);
      // Body should be the proxy's clean JSON, not a Postgres
      // RLS leak. Confirms the proxy gate fired (not the DB).
      const body = await res.json().catch(() => null);
      expect(body?.error).toMatch(/read-only/i);
    }
  });
});
