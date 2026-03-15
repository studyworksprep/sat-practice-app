'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const STATUS_LABELS = { open: 'Open', in_progress: 'In Progress', resolved: 'Resolved', closed: 'Closed' };
const STATUS_COLORS = {
  open: { bg: 'rgba(239,68,68,0.1)', color: '#dc2626' },
  in_progress: { bg: 'rgba(234,179,8,0.1)', color: '#b45309' },
  resolved: { bg: 'rgba(22,163,74,0.1)', color: '#16a34a' },
  closed: { bg: 'rgba(107,114,128,0.1)', color: '#6b7280' },
};

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

export default function BugListPage() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [expandedImage, setExpandedImage] = useState(null);

  async function fetchReports() {
    try {
      const res = await fetch('/api/admin/bug-reports');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed');
      setReports(json.reports || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchReports(); }, []);

  async function handleStatusChange(id, status) {
    await fetch('/api/admin/bug-reports', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    });
    setReports((prev) => prev.map((r) => r.id === id ? { ...r, status } : r));
  }

  async function handleDelete(id) {
    if (!confirm('Delete this bug report?')) return;
    await fetch('/api/admin/bug-reports', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    setReports((prev) => prev.filter((r) => r.id !== id));
  }

  const filtered = filter === 'all' ? reports : reports.filter((r) => r.status === filter);

  if (loading) {
    return <main className="container"><p className="muted">Loading bug reports…</p></main>;
  }

  if (error) {
    return <main className="container"><p style={{ color: 'var(--danger)' }}>{error}</p></main>;
  }

  return (
    <main className="container bugListMain">
      <div className="bugListHeader">
        <div>
          <h1 className="h1" style={{ marginBottom: 4 }}>Bug Reports</h1>
          <p className="muted small">{reports.length} report{reports.length !== 1 ? 's' : ''} total</p>
        </div>
        <Link href="/admin" className="btn secondary" style={{ fontSize: 13 }}>Back to Admin</Link>
      </div>

      {/* Filters */}
      <div className="bugListFilters">
        {['all', 'open', 'in_progress', 'resolved', 'closed'].map((f) => (
          <button
            key={f}
            className={`bugFilterBtn${filter === f ? ' bugFilterActive' : ''}`}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? 'All' : STATUS_LABELS[f]}
            <span className="bugFilterCount">
              {f === 'all' ? reports.length : reports.filter((r) => r.status === f).length}
            </span>
          </button>
        ))}
      </div>

      {/* Reports */}
      {filtered.length === 0 ? (
        <p className="muted" style={{ marginTop: 24 }}>No bug reports match this filter.</p>
      ) : (
        <div className="bugListCards">
          {filtered.map((r) => {
            const sc = STATUS_COLORS[r.status] || STATUS_COLORS.open;
            return (
              <div key={r.id} className="card bugCard">
                <div className="bugCardTop">
                  <div style={{ flex: 1 }}>
                    <h3 className="bugCardTitle">{r.title || 'Bug Report'}</h3>
                    <div className="bugCardMeta">
                      <span
                        className="bugStatusBadge"
                        style={{ background: sc.bg, color: sc.color }}
                      >
                        {STATUS_LABELS[r.status] || r.status}
                      </span>
                      <span className="muted small">{formatDate(r.created_at)}</span>
                      {r.created_by && <span className="muted small">by {r.created_by}</span>}
                    </div>
                  </div>
                  <div className="bugCardActions">
                    <select
                      className="bugStatusSelect"
                      value={r.status}
                      onChange={(e) => handleStatusChange(r.id, e.target.value)}
                    >
                      {Object.entries(STATUS_LABELS).map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                    <button className="bugDeleteBtn" onClick={() => handleDelete(r.id)} title="Delete">&times;</button>
                  </div>
                </div>
                <p className="bugCardDesc">{r.description}</p>
                {r.image_url && (
                  <div className="bugCardImageWrap">
                    <img
                      src={r.image_url}
                      alt="Bug screenshot"
                      className="bugCardImage"
                      onClick={() => setExpandedImage(r.image_url)}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Lightbox */}
      {expandedImage && (
        <div className="bugLightbox" onClick={() => setExpandedImage(null)}>
          <img src={expandedImage} alt="Screenshot" className="bugLightboxImg" />
        </div>
      )}
    </main>
  );
}
