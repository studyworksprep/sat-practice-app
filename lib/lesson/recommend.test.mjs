// Unit tests for the §3.3 skill→lesson recommendation grouping.
// The DB fetch is a thin wrapper; the grouping/ordering rules live
// in buildRecommendationMap, which is what the surfaces depend on.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRecommendationMap } from './recommend.ts';

test('groups rows by skill and orders lessons by title then id', () => {
  const map = buildRecommendationMap([
    { skill_code: 'CID', lesson_id: 'b-id', title: 'Zeta lesson' },
    { skill_code: 'CID', lesson_id: 'a-id', title: 'Alpha lesson' },
    { skill_code: 'H.A', lesson_id: 'c-id', title: 'Linear equations' },
  ]);
  assert.deepEqual(
    map.get('CID')?.map((l) => l.lessonId),
    ['a-id', 'b-id'],
  );
  assert.deepEqual(map.get('H.A'), [{ lessonId: 'c-id', title: 'Linear equations' }]);
});

test('equal titles fall back to lesson id for a stable order', () => {
  const map = buildRecommendationMap([
    { skill_code: 'CID', lesson_id: 'b-id', title: 'Same title' },
    { skill_code: 'CID', lesson_id: 'a-id', title: 'Same title' },
  ]);
  assert.deepEqual(
    map.get('CID')?.map((l) => l.lessonId),
    ['a-id', 'b-id'],
  );
});

test('dedupes a lesson tagged twice for the same skill', () => {
  const map = buildRecommendationMap([
    { skill_code: 'CID', lesson_id: 'a-id', title: 'Alpha lesson' },
    { skill_code: 'CID', lesson_id: 'a-id', title: 'Alpha lesson' },
  ]);
  assert.equal(map.get('CID')?.length, 1);
});

test('ignores domain-level tags (null skill_code) and empty lesson ids', () => {
  const map = buildRecommendationMap([
    { skill_code: null, lesson_id: 'a-id', title: 'Domain-level tag' },
    { skill_code: 'CID', lesson_id: '', title: 'Broken embed' },
  ]);
  assert.equal(map.size, 0);
});
