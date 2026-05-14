// Client island for the (form, section) editor. Two paths share
// the same upsert action:
//   - Inline table: each row is (raw_score, scaled_score). Add
//     rows, edit cells, save → POSTs the full array.
//   - CSV paste: textarea, parse client-side into the same array
//     shape, save same way. Errors highlight which line failed
//     parsing so the admin can fix it without re-pasting.
//
// Both submit-paths go through `upsertConversionRows` on the
// server, which validates + bulk-upserts via the
// (source_test, section, raw_score) primary key.

'use client';

import { useMemo, useState, useTransition } from 'react';
import {
  upsertConversionRows,
  deleteConversionTable,
} from './actions';
import s from './ScoreConversion.module.css';

const NEW_ROW = { raw_score: '', scaled_score: '' };

export function ConversionEditor({ sourceTest, section, sectionLabel, initialRows }) {
  // Working copy of the table. Each entry is the string form of
  // both fields so partial input ("12.") renders without trying
  // to coerce until save time.
  const [tableRows, setTableRows] = useState(() =>
    (initialRows ?? []).map((r) => ({
      raw_score: String(r.raw_score),
      scaled_score: String(r.scaled_score),
    })),
  );
  const [csv, setCsv] = useState('');
  const [csvError, setCsvError] = useState(null);
  const [error, setError] = useState(null);
  const [okMsg, setOkMsg] = useState(null);
  const [pending, startTransition] = useTransition();
  const [deletePending, startDelete] = useTransition();

  function updateCell(idx, field, value) {
    setTableRows((prev) => {
      const next = prev.slice();
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  }

  function addRow() {
    setTableRows((prev) => [...prev, { ...NEW_ROW }]);
  }

  function removeRow(idx) {
    setTableRows((prev) => prev.filter((_, i) => i !== idx));
  }

  // Build the submit payload from the working table. Strict
  // validation here mirrors the server action so the admin gets
  // a fast inline error rather than a round-trip.
  const validation = useMemo(() => {
    const rows = [];
    const seen = new Set();
    for (let i = 0; i < tableRows.length; i += 1) {
      const r = tableRows[i];
      const rawStr = (r.raw_score ?? '').toString().trim();
      const scaledStr = (r.scaled_score ?? '').toString().trim();
      if (!rawStr && !scaledStr) continue; // blank line — skipped
      const raw = Number(rawStr);
      const scaled = Number(scaledStr);
      if (!Number.isInteger(raw) || raw < 0 || raw > 100) {
        return { ok: false, error: `Row ${i + 1}: raw_score must be 0–100` };
      }
      if (!Number.isInteger(scaled) || scaled < 1 || scaled > 36) {
        return { ok: false, error: `Row ${i + 1}: scaled_score must be 1–36` };
      }
      if (seen.has(raw)) {
        return { ok: false, error: `Row ${i + 1}: raw_score ${raw} appears twice` };
      }
      seen.add(raw);
      rows.push({ raw_score: raw, scaled_score: scaled });
    }
    return { ok: true, rows };
  }, [tableRows]);

  async function saveTable() {
    setError(null);
    setOkMsg(null);
    if (!validation.ok) {
      setError(validation.error);
      return;
    }
    if (validation.rows.length === 0) {
      setError('Nothing to save — table is empty.');
      return;
    }
    const fd = new FormData();
    fd.set('source_test', sourceTest);
    fd.set('section', section);
    fd.set('rows', JSON.stringify(validation.rows));
    startTransition(async () => {
      const res = await upsertConversionRows(null, fd);
      if (res && res.ok) {
        setOkMsg(`Saved ${res.upserted} row${res.upserted === 1 ? '' : 's'}.`);
      } else {
        setError(res?.error ?? 'Save failed');
      }
    });
  }

  function applyCsv() {
    setCsvError(null);
    setError(null);
    setOkMsg(null);
    const lines = csv
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
    if (lines.length === 0) {
      setCsvError('Paste CSV first.');
      return;
    }
    const parsed = [];
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      // Skip a header line ("raw_score,scaled_score" or similar).
      if (i === 0 && /[a-zA-Z]/.test(line)) continue;
      const parts = line.split(/[\s,]+/).filter(Boolean);
      if (parts.length < 2) {
        setCsvError(`Line ${i + 1}: expected "raw, scaled", got "${line}"`);
        return;
      }
      parsed.push({
        raw_score: String(parts[0]),
        scaled_score: String(parts[1]),
      });
    }
    // Replace the working table outright — the CSV is treated as
    // the source of truth. The admin can still cell-edit + Save
    // afterwards, but the typical flow is upload-then-save.
    setTableRows(parsed);
    setCsv('');
  }

  async function clearTable() {
    if (!window.confirm(`Delete every ${sectionLabel} row for ${sourceTest}? This can't be undone.`)) return;
    setError(null);
    setOkMsg(null);
    const fd = new FormData();
    fd.set('source_test', sourceTest);
    fd.set('section', section);
    startDelete(async () => {
      const res = await deleteConversionTable(null, fd);
      if (res && res.ok) {
        setTableRows([]);
        setOkMsg('Table cleared.');
      } else {
        setError(res?.error ?? 'Delete failed');
      }
    });
  }

  return (
    <section className={s.editor}>
      <div className={s.editorHeader}>
        <div>
          <div className={s.editorTitle}>{sectionLabel} · {sourceTest}</div>
          <div className={s.editorHint}>
            {validation.ok
              ? `${validation.rows.length} valid row${validation.rows.length === 1 ? '' : 's'} ready to save.`
              : <span className={s.editorErr}>{validation.error}</span>}
          </div>
        </div>
        <div className={s.editorActions}>
          <button
            type="button"
            className={s.btnSecondary}
            onClick={clearTable}
            disabled={deletePending || tableRows.length === 0}
            title="Wipe the saved rows for this (form, section)"
          >
            {deletePending ? 'Deleting…' : 'Clear table'}
          </button>
          <button
            type="button"
            className={s.btnPrimary}
            onClick={saveTable}
            disabled={pending || !validation.ok}
          >
            {pending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <div className={s.tableWrap}>
        <table className={s.table}>
          <thead>
            <tr>
              <th className={s.thNum}>Raw correct</th>
              <th className={s.thNum}>Scaled (1–36)</th>
              <th className={s.thAction}></th>
            </tr>
          </thead>
          <tbody>
            {tableRows.length === 0 ? (
              <tr>
                <td colSpan={3} className={s.emptyRow}>
                  No rows yet. Click <strong>Add row</strong> below
                  or paste a CSV.
                </td>
              </tr>
            ) : (
              tableRows.map((row, i) => (
                <tr key={i}>
                  <td className={s.tdNum}>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      value={row.raw_score}
                      onChange={(e) => updateCell(i, 'raw_score', e.target.value)}
                      className={s.cellInput}
                    />
                  </td>
                  <td className={s.tdNum}>
                    <input
                      type="number"
                      min={1}
                      max={36}
                      step={1}
                      value={row.scaled_score}
                      onChange={(e) => updateCell(i, 'scaled_score', e.target.value)}
                      className={s.cellInput}
                    />
                  </td>
                  <td className={s.tdAction}>
                    <button
                      type="button"
                      onClick={() => removeRow(i)}
                      className={s.rowDelete}
                      aria-label={`Delete row ${i + 1}`}
                      title="Delete row"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className={s.addRowBar}>
        <button type="button" onClick={addRow} className={s.btnGhost}>
          + Add row
        </button>
      </div>

      <details className={s.csvBlock}>
        <summary className={s.csvSummary}>Paste a CSV instead</summary>
        <p className={s.csvHint}>
          Two columns: <code>raw_score, scaled_score</code>. Header
          row optional. One row per line. Comments (<code>#</code>)
          and blank lines are ignored.
        </p>
        <textarea
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          className={s.csvTextarea}
          rows={8}
          placeholder={`# Math · ACT 2024-Sep\n0, 1\n1, 1\n2, 3\n...`}
        />
        <div className={s.csvActions}>
          <button type="button" className={s.btnSecondary} onClick={applyCsv}>
            Load into table
          </button>
          {csvError && <span className={s.csvErr}>{csvError}</span>}
        </div>
      </details>

      {error && <div role="alert" className={s.banner}>{error}</div>}
      {okMsg && <div role="status" className={s.bannerOk}>{okMsg}</div>}
    </section>
  );
}
