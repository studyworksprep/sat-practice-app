// Shared anchors for the negative-test specs.
//
// Test user UUIDs come from the dev seed
// (scripts/dev-seed-practice-test-v2.sql +
// scripts/dev-seed-ui-preview.sql) so a regression that swaps the
// seed values surfaces here, not on a flaky-looking 404.
//
// Roster shape (kept narrow on purpose — the negative tests don't
// need the full cohort):
//   teacher  -> student1 (assigned)
//   teacher  -> student2 (NOT assigned — drives cross-roster cases)

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

/** /api routes the matrix lists under §3.1 (`requireUser`). A
 *  representative slice — full coverage lives on the matrix in
 *  docs/authorization-matrix.md, not in this file. */
export const REQUIRE_USER_ROUTES = [
  '/api/me',
  '/api/dashboard',
  '/api/dashboard/stats',
  '/api/practice-tests',
  '/api/assignments',
  '/api/attempts',
  '/api/billing/status',
];

/** /api routes the matrix lists under §3.2 (role-gated). */
export const ROLE_GATED_ROUTES: Array<{
  url: string;
  allowed: ReadonlyArray<'admin' | 'teacher' | 'manager'>;
}> = [
  { url: '/api/admin/users',                  allowed: ['admin'] },
  { url: '/api/admin/teacher-codes',          allowed: ['admin'] },
  { url: '/api/admin/platform-stats',         allowed: ['admin'] },
  { url: '/api/admin/score-conversion?test_id=00000000-0000-0000-0000-000000000000', allowed: ['admin'] },
  { url: '/api/teacher/dashboard',            allowed: ['teacher', 'manager', 'admin'] },
  { url: '/api/teacher/students',             allowed: ['teacher', 'manager', 'admin'] },
  { url: '/api/teacher/assignment-feed',      allowed: ['teacher', 'manager', 'admin'] },
];

/** Routes scoped to a specific student by URL parameter. The
 *  matrix calls these out under §3.2 / §3.3 — Tutor A trying to
 *  read Tutor B's student should 403, not 200-with-empty. */
export const STUDENT_SCOPED_ROUTES = (studentId: string) => [
  `/api/teacher/student/${studentId}/dashboard`,
  `/api/teacher/student/${studentId}/stats`,
  `/api/teacher/student/${studentId}/scores`,
  `/api/teacher/student/${studentId}/registrations`,
];
