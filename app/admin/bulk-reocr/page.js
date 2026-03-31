'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import HtmlBlock from '../../../components/HtmlBlock';

export default function BulkReOcrPage() {
  const [userRole, setUserRole] = useState(null);
  const [pdfFile, setPdfFile] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [results, setResults] = useState([]); // accumulated across PDFs
  const [processedCount, setProcessedCount] = useState(0);

  // Sync IDs state
  const [syncFile, setSyncFile] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);

  // Filter state
  const [filterMode, setFilterMode] = useState('all'); // all | matched | unmatched | ready | saved | skipped

  useEffect(() => {
    fetch('/api/me')
      .then(r => r.json())
      .then(d => { if (d.role) setUserRole(d.role); })
      .catch(() => {});
  }, []);

  async function syncQuestionIds() {
    if (!syncFile) return;
    setSyncing(true);
    setSyncResult(null);
    try {
      const form = new FormData();
      form.append('file', syncFile);
      const res = await fetch('/api/admin/sync-question-ids', { method: 'POST', body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed');
      setSyncResult(json);
    } catch (e) {
      setSyncResult({ error: e.message });
    } finally {
      setSyncing(false);
    }
  }

  async function processPdf() {
    if (!pdfFile) return;
    setProcessing(true);
    setError(null);

    try {
      const form = new FormData();
      form.append('pdf', pdfFile);
      const res = await fetch('/api/admin/bulk-reocr', { method: 'POST', body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to process PDF');

      const newResults = (json.questions || []).map(q => ({
        ...q,
        status: q.matched ? 'ready' : 'unmatched',
        saving: false,
      }));
      setResults(prev => [...prev, ...newResults]);
      setProcessedCount(prev => prev + 1);
      setPdfFile(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setProcessing(false);
    }
  }

  async function applyFix(idx) {
    const item = results[idx];
    if (!item?.version_id) return;
    setResults(prev => prev.map((r, i) => i === idx ? { ...r, saving: true } : r));

    try {
      // Map new options to existing option IDs by matching label/ordinal
      const optionUpdates = [];
      if (item.options?.length && item.current_options?.length) {
        for (const newOpt of item.options) {
          const existing = item.current_options.find(o => o.label === newOpt.label);
          if (existing && newOpt.content_html) {
            optionUpdates.push({ id: existing.id, content_html: newOpt.content_html });
          }
        }
      }

      const res = await fetch('/api/admin/bulk-reocr', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version_id: item.version_id,
          stem_html: item.stem_html,
          stimulus_html: item.stimulus_html || undefined,
          options: optionUpdates.length > 0 ? optionUpdates : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed');

      setResults(prev => prev.map((r, i) => i === idx ? { ...r, status: 'saved', saving: false } : r));
    } catch (e) {
      setResults(prev => prev.map((r, i) => i === idx ? { ...r, saving: false } : r));
      setError(e.message);
    }
  }

  function skipItem(idx) {
    setResults(prev => prev.map((r, i) => i === idx ? { ...r, status: 'skipped' } : r));
  }

  async function applyAllReady() {
    const readyIndices = results.map((r, i) => r.status === 'ready' ? i : -1).filter(i => i >= 0);
    for (const idx of readyIndices) {
      await applyFix(idx);
    }
  }

  // Filtered results
  const filtered = results.filter(r => {
    if (filterMode === 'all') return true;
    if (filterMode === 'matched') return r.matched;
    if (filterMode === 'unmatched') return !r.matched;
    return r.status === filterMode;
  });

  const stats = {
    total: results.length,
    matched: results.filter(r => r.matched).length,
    unmatched: results.filter(r => !r.matched).length,
    ready: results.filter(r => r.status === 'ready').length,
    saved: results.filter(r => r.status === 'saved').length,
    skipped: results.filter(r => r.status === 'skipped').length,
  };

  if (userRole === null) return <main className="container"><div className="muted" style={{ marginTop: 40 }}>Loading...</div></main>;
  if (userRole !== 'admin') return <main className="container"><div className="card" style={{ padding: 24, marginTop: 40 }}>Admin access required.</div></main>;

  return (
    <main className="container containerWide" style={{ paddingBottom: 60 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Link href="/dashboard" className="btn secondary" style={{ fontSize: 12, padding: '4px 12px' }}>Back</Link>
        <h1 style={{ margin: 0, fontSize: 20 }}>Bulk Re-OCR Questions</h1>
      </div>

      {/* Step 0: Sync Question IDs */}
      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, margin: '0 0 8px' }}>Step 1: Sync Question IDs</h2>
        <p className="muted small" style={{ marginBottom: 12 }}>
          Upload the Collegeboard metadata JSON file. This fixes questions where the database has an IBN number
          (e.g., &quot;070925-DC&quot;) instead of the correct Collegeboard hex ID (e.g., &quot;9912e19f&quot;).
          Also backfills <code>source_external_id</code> from IBN numbers where available.
        </p>

        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={{ display: 'grid', gap: 4 }}>
            <span className="muted small">Metadata JSON File (.txt or .json)</span>
            <input
              type="file"
              accept=".txt,.json"
              onChange={e => setSyncFile(e.target.files?.[0] || null)}
              className="input"
            />
          </label>
          <button className="btn" disabled={!syncFile || syncing} onClick={syncQuestionIds}>
            {syncing ? 'Syncing…' : 'Upload & Sync IDs'}
          </button>
        </div>

        {syncResult && !syncResult.error && (
          <div style={{ marginTop: 12, padding: 12, background: 'var(--bg)', borderRadius: 8, fontSize: 13 }}>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 8 }}>
              <span><strong>{syncResult.total}</strong> entries</span>
              <span style={{ color: 'var(--green, #22c55e)' }}><strong>{syncResult.already_correct}</strong> already correct</span>
              <span style={{ color: 'var(--accent)' }}><strong>{syncResult.updated_question_id}</strong> IDs fixed</span>
              <span className="muted"><strong>{syncResult.updated_external_id}</strong> IBN backfilled</span>
              <span style={{ color: 'var(--danger)' }}><strong>{syncResult.not_found}</strong> not found</span>
            </div>
            {syncResult.details?.length > 0 && (
              <details>
                <summary className="muted small" style={{ cursor: 'pointer' }}>Show details ({syncResult.details.length})</summary>
                <div style={{ maxHeight: 300, overflow: 'auto', marginTop: 8 }}>
                  <table className="adminTable" style={{ fontSize: 12 }}>
                    <thead>
                      <tr><th>Question ID</th><th>Action</th><th>Old</th><th>New</th></tr>
                    </thead>
                    <tbody>
                      {syncResult.details.map((d, i) => (
                        <tr key={i}>
                          <td style={{ fontFamily: 'monospace' }}>{d.questionId}</td>
                          <td>{d.action}</td>
                          <td style={{ fontFamily: 'monospace' }}>{d.old || d.ibn || '—'}</td>
                          <td style={{ fontFamily: 'monospace' }}>{d.new || d.questionId}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
            {syncResult.errors?.length > 0 && (
              <div style={{ marginTop: 8, color: 'var(--danger)', fontSize: 12 }}>
                {syncResult.errors.length} errors — check console for details.
              </div>
            )}
          </div>
        )}
        {syncResult?.error && (
          <div style={{ marginTop: 12, color: 'var(--danger)', fontSize: 13 }}>{syncResult.error}</div>
        )}
      </div>

      {/* Step 2: Bulk Re-OCR */}
      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, margin: '0 0 8px' }}>Step 2: Bulk Re-OCR</h2>
        <p className="muted small" style={{ marginBottom: 12 }}>
          Upload a PDF containing SAT questions (one per page). Each page should include the question ID.
          The PDF will be sent through Mathpix OCR → Claude extraction, then matched against the database.
          You can upload multiple PDFs sequentially — results accumulate.
        </p>

        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={{ display: 'grid', gap: 4 }}>
            <span className="muted small">PDF File</span>
            <input
              type="file"
              accept=".pdf"
              onChange={e => setPdfFile(e.target.files?.[0] || null)}
              className="input"
            />
          </label>
          <button className="btn" disabled={!pdfFile || processing} onClick={processPdf}>
            {processing ? 'Processing… (this may take a few minutes)' : 'Upload & Process'}
          </button>
          {processedCount > 0 && <span className="muted small">{processedCount} PDF{processedCount > 1 ? 's' : ''} processed</span>}
        </div>

        {error && <div style={{ marginTop: 12, color: 'var(--danger, #dc2626)', fontSize: 13 }}>{error}</div>}
      </div>

      {/* Stats + filters */}
      {results.length > 0 && (
        <div className="card" style={{ padding: '12px 16px', marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ fontSize: 14 }}>
              <strong>{stats.total}</strong> questions
              {' · '}<span style={{ color: 'var(--green, #22c55e)' }}>{stats.saved} saved</span>
              {' · '}<span style={{ color: 'var(--accent)' }}>{stats.ready} ready</span>
              {' · '}<span className="muted">{stats.skipped} skipped</span>
              {' · '}<span style={{ color: 'var(--danger)' }}>{stats.unmatched} unmatched</span>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {['all', 'ready', 'saved', 'skipped', 'unmatched'].map(mode => (
                <button
                  key={mode}
                  className={`pill clickable${filterMode === mode ? ' selected' : ''}`}
                  onClick={() => setFilterMode(mode)}
                  style={{ fontSize: 11 }}
                >
                  {mode.charAt(0).toUpperCase() + mode.slice(1)}
                </button>
              ))}
            </div>
            {stats.ready > 0 && (
              <button className="btn" onClick={applyAllReady} style={{ fontSize: 12, marginLeft: 'auto' }}>
                Apply All Ready ({stats.ready})
              </button>
            )}
          </div>
        </div>
      )}

      {/* Results list */}
      <div style={{ display: 'grid', gap: 8 }}>
        {filtered.map((item, idx) => {
          const realIdx = results.indexOf(item);
          return (
            <div key={realIdx} className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {/* Header */}
              <div style={{
                padding: '10px 16px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                background: item.status === 'saved' ? 'rgba(34,197,94,0.05)' : item.status === 'unmatched' ? 'rgba(220,38,38,0.05)' : undefined,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <strong style={{ fontSize: 13, fontFamily: 'monospace' }}>{item.question_id || '(no ID)'}</strong>
                  <span className="pill" style={{ fontSize: 11 }}>{item.question_type || 'mcq'}</span>
                  {item.matched && <span className="pill" style={{ fontSize: 11, background: 'rgba(34,197,94,0.1)' }}>Matched</span>}
                  {!item.matched && <span className="pill" style={{ fontSize: 11, background: 'rgba(220,38,38,0.1)', color: 'var(--danger)' }}>No Match</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="pill" style={{
                    fontSize: 11,
                    background: item.status === 'saved' ? 'rgba(34,197,94,0.15)' : item.status === 'skipped' ? 'rgba(156,163,175,0.2)' : undefined,
                    fontWeight: 600,
                  }}>
                    {item.status === 'ready' ? 'Ready' : item.status === 'saved' ? 'Saved' : item.status === 'skipped' ? 'Skipped' : 'Unmatched'}
                  </span>
                </div>
              </div>

              {/* Comparison + actions for matched questions */}
              {item.status === 'ready' && (
                <div style={{ padding: '0 16px 16px' }}>
                  {/* Stem comparison */}
                  <div className="muted small" style={{ fontWeight: 600, marginTop: 8, marginBottom: 4 }}>Stem</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                    <div>
                      <div className="muted small" style={{ marginBottom: 2 }}>Current</div>
                      <div style={{ fontSize: 12, padding: 8, background: 'var(--bg)', borderRadius: 6, maxHeight: 200, overflow: 'auto' }}>
                        <HtmlBlock html={item.current_stem_html || ''} className="prose" />
                      </div>
                    </div>
                    <div>
                      <div className="muted small" style={{ marginBottom: 2 }}>New (OCR)</div>
                      <div style={{ fontSize: 12, padding: 8, background: 'rgba(34,197,94,0.05)', borderRadius: 6, maxHeight: 200, overflow: 'auto' }}>
                        <HtmlBlock html={item.stem_html || ''} className="prose" />
                      </div>
                    </div>
                  </div>

                  {/* Options comparison */}
                  {item.options?.length > 0 && item.current_options?.length > 0 && (
                    <>
                      <div className="muted small" style={{ fontWeight: 600, marginBottom: 4 }}>Options</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                        <div>
                          <div className="muted small" style={{ marginBottom: 2 }}>Current</div>
                          <div style={{ fontSize: 12, padding: 8, background: 'var(--bg)', borderRadius: 6, maxHeight: 200, overflow: 'auto' }}>
                            {item.current_options.map(o => (
                              <div key={o.id} style={{ marginBottom: 4 }}>
                                <strong>{o.label}.</strong> <HtmlBlock html={o.content_html || ''} className="prose" />
                              </div>
                            ))}
                          </div>
                        </div>
                        <div>
                          <div className="muted small" style={{ marginBottom: 2 }}>New (OCR)</div>
                          <div style={{ fontSize: 12, padding: 8, background: 'rgba(34,197,94,0.05)', borderRadius: 6, maxHeight: 200, overflow: 'auto' }}>
                            {item.options.map((o, oi) => (
                              <div key={oi} style={{ marginBottom: 4 }}>
                                <strong>{o.label}.</strong> <HtmlBlock html={o.content_html || ''} className="prose" />
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </>
                  )}

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn" onClick={() => applyFix(realIdx)} disabled={item.saving} style={{ fontSize: 12 }}>
                      {item.saving ? 'Saving…' : 'Apply Fix'}
                    </button>
                    <button className="btn secondary" onClick={() => skipItem(realIdx)} style={{ fontSize: 12 }}>
                      Skip
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
}
