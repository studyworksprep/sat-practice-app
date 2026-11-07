import { test } from 'node:test';
import assert from 'node:assert/strict';
import { usesNewStudentPrice, studentPriceLabel, studentCheckoutItem } from './student-pricing.mjs';
test('Eastern midnight cutoff preserves earlier signups', () => {
  assert.equal(studentPriceLabel('2026-11-08T04:59:59.999Z'), '$12.99');
  assert.equal(studentPriceLabel('2026-11-08T05:00:00.000Z'), '$28.99');
  assert.equal(usesNewStudentPrice('2027-01-01T00:00:00Z'), true);
  assert.throws(() => usesNewStudentPrice(undefined));
});
test('existing accounts retain the configured legacy Stripe price', () => {
  for (const signup of ['2020-01-01T00:00:00Z', '2026-11-08T04:59:59.999Z']) {
    assert.deepEqual(studentCheckoutItem('price_legacy', signup), {
      price: 'price_legacy', quantity: 1,
    });
  }
});
test('accounts at or after the cutoff use the new Stripe catalog price', () => {
  for (const signup of ['2026-11-08T05:00:00Z', '2027-01-01T00:00:00Z']) {
    assert.deepEqual(studentCheckoutItem('price_legacy', signup), {
      price: 'price_1UYbGjLvbvAbthFETstrZ28v', quantity: 1,
    });
  }
});
test('invalid signup dates cannot create checkout line items', () => {
  for (const signup of [undefined, null, '', 'invalid']) {
    assert.throws(() => studentCheckoutItem('price_legacy', signup));
  }
});
