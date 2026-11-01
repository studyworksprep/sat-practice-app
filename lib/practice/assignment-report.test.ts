import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildDailyMap, reportDay, formatReportTimestamp } from './report-dates.ts';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

test('evening answers, issue date, and today use Eastern days', () => {
  const map = buildDailyMap([
    { created_at: '2026-10-25T01:21:57Z', is_correct: true, time_spent_ms: 1200 },
    { created_at: '2026-10-25T04:00:00Z', is_correct: false },
  ], { firstDayOverride: reportDay('2026-10-24T02:00:00Z'), now: new Date('2026-10-26T01:00:00Z') });
  assert.equal(map.firstDay, '2026-10-23');
  assert.equal(map.lastDay, '2026-10-25');
  assert.deepEqual(map.days.map(d => d.attempts), [0, 1, 1]);
  assert.match(formatReportTimestamp('2026-10-25T01:21:57Z'), /Oct 24, 2026, 9:21 PM EDT/);
});

test('both repeated fall-back hours stay on the same day and calendar has no gaps', () => {
  const map = buildDailyMap([
    { created_at: '2026-11-01T05:30:00Z', is_correct: true },
    { created_at: '2026-11-01T06:30:00Z', is_correct: false },
  ], { firstDayOverride: '2026-10-31', now: new Date('2026-11-02T17:00:00Z') });
  assert.deepEqual(map.days.map(d => [d.date, d.attempts]), [
    ['2026-10-31', 0], ['2026-11-01', 2], ['2026-11-02', 0],
  ]);
  assert.match(formatReportTimestamp('2026-11-01T06:30:00Z'), /1:30 AM EST/);
});

test('unstarted assignment has empty days; spring DST keeps every calendar date', () => {
  const map = buildDailyMap([], { firstDayOverride: '2026-03-07', now: new Date('2026-03-10T02:00:00Z') });
  assert.deepEqual(map.days.map(d => d.date), ['2026-03-07', '2026-03-08', '2026-03-09']);
  assert.equal(map.totalAttempts, 0);
  assert.equal(buildDailyMap([]).firstDay, null);
  assert.equal(formatReportTimestamp('invalid'), '');
});

// Execute the real report builder. Stub only unrelated rendering/accessory
// loaders; the in-memory database applies its actual query predicates.
const source = (await readFile(new URL('./build-session-review.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\r?\n/gm, '');
const stubs = `
const applyWatermark = value => value;
const extractMcqCorrectId = () => 'A';
const formatSprCorrect = () => '1';
const inferLayoutMode = () => 'math';
const expandToAttemptIds = () => {};
const loadQuestionNotesByQuestion = async () => ({canView: false});
const loadStudentNotesByQuestion = async () => new Map();
const recommendLessonsForSkills = async () => new Map();
const canTagTechniques = () => false;
const loadTechniqueCatalog = async () => [];
`;
const datesUrl = new URL('./report-dates.ts', import.meta.url).href;
const { buildSessionReview } = await import(`data:text/javascript;base64,${Buffer.from(
  `import { buildDailyMap, reportDay } from ${JSON.stringify(datesUrl)};\n${stubs}\n${source}`,
).toString('base64')}`);

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
function database(tables: Record<string, Row[]>) {
  return { from(table: string) {
    let rows = [...(tables[table] ?? [])];
    let single = false;
    const query = {
      select() { return query; },
      eq(key: string, value: unknown) {
        rows = rows.filter(r => (key.includes('->>') ? r.filter_criteria?.assignment_id : r[key]) === value);
        return query;
      },
      in(key: string, values: unknown[]) { rows = rows.filter(r => values.includes(r[key])); return query; },
      gte(key: string, value: string) { rows = rows.filter(r => r[key] >= value); return query; },
      order(key: string, { ascending = true } = {}) {
        rows.sort((a, b) => String(a[key]).localeCompare(String(b[key])) * (ascending ? 1 : -1));
        return query;
      },
      limit(n: number) { rows = rows.slice(0, n); return query; },
      maybeSingle() { single = true; return query; },
      then(resolve: (value: unknown) => unknown) { return Promise.resolve({ data: single ? rows[0] ?? null : rows }).then(resolve); },
    };
    return query;
  } };
}

test('overlapping assignments cannot borrow correctness, time, dates, or reattempts', async () => {
  const session = { id: 'session-b', user_id: 'student', created_at: '2026-10-31T14:00:00Z',
    question_ids: ['shared'], filter_criteria: { assignment_id: 'b' }, mode: 'practice', test_type: 'sat' };
  const answer = { user_id: 'student', question_id: 'shared', context_type: 'assignment' };
  const view = await buildSessionReview({ user: { id: 'tutor' }, target: { id: 'student' }, session,
    supabase: database({
      assignments_v2: [{ id: 'b', created_at: '2026-10-15T22:00:00Z', question_ids: ['shared', 'second'] }],
      questions_v2: ['shared', 'second'].map(id => ({ id, question_type: 'mcq', options: [] })),
      attempts: [
        { ...answer, context_id: 'a', created_at: '2026-10-25T01:00:00Z', is_correct: true, time_spent_ms: 999999 },
        { ...answer, context_id: null, created_at: '2026-10-26T01:00:00Z', is_correct: true },
        { ...answer, context_id: 'b', created_at: '2026-10-31T14:36:00Z', is_correct: false, time_spent_ms: 5000 },
        { ...answer, context_id: 'b', created_at: '2026-10-31T14:40:00Z', is_correct: true, time_spent_ms: 1000 },
        { ...answer, context_id: 'b', question_id: 'second', created_at: '2026-10-31T14:41:00Z', is_correct: true },
        { ...answer, user_id: 'another-student', context_id: 'b', created_at: '2026-10-30T14:00:00Z', is_correct: true },
      ],
      practice_sessions: [session],
      assignment_students_v2: [{ assignment_id: 'b', student_id: 'student', completed_at: '2026-10-31T14:42:00Z' }],
    }),
  });
  assert.equal(view.items.length, 2, 'full assignment pool even with a subset session');
  assert.equal(view.items[0].status, 'incorrect');
  assert.equal(view.items[0].studentAnswer.submittedAt, '2026-10-31T14:36:00Z');
  assert.equal(view.items[0].additionalAttempts.length, 1);
  assert.equal(view.metrics.accuracy, 0.5);
  assert.equal(view.timing.totalMs, 5000);
  assert.equal(view.assignment.dailyMap.totalAttempts, 3);
  assert.equal(view.assignment.dailyMap.days.find((d: Row) => d.date === '2026-10-25').attempts, 0);
  assert.equal(view.assignment.startedAt, session.created_at);
  assert.equal(view.assignment.completedAt, '2026-10-31T14:42:00Z');
});

test('report renders separate lifecycle dates and first-answer time in Eastern even on a UTC server', async () => {
  const reactUrl = pathToFileURL(createRequire(import.meta.url).resolve('react')).href;
  const componentSource = (await readFile(new URL('./AssignmentReport.jsx', import.meta.url), 'utf8'))
    .replace(/import \{ ([^}]+) \} from '([^']+)';/g, (_match, names, path) => {
      if (path === 'react') return `import { ${names} } from ${JSON.stringify(reactUrl)};`;
      if (path === './report-dates') return `import { ${names} } from ${JSON.stringify(datesUrl)};`;
      if (path === '@/lib/formatters') return `import { ${names} } from ${JSON.stringify(new URL('../formatters.js', import.meta.url).href)};`;
      return names.split(',').map((name: string) => `const ${name.trim()} = () => null;`).join('\n');
    })
    .replace(/import Link from 'next\/link';/, 'const Link = () => null;')
    .replace(/import s from '[^']+';/, 'const s = {};');
  const compiled = ts.transpileModule(componentSource, {
    compilerOptions: { module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React },
  }).outputText;
  const { AssignmentReport } = await import(`data:text/javascript;base64,${Buffer.from(
    `import React from ${JSON.stringify(reactUrl)};\n${compiled}`,
  ).toString('base64')}`);
  const props = {
    sessionMeta: { sessionId: 'session', createdAt: '2026-10-15T22:49:00Z' },
    assignment: { title: 'Geometry', assignedAt: '2026-10-15T22:48:00Z', startedAt: '2026-10-15T22:49:00Z', completedAt: '2026-10-25T01:22:00Z' },
    metrics: { accuracy: 0, byDomain: [], byScoreBand: [] },
    items: [{ position: 0, questionId: 'shared', status: 'incorrect', taxonomy: {}, studentAnswer: { submittedAt: '2026-10-25T01:21:00Z' } }],
  };
  const html = renderToStaticMarkup(React.createElement(AssignmentReport, props));
  assert.match(html, /Assigned .*Oct 15, 2026, 6:48 PM EDT/);
  assert.match(html, /Started Oct 15, 2026, 6:49 PM EDT/);
  assert.match(html, /Completed Oct 24, 2026, 9:22 PM EDT/);
  assert.match(html, /Answered .*Oct 24, 2026, 9:21 PM EDT/);
  const pending = renderToStaticMarkup(React.createElement(AssignmentReport, {
    ...props, assignment: { ...props.assignment, startedAt: null, completedAt: null },
  }));
  assert.match(pending, /Not started/);
  assert.match(pending, /Not completed/);
});
