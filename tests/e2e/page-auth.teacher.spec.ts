// Page-level cross-roster + role-gate tests for the new tree.
//
// /tutor/students/[studentId] does notFound() when the caller can't
// see the student via RLS — visiting student2 as the seeded teacher
// should land on 404, not on the dashboard with stale data.
//
// Visiting /tutor/dashboard should obviously work for the teacher;
// included as the green-path counterpart.

import { test, expect } from '@playwright/test';
import { USERS } from './helpers/fixtures';

test.describe('Teacher — page-level access', () => {
  test('GET /tutor/dashboard renders the tutor dashboard', async ({ page }) => {
    await page.goto('/tutor/dashboard');
    await expect(page.getByText(/student.*on your roster/i)).toBeVisible();
  });

  test('GET /tutor/students/<own-student> renders the detail page', async ({ page }) => {
    await page.goto(`/tutor/students/${USERS.student1.id}`);
    // The detail page heading is the student's name.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // ImportPracticeHistoryButton is a fingerprint of the page
    // body; if we 404'd we'd see a Next 404 layout instead.
    await expect(page.getByText(/practice history v2 import/i)).toBeVisible();
  });

  test('GET /tutor/students/<not-on-roster> 404s', async ({ page }) => {
    const res = await page.goto(`/tutor/students/${USERS.student2.id}`);
    // notFound() in a Server Component returns 404. Either the
    // status reads 404 or the visible body shows Next's not-found
    // copy — either signal is sufficient.
    const status = res?.status();
    if (status === 404) return;
    await expect(page.getByText(/not.found/i)).toBeVisible();
  });

  test('GET /tutor/roster lists students', async ({ page }) => {
    await page.goto('/tutor/roster');
    await expect(page.getByRole('heading', { name: /roster/i })).toBeVisible();
  });
});
