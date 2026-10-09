// Assemble the remaining cohort from an unchanged live baseline and verified
// official sources. Generates a local review registry, never executes SQL.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { parseHTML } from 'linkedom';
import { parseBoundedMathSpeech } from '../lib/content/parse-bounded-math-speech.ts';
type Data=Record<string,any>;
const input=resolve(process.argv[2]); const output=resolve(process.argv[3]);
const read=async(file:string)=>JSON.parse(await readFile(resolve(input,file),'utf8'));
const original:Data[]=await read('before.json');
const current=await read('remaining-metadata-before.json');
const invariants=await read('remaining-invariants-before.json');
const manifest:Data[]=await read('source-manifest.json'); const inventory:Data[]=await read('inventory.json');
const pilots=JSON.parse(await readFile('scripts/verification/dc-question-formatting-reviewed.json','utf8'));
const transcriptions=JSON.parse(await readFile('scripts/verification/dc-question-math-transcriptions.json','utf8'));
const corpus:Data[]=await read('corpus-review/records.json');
const excluded=new Set(pilots.questions.map((q:Data)=>q.code));
const rows=original.filter(q=>!excluded.has(q.display_code));
const md5=(s:string|null)=>s==null?null:createHash('md5').update(s).digest('hex');
const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
const registry:Data[]=[];
for(const q of rows) {
  const live=current.questions.find((r:Data)=>r.id===q.id)!; assert.ok(live);
  assert.equal(Date.parse(q.updated_at),Date.parse(live.updated_at),q.display_code+': intervening edit');
  for(const [field,hash]of Object.entries(live.hashes)) assert.equal(md5(q[field]),hash,q.display_code+': '+field+' changed');
  assert.deepEqual(live.options,q.options?.length?q.options.map(({content_html,...identity}:Data)=>({identity,hash:md5(content_html)})):null);
  const source=manifest.find(r=>r.code===q.display_code)!;
  const text=await readFile(source.path,'utf8'); assert.equal(sha(text),source.sha256);
  assert.equal(JSON.parse(text).item_id,q.source_external_id);
  const variables=new Set<string>(); const math_images:Data[]=[];
  for(const html of[q.stem_html,q.stimulus_html,q.rationale_html,...(q.options??[]).map((o:Data)=>o.content_html)]) {
    const dom=parseHTML('<html><body>'+(html??'')+'</body></html>').document.body;
    for(const node of dom.querySelectorAll('span.italic,span[class*="font_style:italic"],span[style*="font-style:italic"]')) {
      const variable=node.textContent.match(/^\s*([A-Za-z]{1,3})[,.]?\s*$/)?.[1];
      if(variable && (variable.length===1 || variable===variable.toUpperCase() || (/^[a-z]{2}$/.test(variable) && !['or','is','in','of','to','an','as','on','at','by','be','if','it','so','we','no','do','he','us'].includes(variable)))) variables.add(variable);
    }
    for(const image of dom.querySelectorAll('img[role="math"],img.math-img')) {
      const src=image.getAttribute('src')??'',alt=(image.getAttribute('alt')??'').trim().replace(/\s+/g,' '); const src_sha256=sha(src);
      // An identical official PNG may have several accessibility descriptions.
      // The visual transcription is bound to its exact image hash.
      const manual=transcriptions.math_images.find((m:Data)=>m.src_sha256===src_sha256);
      const canonical=corpus.find(r=>r.src_sha256===src_sha256);
      assert.ok(canonical && sha(canonical.source)===src_sha256, 'Missing original PNG');
      const tex=manual?.tex??parseBoundedMathSpeech(canonical.alt);
      assert.ok(tex,q.display_code+': unreviewed expression '+alt);
      math_images.push({src_sha256,alt,tex,method:manual?'visually transcribed':'bounded accessibility grammar'});
    }
  }
  registry.push({code:q.display_code,source_external_id:q.source_external_id,official_source_sha256:source.sha256,variables:[...variables],math_images});
}
assert.equal(rows.length,451);
await mkdir(output,{recursive:true});
for(const [name,data]of Object.entries({'before.json':rows,'normalization-before.json':{format:'content-hashes-v1',questions:current.questions.filter((q:Data)=>rows.some(r=>r.id===q.id)),history:invariants.history},'normalization-invariants-before.json':invariants,'source-manifest.json':manifest.filter(r=>rows.some(q=>q.display_code===r.code)),'inventory.json':inventory.filter(r=>rows.some(q=>q.display_code===r.code)),'registry.json':{reviewed_at:'2026-10-08',questions:registry}})) await writeFile(resolve(output,name),JSON.stringify(data,null,2));
console.log(JSON.stringify({questions:rows.length,math_images:registry.reduce((n,q)=>n+q.math_images.length,0),source_hashes_verified:rows.length,intervening_edits:0,pending_drafts:current.drafts.filter((d:Data)=>d.status==='pending').length}));
