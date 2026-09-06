import assert from 'node:assert/strict';
import test from 'node:test';
import { claimItemAttempt, ITEM_ATTEMPT_CONFLICT_TARGET } from './claim-item-attempt.ts';

// Minimal PostgREST-builder fake. Every chain records one call
// {table, op, payload, opts, filters}; the terminal (.single /
// .maybeSingle / await) resolves it through `handler`.
function fakeClient(handler) {
  const calls = [];
  function builder(table) {
    const call = { table, op: null, payload: null, opts: null, filters: [], select: null };
    const b = {
      insert(p) { call.op = 'insert'; call.payload = p; return b; },
      upsert(p, o) { call.op = 'upsert'; call.payload = p; call.opts = o; return b; },
      delete() { call.op = 'delete'; return b; },
      select(cols) { if (!call.op) call.op = 'select'; call.select = cols; return b; },
      eq(col, val) { call.filters.push([col, val]); return b; },
      single() { calls.push(call); return Promise.resolve(handler(call)); },
      maybeSingle() { calls.push(call); return Promise.resolve(handler(call)); },
      then(resolve, reject) { calls.push(call); return Promise.resolve(handler(call)).then(resolve, reject); },
    };
    return b;
  }
  return { client: { from: builder }, calls };
}

const input = {
  moduleAttemptId: 'ma-1',
  moduleItemId: 'mi-1',
  attempt: { user_id: 'u-1', question_id: 'q-1', is_correct: false, response_text: null, source: 'practice_test' },
};

test('winner: creates attempts row then link row, no cleanup', async () => {
  const { client, calls } = fakeClient((c) => {
    if (c.table === 'attempts' && c.op === 'insert') return { data: { id: 'a-new' }, error: null };
    if (c.table === 'practice_test_item_attempts_v2' && c.op === 'upsert') {
      return { data: { id: 'l-new', attempt_id: c.payload.attempt_id, marked_for_review: false }, error: null };
    }
    throw new Error(`unexpected call ${c.table}.${c.op}`);
  });
  const res = await claimItemAttempt(client, input);
  assert.deepEqual(res, { ok: true, created: true, itemAttemptId: 'l-new', attemptId: 'a-new', markedForReview: false });
  const upsert = calls.find((c) => c.op === 'upsert');
  assert.equal(upsert.opts.onConflict, ITEM_ATTEMPT_CONFLICT_TARGET);
  assert.equal(upsert.opts.ignoreDuplicates, true);
  assert.equal(upsert.payload.attempt_id, 'a-new');
  assert.equal(upsert.payload.marked_for_review, false);
  assert.ok(!calls.some((c) => c.op === 'delete'));
});

test('loser: conflict returns nothing, own attempts row is discarded, winner ids returned', async () => {
  const { client, calls } = fakeClient((c) => {
    if (c.table === 'attempts' && c.op === 'insert') return { data: { id: 'a-mine' }, error: null };
    if (c.table === 'practice_test_item_attempts_v2' && c.op === 'upsert') return { data: null, error: null };
    if (c.table === 'attempts' && c.op === 'delete') return { data: null, error: null };
    if (c.table === 'practice_test_item_attempts_v2' && c.op === 'select') {
      return { data: { id: 'l-theirs', attempt_id: 'a-theirs', marked_for_review: true }, error: null };
    }
    throw new Error(`unexpected call ${c.table}.${c.op}`);
  });
  const res = await claimItemAttempt(client, { ...input, markedForReview: true });
  assert.deepEqual(res, { ok: true, created: false, itemAttemptId: 'l-theirs', attemptId: 'a-theirs', markedForReview: true });
  const del = calls.find((c) => c.op === 'delete');
  assert.deepEqual(del.filters, [['id', 'a-mine']]);
  const lookup = calls.find((c) => c.table === 'practice_test_item_attempts_v2' && c.op === 'select');
  assert.deepEqual(lookup.filters, [
    ['practice_test_module_attempt_id', 'ma-1'],
    ['practice_test_module_item_id', 'mi-1'],
  ]);
});

test('link insert error: own attempts row is discarded and the error surfaces', async () => {
  const { client, calls } = fakeClient((c) => {
    if (c.table === 'attempts' && c.op === 'insert') return { data: { id: 'a-mine' }, error: null };
    if (c.op === 'upsert') return { data: null, error: { message: 'boom' } };
    if (c.op === 'delete') return { data: null, error: null };
    throw new Error(`unexpected call ${c.table}.${c.op}`);
  });
  const res = await claimItemAttempt(client, input);
  assert.deepEqual(res, { ok: false, error: 'boom' });
  assert.ok(calls.some((c) => c.op === 'delete'));
});

test('attempts insert error: nothing else is attempted', async () => {
  const { client, calls } = fakeClient((c) => {
    if (c.table === 'attempts' && c.op === 'insert') return { data: null, error: { message: 'rls' } };
    throw new Error(`unexpected call ${c.table}.${c.op}`);
  });
  const res = await claimItemAttempt(client, input);
  assert.deepEqual(res, { ok: false, error: 'rls' });
  assert.equal(calls.length, 1);
});

test('conflict but the winner row is gone: reports failure after cleanup', async () => {
  const { client } = fakeClient((c) => {
    if (c.table === 'attempts' && c.op === 'insert') return { data: { id: 'a-mine' }, error: null };
    if (c.op === 'upsert') return { data: null, error: null };
    if (c.op === 'delete') return { data: null, error: null };
    if (c.op === 'select') return { data: null, error: null };
    throw new Error(`unexpected call ${c.table}.${c.op}`);
  });
  const res = await claimItemAttempt(client, input);
  assert.equal(res.ok, false);
});
