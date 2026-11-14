// Role → purchasable plan. Run with
// `node --test lib/billing/plan-for-role.test.mjs`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planForRole, checkoutReturnPath, homePathForRole } from './plan-for-role.ts';

test('a tutor can only buy the teacher plan', () => {
  assert.equal(planForRole('teacher'), 'teacher');
});

test('students, exploring accounts and contributors buy the student plan', () => {
  for (const role of ['student', 'practice', 'contributor', null, undefined, '']) {
    assert.equal(planForRole(role), 'student', String(role));
  }
});

test('staff never buy a plan', () => {
  assert.equal(planForRole('admin'), null);
  assert.equal(planForRole('manager'), null);
});

test('a tutor returns to the tutor dashboard with the checkout marker intact', () => {
  assert.equal(checkoutReturnPath('teacher'), '/tutor/dashboard?checkout=success');
  assert.equal(checkoutReturnPath('student'), '/dashboard?checkout=success');
});

test('accounts with access land on their own home', () => {
  assert.equal(homePathForRole('teacher'), '/tutor/dashboard');
  assert.equal(homePathForRole('manager'), '/tutor/dashboard');
  assert.equal(homePathForRole('admin'), '/admin');
  assert.equal(homePathForRole('student'), '/dashboard');
});
