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
    // The banner sub reads "<N> students on your roster". Anchor on the
    // leading count so this matches only the banner and not the
    // RosterFinder card's "<N> on your roster" hint (a bare /student.*on
    // your roster/i matches both and trips Playwright strict mode).
    await expect(page.getByText(/\d+ students? on your roster/i)).toBeVisible();
  });

  test('GET /tutor/students/<own-student> renders the detail page', async ({ page }) => {
    await page.goto(`/tutor/students/${USERS.student1.id}`);
    // The detail page heading is the student's name.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // The "Snapshot" section heading is a stable fingerprint of the
    // detail body; if we 404'd we'd see Next's not-found page instead.
    await expect(page.getByRole('heading', { name: 'Snapshot' })).toBeVisible();
  });

  test('GET /tutor/students/<not-on-roster> 404s', async ({ page }) => {
    const res = await page.goto(`/tutor/students/${USERS.student2.id}`);
    // student2 is not on the seeded teacher's roster, so can_view() hides
    // them and the Server Component calls notFound(). Two independent
    // guarantees, so this can never silently pass on a leaked detail page:
    //   1. The private detail (the "Snapshot" section) must be absent.
    //   2. The not-found page must render.
    // notFound() returns a 404 status in production; the Next dev server
    // renders the same not-found page with a 200, so accept the 404 status
    // OR the visible not-found copy.
    await expect(page.getByRole('heading', { name: 'Snapshot' })).toHaveCount(0);
    if (res?.status() !== 404) {
      await expect(page.getByText(/could not be found|not found/i)).toBeVisible();
    }
  });

  test('GET /tutor/roster lists students', async ({ page }) => {
    await page.goto('/tutor/roster');
    await expect(page.getByRole('heading', { name: /roster/i })).toBeVisible();
  });
});
