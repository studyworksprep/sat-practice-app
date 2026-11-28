// Copy only the authored content needed to read an answer. This copy comes
// from the lesson delivered to the learner, including referenced passages.
import { indexSharedPrompts, sharedPromptIdFor } from './editor-utils.mjs';
import { normalizeLessonFigure } from './figure.mjs';
import { formatNumericCheckAnswer, isNumericCheck } from './numeric-check.mjs';
import { buildLessonCheckRows } from './progress-report.mjs';

/**
 * @typedef {{ step:number, kind:string, prompt:string, instructions:string, passage:{title:string,html:string}|null,
 * figure:{src:string,alt:string,caption:string|null}|null, choices:string[], correctIndex:number|null,
 * numericAnswer:string, explanation:string, solution:string }} ReviewQuestion
 * @typedef {{number:number, label:string, selected:string|number|null, expressions:string[]|null, correct:boolean|null, revealed:boolean}} ReviewAnswer
 * @typedef {{question:ReviewQuestion|null, saved:boolean, answers:ReviewAnswer[]}} ReviewVersion
 */
/** @returns {Map<string,ReviewQuestion>} */
export function reviewQuestions(blocks) {
  const prompts = indexSharedPrompts(blocks);
  const questions = new Map();
  blocks.forEach((block, i) => {
    if (!['check', 'desmos_interactive'].includes(block.block_type)) return;
    const c = block.content ?? {};
    const desmos = block.block_type === 'desmos_interactive';
    questions.set(block.id, {
      step: i + 1,
      kind: desmos ? 'desmos' : isNumericCheck(c) ? 'numeric' : 'choice',
      prompt: desmos ? c.title || 'Desmos activity' : c.prompt || 'Knowledge check',
      instructions: desmos ? c.instructions_html || '' : '',
      passage: prompts.get(sharedPromptIdFor(block)) ?? null,
      figure: normalizeLessonFigure(block),
      choices: Array.isArray(c.choices) ? c.choices : [],
      correctIndex: c.correct_index ?? null,
      numericAnswer: isNumericCheck(c) ? formatNumericCheckAnswer(c) : '',
      explanation: c.explanation || '',
      solution: desmos ? c.feedback?.solution_html || '' : c.solution || c.explanation || '',
    });
  });
  return questions;
}

// Capture the expression list at Check, including table cells and fitted
// values. Omit graph viewport, styling, and other calculator state.
export function calculatorSubmission(entered) {
  return entered.flatMap(row => {
    if (row.type === 'table') {
      return (row.columns || []).map(c => [c.latex, ...(c.values || [])].join(' | '));
    }
    if (!row.latex) return [];
    return [row.latex, ...Object.entries(row.regressionParameters || {}).map(([k, v]) => k + ' = ' + v)];
  });
}

export function reviewOutcome(row) {
  if (!row.attempted) return 'unanswered';
  if (!row.finalCorrect) return 'missed';
  if (row.firstTryCorrect === false) return 'retry';
  return row.firstTryCorrect ? 'first' : 'recorded';
}

/**
 * @typedef {{blockId:string, stepNumber:number, blockType:string, label:string, attempted:boolean,
 * firstTryCorrect:boolean|null, finalCorrect:boolean|null}} CheckRow
 * @param {CheckRow} row
 * @param {object} entry
 * @param {ReviewQuestion|null|undefined} current
 * @returns {CheckRow & {question:ReviewQuestion|null, versions:ReviewVersion[], outcome:string}}
 */
function attachHistory(row, entry, current) {
  const tracked = entry?.attempts?.length ? entry.attempts : entry ? [entry] : [];
  /** @type {ReviewVersion[]} */
  const versions = [];
  let question = current ?? null;
  tracked.forEach((attempt, i) => {
    if (attempt.question) question = attempt.question;
    if (!versions.length || attempt.question) {
      versions.push({ question, saved: Boolean(attempt.question), answers: [] });
    }
    const first = i === 0;
    const last = i === tracked.length - 1;
    versions.at(-1).answers.push({
      number: i + 1,
      label: first && row.firstTryCorrect == null ? 'Earlier recorded answer' : first ? 'First answer' : 'Attempt ' + (i + 1),
      selected: attempt.selected,
      expressions: attempt.expressions ?? null,
      correct: attempt.correct ?? (last ? row.finalCorrect : first ? row.firstTryCorrect : null),
      revealed: attempt.revealed === true,
    });
  });
  if (!versions.length) versions.push({ question, saved: false, answers: [] });
  if (tracked.length === 1 && row.firstTryCorrect == null) versions[0].answers[0].label = 'Last recorded answer';
  return { ...row, question, versions, outcome: reviewOutcome(row) };
}

export function buildCheckReview(blocks, answers = {}) {
  const questions = reviewQuestions(blocks);
  const rows = buildLessonCheckRows(blocks, answers).map(row =>
    attachHistory(row, answers[row.blockId], questions.get(row.blockId)));
  // A deleted check can still be reviewed if it has an authored snapshot.
  const archived = [];
  for (const [blockId, entry] of Object.entries(answers)) {
    if (questions.has(blockId)) continue;
    const firstSnapshot = entry?.attempts?.find(a => a.question)?.question;
    if (!firstSnapshot) continue;
    const row = buildLessonCheckRows([{ id: blockId, block_type: firstSnapshot.kind === 'desmos' ? 'desmos_interactive' : 'check' }], answers)[0];
    archived.push(attachHistory({ ...row, stepNumber: firstSnapshot.step }, entry, null));
  }
  return { rows, archived };
}
