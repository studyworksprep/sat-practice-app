/**
 * CSV export utility for practice data.
 * Generates and downloads CSV files from arrays of data objects.
 */

/**
 * Escape a value for CSV (handles commas, quotes, newlines).
 */
function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

/**
 * Convert an array of objects to a CSV string.
 * @param {Array} rows - Array of objects
 * @param {Array} [columns] - Column definitions: [{ key, label }] or array of strings.
 *   If not provided, columns are inferred from the first row's keys.
 * @returns {string} CSV string
 */
export function toCsv(rows, columns) {
  if (!rows || rows.length === 0) return '';

  const cols = columns
    ? columns.map((c) => (typeof c === 'string' ? { key: c, label: c } : c))
    : Object.keys(rows[0]).map((k) => ({ key: k, label: k }));

  const header = cols.map((c) => csvEscape(c.label)).join(',');
  const lines = rows.map((row) =>
    cols.map((c) => csvEscape(row[c.key])).join(',')
  );

  return [header, ...lines].join('\n');
}

/**
 * Trigger a CSV file download in the browser.
 * @param {string} csvContent - The CSV string
 * @param {string} [filename='export.csv'] - The filename
 */
export function downloadCsv(csvContent, filename = 'export.csv') {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();

  // Cleanup
  setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 100);
}

/**
 * Export practice session data as CSV.
 * @param {Array} sessions - Array of session objects from the dashboard API
 * @param {string} [filename] - Optional filename
 */
export function exportPracticeSessions(sessions, filename) {
  const rows = [];

  for (const session of sessions) {
    for (const q of session.questions || []) {
      rows.push({
        session_date: session.startedAt || '',
        question_id: q.question_id || '',
        question_key: q.question_key || '',
        domain: q.domain_name || '',
        skill: q.skill_name || '',
        difficulty: q.difficulty ?? '',
        is_correct: q.is_correct ? 'Yes' : 'No',
        time_spent_ms: q.time_spent_ms ?? '',
      });
    }
  }

  const columns = [
    { key: 'session_date', label: 'Session Date' },
    { key: 'question_id', label: 'Question ID' },
    { key: 'question_key', label: 'Question Key' },
    { key: 'domain', label: 'Domain' },
    { key: 'skill', label: 'Skill' },
    { key: 'difficulty', label: 'Difficulty' },
    { key: 'is_correct', label: 'Correct' },
    { key: 'time_spent_ms', label: 'Time (ms)' },
  ];

  const csv = toCsv(rows, columns);
  downloadCsv(csv, filename || `sat-practice-${new Date().toISOString().slice(0, 10)}.csv`);
}

/**
 * Export test scores as CSV.
 * @param {Array} testScores - Array of test score objects from the dashboard API
 * @param {string} [filename] - Optional filename
 */
export function exportTestScores(testScores, filename) {
  const rows = testScores.map((ts) => {
    const row = {
      test_name: ts.test_name || '',
      date: ts.finished_at || '',
      composite: ts.composite ?? '',
    };
    if (ts.sections) {
      for (const [subj, s] of Object.entries(ts.sections)) {
        row[`${subj}_scaled`] = s.scaled ?? '';
        row[`${subj}_correct`] = s.correct ?? '';
      }
    }
    return row;
  });

  const csv = toCsv(rows);
  downloadCsv(csv, filename || `sat-test-scores-${new Date().toISOString().slice(0, 10)}.csv`);
}

/**
 * Export domain/topic performance stats as CSV.
 * @param {Array} domainStats - Array of { domain_name, correct, attempted }
 * @param {Array} topicStats - Array of { domain_name, skill_name, correct, attempted }
 * @param {string} [filename] - Optional filename
 */
export function exportPerformanceStats(domainStats, topicStats, filename) {
  const rows = [];

  for (const d of domainStats) {
    rows.push({
      level: 'Domain',
      domain: d.domain_name || '',
      skill: '',
      correct: d.correct ?? 0,
      attempted: d.attempted ?? 0,
      accuracy: d.attempted > 0 ? Math.round((d.correct / d.attempted) * 100) + '%' : '',
    });

    const topics = topicStats.filter((t) => t.domain_name === d.domain_name);
    for (const t of topics) {
      rows.push({
        level: 'Topic',
        domain: d.domain_name || '',
        skill: t.skill_name || '',
        correct: t.correct ?? 0,
        attempted: t.attempted ?? 0,
        accuracy: t.attempted > 0 ? Math.round((t.correct / t.attempted) * 100) + '%' : '',
      });
    }
  }

  const columns = [
    { key: 'level', label: 'Level' },
    { key: 'domain', label: 'Domain' },
    { key: 'skill', label: 'Skill' },
    { key: 'correct', label: 'Correct' },
    { key: 'attempted', label: 'Attempted' },
    { key: 'accuracy', label: 'Accuracy' },
  ];

  const csv = toCsv(rows, columns);
  downloadCsv(csv, filename || `sat-performance-${new Date().toISOString().slice(0, 10)}.csv`);
}
