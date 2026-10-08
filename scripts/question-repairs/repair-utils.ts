import {parseHTML} from 'linkedom';
export type Data=Record<string,any>;
export const body=(html:string|null)=>parseHTML('<html><body>'+(html??'')+'</body></html>').document.body;
export function mathText(node:any):string{return [...node.querySelectorAll('[data-c]')].map((n:any)=>String.fromCodePoint(parseInt(n.getAttribute('data-c'),16))).join('').normalize('NFKC');}
export function canonical(text:string):string{
 return text.normalize('NFKC').replace(/[‘’ʼ]/g,"'").replace(/[“”]/g,'"').replace(/\u00ad/g,'').replace(/_{2,}/g,'[BLANK]').replace(/\s+/g,' ').replace(/\s*\/\s*/g,'/').replace(/([\d.])\s+(?=mW\/cm2)/g,'$1').trim();
}
export function visible(html:string|null):string{
 const dom=body(html);for(const n of dom.querySelectorAll('.sr-only,annotation'))n.remove();
 for(const svg of [...dom.querySelectorAll('svg')])if(svg.querySelector('[data-mml-node]'))svg.replaceWith(mathText(svg));else svg.remove();
 for(const n of dom.querySelectorAll('img'))n.remove();
 for(const n of dom.querySelectorAll('p,div,li,tr,td,th,br')){n.before(' ');n.after(' ');}
 return canonical(dom.textContent);
}
export function formatting(html:string|null):Data[]{
 const dom=body(html);for(const n of dom.querySelectorAll('.sr-only,img,annotation'))n.remove();
 for(const n of [...dom.querySelectorAll('svg')])if(!n.querySelector('[data-mml-node]'))n.remove();
 const result:Data[]=[];
 for(const n of dom.querySelectorAll('*')){
  const tag=n.tagName.toLowerCase(),cls=n.getAttribute('class')??'',style=n.getAttribute('style')??'',kinds:string[]=[];
  if(['i','em'].includes(tag)||/\bitalic\b/.test(cls)||/font-style\s*:\s*italic/i.test(style))kinds.push('italics');
  if(tag==='u'||/\bunderline\b/.test(cls)||/text-decoration(?:-line)?\s*:[^;]*underline/i.test(style))kinds.push('underline');
  if(['b','strong'].includes(tag)||/\bbold\b/.test(cls)||/font-weight\s*:\s*(?:bold|[6-9]00)/i.test(style))kinds.push('bold');
  if(['sup','sub'].includes(tag))kinds.push(tag);
  if(n.getAttribute('data-mml-node')==='msup')result.push({kind:'sup',text:canonical(mathText(n.lastElementChild))});
  if(n.getAttribute('data-mml-node')==='msub')result.push({kind:'sub',text:canonical(mathText(n.lastElementChild))});
  const text=canonical(n.textContent);if(text)for(const kind of kinds)result.push({kind,text});
 }
 return result.filter((r,i)=>result.findIndex(x=>x.kind===r.kind&&x.text===r.text)===i);
}
