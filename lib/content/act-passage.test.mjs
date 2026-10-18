import test from 'node:test';
import assert from 'node:assert/strict';
import { isRasterActPassage, normalizeActPassageHtml } from './act-passage.ts';
import { sanitizeQuestionHtml } from '../sanitize.ts';

test('digital passages preserve wording and references while removing print layout styles',()=>{
  const input='<h3 style="font-size:9px">A Title</h3><p style="text-indent:3em;width:200px">First <span class="qref" data-q="2" style="font-size:8px">underlined words</span>—<em>exactly</em>.</p><p>[A] Next paragraph.</p>';
  const actual=normalizeActPassageHtml(input);
  assert.equal(actual,'<h3>A Title</h3><p>First <span class="qref" data-q="2">underlined words</span>—<em>exactly</em>.</p><p>[A] Next paragraph.</p>');
});
test('figures, tables, and inline math survive prose normalization',()=>{
  const html='<p>Experiment 1</p><img src="data:image/png;base64,AAAA" alt="Graph" /><table><tr><td>12</td></tr></table><p>\\(x^2\\)</p>';
  assert.equal(normalizeActPassageHtml(html),html);
  assert.equal(isRasterActPassage(html),false);
  assert.equal(isRasterActPassage('<img src="graph.png" alt="Graph" />'),false);
});
test('legacy page images require source transcription and are not silently discarded',()=>{
  const html='<div><img src="page.png" alt="English passage 1, original PDF page 4" /></div>';
  assert.equal(isRasterActPassage(html),true);
  assert.equal(normalizeActPassageHtml(html),html);
});
test('normalization does not restore unsafe content removed at the rendering boundary',()=>{
  const html=normalizeActPassageHtml(sanitizeQuestionHtml('<p onclick="bad()" style="font-size:7px">Text<script>bad()</script></p>'));
  assert.equal(html,'<p>Text</p>');
});
