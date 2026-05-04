// Anonymous → 401 on every protected /api route.
//
// Covers matrix §3.1 (requireUser) and §3.2 (role-gated). A request
// with no auth cookie should land on a 401 from requireUser before
// any role check or RLS reads.
//
// Catches the class of regressions where someone forgets the auth
// helper on a new route — the route appears to "work" but leaks
// data via RLS-from-anon (which is empty for our tables, but a
// future schema change could let it through).

import { test, expect } from '@playwright/test';
import {
  REQUIRE_USER_ROUTES,
  ROLE_GATED_ROUTES,
  STUDENT_SCOPED_ROUTES,
  USERS,
} from './helpers/fixtures';

test.describe('Anonymous callers', () => {
  for (const url of REQUIRE_USER_ROUTES) {
    test(`401 GET ${url}`, async ({ request }) => {
      const res = await request.get(url);
      expect(res.status(), `unexpected ${res.status()} for ${url}`).toBe(401);
    });
  }

  for (const { url } of ROLE_GATED_ROUTES) {
    test(`401 GET ${url} (role-gated route)`, async ({ request }) => {
      const res = await request.get(url);
      expect(res.status(), `unexpected ${res.status()} for ${url}`).toBe(401);
    });
  }

  for (const url of STUDENT_SCOPED_ROUTES(USERS.student1.id)) {
    test(`401 GET ${url} (student-scoped)`, async ({ request }) => {
      const res = await request.get(url);
      expect(res.status(), `unexpected ${res.status()} for ${url}`).toBe(401);
    });
  }
});
