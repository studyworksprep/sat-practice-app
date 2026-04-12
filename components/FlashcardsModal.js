'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Shared modal for adding flashcards and viewing the user's own flashcard
 * collection. Used from places that display question text (practice page,
 * results page).
 *
 * Tab order is "Add New" first, "My Flashcards" second — the assumption
 * is that when a student opens this modal from a question page, they're
 * most often there to capture a new card, not to browse their library.
 *
 * The My Flashcards list is lazy-loaded: we don't hit /api/flashcards at
 * all until the user actually clicks over to that tab. This keeps the
 * modal snappy for users with hundreds of cards who just want to add one
 * more. Within the tab, the list is paginated via /api/flashcards page +
 * page_size so we never pull the entire collection at once.
 *
 * Props:
 *  - open: boolean — whether the modal is visible
 *  - onClose: () => void — called to close the modal
 *  - onMessage: ({ kind, text }) => void — optional toast callback
 */
const PAGE_SIZE = 25;

export default function FlashcardsModal({ open, onClose, onMessage }) {
  const [tab, setTab] = useState('add'); // 'add' | 'my'
  const [sets, setSets] = useState([]);
  const [selectedSetId, setSelectedSetId] = useState('');

  // Cards + pagination state for the "My Flashcards" tab.
  // `loadedKey` is the "setId:page" we currently have cards for. When it
  // doesn't match the current `selectedSetId:page`, the list is stale and
  // the effect below will refetch. Setting it to null forces a reload
  // (used after adding a card so the user sees the new one next time they
  // visit the My Flashcards tab).
  const [cards, setCards] = useState([]);
  const [totalCards, setTotalCards] = useState(0);
  const [page, setPage] = useState(1);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [loadedKey, setLoadedKey] = useState(null);

  // Add-new form state
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  // ── Data loading ────────────────────────────────────────────────
  // Sets load unconditionally on modal open. Both tabs need them — the
  // Add tab needs the set selector to know where to save, and the My
  // Flashcards tab needs them to render the selector and the card counts.
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

  const loadCards = useCallback(async (setId, pageNum) => {
    if (!setId) {
      setCards([]);
      setTotalCards(0);
      return;
    }
    setCardsLoading(true);
    try {
      const params = new URLSearchParams({
        set_id: setId,
        page: String(pageNum),
        page_size: String(PAGE_SIZE),
      });
      const res = await fetch(`/api/flashcards?${params.toString()}`);
      const json = await res.json();
      if (res.ok && Array.isArray(json.cards)) {
        setCards(json.cards);
        setTotalCards(json.total ?? json.cards.length);
        setLoadedKey(`${setId}:${pageNum}`);
      } else {
        setCards([]);
        setTotalCards(0);
        setLoadedKey(null);
      }
    } catch {
      setCards([]);
      setTotalCards(0);
      setLoadedKey(null);
    } finally {
      setCardsLoading(false);
    }
  }, []);

  // Sets load on modal open, regardless of tab.
  useEffect(() => {
    if (open) loadSets();
  }, [open, loadSets]);

  // Cards load LAZILY — only when the user is actually on the My
  // Flashcards tab and the currently loaded key doesn't match the
  // target. This effect is the only place that decides whether to
  // refetch cards. Switching to the Add tab doesn't unload them; the
  // next visit to My Flashcards uses the cached list.
  useEffect(() => {
    if (!open || tab !== 'my' || !selectedSetId) return;
    const targetKey = `${selectedSetId}:${page}`;
    if (loadedKey !== targetKey) {
      loadCards(selectedSetId, page);
    }
  }, [open, tab, selectedSetId, page, loadedKey, loadCards]);

  // When the user switches sets, bounce back to page 1. The effect above
  // will notice the fetch key changed and refetch.
  useEffect(() => {
    setPage(1);
  }, [selectedSetId]);

  // Reset transient state when the modal closes so the next open starts
  // fresh on the Add tab with empty fields.
  useEffect(() => {
    if (!open) {
      setTab('add');
      setFront('');
      setBack('');
      setJustSaved(false);
      setPage(1);
      setCards([]);
      setTotalCards(0);
      setLoadedKey(null);
    }
  }, [open]);

  // Escape key closes the modal.
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // ── Actions ─────────────────────────────────────────────────────
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
      // Refresh the set counts so the dropdown's "(N)" reflects the new
      // card immediately. Invalidate the cached My Flashcards page so
      // the next visit to that tab refetches and includes the new card.
      loadSets();
      setLoadedKey(null);
    } catch (e) {
      onMessage?.({ kind: 'danger', text: e.message });
    } finally {
      setSaving(false);
    }
  }, [selectedSetId, front, back, onMessage, loadSets]);

  if (!open) return null;

  // ── Rendering helpers ───────────────────────────────────────────
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

  const totalPages = Math.max(1, Math.ceil(totalCards / PAGE_SIZE));
  const rangeStart = totalCards === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, totalCards);

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

        {/* Tabs — "Add New" first, since the most common flow from a
            question page is capturing a new card, not browsing. */}
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
            aria-selected={tab === 'add'}
            onClick={() => setTab('add')}
            style={tabBtnStyle(tab === 'add')}
          >
            Add New
          </button>
          <button
            role="tab"
            aria-selected={tab === 'my'}
            onClick={() => setTab('my')}
            style={tabBtnStyle(tab === 'my')}
          >
            My Flashcards
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

        {tab === 'add' ? (
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
              <button className="btn secondary" onClick={onClose}>
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
        ) : (
          <>
            <div
              style={{
                maxHeight: 340,
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

            {/* Paginator — shown whenever there's more than one page. */}
            {totalCards > PAGE_SIZE && (
              <div
                className="row"
                style={{
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: 10,
                  gap: 8,
                  flexWrap: 'wrap',
                }}
              >
                <span className="small muted">
                  {rangeStart}–{rangeEnd} of {totalCards}
                </span>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <button
                    type="button"
                    className="btn secondary"
                    style={{ fontSize: 12, padding: '4px 10px' }}
                    disabled={page <= 1 || cardsLoading}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Prev
                  </button>
                  <span className="small" style={{ minWidth: 60, textAlign: 'center' }}>
                    Page {page} / {totalPages}
                  </span>
                  <button
                    type="button"
                    className="btn secondary"
                    style={{ fontSize: 12, padding: '4px 10px' }}
                    disabled={page >= totalPages || cardsLoading}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
