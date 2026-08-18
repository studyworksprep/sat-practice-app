import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLessonCatalog,
  filterLessonCatalog,
  getLessonCatalogFacets,
  getLessonScopeLabels,
} from './catalog.ts';

const baseLesson = {
  id: 'lesson-1',
  title: 'Solving Rates',
  description: 'Interpret a coefficient as a rate.',
  kind: 'standard',
  status: 'published',
  visibility: 'shared',
  author_id: 'author-1',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-02-01T00:00:00Z',
  foundation_sequence: null,
};

test('enriches a pattern tag with its curriculum ancestors', () => {
  const [lesson] = buildLessonCatalog([baseLesson], [{
    lesson_id: baseLesson.id,
    section: null,
    domain_name: null,
    skill_code: null,
    pattern_id: 'pattern-1',
    question_patterns: {
      name: 'Interpret a rate term',
      domain_code: 'H',
      skill_code: 'H.C.',
    },
  }]);

  assert.deepEqual(lesson.sections, ['math']);
  assert.deepEqual(lesson.domains, ['Algebra']);
  assert.equal(lesson.topics[0].skillName, 'Linear equations in two variables');
  assert.deepEqual(getLessonScopeLabels(lesson), [
    'Math',
    'Algebra',
    'Linear equations in two variables',
    'Interpret a rate term',
  ]);
});

test('searches title, description, scope labels, and skill codes with all tokens required', () => {
  const catalog = buildLessonCatalog([baseLesson], [{
    lesson_id: baseLesson.id,
    section: null,
    domain_name: 'Algebra',
    skill_code: 'H.C.',
    pattern_id: null,
    question_patterns: null,
  }]);

  assert.equal(filterLessonCatalog(catalog, { q: 'linear two variables' }).length, 1);
  assert.equal(filterLessonCatalog(catalog, { q: 'H.C. rates' }).length, 1);
  assert.equal(filterLessonCatalog(catalog, { q: 'geometry rates' }).length, 0);
});

test('filters by section, kind, status, and categorization', () => {
  const uncategorized = {
    ...baseLesson,
    id: 'lesson-2',
    title: 'Foundation lesson',
    kind: 'foundation',
    status: 'draft',
    updated_at: '2026-03-01T00:00:00Z',
    foundation_sequence: 1,
  };
  const catalog = buildLessonCatalog([baseLesson, uncategorized], [{
    lesson_id: baseLesson.id,
    section: 'math',
    domain_name: null,
    skill_code: null,
    pattern_id: null,
    question_patterns: null,
  }]);

  assert.deepEqual(filterLessonCatalog(catalog, { section: 'math' }).map((l) => l.id), ['lesson-1']);
  assert.deepEqual(filterLessonCatalog(catalog, { kind: 'foundation' }).map((l) => l.id), ['lesson-2']);
  assert.deepEqual(filterLessonCatalog(catalog, { status: 'draft' }).map((l) => l.id), ['lesson-2']);
  assert.deepEqual(filterLessonCatalog(catalog, { categorization: 'uncategorized' }).map((l) => l.id), ['lesson-2']);
  assert.deepEqual(getLessonScopeLabels(catalog[1]), ['Uncategorized']);
});

test('builds stable section and domain facets', () => {
  const catalog = buildLessonCatalog([baseLesson], [{
    lesson_id: baseLesson.id,
    section: null,
    domain_name: 'Algebra',
    skill_code: 'H.C.',
    pattern_id: null,
    question_patterns: null,
  }]);
  assert.deepEqual(getLessonCatalogFacets(catalog), {
    sections: [{ value: 'math', label: 'Math' }],
    domains: ['Algebra'],
    kinds: ['standard'],
    statuses: ['published'],
  });
});
