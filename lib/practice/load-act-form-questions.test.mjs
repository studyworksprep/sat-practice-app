import test from 'node:test';
import assert from 'node:assert/strict';
import { loadActFormQuestions } from './load-act-form-questions.ts';

function client(rows, errorAt = -1) {
  const ranges = [];
  const filters = [];
  const query = {
    select() { return this; },
    is(...args) { filters.push(['is', ...args]); return this; },
    eq(...args) { filters.push(['eq', ...args]); return this; },
    not() { return this; },
    order(key) { assert.equal(key, 'id'); return this; },
    async range(from, to) {
      ranges.push([from, to]);
      if (from === errorAt) return { data: null, error: new Error('Database unavailable') };
      return { data: rows.slice(from, to + 1), error: null };
    },
  };
  return { from: () => query, ranges, filters };
}

test('loads all question identities beyond the API page limit with visibility and form filters', async () => {
  const rows = Array.from({ length: 1234 }, (_, id) => ({ id: String(id) }));
  const db = client(rows);
  assert.deepEqual((await loadActFormQuestions(db, 'June')).data, rows);
  assert.deepEqual(db.ranges, [[0, 999], [1000, 1999]]);
  const pageFilters = [['eq', 'is_broken', false], ['is', 'deleted_at', null], ['eq', 'source_test', 'June']];
  assert.deepEqual(db.filters, [...pageFilters, ...pageFilters]);
});

test('a failed later page cannot silently become an incomplete count', async () => {
  const db = client(Array.from({ length: 1200 }, () => ({})), 1000);
  await assert.rejects(loadActFormQuestions(db), /Database unavailable/);
});
