import { test, expect } from '@playwright/test';
import { USERS } from './helpers/fixtures';

test('ACT options load once on demand without losing assignment details', async ({ page }) => {
  await page.goto(`/tutor/assignments/new?student=${USERS.student1.id}`);
  const group = page.getByRole('group', { name: 'Test type', exact: true });
  await expect(group.getByRole('radio', { name: 'SAT', exact: true })).toBeChecked();
  await page.getByLabel('Title', { exact: true }).fill('Preserved while switching tests');
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let requests = 0;
  await page.route('**/tutor/assignments/new**', async route => {
    if (route.request().method() === 'POST' && route.request().headers()['next-action']) {
      requests += 1;
      await gate;
    }
    await route.continue();
  });
  await group.getByText('ACT', { exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Loading ACT');
  await expect(page.getByRole('button', { name: 'Create assignment', exact: true })).toBeDisabled();
  await group.getByText('SAT', { exact: true }).click();
  await group.getByText('ACT', { exact: true }).click();
  await expect.poll(() => requests).toBe(1);
  release();
  await expect(page.getByText('ACT question pool', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Preserved while switching tests');
  await expect(page.locator(`input[name="student_id"][value="${USERS.student1.id}"]`)).toBeChecked();
  await group.getByText('SAT', { exact: true }).click();
  await group.getByText('ACT', { exact: true }).click();
  await expect(page.getByText('ACT question pool', { exact: true })).toBeVisible();
  expect(requests).toBe(1);
});

test('failed ACT option load shows retry and recovers with keyboard controls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/tutor/assignments/new');
  let fail = true;
  await page.route('**/tutor/assignments/new**', async route => {
    if (fail && route.request().method() === 'POST' && route.request().headers()['next-action']) {
      fail = false;
      await route.abort('failed');
    } else await route.continue();
  });
  const act = page.getByRole('radio', { name: 'ACT', exact: true });
  await act.focus();
  await act.press('Space');
  await expect(act).toBeChecked();
  await expect(page.getByRole('alert').filter({ hasText: 'Could not load ACT options' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create assignment', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByText('ACT question pool', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create assignment', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
