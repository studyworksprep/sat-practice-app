import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import ts from 'typescript';
import { test, expect, type Page } from '@playwright/test';

// Real controls and styles, with navigation/actions isolated from the database.
const { webpack } = createRequire(resolve('package.json'))('next/dist/compiled/webpack/webpack');
let directory: string;
let bundle: string;
test.beforeAll(async () => {
  directory = mkdtempSync(join(tmpdir(), 'act-options-'));
  const imports: Record<string, string> = {
    './act-taxonomy.ts': './taxonomy.mjs',
    './act-taxonomy': './taxonomy.mjs',
    '../practice/act-taxonomy.ts': './taxonomy.mjs',
    './SkillBreakdownCard': './breakdown-card.mjs',
    '@/lib/practice/act-taxonomy': './taxonomy.mjs',
    '@/lib/practice/act-test-plan': './plan.mjs',
    '@/lib/practice/act-assignment-taxonomy': './assignment-taxonomy.mjs',
    'next/navigation': './navigation.mjs',
    'next/link': './navigation.mjs',
    '@/lib/ui/ConfirmDialog': './navigation.mjs',
    '@/app/(student)/practice/tests/actions': './actions.mjs',
    './LessonPicker': './navigation.mjs',
  };
  const files = {
    taxonomy: 'lib/practice/act-taxonomy.ts', plan: 'lib/practice/act-test-plan.ts',
    'assignment-taxonomy': 'lib/practice/act-assignment-taxonomy.ts',
    hub: 'lib/practice/ActTestsHub.tsx',
    assignment: 'app/(tutor)/tutor/assignments/new/NewAssignmentInteractive.tsx',
    report: 'lib/practice-test/act-report.ts',
    breakdown: 'lib/practice/ActBreakdownCards.tsx',
    'breakdown-card': 'lib/practice/SkillBreakdownCard.jsx',
  };
  for (const [name, path] of Object.entries(files)) {
    let source = readFileSync(resolve(path), 'utf8')
      .replace(/import (\w+) from '[^']+\.module\.css';/, 'const $1 = new Proxy({}, { get: (_, key) => key });');
    for (const [specifier, target] of Object.entries(imports)) source = source.replaceAll(`'${specifier}'`, JSON.stringify(target));
    writeFileSync(join(directory, `${name}.mjs`), ts.transpileModule("import React from 'react';\n" + source, {
      compilerOptions: { module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
    }).outputText);
  }
  writeFileSync(join(directory, 'navigation.mjs'), `
    import React from 'react';
    export default function Link({href, children, ...props}) { return React.createElement('a', {...props, href}, children); }
    export const useRouter = () => ({push(){}, refresh(){}});
    export const useSearchParams = () => new URLSearchParams();
    export const useConfirm = () => [async () => true, null];
    export const LessonPicker = () => null;
  `);
  writeFileSync(join(directory, 'actions.mjs'), `
    export async function startActPracticeTest(_, fd) { window.lastActStart = {mode: fd.get('timing_mode'), sections: fd.getAll('sections')}; return {ok:true}; }
    export async function abandonActPracticeTest() { return {ok:true}; }
  `);
  writeFileSync(join(directory, 'entry.mjs'), `
    import React from 'react'; import {createRoot} from 'react-dom/client';
    import {ActTestsHub} from './hub.mjs';
    import {NewAssignmentInteractive} from './assignment.mjs';
    import {buildActAssignmentTaxonomy} from './assignment-taxonomy.mjs';
    import {buildSectionPlan} from './plan.mjs';
    import {buildActSectionRows} from './report.mjs';
    import {ActBreakdownCards} from './breakdown.mjs';
    const fixture = window.actFixture;
    const plan = buildSectionPlan({format:'classic',multiplier:1,untimed:true,questionsBySection:{math:['m']}});
    const rows = [
      ...['Algebra','Functions','Geometry','Number & Quantity','Statistics & Probability'].flatMap(subcategory => Array.from({length:2},()=>({section:'math',category:'Preparing for Higher Math',subcategory}))),
      {section:'math',category:'Integrating Essential Skills'},
      {section:'english',category:'Conventions of Standard English',subcategory:'Punctuation'},
      {section:'english',category:'Conventions of Standard English',subcategory:'Usage'},
      {section:'reading',category:'Craft and Structure'},
      {section:'science',category:'Interpretation of Data'},
    ];
    const questions = rows.map((row, index) => ({...row, id:String(index)}));
    const sectionRows = buildActSectionRows(questions.map(q=>q.id), questions,
      questions.map((q,index)=>({question_id:q.id,is_correct:index%2===0,created_at:null})), {}, null);
    createRoot(document.getElementById('fixture')).render(fixture.kind==='report'
      ? React.createElement(ActBreakdownCards,{domains:sectionRows.filter(row=>row.section==='math').map(row=>({code:row.section,name:row.label,...row.raw,categories:row.categories}))})
      : fixture.kind==='hub'
      ? React.createElement(ActTestsHub,{forms:[{sourceTest:'ACT-fixture',name:'ACT fixture',detail:null,format:'classic',kind:'released',total:60,sections:[{section:'math',count:60}]}],attempts:[],tabs:null,
          resumeInfo: fixture.resume ? {attemptId:'resume',sourceTest:'ACT-fixture',name:'ACT fixture',sectionIndex:0,sectionCount:1,sectionLabel:'Math',sectionStatus:'in_progress',plan,timeMultiplier:1} : null})
      : React.createElement(NewAssignmentInteractive,{students:[],domains:[],difficulties:[],practiceTests:[],lessonPacks:[],actTaxonomy:buildActAssignmentTaxonomy(rows),
          prefill:{label:'Saved template',testType:'act',skills:[],difficulties:[],size:10,unansweredOnly:false,actSelections:fixture.selections||[]},createAction:async()=>({ok:true})}));
  `);
  await new Promise<void>((done, reject) => {
    const compiler = webpack({ mode: 'production', entry: join(directory, 'entry.mjs'),
      resolve: { modules: [resolve('node_modules'), 'node_modules'] },
      output: { path: directory, filename: 'bundle.js' }, optimization: { minimize: false }, devtool: false });
    compiler.run((error: Error | null, stats: { hasErrors(): boolean; toString(): string }) => {
      compiler.close(() => {});
      if (error) reject(error); else if (stats.hasErrors()) reject(new Error(stats.toString())); else done();
    });
  });
  bundle = readFileSync(join(directory, 'bundle.js'), 'utf8');
});
test.afterAll(() => { if (directory) rmSync(directory, { recursive: true, force: true }); });

async function mount(page: Page, fixture: { kind: 'hub' | 'assignment' | 'report'; resume?: boolean; selections?: unknown[] }) {
  const css = ['app/styles/next-tokens.css', fixture.kind === 'report' ? 'lib/practice/SkillBreakdownCard.module.css' : fixture.kind === 'hub' ? 'lib/practice/ActTestsHub.module.css' : 'app/(tutor)/tutor/assignments/new/NewAssignmentInteractive.module.css']
    .map(path => readFileSync(resolve(path), 'utf8')).join('\n');
  await page.setContent(`<style>${css}*{box-sizing:border-box}body{margin:0;font:14px Arial}</style><div id="fixture"></div>`);
  await page.addScriptTag({ content: `window.actFixture=${JSON.stringify(fixture)};\n${bundle}` });
}

test('students can choose untimed sections while timed accommodations remain available', async ({ page }, testInfo) => {
  await mount(page, { kind: 'hub' });
  const timing = page.getByRole('combobox', { name: 'ACT test timing' });
  await timing.selectOption('2');
  await expect(page.getByText('Math · 60 questions · 2 h', { exact: true })).toBeVisible();
  await timing.selectOption('untimed');
  await expect(page.getByText('Math · 60 questions · Untimed', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  expect(await page.evaluate(() => (window as unknown as { lastActStart: unknown }).lastActStart)).toEqual({ mode: 'untimed', sections: ['math'] });
  await page.setViewportSize({ width: 375, height: 900 });
  await page.screenshot({ path: testInfo.outputPath('untimed-hub-mobile.png'), fullPage: true });
});

test('resuming preserves untimed mode when the launcher control is changed', async ({ page }) => {
  await mount(page, { kind: 'hub', resume: true });
  await page.getByRole('combobox', { name: 'ACT test timing' }).selectOption('2');
  await expect(page.getByText(/saved sections and timing \(Untimed\)/)).toBeVisible();
  await expect(page.getByText(/clock running/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  expect(await page.evaluate(() => (window as unknown as { lastActStart: unknown }).lastActStart)).toEqual({ mode: 'untimed', sections: ['math'] });
});

test('tutors can select child categories without double-counting parent selections', async ({ page }, testInfo) => {
  await mount(page, { kind: 'assignment' });
  await page.getByRole('checkbox', { name: /^Algebra/ }).check();
  await page.getByRole('checkbox', { name: /^Geometry/ }).check();
  await page.getByRole('checkbox', { name: /^Punctuation/ }).check();
  const selections = () => page.locator('input[name="act_selections"]').inputValue().then(JSON.parse);
  expect(await selections()).toEqual([
    { section: 'math', category: 'Preparing for Higher Math', subcategory: 'Algebra' },
    { section: 'math', category: 'Preparing for Higher Math', subcategory: 'Geometry' },
    { section: 'english', category: 'Conventions of Standard English', subcategory: 'Punctuation' },
  ]);
  await expect(page.getByText('5 questions in the pool before filters', { exact: true })).toBeVisible();
  await page.getByRole('checkbox', { name: /^Preparing for Higher Math/ }).check();
  await expect(page.getByRole('checkbox', { name: /^Algebra/ })).toBeDisabled();
  await expect(page.getByText('11 questions in the pool before filters', { exact: true })).toBeVisible();
  expect(await selections()).toEqual([
    { section: 'english', category: 'Conventions of Standard English', subcategory: 'Punctuation' },
    { section: 'math', category: 'Preparing for Higher Math' },
  ]);
  await page.locator('section').filter({ has: page.getByText('ACT question pool', { exact: true }) }).screenshot({ path: testInfo.outputPath('assignment-subcategories.png') });
});

test('saved subcategory templates rehydrate the exact selected children', async ({ page }) => {
  await mount(page, { kind: 'assignment', selections: [{ section: 'math', category: 'Preparing for Higher Math', subcategory: 'Functions' }] });
  await expect(page.getByRole('checkbox', { name: /^Functions/ })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: /^Geometry/ })).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: /^Preparing for Higher Math/ })).not.toBeChecked();
});

test('ACT reports nest five higher math subcategories beneath their parent at desktop and mobile widths', async ({ page }, testInfo) => {
  await mount(page, { kind: 'report' });
  const headings = page.locator('.domainList > li > .domainHead');
  await expect(headings).toHaveText([
    'Integrating Essential Skills1/1 · 100%',
    'Preparing for Higher Math5/10 · 50%',
  ]);
  const children = page.getByRole('list', { name: 'Preparing for Higher Math subcategories' });
  await expect(children.getByRole('listitem')).toHaveText([
    'Algebra1/2 · 50%', 'Functions1/2 · 50%', 'Geometry1/2 · 50%',
    'Number & Quantity1/2 · 50%', 'Statistics & Probability1/2 · 50%',
  ]);
  await expect(page.locator('.titlePctMath')).toHaveText('55%');
  for (const width of [640, 375]) {
    await page.setViewportSize({ width, height: 800 });
    const parentBox = await headings.last().boundingBox();
    const childBox = await children.boundingBox();
    expect(childBox!.x).toBeGreaterThan(parentBox!.x);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.screenshot({ path: testInfo.outputPath(`math-hierarchy-${width}.png`), fullPage: true });
  }
});
