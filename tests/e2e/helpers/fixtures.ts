// Shared anchors for the negative-test specs.
//
// Rewritten 2026-07-13 against the GENERATED authorization matrix
// (docs/authorization-matrix.md) — the previous route lists were
// written against the retired hand-written 2026-05-04 matrix and
// pointed at /api/* paths whose logic has since moved to Server
// Actions (so they 404 now). Closes the P0.5 follow-up.
//
// What the e2e auth suite can actually assert:
//   - HTTP routes: the matrix has 15 route handlers; the ones with a
//     testable *negative* are requireUser (anon → 401) and
//     requireExternalApiAccess (no API key → 401). Role-gating for the
//     rest lives in Server Actions, which are invoked via Next's action
//     protocol (a `next-action` header + encoded args), not plain GET/
//     POST — so they're covered at the PAGE level below, not by URL.
//   - Page-level role protection (proxy.js + the route-group layouts):
//     the real, user-visible access boundary. A wrong-role user must not
//     reach an admin/tutor surface.
//
// Test user UUIDs come from the dev seed
// (scripts/dev-seed-practice-test-v2.sql + scripts/dev-seed-ui-preview.sql;
// password `devseed123`). Roster shape:
//   teacher -> student1 (assigned)
//   teacher -> student2 (NOT assigned — drives the cross-roster case in
//                        page-auth.teacher.spec.ts)

export const USERS = {
  admin: {
    id: '11111111-1111-1111-1111-111111111111',
    email: 'admin@test.studyworks',
  },
  teacher: {
    id: '22222222-2222-2222-2222-222222222222',
    email: 'teacher@test.studyworks',
  },
  student1: {
    id: '33333333-3333-3333-3333-333333333333',
    email: 'student1@test.studyworks',
  },
  student2: {
    id: '44444444-4444-4444-4444-444444444444',
    email: 'student2@test.studyworks',
  },
} as const;

/** HTTP routes guarded by requireUser (generated matrix). An anonymous
 *  caller must get 401 before any work. Method matters — these only
 *  export the verb listed, so a wrong verb would 405 and mask the auth
 *  check. */
export const REQUIRE_USER_ROUTES: ReadonlyArray<{ url: string; method: 'GET' | 'POST' }> = [
  { url: '/api/billing/create-checkout', method: 'POST' },
  { url: '/api/billing/create-portal', method: 'POST' },
  { url: '/api/practice-test/time-ping', method: 'POST' },
];

/** HTTP routes guarded by requireExternalApiAccess (API-key auth; the
 *  proxy skips session auth for these). A caller with no key gets 401
 *  (lib/externalAuth.ts). A placeholder UUID is fine — the key check
 *  fails before the id is ever used. */
export const EXTERNAL_KEY_ROUTES: ReadonlyArray<{ url: string; method: 'GET' }> = [
  { url: '/api/external/score-report/00000000-0000-0000-0000-000000000000', method: 'GET' },
  { url: '/api/public/students/00000000-0000-0000-0000-000000000000/practice-data', method: 'GET' },
  { url: '/api/public/students/search?q=test', method: 'GET' },
];

/** Pages only an admin may reach. A signed-in non-admin (student or
 *  teacher) must be redirected/blocked by the (admin) layout — never see
 *  the admin surface. Anonymous callers are redirected to /login. */
export const ADMIN_ONLY_PAGES: ReadonlyArray<{ path: string; heading: RegExp }> = [
  { path: '/admin/users', heading: /users/i },
];

/** Pages tutors (teacher/manager/admin) reach and students must not.
 *  The (tutor) layout role gate is the boundary. */
export const TUTOR_PAGES: ReadonlyArray<{ path: string; heading: RegExp }> = [
  { path: '/tutor/dashboard', heading: /tutor dashboard/i },
  { path: '/tutor/roster', heading: /roster/i },
];

/** A page that requires a signed-in user of any role. Anonymous callers
 *  land on /login (the layout's requireUser redirects). */
export const REQUIRE_USER_PAGE = '/dashboard';
