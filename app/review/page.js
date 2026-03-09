'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Toast from '../../components/Toast';

function pctColor(p) {
  if (p === null || p === undefined) return undefined;
  return p >= 70 ? 'var(--success)' : p >= 50 ? 'var(--amber)' : 'var(--danger)';
}

const DIFF_LABEL = { 1: 'Easy', 2: 'Medium', 3: 'Hard' };
const DIFF_COLOR = { 1: 'var(--success)', 2: 'var(--amber)', 3: 'var(--danger)' };

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function TabButton({ active, label, count, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '8px 18px',
        fontSize: 13,
        fontWeight: 600,
        background: 'none',
        border: 'none',
        borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
        color: active ? 'var(--accent)' : 'var(--muted)',
        cursor: 'pointer',
      }}
    >
      {label} ({count})
    </button>
  );
}

export default function ReviewPage() {
  const [items, setItems] = useState([]);
  const [smartItems, setSmartItems] = useState([]);
  const [errorLogItems, setErrorLogItems] = useState([]);
  const [msg, setMsg] = useState(null);
  const [loading, setLoading] = useState(false);
  const [smartLoading, setSmartLoading] = useState(false);
  const [errorLogLoading, setErrorLogLoading] = useState(false);
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

  async function loadErrorLog() {
    setErrorLogLoading(true);
    try {
      const res = await fetch('/api/error-log');
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to load error log');
      setErrorLogItems(json.items || []);
    } catch (e) {
      setMsg({ kind: 'danger', text: e.message });
    } finally {
      setErrorLogLoading(false);
    }
  }

  useEffect(() => { loadMarked(); loadSmart(); loadErrorLog(); }, []);

  return (
    <main className="container">
      <div className="card">
        <div className="h1">Review</div>

        {/* Tab switcher */}
        <div style={{ display: 'flex', gap: 0, marginTop: 8, marginBottom: 14, borderBottom: '1px solid var(--border)' }}>
          <TabButton active={tab === 'marked'} label="Marked for Review" count={items.length} onClick={() => setTab('marked')} />
          <TabButton active={tab === 'smart'} label="Smart Review" count={smartItems.length} onClick={() => setTab('smart')} />
          <TabButton active={tab === 'errorlog'} label="Error Log" count={errorLogItems.length} onClick={() => setTab('errorlog')} />
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
        {tab === 'errorlog' && (
          <p className="muted small" style={{ marginTop: 0, marginBottom: 10 }}>
            Questions where you've recorded notes about your errors.
          </p>
        )}

        <Toast kind={msg?.kind} message={msg?.text} />

        {/* Marked + Smart tabs share the same layout */}
        {(tab === 'marked' || tab === 'smart') && (() => {
          const activeItems = tab === 'marked' ? items : smartItems;
          const activeLoading = tab === 'marked' ? loading : smartLoading;

          if (activeLoading) return <div className="muted">Loading…</div>;
          if (activeItems.length === 0) {
            return (
              <div className="muted">
                {tab === 'marked'
                  ? 'Nothing marked yet.'
                  : 'Complete more questions to build your smart review queue.'}
              </div>
            );
          }

          return (
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
          );
        })()}

        {/* Error Log tab */}
        {tab === 'errorlog' && (() => {
          if (errorLogLoading) return <div className="muted">Loading…</div>;
          if (errorLogItems.length === 0) {
            return (
              <div className="muted">
                No error log entries yet. After answering a question, click "Add to Error Log" to record notes about your mistakes.
              </div>
            );
          }

          return (
            <div style={{ display: 'grid', gap: 12 }}>
              {errorLogItems.map((q) => {
                const diffLabel = DIFF_LABEL[q.difficulty] || '';
                const diffColor = DIFF_COLOR[q.difficulty] || 'var(--muted)';
                const isCorrect = q.last_is_correct === true;

                return (
                  <Link
                    key={q.question_id}
                    href={`/practice/${q.question_id}`}
                    className="errorLogItem"
                  >
                    <div className="errorLogItemHeader">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                        <span
                          className="errorLogBadge"
                          style={{ background: isCorrect ? 'var(--success)' : 'var(--danger)' }}
                        >
                          {isCorrect ? '\u2713' : '\u2717'}
                        </span>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontWeight: 650, fontSize: 14 }}>
                            {q.domain_name || 'Domain'}
                            <span className="muted"> · </span>
                            <span className="muted" style={{ fontWeight: 400 }}>{q.skill_name || 'Skill'}</span>
                          </div>
                          <div className="muted small" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                            {diffLabel && <span style={{ color: diffColor }}>{diffLabel}</span>}
                            <span>{q.attempts_count ?? 0} attempts</span>
                            {q.updated_at && <span>{formatDate(q.updated_at)}</span>}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="errorLogNotes">
                      {q.notes}
                    </div>
                  </Link>
                );
              })}
            </div>
          );
        })()}
      </div>
    </main>
  );
}
