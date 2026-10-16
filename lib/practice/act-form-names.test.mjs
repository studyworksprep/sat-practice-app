import test from 'node:test';
import assert from 'node:assert/strict';
import {
  actFormDetail,
  actFormName,
  actFormNamer,
  defaultActFormName,
  parseActSourceTest,
} from './act-form-names.ts';

test('dated keys become "<Month> <Year> ACT" with the form code as detail', () => {
  assert.equal(defaultActFormName('ACT-2022-April-E25'), 'April 2022 ACT');
  assert.equal(actFormDetail('ACT-2022-April-E25'), 'Form E25');
  assert.equal(defaultActFormName('ACT-2024-Sep'), 'September 2024 ACT');
  assert.equal(actFormDetail('ACT-2024-Sep'), null);
  assert.equal(defaultActFormName('ACT-2025-Oct'), 'October 2025 ACT');
  assert.equal(defaultActFormName('ACT-2026-April-FormJ01'), 'April 2026 ACT');
  assert.equal(actFormDetail('ACT-2026-April-FormJ01'), 'Form J01');
  assert.equal(defaultActFormName('ACT-2026-June-FormA1D'), 'June 2026 ACT');
  assert.equal(actFormDetail('ACT-2026-June-FormA1D'), 'Form A1D');
  assert.deepEqual(parseActSourceTest('ACT-2022-April-E25'), { kind: 'dated', year: 2022, month: 'April', formCode: 'E25' });
});

test('online multiple-choice keys name the test number and edition year', () => {
  assert.equal(defaultActFormName('ACT-25MC1'), 'Online Multiple Choice Test 1 (2025)');
  assert.equal(defaultActFormName('ACT-25MC5'), 'Online Multiple Choice Test 5 (2025)');
  assert.equal(defaultActFormName('ACT-2026-MC2'), 'Online Multiple Choice Test 2 (2026)');
  assert.equal(actFormDetail('ACT-25MC1'), null);
  assert.deepEqual(parseActSourceTest('act-25mc3'), { kind: 'online_mc', year: 2025, number: 3 });
});

test('unknown keys fall back to the key itself', () => {
  assert.equal(defaultActFormName('DEV-ACT-FIXTURE'), 'DEV-ACT-FIXTURE');
  assert.equal(defaultActFormName('ACT-2022-Foo-E25'), 'ACT-2022-Foo-E25');
  assert.deepEqual(parseActSourceTest('whatever'), { kind: 'unknown' });
  assert.equal(actFormDetail(''), null);
});

test('an admin display_name wins; blanks fall back to the default', () => {
  assert.equal(actFormName('ACT-25MC5', 'Online Multiple Choice Test 4 (2025)'), 'Online Multiple Choice Test 4 (2025)');
  assert.equal(actFormName('ACT-25MC5', '   '), 'Online Multiple Choice Test 5 (2025)');
  assert.equal(actFormName('ACT-25MC5', null), 'Online Multiple Choice Test 5 (2025)');
  const name = actFormNamer([
    { source_test: 'ACT-2024-Sep', display_name: 'September 2024 ACT (Math only)' },
    { source_test: 'ACT-2025-Oct', display_name: '' },
  ]);
  assert.equal(name('ACT-2024-Sep'), 'September 2024 ACT (Math only)');
  assert.equal(name('ACT-2025-Oct'), 'October 2025 ACT');
  assert.equal(name('ACT-2026-June-FormA1D'), 'June 2026 ACT');
});
