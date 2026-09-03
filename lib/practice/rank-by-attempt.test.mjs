import test from 'node:test';
import assert from 'node:assert/strict';

import {
  lastAttemptByQuestion,
  rankLeastRecentlyAttempted,
} from './rank-by-attempt.mjs';

test('keeps the most recent attempt per question regardless of row order', () => {
  const latest = lastAttemptByQuestion([
    { question_id: 'q1', created_at: '2026-07-01T00:00:00Z' },
    { question_id: 'q1', created_at: '2026-07-09T00:00:00Z' },
    { question_id: 'q1', created_at: '2026-07-05T00:00:00Z' },
  ]);
  assert.equal(latest.get('q1'), '2026-07-09T00:00:00Z');
});

test('never-attempted questions come first', () => {
  const ranked = rankLeastRecentlyAttempted(
    ['seen-recent', 'never', 'seen-old'],
    [
      { question_id: 'seen-recent', created_at: '2026-07-09T00:00:00Z' },
      { question_id: 'seen-old', created_at: '2026-07-01T00:00:00Z' },
    ],
  );
  assert.deepEqual(ranked, ['never', 'seen-old', 'seen-recent']);
});

// The end-of-lesson drill's whole point: a student who just learned a
// topic has attempted nothing in it, and must still get questions.
test('a student with no attempts keeps every candidate, in order', () => {
  const ranked = rankLeastRecentlyAttempted(['a', 'b', 'c'], []);
  assert.deepEqual(ranked, ['a', 'b', 'c']);
});

test('does not mutate the caller array', () => {
  const input = ['b', 'a'];
  rankLeastRecentlyAttempted(input, [
    { question_id: 'b', created_at: '2026-07-01T00:00:00Z' },
  ]);
  assert.deepEqual(input, ['b', 'a']);
});

test('tolerates empty and malformed input', () => {
  assert.deepEqual(rankLeastRecentlyAttempted(undefined, undefined), []);
  assert.equal(lastAttemptByQuestion([{ created_at: 'x' }]).size, 0);
});
