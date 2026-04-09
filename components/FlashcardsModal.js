'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Shared modal for viewing the user's own flashcards and adding new ones.
 * Used from places that display question text (practice page, results page).
 *
 * Props:
 *  - open: boolean — whether the modal is visible
 *  - onClose: () => void — called to close the modal
 *  - onMessage: ({ kind, text }) => void — optional toast callback
 */
export default function FlashcardsModal({ open, onClose, onMessage }) {
  const [tab, setTab] = useState('my'); // 'my' | 'add'
  const [sets, setSets] = useState([]);
  const [selectedSetId, setSelectedSetId] = useState('');
  const [cards, setCards] = useState([]);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const loadSets = useCallback(async () => {
    try {
      const res = await fetch('/api/flashcard-sets');
      const json = await res.json();
      if (res.ok && Array.isArray(json.sets)) {
        setSets(json.sets);
        setSelectedSetId((prev) => prev || json.sets[0]?.id || '');
      }
    } catch {}
  }, []);

  const loadCards = useCallback(async (setId) => {
    if (!setId) {
      setCards([]);
      return;
    }
    setCardsLoading(true);
    try {
      const res = await fetch(`/api/flashcards?set_id=${encodeURIComponent(setId)}`);
      const json = await res.json();
      if (res.ok && Array.isArray(json.cards)) setCards(json.cards);
      else setCards([]);
    } catch {
      setCards([]);
    } finally {
      setCardsLoading(false);
    }
  }, []);

  // Load sets when modal opens
  useEffect(() => {
    if (open) loadSets();
  }, [open, loadSets]);

  // Load cards whenever the selected set changes (while open)
  useEffect(() => {
    if (open && selectedSetId) loadCards(selectedSetId);
  }, [open, selectedSetId, loadCards]);

  // Reset transient form state when the modal closes
  useEffect(() => {
    if (!open) {
      setTab('my');
      setFront('');
      setBack('');
      setJustSaved(false);
    }
  }, [open]);

  // Escape key closes the modal
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const saveCard = useCallback(async () => {
    if (!selectedSetId || !front.trim() || !back.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/flashcards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          set_id: selectedSetId,
          front: front.trim(),
          back: back.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to save flashcard');
      setFront('');
      setBack('');
      setJustSaved(true);
      onMessage?.({ kind: 'ok', text: 'Flashcard saved!' });
      // Refresh card list and set counts so the new card is reflected immediately.
      await Promise.all([loadCards(selectedSetId), loadSets()]);
    } catch (e) {
      onMessage?.({ kind: 'danger', text: e.message });
    } finally {
      setSaving(false);
    }
  }, [selectedSetId, front, back, onMessage, loadCards, loadSets]);

  if (!open) return null;

  const tabBtnStyle = (active) => ({
    background: 'none',
    border: 'none',
    padding: '8px 14px',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: 14,
    color: active ? 'var(--accent, #2563eb)' : 'var(--muted, #6b7280)',
    borderBottom: active ? '2px solid var(--accent, #2563eb)' : '2px solid transparent',
    marginBottom: -1,
  });

  return (
    <div className="modalOverlay" onClick={onClose}>
      <div
        className="modalCard"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 560 }}
      >
        <div
          className="row"
          style={{
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: 12,
          }}
        >
          <div className="h2" style={{ margin: 0 }}>Flashcards</div>
          <button
            className="btn secondary"
            onClick={onClose}
            style={{ padding: '2px 10px', lineHeight: 1 }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div
          role="tablist"
          style={{
            display: 'flex',
            gap: 2,
            borderBottom: '1px solid var(--border, #e5e7eb)',
            marginBottom: 14,
          }}
        >
          <button
            role="tab"
            aria-selected={tab === 'my'}
            onClick={() => setTab('my')}
            style={tabBtnStyle(tab === 'my')}
          >
            My Flashcards
          </button>
          <button
            role="tab"
            aria-selected={tab === 'add'}
            onClick={() => setTab('add')}
            style={tabBtnStyle(tab === 'add')}
          >
            Add New
          </button>
        </div>

        {/* Set selector (shared between tabs) */}
        <label className="small muted" style={{ display: 'block', marginBottom: 4 }}>
          Set
        </label>
        <select
          className="input"
          value={selectedSetId}
          onChange={(e) => setSelectedSetId(e.target.value)}
          style={{ marginBottom: 14 }}
        >
          {sets.length === 0 && <option value="">No sets yet</option>}
          {sets.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.card_count})
            </option>
          ))}
        </select>

        {tab === 'my' ? (
          <div
            style={{
              maxHeight: 380,
              overflowY: 'auto',
              border: '1px solid var(--border, #e5e7eb)',
              borderRadius: 6,
              background: 'var(--surface, #fafafa)',
            }}
          >
            {cardsLoading ? (
              <div className="muted small" style={{ padding: 16, textAlign: 'center' }}>
                Loading…
              </div>
            ) : cards.length === 0 ? (
              <div className="muted small" style={{ padding: 20, textAlign: 'center' }}>
                No flashcards yet in this set.
                <div style={{ marginTop: 10 }}>
                  <button className="btn primary" onClick={() => setTab('add')}>
                    + Add your first card
                  </button>
                </div>
              </div>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {cards.map((c, i) => (
                  <li
                    key={c.id}
                    style={{
                      padding: '10px 14px',
                      borderTop: i === 0 ? 'none' : '1px solid var(--border, #e5e7eb)',
                      background: 'white',
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 600,
                        marginBottom: 4,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}
                    >
                      {c.front}
                    </div>
                    <div
                      className="muted small"
                      style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
                    >
                      {c.back}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div>
            <label className="small muted" style={{ display: 'block', marginBottom: 4 }}>
              Front
            </label>
            <textarea
              className="input"
              value={front}
              onChange={(e) => {
                setFront(e.target.value);
                if (justSaved) setJustSaved(false);
              }}
              placeholder="Term, question, or concept…"
              rows={2}
              style={{ marginBottom: 12 }}
            />

            <label className="small muted" style={{ display: 'block', marginBottom: 4 }}>
              Back
            </label>
            <textarea
              className="input"
              value={back}
              onChange={(e) => {
                setBack(e.target.value);
                if (justSaved) setJustSaved(false);
              }}
              placeholder="Definition, answer, or explanation…"
              rows={3}
              style={{ marginBottom: 16 }}
            />

            <div
              className="row"
              style={{ gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}
            >
              {justSaved && (
                <span className="small muted" style={{ marginRight: 'auto' }}>
                  Saved ✓
                </span>
              )}
              <button className="btn secondary" onClick={() => setTab('my')}>
                Done
              </button>
              <button
                className="btn primary"
                onClick={saveCard}
                disabled={
                  saving || !front.trim() || !back.trim() || !selectedSetId
                }
              >
                {saving ? 'Saving…' : 'Save Card'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
