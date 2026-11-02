import { test, expect } from '@playwright/test';

for (const path of ['/practice/start', '/practice/tests', '/practice/history']) {
  test(`visible test switcher preserves SAT/ACT navigation on ${path}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(path);
    const nav = page.getByRole('navigation', { name: 'Test type', exact: true });
    await expect(page.getByText('Choose a test', { exact: true })).toBeVisible();
    const sat = nav.getByRole('link', { name: 'SAT', exact: true });
    const act = nav.getByRole('link', { name: 'ACT', exact: true });
    await expect(sat).toHaveAttribute('aria-current', 'page');
    const bounds = await act.boundingBox();
    expect(bounds?.height).toBeGreaterThanOrEqual(44);
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
    await act.click();
    await expect(page).toHaveURL(new RegExp(path + '\\?test=act$'));
    await expect(act).toHaveAttribute('aria-current', 'page');
    await sat.focus();
    await sat.press('Enter');
    await expect(page).toHaveURL(new RegExp(path + '$'));
    await expect(sat).toHaveAttribute('aria-current', 'page');
    await expect(nav).toBeInViewport({ ratio: 1 });
  });
}
