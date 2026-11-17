import { test } from 'node:test';
import assert from 'node:assert/strict';
import { currentPlanRationale } from './rationale.ts';

test('a changed goal is reflected without changing the schedule explanation', () => {
  assert.equal(currentPlanRationale('16-week plan from 1000 toward 1400. Cover topics, then review.', 1500),
    '16-week plan from 1000 toward 1500. Cover topics, then review.');
  assert.equal(currentPlanRationale('8-week plan toward 1300. Review weekly.', 1450),
    '8-week plan toward 1450. Review weekly.');
});

test('clearing a goal removes its score sentence without inventing a zero target', () => {
  assert.equal(currentPlanRationale('16-week plan from 1000 toward 1400. Keep reviewing.', null),
    '16-week plan. Keep reviewing.');
});

test('custom tutor text and absent explanations are preserved', () => {
  const custom = 'Tutor plan: work toward 1400 while balancing school.';
  assert.equal(currentPlanRationale(custom, 1500), custom);
  assert.equal(currentPlanRationale(null, 1500), null);
});
