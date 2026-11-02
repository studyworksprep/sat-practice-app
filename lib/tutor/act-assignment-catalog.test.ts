import test from 'node:test';
import assert from 'node:assert/strict';
import type { TypedSupabaseClient } from '../supabase/server.ts';
import { loadActAssignmentCatalog, shapeActAssignmentCatalog } from './act-assignment-catalog.ts';
import { ACT_SECTIONS } from '../practice/act-taxonomy.ts';
import { ACT_FORMAT_SPECS, ACT_FORMAT_LABELS, isActFormat } from '../practice/act-test-plan.ts';
import { assessActQuestions } from '../practice/act-format-detection.ts';
import { actFormNamer } from '../practice/act-form-names.ts';
import { buildActAssignmentTaxonomy } from '../practice/act-assignment-taxonomy.ts';

type Question = Parameters<typeof shapeActAssignmentCatalog>[0][number];
type Form = Parameters<typeof shapeActAssignmentCatalog>[1][number];
function formQuestions(source: string, format: 'classic' | 'enhanced', science = true): Question[] {
  return ACT_SECTIONS.flatMap(section => Array.from({ length:
    section === 'science' && !science ? 0 : ACT_FORMAT_SPECS[format].sections[section].questions,
  }, (_, index) => ({ section, source_test: source, source_ordinal: index + 1,
    difficulty: index % 5 + 1, category: ` ${section} category `,
    subcategory: index % 2 ? ' Child ' : null })));
}

// The pre-upgrade page algorithm, frozen to compare labels, eligibility,
// counts and section order independently of the new grouped implementation.
function previousCatalog(rows: Question[], forms: Form[]) {
  const formats = new Map(forms.filter(f => isActFormat(f.format)).map(f => [f.source_test, f.format]));
  const name = actFormNamer(forms);
  const counts = new Map<string, number>();
  const difficulties = new Set<number>();
  for (const r of rows) {
    if (!r.section) continue;
    if (Number.isInteger(r.difficulty)) difficulties.add(r.difficulty!);
    if (r.source_test) counts.set(r.source_test, (counts.get(r.source_test) ?? 0) + 1);
  }
  return {
    taxonomy: buildActAssignmentTaxonomy(rows),
    difficulties: [...difficulties].sort((a,b) => a-b),
    forms: [...counts].filter(([source]) => !assessActQuestions(rows.filter(q => q.source_test === source), {format:formats.get(source)}).reviewReason)
      .sort(([a],[b]) => a.localeCompare(b)).map(([sourceTest,count]) => {
        const assessment = assessActQuestions(rows.filter(q => q.source_test === sourceTest), {format:formats.get(sourceTest)});
        return { sourceTest, sections: [...new Set(rows.filter(q => q.source_test === sourceTest).map(q => q.section))],
          label: `${name(sourceTest)} · ${ACT_FORMAT_LABELS[assessment.format!]} · ${count} question${count===1?'':'s'}` };
      }),
  };
}

test('catalog preserves taxonomy and form eligibility across classic/enhanced and invalid imports', () => {
  const classic = formQuestions('Z-classic','classic');
  const enhanced = formQuestions('A-enhanced','enhanced',false);
  const duplicate = formQuestions('duplicate','classic');duplicate[1].source_ordinal=1;
  const missing = formQuestions('missing','classic');missing[0].source_ordinal=null;
  const conflict = formQuestions('conflict','enhanced');
  const rows=[...classic,...enhanced,...duplicate,...missing,...conflict,
    ...formQuestions('incomplete','classic').slice(0,7),
    {...classic[0], source_test:null, category:'',subcategory:'',difficulty:null}];
  const forms: Form[]=[{source_test:'A-enhanced',format:'enhanced',display_name:'Custom ACT'},
    {source_test:'conflict',format:'classic',display_name:null}];
  const actual=shapeActAssignmentCatalog(rows,forms);
  assert.deepEqual(actual,previousCatalog(rows,forms));
  assert.deepEqual(actual.forms.map(f=>f.sourceTest),['A-enhanced','Z-classic']);
  assert.match(actual.forms[0].label,/^Custom ACT/);
  assert.deepEqual(actual.forms[0].sections,['english','math','reading']);
  assert.deepEqual(actual.difficulties,[1,2,3,4,5]);
});

test('empty catalogs remain empty and preserve available taxonomy from incomplete forms', () => {
  assert.deepEqual(shapeActAssignmentCatalog([],[]),{taxonomy:[],difficulties:[],forms:[]});
  const catalog=shapeActAssignmentCatalog(formQuestions('partial','classic').slice(0,4),[]);
  assert.equal(catalog.taxonomy[0].categories[0].count,4);
  assert.deepEqual(catalog.forms,[]);
});

function clientFixture(pages: {data:Question[] | null;error:Error | null}[], formError:Error | null=null) {
  const ranges:number[][]=[];
  const builder={
    select(columns:string){assert.equal(columns,'section, category, subcategory, difficulty, source_test, source_ordinal');return builder;},
    eq(column:string,value:unknown){assert.deepEqual([column,value],['is_broken',false]);return builder;},
    is(column:string,value:unknown){assert.deepEqual([column,value],['deleted_at',null]);return builder;},
    order(column:string){assert.equal(column,'id');return builder;},
    range(from:number,to:number){ranges.push([from,to]);assert.ok(pages.length);return Promise.resolve(pages.shift()!);},
  };
  const client={from(table:string){
    if(table==='act_questions')return builder;
    assert.equal(table,'act_forms');
    return {select(columns:string){assert.equal(columns,'source_test, format, display_name');return Promise.resolve({data:[],error:formError});}};
  }};
  return {client:client as unknown as Pick<TypedSupabaseClient,'from'>,ranges};
}

test('loader fetches every visible question beyond the API cap before assessing forms', async () => {
  const rows=Array.from({length:7},(_,i)=>formQuestions('form'+i,'classic')).flat();
  const fixture=clientFixture([{data:rows.slice(0,1000),error:null},{data:rows.slice(1000),error:null}]);
  assert.deepEqual(await loadActAssignmentCatalog(fixture.client),shapeActAssignmentCatalog(rows,[]));
  assert.deepEqual(fixture.ranges,[[0,999],[1000,1999]]);
});

test('loader rejects partial question history and form errors so the UI can retry', async () => {
  const error=new Error('catalog unavailable');
  const fixture=clientFixture([{data:Array.from({length:1000},()=>formQuestions('one','classic')[0]),error:null},{data:null,error}]);
  await assert.rejects(loadActAssignmentCatalog(fixture.client),error);
  const forms=clientFixture([{data:[],error:null}],error);
  await assert.rejects(loadActAssignmentCatalog(forms.client),error);
});
