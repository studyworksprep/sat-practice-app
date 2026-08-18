import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeCurriculumUnitSettings,
  planCurriculumUnitMove,
} from './curriculumUnitSettings.ts';

test('active settings accept positive whole minutes and a 0-100 mastery bar', () => {
  assert.deepEqual(
    normalizeCurriculumUnitSettings({ expectedMinutes: '45', masteryThreshold: '80' }),
    { ok: true, value: { expectedMinutes: 45, masteryThreshold: 80 } },
  );
  assert.equal(
    normalizeCurriculumUnitSettings({ expectedMinutes: '0', masteryThreshold: '80' }).ok,
    false,
  );
  assert.equal(
    normalizeCurriculumUnitSettings({ expectedMinutes: '45.5', masteryThreshold: '80' }).ok,
    false,
  );
  assert.equal(
    normalizeCurriculumUnitSettings({ expectedMinutes: '45', masteryThreshold: '101' }).ok,
    false,
  );
});

test('moving a unit stays inside its section and normalizes global positions', () => {
  const rows = [
    { id: 'math-a', domainCode: 'H', sequence: 10 },
    { id: 'rw-a', domainCode: 'INI', sequence: 11 },
    { id: 'math-b', domainCode: 'P', sequence: 20 },
    { id: 'rw-b', domainCode: 'SEC', sequence: 21 },
  ];

  assert.deepEqual(planCurriculumUnitMove(rows, 'math-b', 'up'), {
    status: 'moved',
    assignments: [
      { id: 'math-b', sequence: 1 },
      { id: 'math-a', sequence: 2 },
      { id: 'rw-a', sequence: 3 },
      { id: 'rw-b', sequence: 4 },
    ],
  });
});

test('moving past a section boundary is a no-op', () => {
  const rows = [
    { id: 'math-a', domainCode: 'H', sequence: 1 },
    { id: 'rw-a', domainCode: 'INI', sequence: 2 },
  ];
  assert.deepEqual(planCurriculumUnitMove(rows, 'math-a', 'down'), {
    status: 'boundary',
    assignments: [],
  });
  assert.deepEqual(planCurriculumUnitMove(rows, 'missing', 'up'), {
    status: 'not_found',
    assignments: [],
  });
});
