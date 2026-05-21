'use client';

import { useState } from 'react';
// parseBluebookHtml is a JS module from the legacy tree; it parses
// `.htm` exports into { testName, testDate, questions, correctCounts }.
// Loaded lazily inside the change handler so the page itself stays
// server-rendered and the parser bundle only loads when needed.
import s from '../../forms.module.css';
import btn from '@/lib/ui/Button.module.css';

interface StudentOption { id: string; label: string }
interface TestOption    { id: string; code: string; name: string }

interface RowStatus {
  kind: 'idle' | 'uploading' | 'ok' | 'error';
  message?: string;
  composite?: number;
}

interface Row {
  key: number;
  studentId: string;
  testId: string;
  rwScore: string;
  mathScore: string;
  file: File | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parsed: any | null;
  parseError: string | null;
  status: RowStatus;
}

function emptyRow(key: number, defaultStudentId: string): Row {
  return {
    key,
    studentId: defaultStudentId,
    testId: '',
    rwScore: '',
    mathScore: '',
    file: null,
    parsed: null,
    parseError: null,
    status: { kind: 'idle' },
  };
}

export function BluebookBatchInteractive({
  students,
  tests,
  defaultStudentId,
}: {
  students: StudentOption[];
  tests: TestOption[];
  defaultStudentId: string;
}) {
  const [rows, setRows] = useState<Row[]>([
    emptyRow(0, defaultStudentId),
    emptyRow(1, defaultStudentId),
    emptyRow(2, defaultStudentId),
  ]);
  const [nextKey, setNextKey] = useState(3);
  const [submitting, setSubmitting] = useState(false);

  function updateRow(key: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((rs) => [...rs, emptyRow(nextKey, defaultStudentId)]);
    setNextKey((k) => k + 1);
  }

  function removeRow(key: number) {
    setRows((rs) => (rs.length === 1 ? rs : rs.filter((r) => r.key !== key)));
  }

  async function handleFile(key: number, file: File | null) {
    if (!file) {
      updateRow(key, { file: null, parsed: null, parseError: null });
      return;
    }
    updateRow(key, { file, parsed: null, parseError: null, status: { kind: 'idle' } });
    try {
      const text = await file.text();
      const { parseBluebookHtml } = await import('@/lib/parseBluebookHtml');
      const data = parseBluebookHtml(text);
      if (!data.questions.length) {
        updateRow(key, {
          parseError:
            'File parsed but no questions found. Make sure this is a Bluebook "Details" export.',
        });
        return;
      }
      updateRow(key, { parsed: data, parseError: null });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      updateRow(key, { parseError: msg || 'Could not parse the HTML file' });
    }
  }

  function rowIsReady(r: Row): boolean {
    if (!r.studentId || !r.testId) return false;
    if (!r.rwScore || !r.mathScore) return false;
    const rw = Number(r.rwScore);
    const m  = Number(r.mathScore);
    if (!Number.isFinite(rw) || rw < 200 || rw > 800) return false;
    if (!Number.isFinite(m)  || m  < 200 || m  > 800) return false;
    // File is optional — score-only uploads are allowed by the endpoint.
    if (r.file && (!r.parsed || r.parseError)) return false;
    return true;
  }

  async function submitRow(r: Row): Promise<void> {
    updateRow(r.key, { status: { kind: 'uploading' } });
    try {
      const res = await fetch(`/api/teacher/student/${r.studentId}/upload-bluebook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          practice_test_id: r.testId,
          rw_score: Number(r.rwScore),
          math_score: Number(r.mathScore),
          test_date: null,
          questions: r.parsed?.questions ?? null,
          correctCounts: r.parsed?.correctCounts ?? null,
        }),
      });
      // Read the body as text first — the upload endpoint sometimes
      // returns an HTML error page (Next.js default 500 page) when the
      // handler throws an unexpected exception. Trying JSON.parse on
      // HTML produces a confusing "Unexpected token '<'" error; this
      // path surfaces the actual response so the cause is visible.
      const text = await res.text();
      let data: { composite_score?: number; questions_imported?: number; error?: string } = {};
      try { data = text ? JSON.parse(text) : {}; } catch { /* not JSON */ }
      if (!res.ok) {
        const msg = data.error
          || `Upload failed (HTTP ${res.status})${text && !text.startsWith('{') ? ` — server returned ${text.slice(0, 200).replace(/\s+/g, ' ')}` : ''}`;
        throw new Error(msg);
      }
      updateRow(r.key, {
        status: {
          kind: 'ok',
          composite: data.composite_score,
          message: data.questions_imported ? `${data.questions_imported} qs imported` : 'score recorded',
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      updateRow(r.key, { status: { kind: 'error', message: msg } });
    }
  }

  async function uploadAll() {
    const ready = rows.filter(rowIsReady).filter((r) => r.status.kind !== 'ok');
    if (ready.length === 0) return;
    setSubmitting(true);
    // Fire in parallel — each row writes to its own attempt, so no
    // ordering constraint. The endpoint is idempotent on the
    // score_conversion side via (test, section, m1, m2) uniqueness.
    await Promise.all(ready.map(submitRow));
    setSubmitting(false);
  }

  const totalReady = rows.filter(rowIsReady).filter((r) => r.status.kind !== 'ok').length;

  return (
    <section className={s.form} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {rows.map((r, idx) => (
        <RowCard
          key={r.key}
          row={r}
          idx={idx}
          students={students}
          tests={tests}
          onChange={(patch) => updateRow(r.key, patch)}
          onFile={(file) => handleFile(r.key, file)}
          onRemove={() => removeRow(r.key)}
          canRemove={rows.length > 1}
        />
      ))}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          type="button"
          className={`${btn.base} ${btn.md} ${btn.secondary}`}
          onClick={addRow}
          disabled={submitting}
        >
          + Add row
        </button>
        <button
          type="button"
          className={`${btn.base} ${btn.md} ${btn.primary}`}
          onClick={uploadAll}
          disabled={submitting || totalReady === 0}
        >
          {submitting ? 'Uploading…' : `Upload ${totalReady} row${totalReady === 1 ? '' : 's'}`}
        </button>
      </div>
    </section>
  );
}

function RowCard({
  row, idx, students, tests, onChange, onFile, onRemove, canRemove,
}: {
  row: Row;
  idx: number;
  students: StudentOption[];
  tests: TestOption[];
  onChange: (patch: Partial<Row>) => void;
  onFile: (file: File | null) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const composite =
    row.rwScore && row.mathScore
      ? (Number(row.rwScore) || 0) + (Number(row.mathScore) || 0)
      : null;
  const status = row.status;

  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: 12,
        background: 'var(--card)',
        display: 'grid',
        gridTemplateColumns: 'auto 1fr',
        gap: 12,
      }}
    >
      <div
        style={{
          fontSize: 12,
          color: 'var(--fg3)',
          fontWeight: 600,
          paddingTop: 4,
        }}
      >
        {`#${idx + 1}`}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <label className={s.label}>
            <span className={s.labelText}>Student</span>
            <select
              className={s.select}
              value={row.studentId}
              onChange={(e) => onChange({ studentId: e.target.value })}
            >
              <option value="">— Select student —</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </label>

          <label className={s.label}>
            <span className={s.labelText}>Practice test</span>
            <select
              className={s.select}
              value={row.testId}
              onChange={(e) => onChange({ testId: e.target.value })}
            >
              <option value="">— Select test —</option>
              {tests.map((t) => (
                <option key={t.id} value={t.id}>{t.code ? `${t.code} — ${t.name}` : t.name}</option>
              ))}
            </select>
          </label>
        </div>

        <label className={s.label}>
          <span className={s.labelText}>
            Bluebook HTML file{' '}
            <span className={s.muted}>(optional — leave blank for score-only)</span>
          </span>
          <input
            type="file"
            accept=".htm,.html"
            onChange={(e) => onFile(e.target.files?.[0] ?? null)}
            style={{ fontSize: 13 }}
          />
          {row.parseError && (
            <span className={s.err} style={{ marginTop: 4 }}>{row.parseError}</span>
          )}
          {row.parsed && (
            <span className={s.muted} style={{ marginTop: 4 }}>
              Parsed {row.parsed.questions.length} questions
              {' · '}
              RW {row.parsed.correctCounts.rw.total} correct (M1 {row.parsed.correctCounts.rw.m1} / M2 {row.parsed.correctCounts.rw.m2})
              {' · '}
              Math {row.parsed.correctCounts.math.total} correct (M1 {row.parsed.correctCounts.math.m1} / M2 {row.parsed.correctCounts.math.m2})
            </span>
          )}
        </label>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto auto', gap: 8, alignItems: 'end' }}>
          <label className={s.label}>
            <span className={s.labelText}>RW scaled (200–800)</span>
            <input
              type="number"
              min={200}
              max={800}
              step={10}
              value={row.rwScore}
              onChange={(e) => onChange({ rwScore: e.target.value })}
              className={s.input}
            />
          </label>
          <label className={s.label}>
            <span className={s.labelText}>Math scaled (200–800)</span>
            <input
              type="number"
              min={200}
              max={800}
              step={10}
              value={row.mathScore}
              onChange={(e) => onChange({ mathScore: e.target.value })}
              className={s.input}
            />
          </label>
          <div style={{ fontSize: 13, color: 'var(--fg3)', paddingBottom: 8 }}>
            {composite != null ? `Composite ${composite}` : ''}
          </div>
          {canRemove && (
            <button
              type="button"
              className={`${btn.base} ${btn.sm} ${btn.remove}`}
              onClick={onRemove}
              disabled={status.kind === 'uploading'}
            >
              Remove
            </button>
          )}
        </div>

        {status.kind === 'uploading' && (
          <span className={s.muted}>Uploading…</span>
        )}
        {status.kind === 'ok' && (
          <span className={s.ok}>
            ✓ Saved · Composite {status.composite} · {status.message}
          </span>
        )}
        {status.kind === 'error' && (
          <span className={s.err}>Error: {status.message}</span>
        )}
      </div>
    </div>
  );
}
