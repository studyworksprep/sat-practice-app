import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Load the actual chart with JSX compiled and CSS stubbed, so the regression
// covers its axis labels and per-day tooltips, not just the date helper.
const reactUrl = pathToFileURL(createRequire(import.meta.url).resolve('react')).href;
async function loadComponent(filename) {
  const source = (await readFile(new URL(filename, import.meta.url), 'utf8'))
    .replace("'@/lib/formatters'", JSON.stringify(new URL('../formatters.js', import.meta.url).href))
    .replace(/import s from '[^']+\.module\.css';/, 'const s = {};');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(`import React from ${JSON.stringify(reactUrl)};\n${compiled}`).toString('base64')}`);
}
const { ReviewDailyMap } = await loadComponent('./ReviewDailyMap.js');
const { StudyCountdown } = await loadComponent('./StudyCountdown.js');

test('assignment daily chart shows the same calendar dates in Eastern Time', () => {
  const previousTimeZone = process.env.TZ;
  process.env.TZ = 'America/New_York';
  try {
    const html = renderToStaticMarkup(React.createElement(ReviewDailyMap, {
      dailyMap: {
        firstDay: '2026-10-09',
        lastDay: '2026-10-10',
        totalAttempts: 3,
        days: [
          { date: '2026-10-09', attempts: 0, correct: 0 },
          { date: '2026-10-10', attempts: 3, correct: 2 },
        ],
      },
    }));
    assert.match(html, /<span>Oct 9<\/span>/);
    assert.match(html, /<span>Oct 10<\/span>/);
    assert.match(html, /title="Oct 9 — no practice"/);
    assert.match(html, /title="Oct 10 — 3 attempts, 67% correct"/);
  } finally {
    if (previousTimeZone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimeZone;
  }
});

test('SAT countdown accepts the legacy profile timestamp as a calendar date', () => {
  const previousTimeZone = process.env.TZ;
  process.env.TZ = 'America/New_York';
  try {
    for (const isoDate of ['2026-06-06', '2026-06-06T00:00:00+00:00']) {
      const html = renderToStaticMarkup(React.createElement(StudyCountdown, {
        isoDate,
        todayMs: Date.parse('2026-06-05T12:00:00-04:00'),
      }));
      assert.match(html, /Your SAT is tomorrow/);
      assert.match(html, /Saturday, June 6, 2026/);
    }
  } finally {
    if (previousTimeZone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimeZone;
  }
});
