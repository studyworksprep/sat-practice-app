// Student → blocked from every tutor + admin surface.
//
// Rewritten 2026-07-13 against the generated matrix. Role-gating no
// longer lives on GET-able HTTP routes (it moved to Server Actions +
// the route-group layouts), so the real "wrong role" boundary is
// page-level: a student cookie is valid auth, but the (tutor) and
// (admin) layouts must not render their surface to a student.
//
// This is the most common authorization-regression class — "a tutor/
// admin surface accidentally accepts students." The privileged heading
// must never appear; whether the layout redirects, 403s, or 404s is
// an implementation detail, so we assert the heading is absent.

import { test, expect } from '@playwright/test';
import { ADMIN_ONLY_PAGES, TUTOR_PAGES } from './helpers/fixtures';

test.describe('Student authenticated — role boundary', () => {
  for (const { path, heading } of [...ADMIN_ONLY_PAGES, ...TUTOR_PAGES]) {
    test(`student does not see ${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(
        page.getByRole('heading', { name: heading }),
        `student should not see the privileged heading at ${path}`,
      ).toHaveCount(0);
    });
  }
});
