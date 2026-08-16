// CSV import panel for the pattern catalog.
//
// The owner's workstream (doc §4 step 2) drafts catalogs in a
// spreadsheet before anything reaches the app, so the file is the
// primary authoring path and the form is for one-offs. Three things
// make a spreadsheet import safe to run against reference data:
//
//   1. A dry run. Nothing is written until the admin has seen the
//      exact create/update/skip split and every rejected line.
//   2. A stated duplicate policy. Re-uploading a corrected sheet is
//      the normal case, not an error — "Update existing" makes the
//      file the source of truth; "Skip" only adds what is new.
//   3. Round-tripping. Export the live catalog, edit it, re-import it.
//
// The preview runs the same parser and planner the Server Action runs
// (lib/admin/questionPatternCsv). It is a courtesy, not a gate — the
// server re-parses and re-plans against rows it reads itself.

'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/lib/ui/Button';
import { Table, Th, Td } from '@/lib/ui/Table';
import { toCsv, downloadCsv } from '@/lib/exportCsv';
import {
  PATTERN_CSV_COLUMNS,
  parsePatternCsv,
  planPatternImport,
  patternCsvTemplate,
  type ExistingPattern,
  type ImportMode,
} from '@/lib/admin/questionPatternCsv';
import { importQuestionPatterns } from './actions';
import f from '../../../forms.module.css';
import a from '../../../admin.module.css';

export interface ExportablePattern extends ExistingPattern {
  recognition_cue: string;
  process_summary: string | null;
}

const MAX_PREVIEW_ROWS = 12;

export function PatternImportPanel({ patterns }: { patterns: ExportablePattern[] }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();

  const [open, setOpen] = useState(false);
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [mode, setMode] = useState<ImportMode>('skip');
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [readError, setReadError] = useState<string | null>(null);

  // Dry run, recomputed on every keystroke and mode flip.
  const plan = useMemo(() => {
    if (!csv.trim()) return null;
    return planPatternImport({ parsed: parsePatternCsv(csv), existing: patterns, mode });
  }, [csv, patterns, mode]);

  const blocking = plan?.issues.filter((i) => !i.message.startsWith('Ignoring')) ?? [];
  const nothingToDo = plan !== null && plan.creates.length === 0 && plan.updates.length === 0;

  async function handleFile(file: File | undefined) {
    setNotice(null);
    setReadError(null);
    if (!file) return;
    try {
      const text = await file.text();
      setCsv(text);
      setFileName(file.name);
    } catch {
      setReadError('Could not read that file. Save it as CSV and try again.');
    }
  }

  function handleImport() {
    setNotice(null);
    startTransition(async () => {
      const res = await importQuestionPatterns({ csv, mode });
      if (!res.ok) {
        setNotice({ kind: 'err', text: res.error });
        return;
      }
      const { created, updated, skipped, issues } = res.data;
      const parts = [
        `${created} created`,
        `${updated} updated`,
        skipped > 0 ? `${skipped} skipped` : null,
        issues.length > 0 ? `${issues.length} line${issues.length === 1 ? '' : 's'} rejected` : null,
      ].filter(Boolean);
      setNotice({
        kind: issues.length > 0 && created + updated === 0 ? 'err' : 'ok',
        text: `Import finished — ${parts.join(', ')}.`,
      });
      if (created > 0 || updated > 0) {
        setCsv('');
        setFileName(null);
        if (fileRef.current) fileRef.current.value = '';
        router.refresh();
      }
    });
  }

  function handleExport() {
    const rows = [...patterns]
      .sort(
        (x, y) =>
          x.domain_code.localeCompare(y.domain_code) ||
          x.skill_code.localeCompare(y.skill_code) ||
          x.sequence - y.sequence,
      )
      .map((p) => ({
        domain_code: p.domain_code,
        skill_code: p.skill_code,
        name: p.name,
        recognition_cue: p.recognition_cue,
        process_summary: p.process_summary ?? '',
        sequence: p.sequence,
        test_type: p.test_type,
      }));
    downloadCsv(
      toCsv(rows, [
        'domain_code',
        'skill_code',
        'name',
        'recognition_cue',
        'process_summary',
        'sequence',
        'test_type',
      ]),
      'question-patterns.csv',
    );
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
          Upload a CSV of drafted patterns, or export the live catalog to edit it in a spreadsheet
          and re-import.
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
              {PATTERN_CSV_COLUMNS.map((col) => (
                <tr key={col.key}>
                  <Td style={{ fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{col.key}</Td>
                  <Td>{col.required ? 'yes' : 'no'}</Td>
                  <Td className={f.tdMuted}>{col.help}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <p className={f.formHint}>
            Header order does not matter and common aliases are accepted (<code>domain</code>,{' '}
            <code>skill</code>, <code>cue</code>, <code>process</code>, <code>order</code>). Tab-separated
            paste from a spreadsheet works too. Quote any field containing a comma.
          </p>

          <div className={f.actions} style={{ marginTop: 'var(--s2, 0.5rem)' }}>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => downloadCsv(patternCsvTemplate(), 'question-patterns-template.csv')}
            >
              Download template
            </Button>{' '}
            <Button size="sm" variant="secondary" onClick={handleExport} disabled={patterns.length === 0}>
              Export current catalog ({patterns.length})
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
              Loaded <strong>{fileName}</strong> — edit below before importing if you need to.
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
              placeholder={patternCsvTemplate()}
            />
          </label>

          <fieldset className={f.fieldset}>
            <legend className={f.legend}>When a pattern already exists</legend>
            <label className={f.row}>
              <input
                type="radio"
                name="import-mode"
                checked={mode === 'skip'}
                onChange={() => setMode('skip')}
                disabled={pending}
              />
              <span>
                <strong>Skip it</strong> — only add patterns that are new. Safe default.
              </span>
            </label>
            <label className={f.row}>
              <input
                type="radio"
                name="import-mode"
                checked={mode === 'update'}
                onChange={() => setMode('update')}
                disabled={pending}
              />
              <span>
                <strong>Update it</strong> — overwrite cue, process, and order from the file. Use when
                the spreadsheet is the source of truth.
              </span>
            </label>
            <p className={f.formHint}>
              Matching is on domain + skill + name, ignoring case. Question tags and lesson scope tags
              on an updated pattern are preserved.
            </p>
          </fieldset>

          {plan && <ImportPreview plan={plan} mode={mode} />}

          {notice && (
            <p className={notice.kind === 'ok' ? f.ok : f.err} role="status">
              {notice.text}
            </p>
          )}

          <div className={f.actions}>
            <Button
              variant="primary"
              onClick={handleImport}
              disabled={pending || !csv.trim() || nothingToDo}
            >
              {pending
                ? 'Importing…'
                : plan
                  ? `Import ${plan.creates.length + plan.updates.length} pattern${
                      plan.creates.length + plan.updates.length === 1 ? '' : 's'
                    }`
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
            {blocking.length > 0 && (
              <span className={f.warnInline}>
                {blocking.length} line{blocking.length === 1 ? '' : 's'} will be skipped — the rest still
                imports.
              </span>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function ImportPreview({
  plan,
  mode,
}: {
  plan: ReturnType<typeof planPatternImport>;
  mode: ImportMode;
}) {
  const total = plan.creates.length + plan.updates.length;
  return (
    <div className={f.tableWrap} style={S.preview}>
      <h3 className={a.sectionLabel}>Preview — nothing is saved yet</h3>
      <p className={f.muted} style={{ marginTop: 0 }}>
        <strong>{plan.creates.length}</strong> to create · <strong>{plan.updates.length}</strong> to
        update · <strong>{plan.skips.length}</strong> already in the catalog
        {plan.issues.length > 0 ? (
          <>
            {' '}
            · <strong>{plan.issues.length}</strong> line{plan.issues.length === 1 ? '' : 's'} with
            problems
          </>
        ) : null}
      </p>

      {plan.issues.length > 0 && (
        <ul className={f.err} style={S.issues}>
          {plan.issues.slice(0, MAX_PREVIEW_ROWS).map((issue, i) => (
            <li key={`${issue.line}-${i}`}>
              {issue.line > 0 ? <strong>Line {issue.line}: </strong> : null}
              {issue.message}
            </li>
          ))}
          {plan.issues.length > MAX_PREVIEW_ROWS && (
            <li>&hellip;and {plan.issues.length - MAX_PREVIEW_ROWS} more.</li>
          )}
        </ul>
      )}

      {total > 0 && (
        <Table style={{ fontSize: '0.82rem' }}>
          <thead>
            <tr>
              <Th>Line</Th>
              <Th>Action</Th>
              <Th>Skill</Th>
              <Th>Order</Th>
              <Th>Pattern</Th>
            </tr>
          </thead>
          <tbody>
            {[
              ...plan.creates.map((c) => ({
                line: c.line,
                action: 'create' as const,
                sequence: c.sequence,
                row: c.row,
                existingName: null as string | null,
              })),
              ...plan.updates.map((u) => ({
                line: u.line,
                action: 'update' as const,
                sequence: u.sequence,
                row: u.row,
                existingName: u.existingName,
              })),
            ]
              .sort((x, y) => x.line - y.line)
              .slice(0, MAX_PREVIEW_ROWS)
              .map((item) => (
                <tr key={`${item.action}-${item.line}`}>
                  <Td className={f.tdMuted}>{item.line}</Td>
                  <Td>
                    <span style={item.action === 'create' ? S.createBadge : S.updateBadge}>
                      {item.action}
                    </span>
                  </Td>
                  <Td style={{ whiteSpace: 'nowrap' }}>
                    <code>{item.row.skillCode}</code>
                  </Td>
                  <Td>{item.sequence}</Td>
                  <Td>
                    <div style={{ fontWeight: 600 }}>{item.row.name}</div>
                    {item.existingName && item.existingName !== item.row.name && (
                      <div className={f.muted}>renames &ldquo;{item.existingName}&rdquo;</div>
                    )}
                    <div className={f.muted}>{item.row.recognitionCue}</div>
                  </Td>
                </tr>
              ))}
          </tbody>
        </Table>
      )}

      {total > MAX_PREVIEW_ROWS && (
        <p className={f.muted}>
          Showing the first {MAX_PREVIEW_ROWS} of {total}. All {total} will be imported.
        </p>
      )}

      {total === 0 && plan.skips.length > 0 && (
        <p className={f.muted}>
          Every row in this file is already in the catalog.
          {mode === 'skip' ? ' Switch to “Update it” above to overwrite them.' : null}
        </p>
      )}
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  head: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '1rem',
    marginBottom: '0.75rem',
  },
  preview: {
    marginTop: '1rem',
    padding: '0.75rem 1rem',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    background: '#f9fafb',
  },
  issues: { margin: '0 0 0.75rem', paddingLeft: '1.25rem' },
  createBadge: {
    padding: '2px 8px',
    borderRadius: 999,
    fontSize: '0.7rem',
    fontWeight: 700,
    background: '#dcfce7',
    color: '#166534',
  },
  updateBadge: {
    padding: '2px 8px',
    borderRadius: 999,
    fontSize: '0.7rem',
    fontWeight: 700,
    background: '#e0e7ff',
    color: '#3730a3',
  },
};
