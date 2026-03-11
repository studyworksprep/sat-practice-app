'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
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

/* ---- Rich text helpers ---- */

function renderFormattedText(text) {
  if (!text) return '';
  // Escape HTML first
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  // Bold: **text**
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Italic: *text*
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Bullet lines: lines starting with "- "
  const lines = html.split('\n');
  let inList = false;
  let result = [];
  for (const line of lines) {
    if (line.trimStart().startsWith('- ')) {
      if (!inList) { result.push('<ul>'); inList = true; }
      result.push('<li>' + line.trimStart().slice(2) + '</li>');
    } else {
      if (inList) { result.push('</ul>'); inList = false; }
      result.push(line);
    }
  }
  if (inList) result.push('</ul>');
  return result.join('\n');
}

function FormatToolbar({ textareaRef, value, onChange }) {
  function wrapSelection(before, after) {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = value.substring(start, end);
    const newVal = value.substring(0, start) + before + selected + after + value.substring(end);
    onChange(newVal);
    // Restore cursor after the wrapped text
    setTimeout(() => {
      el.focus();
      const newPos = start + before.length + selected.length + after.length;
      el.setSelectionRange(start + before.length, start + before.length + selected.length);
    }, 0);
  }

  function insertBullet() {
    const el = textareaRef.current;
    if (!el) return;
    const pos = el.selectionStart;
    // Find start of current line
    const lineStart = value.lastIndexOf('\n', pos - 1) + 1;
    const prefix = value.substring(lineStart, pos);
    if (prefix.startsWith('- ')) return; // already a bullet
    const newVal = value.substring(0, lineStart) + '- ' + value.substring(lineStart);
    onChange(newVal);
    setTimeout(() => { el.focus(); el.setSelectionRange(pos + 2, pos + 2); }, 0);
  }

  return (
    <div className="fcFormatBar">
      <button type="button" className="fcFormatBtn" title="Bold (**text**)" onClick={() => wrapSelection('**', '**')}><b>B</b></button>
      <button type="button" className="fcFormatBtn" title="Italic (*text*)" onClick={() => wrapSelection('*', '*')}><i>I</i></button>
      <button type="button" className="fcFormatBtn" title="Bullet point" onClick={insertBullet}>• List</button>
    </div>
  );
}

function FormattedTextarea({ value, onChange, placeholder, rows }) {
  const ref = useRef(null);
  return (
    <div>
      <FormatToolbar textareaRef={ref} value={value} onChange={onChange} />
      <textarea
        ref={ref}
        className="input fcTextarea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows || 3}
        style={{ borderTopLeftRadius: 0, borderTopRightRadius: 0 }}
      />
    </div>
  );
}

/* ---- Flashcard Review Modal ---- */

function pickWeightedRandom(cards, excludeId) {
  let pool = cards.length > 1 && excludeId
    ? cards.filter(c => c.id !== excludeId)
    : cards;
  if (!pool.length) return null;
  // weight = 6 - mastery (mastery 0 → weight 6, mastery 5 → weight 1)
  const totalWeight = pool.reduce((sum, c) => sum + (6 - (c.mastery || 0)), 0);
  let r = Math.random() * totalWeight;
  for (const card of pool) {
    r -= (6 - (card.mastery || 0));
    if (r <= 0) return card;
  }
  return pool[pool.length - 1];
}

function FlashcardReviewModal({ setId, setName, onClose }) {
  const [allCards, setAllCards] = useState([]);      // full card pool
  const [history, setHistory] = useState([]);        // cards the user has visited (stack)
  const [historyIdx, setHistoryIdx] = useState(-1);  // current position in history
  const [flipped, setFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);
  const [reviewed, setReviewed] = useState(0);
  const [savingMastery, setSavingMastery] = useState(false);
  const [selectedMastery, setSelectedMastery] = useState(null);

  const loadCards = useCallback(async () => {
    try {
      const res = await fetch(`/api/flashcards?set_id=${setId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to load cards');
      const loaded = json.cards || [];
      setAllCards(loaded);
      // Pick first card weighted-random
      if (loaded.length) {
        const first = pickWeightedRandom(loaded, null);
        setHistory([first]);
        setHistoryIdx(0);
      }
      setFlipped(false);
      setSelectedMastery(null);
    } catch (e) {
      setMsg({ kind: 'danger', text: e.message });
    } finally {
      setLoading(false);
    }
  }, [setId]);

  useEffect(() => { loadCards(); }, [loadCards]);

  // Close on Escape
  useEffect(() => {
    function handleKey(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const card = history[historyIdx] || null;
  const currentMastery = card ? (selectedMastery !== null ? selectedMastery : card.mastery) : null;

  function goBack() {
    if (historyIdx <= 0) return;
    setHistoryIdx(historyIdx - 1);
    setFlipped(false);
    // Restore the mastery for the card we're going back to
    const prevCard = history[historyIdx - 1];
    const fresh = allCards.find(c => c.id === prevCard.id);
    setSelectedMastery(fresh && fresh.mastery !== prevCard.mastery ? null : null);
    setSelectedMastery(null);
  }

  function goNext() {
    // If we're not at the end of history, move forward
    if (historyIdx < history.length - 1) {
      setHistoryIdx(historyIdx + 1);
      setFlipped(false);
      setSelectedMastery(null);
      return;
    }
    // Otherwise pick a new weighted-random card
    const next = pickWeightedRandom(allCards, card?.id);
    if (!next) return;
    // Use fresh data from allCards
    const freshNext = allCards.find(c => c.id === next.id) || next;
    setHistory(prev => [...prev.slice(0, historyIdx + 1), freshNext]);
    setHistoryIdx(historyIdx + 1);
    setFlipped(false);
    setSelectedMastery(null);
  }

  async function rateMastery(level) {
    if (!card || savingMastery) return;
    setSelectedMastery(level);
    setSavingMastery(true);
    try {
      const res = await fetch('/api/flashcards', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ card_id: card.id, mastery: level }),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json?.error || 'Failed to save rating');
      }
      // Update mastery in allCards pool and in history
      setAllCards(prev => prev.map(c => c.id === card.id ? { ...c, mastery: level } : c));
      setHistory(prev => prev.map(c => c.id === card.id ? { ...c, mastery: level } : c));
      setReviewed(r => r + 1);
    } catch (e) {
      setMsg({ kind: 'danger', text: e.message });
      setSelectedMastery(null);
    } finally {
      setSavingMastery(false);
    }
  }

  return (
    <div className="fcModalOverlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="fcModal">
        <button className="fcModalClose" onClick={onClose} title="Close">&times;</button>

        <div style={{ marginBottom: 20 }}>
          <div className="h1" style={{ marginBottom: 2, fontSize: 22 }}>{setName || 'Flashcards'}</div>
          <div className="muted small">{reviewed} reviewed this session</div>
        </div>

        {msg && <Toast kind={msg.kind} message={msg.text} />}

        {loading ? (
          <div className="muted">Loading…</div>
        ) : !allCards.length ? (
          <div className="muted">No cards in this set yet. Add some cards first!</div>
        ) : (
          <div className="flashcardContainer">
            <div
              className={`flashcard${flipped ? ' flipped' : ''}`}
              onClick={() => setFlipped(f => !f)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setFlipped(f => !f); } }}
            >
              <div className="flashcardInner">
                <div className="flashcardFace flashcardFront">
                  <div className="flashcardLabel">FRONT</div>
                  <div className="flashcardText" dangerouslySetInnerHTML={{ __html: renderFormattedText(card.front) }} />
                  <div className="flashcardHint muted small">Click to flip</div>
                </div>
                <div className="flashcardFace flashcardBack">
                  <div className="flashcardLabel">BACK</div>
                  <div className="flashcardText" dangerouslySetInnerHTML={{ __html: renderFormattedText(card.back) }} />
                </div>
              </div>
            </div>

            {/* Navigation arrows */}
            <div className="fcNavRow">
              <button
                className="fcNavBtn"
                onClick={goBack}
                disabled={historyIdx <= 0}
                title="Previous card"
              >
                &#8592;
              </button>
              <span className="fcNavCounter">{reviewed} reviewed</span>
              <button
                className="fcNavBtn"
                onClick={goNext}
                title="Next card"
              >
                &#8594;
              </button>
            </div>

            {/* Mastery rating - always visible */}
            <div className="flashcardMastery">
              <div className="small muted" style={{ marginBottom: 8 }}>How well do you know this?</div>
              <div className="flashcardMasteryButtons">
                {[0, 1, 2, 3, 4, 5].map((level) => (
                  <button
                    key={level}
                    className={`flashcardMasteryBtn mastery${level}${currentMastery === level ? ' active' : ''}`}
                    onClick={() => rateMastery(level)}
                    disabled={savingMastery}
                  >
                    {level}
                  </button>
                ))}
              </div>
              <div className="flashcardMasteryLabels small muted">
                <span>No clue</span>
                <span>Perfect</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---- Main Review Page ---- */

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
  const [expandedParents, setExpandedParents] = useState({}); // { parentId: true/false }

  // Review modal state
  const [reviewModal, setReviewModal] = useState(null); // { setId, setName } or null

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

  // Count cards only from sets without a parent (to avoid double-counting sub-set cards)
  const parentIds = new Set(flashSets.filter(s => !s.parent_set_id).map(s => s.id));
  const totalCards = flashSets.reduce((sum, s) => {
    if (!s.parent_set_id) {
      // For parent sets with children, use total_card_count if available
      const children = flashSets.filter(c => c.parent_set_id === s.id);
      if (children.length > 0) return sum + (s.total_card_count || 0);
      return sum + (s.card_count || 0);
    }
    return sum;
  }, 0);

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

          // Separate parent sets (no parent_set_id) from child sets
          const parentSets = flashSets.filter(s => !s.parent_set_id);
          const childMap = {}; // parentId → [children]
          for (const s of flashSets) {
            if (s.parent_set_id) {
              if (!childMap[s.parent_set_id]) childMap[s.parent_set_id] = [];
              childMap[s.parent_set_id].push(s);
            }
          }

          function toggleParent(parentId) {
            setExpandedParents(prev => ({ ...prev, [parentId]: !prev[parentId] }));
          }

          function renderMasteryBar(avgMastery, small) {
            if (avgMastery === null || avgMastery === undefined) return null;
            const color = avgMastery >= 70 ? 'var(--success)' : avgMastery >= 40 ? 'var(--amber)' : 'var(--danger)';
            return (
              <div className={`fcMasteryBar${small ? ' fcMasteryBarSmall' : ''}`}>
                <div className="fcMasteryTrack">
                  <div className="fcMasteryFill" style={{ width: `${avgMastery}%`, background: color }} />
                </div>
                <span className="fcMasteryPct" style={{ color }}>{avgMastery}%</span>
              </div>
            );
          }

          function renderSetRow(s, isChild) {
            const hasChildren = childMap[s.id] && childMap[s.id].length > 0;
            const isExpanded = expandedParents[s.id];
            const displayCount = hasChildren ? (s.total_card_count || 0) : s.card_count;
            const displayMastery = hasChildren ? s.total_avg_mastery : s.avg_mastery;

            return (
              <div key={s.id} className={`flashcardSetRow${isChild ? ' fcSubsetRow' : ''}`}>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10 }}>
                  {hasChildren && (
                    <button
                      className={`fcChevron${isExpanded ? ' fcChevronOpen' : ''}`}
                      onClick={() => toggleParent(s.id)}
                      aria-label={isExpanded ? 'Collapse' : 'Expand'}
                    >
                      &#9654;
                    </button>
                  )}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 650, fontSize: isChild ? 14 : 15 }}>{s.name}</div>
                    <div className="muted small">
                      {displayCount} card{displayCount !== 1 ? 's' : ''}
                    </div>
                    {renderMasteryBar(displayMastery, isChild)}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {!hasChildren && (
                    <>
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
                      <button
                        className="btn primary"
                        style={{ fontSize: 12, padding: '4px 12px', opacity: s.card_count === 0 ? 0.5 : 1 }}
                        disabled={s.card_count === 0}
                        onClick={() => setReviewModal({ setId: s.id, setName: s.name })}
                      >
                        Review
                      </button>
                    </>
                  )}
                  {hasChildren && (
                    <button
                      className="btn secondary"
                      style={{ fontSize: 12, padding: '4px 12px' }}
                      onClick={() => toggleParent(s.id)}
                    >
                      {isExpanded ? 'Collapse' : 'Expand'}
                    </button>
                  )}
                </div>

                {showAddCard === s.id && (
                  <div style={{ gridColumn: '1 / -1', marginTop: 8, display: 'grid', gap: 8, width: '100%' }}>
                    <FormattedTextarea
                      value={addCardFront}
                      onChange={setAddCardFront}
                      placeholder="Front (term or question) — use **bold**, *italic*, or - for bullets"
                      rows={3}
                    />
                    <FormattedTextarea
                      value={addCardBack}
                      onChange={setAddCardBack}
                      placeholder="Back (definition or answer)"
                      rows={4}
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
            );
          }

          return (
            <div style={{ display: 'grid', gap: 12 }}>
              {parentSets.map((s) => {
                const children = childMap[s.id] || [];
                const isExpanded = expandedParents[s.id];
                return (
                  <div key={s.id}>
                    {renderSetRow(s, false)}
                    {isExpanded && children.length > 0 && (
                      <div className="fcSubsetList">
                        {children.map(child => renderSetRow(child, true))}
                      </div>
                    )}
                  </div>
                );
              })}

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

      {/* Flashcard Review Modal */}
      {reviewModal && (
        <FlashcardReviewModal
          setId={reviewModal.setId}
          setName={reviewModal.setName}
          onClose={() => { setReviewModal(null); loadFlashSets(); }}
        />
      )}
    </main>
  );
}
