// Auth setup. Logs in each test user via the actual login form
// and saves the resulting cookie jar to tests/.auth/<role>.json.
// Each role-bound project loads the matching storage-state file
// so individual specs don't need to repeat the login dance.
//
// Why drive the form rather than calling supabase.auth directly?
// The cookie shape that ends up in the jar matters — we need
// what the @supabase/ssr server reads, not what the JS SDK alone
// would write. Driving the same code path the user follows on
// /login is the safest way to land cookies that survive the
// Next.js + Supabase cookie cascade unchanged.
//
// Required dev users (seeded by scripts/dev-seed-practice-test-v2.sql
// + scripts/dev-seed-ui-preview.sql; password is `devseed123` for
// all):
//   admin@test.studyworks       — role=admin
//   teacher@test.studyworks     — role=teacher, has student1 in roster
//   student1@test.studyworks    — role=student, on teacher's roster
//   student2@test.studyworks    — role=student, NOT on teacher's roster

import { test as setup, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

const PASSWORD = 'devseed123';

const AUTH_DIR = path.resolve('tests/.auth');
fs.mkdirSync(AUTH_DIR, { recursive: true });

async function loginAs(page: import('@playwright/test').Page, email: string, file: string) {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: /^log in$/i }).click();
  // Login dispatches window.location.href = '/dashboard' (or /practice
  // for role=practice). Either way, wait for the post-login URL.
  await page.waitForURL((url) =>
    !url.pathname.includes('/login'),
    { timeout: 15_000 },
  );
  await page.context().storageState({ path: path.join(AUTH_DIR, file) });
}

setup('authenticate as admin', async ({ page }) => {
  await loginAs(page, 'admin@test.studyworks', 'admin.json');
  expect(fs.existsSync(path.join(AUTH_DIR, 'admin.json'))).toBe(true);
});

setup('authenticate as teacher', async ({ page }) => {
  await loginAs(page, 'teacher@test.studyworks', 'teacher.json');
  expect(fs.existsSync(path.join(AUTH_DIR, 'teacher.json'))).toBe(true);
});

setup('authenticate as student', async ({ page }) => {
  await loginAs(page, 'student1@test.studyworks', 'student.json');
  expect(fs.existsSync(path.join(AUTH_DIR, 'student.json'))).toBe(true);
});
