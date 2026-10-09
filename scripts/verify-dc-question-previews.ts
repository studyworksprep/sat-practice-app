// Verify local comparisons at desktop and mobile widths. No database writes.
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

interface BrowserCheck {
  code: string; viewport: number;
  mathImages?: number; mathErrors?: number; mathSvg?: number;
  overflow: boolean; pageOverflow?: boolean;
  brokenImages?: number; legacyClasses?: number;
}
const root = resolve(process.argv[2] ?? 'tmp/dc-question-audit-2026-10-08');
const registry = JSON.parse(await readFile(process.argv[3] ?? 'scripts/verification/dc-question-formatting-reviewed.json', 'utf8'));
const codes: string[] = registry.questions.map((q: { code: string }) => q.code);
await mkdir(resolve(root, 'screenshots'), { recursive: true });
const browser = await chromium.launch({ headless: true });
const results: BrowserCheck[] = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  for (const code of codes) {
    assert.match(code, /^M-\d{5}$/);
    await page.goto(pathToFileURL(resolve(root, 'previews', code + '.html')).href);
    await page.screenshot({ path: resolve(root, 'screenshots', code + '-desktop.png'), fullPage: true });
    results.push({ code, viewport: 1440, ...await page.locator('#after').evaluate(el => ({
      mathImages: el.querySelectorAll('img[role="math"],img.math-img').length,
      mathErrors: el.querySelectorAll('merror,[data-mjx-error],[data-mml-node="merror"]').length,
      // The shared sanitizer unwraps mjx-container; the SVG remains inline.
      mathSvg: el.querySelectorAll('svg[viewBox]').length,
      overflow: el.scrollWidth > el.clientWidth + 1,
      brokenImages: [...el.querySelectorAll('img')].filter(n => !n.complete || !n.naturalWidth).length,
      legacyClasses: el.querySelectorAll('.italic,.math-container,[class*="tcp-"]').length,
    })) });
    await page.setViewportSize({ width: 400, height: 900 });
    await page.screenshot({ path: resolve(root, 'screenshots', code + '-mobile.png'), fullPage: true });
    results.push({ code, viewport: 400, ...await page.locator('#after').evaluate(el => ({
      overflow: el.scrollWidth > el.clientWidth + 1,
      pageOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      mathErrors: el.querySelectorAll('merror,[data-mjx-error],[data-mml-node="merror"]').length,
      brokenImages: [...el.querySelectorAll('img')].filter(n => !n.complete || !n.naturalWidth).length,
    })) });
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
} finally { await browser.close(); }
await writeFile(resolve(root, 'browser-checks.json'), JSON.stringify(results, null, 2));
const failures = results.filter(r => r.mathImages || r.mathErrors || r.overflow || r.pageOverflow || r.brokenImages || r.legacyClasses);
console.log(JSON.stringify({ checks: results.length, failures }));
assert.equal(failures.length, 0, 'Normalized question previews failed browser checks');
