import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseHTML } from 'linkedom';
import ts from 'typescript';

// Exercise the real loader while isolating unrelated annotation services.
const loaderSource = (await readFile(new URL('./build-act-session-review.js', import.meta.url), 'utf8'))
  .replace("'@/lib/content/watermark'", JSON.stringify(new URL('../content/watermark.js', import.meta.url).href))
  .replace("'@/lib/practice/correct-answer'", JSON.stringify(new URL('./correct-answer.js', import.meta.url).href))
  .replace("'@/lib/practice/act-taxonomy'", JSON.stringify(new URL('./act-taxonomy.ts', import.meta.url).href))
  .replace("'@/lib/practice-test/act-report'", JSON.stringify(new URL('../practice-test/act-report.ts', import.meta.url).href))
  .replace("'@/lib/practice/act-test-plan'", JSON.stringify(new URL('./act-test-plan.ts', import.meta.url).href))
  .replace("'@/lib/practice/act-form-names'", JSON.stringify(new URL('./act-form-names.ts', import.meta.url).href))
  .replace(/import \{ loadQuestionNotesByQuestion \} from '[^']+';/,
    'const loadQuestionNotesByQuestion = async () => ({ canView: false });')
  .replace(/import \{ loadStudentNotesByQuestion \} from '[^']+';/,
    'const loadStudentNotesByQuestion = async () => new Map();');
const { buildActSessionReview } = await import(`data:text/javascript;base64,${Buffer.from(loaderSource).toString('base64')}`);

const reactUrl = pathToFileURL(createRequire(import.meta.url).resolve('react')).href;
const cardSource = (await readFile(new URL('./SkillBreakdownCard.jsx', import.meta.url), 'utf8'))
  .replace(/import s from '[^']+\.module\.css';/, 'const s = new Proxy({}, { get: (_, key) => key });');
const cardCompiled = ts.transpileModule(cardSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React },
}).outputText;
const cardUrl = `data:text/javascript;base64,${Buffer.from(`import React from ${JSON.stringify(reactUrl)};\n${cardCompiled}`).toString('base64')}`;
const breakdownSource = (await readFile(new URL('./ActBreakdownCards.tsx', import.meta.url), 'utf8'))
  .replace("'./act-taxonomy'", JSON.stringify(new URL('./act-taxonomy.ts', import.meta.url).href))
  .replace("'./SkillBreakdownCard'", JSON.stringify(cardUrl));
const breakdownCompiled = ts.transpileModule(breakdownSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React },
}).outputText;
const { ActBreakdownCards } = await import(`data:text/javascript;base64,${Buffer.from(`import React from ${JSON.stringify(reactUrl)};\n${breakdownCompiled}`).toString('base64')}`);

const categories = [
  ['NQ', 'Number & Quantity'],
  ['ALG', 'Algebra'],
  ['FUN', 'Functions'],
  ['GEO', 'Geometry'],
  ['SP', 'Statistics & Probability'],
];

function mathQuestion(id, subcategoryCode, subcategory) {
  return {
    id, section: 'math', category: 'Preparing for Higher Math', category_code: 'PHM',
    subcategory_code: subcategoryCode, subcategory, question_type: 'mcq',
  };
}

function fakeClient(questions, attempts) {
  return {
    from(table) {
      const rows = { act_questions: questions, act_attempts: attempts }[table] ?? [];
      const query = {
        select() { return query; },
        eq() { return query; },
        in() { return query; },
        gte() { return query; },
        order() { return query; },
        then(resolve, reject) { return Promise.resolve({ data: rows }).then(resolve, reject); },
      };
      return query;
    },
  };
}

function review(questions, attempts) {
  return buildActSessionReview({
    supabase: fakeClient(questions, attempts),
    user: { id: 'student-1' },
    session: {
      id: 'session-1', question_ids: questions.map((q) => q.id),
      created_at: '2026-10-27T12:00:00Z', mode: 'test', filter_criteria: {},
    },
  });
}

test('ACT math reports six distinct categories, including unanswered questions in totals', async () => {
  const questions = [
    ...categories.map(([code, name]) => mathQuestion(code, code, name)),
    mathQuestion('ALG-wrong', 'ALG', 'Algebra'),
    mathQuestion('ALG-skipped', 'ALG', 'Algebra'),
    { id: 'IES', section: 'math', category_code: 'IES', category: 'Integrating Essential Skills' },
    {
      id: 'english', section: 'english', category_code: 'CSE', category: 'Conventions of Standard English',
      subcategory_code: 'PUN', subcategory: 'Punctuation',
    },
  ];
  const attempts = questions.filter((q) => q.id !== 'ALG-skipped').map((q) => ({
    question_id: q.id, is_correct: !['ALG-wrong', 'IES'].includes(q.id), time_spent_ms: 1000,
  }));
  // A later retry must not improve the original test result.
  attempts.push({ question_id: 'ALG-wrong', is_correct: true });

  const report = await review(questions, attempts);
  const math = report.metrics.byDomain.find((d) => d.code === 'math');
  assert.equal(math.total, 8);
  assert.equal(math.correct, 5);
  assert.deepEqual(math.skills, [
    { name: 'Algebra', correct: 1, total: 3 },
    { name: 'Functions', correct: 1, total: 1 },
    { name: 'Geometry', correct: 1, total: 1 },
    { name: 'Integrating Essential Skills', correct: 0, total: 1 },
    { name: 'Number & Quantity', correct: 1, total: 1 },
    { name: 'Statistics & Probability', correct: 1, total: 1 },
  ]);
  assert.equal(math.skills.reduce((sum, sk) => sum + sk.total, 0), math.total);
  assert.equal(report.items.find((it) => it.questionId === 'ALG').taxonomy.skill_code, 'ALG');
  assert.equal(report.timing.entries.find((it) => it.questionId === 'ALG').skillName, 'Algebra');
  assert.deepEqual(report.metrics.byDomain.find((d) => d.code === 'english').skills, [
    { name: 'Conventions of Standard English', correct: 1, total: 1 },
  ]);

  const html = renderToStaticMarkup(React.createElement(ActBreakdownCards, {
    domains: [math],
  }));
  const { document } = parseHTML(html);
  const rows = [...document.querySelectorAll('.domainList > li .domainHead')];
  assert.deepEqual(rows.map((row) => row.textContent), [
    'Algebra1/3 · 33%',
    'Functions1/1 · 100%',
    'Geometry1/1 · 100%',
    'Integrating Essential Skills0/1 · 0%',
    'Number & Quantity1/1 · 100%',
    'Statistics & Probability1/1 · 100%',
  ]);
});

test('legacy math questions without subcategories retain their original category', async () => {
  const report = await review([
    mathQuestion('unclassified', null, null),
    { id: 'legacy', section: 'math', category_code: 'A', category: 'Algebra' },
  ], []);
  assert.deepEqual(report.metrics.byDomain[0].skills, [
    { name: 'Algebra', correct: 0, total: 1 },
    { name: 'Preparing for Higher Math', correct: 0, total: 1 },
  ]);
});
