import test from 'node:test';
import assert from 'node:assert/strict';
import { accuracyKey, dashboardAccuracyMetric, shapeActDashboardAggregate } from './dashboard-summary.ts';

test('ACT summary separates lifetime counts from first-answer performance and handles bigint strings', () => {
  const summary = shapeActDashboardAggregate({
    total_attempts: '1207', correct_attempts: '1204', week_attempts: '1206',
    per_section: [
      { section: 'english', correct: '0', total: '1', categories: [{ name: 'Grammar', code: 'G', correct: '0', total: '1' }] },
      { section: 'math', correct: '1202', total: '1202', categories: [{ name: 'Algebra', code: 'A', correct: '1202', total: '1202' }] },
      { section: 'unknown', correct: '0', total: '1', categories: [{ name: 'Other', code: null, correct: '0', total: '1' }] },
    ],
  });
  assert.equal(summary.totalAttempts, 1207);
  assert.equal(summary.correctAttempts, 1204);
  assert.equal(summary.weekAttempts, 1206);
  assert.equal(summary.performance.total, 1204);
  assert.equal(summary.performance.correct, 1202);
  assert.equal(summary.performance.sections[0].label, 'English');
  assert.equal(summary.performance.sections[0].pct, 0);
  assert.equal(summary.performance.sections[1].pct, 100);
  assert.equal(summary.performance.sections[1].categories[0].total, 1202);
  assert.equal(summary.performance.sections[2].categories[0].code, null);
});

test('empty ACT history stays empty instead of rendering zero-percent sections', () => {
  const summary = shapeActDashboardAggregate({ total_attempts: 0, correct_attempts: 0, week_attempts: 0, per_section: [] });
  assert.equal(summary.totalAttempts, 0);
  assert.equal(summary.performance.pct, null);
  assert.deepEqual(summary.performance.sections, []);
});

test('recent-card metrics preserve unanswered fallbacks, null/incorrect answers and rounding', () => {
  assert.equal(dashboardAccuracyMetric(undefined, 8), '8 questions');
  assert.equal(dashboardAccuracyMetric({ attempted: 0, correct: 0 }, 4), '4 questions');
  assert.equal(dashboardAccuracyMetric({ attempted: 3, correct: 2 }, 8), '2 of 3 · 67%');
  assert.equal(dashboardAccuracyMetric({ attempted: 2, correct: 0 }, 4), '0 of 2 · 0%');
  assert.notEqual(accuracyKey('session', 'same-id'), accuracyKey('assignment', 'same-id'));
});
