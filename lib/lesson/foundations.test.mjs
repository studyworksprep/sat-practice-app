// Foundation lessons + the tutor "covered in session" record
// (docs/foundations-and-question-patterns.md §3.2, §4 step 5). Run with
// `node --test lib/lesson/foundations.test.mjs`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFoundationRows,
  foundationStatus,
  foundationSyllabusTitle,
  foundationsFromSteps,
  summarizeFoundations,
} from './foundations.ts';

const pub = (title) => ({ title, status: 'published' });

test('foundationsFromSteps keeps published section lesson steps, Math first, each lesson once', () => {
  const rows = [
    { position: 2, section: 'reading_writing', lesson_id: 'rw-2', lesson: pub('Passage strategy') },
    { position: 1, section: 'reading_writing', lesson_id: 'rw-1', lesson: [pub('Read, predict, match')] },
    { position: 3, section: 'math', lesson_id: 'm-draft', lesson: { title: 'Draft', status: 'draft' } },
    { position: 2, section: 'math', lesson_id: 'm-2', lesson: pub('Regression') },
    { position: 1, section: 'math', lesson_id: 'm-1', lesson: pub('Graphing') },
    { position: 4, section: 'math', lesson_id: 'm-1', lesson: pub('Graphing') }, // taught twice: once
    { position: 5, section: 'math', lesson_id: 'm-hidden', lesson: null }, // RLS hid it
    { position: 6, section: 'math', lesson_id: null, lesson: null },
    { position: 1, section: null, lesson_id: 'unit-lesson', lesson: pub('A unit lesson') },
  ];
  assert.deepEqual(
    foundationsFromSteps(rows).map((f) => `${f.section}:${f.position}:${f.lessonId}`),
    ['math:1:m-1', 'math:2:m-2', 'reading_writing:1:rw-1', 'reading_writing:2:rw-2'],
  );
  assert.equal(foundationsFromSteps([]).length, 0);
});

test('foundationStatus reads the row the way the generator skip rule does', () => {
  assert.equal(foundationStatus(null), 'not_started');
  assert.equal(foundationStatus({ lesson_id: 'm-1', completed_at: null }), 'in_progress');
  assert.equal(foundationStatus({ lesson_id: 'm-1', completed_at: '2026-09-01T00:00:00Z' }), 'completed');
  assert.equal(
    foundationStatus({ lesson_id: 'm-1', completed_at: '2026-09-01T00:00:00Z', covered_by: 'tutor', covered_at: '2026-09-01T00:00:00Z' }),
    'covered',
  );
});

test('summarizeFoundations counts app completions and session marks alike, nothing else', () => {
  const foundations = [
    { lessonId: 'm-1', title: 'Graphing', section: 'math', position: 1 },
    { lessonId: 'm-2', title: 'Regression', section: 'math', position: 2 },
    { lessonId: 'rw-1', title: 'Passage strategy', section: 'reading_writing', position: 1 },
  ];
  const rows = [
    { lesson_id: 'm-1', completed_at: '2026-09-01T00:00:00Z' },
    { lesson_id: 'm-2', completed_at: '2026-09-02T00:00:00Z', covered_by: 'tutor', covered_at: '2026-09-02T00:00:00Z' },
    { lesson_id: 'rw-1', completed_at: null },
    { lesson_id: 'other', completed_at: '2026-09-03T00:00:00Z' },
  ];
  assert.deepEqual(summarizeFoundations(foundations, rows), { covered: 2, total: 3 });
  assert.deepEqual(summarizeFoundations(foundations, []), { covered: 0, total: 3 });
  assert.deepEqual(summarizeFoundations([], rows), { covered: 0, total: 0 });
});

test('buildFoundationRows pairs every foundation with its standing, in syllabus order', () => {
  const foundations = [
    { lessonId: 'm-1', title: 'Graphing', section: 'math', position: 1 },
    { lessonId: 'rw-1', title: 'Passage strategy', section: 'reading_writing', position: 1 },
  ];
  const rows = buildFoundationRows(foundations, [
    { lesson_id: 'm-1', completed_at: '2026-09-02T00:00:00Z', covered_by: 'tutor', covered_at: '2026-09-02T00:00:00Z' },
  ]);
  assert.deepEqual(rows, [
    {
      lessonId: 'm-1', title: 'Graphing', section: 'math', position: 1,
      status: 'covered', completedAt: '2026-09-02T00:00:00Z', coveredBy: 'tutor', coveredAt: '2026-09-02T00:00:00Z',
    },
    {
      lessonId: 'rw-1', title: 'Passage strategy', section: 'reading_writing', position: 1,
      status: 'not_started', completedAt: null, coveredBy: null, coveredAt: null,
    },
  ]);
});

test('foundationSyllabusTitle names the syllabus the way the curriculum home does', () => {
  assert.equal(foundationSyllabusTitle('math'), 'Before Math');
  assert.equal(foundationSyllabusTitle('reading_writing'), 'Before Reading & Writing');
});
