'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Toast from '../../components/Toast';

function pctColor(p) {
  if (p === null || p === undefined) return undefined;
  return p >= 70 ? 'var(--success)' : p >= 50 ? 'var(--amber)' : 'var(--danger)';
}

export default function ReviewPage() {
  const [items, setItems] = useState([]);
  const [smartItems, setSmartItems] = useState([]);
  const [msg, setMsg] = useState(null);
  const [loading, setLoading] = useState(false);
  const [smartLoading, setSmartLoading] = useState(false);
  const [tab, setTab] = useState('marked');

  async function loadMarked() {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch('/api/review');
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to load review list');
      setItems(json.items || []);
    } catch (e) {
      setMsg({ kind: 'danger', text: e.message });
    } finally {
      setLoading(false);
    }
  }

  async function loadSmart() {
    setSmartLoading(true);
    try {
      const res = await fetch('/api/smart-review');
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to load smart review');
      setSmartItems(json.items || []);
    } catch (e) {
      setMsg({ kind: 'danger', text: e.message });
    } finally {
      setSmartLoading(false);
    }
  }

  useEffect(() => { loadMarked(); loadSmart(); }, []);

  const activeItems = tab === 'marked' ? items : smartItems;
  const activeLoading = tab === 'marked' ? loading : smartLoading;

  return (
    <main className="container">
      <div className="card">
        <div className="h1">Review</div>

        {/* Tab switcher */}
        <div style={{ display: 'flex', gap: 0, marginTop: 8, marginBottom: 14, borderBottom: '1px solid var(--border)' }}>
          <button
            onClick={() => setTab('marked')}
            style={{
              padding: '8px 18px',
              fontSize: 13,
              fontWeight: 600,
              background: 'none',
              border: 'none',
              borderBottom: tab === 'marked' ? '2px solid var(--accent)' : '2px solid transparent',
              color: tab === 'marked' ? 'var(--accent)' : 'var(--muted)',
              cursor: 'pointer',
            }}
          >
            Marked for Review ({items.length})
          </button>
          <button
            onClick={() => setTab('smart')}
            style={{
              padding: '8px 18px',
              fontSize: 13,
              fontWeight: 600,
              background: 'none',
              border: 'none',
              borderBottom: tab === 'smart' ? '2px solid var(--accent)' : '2px solid transparent',
              color: tab === 'smart' ? 'var(--accent)' : 'var(--muted)',
              cursor: 'pointer',
            }}
          >
            Smart Review ({smartItems.length})
          </button>
        </div>

        {tab === 'marked' && (
          <p className="muted small" style={{ marginTop: 0, marginBottom: 10 }}>
            Questions you've manually marked for review.
          </p>
        )}
        {tab === 'smart' && (
          <p className="muted small" style={{ marginTop: 0, marginBottom: 10 }}>
            Prioritized by accuracy, recency, and difficulty.
          </p>
        )}

        <Toast kind={msg?.kind} message={msg?.text} />

        {activeLoading ? (
          <div className="muted">Loading…</div>
        ) : activeItems.length === 0 ? (
          <div className="muted">
            {tab === 'marked'
              ? 'Nothing marked yet.'
              : 'Complete more questions to build your smart review queue.'}
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {activeItems.map((q) => (
              <Link key={q.question_id} href={`/practice/${q.question_id}`} className="option">
                <div style={{ minWidth: 64 }}>
                  <div className="pill">{q.difficulty ? `D${q.difficulty}` : 'D?'}</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 650 }}>
                    {q.domain_name || q.domain_code || 'Domain'}
                    <span className="muted"> · </span>
                    <span className="muted">{q.skill_name || q.skill_code || 'Skill'}</span>
                  </div>
                  <div className="muted small" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <span>Attempts: {q.attempts_count ?? 0}</span>
                    <span>Correct: {q.correct_attempts_count ?? 0}</span>
                    {tab === 'smart' && q.accuracy != null && (
                      <span style={{ color: pctColor(q.accuracy) }}>Accuracy: {q.accuracy}%</span>
                    )}
                    {tab === 'smart' && q.days_since_attempt != null && (
                      <span>{q.days_since_attempt}d ago</span>
                    )}
                  </div>
                </div>
                {tab === 'smart' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {q.last_is_correct === false && (
                      <span className="pill" style={{ background: 'var(--danger)', color: 'white', fontSize: 10 }}>Wrong</span>
                    )}
                    {q.marked_for_review && (
                      <span className="pill" style={{ background: 'var(--amber)', color: 'white', fontSize: 10 }}>Flagged</span>
                    )}
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
