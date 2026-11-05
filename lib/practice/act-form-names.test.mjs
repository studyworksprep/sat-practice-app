import test from 'node:test';
import assert from 'node:assert/strict';
import {
  actFormName,
  actFormNamer,
  compareActForms,
  defaultActFormName,
  parseActSourceTest,
} from './act-form-names.ts';

test('released exams read "Month Year" with no "ACT" and no form code', () => {
  assert.equal(defaultActFormName('ACT-2022-April-E25'), 'April 2022');
  assert.equal(defaultActFormName('ACT-2024-December-FormH31'), 'December 2024');
  assert.equal(defaultActFormName('ACT-2024-Sep'), 'September 2024');
  assert.equal(defaultActFormName('ACT-2025-February-FormZ14'), 'February 2025');
  assert.equal(defaultActFormName('ACT-2025-Oct'), 'October 2025');
  assert.equal(defaultActFormName('ACT-2026-April-FormJ01'), 'April 2026');
  assert.equal(defaultActFormName('ACT-2026-June-FormA1D'), 'June 2026');
  // The code is still parsed from the key; it just isn't shown.
  assert.deepEqual(parseActSourceTest('ACT-2022-April-E25'), { kind: 'dated', year: 2022, month: 'April', formCode: 'E25' });
});

test('online practice tests read "ACT Online Practice Test N"', () => {
  assert.equal(defaultActFormName('ACT-25MC1'), 'ACT Online Practice Test 1');
  // 25MC5's file code is 5, but it is Online Practice Test 2.
  assert.equal(defaultActFormName('ACT-25MC5'), 'ACT Online Practice Test 2');
  assert.equal(defaultActFormName('ACT-Online-Practice-Test-3'), 'ACT Online Practice Test 3');
  assert.equal(defaultActFormName('ACT-Online-Practice-Test-4'), 'ACT Online Practice Test 4');
  // An unmapped file code keeps its own number.
  assert.equal(defaultActFormName('ACT-2026-MC3'), 'ACT Online Practice Test 3');
  assert.deepEqual(parseActSourceTest('act-25mc5'), { kind: 'online_practice', number: 2 });
});

test('unknown keys fall back to the key itself', () => {
  assert.equal(defaultActFormName('DEV-ACT-FIXTURE'), 'DEV-ACT-FIXTURE');
  assert.equal(defaultActFormName('ACT-2022-Foo-E25'), 'ACT-2022-Foo-E25');
  assert.deepEqual(parseActSourceTest('whatever'), { kind: 'unknown' });
});

test('forms sort released-newest-first, then practice tests by number', () => {
  const keys = [
    'ACT-Online-Practice-Test-4', 'ACT-2024-Sep', 'ACT-25MC5', 'DEV-ACT-FIXTURE',
    'ACT-2024-December-FormH31', 'ACT-2026-June-FormA1D', 'ACT-25MC1', 'ACT-2026-April-FormJ01',
    'ACT-Online-Practice-Test-3', 'ACT-2022-April-E25',
  ];
  assert.deepEqual([...keys].sort(compareActForms).map(defaultActFormName), [
    'June 2026',
    'April 2026',
    'December 2024',
    'September 2024',
    'April 2022',
    'ACT Online Practice Test 1',
    'ACT Online Practice Test 2',
    'ACT Online Practice Test 3',
    'ACT Online Practice Test 4',
    'DEV-ACT-FIXTURE',
  ]);
});

test('an admin display_name wins; blanks fall back to the default', () => {
  assert.equal(actFormName('ACT-25MC5', 'Custom name'), 'Custom name');
  assert.equal(actFormName('ACT-25MC5', '   '), 'ACT Online Practice Test 2');
  assert.equal(actFormName('ACT-25MC5', null), 'ACT Online Practice Test 2');
  const name = actFormNamer([
    { source_test: 'ACT-2024-Sep', display_name: 'September 2024 (Math only)' },
    { source_test: 'ACT-2025-Oct', display_name: '' },
  ]);
  assert.equal(name('ACT-2024-Sep'), 'September 2024 (Math only)');
  assert.equal(name('ACT-2025-Oct'), 'October 2025');
  assert.equal(name('ACT-2026-June-FormA1D'), 'June 2026');
});
