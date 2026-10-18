import assert from 'node:assert/strict';
import test from 'node:test';
import { actSectionReviewPath, findActSectionReviewLink, scopeActReviewSession } from './act-review-navigation.ts';

test('score tiles match section routes without depending on session IDs in URLs', () => {
  const english = { section: 'english', href: actSectionReviewPath('attempt-1', 'english') };
  const math = { section: 'math', href: actSectionReviewPath('attempt-1', 'math') };
  assert.equal(findActSectionReviewLink([english, math], 'math', 'session-2'), math);
  assert.equal(findActSectionReviewLink([english, math], 'science', 'session-2'), undefined);
  const tutor = { href: '/tutor/sessions/session-2' };
  assert.equal(findActSectionReviewLink([tutor], 'math', 'session-2'), tutor);
});

test('ACT section links stay within the attempt and Practice Tests', () => {
  for (const section of ['english', 'math', 'reading', 'science']) {
    assert.equal(actSectionReviewPath('attempt-1', section),
      `/practice/test/act/attempt/attempt-1/review/${section}`);
  }
});

test('legacy mixed sessions are scoped in session order with remapped flags', () => {
  const session = {
    id: 'legacy', question_ids: ['english', 'math-2', 'reading', 'math-1'],
    marked_positions: [0, 3], created_at: '2026-10-18T12:00:00Z',
  };
  const scoped = scopeActReviewSession(session, ['math-1', 'math-2', 'unrelated']);
  assert.deepEqual(scoped.question_ids, ['math-2', 'math-1']);
  assert.deepEqual(scoped.marked_positions, [1]);
  assert.equal(scoped.created_at, session.created_at);
  assert.equal(session.question_ids.length, 4);
});

test('single-section and unavailable-section sessions are handled without invented questions', () => {
  const session = { question_ids: ['science-1'] };
  assert.deepEqual(scopeActReviewSession(session, ['science-1']).question_ids, ['science-1']);
  assert.deepEqual(scopeActReviewSession(session, []).question_ids, []);
  assert.deepEqual(scopeActReviewSession(session, ['science-1']).marked_positions, []);
});
