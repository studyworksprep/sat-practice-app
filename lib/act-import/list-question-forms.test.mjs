import assert from 'node:assert/strict';
import test from 'node:test';
import { listActQuestionForms } from './list-question-forms.ts';

test('includes later forms even when the API cap is smaller than the requested page', async () => {
  const rows = [...Array(1001).fill({ source_test: 'Older form' }), { source_test: 'ACT-2026-October-FormK09' }];
  const client = { from() { return {
    select() { return this; }, not() { return this; }, order() { return this; },
    async range(start, end) { return { data: rows.slice(start, Math.min(start + 100, end + 1)), error: null }; },
  }; } };
  assert.deepEqual(await listActQuestionForms(client), ['ACT-2026-October-FormK09', 'Older form']);
});

test('does not silently show an incomplete list on a query failure', async () => {
  const failure = new Error('Query failed');
  const client = { from() { return {
    select() { return this; }, not() { return this; }, order() { return this; },
    async range() { return { data: null, error: failure }; },
  }; } };
  await assert.rejects(listActQuestionForms(client), failure);
});
