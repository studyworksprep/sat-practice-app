import { test, expect } from '@playwright/test';
import { USERS } from './helpers/fixtures';

test('ACT options load once on demand without losing assignment details', async ({ page }) => {
  await page.goto(`/tutor/assignments/new?student=${USERS.student1.id}`);
  const group = page.getByRole('radiogroup', { name: 'Test', exact: true });
  await expect(group.getByRole('radio', { name: 'SAT', exact: true })).toBeChecked();
  await page.getByRole('textbox', { name: /^Title/ }).fill('Preserved while switching tests');
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
  const pool = page.getByRole('group', { name: 'ACT question pool', exact: true });
  await expect(pool).toBeVisible();
  await expect(page.getByRole('textbox', { name: /^Title/ })).toHaveValue('Preserved while switching tests');
  await expect(page.locator(`input[name="student_id"][value="${USERS.student1.id}"]`)).toHaveCount(1);
  await group.getByText('SAT', { exact: true }).click();
  await group.getByText('ACT', { exact: true }).click();
  await expect(pool).toBeVisible();
  expect(requests).toBe(1);
});

test('failed ACT option load shows retry and recovers with keyboard controls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/tutor/assignments/new?student=${USERS.student1.id}`);
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
  await expect(page.getByRole('group', { name: 'ACT question pool', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create assignment', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('students are added from a roster search, and one is required', async ({ page }) => {
  await page.goto('/tutor/assignments/new');
  const create = page.getByRole('button', { name: 'Create assignment', exact: true });
  await expect(page.getByText('No students added yet.', { exact: true })).toBeVisible();
  await expect(create).toBeDisabled();

  await page.getByRole('button', { name: '+ Add student', exact: true }).click();
  const search = page.getByRole('combobox', { name: 'Search students' });
  await expect(search).toBeFocused();
  await search.fill(USERS.student1.email.split('@')[0]);
  await expect(page.getByRole('option')).toHaveCount(1);
  await search.press('Enter');

  const hidden = page.locator(`input[name="student_id"][value="${USERS.student1.id}"]`);
  await expect(hidden).toHaveCount(1);
  await expect(search).toHaveValue('');
  await search.press('Escape');
  await expect(page.getByRole('button', { name: '+ Add student', exact: true })).toBeFocused();
  await expect(create).toBeEnabled();

  await page.getByRole('list', { name: 'Added students' }).getByRole('button', { name: /^Remove / }).click();
  await expect(hidden).toHaveCount(0);
  await expect(create).toBeDisabled();
});
