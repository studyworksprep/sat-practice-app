// Teacher → 403 on admin-only routes; teacher → 403 on student-
// scoped routes for a student NOT on their roster.
//
// First half catches "admin route accidentally allows teachers"
// regressions (matrix §3.2 admin rows).
//
// Second half is the can_view boundary that motivated the matrix
// fix in commit 198fa7e — the tutor cookie is valid auth and the
// route role gate (teacher/manager/admin) accepts it, so the only
// thing standing between Teacher A and Student B's data is the
// can_view RPC. If a future refactor swaps that for an inline
// teacher_student_assignments lookup again, this spec catches it.

import { test, expect } from '@playwright/test';
import { ROLE_GATED_ROUTES, STUDENT_SCOPED_ROUTES, USERS } from './helpers/fixtures';

test.describe('Teacher authenticated', () => {
  // Admin-only routes — teacher is not in the allowed list.
  const adminOnly = ROLE_GATED_ROUTES.filter(
    (r) => r.allowed.length === 1 && r.allowed[0] === 'admin',
  );

  for (const { url } of adminOnly) {
    test(`403 GET ${url}`, async ({ request }) => {
      const res = await request.get(url);
      expect(res.status(), `unexpected ${res.status()} for ${url}`).toBe(403);
    });
  }

  // Cross-roster: student2 is NOT assigned to the seeded teacher.
  // can_view(student2) returns false, so each route should 403.
  for (const url of STUDENT_SCOPED_ROUTES(USERS.student2.id)) {
    test(`403 GET ${url} (student NOT on roster)`, async ({ request }) => {
      const res = await request.get(url);
      expect(res.status(), `unexpected ${res.status()} for ${url}`).toBe(403);
    });
  }

  // Counterpart: student1 IS on the roster, so the same routes
  // should succeed. This guards against an over-zealous
  // can_view fix that 403s everyone — the green path has to keep
  // working.
  for (const url of STUDENT_SCOPED_ROUTES(USERS.student1.id)) {
    test(`200 GET ${url} (student on roster)`, async ({ request }) => {
      const res = await request.get(url);
      expect(
        res.status(),
        `expected 2xx for own student, got ${res.status()} on ${url}`,
      ).toBeLessThan(400);
    });
  }
});
