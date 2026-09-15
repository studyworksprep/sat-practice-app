import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMetadata, parseQuestions, mmdToHtml, matchIdentifiers } from './parse.ts';
import { readMathpix } from './archive.ts';
import { zipSync, strToU8 } from 'fflate';

const question = (id='abc') => `\\section*{Question ID: ${id}}\nMetadata header\nQuestion\nWhat is $x$?\nCorrect Answer: .1764, .1765, 3/17\n\nRationale\nFirst page.\n\nContinuation on next page.`;
test('keeps continued rationales attached and preserves every answer string', () => {
 const {questions} = parseQuestions(question()+'\n'+question('def'),[{questionId:'abc'}]);
 assert.equal(questions.length,2);
 assert.match(questions[0].rationale,/Continuation/);
 assert.deepEqual(JSON.parse(questions[0].correctAnswer.text),['.1764','.1765','3/17']);
 assert.ok(!questions[0].stem.includes('Correct Answer'));
 assert.ok(questions[1].warnings.includes('No matching metadata supplied.'));
});
test('rejects repeated question IDs and metadata IDs', () => {
 assert.throws(()=>parseQuestions(question()+question()),/Repeated/);
 assert.throws(()=>parseMetadata('[{"questionId":"abc"},{"questionId":"abc"}]'),/Duplicate/);
});
test('matches old ibn and surfaces ambiguity without choosing a record', () => {
 const q={id:'new',metadata:{ibn:'old'}};
 const rows=[{id:'1',source_id:'old'},{id:'2',source_external_id:'old'}];
 assert.deepEqual(matchIdentifiers(q,rows),rows);
});
test('keeps the question table but excludes metadata before Question', () => {
 const q=parseQuestions(question().replace('What is $x$?', '\\begin{tabular}{|l|l|}\n\\hline $x$ & $y$ \\\\\n1 & 2 \\\\\n\\end{tabular}')).questions[0];
 const html=mmdToHtml(q.stem);
 assert.match(html,/<table>/);assert.match(html,/<th /);assert.match(html,/\\\(x\\\)/);
 assert.ok(!html.includes('Metadata header'));
});
test('escapes imported HTML and refuses missing figures or incomplete math', () => {
 assert.match(mmdToHtml('<script>alert(1)</script>'),/&lt;script&gt;/);
 assert.throws(()=>mmdToHtml('![](./images/missing.jpg)'),/Missing/);
 assert.throws(()=>mmdToHtml('$x'),/incomplete/);
});
test('reads a nested Mathpix archive and resolves relative image paths', () => {
 const bytes=zipSync({'bundle/q.mmd':strToU8(question()),'bundle/images/a.jpg':new Uint8Array([1,2,3])});
 const result=readMathpix(bytes,'export.zip');
 assert.match(result.mmd,/Question ID/);assert.match(result.images['images/a.jpg'],/^data:image\/jpeg/);
 assert.throws(()=>readMathpix(zipSync({'a.mmd':strToU8('a'),'b.mmd':strToU8('b')}),'a.zip'),/exactly one/);
});
test('rejects oversized expanded archives and unsafe paths', () => {
 assert.throws(()=>readMathpix(zipSync({'q.mmd':new Uint8Array(8_000_001)}),'a.zip'),/limit/);
 assert.throws(()=>readMathpix(zipSync({'../q.mmd':strToU8('x')}),'a.zip'),/Unsafe/);
});
test('parses TextEdit RTF-wrapped JSON and refuses arbitrary text', () => {
 assert.deepEqual(parseMetadata('{\\rtf1 header [\\\n \\{"questionId":"abc"\\}\\\n ]}'),[{questionId:'abc'}]);
 assert.throws(()=>parseMetadata('Not JSON'),/JSON array/);
});

test('standalone equations retain compact size and centering after rendering and sanitization', async () => {
 const { renderHtml } = await import('../content/render-math.mjs');
 const { sanitizeQuestionHtml } = await import('../sanitize.ts');
 const tex = String.raw`\frac{12x+28}{4}-\frac{s}{13}=r(x-8)`;
 const html = sanitizeQuestionHtml(renderHtml(mmdToHtml(`$$${tex}$$\nQuestion text.`)));
 assert.match(html, /<p style="text-align:center;margin:0.75em 0"><svg/);
 assert.match(html, /height="2.782ex"/);
 assert.match(html, /<\/p><p>Question text\.<\/p>/);
 assert.ok(!html.includes('<br'));
});

test('choice equations stay on separate left-aligned lines', () => {
 const html = mmdToHtml('$8x+4y=32$\n$$-10x-4y=-64$$', {}, { equationAlign:'left' });
 assert.match(html, /<\/p><p style="text-align:left;margin:0.75em 0">/);
 assert.ok(!html.includes('text-align:center'));
});


test('simple coordinate cells do not inherit prose paragraph spacing', () => {
 const html = mmdToHtml(String.raw`\begin{tabular}{|l|l|}
\hline $x$ & $y$ \\
\hline $k$ & 13 \\
\hline $k+7$ & -15 \\
\end{tabular}`);
 assert.ok(!html.includes('<p>'));
 assert.match(html, /<th style="text-align:center" scope="col">/);
 assert.match(html, /<td style="text-align:center">13<\/td>/);
 assert.match(html, /<td style="text-align:center">-15<\/td>/);
 assert.equal((html.match(/<tr>/g) ?? []).length, 3);
});

test('numbered exports get stable content IDs and preserve choices without metadata', () => {
  const text='## Question 1\nWhat is $2+2$?\nA. 3\nB. 4\nC. 5\nD. 6\nCorrect Answer: B\nExplanation\nAdding gives four.';
  const q=parseQuestions(text).questions[0];
  assert.equal(q.questionType,'mcq'); assert.equal(q.answer,'B');
  assert.deepEqual(q.options.map(o=>o.label),['A','B','C','D']);
  assert.equal(q.rationale,'Adding gives four.');
  assert.equal(parseQuestions(text.replace('Question 1','Question 97')).questions[0].id,q.id);
  assert.equal(parseQuestions('## Question 1\nWhat is $3+3$?').questions[0].answer,'');
});
test('metadata can provide a missing answer but does not overwrite an explicit export key', () => {
  const m='\\section*{Question ID: answer-meta}\nQuestion\nWhat is $1+1$?';
  assert.equal(parseQuestions(m,[{questionId:'answer-meta',correct_answer:'2'}]).questions[0].answer,'2');
  assert.equal(parseQuestions(m+'\nCorrect Answer: 2',[{questionId:'answer-meta',correct_answer:'3'}]).questions[0].answer,'2');
});
