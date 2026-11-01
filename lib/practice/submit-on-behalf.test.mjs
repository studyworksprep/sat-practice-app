import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Exercise the production action with an in-memory database applying its filters.
const source = (await readFile(new URL('../../app/(tutor)/tutor/assignments/[id]/actions.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\r?\n/gm, '');
const stub = `
let context;
export function setContext(next) { context = next; }
const requireUser = async () => context;
const revalidatePath = () => {};
const actionOk = data => ({ ok: true, ...data });
const actionFail = error => ({ ok: false, error });
class ApiError extends Error {}
const expandToAttemptIds = async (_db, ids) => ({ allIds: ids });
`;
const action = await import(`data:text/javascript;base64,${Buffer.from(stub + source).toString('base64')}`);

function database(tables, failAttempts = false) {
  return { from(table) {
    let rows = [...(tables[table] ?? [])];
    let single = false;
    let patch = null;
    let inserted = null;
    const query = {
      select() { return query; },
      eq(key, value) { rows = rows.filter(r => (key.includes('->>') ? r.filter_criteria?.assignment_id : r[key]) === value); return query; },
      neq(key, value) { rows = rows.filter(r => r[key] !== value); return query; },
      in(key, values) { rows = rows.filter(r => values.includes(r[key])); return query; },
      gte(key, value) { rows = rows.filter(r => r[key] >= value); return query; },
      order(key, { ascending = true } = {}) { rows.sort((a,b) => String(a[key]).localeCompare(String(b[key])) * (ascending ? 1 : -1)); return query; },
      limit(n) { rows = rows.slice(0,n); return query; },
      maybeSingle() { single = true; return query; },
      single() { single = true; return query; },
      insert(data) { inserted = { id: 'synthetic', ...data }; return query; },
      update(data) { patch = data; return query; },
      then(resolve) {
        if (failAttempts && ['attempts', 'act_attempts'].includes(table)) return Promise.resolve({ data: null, error: { message: 'unavailable' } }).then(resolve);
        if (inserted) { (tables[table] ??= []).push(inserted); rows = [inserted]; }
        if (patch) rows.forEach(row => Object.assign(row, patch));
        return Promise.resolve({ data: single ? rows[0] ?? null : rows, error: null }).then(resolve);
      },
    };
    return query;
  } };
}

for (const testType of ['sat', 'act']) {
  test(`${testType}: synthetic start uses only this student's assignment answers`, async () => {
    const attempt = { user_id: 'student', question_id: 'q', context_type: 'assignment', context_id: 'b', created_at: '2026-10-24T12:00:00Z' };
    const tables = {
      assignments_v2: [{ id: 'b', assignment_type: 'questions', question_ids: ['q'], created_at: '2026-10-22T12:00:00Z', test_type: testType }],
      assignment_students_v2: [{ assignment_id: 'b', student_id: 'student', completed_at: null }],
      profiles: [{ id: 'student', role: 'student' }],
      practice_sessions: [],
      [testType === 'act' ? 'act_attempts' : 'attempts']: [
        { ...attempt, context_id: 'other', created_at: '2026-08-26T12:00:00Z' },
        { ...attempt, context_type: 'practice', created_at: '2026-10-23T12:00:00Z' },
        { ...attempt, user_id: 'other-student', created_at: '2026-10-23T12:00:00Z' },
        attempt,
      ],
    };
    action.setContext({ profile: { role: 'teacher' }, supabase: database(tables) });
    const form = new FormData(); form.set('assignment_id', 'b'); form.set('student_id', 'student');
    const result = await action.submitAssignmentOnBehalf(null, form);
    assert.equal(result.ok, true);
    assert.equal(tables.practice_sessions[0].created_at, attempt.created_at);
    assert.equal(tables.practice_sessions[0].filter_criteria.synthetic_on_behalf, true);
  });
}

test('empty manual submission stays allowed without inventing an old start; query errors cause no writes', async () => {
  const tables = {
    assignments_v2: [{ id: 'b', assignment_type: 'questions', question_ids: ['q'], created_at: '2026-10-22T12:00:00Z', test_type: 'sat' }],
    assignment_students_v2: [{ assignment_id: 'b', student_id: 'student', completed_at: null }],
    profiles: [{ id: 'student', role: 'student' }], practice_sessions: [],
    attempts: [{ user_id: 'student', question_id: 'q', context_type: 'assignment', context_id: 'other', created_at: '2026-08-26T12:00:00Z' }],
  };
  const form = new FormData(); form.set('assignment_id', 'b'); form.set('student_id', 'student');
  action.setContext({ profile: { role: 'teacher' }, supabase: database(tables, true) });
  assert.equal((await action.submitAssignmentOnBehalf(null, form)).ok, false);
  assert.equal(tables.practice_sessions.length, 0);
  assert.equal(tables.assignment_students_v2[0].completed_at, null);
  action.setContext({ profile: { role: 'teacher' }, supabase: database(tables) });
  const before = Date.now();
  assert.equal((await action.submitAssignmentOnBehalf(null, form)).ok, true);
  assert.ok(Date.parse(tables.practice_sessions[0].created_at) >= before);
  assert.equal(tables.attempts.length, 1);
});
