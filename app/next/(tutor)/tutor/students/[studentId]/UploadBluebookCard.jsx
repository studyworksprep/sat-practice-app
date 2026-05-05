// Upload Bluebook practice-test results.
//
// The legacy implementation lived as a modal in app/teacher/shared.js
// and called /api/teacher/student/[studentId]/upload-bluebook. Same
// API endpoint here — the route already validates auth via
// requireServiceRole + can_view, so a Server Action wrapper would
// just relay the call. Keeping the fetch lets us preserve the
// file-parse-then-submit flow without round-tripping the parsed
// payload through a Server Action's serialization boundary.

'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import s from './StudentDetail.module.css';

export function UploadBluebookCard({ studentId }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <section className={s.card}>
      <div className={s.cardHeader}>
        <div className={s.sectionLabel}>Upload Bluebook results</div>
        <button
          type="button"
          className={s.cardHeaderLink}
          onClick={() => setOpen(true)}
        >
          + Upload
        </button>
      </div>
      {open && (
        <UploadModal
          studentId={studentId}
          onClose={() => setOpen(false)}
          onUploaded={() => { setOpen(false); router.refresh(); }}
        />
      )}
    </section>
  );
}

function UploadModal({ studentId, onClose, onUploaded }) {
  const [tests, setTests] = useState([]);
  const [testsLoading, setTestsLoading] = useState(true);
  const [selectedTestId, setSelectedTestId] = useState('');
  const [rwScore, setRwScore] = useState('');
  const [mathScore, setMathScore] = useState('');
  const [testDate, setTestDate] = useState('');
  const [parsed, setParsed] = useState(null);
  const [parseError, setParseError] = useState(null);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    fetch('/api/practice-tests')
      .then((r) => r.json())
      .then((d) => setTests(d.tests || []))
      .catch(() => setTests([]))
      .finally(() => setTestsLoading(false));
  }, []);

  const composite = (Number(rwScore) || 0) + (Number(mathScore) || 0);

  async function handleFileChange(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setParsed(null);
    setParseError(null);
    setResult(null);
    try {
      const text = await f.text();
      const { parseBluebookHtml } = await import('@/lib/parseBluebookHtml');
      const data = parseBluebookHtml(text);
      if (!data.questions.length) {
        setParseError('No questions could be extracted from this file.');
        return;
      }
      setParsed(data);
    } catch (err) {
      setParseError(err?.message ?? 'Failed to parse the HTML file');
    }
  }

  function onSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!selectedTestId) return setError('Select a practice test.');
    if (!rwScore || !mathScore) return setError('Enter both RW and Math scores.');
    const rw = parseInt(rwScore, 10);
    const math = parseInt(mathScore, 10);
    if (rw < 200 || rw > 800 || math < 200 || math > 800) {
      return setError('Scores must be between 200 and 800.');
    }

    startTransition(async () => {
      try {
        const res = await fetch(`/api/teacher/student/${studentId}/upload-bluebook`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            practice_test_id: selectedTestId,
            rw_score: rw,
            math_score: math,
            test_date: testDate || null,
            questions: parsed?.questions ?? null,
            correctCounts: parsed?.correctCounts ?? null,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data?.error ?? 'Upload failed');
          return;
        }
        setResult(data);
        onUploaded?.(data);
      } catch (err) {
        setError(err?.message ?? 'Upload failed');
      }
    });
  }

  return (
    <div className={s.modalOverlay} onClick={onClose} role="dialog" aria-modal="true">
      <div className={s.modal} onClick={(e) => e.stopPropagation()}>
        <div className={s.modalHeader}>
          <strong className={s.modalTitle}>Upload Bluebook results</strong>
          <button type="button" className={s.modalClose} onClick={onClose} aria-label="Close">✕</button>
        </div>
        {result ? (
          <div className={s.modalBody}>
            <div className={s.resultBlock}>
              <div className={s.resultComposite}>{result.composite_score}</div>
              <div className={s.resultLabel}>Composite</div>
              <div className={s.resultPair}>
                <span className={s.scorePillRw}>RW {result.rw_scaled}</span>
                <span className={s.scorePillMath}>Math {result.math_scaled}</span>
              </div>
              <div className={s.muted}>
                {result.questions_imported
                  ? `${result.questions_imported} questions imported`
                  : 'Score recorded (no question details)'}
              </div>
            </div>
            <div className={s.modalActions}>
              <button type="button" className={s.btnPrimary} onClick={onClose}>Done</button>
            </div>
          </div>
        ) : (
          <form onSubmit={onSubmit} className={s.modalBody}>
            <label className={s.field}>
              <span className={s.fieldLabel}>Practice test</span>
              <select
                value={selectedTestId}
                onChange={(e) => setSelectedTestId(e.target.value)}
                disabled={testsLoading}
                className={s.input}
              >
                <option value="">{testsLoading ? 'Loading…' : '— Select —'}</option>
                {tests.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </label>

            <label className={s.field}>
              <span className={s.fieldLabel}>
                Bluebook HTML <span className={s.muted}>— optional</span>
              </span>
              <input type="file" accept=".htm,.html" onChange={handleFileChange} className={s.input} />
              {!parsed && (
                <span className={s.muted}>
                  Skip to record scores only, without question-level details.
                </span>
              )}
            </label>

            {parseError && <p role="alert" className={s.error}>{parseError}</p>}

            {parsed && (
              <div className={s.parsedSummary}>
                <div className={s.parsedHead}>{parsed.testName}</div>
                {parsed.testDate && <div className={s.muted}>{parsed.testDate}</div>}
                <div className={s.parsedRow}>
                  <span>RW <strong>{parsed.correctCounts.rw.total}</strong> correct (M1 {parsed.correctCounts.rw.m1} · M2 {parsed.correctCounts.rw.m2})</span>
                  <span>Math <strong>{parsed.correctCounts.math.total}</strong> correct (M1 {parsed.correctCounts.math.m1} · M2 {parsed.correctCounts.math.m2})</span>
                </div>
              </div>
            )}

            <div className={s.fieldRow}>
              <label className={s.field}>
                <span className={s.fieldLabel}>R&W scaled score</span>
                <input
                  type="number"
                  min={200}
                  max={800}
                  step={10}
                  value={rwScore}
                  onChange={(e) => setRwScore(e.target.value)}
                  required
                  placeholder="200-800"
                  className={s.input}
                />
              </label>
              <label className={s.field}>
                <span className={s.fieldLabel}>Math scaled score</span>
                <input
                  type="number"
                  min={200}
                  max={800}
                  step={10}
                  value={mathScore}
                  onChange={(e) => setMathScore(e.target.value)}
                  required
                  placeholder="200-800"
                  className={s.input}
                />
              </label>
            </div>

            <label className={s.field}>
              <span className={s.fieldLabel}>
                Test date <span className={s.muted}>— optional</span>
              </span>
              <input
                type="date"
                value={testDate}
                onChange={(e) => setTestDate(e.target.value)}
                className={s.input}
              />
            </label>

            {rwScore && mathScore && (
              <div className={s.compositeRow}>
                Composite <strong>{composite}</strong>
              </div>
            )}

            {error && <p role="alert" className={s.error}>{error}</p>}

            <div className={s.modalActions}>
              <button type="button" className={s.btnSecondary} onClick={onClose} disabled={pending}>
                Cancel
              </button>
              <button type="submit" className={s.btnPrimary} disabled={pending}>
                {pending ? 'Uploading…' : 'Upload'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
