import test from 'node:test';
import assert from 'node:assert/strict';

import { estimateLessonMinutes, formatLessonDuration } from './duration.mjs';

test('estimate sums the per-type rule of thumb', () => {
  const blocks = [
    { block_type: 'text' },
    { block_type: 'text' },
    { block_type: 'check' },
    { block_type: 'desmos_interactive' },
    { block_type: 'question_link' },
    { block_type: 'video' },
    { block_type: 'lesson_complete' },
  ];
  assert.equal(
    estimateLessonMinutes(blocks).toFixed(1),
    (0.6 + 0.6 + 1 + 2 + 2 + 1.5 + 0.3).toFixed(1),
  );
});

test('estimate accepts bare type strings and defaults unknown types', () => {
  assert.equal(estimateLessonMinutes(['check', 'check']), 2);
  assert.equal(estimateLessonMinutes([{ block_type: 'mystery' }]), 0.6);
  assert.equal(estimateLessonMinutes([]), 0);
  assert.equal(estimateLessonMinutes(null), 0);
});

test('format rounds to the nearest 5 minutes with a floor of 5', () => {
  assert.equal(formatLessonDuration(29.3), '~30 min');
  assert.equal(formatLessonDuration(22.4), '~20 min');
  assert.equal(formatLessonDuration(1.2), '~5 min');
  assert.equal(formatLessonDuration(0), null);
  assert.equal(formatLessonDuration(NaN), null);
});

test('a typical 38-block lesson lands near half an hour', () => {
  const blocks = [
    ...Array(20).fill('text'),
    ...Array(17).fill('check'),
    'lesson_complete',
  ];
  assert.equal(formatLessonDuration(estimateLessonMinutes(blocks)), '~30 min');
});
