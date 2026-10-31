// Run against `next build && next start`, never use dev timings as a baseline.
// PERF_DEMO=1 uses the existing read-only demo sign-in (localhost only).
// Otherwise supply PERF_STUDENT_STATE / PERF_TUTOR_STATE Playwright state files.
import { chromium, request } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const baseURL = process.env.PERF_BASE_URL ?? 'http://127.0.0.1:3100';
const samples = Number(process.env.PERF_SAMPLES ?? 3);
if (!Number.isInteger(samples) || samples < 1 || samples > 10) {
  throw new Error('PERF_SAMPLES must be an integer from 1 to 10');
}
if (process.env.PERF_DEMO === '1' && !['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname)) {
  throw new Error('Automatic demo sign-in is restricted to localhost. Supply storage state for remote targets.');
}

const studentId = process.env.PERF_STUDENT_ID ?? (process.env.PERF_DEMO === '1'
  ? '00000000-0000-0000-0000-000000d30101'
  : '33333333-3333-3333-3333-333333333333');
const routes = {
  student: ['/dashboard', '/practice/start', '/practice/tests', '/practice/tests?test=act',
    '/practice/history', '/review', '/assignments', '/learn', '/notes', '/performance'],
  tutor: ['/tutor/dashboard', '/tutor/roster', `/tutor/students/${studentId}`,
    `/tutor/students/${studentId}/stats`, '/tutor/assignments', '/tutor/assignments/new', '/tutor/performance'],
};
if (process.env.PERF_EXTRA_ROUTES) {
  const extra = JSON.parse(process.env.PERF_EXTRA_ROUTES) as Partial<Record<keyof typeof routes, string[]>>;
  for (const role of ['student', 'tutor'] as const) routes[role].push(...(extra[role] ?? []));
}

// Playwright's test runner clears test-results/ at startup. Keep audit output
// separately so a subsequent regression suite cannot erase the measurements.
const output = path.resolve(process.env.PERF_OUTPUT ?? 'tmp/performance/latest.json');
const results: object[] = [];
const browser = await chromium.launch();
try {
  for (const role of ['student', 'tutor'] as const) {
    const auth = await request.newContext({ baseURL });
    let storageState;
    try {
      if (process.env.PERF_DEMO === '1') {
        // Don't follow the landing page: it would warm the dashboard benchmark.
        const response = await auth.get(`/auth/demo/${role}`, { maxRedirects: 0 });
        if (response.status() !== 307 && response.status() !== 302) {
          throw new Error(`Demo sign-in failed (${response.status()}); check that demo accounts are seeded.`);
        }
        storageState = await auth.storageState();
      } else {
        storageState = process.env[role === 'student' ? 'PERF_STUDENT_STATE' : 'PERF_TUTOR_STATE']
          ?? `tests/.auth/${role === 'tutor' ? 'teacher' : role}.json`;
      }
    } finally {
      await auth.dispose();
    }
    for (const route of routes[role]) {
      if (process.env.PERF_FILTER && !route.includes(process.env.PERF_FILTER)) continue;
      // A new context makes the first load browser-cache cold. Later loads reuse
      // the HTTP cache; the server's process and database caches stay warm.
      const context = await browser.newContext({ baseURL, storageState, viewport: { width: 1440, height: 900 } });
      await context.addInitScript(() => {
        const metrics = { lcp: null as number | null, longTaskMs: 0, longTasks: 0 };
        Object.assign(window, { __perfAudit: metrics });
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) metrics.lcp = entry.startTime;
        }).observe({ type: 'largest-contentful-paint', buffered: true });
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            metrics.longTaskMs += entry.duration;
            metrics.longTasks++;
          }
        }).observe({ type: 'longtask', buffered: true });
      });
      const page = await context.newPage();
      for (let sample = 0; sample < samples; sample++) {
        const errors: string[] = [];
        const onError = (error: Error) => errors.push(error.message.slice(0, 250));
        page.on('pageerror', onError);
        try {
          const response = await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 60_000 });
          if (!response?.ok()) throw new Error(`HTTP ${response?.status()}`);
          if (new URL(page.url()).pathname !== new URL(route, baseURL).pathname) {
            throw new Error(`Redirected to ${new URL(page.url()).pathname}; authenticate again or check access.`);
          }
          await page.locator('main:not([aria-busy="true"])').first().waitFor({ state: 'visible', timeout: 45_000 });
          const contentReadyMs = await page.evaluate(() => performance.now());
          const body = await page.locator('main').first().innerText();
          if (/Something went wrong|Failed to load|Application error/.test(body)) {
            throw new Error('Page rendered an error state');
          }
          // Fixed observation window. networkidle is unsuitable: analytics,
          // prefetch and polling can run forever. This is a lab LCP snapshot.
          await page.waitForTimeout(2000);
          // Next can stream a redirect after the initial document has loaded.
          // Do not attribute the destination page's timings to the source URL.
          if (new URL(page.url()).pathname !== new URL(route, baseURL).pathname) {
            throw new Error(`Streamed redirect to ${new URL(page.url()).pathname}; this fixture cannot benchmark ${route}.`);
          }
          const metrics = await page.evaluate(() => {
            const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
            const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
            const scripts = resources.filter((r) => r.initiatorType === 'script' || /\.js(?:\?|$)/.test(r.name));
            const externalScripts = scripts.filter((r) => new URL(r.name).origin !== location.origin);
            const observation = (window as unknown as { __perfAudit: { lcp: number | null; longTaskMs: number; longTasks: number } }).__perfAudit;
            return {
              ttfbMs: nav.responseStart, domContentLoadedMs: nav.domContentLoadedEventEnd,
              ...observation, scriptRequests: scripts.length,
              scriptEncodedBytes: scripts.reduce((sum, r) => sum + r.encodedBodySize, 0),
              // Cross-origin sizes may be zero without Timing-Allow-Origin.
              externalScripts: externalScripts.map((r) => ({ url: new URL(r.name).origin + new URL(r.name).pathname,
                durationMs: r.duration, encodedBytes: r.encodedBodySize })),
            };
          });
          results.push({ role, route, sample: sample + 1, browserCache: sample === 0 ? 'cold' : 'warm',
            contentReadyMs, ...metrics, errors });
          if (errors.length > 0) process.exitCode = 1;
          console.log(`${role} ${route} #${sample + 1}: TTFB ${Math.round(metrics.ttfbMs)} ms, content ${Math.round(contentReadyMs)} ms, scripts ${metrics.scriptRequests}`);
        } catch (error) {
          results.push({ role, route, sample: sample + 1, failure: String(error) });
          console.error(`${role} ${route}: ${String(error)}`);
          process.exitCode = 1;
        } finally {
          page.off('pageerror', onError);
        }
      }
      await context.close();
    }
  }
} finally {
  await browser.close();
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify({ measuredAt: new Date().toISOString(), baseURL,
    samples, viewport: '1440x900', observationWindowMs: 2000, results }, null, 2) + '\n');
}
