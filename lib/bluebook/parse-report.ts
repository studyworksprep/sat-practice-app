// The one Bluebook "MyPractice" score-report parser.
//
// Replaces lib/parseBluebookHtml.js, which ran in the browser via
// DOMParser: each client parsed the file itself and POSTed the *parsed*
// result, so the server took a question-by-question answer vector on
// faith. Contributed reports make that untenable — an uploaded report is
// evidence supplied by the person it vouches for, and a doctored payload
// was previously indistinguishable from a real one. Parsing happens here,
// server-side, on bytes we stored ourselves
// (docs/bluebook-contributions-plan-2026-08.md, decision 6).
//
// Parsing is all this module does. It never renders, never sanitizes for
// display, and nothing it returns should reach a browser as markup — the
// raw HTML stays in the private `bluebook-reports` bucket as an audit
// artifact and is read back only by this function.
//
// Two report vintages are supported, both carried over verbatim from the
// original parser:
//   new — <tr data-tr="N" class="table-row reading-and-writing module-1">
//   old — section headings above plain tables, no per-row classes
// The old-format path is deliberately forgiving about column order; it
// was written against real files whose layouts varied.

import { parseHTML } from 'linkedom';

export type BluebookSubject = 'RW' | 'MATH';
/** Module keys used by bluebook_submissions.responses. */
export type ModuleKey = 'RW1' | 'RW2' | 'MATH1' | 'MATH2';

export interface ParsedQuestion {
  /** 0-based index across the whole test, as the report ordered it. */
  globalIndex: number;
  /** 1-based question number within its module. */
  ordinal: number;
  section: string;
  subjectCode: BluebookSubject;
  moduleNumber: 1 | 2;
  correctAnswer: string;
  studentAnswer: string;
  isCorrect: boolean;
  domain: string;
  questionType: 'mcq' | 'spr';
  /** True when studentAnswer was invented because the report omitted it.
   *  Kept off the stored response vector so a placeholder never gets
   *  mistaken for real distractor data. */
  synthesized: boolean;
}

export interface SectionCounts {
  m1: number;
  m2: number;
  total: number;
}

export interface ParsedBluebookReport {
  testName: string;
  /** As printed in the report title, e.g. "February 21, 2026". */
  testDate: string;
  /** ISO date parsed from testDate, or null when it isn't a date we know. */
  reportDate: string | null;
  questions: ParsedQuestion[];
  correctCounts: { rw: SectionCounts; math: SectionCounts };
}

/** One entry of bluebook_submissions.responses. */
export interface ResponseEntry {
  correct: boolean;
  chosen?: string;
}

export type ResponseVector = Partial<Record<ModuleKey, Record<string, ResponseEntry>>>;

const MAX_REPORT_BYTES = 10 * 1024 * 1024;

export class BluebookParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BluebookParseError';
  }
}

/**
 * Parse a saved Bluebook "Details" export.
 *
 * @throws {BluebookParseError} when the file yields no questions — the
 *   message carries the structural counts, which is what actually tells
 *   you whether you're looking at the wrong export or a new format.
 */
export function parseBluebookReport(htmlString: string): ParsedBluebookReport {
  if (typeof htmlString !== 'string' || !htmlString.trim()) {
    throw new BluebookParseError('The uploaded file is empty.');
  }
  if (htmlString.length > MAX_REPORT_BYTES) {
    throw new BluebookParseError(
      `The uploaded file is ${Math.round(htmlString.length / 1024 / 1024)}MB; Bluebook reports are well under 10MB.`,
    );
  }

  const { document: doc } = parseHTML(htmlString);

  // Title format: "MyPractice - SAT Practice 11 - February 21, 2026 - Details"
  const titleText = doc.title || '';
  const titleMatch = titleText.match(/MyPractice\s*-\s*(.+?)\s*-\s*(.+?)\s*-\s*Details/i);
  const testName = titleMatch ? titleMatch[1].trim() : 'Unknown Test';
  const testDate = titleMatch ? titleMatch[2].trim() : '';

  let questions = tryParseNewFormat(doc);
  if (!questions.length) questions = tryParseOldFormat(doc);

  if (!questions.length) {
    const tables = doc.querySelectorAll('table').length;
    const allRows = doc.querySelectorAll('tr').length;
    const dataTrRows = doc.querySelectorAll('tr[data-tr]').length;
    throw new BluebookParseError(
      `Could not read any questions from this file. Found ${tables} table(s), ` +
      `${allRows} row(s), ${dataTrRows} tagged row(s). Make sure this is a Bluebook ` +
      `"Details" export saved as HTML.`,
    );
  }

  const correctCounts = {
    rw: { m1: 0, m2: 0, total: 0 },
    math: { m1: 0, m2: 0, total: 0 },
  };
  for (const q of questions) {
    if (!q.isCorrect) continue;
    const bucket = q.subjectCode === 'RW' ? correctCounts.rw : correctCounts.math;
    bucket.total += 1;
    if (q.moduleNumber === 1) bucket.m1 += 1;
    else bucket.m2 += 1;
  }

  return { testName, testDate, reportDate: toIsoDate(testDate), questions, correctCounts };
}

/** module key -> ordinal -> {correct, chosen?}, the shape
 *  bluebook_submissions.responses stores and the validation trigger
 *  checksums against the declared per-module correct counts. */
export function toResponseVector(parsed: ParsedBluebookReport): ResponseVector {
  const vector: ResponseVector = {};
  for (const q of parsed.questions) {
    const key = moduleKey(q.subjectCode, q.moduleNumber);
    const bucket = (vector[key] ??= {});
    const entry: ResponseEntry = { correct: q.isCorrect };
    // Only carry the chosen answer when it's real. A synthesized
    // placeholder (see synthesizeStudentAnswer) would masquerade as
    // distractor data, and distractor data is the whole point of the
    // field.
    if (!q.isCorrect && q.studentAnswer && !q.synthesized) entry.chosen = q.studentAnswer;
    bucket[String(q.ordinal)] = entry;
  }
  return vector;
}

export function moduleKey(subject: BluebookSubject, moduleNumber: number): ModuleKey {
  return `${subject}${moduleNumber === 2 ? 2 : 1}` as ModuleKey;
}

/** Per-module correct/total counts, keyed "RW/1" style. */
export function computeModuleStats(parsed: ParsedBluebookReport) {
  const stats: Record<
    string,
    { subjectCode: BluebookSubject; moduleNumber: number; correct: number; total: number }
  > = {};
  for (const q of parsed.questions) {
    const key = `${q.subjectCode}/${q.moduleNumber}`;
    stats[key] ??= { subjectCode: q.subjectCode, moduleNumber: q.moduleNumber, correct: 0, total: 0 };
    stats[key].total += 1;
    if (q.isCorrect) stats[key].correct += 1;
  }
  return stats;
}

// ── Format A: per-row CSS classes ──────────────────────────────────

type Doc = ReturnType<typeof parseHTML>['document'];
// linkedom's element type varies by node kind; the parser only ever uses
// the DOM subset declared here.
/* eslint-disable @typescript-eslint/no-explicit-any */
type El = any;

function tryParseNewFormat(doc: Doc): ParsedQuestion[] {
  const rows = Array.from(doc.querySelectorAll('tr[data-tr]'));
  if (!rows.length) return [];

  const questions: ParsedQuestion[] = [];

  for (const row of rows as El[]) {
    const globalIndex = parseInt(row.getAttribute('data-tr'), 10);
    const classes: string = row.className || '';

    const isRW = classes.includes('reading-and-writing');
    const isMath = classes.includes('math');
    const section = isRW ? 'Reading and Writing' : isMath ? 'Math' : null;
    const subjectCode: BluebookSubject = isRW ? 'RW' : 'MATH';

    const moduleMatch = classes.match(/module-(\d+)/);
    const moduleNumber = moduleMatch && parseInt(moduleMatch[1], 10) === 2 ? 2 : 1;

    const cells = Array.from(row.querySelectorAll('th, td')) as El[];
    if (cells.length < 4) continue;

    const ordinal = parseInt(cells[0].textContent.trim(), 10);
    if (Number.isNaN(ordinal)) continue;

    const correctAnswer = extractTextContent(cells[2]);
    const domain = cells.length >= 6 ? cells[5].textContent.trim() : '';
    const { studentAnswer, isCorrect } = parseAnswerCell(cells[3]);

    questions.push(
      finishQuestion({
        globalIndex,
        ordinal,
        section: section ?? 'Math',
        subjectCode,
        moduleNumber,
        correctAnswer,
        studentAnswer,
        isCorrect,
        domain,
      }),
    );
  }

  return questions;
}

// ── Format B: section headings above plain tables ──────────────────

function tryParseOldFormat(doc: Doc): ParsedQuestion[] {
  const questions: ParsedQuestion[] = [];

  for (const table of Array.from(doc.querySelectorAll('table')) as El[]) {
    const sectionInfo = detectSectionFromContext(table);
    if (!sectionInfo) continue;

    for (const row of Array.from(table.querySelectorAll('tr')) as El[]) {
      const cells = Array.from(row.querySelectorAll('th, td')) as El[];
      if (cells.length < 4) continue;

      const ordinal = parseInt(cells[0].textContent.trim(), 10);
      if (Number.isNaN(ordinal)) continue;

      const { correctAnswer, studentAnswer, isCorrect, domain } = parseRowCells(cells);

      questions.push(
        finishQuestion({
          globalIndex: questions.length,
          ordinal,
          section: sectionInfo.section,
          subjectCode: sectionInfo.subjectCode,
          moduleNumber: sectionInfo.moduleNumber,
          correctAnswer,
          studentAnswer,
          isCorrect,
          domain: domain || '',
        }),
      );
    }
  }

  return questions;
}

function detectSectionFromContext(table: El) {
  const caption = table.querySelector('caption');
  if (caption) {
    const info = parseSectionText(caption.textContent);
    if (info) return info;
  }

  let el = table.previousElementSibling;
  let lookback = 5;
  while (el && lookback-- > 0) {
    const tag = String(el.tagName ?? '').toLowerCase();
    if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'div', 'p'].includes(tag)) {
      const info = parseSectionText(el.textContent);
      if (info) return info;
    }
    el = el.previousElementSibling;
  }

  const parent = table.parentElement;
  if (parent) {
    const info = parseSectionText(`${parent.className || ''} ${parent.id || ''}`);
    if (info) return info;
  }

  for (const attr of Array.from(table.attributes ?? []) as El[]) {
    const info = parseSectionText(attr.value);
    if (info) return info;
  }

  return null;
}

function parseSectionText(
  text: string | null | undefined,
): { section: string; subjectCode: BluebookSubject; moduleNumber: 1 | 2 } | null {
  if (!text) return null;
  const lower = text.toLowerCase();

  let section: string | null = null;
  let subjectCode: BluebookSubject | null = null;

  if (
    lower.includes('reading') || lower.includes('writing') || lower.includes('r&w') ||
    lower.includes('rw') || lower.includes('verbal') || lower.includes('english')
  ) {
    section = 'Reading and Writing';
    subjectCode = 'RW';
  } else if (lower.includes('math')) {
    section = 'Math';
    subjectCode = 'MATH';
  }

  if (!subjectCode || !section) return null;

  const modMatch = lower.match(/module\s*(\d+)/);
  const moduleNumber = modMatch && parseInt(modMatch[1], 10) === 2 ? 2 : 1;

  return { section, subjectCode, moduleNumber };
}

function parseRowCells(cells: El[]) {
  let correctAnswer = '';
  let studentAnswer = '';
  let isCorrect = false;
  let domain = '';

  const cellTexts = cells.map((c) => c.textContent.trim());

  for (let i = 1; i < cells.length; i++) {
    const text: string = cellTexts[i];
    const cell = cells[i];

    // The status-only variant yields an empty studentAnswer but still
    // carries isCorrect, so treat it as an answer-cell match — otherwise
    // the "previous cell holds the correct answer" inference never fires.
    if (cell.querySelector('p')) {
      const parsed = parseAnswerCell(cell);
      const isStatusOnly = /^(correct|incorrect|omitted)$/i.test(text);
      if (parsed.studentAnswer || isStatusOnly) {
        studentAnswer = parsed.studentAnswer;
        isCorrect = parsed.isCorrect;
        if (i > 1 && !correctAnswer) correctAnswer = extractTextContent(cells[i - 1]);
        continue;
      }
    }

    if (/^(correct|incorrect|omitted)$/i.test(text)) {
      isCorrect = /^correct$/i.test(text);
      if (i > 1 && !correctAnswer) correctAnswer = extractTextContent(cells[i - 1]);
      continue;
    }

    if (text.length > 15 && text.includes(' ')) {
      domain = text;
      continue;
    }
  }

  // Positional fallback for layouts the scan above didn't recognise.
  if (!correctAnswer && cells.length >= 4) {
    correctAnswer = extractTextContent(cells[2]);
    if (!studentAnswer) {
      const parts = cells[3].textContent.trim().split(';').map((s: string) => s.trim());
      studentAnswer = parts[0] || '';
      if (parts.length > 1) isCorrect = parts[1].toLowerCase() === 'correct';
    }
  }

  if (!domain && cells.length >= 6) domain = cells[5].textContent.trim();

  return { correctAnswer, studentAnswer, isCorrect, domain };
}

/**
 * Two known answer-cell variants:
 *   full   — <p class="correct|cb-red1-color">D; Correct</p>
 *   status — <p class="correct|cb-red1-color">Correct</p>
 * The status variant is what Bluebook emits when "show my answers" is
 * off on the report site.
 */
function parseAnswerCell(answerCell: El): { studentAnswer: string; isCorrect: boolean } {
  const answerP = answerCell.querySelector('p');
  const source = answerP ?? answerCell;
  const text: string = source.textContent.trim();

  let isCorrect: boolean = answerP
    ? answerP.classList.contains('correct')
    : /\bcorrect\b/.test(String(source.className || '').toLowerCase());
  let studentAnswer = '';

  if (/^(correct|incorrect|omitted)$/i.test(text)) {
    isCorrect = text.toLowerCase() === 'correct';
  } else if (text.includes(';')) {
    const parts = text.split(';').map((s: string) => s.trim());
    studentAnswer = parts[0] || '';
    if (!isCorrect) isCorrect = (parts[1] || '').toLowerCase() === 'correct';
  } else if (text) {
    studentAnswer = text;
  }

  return { studentAnswer, isCorrect };
}

function finishQuestion(
  q: Omit<ParsedQuestion, 'questionType' | 'synthesized'>,
): ParsedQuestion {
  const isMcq = /^[A-D]$/i.test(q.correctAnswer);
  let studentAnswer = q.studentAnswer;
  let synthesized = false;

  if (!studentAnswer && q.correctAnswer) {
    studentAnswer = synthesizeStudentAnswer(q.correctAnswer, q.isCorrect, isMcq, q.ordinal);
    synthesized = true;
  }

  return {
    ...q,
    studentAnswer,
    synthesized,
    questionType: isMcq ? 'mcq' : 'spr',
  };
}

/**
 * Stand in for a student answer the report didn't print.
 *
 * Correct rows mirror the correct answer — the only value both plausible
 * and consistent with isCorrect. Incorrect rows need something that
 * isn't the correct answer: for MCQ the next letter around the A–D
 * wheel, for SPR "0" (or "1" when the key is 0).
 *
 * The original picked the wrong-answer letter at random. That made
 * re-parsing the same stored artifact produce different bytes, which
 * defeats the point of keeping the artifact — flow B's cross-check and
 * any future re-parse both compare parse output against stored data.
 * Deriving it from the ordinal keeps the spread while staying
 * deterministic.
 *
 * Grading never sees this: callers take isCorrect from the parser and
 * this value only populates the display columns.
 */
function synthesizeStudentAnswer(
  correctAnswer: string,
  isCorrect: boolean,
  isMcq: boolean,
  ordinal: number,
): string {
  if (isCorrect) return correctAnswer;
  if (isMcq) {
    const letters = ['A', 'B', 'C', 'D'];
    const correctIdx = letters.indexOf(String(correctAnswer || '').toUpperCase());
    if (correctIdx === -1) return 'A';
    // Offset is 1..3, never 0, so the result is never the correct letter.
    const offset = 1 + (Math.abs(ordinal) % 3);
    return letters[(correctIdx + offset) % 4];
  }
  return String(correctAnswer || '').trim() === '0' ? '1' : '0';
}

function extractTextContent(cell: El): string {
  const div = cell.querySelector('div');
  return (div || cell).textContent.trim();
}

/** "February 21, 2026" -> "2026-02-21". Returns null for anything we
 *  can't read as a date, so report_date stays honestly empty. */
function toIsoDate(printed: string): string | null {
  if (!printed) return null;
  const ms = Date.parse(printed);
  if (Number.isNaN(ms)) return null;
  const d = new Date(ms);
  const iso = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
    d.getUTCDate(),
  ).padStart(2, '0')}`;
  return iso;
}
