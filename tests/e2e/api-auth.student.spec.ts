// Student → 403 on every tutor + admin API route.
//
// Covers matrix §3.2 (role-gated) from the wrong-role angle. A
// student cookie is valid auth (so requireUser passes) but
// requireRole should reject before any data is touched.
//
// This is the most common authorization-regression class:
// "tutor route accidentally accepts students because someone
// swapped requireRole for requireUser." The matrix anchors say
// every one of these should 403, never 200-with-empty-payload.

import { test, expect } from '@playwright/test';
import { ROLE_GATED_ROUTES, STUDENT_SCOPED_ROUTES, USERS } from './helpers/fixtures';

test.describe('Student authenticated', () => {
  // Tutor/admin role-gated routes — student is NOT in the allowed
  // set for any of these.
  for (const { url } of ROLE_GATED_ROUTES) {
    test(`403 GET ${url}`, async ({ request }) => {
      const res = await request.get(url);
      expect(res.status(), `unexpected ${res.status()} for ${url}`).toBe(403);
    });
  }

  // Student-scoped tutor routes — same shape, with one of the
  // tutor's own students as the URL parameter so an authorization
  // hole can't be hidden behind "the student happens to not be on
  // a roster, so RLS drops the row."
  for (const url of STUDENT_SCOPED_ROUTES(USERS.student1.id)) {
    test(`403 GET ${url}`, async ({ request }) => {
      const res = await request.get(url);
      expect(res.status(), `unexpected ${res.status()} for ${url}`).toBe(403);
    });
  }

  // Page-level: student should not reach the tutor dashboard. The
  // (tutor) layout's role gate redirects elsewhere.
  test('student visiting /tutor/dashboard does not see tutor content', async ({ page }) => {
    const res = await page.goto('/tutor/dashboard');
    expect(res, 'navigation should resolve').not.toBeNull();
    // Either redirected away (200 on a different page) or 403/404 —
    // any of those is acceptable. Definitely should NOT show the
    // tutor dashboard heading.
    await expect(page.getByRole('heading', { name: /tutor dashboard/i })).toHaveCount(0);
  });
});
