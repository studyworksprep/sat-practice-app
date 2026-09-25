import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLessonCatalog,
  describeLessonTopic,
  describeLessonTopicRows,
  filterLessonCatalog,
  getLessonCatalogFacets,
  getLessonScopeChips,
  untaggedLessonTagOptions,
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

test('enriches a skill tag with its curriculum ancestors', () => {
  const [lesson] = buildLessonCatalog([baseLesson], [{
    lesson_id: baseLesson.id,
    section: null,
    domain_name: 'Algebra',
    skill_code: 'H.C.',
  }]);

  assert.deepEqual(lesson.sections, ['math']);
  assert.deepEqual(lesson.domains, ['Algebra']);
  assert.equal(lesson.topics[0].grain, 'skill');
  assert.equal(lesson.topics[0].skillName, 'Linear equations in two variables');
  assert.deepEqual(getLessonScopeChips(lesson).map(({ label, detail, title }) => ({ label, detail, title })), [
    { label: 'Linear equations in two variables', detail: 'H.C.', title: 'Linear equations in two variables · Algebra · H.C.' },
  ]);
});

test('searches title, description, scope labels, and skill codes with all tokens required', () => {
  const catalog = buildLessonCatalog([baseLesson], [{
    lesson_id: baseLesson.id,
    section: null,
    domain_name: 'Algebra',
    skill_code: 'H.C.',
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
  }]);

  assert.deepEqual(filterLessonCatalog(catalog, { section: 'math' }).map((l) => l.id), ['lesson-1']);
  assert.deepEqual(filterLessonCatalog(catalog, { kind: 'foundation' }).map((l) => l.id), ['lesson-2']);
  assert.deepEqual(filterLessonCatalog(catalog, { status: 'draft' }).map((l) => l.id), ['lesson-2']);
  assert.deepEqual(filterLessonCatalog(catalog, { categorization: 'uncategorized' }).map((l) => l.id), ['lesson-2']);
  assert.deepEqual(getLessonScopeChips(catalog[1]), []);
});

test('builds stable section and domain facets', () => {
  const catalog = buildLessonCatalog([baseLesson], [{
    lesson_id: baseLesson.id,
    section: null,
    domain_name: 'Algebra',
    skill_code: 'H.C.',
  }]);
  assert.deepEqual(getLessonCatalogFacets(catalog), {
    sections: [{ value: 'math', label: 'Math' }],
    domains: ['Algebra'],
    kinds: ['standard'],
    statuses: ['published'],
  });
});

// Production rows (2026-09-25): tags that were stored but read as
// missing, because list chips cut at four labels after the section and
// domain names, and the lesson page named a skill only by code + domain.
const row = (lesson_id, section, domain_name, skill_code) => ({ lesson_id, section, domain_name, skill_code });

test('one chip per tag: skills first in curriculum order, the section tag last', () => {
  const [lesson] = buildLessonCatalog([baseLesson], [
    row(baseLesson.id, 'math', null, null),
    row(baseLesson.id, null, 'Advanced Math', 'P.B.'),
    row(baseLesson.id, null, 'Algebra', 'H.A.'),
  ]);
  assert.deepEqual(getLessonScopeChips(lesson).map((c) => c.label), [
    'Linear equations in one variable',
    'Nonlinear equations in one variable and systems of equations in two variables',
    'Math section',
  ]);
});

test('no skill tag is crowded out of the first four chips by its section or domain', () => {
  const [lesson] = buildLessonCatalog([baseLesson], [
    row(baseLesson.id, null, 'Algebra', 'H.B.'),
    row(baseLesson.id, null, 'Problem-Solving and Data Analysis', 'Q.D.'),
    row(baseLesson.id, null, 'Advanced Math', 'P.C.'),
  ]);
  assert.deepEqual(getLessonScopeChips(lesson).slice(0, 4).map((c) => c.label), [
    'Linear functions',
    'Nonlinear functions',
    'Two-variable data: Models and scatterplots',
  ]);
});

test('describeLessonTopic names each grain the way a person would', () => {
  const pick = (chip) => chip && { label: chip.label, detail: chip.detail, title: chip.title };
  assert.deepEqual(pick(describeLessonTopic({ section: null, domain_name: 'Algebra', skill_code: 'H.A.' })), {
    label: 'Linear equations in one variable', detail: 'H.A.', title: 'Linear equations in one variable · Algebra · H.A.',
  });
  // A code outside the taxonomy keeps its code, with the domain as detail.
  assert.deepEqual(pick(describeLessonTopic({ section: null, domain_name: 'Algebra', skill_code: 'LEQ' })), {
    label: 'LEQ', detail: 'Algebra', title: 'LEQ · Algebra',
  });
  assert.deepEqual(pick(describeLessonTopic({ section: null, domain_name: 'Algebra', skill_code: null })), {
    label: 'Algebra', detail: null, title: 'Every skill in Algebra',
  });
  assert.deepEqual(pick(describeLessonTopic({ section: 'reading_writing', domain_name: null, skill_code: null })), {
    label: 'Reading & Writing section', detail: null, title: 'Applies to the whole Reading & Writing section',
  });
  assert.equal(describeLessonTopic({ section: null, domain_name: null, skill_code: null }), null);
});

test('describeLessonTopicRows keeps every stored row, ordered, with its id', () => {
  const chips = describeLessonTopicRows([
    { id: 't-section', section: 'math', domain_name: null, skill_code: null },
    { id: 't-empty', section: null, domain_name: null, skill_code: null },
    { id: 't-pb', section: null, domain_name: 'Advanced Math', skill_code: 'P.B.' },
    { id: 't-ha', section: null, domain_name: 'Algebra', skill_code: 'H.A.' },
  ]);
  assert.deepEqual(chips.map((c) => [c.id, c.label]), [
    ['t-ha', 'Linear equations in one variable'],
    ['t-pb', 'Nonlinear equations in one variable and systems of equations in two variables'],
    ['t-section', 'Math section'],
    ['t-empty', 'Unknown tag'],
  ]);
});

test('the Add tag menu leaves out what the lesson already has', () => {
  const menu = untaggedLessonTagOptions([
    { section: 'math', domain_name: null, skill_code: null },
    { section: null, domain_name: 'Algebra', skill_code: 'H.A.' },
    // A stored domain spelled differently still counts as that skill.
    { section: null, domain_name: 'advanced math', skill_code: 'P.B.' },
  ]);
  assert.deepEqual(menu.sections, [{ value: 'reading_writing', label: 'Reading & Writing' }]);
  const skills = menu.domains.flatMap((d) => d.skills.map((s) => s.code));
  assert.ok(!skills.includes('H.A.'));
  assert.ok(!skills.includes('P.B.'));
  assert.ok(skills.includes('H.B.'));
  assert.equal(menu.domains[0].name, 'Algebra');

  const empty = untaggedLessonTagOptions([]);
  assert.equal(empty.sections.length, 2);
  assert.equal(empty.domains.flatMap((d) => d.skills).length, 29);
});
