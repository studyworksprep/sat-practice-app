'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import HtmlBlock from './HtmlBlock';

// Bulk Review panel for the admin dashboard. Reads rows out of the
// questions_v2_fix_suggestions staging table (populated by the batch
// scripts) and lets the admin approve/reject them in bulk.
//
// Typical flow:
//   1. `node --env-file=.env.local scripts/v2-batch-fix-submit.mjs`
//   2. `node --env-file=.env.local scripts/v2-batch-fix-collect.mjs --batch-id=…`
//   3. Open this panel in the admin dashboard, filter to "trivial",
//      click "Apply all on this page", repeat until done.
//   4. Switch to "non_trivial" and review the remaining diffs one by
//      one.

export default function QuestionsV2BulkReview() {
  const [suggestions, setSuggestions] = useState([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState({ trivial: 0, non_trivial: 0, identical: 0, error: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [classification, setClassification] = useState('trivial'); // 'trivial' | 'non_trivial' | 'identical' | ''
  const [limit, setLimit] = useState(25);
  const [offset, setOffset] = useState(0);

  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    params.set('status', 'collected');
    if (classification) params.set('classification', classification);
    params.set('limit', String(limit));
    params.set('offset', String(offset));
    try {
      const res = await fetch(`/api/admin/questions-v2/suggestions?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load');
      setSuggestions(json.suggestions || []);
      setTotal(json.total || 0);
      setCounts(json.counts || { trivial: 0, non_trivial: 0, identical: 0, error: 0 });
      setSelected(new Set()); // clear selection on reload
    } catch (e) {
      setError(e.message || String(e));
      setSuggestions([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [classification, limit, offset]);

  useEffect(() => { load(); }, [load]);

  const page = Math.floor(offset / limit) + 1;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const allVisibleSelected =
    suggestions.length > 0 && suggestions.every((s) => selected.has(s.id));

  function toggleOne(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelected((prev) => {
      if (allVisibleSelected) {
        const next = new Set(prev);
        for (const s of suggestions) next.delete(s.id);
        return next;
      }
      const next = new Set(prev);
      for (const s of suggestions) next.add(s.id);
      return next;
    });
  }

  async function doAction(action, ids) {
    if (!ids || ids.length === 0) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/questions-v2/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ids }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Failed to ${action}`);
      if (action === 'apply') {
        setMessage({ kind: 'ok', text: `Applied ${json.applied} suggestion${json.applied === 1 ? '' : 's'}.` });
      } else {
        setMessage({ kind: 'ok', text: `Rejected ${json.rejected} suggestion${json.rejected === 1 ? '' : 's'}.` });
      }
      await load();
    } catch (e) {
      setMessage({ kind: 'err', text: e.message || String(e) });
    } finally {
      setBusy(false);
    }
  }

  // Bulk-reject every collected suggestion in the current classification
  // filter (across all pages, not just the visible page). Confirms first
  // because it's irreversible.
  async function rejectAllInFilter() {
    if (!classification) return;
    const count = counts[classification] || 0;
    if (count === 0) return;
    const ok = window.confirm(
      `Reject all ${count} "${classification}" suggestion${count === 1 ? '' : 's'} across every page?\n\n` +
        `This cannot be undone. The corresponding questions will become eligible for a new batch submission.`
    );
    if (!ok) return;

    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/questions-v2/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject_by_filter', classification }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to reject');
      setMessage({
        kind: 'ok',
        text: `Rejected ${json.rejected} ${classification} suggestion${json.rejected === 1 ? '' : 's'}.`,
      });
      await load();
    } catch (e) {
      setMessage({ kind: 'err', text: e.message || String(e) });
    } finally {
      setBusy(false);
    }
  }

  const applySelected = () => doAction('apply', Array.from(selected));
  const rejectSelected = () => doAction('reject', Array.from(selected));
  const applyAllOnPage = () => doAction('apply', suggestions.map((s) => s.id));

  return (
    <div>
      <div className="row" style={{ alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <h2 className="h2" style={{ margin: 0 }}>V2 Bulk Review</h2>
        <span className="muted small">
          Review and apply Claude's HTML cleanup suggestions from{' '}
          <code>questions_v2_fix_suggestions</code>.
        </span>
      </div>

      {/* Classification tabs + counts */}
      <div className="row" style={{ gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {[
          { key: 'trivial', label: 'Trivial', color: '#15803d' },
          { key: 'non_trivial', label: 'Non-trivial', color: '#b45309' },
          { key: 'identical', label: 'Identical', color: '#6b7280' },
        ].map((c) => (
          <button
            key={c.key}
            type="button"
            className="btn secondary"
            onClick={() => { setOffset(0); setClassification(c.key); }}
            style={{
              fontSize: 13,
              borderColor: classification === c.key ? c.color : undefined,
              color: classification === c.key ? c.color : undefined,
              fontWeight: classification === c.key ? 700 : 500,
            }}
          >
            {c.label} ({counts[c.key] || 0})
          </button>
        ))}
        <label className="small" style={{ display: 'flex', flexDirection: 'column', gap: 4, marginLeft: 'auto' }}>
          Per page
          <select
            className="input"
            value={limit}
            onChange={(e) => { setOffset(0); setLimit(parseInt(e.target.value, 10) || 25); }}
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </label>
      </div>

      {/* Bulk action bar */}
      <div
        className="row"
        style={{
          gap: 8,
          alignItems: 'center',
          marginBottom: 12,
          padding: '10px 12px',
          background: 'var(--surface, #f9fafb)',
          borderRadius: 8,
          flexWrap: 'wrap',
        }}
      >
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <input
            type="checkbox"
            checked={allVisibleSelected}
            onChange={toggleAllVisible}
            disabled={suggestions.length === 0 || busy}
          />
          Select all on this page ({suggestions.length})
        </label>

        <span className="muted small">
          {selected.size} selected
        </span>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            className="btn secondary"
            type="button"
            onClick={applyAllOnPage}
            disabled={busy || suggestions.length === 0}
            title={`Apply every suggestion on this page (${suggestions.length})`}
          >
            {busy ? 'Working…' : `Apply all on page (${suggestions.length})`}
          </button>
          <button
            className="btn"
            type="button"
            onClick={applySelected}
            disabled={busy || selected.size === 0}
            style={{
              background: '#15803d',
              borderColor: '#15803d',
              color: '#fff',
              opacity: selected.size === 0 ? 0.5 : 1,
            }}
          >
            {busy ? 'Working…' : `Apply selected (${selected.size})`}
          </button>
          <button
            className="btn secondary"
            type="button"
            onClick={rejectSelected}
            disabled={busy || selected.size === 0}
          >
            Reject selected ({selected.size})
          </button>
          <button
            className="btn secondary"
            type="button"
            onClick={rejectAllInFilter}
            disabled={busy || !classification || (counts[classification] || 0) === 0}
            title={
              classification
                ? `Reject every ${classification} suggestion across all pages. Useful for wiping a bad batch after a prompt fix.`
                : 'Pick a classification filter first'
            }
            style={{
              borderColor: '#b91c1c',
              color: '#b91c1c',
            }}
          >
            Reject all {classification ? counts[classification] || 0 : 0} {classification || ''}
          </button>
        </div>
      </div>

      {message && (
        <div
          className="card"
          style={{
            borderColor: message.kind === 'ok' ? 'rgba(52,211,153,0.5)' : 'rgba(251,113,133,0.6)',
            color: message.kind === 'ok' ? '#15803d' : '#b91c1c',
            marginBottom: 12,
            padding: '8px 12px',
          }}
        >
          {message.text}
        </div>
      )}

      {error && (
        <div className="card" style={{ borderColor: '#dc2626', color: '#dc2626', marginBottom: 12 }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {loading ? (
        <div className="card"><p className="muted">Loading…</p></div>
      ) : suggestions.length === 0 ? (
        <div className="card">
          <p className="muted">
            No collected suggestions match this filter.
            {total === 0 && counts.trivial === 0 && counts.non_trivial === 0 && counts.identical === 0 ? (
              <>
                {' '}Run{' '}
                <code>node --env-file=.env.local scripts/v2-batch-fix-submit.mjs</code>
                {' '}then{' '}
                <code>scripts/v2-batch-fix-collect.mjs --batch-id=…</code>
                {' '}to populate this view.
              </>
            ) : null}
          </p>
        </div>
      ) : (
        suggestions.map((s) => (
          <SuggestionCard
            key={s.id}
            suggestion={s}
            selected={selected.has(s.id)}
            onToggle={() => toggleOne(s.id)}
            busy={busy}
            onApply={() => doAction('apply', [s.id])}
            onReject={() => doAction('reject', [s.id])}
          />
        ))
      )}

      {/* Pagination */}
      {suggestions.length > 0 && (
        <div
          className="row"
          style={{
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 12,
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <span className="muted small">
            Showing {offset + 1}–{Math.min(offset + suggestions.length, total)} of {total}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              className="btn secondary"
              type="button"
              disabled={offset === 0 || loading}
              onClick={() => setOffset(Math.max(0, offset - limit))}
            >
              Prev
            </button>
            <span className="small" style={{ minWidth: 60, textAlign: 'center' }}>
              {page} / {totalPages}
            </span>
            <button
              className="btn secondary"
              type="button"
              disabled={offset + limit >= total || loading}
              onClick={() => setOffset(offset + limit)}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SuggestionCard({ suggestion, selected, onToggle, busy, onApply, onReject }) {
  const [showRaw, setShowRaw] = useState(false);
  const classColor = useMemo(() => {
    switch (suggestion.diff_classification) {
      case 'trivial': return '#15803d';
      case 'non_trivial': return '#b45309';
      case 'identical': return '#6b7280';
      default: return '#dc2626';
    }
  }, [suggestion.diff_classification]);

  const srcOptions = Array.isArray(suggestion.source_options) ? suggestion.source_options : [];
  const sugOptions = Array.isArray(suggestion.suggested_options) ? suggestion.suggested_options : [];

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div
        className="row"
        style={{
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 10,
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            disabled={busy}
          />
          <span className="kbd" style={{ fontSize: 11 }} title={suggestion.question_id}>
            {suggestion.question_id.slice(0, 8)}
          </span>
          <span
            className="pill"
            style={{
              borderColor: classColor,
              color: classColor,
              fontSize: 11,
            }}
          >
            {suggestion.diff_classification || 'unknown'}
          </span>
          {suggestion.model ? (
            <span className="pill" style={{ fontSize: 11 }}>
              <span className="muted">model</span>{' '}
              <span className="kbd" style={{ fontSize: 10 }}>
                {suggestion.model.replace('claude-', '').replace('-20251001', '')}
              </span>
            </span>
          ) : null}
        </label>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            className="btn secondary"
            style={{ fontSize: 11, padding: '4px 10px' }}
            onClick={() => setShowRaw((v) => !v)}
          >
            {showRaw ? 'Rendered' : 'Raw HTML'}
          </button>
          <button
            type="button"
            className="btn"
            style={{
              fontSize: 11,
              padding: '4px 10px',
              background: '#15803d',
              borderColor: '#15803d',
              color: '#fff',
            }}
            onClick={onApply}
            disabled={busy}
          >
            Apply
          </button>
          <button
            type="button"
            className="btn secondary"
            style={{ fontSize: 11, padding: '4px 10px' }}
            onClick={onReject}
            disabled={busy}
          >
            Reject
          </button>
        </div>
      </div>

      {/* Side-by-side diff */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 12,
        }}
      >
        <DiffSide
          title="Source"
          stimulusHtml={suggestion.source_stimulus_html}
          stemHtml={suggestion.source_stem_html}
          options={srcOptions}
          showRaw={showRaw}
        />
        <DiffSide
          title="Suggestion"
          stimulusHtml={suggestion.suggested_stimulus_html}
          stemHtml={suggestion.suggested_stem_html}
          options={sugOptions}
          showRaw={showRaw}
          highlight={classColor}
        />
      </div>
    </div>
  );
}

function DiffSide({ title, stimulusHtml, stemHtml, options, showRaw, highlight }) {
  return (
    <div
      style={{
        border: '1px solid var(--border, #e5e7eb)',
        borderLeftWidth: highlight ? 4 : 1,
        borderLeftColor: highlight || undefined,
        borderRadius: 6,
        padding: 10,
        background: 'var(--card, #fff)',
        overflow: 'auto',
        maxHeight: 400,
      }}
    >
      <div className="small muted" style={{ fontWeight: 700, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {title}
      </div>
      {showRaw ? (
        <pre
          style={{
            fontSize: 11,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            margin: 0,
          }}
        >
          {`stimulus_html: ${stimulusHtml || '(null)'}\n\nstem_html: ${stemHtml || ''}\n\n${(options || []).map((o) => `option ${o.label}: ${o.content_html || ''}`).join('\n')}`}
        </pre>
      ) : (
        <>
          {stimulusHtml ? (
            <div style={{ marginBottom: 8 }}>
              <HtmlBlock html={stimulusHtml} className="prose" />
            </div>
          ) : null}
          {stemHtml ? (
            <div style={{ marginBottom: 8 }}>
              <HtmlBlock html={stemHtml} className="prose" />
            </div>
          ) : null}
          {options && options.length > 0 ? (
            <ol style={{ paddingLeft: 20, margin: 0 }}>
              {options.map((o, i) => (
                <li key={o.label || i} style={{ marginBottom: 4 }}>
                  <strong>{o.label}.</strong>{' '}
                  <HtmlBlock html={o.content_html || ''} className="prose" />
                </li>
              ))}
            </ol>
          ) : null}
        </>
      )}
    </div>
  );
}
