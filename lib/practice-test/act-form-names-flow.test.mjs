import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseHTML } from 'linkedom';
import ts from 'typescript';

const root = new URL('../../', import.meta.url);
const url = path => new URL(path, root).href;
const react = pathToFileURL(createRequire(import.meta.url).resolve('react')).href;
const dataUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const navigation = dataUrl(`import React from ${JSON.stringify(react)};
  export default function Link({children,...props}) { return React.createElement('a',props,children); }
  export const useRouter=()=>({push(){},refresh(){}});
  export const useConfirm=()=>[async()=>true,null];`);
const empty = dataUrl('export const PageHeader=()=>null;export const HelpButton=()=>null;export const ActScoreSummary=()=>null;export const ActBreakdownCards=()=>null;export const startActPracticeTest=async()=>({ok:true});export const abandonActPracticeTest=async()=>({ok:true});');
const imports = {
  react,
  'next/link': navigation, 'next/navigation': navigation,
  '@/lib/ui/ConfirmDialog': navigation,
  '@/lib/ui/PageHeader': empty,
  '@/app/(student)/help/HelpButton': empty,
  '@/app/(student)/practice/tests/actions': empty,
  '@/lib/practice/ActBreakdownCards': empty, './ActScoreSummary': empty,
  '@/lib/formatters': url('lib/formatters.js'),
  '@/lib/practice/act-taxonomy': url('lib/practice/act-taxonomy.ts'),
  '@/lib/practice/act-test-plan': url('lib/practice/act-test-plan.ts'),
  '@/lib/practice/act-form-names': url('lib/practice/act-form-names.ts'),
  './act-report.ts': url('lib/practice-test/act-report.ts'),
  './act-review-navigation': url('lib/practice-test/act-review-navigation.ts'),
  './act-attempt': dataUrl(`export const ACT_ATTEMPT_COLUMNS='id,source_test,status';export const attemptFormat=row=>row.format==='enhanced'?'enhanced':'classic';`),
};
function compile(source, extra = {}) {
  source = source.replace(/import (\w+) from '[^']+\.module\.css';/g, 'const $1=new Proxy({},{get:(_,key)=>key});');
  for (const [from, to] of Object.entries({ ...imports, ...extra })) source = source.replaceAll(`'${from}'`, JSON.stringify(to));
  return dataUrl(ts.transpileModule(`import React from ${JSON.stringify(react)};\n${source}`, {
    compilerOptions: { module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  }).outputText);
}
const hubUrl = compile(await readFile(new URL('lib/practice/ActTestsHub.tsx', root), 'utf8'));
const { ActTestsHub } = await import(hubUrl);
const { ActTestResults } = await import(compile(await readFile(new URL('lib/practice-test/ActTestResults.tsx', root), 'utf8')));
const { loadActTestResults } = await import(compile(await readFile(new URL('lib/practice-test/load-act-test-results.ts', root), 'utf8')));
const hubPage = await readFile(new URL('app/(student)/practice/tests/page.js', root), 'utf8');
const hubLoader = hubPage.slice(hubPage.indexOf('async function ActPracticeTestsPage('));
const { ActPracticeTestsPage } = await import(compile(`
  import {ActTestsHub} from ${JSON.stringify(hubUrl)};
  import {actFormNamer,compareActForms} from '@/lib/practice/act-form-names';
  import {assessActQuestions} from ${JSON.stringify(url('lib/practice/act-format-detection.ts'))};
  import {ACT_SECTIONS,sectionLabel} from '@/lib/practice/act-taxonomy';
  import {isActFormat,isActFormKind,isUntimedPlan,parsePlan,parseTimeMultiplier} from '@/lib/practice/act-test-plan';
  const StatsStrip=()=>null;
  const buildActStats=()=>[];
  const loadActFormQuestions=async db=>({data:db.questions});
  ${hubLoader}
  export {ActPracticeTestsPage};`));

const forms = [
  ['ACT-2024-April-FormG19', 'ACT April 2024 — Form G19', 'April 2024'],
  ['ACT-2024-June-FormG20', 'June 2024 ACT', 'June 2024'],
  ['ACT-2023-September-FormG01', null, 'September 2023'],
  ['ACT-2024-Sep', 'September 2024 ACT (Math only)', 'September 2024'],
  ['ACT-25MC5', 'Online Multiple Choice Test 4 (2025)', 'Online Multiple Choice Test 4 (2025)'],
  ['ACT-Online-Practice-Test-3', 'Online Practice Test 3', 'Online Practice Test 3'],
];
const attempt = source => ({
  id: 'attempt-1', user_id: 'student-1', source_test: source, status: 'completed',
  format: 'classic', time_multiplier: 1, sections: [], practice_session_id: null,
  started_at: '2026-11-19T10:00:00Z', finished_at: '2026-11-19T11:00:00Z',
  english_scaled: 25, math_scaled: 26, reading_scaled: 27, science_scaled: 26, composite_score: 26,
});
function database(source, saved) {
  return {
    questions: ['english','math','reading','science'].flatMap((section,i)=>Array.from({length:[75,60,40,40][i]},(_,n)=>({section,source_test:source,source_ordinal:n+1}))),
    from(table) {
      const filters = new Map();
      const query = {
        select() { return query; }, eq(key,value) { filters.set(key,value);return query; },
        order() { return query; }, limit() { return query; },
        maybeSingle() { return Promise.resolve({data: table==='act_forms'?{display_name:saved}:filters.get('status')==='in_progress'?null:attempt(source)}); },
        then(resolve,reject) { return Promise.resolve({data:table==='act_forms'?[{source_test:source,display_name:saved,format:'classic',kind:'released'}]:[attempt(source)]}).then(resolve,reject); },
      };
      return query;
    },
  };
}
const document = node => parseHTML(`<html><body>${renderToStaticMarkup(node)}</body></html>`).document;
async function preview(name,node) {
  if (!process.env.ACT_NAMES_PREVIEW_DIR) return;
  await mkdir(process.env.ACT_NAMES_PREVIEW_DIR,{recursive:true});
  const css = await Promise.all(['app/styles/next-tokens.css','app/(student)/practice/tests/PracticeTestsPage.module.css','lib/practice/TestLauncher.module.css','lib/practice/ActTestsHub.module.css','lib/practice-test/ActResults.module.css'].map(p=>readFile(new URL(p,root),'utf8')));
  await writeFile(`${process.env.ACT_NAMES_PREVIEW_DIR}/${name}.html`,`<!doctype html><meta charset="utf-8"><style>${css.join('\n')}body{font-family:Arial}</style>${renderToStaticMarkup(node)}`);
}

for (const [source,saved,expected] of forms) {
  test(`selection, history, and student/tutor results agree for ${source}`,async()=>{
    const db=database(source,saved);
    const selection=await ActPracticeTestsPage({user:{id:'student-1'},supabase:db,timeAccommodation:1});
    const selected=document(selection);
    assert.ok(selected.querySelector(`option[value="${source}"]`).textContent.includes(expected));
    assert.equal(selected.querySelector('tbody tr td:first-child').textContent.trim(),expected);
    const result=await loadActTestResults({supabase:db,attemptId:'attempt-1'});
    assert.equal(result.ok,true);assert.equal(result.attempt.formName,expected);
    assert.equal(result.attempt.sourceTest,source,'Internal identity remains unchanged');
    for(const backHref of ['/practice/tests?test=act','/tutor/students/student-1']) {
      const view=React.createElement(ActTestResults,{...result,reviewLinks:[],backHref});
      assert.equal(document(view).querySelector('h1').textContent,expected);
      await preview(`${source}-${backHref.startsWith('/tutor')?'tutor':'student'}-results`,view);
    }
    await preview(`${source}-selection`,selection);
  });
}

test('resume and history normalize dated names even when supplied older labels',()=>{
  const source='ACT-2024-April-FormG19',saved='ACT April 2024 — Form G19';
  const node=React.createElement(ActTestsHub,{forms:[],tabs:null,
    attempts:[{...attempt(source),name:saved}],
    resumeInfo:{attemptId:'resume',sourceTest:source,name:saved,sectionIndex:0,sectionCount:1,sectionLabel:'Math',sectionStatus:'pending',plan:[],timeMultiplier:1},
  });
  const d=document(node);assert.ok(d.querySelector('.resumeCard').textContent.includes('April 2024'));
  assert.equal(d.querySelector('tbody tr td:first-child').textContent.trim(),'April 2024');
  assert.ok(!d.body.textContent.includes(saved));
});
