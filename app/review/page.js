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

  // Flashcard state
  const [flashSets, setFlashSets] = useState([]);
  const [flashLoading, setFlashLoading] = useState(false);
  const [showNewSet, setShowNewSet] = useState(false);
  const [newSetName, setNewSetName] = useState('');
  const [showAddCard, setShowAddCard] = useState(null); // set id or null
  const [addCardFront, setAddCardFront] = useState('');
  const [addCardBack, setAddCardBack] = useState('');
  const [addCardSaving, setAddCardSaving] = useState(false);

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

  async function loadFlashSets() {
    setFlashLoading(true);
    try {
      const res = await fetch('/api/flashcard-sets');
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to load flashcard sets');
      setFlashSets(json.sets || []);
    } catch (e) {
      setMsg({ kind: 'danger', text: e.message });
    } finally {
      setFlashLoading(false);
    }
  }

  async function createSet() {
    if (!newSetName.trim()) return;
    try {
      const res = await fetch('/api/flashcard-sets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newSetName.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to create set');
      setNewSetName('');
      setShowNewSet(false);
      loadFlashSets();
    } catch (e) {
      setMsg({ kind: 'danger', text: e.message });
    }
  }

  async function addCard() {
    if (!showAddCard || !addCardFront.trim() || !addCardBack.trim()) return;
    setAddCardSaving(true);
    try {
      const res = await fetch('/api/flashcards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ set_id: showAddCard, front: addCardFront.trim(), back: addCardBack.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to add card');
      setAddCardFront('');
      setAddCardBack('');
      setMsg({ kind: 'ok', text: 'Flashcard added!' });
      loadFlashSets();
    } catch (e) {
      setMsg({ kind: 'danger', text: e.message });
    } finally {
      setAddCardSaving(false);
    }
  }

  useEffect(() => { loadMarked(); loadSmart(); loadErrorLog(); loadFlashSets(); }, []);

  const totalCards = flashSets.reduce((sum, s) => sum + (s.card_count || 0), 0);

  return (
    <main className="container">
      <div className="card">
        <div className="h1">Review</div>

        {/* Tab switcher */}
        <div style={{ display: 'flex', gap: 0, marginTop: 8, marginBottom: 14, borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
          <TabButton active={tab === 'marked'} label="Marked for Review" count={items.length} onClick={() => setTab('marked')} />
          <TabButton active={tab === 'smart'} label="Smart Review" count={smartItems.length} onClick={() => setTab('smart')} />
          <TabButton active={tab === 'errorlog'} label="Error Log" count={errorLogItems.length} onClick={() => setTab('errorlog')} />
          <TabButton active={tab === 'flashcards'} label="Flashcards" count={totalCards} onClick={() => setTab('flashcards')} />
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
        {tab === 'flashcards' && (
          <p className="muted small" style={{ marginTop: 0, marginBottom: 10 }}>
            Your flashcard sets. Start a review session or add new cards.
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

        {/* Flashcards tab */}
        {tab === 'flashcards' && (() => {
          if (flashLoading) return <div className="muted">Loading…</div>;

          return (
            <div style={{ display: 'grid', gap: 12 }}>
              {flashSets.map((s) => (
                <div key={s.id} className="flashcardSetRow">
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 650, fontSize: 15 }}>{s.name}</div>
                    <div className="muted small">{s.card_count} card{s.card_count !== 1 ? 's' : ''}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button
                      className="btn secondary"
                      style={{ fontSize: 12, padding: '4px 12px' }}
                      onClick={() => {
                        setShowAddCard(showAddCard === s.id ? null : s.id);
                        setAddCardFront('');
                        setAddCardBack('');
                      }}
                    >
                      + Add Card
                    </button>
                    <Link
                      href={`/flashcards?set_id=${s.id}`}
                      className="btn primary"
                      style={{ fontSize: 12, padding: '4px 12px', textDecoration: 'none', opacity: s.card_count === 0 ? 0.5 : 1, pointerEvents: s.card_count === 0 ? 'none' : 'auto' }}
                    >
                      Review
                    </Link>
                  </div>

                  {showAddCard === s.id && (
                    <div style={{ gridColumn: '1 / -1', marginTop: 8, display: 'grid', gap: 8 }}>
                      <input
                        className="input"
                        value={addCardFront}
                        onChange={(e) => setAddCardFront(e.target.value)}
                        placeholder="Front (term or question)"
                      />
                      <textarea
                        className="input"
                        value={addCardBack}
                        onChange={(e) => setAddCardBack(e.target.value)}
                        placeholder="Back (definition or answer)"
                        rows={2}
                      />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn primary" style={{ fontSize: 12, padding: '4px 12px' }} onClick={addCard} disabled={addCardSaving || !addCardFront.trim() || !addCardBack.trim()}>
                          {addCardSaving ? 'Saving…' : 'Save Card'}
                        </button>
                        <button className="btn secondary" style={{ fontSize: 12, padding: '4px 12px' }} onClick={() => setShowAddCard(null)}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* New set creation */}
              {showNewSet ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    className="input"
                    value={newSetName}
                    onChange={(e) => setNewSetName(e.target.value)}
                    placeholder="New set name"
                    style={{ flex: 1 }}
                    onKeyDown={(e) => e.key === 'Enter' && createSet()}
                  />
                  <button className="btn primary" style={{ fontSize: 12, padding: '4px 12px' }} onClick={createSet} disabled={!newSetName.trim()}>
                    Create
                  </button>
                  <button className="btn secondary" style={{ fontSize: 12, padding: '4px 12px' }} onClick={() => { setShowNewSet(false); setNewSetName(''); }}>
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  className="btn secondary"
                  style={{ justifySelf: 'start', fontSize: 13 }}
                  onClick={() => setShowNewSet(true)}
                >
                  + New Set
                </button>
              )}
            </div>
          );
        })()}
      </div>
    </main>
  );
}
