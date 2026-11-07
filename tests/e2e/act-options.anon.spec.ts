import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test, expect, type Page } from '@playwright/test';

// Real controls and styles, with navigation/actions isolated from the database.
const { webpack } = createRequire(resolve('package.json'))('next/dist/compiled/webpack/webpack');
let directory: string;
let bundle: string;
test.beforeAll(async () => {
  directory = mkdtempSync(join(tmpdir(), 'act-options-'));
  // Real source files are bundled through a tiny loader (TypeScript/JSX
  // transpile; CSS modules become a class-name proxy), so a component
  // gaining a new import doesn't break the harness. Only Next's
  // runtime and server actions are aliased to stubs.
  const root = resolve('.');
  writeFileSync(join(directory, 'loader.cjs'), `
    const ts = require(${JSON.stringify(createRequire(resolve('package.json')).resolve('typescript'))});
    module.exports = function (source) {
      const body = source
        .replace(/^import (\\w+) from '[^']+\\.module\\.css';$/gm, 'const $1 = new Proxy({}, { get: (_, key) => key });')
        .replace(/^import '[^']+\\.css';$/gm, '');
      return ts.transpileModule("import * as __React from 'react';\\n" + body, {
        fileName: this.resourcePath,
        compilerOptions: {
          module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022,
          jsx: ts.JsxEmit.React, jsxFactory: '__React.createElement', jsxFragmentFactory: '__React.Fragment',
        },
      }).outputText;
    };
  `);
  writeFileSync(join(directory, 'navigation.mjs'), `
    import React from 'react';
    export default function Link({href, children, ...props}) { return React.createElement('a', {...props, href}, children); }
    export const useRouter = () => ({push(){}, refresh(){}});
    export const useSearchParams = () => new URLSearchParams();
    export const usePathname = () => '/';
    export const useConfirm = () => [async () => true, null];
  `);
  writeFileSync(join(directory, 'actions.mjs'), `
    export async function startActPracticeTest(_, fd) { window.lastActStart = {mode: fd.get('timing_mode'), sections: fd.getAll('sections')}; return {ok:true}; }
    export async function abandonActPracticeTest() { return {ok:true}; }
  `);
  writeFileSync(join(directory, 'entry.mjs'), `
    import React from 'react'; import {createRoot} from 'react-dom/client';
    import {ActTestsHub} from '@/lib/practice/ActTestsHub';
    import {NewAssignmentInteractive} from '@/app/(tutor)/tutor/assignments/new/NewAssignmentInteractive';
    import {buildActAssignmentTaxonomy} from '@/lib/practice/act-assignment-taxonomy';
    import {buildSectionPlan} from '@/lib/practice/act-test-plan';
    import {buildActSectionRows} from '@/lib/practice-test/act-report';
    import {ActBreakdownCards} from '@/lib/practice/ActBreakdownCards';
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
      : React.createElement(NewAssignmentInteractive,{students:[],domains:[],practiceTests:[],lessonPacks:[],
          initialActCatalog:{taxonomy:buildActAssignmentTaxonomy(rows),difficulties:[],forms:[]},loadActCatalogAction:async()=>({ok:false,error:'Not used by this preloaded fixture'}),
          prefill:{label:'Saved template',testType:'act',skills:[],difficulties:[],size:10,unansweredOnly:false,actSelections:fixture.selections||[]},createAction:async()=>({ok:true})}));
  `);
  await new Promise<void>((done, reject) => {
    const stub = (file: string) => join(directory, file);
    const compiler = webpack({ mode: 'production', entry: join(directory, 'entry.mjs'),
      resolve: {
        modules: [resolve('node_modules'), 'node_modules'],
        extensions: ['.tsx', '.ts', '.jsx', '.js', '.mjs'],
        alias: {
          'next/navigation$': stub('navigation.mjs'),
          'next/link$': stub('navigation.mjs'),
          '@/lib/ui/ConfirmDialog$': stub('navigation.mjs'),
          '@/app/(student)/practice/tests/actions$': stub('actions.mjs'),
          '@': root,
        },
      },
      module: { rules: [{ test: /\.(tsx?|jsx?)$/, include: root, exclude: /node_modules/, use: join(directory, 'loader.cjs') }] },
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
  const sheets = {
    report: ['lib/practice/SkillBreakdownCard.module.css'],
    hub: ['app/(student)/practice/tests/PracticeTestsPage.module.css', 'lib/practice/TestLauncher.module.css', 'lib/practice/ActTestsHub.module.css'],
    assignment: ['app/(tutor)/tutor/assignments/new/NewAssignmentInteractive.module.css'],
  }[fixture.kind];
  const css = ['app/styles/next-tokens.css', ...sheets]
    .map(path => readFileSync(resolve(path), 'utf8')).join('\n');
  await page.setContent(`<style>${css}*{box-sizing:border-box}body{margin:0;font:14px Arial}</style><div id="fixture"></div>`);
  await page.addScriptTag({ content: `window.actFixture=${JSON.stringify(fixture)};\n${bundle}` });
}

test('students can choose untimed sections while timed accommodations remain available', async ({ page }, testInfo) => {
  await mount(page, { kind: 'hub' });
  const timing = page.getByRole('combobox', { name: 'Timing' });
  const plan = page.getByText(/60 questions · /);
  await timing.selectOption('2');
  await expect(plan).not.toContainText('Untimed');
  await timing.selectOption('untimed');
  await expect(plan).toContainText('60 questions · Untimed');
  await page.getByRole('button', { name: 'Start test →', exact: true }).click();
  expect(await page.evaluate(() => (window as unknown as { lastActStart: unknown }).lastActStart)).toEqual({ mode: 'untimed', sections: ['math'] });
  await page.setViewportSize({ width: 375, height: 900 });
  await page.screenshot({ path: testInfo.outputPath('untimed-hub-mobile.png'), fullPage: true });
});

test('resuming keeps the saved sections and timing', async ({ page }) => {
  await mount(page, { kind: 'hub', resume: true });
  // The launcher locks to the saved attempt rather than starting a new one.
  await expect(page.getByRole('combobox', { name: 'Timing' })).toBeDisabled();
  await expect(page.getByText('Continue keeps its saved sections and timing.', { exact: false })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Continue test →', exact: true }).first())
    .toHaveAttribute('href', '/practice/test/act/attempt/resume');
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
  await expect(page.getByText('3 selections · 5 questions', { exact: true })).toBeVisible();
  await page.getByRole('checkbox', { name: /^Preparing for Higher Math/ }).check();
  await expect(page.getByRole('checkbox', { name: /^Algebra/ })).toBeDisabled();
  await expect(page.getByText('2 selections · 11 questions', { exact: true })).toBeVisible();
  expect(await selections()).toEqual([
    { section: 'english', category: 'Conventions of Standard English', subcategory: 'Punctuation' },
    { section: 'math', category: 'Preparing for Higher Math' },
  ]);
  await page.getByRole('group', { name: 'ACT question pool', exact: true }).screenshot({ path: testInfo.outputPath('assignment-subcategories.png') });
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
