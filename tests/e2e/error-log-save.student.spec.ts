import { test, expect } from '@playwright/test';

test('error-log drafts survive failed saves and retry through a stable endpoint', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await page.goto('/practice/start');
  await page.getByLabel(/session size/i).fill('1');
  await page.getByRole('button', { name: /^start · /i }).click();
  await page.waitForURL(/\/practice\/s\/[0-9a-f-]+\/0$/, { timeout: 20_000 });
  await page.getByRole('button', { name: 'Error Log', exact: true }).click();
  const panel = page.getByRole('dialog', { name: 'Error log note', exact: true });
  const editor = page.getByRole('textbox', { name: 'Error log note', exact: true });
  const original = await editor.inputValue();
  const draft = `I need to check the signs when solving equations. ${Date.now()}`;
  await editor.fill(draft);

  // A dropped connection and a non-JSON deployment error must both leave
  // the editor usable instead of replacing the route with its error boundary.
  await page.route('**/api/practice/error-notes', route => route.abort('failed'), { times: 1 });
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  await expect(panel.getByRole('alert')).toContainText('Your text is still here');
  await expect(editor).toHaveValue(draft);
  await expect(editor).toBeEnabled();

  await page.route('**/api/practice/error-notes', route => route.fulfill({
    status: 404, contentType: 'text/html', body: '<h1>Not found</h1>',
  }), { times: 1 });
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  await expect(panel.getByRole('alert')).toContainText('Your text is still here');
  await expect(editor).toHaveValue(draft);
  await expect(editor).toBeEnabled();
  await expect(page.getByRole('heading', { name: 'Something went wrong' })).toHaveCount(0);
  await panel.screenshot({ path: testInfo.outputPath('recoverable-save-error.png') });

  const saved = page.waitForResponse(response => response.url().endsWith('/api/practice/error-notes') && response.status() === 200);
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  const response = await saved;
  expect(response.request().headers()['next-action']).toBeUndefined();
  await expect(page.getByText('Saved ✓', { exact: true })).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: 'Error Log', exact: true }).click();
  await expect(editor).toHaveValue(draft);

  // Restore any pre-existing note on the disposable test account.
  await editor.fill(original);
  await page.getByRole('button', { name: original.trim() ? 'Save note' : 'Clear note', exact: true }).click();
  await expect(page.getByText('Saved ✓', { exact: true })).toBeVisible();
});
