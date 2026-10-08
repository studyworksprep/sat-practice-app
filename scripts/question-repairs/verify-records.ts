// Read-only validation of the October repairs already applied in production.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {renderRow,sourceHash} from '../../lib/content/render-math.mjs';
import {sanitizeQuestionHtml} from '../../lib/sanitize.ts';
import {body,visible,formatting,type Data} from './repair-utils.ts';

const root=resolve('content/question-repairs/2026-10');
const read=async(name:string)=>JSON.parse(await readFile(resolve(root,name),'utf8'));
const batches=[['initial-question.json',1],['math.json',53],['reading-writing.json',131]] as const;
const codes=new Set<string>();let fields=0,figures=0;
for(const [file,count] of batches){
 const batch:Data=await read(file);assert.equal(batch.format_version,1);assert.equal(batch.status,'applied-and-verified');assert.equal(batch.questions.length,count);
 for(const question of batch.questions as Data[]){
  assert.ok(/^(?:M|RW)-\d{5}$/.test(question.code));assert.ok(!codes.has(question.code));codes.add(question.code);
  assert.ok(question.source_id&&question.source_external_id);
  const {stem_html,stimulus_html,rationale_html,options}=question.content;
  assert.equal(createHash('sha256').update(JSON.stringify(question.content)).digest('hex'),question.content_sha256,question.code+': content checksum');
  if(question.rendered_source_hash)assert.equal(sourceHash({stem_html,stimulus_html,rationale_html,options}),question.rendered_source_hash,question.code+': rendering checksum');
  assert.ok(stem_html?.trim());assert.ok(rationale_html?.trim());
  if(question.question_type==='mcq'){
   assert.deepEqual(options.map((o:Data)=>o.label),['A','B','C','D']);assert.ok('ABCD'.includes(question.correct_answer.option_label));
   for(const [i,o] of options.entries())if(o.ordinal!==undefined)assert.equal(o.ordinal,i+1);
  }else{assert.equal(question.question_type,'spr');assert.ok(question.correct_answer.number!==null||question.correct_answer.text!==null);}
  if(file!=='initial-question.json'){
   assert.equal(question.source.external_id,question.source_external_id);assert.ok(/^[a-f0-9]{64}$/.test(question.source.sha256));assert.ok(Number.isFinite(Date.parse(question.source.fetched_at)));
  }
  const errors:string[]=[];const rendered:Data=renderRow({id:question.code,stem_html,stimulus_html,rationale_html,options},(field:string,error:Error)=>errors.push(field+': '+error.message));assert.deepEqual(errors,[]);
  const effective=(field:string)=>field.startsWith('option-')?rendered.options_rendered?.find((o:Data)=>o.label===field.slice(-1))?.content_html_rendered??options.find((o:Data)=>o.label===field.slice(-1)).content_html:rendered[field+'_rendered']??question.content[field+'_html'];
  for(const field of ['stem','stimulus','rationale',...(options??[]).map((o:Data)=>'option-'+o.label)]){
   const html=effective(field);if(!html)continue;const safe=sanitizeQuestionHtml(html);
   assert.ok(safe.trim());assert.ok(!/TRIMMED|data-mjx-error|data-mml-node="merror"|```/.test(safe),question.code+': malformed '+field);
   assert.equal(body(safe).querySelectorAll('svg path').length,body(html).querySelectorAll('svg path').length,question.code+': lost math or figure paths');
   if(file==='math.json')assert.equal(body(html).querySelectorAll('img[role=math]').length,0,question.code+': equation image bypasses shared math renderer');
  }
  for(const official of question.official_fields??[]){
   const html=effective(official.field);assert.equal(visible(html),visible(official.html),question.code+': official '+official.field);
   const formats=formatting(html);for(const expected of formatting(official.html))assert.ok(formats.some(f=>f.kind===expected.kind&&f.text===expected.text),question.code+': '+expected.kind);
   const raw=official.field.startsWith('option-')?options.find((o:Data)=>o.label===official.field.slice(-1)).content_html:question.content[official.field+'_html'];
   const originalFigures=[...body(official.html).querySelectorAll('svg')];const savedFigures=[...body(raw).querySelectorAll('img')].filter((n:any)=>n.getAttribute('src')?.startsWith('data:image/svg+xml;base64,'));
   assert.equal(savedFigures.length,originalFigures.length);
   for(const [i,img] of savedFigures.entries())assert.equal(Buffer.from(img.getAttribute('src')!.split(',')[1],'base64').toString('utf8'),originalFigures[i].outerHTML);
   figures+=savedFigures.length;fields++;
  }
 }
}
assert.equal(codes.size,185);assert.equal(fields,236);assert.equal(figures,2);
const verification=await read('verification.json');
assert.equal(verification.math_initial_batch.exactContentMatches,53);assert.equal(verification.math_full_presentation_audit.remainingEquationImages,0);assert.equal(verification.reading_writing.correctedQuestions,131);
const browser=await read('reading-writing-browser-checks.json');assert.equal(browser.checks.length,131);assert.equal(browser.savedContentMatchesPrepared,true);
for(const check of [...browser.checks,...browser.savedPreviewChecks]){assert.equal(check.choices,4);assert.equal(check.missingImages,0);assert.equal(check.overflow,false);assert.equal(check.mathErrors,0);}
console.log(JSON.stringify({questionRecords:codes.size,officialRwFields:fields,completeChartFigures:figures,sharedRendering:'passed',readOnly:true}));
