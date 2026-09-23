// CSV import / export panel for unit syllabi. The owner drafts
// syllabi in a spreadsheet first (docs/foundations-and-question-
// patterns.md §7.4), so the file is the primary authoring path and the
// per-unit editor is for touch-ups.
//
// Replace-per-unit semantics: every unit the file names gets its
// syllabus replaced by the file's rows; unnamed units are untouched.
// The dry run below states exactly that per unit, and the server
// re-parses and re-plans against rows it reads itself.

'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/lib/ui/Button';
import { Table, Th, Td } from '@/lib/ui/Table';
import { toCsv, downloadCsv } from '@/lib/exportCsv';
import {
  SYLLABUS_CSV_COLUMNS,
  SYLLABUS_EXPORT_COLUMNS,
  parseSyllabusCsv,
  planSyllabusImport,
  syllabusCsvTemplate,
  syllabusExportRows,
  type ExportableStep,
  type LessonRef,
  type PatternRef,
  type UnitRef,
} from '@/lib/admin/unitSyllabusCsv';
import { importUnitSyllabi } from './syllabus-actions';
import f from '../../../forms.module.css';
import a from '../../../admin.module.css';

const MAX_PREVIEW_UNITS = 12;

export function SyllabusImportPanel({
  units,
  lessons,
  patterns,
  existingCounts,
  exportSteps,
}: {
  units: UnitRef[];
  lessons: LessonRef[];
  patterns: PatternRef[];
  existingCounts: Record<string, number>;
  exportSteps: ExportableStep[];
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [readError, setReadError] = useState<string | null>(null);

  const plan = useMemo(() => {
    if (!csv.trim()) return null;
    return planSyllabusImport(parseSyllabusCsv(csv), {
      units,
      lessons,
      patterns,
      existingCounts: new Map(Object.entries(existingCounts)),
    });
  }, [csv, units, lessons, patterns, existingCounts]);

  async function handleFile(file: File | undefined) {
    setNotice(null);
    setReadError(null);
    if (!file) return;
    try {
      setCsv(await file.text());
      setFileName(file.name);
    } catch {
      setReadError('Could not read that file. Save it as CSV and try again.');
    }
  }

  function handleImport() {
    setNotice(null);
    startTransition(async () => {
      const res = await importUnitSyllabi({ csv });
      if (!res.ok) {
        setNotice({ kind: 'err', text: res.error });
        return;
      }
      const { unitsReplaced, stepsWritten, issues } = res.data;
      setNotice({
        kind: unitsReplaced === 0 ? 'err' : 'ok',
        text: `Import finished — ${unitsReplaced} unit${unitsReplaced === 1 ? '' : 's'} replaced, ${stepsWritten} step${stepsWritten === 1 ? '' : 's'} written${
          issues.length > 0 ? `, ${issues.length} issue${issues.length === 1 ? '' : 's'}` : ''
        }.`,
      });
      if (unitsReplaced > 0) {
        setCsv('');
        setFileName(null);
        if (fileRef.current) fileRef.current.value = '';
        router.refresh();
      }
    });
  }

  function handleExport() {
    downloadCsv(toCsv(syllabusExportRows(exportSteps), [...SYLLABUS_EXPORT_COLUMNS]), 'unit-syllabi.csv');
  }

  return (
    <section className={a.section}>
      <div style={S.head}>
        <h2 className={a.h2}>Import from a spreadsheet</h2>
        <Button size="sm" variant="secondary" onClick={() => setOpen((v) => !v)}>
          {open ? 'Close' : 'Open importer'}
        </Button>
      </div>
      {!open && (
        <p className={f.muted} style={{ margin: 0 }}>
          Draft syllabi in a sheet (one row per step), upload the CSV, and review the per-unit
          replacement before anything is written. Export the live syllabi to edit and re-import.
        </p>
      )}
      {open && (
        <>
          <h3 className={a.sectionLabel}>Columns</h3>
          <Table style={{ fontSize: '0.82rem', marginBottom: 'var(--s3, 1rem)' }}>
            <thead>
              <tr>
                <Th>Column</Th>
                <Th>Required</Th>
                <Th>What goes in it</Th>
              </tr>
            </thead>
            <tbody>
              {SYLLABUS_CSV_COLUMNS.map((col) => (
                <tr key={col.key}>
                  <Td style={{ fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{col.key}</Td>
                  <Td>{col.required ? 'yes' : 'no'}</Td>
                  <Td className={f.tdMuted}>{col.help}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <p className={f.formHint}>
            One row per step, grouped by unit in teaching order. Every unit named in the file has its
            whole syllabus replaced; units not in the file are untouched. Header aliases are accepted
            (<code>skill</code>, <code>type</code>, <code>title</code>, <code>count</code>, <code>order</code>);
            tab-separated paste works.
          </p>
          <div className={f.actions} style={{ marginTop: 'var(--s2, 0.5rem)' }}>
            <Button size="sm" variant="secondary" onClick={() => downloadCsv(syllabusCsvTemplate(), 'unit-syllabi-template.csv')}>
              Download template
            </Button>{' '}
            <Button size="sm" variant="secondary" onClick={handleExport} disabled={exportSteps.length === 0}>
              Export current syllabi ({exportSteps.length} step{exportSteps.length === 1 ? '' : 's'})
            </Button>
          </div>
          <hr className={f.divider} />
          <label className={f.label}>
            <span className={f.labelText}>CSV file</span>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
              onChange={(e) => handleFile(e.target.files?.[0])}
              disabled={pending}
            />
          </label>
          {fileName && (
            <p className={f.muted} style={{ marginTop: 0 }}>
              Loaded <strong>{fileName}</strong>.
            </p>
          )}
          {readError && <p className={f.err}>{readError}</p>}
          <label className={f.label}>
            <span className={f.labelText}>&hellip;or paste rows directly</span>
            <textarea
              className={f.input}
              rows={6}
              value={csv}
              onChange={(e) => {
                setCsv(e.target.value);
                setNotice(null);
              }}
              disabled={pending}
              spellCheck={false}
              style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}
              placeholder={syllabusCsvTemplate()}
            />
          </label>

          {plan && (
            <div className={f.tableWrap} style={S.preview}>
              <h3 className={a.sectionLabel}>Preview — nothing is saved yet</h3>
              <p className={f.muted} style={{ marginTop: 0 }}>
                <strong>{plan.units.length}</strong> unit{plan.units.length === 1 ? '' : 's'} to replace
                {plan.issues.length > 0 ? (
                  <> · <strong>{plan.issues.length}</strong> issue{plan.issues.length === 1 ? '' : 's'}</>
                ) : null}
              </p>
              {plan.issues.length > 0 && (
                <ul className={f.err} style={S.issues}>
                  {plan.issues.slice(0, 20).map((issue, i) => (
                    <li key={`${issue.line}-${i}`}>
                      {issue.line > 0 ? <strong>Line {issue.line}: </strong> : null}
                      {issue.message}
                    </li>
                  ))}
                  {plan.issues.length > 20 && <li>&hellip;and {plan.issues.length - 20} more.</li>}
                </ul>
              )}
              {plan.units.length > 0 && (
                <Table style={{ fontSize: '0.82rem' }}>
                  <thead>
                    <tr>
                      <Th>Unit</Th>
                      <Th>Replaces</Th>
                      <Th>New syllabus</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.units.slice(0, MAX_PREVIEW_UNITS).map((u) => (
                      <tr key={u.unitId}>
                        <Td style={{ whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                          <code>{u.skillCode}</code>
                        </Td>
                        <Td style={{ whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                          {u.existingCount} step{u.existingCount === 1 ? '' : 's'} → {u.steps.length}
                        </Td>
                        <Td>
                          <ol style={{ margin: 0, paddingLeft: '1.2rem' }}>
                            {u.steps.map((s) => (
                              <li key={s.line}>{s.label}</li>
                            ))}
                          </ol>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
              {plan.units.length > MAX_PREVIEW_UNITS && (
                <p className={f.muted}>Showing the first {MAX_PREVIEW_UNITS} of {plan.units.length} units. All will be replaced.</p>
              )}
            </div>
          )}

          {notice && (
            <p className={notice.kind === 'ok' ? f.ok : f.err} role="status">
              {notice.text}
            </p>
          )}

          <div className={f.actions}>
            <Button
              variant="primary"
              onClick={handleImport}
              disabled={pending || !csv.trim() || !plan || plan.units.length === 0}
            >
              {pending
                ? 'Importing…'
                : plan
                  ? `Replace ${plan.units.length} unit syllab${plan.units.length === 1 ? 'us' : 'i'}`
                  : 'Import'}
            </Button>{' '}
            <Button
              variant="secondary"
              onClick={() => {
                setCsv('');
                setFileName(null);
                setNotice(null);
                if (fileRef.current) fileRef.current.value = '';
              }}
              disabled={pending || !csv}
            >
              Clear
            </Button>
          </div>
        </>
      )}
    </section>
  );
}

const S: Record<string, React.CSSProperties> = {
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '0.75rem' },
  preview: { marginTop: '1rem', padding: '0.75rem 1rem', border: '1px solid #e5e7eb', borderRadius: 8, background: '#f9fafb' },
  issues: { margin: '0 0 0.75rem', paddingLeft: '1.25rem' },
};
