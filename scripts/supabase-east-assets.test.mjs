import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceHash } from '../lib/content/render-math.mjs';
import { OLD_STORAGE,NEW_STORAGE,validObjectPath,replaceStorage,transformedQuestion,cacheSeconds } from './supabase-east-assets.mjs';

test('Storage paths reject traversal and route escapes',()=>{
  assert.doesNotThrow(()=>validObjectPath('question-figures','nested/example.svg'));
  for(const path of ['../auth','x/../auth','%2e%2e/auth','/absolute','x/%2fescape','x\\escape','x//empty']) assert.throws(()=>validObjectPath('images',path));
  assert.throws(()=>validObjectPath('../auth','image.svg'));
});

test('Storage metadata Cache-Control is normalized to the SDK seconds value',()=>{
  assert.equal(cacheSeconds('max-age=3600'),'3600');
  assert.equal(cacheSeconds('31536000'),'31536000');
  assert.equal(cacheSeconds(undefined),'3600');
  assert.throws(()=>cacheSeconds('no-store'));
});

test('URL mapping preserves JSON structure and unrelated URLs/content',()=>{
  const row={id:'unchanged',options:[{content_html:`<img src="${OLD_STORAGE}object/public/images/π.svg">`},null],api:'https://noqtadytxyslkoetchrs.supabase.co/rest/v1/',external:'https://example.test/image.svg',updated_at:'unchanged',value:42};
  const next=replaceStorage(row);
  assert.equal(next.options[0].content_html,`<img src="${NEW_STORAGE}object/public/images/π.svg">`);
  assert.equal(next.api,row.api);assert.equal(next.external,row.external);assert.equal(next.updated_at,row.updated_at);assert.equal(next.value,42);assert.equal(next.options[1],null);
  assert.match(row.options[0].content_html,/noqtadytxyslkoetchrs/);
});

test('URL mapping updates valid render hashes while retaining stale/null markers',()=>{
  const row={stem_html:`<img src="${OLD_STORAGE}object/public/images/a.svg">`,stimulus_html:null,rationale_html:'\\(x^2\\)',options:[],stem_rendered:`<img src="${OLD_STORAGE}object/public/images/a.svg">`,updated_at:'preserved'};
  const valid={...row,rendered_source_hash:sourceHash(row)};
  const result=transformedQuestion(valid);
  assert.equal(result.rendered_source_hash,sourceHash(result));assert.notEqual(result.rendered_source_hash,valid.rendered_source_hash);
  assert.equal(result.updated_at,valid.updated_at);
  assert.equal(transformedQuestion({...row,rendered_source_hash:'already-stale'}).rendered_source_hash,'already-stale');
  assert.equal(transformedQuestion({...row,rendered_source_hash:null}).rendered_source_hash,null);
});
