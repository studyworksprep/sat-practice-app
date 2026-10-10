import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sanitizeQuestionHtml} from '../sanitize.ts';
import {renderHtml, renderIfChanged} from './render-math.mjs';

const figure='<svg viewBox="0 0 100 100"><defs><clipPath id="plot"><rect x="10" y="20" width="60" height="50"></rect></clipPath></defs><path clip-path="url(#plot)" d="M 0 0 L 100 100"></path></svg>';

test('math rendering retains graph clipping definitions beside MathML and TeX',()=>{
  const out=renderHtml('<p><math><mn>2</mn></math></p>'+figure+'<p>\\(x+1\\)</p>');
  assert.match(out,/<clipPath id="plot">/);
  assert.match(out,/<\/clipPath>/);
  assert.doesNotMatch(out,/<\/?clippath\b/);
  assert.match(out,/clip-path="url\(#plot\)"/);
  assert.match(out,/<rect x="10" y="20" width="60" height="50">/);
  assert.equal((out.match(/class="MathJax"/g)??[]).length,2);
  const safe=sanitizeQuestionHtml(out);
  assert.match(safe,/<clipPath id="plot">/);
  assert.match(safe,/clip-path="url\(#plot\)"/);
});

test('a graph without math retains its markup and needs no render cache',()=>{
  assert.equal(renderHtml(figure),figure);
  assert.equal(renderIfChanged(figure,'graph'),null);
});

test('older lowercase clipping caches survive question sanitization',()=>{
  const lower=figure.replaceAll('clipPath','clippath');
  const safe=sanitizeQuestionHtml(lower);
  assert.match(safe,/<clipPath id="plot">/);
  assert.match(safe,/clip-path="url\(#plot\)"/);
  assert.match(safe,/<rect x="10" y="20" width="60" height="50">/);
  assert.equal(sanitizeQuestionHtml(safe),safe);
});

test('clipping normalization preserves filtering of active content',()=>{
  const unsafe='<svg><defs><clippath id="plot" onclick="alert(1)"><script>alert(1)</script><rect width="20" height="20" onload="alert(1)"></rect></clippath></defs><path clip-path="url(#plot)" d="M0 0L50 50" onclick="alert(1)"></path><use href="javascript:alert(1)"></use></svg>';
  const safe=sanitizeQuestionHtml(unsafe);
  assert.match(safe,/<clipPath id="plot">/);
  assert.match(safe,/clip-path="url\(#plot\)"/);
  assert.doesNotMatch(safe,/script|onclick|onload|javascript:/);
});
