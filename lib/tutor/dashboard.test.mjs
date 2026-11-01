import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { parseHistory, orderStudents, studentFromPath } from './dashboard-history.ts';
import { resolveDashboardReport } from './dashboard-report.ts';
import { buildDashboardActivity } from './dashboard-activity.ts';

test('shortcuts ignore removed students, deduplicate pins, and retain the full roster', () => {
  const roster = Array.from({ length: 120 }, (_, i) => ({ id: String(i) }));
  const history = parseHistory('{"pinned":["110","110",null,"removed"],"recent":["119","110"]}');
  const ordered = orderStudents(roster, history);
  assert.deepEqual(ordered.slice(0, 3).map((s) => s.id), ['110', '119', '0']);
  assert.equal(ordered.length, 120);
  assert.deepEqual(parseHistory('broken'), { recent: [], pinned: [] });
});

test('recent history recognizes student workspaces and reports but not training sessions', () => {
  assert.equal(studentFromPath('/tutor/students/one/tests/test/results'), 'one');
  assert.equal(studentFromPath('/tutor/session/two'), 'two');
  assert.equal(studentFromPath('/tutor/assignments/a/students/three'), 'three');
  assert.equal(studentFromPath('/tutor/sessions/session-id'), null);
  assert.equal(studentFromPath('/tutor/training'), null);
});

function database(data, error = null) {
  const calls = [];
  const query = {};
  for (const method of ['from', 'select', 'eq', 'lte', 'order', 'limit']) {
    query[method] = (...args) => { calls.push([method, ...args]); return query; };
  }
  query.maybeSingle = async () => ({ data, error });
  return { query, calls };
}

test('practice tests resolve by student and matching test with completion cutoff', async () => {
  for (const type of ['sat', 'act']) {
    const { query, calls } = database({ id: 'attempt' });
    const href = await resolveDashboardReport(query, {
      id: 'assignment', assignment_type: 'practice_test', test_type: type,
      practice_test_id: 'sat-test', act_source_test: 'act-test',
    }, 'student', '2026-10-30T12:00:00Z');
    assert.equal(href, '/tutor/students/student/tests/attempt/results');
    assert.ok(calls.some((c) => c[0] === 'eq' && c[1] === 'user_id' && c[2] === 'student'));
    assert.ok(calls.some((c) => c[0] === 'eq' && c[1] === (type === 'act' ? 'source_test' : 'practice_test_id') && c[2] === `${type}-test`));
    assert.ok(calls.some((c) => c[0] === 'lte' && c[1] === 'finished_at'));
  }
});

test('question reports preserve ACT routing and handle missing sessions honestly', async () => {
  const assignment = { id: 'a', assignment_type: 'questions', test_type: 'act' };
  assert.equal(await resolveDashboardReport(database({ id: 'session' }).query, assignment, 's'), '/tutor/sessions/session');
  assert.equal(await resolveDashboardReport(database(null).query, assignment, 's'), null);
  assert.equal(await resolveDashboardReport(database(null).query, { ...assignment, test_type: 'sat' }, 's'), '/tutor/assignments/a/students/s');
  assert.equal(await resolveDashboardReport(null, { id: 'a', assignment_type: 'lesson' }, 's'), '/tutor/assignments/a/students/s');
  assert.equal(await resolveDashboardReport(database({ id: 'pack-session' }).query, { id: 'a', assignment_type: 'lesson_pack' }, 's'), '/tutor/sessions/pack-session');
  await assert.rejects(resolveDashboardReport(database(null, new Error('offline')).query, assignment, 's'), /offline/);
});

test('activity keeps assignment completion distinct from answers, deduplicates sessions, and scopes to roster', () => {
  const session = { id: 'session', user_id: 'student', test_type: 'sat', status: 'in_progress',
    last_activity_at: '2026-11-01T12:00:00Z', question_ids: ['a', 'b'], filter_criteria: {} };
  const rows = buildDashboardActivity({ studentIds: ['student'], since: '2026-10-18T00:00:00Z',
    assignments: [{ id: 'assignment', title: 'Algebra', assignment_type: 'questions' }],
    completions: [{ student_id: 'student', completed_at: '2026-10-31T12:00:00Z',
      assignment: { id: 'assignment', title: 'Algebra', assignment_type: 'questions' } }],
    sessions: [session,
      { ...session, id: 'other-roster', user_id: 'hidden' },
      { ...session, id: 'old', last_activity_at: '2026-10-01T12:00:00Z' },
      { ...session, id: 'manual', filter_criteria: { synthetic_on_behalf: true } },
      { ...session, id: 'assigned', filter_criteria: { assignment_id: 'assignment' } },
      { ...session, id: 'deleted', filter_criteria: { assignment_id: 'deleted' } },
      { ...session, id: 'test-section', filter_criteria: { kind: 'practice_test' } },
    ], tests: [{ id: 'test', user_id: 'student', testType: 'act', testName: 'ACT Math',
      finished_at: '2026-11-01T13:00:00Z', composite_score: null, math_scaled: 28 }],
  });
  assert.deepEqual(rows.map(row => row.id), ['act-test:test', 'session:session', 'assignment:assignment:student']);
  assert.equal(rows[0].detail, 'Math 28');
  assert.equal(rows[0].href, '/tutor/students/student/tests/test/results');
  assert.equal(rows[1].detail, '2-question set');
  assert.equal(rows[1].status, 'In progress');
  assert.equal(rows[2].status, 'Marked complete');
  assert.doesNotMatch(rows[2].detail, /answered|correct|accuracy/i);
});

test('activity uses newest assignment session, ignores missing scores, and preserves SAT section results', () => {
  const session = { id: 'first', user_id: 's', test_type: 'act', status: 'in_progress',
    last_activity_at: '2026-10-30T12:00:00Z', question_ids: ['q'], filter_criteria: { assignment_id: 'a' } };
  const rows = buildDashboardActivity({ studentIds: ['s'], since: '2026-10-18T00:00:00Z', completions: [],
    assignments: [{ id: 'a', title: 'ACT lesson practice', assignment_type: 'questions' }],
    sessions: [session, { ...session, id: 'second', last_activity_at: '2026-10-31T12:00:00Z' }],
    tests: [{ id: 't', user_id: 's', testType: 'sat', testName: 'SAT', finished_at: '2026-11-01T12:00:00Z',
      composite_score: 1400, rw_scaled: 680, math_scaled: 720 }],
  });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].detail, 'Total 1400 · Reading & Writing 680 · Math 720');
  assert.equal(rows[1].at, '2026-10-31T12:00:00Z');
  assert.equal(rows[1].href, '/tutor/assignments/a/students/s');
});

test('activity loader bounds all sources to roster and recent window, skips empty rosters, and surfaces errors', async () => {
  const source = (await readFile(new URL('./load-dashboard-activity.ts', import.meta.url), 'utf8'))
    .replace(/^import type .*;\r?\n/gm, '')
    .replace("'@/lib/practice/act-form-names'", JSON.stringify(new URL('../practice/act-form-names.ts', import.meta.url).href))
    .replace("'./dashboard-activity'", JSON.stringify(new URL('./dashboard-activity.ts', import.meta.url).href));
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
  const { loadDashboardActivity } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
  const calls = [];
  let error = null;
  const client = { from(table) {
    const log = { table, filters: [] }; calls.push(log);
    const query = {};
    for (const method of ['select', 'in', 'eq', 'gte', 'is', 'order', 'limit']) {
      query[method] = (...args) => { log.filters.push([method, ...args]); return query; };
    }
    query.then = resolve => Promise.resolve({ data: [], error }).then(resolve);
    return query;
  } };
  assert.deepEqual(await loadDashboardActivity(client, []), []);
  assert.equal(calls.length, 0);
  assert.deepEqual(await loadDashboardActivity(client, ['visible'], new Date('2026-11-01T12:00:00Z')), []);
  assert.equal(calls.length, 4);
  for (const call of calls) {
    assert.ok(call.filters.some(([method, key, value]) => method === 'in' && ['user_id', 'student_id'].includes(key) && value[0] === 'visible'));
    assert.ok(call.filters.some(([method, , value]) => method === 'gte' && value === '2026-10-18T12:00:00.000Z'));
    assert.ok(call.filters.some(([method, value]) => method === 'limit' && value === 20));
  }
  error = new Error('activity unavailable');
  await assert.rejects(loadDashboardActivity(client, ['visible']), /activity unavailable/);
});
