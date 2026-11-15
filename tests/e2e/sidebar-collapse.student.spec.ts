import { test, expect } from '@playwright/test';

// The desktop sidebar (lib/ui/AppSidebar.tsx) starts expanded in every
// new browser session and only drops to the icon rail on an explicit
// click. The choice holds for the rest of that tab's session and is
// never carried into a new one — students who once collapsed it used
// to stay on the rail for good, not knowing it could open.

const COLLAPSE = 'Collapse sidebar';
const EXPAND = 'Expand sidebar';

test('the sidebar starts expanded each session and collapses only on click', async ({ page, context }) => {
  // A collapse saved under the old persist-forever preference must not
  // carry over.
  await page.addInitScript(() => {
    try { window.localStorage.setItem('sw:sidebar-collapsed', '1'); } catch { /* ignore */ }
  });

  await page.goto('/practice/start');
  const nav = page.getByRole('navigation', { name: 'Primary' });
  const label = nav.getByText('Practice Tests', { exact: true });

  await expect(page.getByRole('button', { name: COLLAPSE })).toBeVisible();
  await expect(label).toBeVisible();

  // The toggle sits on the sidebar's right edge, around mid-height.
  const sidebar = page.locator('aside');
  const [toggleBox, sidebarBox] = await Promise.all([
    page.getByRole('button', { name: COLLAPSE }).boundingBox(),
    sidebar.boundingBox(),
  ]);
  expect(toggleBox && sidebarBox).toBeTruthy();
  if (toggleBox && sidebarBox) {
    const toggleCenterX = toggleBox.x + toggleBox.width / 2;
    const toggleCenterY = toggleBox.y + toggleBox.height / 2;
    expect(Math.abs(toggleCenterX - (sidebarBox.x + sidebarBox.width))).toBeLessThanOrEqual(2);
    expect(Math.abs(toggleCenterY - (sidebarBox.y + sidebarBox.height / 2))).toBeLessThanOrEqual(2);
  }

  await page.getByRole('button', { name: COLLAPSE }).click();
  await expect(page.getByRole('button', { name: EXPAND })).toBeVisible();
  await expect(label).toBeHidden();

  // Same tab, same session: the rail survives a reload.
  await page.reload();
  await expect(page.getByRole('button', { name: EXPAND })).toBeVisible();
  await expect(label).toBeHidden();

  // A new tab is a new session: expanded again.
  const fresh = await context.newPage();
  await fresh.goto('/practice/start');
  await expect(fresh.getByRole('button', { name: COLLAPSE })).toBeVisible();
  await expect(fresh.getByRole('navigation', { name: 'Primary' }).getByText('Practice Tests', { exact: true }))
    .toBeVisible();
  await fresh.close();

  // Leave the original tab expanded for whatever runs next.
  await page.getByRole('button', { name: EXPAND }).click();
  await expect(label).toBeVisible();
});
