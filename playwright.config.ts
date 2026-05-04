// Playwright config for the negative-test pass.
//
// Project shape:
//   1. setup    — runs auth.setup.ts to log in each role and save
//                 a storage-state JSON to tests/.auth/. Every test
//                 project depends on it via { dependencies: ['setup'] }.
//   2. anonymous — no storage state. Used to assert that protected
//                 routes / pages reject unauthenticated callers.
//   3. student / teacher / admin — load the matching storage state
//                 so every test in the project authenticates as
//                 that role automatically.
//
// Tests run against a NEXT_PUBLIC_BASE_URL pointed at the dev
// preview (or local dev server when set). Default is the local
// dev server; the `webServer` block boots it if it isn't already
// running on the configured port.
//
// Auth fixtures rely on the dev seed (scripts/dev-seed-*.sql).
// Required users:
//   admin@test.studyworks      / devseed123
//   teacher@test.studyworks    / devseed123
//   student1@test.studyworks   / devseed123 (assigned to teacher)
//   student2@test.studyworks   / devseed123 (NOT assigned to teacher)

import { defineConfig, devices } from '@playwright/test';

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['line']] : 'list',
  timeout: 30_000,
  expect: { timeout: 5_000 },

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    // ---- Auth setup. Runs once before any role-bound project. ----
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts$/,
    },

    // ---- Anonymous (no storage state). ----
    {
      name: 'anonymous',
      testMatch: /\.anon\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'] },
    },

    // ---- Authenticated roles. Each loads its own storage state. ----
    {
      name: 'student',
      testMatch: /\.student\.spec\.ts$/,
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'tests/.auth/student.json',
      },
    },
    {
      name: 'teacher',
      testMatch: /\.teacher\.spec\.ts$/,
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'tests/.auth/teacher.json',
      },
    },
    {
      name: 'admin',
      testMatch: /\.admin\.spec\.ts$/,
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'tests/.auth/admin.json',
      },
    },
  ],

  // Boot a local dev server only when the suite isn't pointed at a
  // remote preview. Set E2E_BASE_URL to a Vercel preview URL to
  // skip this and run against an already-deployed build.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run dev',
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
