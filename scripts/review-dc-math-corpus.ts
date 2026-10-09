// Local source/TeX comparison sheets for the remaining DC cohort. No writes to DB.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { parseHTML } from 'linkedom';
import sharp from 'sharp';
import { parseBoundedMathSpeech } from '../lib/content/parse-bounded-math-speech.ts';
import { parseOrNull } from '../lib/content/speakmath-to-tex.mjs';
import { renderHtml } from '../lib/content/render-math.mjs';
const root=resolve(process.argv[2]);
const manual=JSON.parse(await readFile(resolve(root,'math-transcriptions.json'),'utf8').catch(()=>'{}'));
const rows=JSON.parse(await readFile(resolve(root,'before.json'),'utf8'));
const pilot=JSON.parse(await readFile('scripts/verification/dc-question-formatting-reviewed.json','utf8'));
const codes=new Set(pilot.questions.map((q:any)=>q.code));
const unique=new Map<string,any>();
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const canon=(t:string|null)=>(t??'').replace(/\\(?:left|right)/g,'').replace(/\\tfrac/g,'\\frac').replace(/\\(?:cdot|times)/g,'*').replace(/\s/g,'').replace(/\{,\}/g,',').replace(/\^\{([a-z0-9])\}/g,'^$1');
for(const q of rows.filter((q:any)=>!codes.has(q.display_code))) {
  for(const html of [q.stem_html,q.stimulus_html,q.rationale_html,...(q.options??[]).map((o:any)=>o.content_html)]) {
    const dom=parseHTML('<html><body>'+(html??'')+'</body></html>').document.body;
    for(const img of dom.querySelectorAll('img[role="math"],img.math-img')) {
      const src=img.getAttribute('src')??'', alt=(img.getAttribute('alt')??'').trim().replace(/\s+/g,' ');
      const id=hash(src); if(unique.has(id)) continue;
      const tex=parseBoundedMathSpeech(alt), old=parseOrNull(alt);
      unique.set(id,{code:q.display_code,src_sha256:id,alt,tex,source:src,group:!tex?'pending':canon(tex)!==canon(old)?'changed':'matching'});
    }
  }
}
await mkdir(resolve(root,'corpus-review'),{recursive:true});
const records=[...unique.values()].map((x,index)=>({...x,index}));
await writeFile(resolve(root,'corpus-review/records.json'),JSON.stringify(records,null,2));
for(const group of ['pending','changed','matching','matching-long','manual']) {
  const entries=records.filter(x=>group==='manual'?manual.math_images?.some((m:any)=>m.src_sha256===x.src_sha256):group==='matching-long'?x.group==='matching'&&x.alt.length>70:x.group===group);
  // Matching formulas use the same algebra as the old converter; sample each family.
  const selected=group==='matching'?entries.filter((_,i)=>i%25===0):entries;
  for(let start=0;start<selected.length;start+=32) {
    const chunk=selected.slice(start,start+32); const tiles:any[]=[];
    for(const [i,r] of chunk.entries()) {
      if(group==='manual') r.tex=manual.math_images.find((m:any)=>m.src_sha256===r.src_sha256).tex;
      const left=(i%2)*900,top=Math.floor(i/2)*136;
      const escape=(s:string)=>s.replaceAll('&','&amp;').replaceAll('<','&lt;');
      const label='<svg width="900" height="136"><rect width="900" height="136" fill="white"/><text x="10" y="17" font-family="sans-serif" font-size="14">'+r.index+' · '+r.code+'</text><text x="10" y="34" font-family="sans-serif" font-size="11">'+escape(r.alt.slice(0,138))+'</text><path d="M0 135H900" stroke="#aaa"/></svg>';
      tiles.push({input:Buffer.from(label),left,top});
      const original=await sharp(Buffer.from(r.source.split(',')[1],'base64')).flatten({background:'#fff'}).resize({width:870,height:42,fit:'inside'}).png().toBuffer();
      tiles.push({input:original,left:left+12,top:top+40});
      if(r.tex) {
        const svg=parseHTML(renderHtml('\\('+r.tex+'\\)')).document.querySelector('svg')!;
        const rendered=await sharp(Buffer.from(svg.outerHTML),{density:144}).resize({width:870,height:42,fit:'inside'}).png().toBuffer();
        tiles.push({input:rendered,left:left+12,top:top+88});
      }
    }
    const path=resolve(root,'corpus-review',group+'-'+String(start/32+1).padStart(2,'0')+'.png');
    await sharp({create:{width:1800,height:Math.ceil(chunk.length/2)*136,channels:3,background:'#fff'}}).composite(tiles).png().toFile(path);
  }
  console.log(group,entries.length,selected.length);
}
