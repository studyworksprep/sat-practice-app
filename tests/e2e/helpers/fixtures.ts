// Shared anchors for the e2e specs.
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
