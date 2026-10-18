import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import React, { type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadBindings, transform } from 'next/dist/build/swc/index.js';
import { test, expect } from '@playwright/test';


// Render the actual shared component and CSS without a database or login.
// CSS Modules use their source class names in this isolated browser fixture.
let QuestionRenderer: ComponentType<Record<string, unknown>>;
test.beforeAll(async () => {
  let source = readFileSync(resolve('lib/ui/QuestionRenderer.js'), 'utf8');
  source = source.replace("'@/lib/sanitize'", JSON.stringify(resolve('lib/sanitize.ts')))
    .replace("'@/lib/content/act-passage'", JSON.stringify(resolve('lib/content/act-passage.ts')))
    .replace("'@/lib/ui/preview-effects'", JSON.stringify(resolve('lib/ui/preview-effects.js')))
    .replace("import s from './QuestionRenderer.module.css';", 'const s = new Proxy({}, { get: (_, key) => key });');
  await loadBindings();
  const compiled = await transform(source, {
    filename: 'QuestionRenderer.jsx',
    jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'automatic' } }, target: 'es2022' },
    module: { type: 'commonjs' },
  });
  const compiledModule = { exports: {} as { QuestionRenderer: typeof QuestionRenderer } };
  new Function('require', 'module', 'exports', compiled.code)(createRequire(resolve('package.json')), compiledModule, compiledModule.exports);
  QuestionRenderer = compiledModule.exports.QuestionRenderer;
});

const css = ['app/styles/next-tokens.css', 'app/styles/next-prose.css', 'lib/ui/QuestionRenderer.module.css']
  .map(file => readFileSync(resolve(file), 'utf8')).join('\n');

// Local source-verified repair manifests are deliberately kept out of Git.
if (process.env.ACT_PASSAGES_FIXTURE) {
  const passages = JSON.parse(readFileSync(process.env.ACT_PASSAGES_FIXTURE, 'utf8')) as Array<{section:string;first_q:number;html:string}>;
  for (const passage of passages) for (const width of [390, 1246]) {
    test(`converted ${passage.section} ${passage.first_q} at ${width}px`, async ({page}) => {
      await page.setViewportSize({width,height:800});
      await page.setContent(passageFixture(passage.section,passage.html));
      await page.locator('img').evaluateAll(async nodes => Promise.all(nodes.map(n=>(n as HTMLImageElement).decode())));
      const result = await page.evaluate(() => {
        const pane=document.querySelector<HTMLElement>('.passagePane')!;
        return {overflow:document.documentElement.scrollWidth>innerWidth+1,
          fonts:[...pane.querySelectorAll('p')].map(p=>getComputedStyle(p).fontSize),
          positions:[...pane.querySelectorAll('.qref')].map(p=>getComputedStyle(p).position),
          legacy:pane.querySelectorAll('img[alt*="original PDF"]').length};
      });
      expect(result.overflow).toBe(false);
      expect(result.fonts.every(f=>f==='17px')).toBe(true);
      expect(result.positions.every(p=>p==='static')).toBe(true);
      expect(result.legacy).toBe(0);
      if(passage.section!=='science') await expect(page.locator('img')).toHaveCount(0);
      if(width===1246) await page.screenshot({path:`tmp/mc5-preview-${passage.section}-${passage.first_q}.png`});
    });
  }
}
function passageImage(height: number, section: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="672" height="${height}"><rect width="672" height="${height}" fill="white"/><text x="10" y="40" font-size="24">Passage text at a consistent size</text></svg>`;
  return `<div style="position:relative;margin-bottom:1em"><img alt="${section} passage 1, original PDF page 4" src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" style="display:block;width:100%;max-width:100%;height:auto"/><span class="qref qref-active" data-q="2" style="position:absolute;left:10%;top:40%;width:30%;height:3%"></span></div>`;
}
function passageFixture(section: string, html: string) {
  const content = renderToStaticMarkup(React.createElement(QuestionRenderer, {
    question: { questionId:'passage', questionType:'mcq', taxonomy:{domain_code:section},
      stimulusHtml:html, stemHtml:'<p>Which choice is correct?</p>',
      options:[{id:'A',label:'A',content_html:'No change'},{id:'B',label:'B',content_html:'Alternative'}] },
    layout:'two-column', onSelectOption:()=>{},
  }));
  return `<style>${css}*{box-sizing:border-box}body{margin:0;font:16px Arial}main{padding:12px}</style><main data-tree="next">${content}</main>`;
}
for (const width of [390, 1246, 1440]) {
  for (const section of ['english', 'reading', 'science']) {
    test(`${section} passage pages align overlays and scroll independently at ${width}px`, async ({page}) => {
      await page.setViewportSize({width,height:800});
      await page.setContent(passageFixture(section, passageImage(920,section)+passageImage(1490,section)));
      await page.locator('img').evaluateAll(async images => { await Promise.all(images.map(i => (i as HTMLImageElement).decode())); });
      const result = await page.evaluate(() => {
        const pane=document.querySelector<HTMLElement>('.passagePane')!;
        const images=[...document.querySelectorAll<HTMLImageElement>('.sw-prose img')];
        const boxes=images.map(img=> {
          const r=img.getBoundingClientRect(), parent=img.parentElement!.getBoundingClientRect();
          const mark=img.parentElement!.querySelector('.qref')!.getBoundingClientRect();
          return { width:r.width, ratio:r.width/r.height, naturalRatio:img.naturalWidth/img.naturalHeight,
            offset:Math.abs(r.left-parent.left)+Math.abs(r.top-parent.top),
            markerError:Math.abs(mark.left-(r.left+r.width*.1))+Math.abs(mark.top-(r.top+r.height*.4)) };
        });
        const stem=document.querySelector('.stem')!.getBoundingClientRect().top;
        pane.scrollTop=300;
        return {boxes,scrolled:pane.scrollTop,stemStayed:stem===document.querySelector('.stem')!.getBoundingClientRect().top,
          pageOverflow:document.documentElement.scrollWidth>innerWidth+1,paneHeight:pane.clientHeight};
      });
      expect(result.boxes[0].width).toBeCloseTo(result.boxes[1].width,1);
      for(const b of result.boxes) {
        expect(b.ratio).toBeCloseTo(b.naturalRatio,2);
        expect(b.offset).toBeLessThan(1);
        expect(b.markerError).toBeLessThan(1);
      }
      expect(result.scrolled).toBeGreaterThan(0);
      expect(result.stemStayed).toBe(true);
      expect(result.pageOverflow).toBe(false);
      expect(result.paneHeight).toBeLessThan(600);
      await page.getByRole('region',{name:'Passage'}).focus();
      await expect(page.getByRole('region',{name:'Passage'})).toBeFocused();
    });
  }
}
test('ordinary Math diagrams keep their height cap', async ({page}) => {
  await page.setContent(passageFixture('math',passageImage(1490,'Math').replace('original PDF page 4','geometry diagram')));
  await page.locator('img').evaluate((img:HTMLImageElement)=>img.decode());
  expect((await page.locator('img').boundingBox())!.height).toBeLessThanOrEqual(360);
  await expect(page.getByRole('region',{name:'Passage'})).toHaveCount(0);
});

// Optional local visual inspection with an actual imported passage; never
// store copyrighted passage images in the regression fixture or repository.
if (process.env.ACT_PASSAGE_FIXTURE) {
  test('inspect imported passage',async({page})=>{
    await page.setViewportSize({width:1246,height:800});
    await page.setContent(passageFixture('english',readFileSync(process.env.ACT_PASSAGE_FIXTURE!,'utf8')));
    await page.locator('img').evaluateAll(async images => { await Promise.all(images.map(i => (i as HTMLImageElement).decode())); });
    await page.locator('[data-q="2"]').evaluateAll(nodes=>nodes.forEach(n=>n.classList.add('qref-active')));
    await page.locator('.passagePane').evaluate(pane=>{
      const mark=pane.querySelector('[data-q="2"]')!;
      pane.scrollTop=mark.getBoundingClientRect().top-pane.getBoundingClientRect().top-160;
    });
    await page.screenshot({path:'tmp/passage-fixed.png'});
  });
}

test('digital passage text reflows consistently and keeps inline highlights attached',async({page})=>{
  const html='<h3 style="font-size:8px">A passage title</h3><p style="font-size:9px;width:150px;text-indent:5em">'+
    'This is a paragraph of readable passage text. '.repeat(9)+
    '<span class="qref qref-active" data-q="2" style="font-size:6px">these words stay highlighted across a line break</span>.</p><p>A second paragraph.</p>';
  for(const width of [390,1246]) {
    await page.setViewportSize({width,height:800});
    await page.setContent(passageFixture('english',html));
    const result=await page.locator('.sw-act-passage').evaluate(root=>{
      const p=root.querySelector('p')!, marker=root.querySelector('.qref')!;
      return {size:getComputedStyle(p).fontSize,markerSize:getComputedStyle(marker).fontSize,
        indent:getComputedStyle(p).textIndent,words:marker.textContent,position:getComputedStyle(marker).position,
        images:root.querySelectorAll('img').length,paragraphs:root.querySelectorAll('p').length};
    });
    expect(result).toEqual({size:'17px',markerSize:'17px',indent:'0px',words:'these words stay highlighted across a line break',position:'static',images:0,paragraphs:2});
  }
});
