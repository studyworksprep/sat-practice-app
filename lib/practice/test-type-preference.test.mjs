import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTestType, pickTestType } from './test-type-preference.ts';

test('parseTestType accepts sat/act in any case and rejects everything else', () => {
  assert.equal(parseTestType('sat'), 'sat');
  assert.equal(parseTestType(' ACT '), 'act');
  assert.equal(parseTestType('psat'), null);
  assert.equal(parseTestType(''), null);
  assert.equal(parseTestType(undefined), null);
  assert.equal(parseTestType(['act']), null);
});

test('pickTestType: the URL param wins over the stored cookie', () => {
  assert.equal(pickTestType('sat', 'act'), 'sat');
  assert.equal(pickTestType('act', 'sat'), 'act');
});

test('pickTestType: a missing or malformed param falls back to the stored choice', () => {
  assert.equal(pickTestType(undefined, 'act'), 'act');
  assert.equal(pickTestType('nonsense', 'act'), 'act');
});

test('pickTestType: SAT is the default when nothing valid is set', () => {
  assert.equal(pickTestType(undefined, undefined), 'sat');
  assert.equal(pickTestType('x', 'y'), 'sat');
});
