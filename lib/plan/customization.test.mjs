import { test } from 'node:test';
import assert from 'node:assert/strict';
import { editorConfig, filterCustomizedTasks, planStartDate, stampGeneratedTasks, taskUnitKey } from './customization.ts';

const task = (over = {}) => ({ weekIndex: 0, scheduledDate: '2026-11-16', taskType: 'drill', source: 'generated', payload: { skill_code: 'H.A.' }, ...over });
const config = (editor) => ({ editor });

test('removing one of two matching drills suppresses only that occurrence', () => {
  const tasks = stampGeneratedTasks([task(), task()]);
  assert.notEqual(tasks[0].payload.generation_key, tasks[1].payload.generation_key);
  const kept = filterCustomizedTasks(tasks, config({ excluded_tasks: [tasks[0].payload.generation_key] }));
  assert.deepEqual(kept, [tasks[1]]);
});
test('unit removal suppresses unit tasks and removes the skill from mixed review', () => {
  const tasks = stampGeneratedTasks([task(), task({ taskType: 'practice_set', payload: { filter_criteria: { skill_codes: ['H.A.', 'H.B.'] } } })]);
  const kept = filterCustomizedTasks(tasks, config({ excluded_skills: ['H.A.'] }));
  assert.equal(kept.length, 1);
  assert.deepEqual(kept[0].payload.filter_criteria.skill_codes, ['H.B.']);
});
test('moving a task preserves its original identity, preventing a replacement at the old position', () => {
  const original = stampGeneratedTasks([task()])[0];
  const moved = { ...original, weekIndex: 2, scheduledDate: '2026-11-30', source: 'tutor', status: 'pending' };
  assert.deepEqual(filterCustomizedTasks([original], {}, [moved]), []);
});
test('human-authored units keep their entire syllabus through regeneration', () => {
  const own = { ...task(), source: 'tutor', status: 'pending', payload: { skill_code: 'H.A.', editor_unit: true, plan_unit_key: 'unit:custom' } };
  assert.deepEqual(filterCustomizedTasks([task()], {}, [own]), []);
  assert.equal(taskUnitKey('drill', own.payload), 'unit:custom');
});
test('manual plans stay manual even when a rebuild is requested', () => {
  assert.deepEqual(filterCustomizedTasks([task()], config({ manual: true })), []);
});
test('completed lessons are not reintroduced, but their practice is retained', () => {
  const lesson = task({ taskType: 'lesson', payload: { skill_code: 'H.A.', lesson_id: 'lesson-1' } });
  const practice = task({ payload: { skill_code: 'H.A.', lesson_id: 'lesson-1' } });
  assert.deepEqual(filterCustomizedTasks([lesson, practice], {}, [{ ...lesson, status: 'completed' }]), [practice]);
});
test('moving or removing the earliest task does not change the stored plan grid', () => {
  assert.equal(planStartDate({ plan_start: '2026-11-16' }, '2026-11-17', ['2026-11-30']), '2026-11-16');
  assert.equal(planStartDate({}, '2026-11-17', []), '2026-11-17');
});
test('malformed optional metadata degrades safely', () => {
  assert.deepEqual(editorConfig({ editor: { excluded_skills: [null, 'H.A.', 2] } }), { manual: false, excludedSkills: ['H.A.'], excludedTasks: [] });
});
test('a moved unit is excluded from mixed review before its new introduction date', () => {
  const own = { ...task(), scheduledDate: '2026-11-30', source: 'tutor', status: 'pending', payload: { skill_code: 'H.A.', editor_unit: true, plan_unit_key: 'skill:H.A.:learn' } };
  const mixed = task({ taskType: 'practice_set', payload: { filter_criteria: { skill_codes: ['H.A.', 'H.B.'] } } });
  assert.deepEqual(filterCustomizedTasks([mixed], {}, [own])[0].payload.filter_criteria.skill_codes, ['H.B.']);
});

test('a removed lesson remains excluded when changed pacing moves it to another week', () => {
  const original = stampGeneratedTasks([task({ taskType: 'lesson', payload: { skill_code: 'H.A.', lesson_id: 'one' } })])[0];
  const later = stampGeneratedTasks([{ ...original, weekIndex: 4, scheduledDate: '2026-12-14' }])[0];
  assert.equal(original.payload.generation_key, later.payload.generation_key);
  assert.deepEqual(filterCustomizedTasks([later], config({ excluded_tasks: [original.payload.generation_key] })), []);
});

test('moving one practice block does not remove the skill\'s other review weeks', () => {
  const moved = { ...task(), source: 'tutor', status: 'pending', payload: { skill_code: 'H.A.', editor_unit: true, plan_unit_key: 'skill:H.A.:practice:2' } };
  const other = task({ weekIndex: 4, scheduledDate: '2026-12-14', payload: { skill_code: 'H.A.', plan_unit_key: 'skill:H.A.:practice:4' } });
  assert.deepEqual(filterCustomizedTasks([other], {}, [moved]), [other]);
});
test('a manually authored learning unit retains later automatic reinforcement', () => {
  const own = { ...task(), source: 'tutor', status: 'pending', payload: { skill_code: 'H.A.', editor_unit: true, plan_unit_key: 'unit:custom' } };
  const later = task({ weekIndex: 4, scheduledDate: '2026-12-14', payload: { skill_code: 'H.A.', plan_unit_key: 'skill:H.A.:practice:4' } });
  assert.deepEqual(filterCustomizedTasks([later], {}, [own]), [later]);
});

test('an added individual task replaces one equivalent suggestion, while later practice remains', () => {
  const own = { ...task(), source: 'tutor', status: 'pending', payload: { skill_code: 'H.A.', standalone: true } };
  const suggestions = [task(), task({ weekIndex: 1, scheduledDate: '2026-11-23' })];
  assert.deepEqual(filterCustomizedTasks(suggestions, {}, [own]), [suggestions[1]]);
});
