import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSessionWorkspace } from './load-session-workspace.ts';
import type { TypedSupabaseClient } from '../supabase/server.ts';
import type { StudentPlanState } from '../plan/load-plan-state.ts';

const now = new Date('2026-10-31T15:30:00Z');
const student = { first_name: 'Seed', last_name: 'Student', email: null, target_sat_score: null, sat_test_date: null };
const plan: StudentPlanState = { active: null, draft: null, tasksByPlan: new Map(), adherence: null };
const flush = () => new Promise<void>(resolve => setImmediate(resolve));
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

interface Query {
  table: string;
  columns?: string;
  filters: unknown[][];
}

function fixture() {
  const started: Query[] = [];
  const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
  const profiles = deferred<{ data: typeof student | null }>();
  const notes = deferred<{ data: { id: string; author_id: string; body: string; session_at: string }[] }>();
  const assignments = deferred<{ data: unknown[] }>();
  const coverage = deferred<{ data: [] }>();
  const plans = deferred<StudentPlanState>();
  const db = {
    from(table: string) {
      const query: Query = { table, filters: [] };
      const builder = {
        select(columns: string) { query.columns = columns; return this; },
        eq(...args: unknown[]) { query.filters.push(['eq', ...args]); return this; },
        gte(...args: unknown[]) { query.filters.push(['gte', ...args]); return this; },
        in(...args: unknown[]) { query.filters.push(['in', ...args]); return this; },
        order() { return this; }, limit() { return this; }, maybeSingle() { return this; },
        then(yes: (value: unknown) => unknown, no?: (reason: unknown) => unknown) {
          started.push(query);
          const result = table === 'profiles' ? profiles.promise
            : table === 'tutor_notes' ? notes.promise
              : table === 'assignment_students_v2' ? assignments.promise
                : Promise.resolve(query.columns === 'id' ? { count: 4, data: null } : { data: [] });
          return result.then(yes, no);
        },
      };
      return builder;
    },
    rpc(name: string, args: Record<string, unknown>) {
      rpcCalls.push({ name, args });
      return name === 'get_student_coverage' ? coverage.promise : Promise.resolve({ data: [] });
    },
  } as unknown as TypedSupabaseClient;
  const dependencies = { loadPlan: () => plans.promise, loadDue: async () => [] };
  const finish = () => { coverage.resolve({ data: [] }); plans.resolve(plan); };
  return { db, dependencies, profiles, notes, assignments, coverage, plans, started, rpcCalls, finish };
}

test('prep and report reads start after their own inputs, while slow coverage/plan reads remain pending', async () => {
  const f = fixture();
  const loading = loadSessionWorkspace(f.db, 'student-id', now, f.dependencies);
  await flush();
  assert.ok(f.rpcCalls.some(c => c.name === 'get_skill_mastery_asof' && c.args.p_asof === '2026-10-31'));
  assert.equal(f.rpcCalls.filter(c => c.name === 'get_roster_skill_performance').length, 0);
  f.profiles.resolve({ data: student });
  f.notes.resolve({ data: [{ id: 'n', author_id: 'tutor', body: 'Note', session_at: '2026-10-25T18:00:00Z' }] });
  await flush();
  assert.ok(f.rpcCalls.some(c => c.name === 'get_skill_mastery_asof' && c.args.p_asof === '2026-10-25'));
  assert.ok(f.rpcCalls.some(c => c.name === 'get_roster_skill_performance' && c.args.p_since === '2026-10-25T18:00:00Z'));
  assert.ok(f.started.some(q => q.table === 'practice_sessions' && q.filters.some(a => a[0] === 'gte' && a[2] === '2026-10-25T18:00:00Z')));
  assert.equal(f.started.filter(q => q.columns?.includes('filter_criteria')).length, 0);
  const assignment = (id: string, created_at: string, deleted_at: string | null = null) => ({
    completed_at: null, assignment: { id, created_at, deleted_at, archived_at: null, title: id, assignment_type: 'questions', due_date: null },
  });
  f.assignments.resolve({ data: [assignment('older', '2026-01-01'), assignment('b', '2026-10-28'),
    assignment('a', '2026-10-29'), assignment('c', '2026-10-27'), assignment('deleted', '2026-10-30', '2026-10-30')] });
  await flush();
  const reports = f.started.find(q => q.columns?.includes('filter_criteria'));
  assert.deepEqual(reports?.filters.find(a => a[0] === 'in'), ['in', 'filter_criteria->>assignment_id', ['a', 'b', 'c']]);
  f.finish();
  const result = await loading;
  assert.equal(result?.sessionsSince, 4);
  assert.equal(result?.lastNoteIso, '2026-10-25T18:00:00Z');
  assert.deepEqual(result?.assignments.map(a => a.a?.id), ['a', 'b', 'c']);
  assert.equal(f.started.filter(q => q.table === 'profiles').length, 1);
  assert.equal(f.started.filter(q => q.table === 'tutor_notes').length, 1);
});

test('missing notes retain the fourteen-day window and empty assignments skip report queries', async () => {
  const f = fixture();
  const loading = loadSessionWorkspace(f.db, 'student-id', now, f.dependencies);
  f.profiles.resolve({ data: student }); f.notes.resolve({ data: [] });
  f.assignments.resolve({ data: [] }); f.finish();
  const result = await loading;
  assert.equal(result?.sinceIso, '2026-10-17T15:30:00.000Z');
  assert.equal(result?.lastNoteIso, null);
  assert.ok(f.rpcCalls.some(c => c.name === 'get_skill_mastery_asof' && c.args.p_asof === '2026-10-17'));
  assert.equal(f.started.filter(q => q.columns?.includes('filter_criteria')).length, 0);
});

test('an RLS-invisible student returns absent and never starts note/assignment-dependent reads', async () => {
  const f = fixture();
  const loading = loadSessionWorkspace(f.db, 'hidden-id', now, f.dependencies);
  f.profiles.resolve({ data: null }); f.notes.resolve({ data: [] });
  f.assignments.resolve({ data: [] }); f.finish();
  assert.equal(await loading, null);
  assert.equal(f.rpcCalls.filter(c => c.name === 'get_roster_skill_performance').length, 0);
  assert.equal(f.started.filter(q => q.table === 'practice_sessions').length, 0);
});

test('review-queue failure remains best effort and rejected dependencies propagate cleanly', async () => {
  const f = fixture();
  const loading = loadSessionWorkspace(f.db, 'student-id', now, {
    ...f.dependencies, loadDue: async () => { throw Error('Queue offline'); },
  });
  f.profiles.resolve({ data: student }); f.notes.resolve({ data: [] });
  f.assignments.resolve({ data: [] }); f.finish();
  assert.deepEqual((await loading)?.dueItems, []);

  const broken = fixture();
  const failure = loadSessionWorkspace(broken.db, 'student-id', now, broken.dependencies);
  const rejection = assert.rejects(failure, /Notes unavailable/);
  broken.profiles.resolve({ data: student }); broken.notes.reject(Error('Notes unavailable'));
  broken.assignments.resolve({ data: [] }); broken.finish();
  await rejection;
  await flush();
});
