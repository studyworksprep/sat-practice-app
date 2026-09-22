import test from 'node:test';
import assert from 'node:assert/strict';
import { splitReadingQuestion } from './reading.ts';
import { parseQuestions, mmdToHtml } from './parse.ts';
import { sanitizeQuestionHtml } from '../sanitize.ts';
import { signReview, readReview } from './review.ts';

test('paired passages and figures stay in the stimulus; qualified prompt stays intact', () => {
  const passage = 'Text 1\nFirst author argues a point.\n\nText 2\nSecond author disagrees.\n\n![](images/chart.png)';
  const prompt = 'Based on the texts, how would the second author respond?';
  assert.deepEqual(splitReadingQuestion(`${passage}\n\n${prompt}`, 'Craft and Structure'), {stimulus:passage,stem:prompt});
  const qualified = 'Assuming similar starting conditions, which finding supports the claim?';
  assert.equal(splitReadingQuestion(`Experiment details.\n${qualified}`, 'Information and Ideas').stem,qualified);
});

test('synthesis keeps the student goal with the prompt and preserves real bullet lists', () => {
  const source = String.raw`\section*{Question ID: notes}
Question
While researching a topic, a student has taken the following notes:
\begin{itemize}
\item[-] Painting \#12 shows a station.
\item[-] The artist used $x+2$ colors and <script>literal text</script>.
\end{itemize}
The student wants to describe the painting.

Which choice uses relevant information from the notes?
Answer
\begin{itemize}
\item[A.] A station.
\item[B.] A park.
\item[C.] A forest.
\item[D.] A mountain.
\end{itemize}
Correct Answer: A`;
  const q=parseQuestions(source,[{questionId:'notes',primary_class_cd_desc:'Expression of Ideas'}]).questions[0];
  assert.ok(q.stem.startsWith('The student wants'));
  assert.ok(!q.stem.includes('Painting'));
  assert.ok(!q.stimulus.includes('The student wants'));
  const html=sanitizeQuestionHtml(mmdToHtml(q.stimulus));
  assert.match(html,/<ul>/);
  assert.equal((html.match(/<li>/g)||[]).length,2);
  assert.ok(html.includes('Painting #12'));
  assert.ok(html.includes(String.raw`\(x+2\)`));
  assert.ok(!html.includes('<script>'));
  assert.equal(q.answer,'A');
  assert.equal(q.options.length,4);
});

test('ordinary bullets work and unsupported/mixed labels fail instead of dropping text', () => {
  assert.match(mmdToHtml(String.raw`\begin{itemize}\item First note.\item Second note.\end{itemize}`),/<ul><li>/);
  for(const value of [String.raw`\begin{itemize}\item[-] First.\item[A.] Hidden answer.\end{itemize}`,String.raw`\begin{itemize}\item[-] \end{itemize}`]) assert.throws(()=>mmdToHtml(value));
});

test('reading boundary failures are explicit; math is not split on prompt-like lines', () => {
  assert.throws(()=>splitReadingQuestion('Passage without a prompt.', 'Information and Ideas'),/Cannot identify/);
  assert.throws(()=>splitReadingQuestion('Which choice is correct?', 'Information and Ideas'),/no separate passage/);
  const math='A student wants to solve an equation.\nWhich value works?';
  assert.deepEqual(splitReadingQuestion(math,'Algebra'),{stem:math,stimulus:null});
});

test('signed reading review binds stimulus markup and its separate prompt', () => {
  const review={actor:'admin',target:'id',updatedAt:'now',expires:1000,presentation:{stimulus_html:'<ul><li>Notes</li></ul>',stem_html:'<p>Which choice?</p>',rationale_html:'',options:[]}};
  const token=signReview(review,'secret');
  assert.deepEqual(readReview(token,'secret','admin',0).presentation,review.presentation);
  const altered={...review,presentation:{...review.presentation,stimulus_html:'changed'}};
  assert.throws(()=>readReview(Buffer.from(JSON.stringify(altered)).toString('base64url')+'.'+token.split('.')[1],'secret','admin',0));
});
