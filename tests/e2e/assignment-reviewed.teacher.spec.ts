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
  // A row links to its session report, to the report resolver (finished
  // work), or to the assignment (open work; the per-student report lives
  // under it).
  const assignmentHref = links.find((h) => h && /^\/tutor\/assignments\/[^/]+$/.test(h));
  const sessionHref = links.find((h) => h && h.startsWith('/tutor/sessions/'));
  const resolverHref = links.find((h) => h && h.startsWith('/tutor/dashboard/review/'));
  // The resolver goes last: for work completed without an attempt it
  // lands on "Report unavailable", which has no checkbox.
  const reportHref = sessionHref
    ?? (assignmentHref ? `${assignmentHref}/students/${USERS.student1.id}` : undefined)
    ?? resolverHref;
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

test('a finished practice-test assignment opens its results with the checkbox', async ({ page }) => {
  await page.goto(`/tutor/students/${USERS.student1.id}?tab=assignments`);
  // Finished rows link through /tutor/dashboard/review, which redirects
  // to the practice test's results page.
  const row = page.locator('li').filter({ hasText: 'Practice test' }).filter({ hasText: 'View report' }).first();
  test.skip((await row.count()) === 0, 'student1 has no finished practice-test assignment in this seed');

  await row.getByRole('link').click();
  await page.waitForURL((url) => !url.pathname.startsWith('/tutor/dashboard/review/'));
  // Marked complete without a test attempt behind it: "Report unavailable".
  test.skip(!/\/tests\/[^/]+\/results$/.test(new URL(page.url()).pathname), 'no attempt behind this assignment');
  await expect(page.getByRole('checkbox', { name: /Reviewed/ })).toBeVisible();
});
