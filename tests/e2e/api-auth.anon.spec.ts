// Anonymous → denied on every protected surface.
//
// Rewritten 2026-07-13 against the generated matrix (see
// helpers/fixtures.ts). Two negative classes are URL-testable:
//   - requireUser HTTP routes → 401 with no session
//   - requireExternalApiAccess routes → 401 with no API key
// Plus the page boundary: an anonymous caller on a signed-in-only page
// is redirected to /login by the layout's requireUser.
//
// Catches the regression where a new route ships without its auth
// helper — it appears to "work" but leaks via RLS-from-anon.

import { test, expect } from '@playwright/test';
import { REQUIRE_USER_ROUTES, EXTERNAL_KEY_ROUTES, REQUIRE_USER_PAGE } from './helpers/fixtures';

test.describe('Anonymous callers', () => {
  for (const { url, method } of REQUIRE_USER_ROUTES) {
    test(`401 ${method} ${url} (requireUser)`, async ({ request }) => {
      const res = method === 'POST' ? await request.post(url) : await request.get(url);
      expect(res.status(), `unexpected ${res.status()} for ${url}`).toBe(401);
    });
  }

  for (const { url } of EXTERNAL_KEY_ROUTES) {
    test(`401 GET ${url} (no API key)`, async ({ request }) => {
      const res = await request.get(url);
      expect(res.status(), `unexpected ${res.status()} for ${url}`).toBe(401);
    });
  }

  test(`GET ${REQUIRE_USER_PAGE} redirects anonymous to /login`, async ({ page }) => {
    await page.goto(REQUIRE_USER_PAGE);
    await expect(page).toHaveURL(/\/login/);
  });
});
