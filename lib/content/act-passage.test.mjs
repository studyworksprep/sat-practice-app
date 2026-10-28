import test from 'node:test';
import assert from 'node:assert/strict';
import { isRasterActPassage, normalizeActPassageHtml } from './act-passage.ts';
import { sanitizeQuestionHtml } from '../sanitize.ts';

test('legacy attributions gain note styling and a missing label space', () => {
  const input='<p><em>Bracketed numbers identify original source lines.</em></p><p><strong>INFORMATIONAL:</strong>This passage is adapted from an article.</p><p>The term “living fossil” refers to ancient creatures.</p><p>Actual passage—now-dry lakebed.</p>';
  const actual=normalizeActPassageHtml(input);
  assert.match(actual, /class="source-line-help"/);
  assert.equal((actual.match(/class="source-note"/g)||[]).length,2);
  assert.match(actual, /<\/strong> This passage/);
  assert.ok(actual.endsWith('<p>Actual passage—now-dry lakebed.</p>'));
  assert.equal(normalizeActPassageHtml(actual),actual);
});

test('existing notes, split words, meaningful hyphens and figures survive', () => {
  const input='<div class="source-note" style="font-size:0.9em">INFORMATIONAL: This passage is from an article.</div><div class="source-note">“Terroir” refers to components of place.</div><p>sug<span class="qref" data-q="11">gested human-megafauna pair</span><span class="qref" data-q="11">ings</span> re-exposed</p><img src="graph.png" alt="Graph" />';
  assert.equal(normalizeActPassageHtml(input),input.replace(' style="font-size:0.9em"',''));
});

test('body definitions and ordinary uses of informational are not notes', () => {
  const input='<p>An informational text.</p><p>The term b-boying refers to break dancing.</p>';
  assert.equal(normalizeActPassageHtml(input),input);
});

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
