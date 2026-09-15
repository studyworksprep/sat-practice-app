import { test, expect } from '@playwright/test';
import path from 'node:path';

// No database mutation: the upload action only reads identifier matches.
test('admin can compare an export and export review choices', async ({ page }) => {
  await page.goto('/admin/questions/import');
  const mmd = '\\section*{Question ID: importer-test-unmatched}\nQuestion\nWhat is $2+2$?\nCorrect Answer: 4\n\nRationale\nAdding gives $4$.';
  await page.locator('input[name="export"]').setInputFiles({ name:'test.mmd', mimeType:'text/plain', buffer:Buffer.from(mmd) });
  await page.getByRole('button', { name:'Compare with question bank' }).click();
  await expect(page.getByRole('heading', { name:'Review the import' })).toBeVisible();
  await expect(page.getByText('No matching ID or prompt text found. Review carefully: different formatting can still hide a duplicate.')).toBeVisible();
  await expect(page.getByRole('button', { name:'Prefer imported', exact:true })).toBeEnabled();
  await page.getByRole('button', { name:'Needs editing', exact:true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name:'Export review choices' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('sat-import-review.json');
});

test('pilot upload retains graph, explanations, and matched metadata', async ({ page }) => {
  test.skip(!process.env.E2E_IMPORT_PILOT, 'Opt in when the local pilot files are available.');
  await page.goto('/admin/questions/import');
  await page.locator('input[name="export"]').setInputFiles(path.resolve('content/import/pilot/Algebra 10 questions and answers.mmd.zip'));
  await page.locator('input[name="metadata"]').setInputFiles(path.resolve('content/import/pilot/Algebra 10 questions metadata.rtf'));
  await page.getByRole('button', { name:'Compare with question bank' }).click();
  await expect(page.getByText(/10 questions ·/)).toBeVisible();
  await page.getByRole('button', { name:/3f5a3602/ }).click();
  await expect(page.getByRole('img', { name:'Imported question figure' })).toBeVisible();
  await expect(page.getByText(/Choice D is correct/).last()).toBeVisible();
});


test('snapshot preferences cannot apply to the live bank', async ({ page }) => {
  test.skip(!process.env.E2E_IMPORT_PILOT, 'Requires local snapshot fixtures.');
  await page.goto('/admin/questions/import');
  await page.getByRole('button', { name:'Load local math pilot', exact:true }).click();
  await expect(page.getByText(/10 questions ·/)).toBeVisible();
  await page.getByRole('button', { name:'Prefer imported', exact:true }).click();
  await expect(page.getByRole('region', { name:'Question review' })).toContainText('The pilot snapshot is review-only.');
  await expect(page.getByRole('button', { name:'Import this question',exact:true })).toBeDisabled();
});
