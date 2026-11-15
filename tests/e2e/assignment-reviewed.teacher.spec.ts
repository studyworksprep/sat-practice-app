// The Reviewed checkbox on the tutor's student page (migration
// 20261115152919). Unreviewed work leads the Assignments tab; ticking
// Reviewed moves a row down into "Reviewed", and unticking moves it
// back. The test restores the row it touched, so the shared dev seed
// is left as it was found.

import { test, expect } from '@playwright/test';
import { USERS } from './helpers/fixtures';

const REVIEWED_HEADING = /^Reviewed · \d+$/;

test('a tutor can mark an assignment reviewed and undo it', async ({ page }) => {
  await page.goto(`/tutor/students/${USERS.student1.id}?tab=assignments`);

  const reviewedSection = page.locator('section').filter({
    has: page.getByRole('heading', { name: REVIEWED_HEADING }),
  });
  const firstUnreviewed = page
    .locator('li')
    .filter({ has: page.getByRole('checkbox', { name: 'Reviewed', checked: false }) })
    .first();
  test.skip((await firstUnreviewed.count()) === 0, 'student1 has no unreviewed assignments in this seed');

  // Rows are identified by their link: one per assignment on the page.
  const href = await firstUnreviewed.getByRole('link').getAttribute('href');
  expect(href).toBeTruthy();
  const rowFor = (scope: typeof page | typeof reviewedSection) =>
    scope.locator('li').filter({ has: page.locator(`a[href="${href}"]`) });

  await rowFor(page).getByRole('checkbox', { name: /Reviewed/ }).check();
  await expect(rowFor(reviewedSection).getByRole('checkbox', { name: /Reviewed/ })).toBeChecked();
  await expect(rowFor(reviewedSection)).toContainText('Reviewed');

  // Undo: back out of the Reviewed section, unchecked.
  await rowFor(reviewedSection).getByRole('checkbox', { name: /Reviewed/ }).uncheck();
  await expect(rowFor(reviewedSection)).toHaveCount(0);
  await expect(rowFor(page).getByRole('checkbox', { name: /Reviewed/ })).not.toBeChecked();
});

test('the overview carries work not yet reviewed, not just open work', async ({ page }) => {
  await page.goto(`/tutor/students/${USERS.student1.id}`);
  await expect(page.getByRole('heading', { name: 'Not yet reviewed' })).toBeVisible();
  // The card the overview used to carry only open work under.
  await expect(page.getByRole('heading', { name: 'Open work' })).toHaveCount(0);
});

test('the homework report header carries the same checkbox', async ({ page }) => {
  await page.goto(`/tutor/students/${USERS.student1.id}?tab=assignments`);
  const links = await page.locator('li a[href^="/tutor/"]').evaluateAll(
    (as) => as.map((a) => a.getAttribute('href')),
  );
  // A row links to its session report, or to the assignment; the
  // per-student report lives under the assignment.
  const assignmentHref = links.find((h) => h && /^\/tutor\/assignments\/[^/]+$/.test(h));
  const sessionHref = links.find((h) => h && h.startsWith('/tutor/sessions/'));
  const reportHref = assignmentHref
    ? `${assignmentHref}/students/${USERS.student1.id}`
    : sessionHref;
  test.skip(!reportHref, 'student1 has no assignments in this seed');

  await page.goto(reportHref!);
  const box = page.getByRole('checkbox', { name: /Reviewed/ });
  await expect(box).toBeVisible();
  const was = await box.isChecked();

  await box.setChecked(!was);
  await expect(box).toBeChecked({ checked: !was });
  await page.reload();
  await expect(page.getByRole('checkbox', { name: /Reviewed/ })).toBeChecked({ checked: !was });

  // Put it back.
  await page.getByRole('checkbox', { name: /Reviewed/ }).setChecked(was);
  await expect(page.getByRole('checkbox', { name: /Reviewed/ })).toBeChecked({ checked: was });
});
