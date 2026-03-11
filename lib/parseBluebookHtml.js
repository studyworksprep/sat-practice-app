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

  // Find all question rows: <tr data-tr="N" class="table-row ...">
  const rows = doc.querySelectorAll('tr[data-tr]');
  if (!rows.length) {
    throw new Error('No question rows found in the HTML file. Make sure this is a Bluebook "Details" export.');
  }

  const questions = [];
  const correctCounts = {
    rw: { m1: 0, m2: 0, total: 0 },
    math: { m1: 0, m2: 0, total: 0 },
  };

  // Track module numbering: when section changes or question# resets, it's a new module
  let prevSection = null;
  let moduleNumber = 0;

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
    moduleNumber = moduleMatch ? parseInt(moduleMatch[1], 10) : 1;

    // Extract cells
    const cells = row.querySelectorAll('th, td');
    if (cells.length < 6) continue;

    const ordinal = parseInt(cells[0].textContent.trim(), 10);
    const correctAnswer = extractTextContent(cells[2]);
    const answerCell = cells[3];
    const domainName = cells[5].textContent.trim();

    // Parse the answer cell: <p class="correct|cb-red1-color">ANSWER; Correct|Incorrect</p>
    const answerP = answerCell.querySelector('p');
    let studentAnswer = '';
    let isCorrect = false;

    if (answerP) {
      const answerText = answerP.textContent.trim();
      // Format: "D; Correct" or "D; Incorrect" or "8; Correct"
      const parts = answerText.split(';').map(s => s.trim());
      studentAnswer = parts[0] || '';
      isCorrect = answerP.classList.contains('correct') ||
                  (parts[1] || '').toLowerCase() === 'correct';
    }

    // Determine question type: MCQ if answer is A-D, otherwise SPR
    const isMcq = /^[A-D]$/i.test(correctAnswer);
    const questionType = isMcq ? 'mcq' : 'spr';

    // Track correct counts
    const countKey = isRW ? 'rw' : 'math';
    if (isCorrect) {
      correctCounts[countKey].total += 1;
      if (moduleNumber === 1) correctCounts[countKey].m1 += 1;
      else correctCounts[countKey].m2 += 1;
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

  return { testName, testDate, questions, correctCounts };
}

/**
 * Extract clean text content from a cell, stripping nested elements.
 */
function extractTextContent(cell) {
  // The correct answer cell may have <div>A</div> or just text
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
