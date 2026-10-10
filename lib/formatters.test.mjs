import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const formattersUrl = new URL('./formatters.js', import.meta.url).href;
const pdfUrl = new URL('./generateScoreReportPdf.js', import.meta.url).href;

function inTimezone(timeZone, script) {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    env: { ...process.env, TZ: timeZone },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

for (const timeZone of ['UTC', 'America/New_York', 'America/Los_Angeles', 'Asia/Tokyo']) {
  test(`calendar dates keep their entered day in ${timeZone}`, () => {
    const result = inTimezone(timeZone, `
      import { formatDate, formatShortDate, formatCalendarDate } from ${JSON.stringify(formattersUrl)};
      const long = { month: 'long', day: 'numeric', year: 'numeric' };
      console.log(JSON.stringify({
        winter: formatDate('2026-01-10', long),
        summer: formatDate('2026-06-06', long),
        report: formatDate('2026-10-10', { ...long, weekday: 'long' }),
        chart: formatShortDate('2026-10-10'),
        springDst: formatShortDate('2026-03-08'),
        fallDst: formatShortDate('2026-11-01'),
        legacyProfile: formatCalendarDate('2026-06-06T00:00:00+00:00', long),
        invalid: formatDate('invalid', long),
        missing: formatCalendarDate(null),
      }));
    `);
    assert.deepEqual(result, {
      winter: 'January 10, 2026',
      summer: 'June 6, 2026',
      report: 'Saturday, October 10, 2026',
      chart: 'Oct 10',
      springDst: 'Mar 8',
      fallDst: 'Nov 1',
      legacyProfile: 'June 6, 2026',
      invalid: '',
      missing: '',
    });
  });
}

test('completion timestamps still convert to Eastern Time, including EST and EDT', () => {
  const result = inTimezone('America/New_York', `
    import { formatDate } from ${JSON.stringify(formattersUrl)};
    const long = { month: 'long', day: 'numeric', year: 'numeric' };
    console.log(JSON.stringify({
      est: formatDate('2026-01-10T02:30:00Z', long),
      edt: formatDate('2026-06-06T02:30:00Z', long),
      lateEvening: formatDate('2026-10-11T03:59:00Z', long),
      midnight: formatDate('2026-10-11T04:00:00Z', long),
      bluebook: formatDate('2026-10-10T12:00:00Z', long),
    }));
  `);
  assert.deepEqual(result, {
    est: 'January 9, 2026',
    edt: 'June 5, 2026',
    lateEvening: 'October 10, 2026',
    midnight: 'October 11, 2026',
    bluebook: 'October 10, 2026',
  });
});

test('score report PDFs preserve calendar dates and convert completion timestamps', () => {
  const result = inTimezone('America/New_York', `
    import { generateScoreReportPdf } from ${JSON.stringify(pdfUrl)};
    const calendarPdf = generateScoreReportPdf({ completed_at: '2026-10-10' }).output();
    const timestampPdf = generateScoreReportPdf({ completed_at: '2026-10-11T02:30:00Z' }).output();
    console.log(JSON.stringify({
      calendar: calendarPdf.includes('(October 10, 2026)'),
      timestamp: timestampPdf.includes('(October 10, 2026)'),
    }));
  `);
  assert.deepEqual(result, { calendar: true, timestamp: true });
});
