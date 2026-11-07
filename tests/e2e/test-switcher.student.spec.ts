import { test, expect } from '@playwright/test';

// The sidebar SAT/ACT switch (lib/ui/SidebarTestSwitch.tsx) replaces the
// per-page "Choose a test" cards. It stores the choice in a cookie, so
// one switch steers every practice surface; an explicit ?test= wins.

const SWITCH = "Test you're studying for";

test.afterEach(async ({ context }) => {
  // Leave the shared student fixture on SAT for the next spec.
  await context.clearCookies({ name: 'sw_test_type' });
});

test('one sidebar switch steers every practice surface', async ({ page }) => {
  await page.goto('/practice/start');
  const group = page.getByRole('group', { name: SWITCH });
  const sat = group.getByRole('button', { name: 'SAT', exact: true });
  const act = group.getByRole('button', { name: 'ACT', exact: true });

  await expect(page.getByText('Choose a test', { exact: true })).toHaveCount(0);
  await expect(sat).toHaveAttribute('aria-pressed', 'true');

  await act.click();
  await expect(act).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('Practice · ACT', { exact: true })).toBeVisible();

  // The choice carries to the other practice surfaces without a param.
  for (const path of ['/practice/tests', '/practice/history']) {
    await page.goto(path);
    await expect(page.getByRole('group', { name: SWITCH }).getByRole('button', { name: 'ACT', exact: true }))
      .toHaveAttribute('aria-pressed', 'true');
  }

  // An explicit ?test= still wins over the stored choice…
  await page.goto('/practice/start?test=sat');
  await expect(sat).toHaveAttribute('aria-pressed', 'true');

  // …and choosing in the switch drops the contradicting param.
  await act.click();
  await expect(page).toHaveURL(/\/practice\/start$/);
  await expect(act).toHaveAttribute('aria-pressed', 'true');

  await sat.click();
  await expect(sat).toHaveAttribute('aria-pressed', 'true');
});

test('the switch is reachable and touch-sized in the phone top bar', async ({ page }) => {
  // Students get the bottom tab bar on phones; the switch sits in the
  // top bar so it never hides behind "More".
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/practice/start');
  const act = page.getByRole('group', { name: SWITCH }).getByRole('button', { name: 'ACT', exact: true });
  await expect(act).toBeInViewport({ ratio: 1 });
  const bounds = await act.boundingBox();
  expect(bounds?.height).toBeGreaterThanOrEqual(36);
});
