/**
 * Client-side parser for College Board Bluebook "MyPractice" HTML export files.
 *
 * Accepts the raw HTML string from a saved .htm file and returns structured
 * question-level data suitable for creating a practice test attempt record.
 *
 * Expected HTML structure (saved from mypractice.collegeboard.org):
 *   - Title tag: "MyPractice - SAT Practice NN - <date> - Details"
 *   - Table rows: <tr data-tr="0..N" class="table-row reading-and-writing module-1">
 *   - Cells: question#, section, correct answer, your answer+status, review btn, domain
 */

/**
 * @typedef {Object} ParsedQuestion
 * @property {number} globalIndex      - 0-based index across entire test
 * @property {number} ordinal          - 1-based question number within the module
 * @property {string} section          - "Reading and Writing" or "Math"
 * @property {string} subjectCode      - "RW" or "MATH"
 * @property {number} moduleNumber     - 1 or 2
 * @property {string} correctAnswer    - e.g. "A", "B", "C", "D", or numeric string
 * @property {string} studentAnswer    - the student's answer
 * @property {boolean} isCorrect       - whether the student got it right
 * @property {string} domain           - domain name from the Bluebook table
 * @property {string} questionType     - "mcq" or "spr" (student-produced response)
 */

/**
 * @typedef {Object} ParsedBluebookResult
 * @property {string} testName         - e.g. "SAT Practice 11"
 * @property {string} testDate         - e.g. "February 21, 2026"
 * @property {ParsedQuestion[]} questions
 * @property {{ rw: {m1: number, m2: number, total: number}, math: {m1: number, m2: number, total: number} }} correctCounts
 */

const SECTION_TO_SUBJECT = {
  'reading and writing': 'RW',
  'math': 'MATH',
};

/**
 * Parse a Bluebook HTML export file and return structured question data.
 * Supports both newer format (CSS classes on tr) and older format (section headers + plain rows).
 * @param {string} htmlString - raw contents of the .htm file
 * @returns {ParsedBluebookResult}
 */
export function parseBluebookHtml(htmlString) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, 'text/html');

  // Extract test name + date from <title>
  const titleText = doc.title || '';
  // Title format: "MyPractice - SAT Practice 11 - February 21, 2026 - Details"
  const titleMatch = titleText.match(/MyPractice\s*-\s*(.+?)\s*-\s*(.+?)\s*-\s*Details/i);
  const testName = titleMatch ? titleMatch[1].trim() : 'Unknown Test';
  const testDate = titleMatch ? titleMatch[2].trim() : '';

  // Try the newer format first (CSS classes on tr rows)
  let questions = tryParseNewFormat(doc);

  // If that yielded no questions, try the older format
  if (!questions.length) {
    questions = tryParseOldFormat(doc);
  }

  if (!questions.length) {
    // Gather diagnostic info to help debug
    const allRows = doc.querySelectorAll('tr');
    const dataTrRows = doc.querySelectorAll('tr[data-tr]');
    const tables = doc.querySelectorAll('table');
    throw new Error(
      `Could not parse any questions from this Bluebook HTML file. ` +
      `Found ${tables.length} table(s), ${allRows.length} row(s), ${dataTrRows.length} data-tr row(s). ` +
      `The file may use an unsupported format. Make sure this is a Bluebook "Details" export.`
    );
  }

  // Compute correct counts from parsed questions
  const correctCounts = {
    rw: { m1: 0, m2: 0, total: 0 },
    math: { m1: 0, m2: 0, total: 0 },
  };
  for (const q of questions) {
    if (q.isCorrect) {
      const countKey = q.subjectCode === 'RW' ? 'rw' : 'math';
      correctCounts[countKey].total += 1;
      if (q.moduleNumber === 1) correctCounts[countKey].m1 += 1;
      else correctCounts[countKey].m2 += 1;
    }
  }

  return { testName, testDate, questions, correctCounts };
}

/**
 * Parse newer Bluebook format: <tr data-tr="N" class="table-row reading-and-writing module-1">
 */
function tryParseNewFormat(doc) {
  const rows = doc.querySelectorAll('tr[data-tr]');
  if (!rows.length) return [];

  const questions = [];

  for (const row of rows) {
    const globalIndex = parseInt(row.getAttribute('data-tr'), 10);
    const classes = row.className || '';

    // Determine section and module from class names
    const isRW = classes.includes('reading-and-writing');
    const isMath = classes.includes('math');
    const section = isRW ? 'Reading and Writing' : isMath ? 'Math' : null;
    const subjectCode = isRW ? 'RW' : 'MATH';

    // Module from class: "module-1" or "module-2"
    const moduleMatch = classes.match(/module-(\d+)/);
    const moduleNumber = moduleMatch ? parseInt(moduleMatch[1], 10) : 1;

    // Extract cells
    const cells = row.querySelectorAll('th, td');
    if (cells.length < 4) continue;

    const ordinal = parseInt(cells[0].textContent.trim(), 10);
    if (isNaN(ordinal)) continue;

    const correctAnswer = extractTextContent(cells[2]);
    const answerCell = cells[3];
    const domainName = cells.length >= 6 ? cells[5].textContent.trim() : '';

    // Parse the answer cell
    let { studentAnswer, isCorrect } = parseAnswerCell(answerCell);

    // Determine question type
    const isMcq = /^[A-D]$/i.test(correctAnswer);
    const questionType = isMcq ? 'mcq' : 'spr';

    // Newer Bluebook reports (post-toggle) sometimes omit the student's
    // own answer and just show Correct/Incorrect. Synthesize a placeholder
    // so the downstream attempt row has a non-null option/text. The
    // upload endpoint trusts the parser's isCorrect verbatim, so the
    // synthesized value is purely cosmetic — it just needs to be
    // consistent with isCorrect.
    if (!studentAnswer && correctAnswer) {
      studentAnswer = synthesizeStudentAnswer(correctAnswer, isCorrect, isMcq);
    }

    questions.push({
      globalIndex,
      ordinal,
      section,
      subjectCode,
      moduleNumber,
      correctAnswer,
      studentAnswer,
      isCorrect,
      domain: domainName,
      questionType,
    });
  }

  return questions;
}

/**
 * Parse older Bluebook format where section/module info comes from section headers
 * or table groupings rather than CSS classes on each row.
 */
function tryParseOldFormat(doc) {
  const questions = [];
  const tables = doc.querySelectorAll('table');

  // Older format may use section headings (h2, h3, or caption) to indicate
  // which section and module the following table represents
  for (const table of tables) {
    // Look for section context from preceding headings or table caption
    const sectionInfo = detectSectionFromContext(table, doc);
    if (!sectionInfo) continue;

    const rows = table.querySelectorAll('tr');
    for (const row of rows) {
      const cells = row.querySelectorAll('th, td');
      // Skip header rows
      if (cells.length < 4) continue;
      const firstCellText = cells[0].textContent.trim();
      const ordinal = parseInt(firstCellText, 10);
      if (isNaN(ordinal)) continue;

      // Try to find correct answer and student answer in cells
      // Older formats may have: [#, question/section, correct answer, your answer, ...]
      // or: [#, correct answer, your answer, domain, ...]
      let { correctAnswer, studentAnswer, isCorrect, domain } = parseRowCells(cells);

      const isMcq = /^[A-D]$/i.test(correctAnswer);
      const questionType = isMcq ? 'mcq' : 'spr';

      // Same status-only variant as the newer format. See note in
      // tryParseNewFormat above.
      if (!studentAnswer && correctAnswer) {
        studentAnswer = synthesizeStudentAnswer(correctAnswer, isCorrect, isMcq);
      }

      questions.push({
        globalIndex: questions.length,
        ordinal,
        section: sectionInfo.section,
        subjectCode: sectionInfo.subjectCode,
        moduleNumber: sectionInfo.moduleNumber,
        correctAnswer,
        studentAnswer,
        isCorrect,
        domain: domain || '',
        questionType,
      });
    }
  }

  return questions;
}

/**
 * Detect section (RW/Math) and module number from table context.
 * Looks at preceding sibling headings, table caption, or data attributes.
 */
function detectSectionFromContext(table, doc) {
  // Check table caption
  const caption = table.querySelector('caption');
  if (caption) {
    const info = parseSectionText(caption.textContent);
    if (info) return info;
  }

  // Check preceding headings (walk backwards through siblings)
  let el = table.previousElementSibling;
  let maxLookback = 5;
  while (el && maxLookback-- > 0) {
    const tag = el.tagName?.toLowerCase();
    if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'div', 'p'].includes(tag)) {
      const info = parseSectionText(el.textContent);
      if (info) return info;
    }
    el = el.previousElementSibling;
  }

  // Check parent element for clues
  const parent = table.parentElement;
  if (parent) {
    const parentClasses = (parent.className || '').toLowerCase();
    const parentId = (parent.id || '').toLowerCase();
    const combined = parentClasses + ' ' + parentId;
    const info = parseSectionText(combined);
    if (info) return info;
  }

  // Check data attributes on the table itself
  for (const attr of table.attributes) {
    const info = parseSectionText(attr.value);
    if (info) return info;
  }

  return null;
}

/**
 * Parse section and module from a text string.
 */
function parseSectionText(text) {
  if (!text) return null;
  const lower = text.toLowerCase();

  let section = null;
  let subjectCode = null;

  if (lower.includes('reading') || lower.includes('writing') || lower.includes('r&w') || lower.includes('rw') || lower.includes('verbal') || lower.includes('english')) {
    section = 'Reading and Writing';
    subjectCode = 'RW';
  } else if (lower.includes('math')) {
    section = 'Math';
    subjectCode = 'MATH';
  }

  if (!subjectCode) return null;

  // Try to extract module number
  const modMatch = lower.match(/module\s*(\d+)/);
  const moduleNumber = modMatch ? parseInt(modMatch[1], 10) : 1;

  return { section, subjectCode, moduleNumber };
}

/**
 * Parse cells from a row to extract answer data.
 * Handles varying column layouts.
 */
function parseRowCells(cells) {
  // Strategy: look through cells for answer patterns
  let correctAnswer = '';
  let studentAnswer = '';
  let isCorrect = false;
  let domain = '';

  // Common layouts:
  // [#, section_label, correct_answer, student_answer, status?, domain?]
  // [#, correct_answer, student_answer, domain?]
  const cellTexts = Array.from(cells).map(c => c.textContent.trim());

  // Find cells that look like answers (single letter A-D, or short numeric)
  for (let i = 1; i < cells.length; i++) {
    const text = cellTexts[i];
    const cell = cells[i];

    // Check for answer cell with correct/incorrect indicators. Note
    // that the new "status-only" variant produces parsed.studentAnswer
    // === '' but still carries isCorrect via the cell's class. Treat
    // that as a legitimate answer-cell match so the "previous cell is
    // the correct answer" inference still fires.
    const answerP = cell.querySelector('p');
    if (answerP) {
      const parsed = parseAnswerCell(cell);
      const isStatusOnly = /^(correct|incorrect|omitted)$/i.test(text);
      if (parsed.studentAnswer || isStatusOnly) {
        studentAnswer = parsed.studentAnswer;
        isCorrect = parsed.isCorrect;
        if (i > 1 && !correctAnswer) {
          correctAnswer = extractTextContent(cells[i - 1]);
        }
        continue;
      }
    }

    // Status-only cell with no nested <p> — same shape, just plain text.
    if (/^(correct|incorrect|omitted)$/i.test(text)) {
      isCorrect = /^correct$/i.test(text);
      if (i > 1 && !correctAnswer) {
        correctAnswer = extractTextContent(cells[i - 1]);
      }
      continue;
    }

    // Domain-like text (longer, multiple words)
    if (text.length > 15 && text.includes(' ')) {
      domain = text;
      continue;
    }
  }

  // Fallback: if we didn't find answers via <p> elements, try positional
  if (!correctAnswer && cells.length >= 4) {
    correctAnswer = extractTextContent(cells[2]);
    if (!studentAnswer) {
      const answerText = cells[3].textContent.trim();
      const parts = answerText.split(';').map(s => s.trim());
      studentAnswer = parts[0] || '';
      if (parts.length > 1) {
        isCorrect = parts[1].toLowerCase() === 'correct';
      }
    }
  }

  if (!domain && cells.length >= 6) {
    domain = cells[5].textContent.trim();
  }

  return { correctAnswer, studentAnswer, isCorrect, domain };
}

/**
 * Parse the answer cell.
 *
 * Two known variants:
 *   Full   — <p class="correct|cb-red1-color">D; Correct</p>
 *   Status — <p class="correct|cb-red1-color">Correct</p>   (no student answer)
 *
 * The Status variant is what Bluebook produces when the "show my
 * answers" toggle is off on the report site. studentAnswer is left
 * empty here and synthesized by the caller from the correct answer.
 */
function parseAnswerCell(answerCell) {
  const answerP = answerCell.querySelector('p');
  const source = answerP ?? answerCell;
  let studentAnswer = '';
  const text = source.textContent.trim();
  const isCorrectFromClass = answerP
    ? answerP.classList.contains('correct')
    : /\bcorrect\b/.test((source.className || '').toLowerCase());

  let isCorrect = isCorrectFromClass;

  if (/^(correct|incorrect|omitted)$/i.test(text)) {
    // Status-only variant: just "Correct" or "Incorrect" in the cell.
    isCorrect = text.toLowerCase() === 'correct';
  } else if (text.includes(';')) {
    // Full variant: "D; Correct" or "8; Incorrect"
    const parts = text.split(';').map(s => s.trim());
    studentAnswer = parts[0] || '';
    if (!isCorrect) isCorrect = (parts[1] || '').toLowerCase() === 'correct';
  } else if (text) {
    // Single value, no status delimiter (rare) — treat as the answer.
    studentAnswer = text;
  }

  return { studentAnswer, isCorrect };
}

/**
 * Synthesize a placeholder studentAnswer when the HTML omitted it.
 *
 * For correct rows we mirror the correct answer (it's the only value
 * that's both plausible and consistent with isCorrect=true).
 *
 * For incorrect rows we need something that isn't the correct answer:
 *   MCQ → a random letter from A/B/C/D excluding the correct one
 *   SPR → "0" (or "1" if the correct answer happens to be 0), so the
 *         stored response_text is non-null and clearly not the truth
 *
 * The upload endpoint stores isCorrect from the parser verbatim
 * (app/api/teacher/student/[studentId]/upload-bluebook/route.js:319),
 * so the synthesized value never feeds grading — it only populates
 * attempts.selected_option_id / attempts.response_text for display.
 */
function synthesizeStudentAnswer(correctAnswer, isCorrect, isMcq) {
  if (isCorrect) return correctAnswer;
  if (isMcq) {
    const correctLetter = String(correctAnswer || '').toUpperCase();
    const choices = ['A', 'B', 'C', 'D'].filter((l) => l !== correctLetter);
    if (choices.length === 0) return 'A'; // defensive; shouldn't happen
    return choices[Math.floor(Math.random() * choices.length)];
  }
  const normalized = String(correctAnswer || '').trim();
  return normalized === '0' ? '1' : '0';
}

/**
 * Extract clean text content from a cell, stripping nested elements.
 */
function extractTextContent(cell) {
  const div = cell.querySelector('div');
  return (div || cell).textContent.trim();
}

/**
 * Compute module-level statistics from parsed questions.
 * Returns data shaped for the score_conversion lookup.
 */
export function computeModuleStats(parsed) {
  const stats = {};
  for (const q of parsed.questions) {
    const key = `${q.subjectCode}/${q.moduleNumber}`;
    if (!stats[key]) {
      stats[key] = { subjectCode: q.subjectCode, moduleNumber: q.moduleNumber, correct: 0, total: 0 };
    }
    stats[key].total += 1;
    if (q.isCorrect) stats[key].correct += 1;
  }
  return stats;
}
