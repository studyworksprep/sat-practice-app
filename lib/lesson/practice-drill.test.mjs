import assert from 'node:assert/strict';
import test from 'node:test';
import { rankLessonDrill, selectLessonPracticeQuestionIds } from './practice-drill.ts';

const candidates = [
  { id: 'hard', difficulty: 3, drill_phase: 'practice' },
  { id: 'easy', difficulty: 1, drill_phase: 'practice' },
  { id: 'medium', difficulty: 2, drill_phase: 'practice' },
  { id: 'review', difficulty: 2, drill_phase: 'later_review' },
];

test('first practice starts easy and reserves later review while there are enough fresh practice items', () => {
  assert.deepEqual(rankLessonDrill(candidates, [], 3), ['easy', 'medium', 'hard']);
  assert.deepEqual(rankLessonDrill(candidates, [], 2, 'later_review'), ['easy', 'review']);
});

test('a repeat prefers fresh items and presents the chosen items in difficulty order', () => {
  const attempts = [
    { question_id: 'easy', created_at: '2026-11-19T08:00:00Z' },
    { question_id: 'easy', created_at: '2026-11-20T08:00:00Z' },
    { question_id: 'hard', created_at: '2026-11-19T12:00:00Z' },
  ];
  assert.deepEqual(rankLessonDrill(candidates, attempts, 2), ['medium', 'review']);
  assert.deepEqual(rankLessonDrill(candidates, attempts, 3), ['medium', 'review', 'hard']);
  assert.deepEqual(rankLessonDrill(candidates, attempts, 8), ['easy', 'medium', 'review', 'hard']);
});

test('the selector requires the exact lesson, the drill pool, and published usable content', async () => {
  const calls = [];
  const supabase = {
    from(table) {
      calls.push(['from', table]);
      return {
        select() { return this; },
        eq(...args) { calls.push(['eq', ...args]); return this; },
        is(...args) { calls.push(['is', ...args]); return this; },
        order() { return this; },
        in(...args) { calls.push(['in', ...args]); return this; },
        then(resolve) { resolve({ data: table === 'questions_v2' ? candidates : [], error: null }); },
      };
    },
  };
  const ids = await selectLessonPracticeQuestionIds(supabase, 'student', 'lesson', 2, 'practice', new Set(['easy']));
  assert.deepEqual(ids, ['medium', 'hard']);
  assert.deepEqual(calls, [
    ['from', 'questions_v2'],
    ['eq', 'pool', 'lesson_drill'],
    ['eq', 'drill_lesson_id', 'lesson'],
    ['eq', 'is_published', true],
    ['eq', 'is_broken', false],
    ['is', 'deleted_at', null],
    ['from', 'attempts'],
    ['eq', 'user_id', 'student'],
    ['in', 'question_id', ['hard', 'medium', 'review']],
  ]);
});
