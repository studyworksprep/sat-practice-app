// Teacher → blocked from every admin surface.
//
// Rewritten 2026-07-13 against the generated matrix. Admin role-gating
// moved off HTTP routes into Server Actions + the (admin) layout, so
// the testable boundary is page-level: a teacher cookie is valid auth
// and passes the tutor gate, but the (admin) layout must not render to
// a teacher. Catches "an admin surface accidentally allows teachers."
//
// The teacher's own green paths (tutor dashboard/roster) and the
// cross-roster can_view boundary (student2 → 404) are covered in
// page-auth.teacher.spec.ts.

import { test, expect } from '@playwright/test';
import { ADMIN_ONLY_PAGES } from './helpers/fixtures';

test.describe('Teacher authenticated — admin boundary', () => {
  for (const { path, heading } of ADMIN_ONLY_PAGES) {
    test(`teacher does not see ${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(
        page.getByRole('heading', { name: heading }),
        `teacher should not see the admin heading at ${path}`,
      ).toHaveCount(0);
    });
  }
});
