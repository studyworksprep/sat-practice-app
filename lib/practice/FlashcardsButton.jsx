// New-tree port of components/FlashcardsModal.js, packaged with
// its own trigger button so mount sites only need to drop in one
// component. Same UX shape as legacy:
//   - "Flashcards" button toggles the modal
//   - Two tabs: Add New (default) and My Flashcards
//   - Set picker shared across tabs
//   - Add tab: front/back text areas + Save
//   - My Flashcards tab: paginated list, lazy-loaded on tab activation
//
// Differences from legacy:
//   - All data flows through Server Actions
//     (lib/practice/flashcards-actions.js) instead of fetch().
//   - The trigger button is bundled here so PracticeInteractive /
//     TestResultsInteractive don't have to manage open/onClose.
//   - Toast messages render inline in the modal footer rather than
//     bubbling up via an onMessage prop — neither new-tree mount
//     site has a global toast surface yet.
//
// Rich-text / equation input is queued as a follow-up enhancement
// (markdown + KaTeX, optionally MathLive). This commit is a
// straight feature port to preserve the live flashcards data
// path on the new tree.

'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import {
  createFlashcard,
  listFlashcardSets,
  listFlashcards,
} from './flashcards-actions';
import s from './FlashcardsButton.module.css';

const PAGE_SIZE = 25;

export function FlashcardsButton({ buttonClassName, label = 'Flashcards' }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={buttonClassName ?? s.triggerBtn}
        title="Open flashcards"
      >
        {label}
      </button>
      {open && <FlashcardsModal onClose={() => setOpen(false)} />}
    </>
  );
}

function FlashcardsModal({ onClose }) {
  const [tab, setTab] = useState('add'); // 'add' | 'my'

  // Set list — loaded once when the modal opens.
  const [sets, setSets] = useState([]);
  const [setsLoaded, setSetsLoaded] = useState(false);
  const [selectedSetId, setSelectedSetId] = useState('');

  // Card list — loaded lazily when the user visits the My
  // Flashcards tab. loadedKey is the (setId,page) currently in
  // state; refreshing on save invalidates it so the next visit
  // refetches and includes the new card.
  const [cards, setCards] = useState([]);
  const [totalCards, setTotalCards] = useState(0);
  const [page, setPage] = useState(1);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [loadedKey, setLoadedKey] = useState(null);

  // Add-form state.
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [justSaved, setJustSaved] = useState(false);

  const [error, setError] = useState(null);
  const [pending, startTransition] = useTransition();

  const reloadSets = useCallback(() => {
    setError(null);
    startTransition(async () => {
      const res = await listFlashcardSets();
      if (!res?.ok) {
        setError(res?.error ?? 'Failed to load flashcard sets');
        return;
      }
      const list = res.data?.sets ?? [];
      setSets(list);
      setSetsLoaded(true);
      setSelectedSetId((prev) => prev || list[0]?.id || '');
    });
  }, []);

  const reloadCards = useCallback((setId, pageNum) => {
    if (!setId) {
      setCards([]);
      setTotalCards(0);
      return;
    }
    setError(null);
    setCardsLoading(true);
    startTransition(async () => {
      const res = await listFlashcards({ setId, page: pageNum, pageSize: PAGE_SIZE });
      setCardsLoading(false);
      if (!res?.ok) {
        setError(res?.error ?? 'Failed to load flashcards');
        setCards([]);
        setTotalCards(0);
        setLoadedKey(null);
        return;
      }
      setCards(res.data?.cards ?? []);
      setTotalCards(res.data?.total ?? 0);
      setLoadedKey(`${setId}:${pageNum}`);
    });
  }, []);

  // Load sets once on mount (modal open).
  useEffect(() => {
    reloadSets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lazy card load when on the My tab.
  useEffect(() => {
    if (tab !== 'my' || !selectedSetId) return;
    const targetKey = `${selectedSetId}:${page}`;
    if (loadedKey !== targetKey) reloadCards(selectedSetId, page);
  }, [tab, selectedSetId, page, loadedKey, reloadCards]);

  // Reset to page 1 when the set selection changes.
  useEffect(() => { setPage(1); }, [selectedSetId]);

  // Escape closes the modal.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function handleSave() {
    if (!selectedSetId || !front.trim() || !back.trim()) return;
    setError(null);
    startTransition(async () => {
      const res = await createFlashcard({
        setId: selectedSetId,
        front,
        back,
      });
      if (!res?.ok) {
        setError(res?.error ?? 'Failed to save flashcard');
        return;
      }
      setFront('');
      setBack('');
      setJustSaved(true);
      // Bump set counts and invalidate the cached card page so a
      // subsequent visit to My Flashcards refetches.
      reloadSets();
      setLoadedKey(null);
    });
  }

  const totalPages = Math.max(1, Math.ceil(totalCards / PAGE_SIZE));
  const rangeStart = totalCards === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, totalCards);
  const canSave = !pending && front.trim().length > 0 && back.trim().length > 0 && !!selectedSetId;

  return (
    <div className={s.overlay} onClick={onClose}>
      <div
        className={s.card}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Flashcards"
      >
        <div className={s.header}>
          <div className={s.title}>Flashcards</div>
          <button
            type="button"
            className={s.closeBtn}
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div role="tablist" className={s.tabs}>
          <button
            role="tab"
            aria-selected={tab === 'add'}
            onClick={() => setTab('add')}
            className={`${s.tab} ${tab === 'add' ? s.tabActive : ''}`}
          >
            Add new
          </button>
          <button
            role="tab"
            aria-selected={tab === 'my'}
            onClick={() => setTab('my')}
            className={`${s.tab} ${tab === 'my' ? s.tabActive : ''}`}
          >
            My flashcards
          </button>
        </div>

        <label className={s.fieldLabel} htmlFor="fc-set">Set</label>
        <select
          id="fc-set"
          className={s.input}
          value={selectedSetId}
          onChange={(e) => setSelectedSetId(e.target.value)}
          disabled={!setsLoaded}
        >
          {!setsLoaded && <option value="">Loading…</option>}
          {setsLoaded && sets.length === 0 && <option value="">No sets yet</option>}
          {sets.map((set) => (
            <option key={set.id} value={set.id}>
              {set.name} ({set.card_count})
            </option>
          ))}
        </select>

        {tab === 'add' ? (
          <div className={s.form}>
            <label className={s.fieldLabel} htmlFor="fc-front">Front</label>
            <textarea
              id="fc-front"
              className={s.input}
              value={front}
              onChange={(e) => {
                setFront(e.target.value);
                if (justSaved) setJustSaved(false);
              }}
              placeholder="Term, question, or concept…"
              rows={2}
              disabled={pending}
            />

            <label className={s.fieldLabel} htmlFor="fc-back">Back</label>
            <textarea
              id="fc-back"
              className={s.input}
              value={back}
              onChange={(e) => {
                setBack(e.target.value);
                if (justSaved) setJustSaved(false);
              }}
              placeholder="Definition, answer, or explanation…"
              rows={3}
              disabled={pending}
            />

            <div className={s.actions}>
              {justSaved && <span className={s.savedNote}>Saved ✓</span>}
              <button type="button" className={s.btnSecondary} onClick={onClose}>
                Done
              </button>
              <button
                type="button"
                className={s.btnPrimary}
                onClick={handleSave}
                disabled={!canSave}
              >
                {pending ? 'Saving…' : 'Save card'}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className={s.cardList}>
              {cardsLoading ? (
                <div className={s.cardListEmpty}>Loading…</div>
              ) : cards.length === 0 ? (
                <div className={s.cardListEmpty}>
                  No flashcards yet in this set.
                  <div style={{ marginTop: 10 }}>
                    <button
                      type="button"
                      className={s.btnPrimary}
                      onClick={() => setTab('add')}
                    >
                      + Add your first card
                    </button>
                  </div>
                </div>
              ) : (
                <ul className={s.cardListUl}>
                  {cards.map((c, i) => (
                    <li
                      key={c.id}
                      className={s.cardItem}
                      style={{ borderTop: i === 0 ? 'none' : undefined }}
                    >
                      <div className={s.cardFront}>{c.front}</div>
                      <div className={s.cardBack}>{c.back}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {totalCards > PAGE_SIZE && (
              <div className={s.paginator}>
                <span className={s.paginatorRange}>
                  {rangeStart}–{rangeEnd} of {totalCards}
                </span>
                <div className={s.paginatorButtons}>
                  <button
                    type="button"
                    className={s.btnSecondary}
                    disabled={page <= 1 || cardsLoading}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Prev
                  </button>
                  <span className={s.paginatorPage}>
                    Page {page} / {totalPages}
                  </span>
                  <button
                    type="button"
                    className={s.btnSecondary}
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

        {error && <div className={s.error}>{error}</div>}
      </div>
    </div>
  );
}
