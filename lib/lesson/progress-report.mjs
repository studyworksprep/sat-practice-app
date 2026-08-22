// Tutor-facing lesson progress reporting: turns lesson_progress rows
// (check_answers entries maintained by applyCheckAttempt in
// runtime-progress.mjs) into the per-check table on the per-student
// assignment report and the struggled-blocks rollup on the assignment
// roster. Pure functions over already-fetched rows — no queries here.

import { checkAttemptCount, checkFirstTryCorrect } from './runtime-progress.mjs';

const ANSWERABLE_BLOCK_TYPES = new Set(['check', 'desmos_interactive']);

// A short plain-text label for a check block. Check prompts and Desmos
// titles are authored as HTML/LaTeX-bearing strings; the report tables
// need a one-line handle, not a rendered block.
export function checkBlockLabel(block, maxLength = 90) {
  const raw =
    block?.block_type === 'desmos_interactive'
      ? block?.content?.title || 'Desmos activity'
      : block?.content?.prompt || 'Knowledge check';
  const text = String(raw)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

// The lesson's answerable blocks, in lesson order, with their 1-indexed
// step numbers (positions among ALL blocks, matching the "Step N of M"
// label the student sees).
export function lessonCheckBlocks(blocks) {
  const rows = [];
  (blocks || []).forEach((block, index) => {
    if (!ANSWERABLE_BLOCK_TYPES.has(block?.block_type)) return;
    rows.push({
      blockId: block.id,
      stepNumber: index + 1,
      blockType: block.block_type,
      label: checkBlockLabel(block),
    });
  });
  return rows;
}

// "Struggled" = the attempt history shows real friction: three or more
// tries, or a final answer that is still wrong. (A one-shot check missed
// on its only try counts — that final wrong answer is the signal.)
export function isStruggledAttempt(entry) {
  if (!entry) return false;
  return checkAttemptCount(entry) >= 3 || !entry.correct;
}

// Per-student rows for the per-check table: every answerable block in
// lesson order, answered or not, so skipped checks are visible too.
export function buildLessonCheckRows(blocks, checkAnswers) {
  const answers = checkAnswers || {};
  return lessonCheckBlocks(blocks).map((row) => {
    const entry = answers[row.blockId];
    return {
      ...row,
      attempted: Boolean(entry),
      attempts: checkAttemptCount(entry),
      firstTryCorrect: entry ? checkFirstTryCorrect(entry) : null,
      finalCorrect: entry ? Boolean(entry.correct) : null,
      struggled: isStruggledAttempt(entry),
    };
  });
}

// Roster-level rollup: for each answerable block, how the cohort did.
// progressRows is the lesson_progress rows for the enrolled students
// (missing rows mean the student never started — they simply don't
// count toward attemptedCount).
export function buildLessonCheckRollup(blocks, progressRows) {
  const answerSets = (progressRows || []).map((row) => row?.check_answers || {});
  return lessonCheckBlocks(blocks).map((row) => {
    let attemptedCount = 0;
    let firstTryCount = 0;
    let struggledCount = 0;
    let totalAttempts = 0;
    for (const answers of answerSets) {
      const entry = answers[row.blockId];
      if (!entry) continue;
      attemptedCount += 1;
      totalAttempts += checkAttemptCount(entry);
      if (checkFirstTryCorrect(entry)) firstTryCount += 1;
      if (isStruggledAttempt(entry)) struggledCount += 1;
    }
    return {
      ...row,
      attemptedCount,
      firstTryCount,
      struggledCount,
      avgAttempts:
        attemptedCount > 0
          ? Math.round((totalAttempts / attemptedCount) * 10) / 10
          : null,
    };
  });
}

// Per-student first-try tally across the checks they submitted — the
// roster table's accuracy column for lesson assignments.
export function tallyFirstTry(blocks, checkAnswers) {
  const rows = buildLessonCheckRows(blocks, checkAnswers).filter((r) => r.attempted);
  return {
    answered: rows.length,
    firstTryCorrect: rows.filter((r) => r.firstTryCorrect).length,
  };
}
