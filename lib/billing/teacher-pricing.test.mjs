import { test } from 'node:test';
import assert from 'node:assert/strict';
import { teacherCheckoutItem, teacherPriceLabel } from './teacher-pricing.mjs';

test('teachers registered before Eastern midnight retain the legacy price', () => {
  for (const signup of ['2020-01-01T00:00:00Z', '2026-11-08T04:59:59.999Z']) {
    assert.deepEqual(teacherCheckoutItem('price_legacy_teacher', signup), {
      price: 'price_legacy_teacher', quantity: 1,
    });
  }
});
test('teachers registered at or after Eastern midnight use the new price', () => {
  for (const signup of ['2026-11-08T05:00:00Z', '2027-01-01T00:00:00Z']) {
    assert.deepEqual(teacherCheckoutItem('price_legacy_teacher', signup), {
      price: 'price_1UZ9LNLvbvAbthFEuHDLEr2e', quantity: 1,
    });
  }
});
test('invalid teacher signup dates cannot create checkout items', () => {
  for (const signup of [undefined, null, '', 'invalid']) {
    assert.throws(() => teacherCheckoutItem('price_legacy_teacher', signup));
  }
});

test('teacher display prices match the signup cutoff', () => {
  assert.equal(teacherPriceLabel('2026-11-08T04:59:59.999Z'), '$29.99');
  assert.equal(teacherPriceLabel('2026-11-08T05:00:00Z'), '$39.99');
  assert.equal(teacherPriceLabel('2027-01-01T00:00:00Z'), '$39.99');
});
