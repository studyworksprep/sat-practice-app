import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHistory, orderStudents, studentFromPath } from './dashboard-history.ts';
import { resolveDashboardReport } from './dashboard-report.ts';

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
