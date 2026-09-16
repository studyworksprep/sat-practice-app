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

test('normalizes Mathpix choice-label case without changing choice content or accepting invalid sequences', () => {
 const source = String.raw`\section*{Question ID: mixed-case}
Question
Choose the equation.
Answer
\begin{itemize}
\item[A.] $h=8s+15$
\item[B.] $h=15s+8$
\item[c.] $h=8s+7$
\item[D.] $h=7s+8$
\end{itemize}
Correct Answer: A`;
 const parsed = parseQuestions(source).questions[0];
 assert.deepEqual(parsed.options.map(o=>o.label), ['A','B','C','D']);
 assert.equal(parsed.options[2].mmd, '$h=8s+7$');
 assert.equal(parsed.answer, 'A');
 for (const invalid of [source.replace('\\item[c.]', '\\item[b.]'), source.replace('\\item[c.] $h=8s+7$\n', ''), source.replace('$h=8s+7$', '')]) {
   assert.throws(()=>parseQuestions(invalid), /expected four complete choices/);
 }
});

test('keeps escaped currency separate from math delimiters, including currency inside math', () => {
 const html = mmdToHtml(String.raw`Cost \$400 plus $x+1$ or $\$ 55$.`);
 assert.match(html, /Cost &#36;400/);
 assert.ok(html.includes(String.raw`\(x+1\)`));
 assert.ok(html.includes(String.raw`\(\$ 55\)`));
 assert.throws(()=>mmdToHtml(String.raw`Cost \$400 plus $x`), /incomplete/);
});

test('recognizes a captioned question boundary and retains its question figure', () => {
 const source = question('before') + String.raw`
\begin{table}
\captionsetup{labelformat=empty}
\caption{Question ID: captioned}
\begin{tabular}{l}Metadata\end{tabular}
\end{table}
\begin{figure}
\captionsetup{labelformat=empty}
\caption{Question}
\includegraphics[alt={},max width=\textwidth]{./images/graph.jpg}
\end{figure}
Read this graph.
Correct Answer: 4
Rationale
Four.`;
 const parsed = parseQuestions(source).questions;
 assert.deepEqual(parsed.map(q=>q.id), ['before','captioned']);
 assert.ok(!parsed[0].rationale.includes('captioned'));
 assert.ok(!parsed[1].stem.includes('Metadata'));
 assert.match(mmdToHtml(parsed[1].stem, {'images/graph.jpg':'data:image/jpeg;base64,AQ=='}), /<img.*Read this graph/);
});

test('renders images inside table cells without leaking internal placeholder tokens', () => {
 const html=mmdToHtml(String.raw`\begin{tabular}{l} ![](images/a.jpg) \\ \end{tabular}`, {'images/a.jpg':'data:image/jpeg;base64,AQ=='});
 assert.match(html, /<th[^>]*><img/);
 assert.ok(!html.includes('IMPORTTOKEN'));
});

test('rationale fallback is flagged and never overrides export or metadata keys', () => {
 const source = String.raw`\section*{Question ID: rationale-key}
Question
Find y.
Rationale
The correct answer is $\frac{3}{2}$. Note that 3/2 and 1.5 are examples of ways to enter a correct answer.`;
 const fallback = parseQuestions(source).questions[0];
 assert.equal(fallback.answer,'3/2, 1.5');
 assert.deepEqual(JSON.parse(fallback.correctAnswer.text),['3/2','1.5']);
 assert.ok(fallback.warnings.some(w=>w.includes('Answer extracted')));
 for(const result of [parseQuestions(source,[{questionId:'rationale-key',correct_answer:'7'}]), parseQuestions(source.replace('Rationale','Correct Answer: 7\nRationale'))]) {
  assert.equal(result.questions[0].answer,'7');
  assert.ok(!result.questions[0].warnings.some(w=>w.includes('Answer extracted')));
 }
});

test('metadata IDs are canonical for unambiguous O/0 OCR corrections',()=>{
 const meta=[{questionId:'0adbe034',difficulty:'H'},{questionId:'0dd6227f',difficulty:'M'}];
 const result=parseQuestions(question('Oadbe034')+question('Odd6227f'),meta);
 assert.deepEqual(result.questions.map(q=>q.id),['0adbe034','0dd6227f']);
 assert.equal(result.questions[0].originalId,'Oadbe034');
 assert.equal(result.questions[0].metadata.difficulty,'H');
 assert.ok(result.questions[0].warnings.some(w=>w.includes('canonical metadata ID')));
 assert.deepEqual(result.warnings,[]);
 assert.throws(()=>parseQuestions(question('Oadbe034')+question('0adbe034'),meta),/Repeated question ID/);
 assert.throws(()=>parseQuestions(question('Oadbe034'),[...meta,{questionId:'0ADBE034'}]),/ambiguous metadata/);
 assert.equal(parseQuestions(question('Ordinary-O'),[{questionId:'0rdinary-0'}]).questions[0].id,'Ordinary-O');
 assert.equal(parseQuestions(question('Oadbe034'),[...meta,{questionId:'Oadbe034'}]).questions[0].id,'Oadbe034');
});

test('preserves a captioned figure, surrounding prompt, and embedded image', () => {
 const html = mmdToHtml(String.raw`Before.
\begin{figure}
\includegraphics[alt={},max width=\textwidth]{./images/rectangle.jpg}
\captionsetup{labelformat=empty}
\caption{Note: Figure not drawn to scale.}
\end{figure}
After $x+8$.`, {'images/rectangle.jpg':'data:image/jpeg;base64,AQ=='});
 assert.match(html, /<img src="data:image\/jpeg;base64,AQ=="/);
 assert.ok(html.indexOf('Before.') < html.indexOf('<img'));
 assert.ok(html.indexOf('<img') < html.indexOf('Note: Figure not drawn to scale.'));
 assert.ok(html.indexOf('Note:') < html.indexOf('After'));
 assert.ok(!/IMPORTTOKEN|includegraphics|captionsetup/.test(html));
 assert.throws(() => mmdToHtml(String.raw`\begin{figure}\includegraphics{images/missing.jpg}\end{figure}`), /Missing or unsupported figure/);
});

test('keeps table captions attached to their own data in source order', () => {
 const html = mmdToHtml(String.raw`\begin{table}
\captionsetup{labelformat=empty}
\caption{Data Set Q}
\begin{tabular}{ll}Value & Frequency \\ $a$ & 110 \\\end{tabular}
\end{table}
\begin{table}
\caption{Data Set R}
\begin{tabular}{ll}Value & Frequency \\ $a$ & 0 \\\end{tabular}
\end{table}`);
 assert.equal((html.match(/<table>/g) ?? []).length, 2);
 assert.ok(html.indexOf('Data Set Q') < html.indexOf('110'));
 assert.ok(html.indexOf('110') < html.indexOf('Data Set R'));
 assert.ok(html.indexOf('Data Set R') < html.indexOf('<td style="text-align:center">0</td>'));
 assert.ok(!/IMPORTTOKEN|\\caption/.test(html));
});

test('keeps Roman-numeral prompt statements separate from answer choices', async () => {
 const source = String.raw`\section*{Question ID: roman}
Question
Which statements are true?
\begin{itemize}
\item[I.] $p(x)=a(4.1)^x+b$
\item[II.] $r(x)=a(4.1)^{x+b}$
\end{itemize}
Answer
\begin{itemize}
\item[A.] I only
\item[B.] II only
\item[C.] I and II
\item[D.] Neither I nor II
\end{itemize}
Correct Answer: D`;
 const q = parseQuestions(source).questions[0];
 const html = mmdToHtml(q.stem);
 assert.equal(q.answer, 'D');
 assert.deepEqual(q.options.map(o=>o.label), ['A','B','C','D']);
 assert.match(html, /<li><p>I\. /);
 assert.match(html, /<li><p>II\. /);
 assert.ok(html.includes(String.raw`\(r(x)=a(4.1)^{x+b}\)`));
 assert.ok(!html.includes('I only'));
 const {sanitizeQuestionHtml} = await import('../sanitize.ts');
 const clean = sanitizeQuestionHtml(html);
 assert.match(clean, /<ol style="list-style-type:none">/);
 assert.match(clean, /<li><p>II\. /);
});

test('rejects unsupported or incomplete wrappers and escapes captions', () => {
 for (const text of [String.raw`\begin{figure}broken`, String.raw`\caption{unsupported {nested} caption}`, String.raw`\begin{itemize}\item[I.]\end{itemize}`, String.raw`\begin{itemize}\item[A.] answer\end{itemize}`, String.raw`\includegraphics{image.jpg}`]) {
   assert.throws(()=>mmdToHtml(text));
 }
 const html=mmdToHtml(String.raw`\begin{table}\caption{<script>alert(1)</script>}\begin{tabular}{l}1\end{tabular}\end{table}`);
 assert.ok(!html.includes('<script>'));
 assert.ok(html.includes('&lt;script&gt;'));
});
